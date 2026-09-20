import {execFile as execFileCallback, spawn} from 'node:child_process';
import {once} from 'node:events';
import {chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {ModuleKind, ScriptTarget, transpileModule} from 'typescript';

import {
    assertNoShellRuntimeErrors,
    buildGSettingsCommands,
    buildHeadlessShellArguments,
    createInteractionEnvironment,
    createIsolatedEnvironment,
    extensionInstallPath,
    signalProcessGroup,
    watchForInterruption,
} from './runtime-smoke.ts';

// The recording is the smoke harness with a different automation script: the
// same isolated GNOME, the same two virtual monitors, the same installed
// extension. What a reader sees in the README is what the tests exercise.
const COMPLETE_PREFIX = 'demo capture complete:';
// Software rendering encodes a full-stage PNG in roughly a third of a
// second, and that rate is what the recording has to live with. Smaller
// virtual monitors buy frames back; the extension does not care about size.
const DEMO_MONITOR_SIZE = '960x540';
const GIF_FRAMES_PER_SECOND = 12;
const GIF_WIDTH = 960;
const SESSION_TIMEOUT_MILLISECONDS = 180_000;
const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(import.meta.dirname, '..');
const assetsDirectory = resolve(repositoryRoot, 'assets');

interface CapturedFrame {
    name: string;
    time: number;
}

interface FrameManifest {
    frames: CapturedFrame[];
}

function isFrameManifest(value: unknown): value is FrameManifest {
    if (typeof value !== 'object' || value === null || !('frames' in value)) {
        return false;
    }
    const {frames} = value;

    return (
        Array.isArray(frames) &&
        frames.every(
            frame =>
                typeof frame === 'object' &&
                frame !== null &&
                typeof (frame as CapturedFrame).name === 'string' &&
                typeof (frame as CapturedFrame).time === 'number'
        )
    );
}

// The shell captures as fast as a full-stage PNG encode allows, so the interval
// between frames is uneven. Replaying them at a constant rate would speed the
// slow stretches up and slow the fast ones down; the concat demuxer replays
// each frame for exactly as long as it was on screen.
export function buildConcatList(frames: readonly CapturedFrame[]): string {
    const lines: string[] = [];

    for (const [index, frame] of frames.entries()) {
        const next = frames[index + 1];

        lines.push(`file '${frame.name}'`);
        if (next !== undefined) {
            lines.push(`duration ${((next.time - frame.time) / 1_000_000).toFixed(4)}`);
        }
    }
    const last = frames.at(-1);

    if (last !== undefined) {
        lines.push(`file '${last.name}'`);
    }
    return `${lines.join('\n')}\n`;
}

async function run(): Promise<void> {
    if (process.argv.includes('--session')) {
        await runCaptureSession();
        return;
    }

    await runParent();
}

async function runParent(): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'giws-demo-'));
    const frames = join(root, 'frames');

    try {
        const runtime = await prepareRuntime(root, frames);
        const environment = createInteractionEnvironment(
            createIsolatedEnvironment(root, process.env)
        );

        environment.GIWS_AUTOMATION_SCRIPT = runtime.automationScript;
        environment.GIWS_DEMO_FRAMES = frames;
        environment.GIWS_DEMO_WINDOW = runtime.windowScript;
        process.stdout.write(`${await runIsolatedProcess(environment)}\n`);
        await assemble(frames);
    } finally {
        // The isolated session leaves an xdg-document-portal FUSE mount inside
        // its runtime directory. Removing the tree fails while it is there, and
        // a throw from here would replace whatever actually went wrong.
        await rm(root, {force: true, recursive: true}).catch(() => undefined);
    }
}

interface Runtime {
    automationScript: string;
    windowScript: string;
}

async function prepareRuntime(root: string, frames: string): Promise<Runtime> {
    const environment = createIsolatedEnvironment(root, process.env);
    const automationScript = join(root, 'demo-automation.js');
    const automationSource = await readFile(
        resolve(repositoryRoot, 'scripts', 'demo-automation.ts'),
        'utf8'
    );

    await Promise.all([
        mkdir(environment.HOME, {recursive: true}),
        mkdir(environment.XDG_CACHE_HOME, {recursive: true}),
        mkdir(environment.XDG_CONFIG_HOME, {recursive: true}),
        mkdir(environment.XDG_DATA_HOME, {recursive: true}),
        mkdir(environment.XDG_RUNTIME_DIR, {recursive: true}),
        mkdir(environment.XDG_STATE_HOME, {recursive: true}),
        mkdir(frames, {recursive: true}),
    ]);
    await chmod(environment.XDG_RUNTIME_DIR, 0o700);
    await writeFile(environment.DCONF_PROFILE, 'user-db:user\n', 'utf8');
    await writeFile(
        automationScript,
        transpileModule(automationSource, {
            compilerOptions: {
                module: ModuleKind.ESNext,
                target: ScriptTarget.ES2023,
            },
        }).outputText,
        'utf8'
    );
    const windowScript = join(root, 'demo-window.js');

    await cp(resolve(repositoryRoot, 'scripts', 'demo-window.js'), windowScript);
    await cp(resolve(repositoryRoot, 'dist'), extensionInstallPath(root), {recursive: true});
    return {automationScript, windowScript};
}

async function runIsolatedProcess(environment: NodeJS.ProcessEnv): Promise<string> {
    const interruption = watchForInterruption();
    const child = spawn(
        'dbus-run-session',
        ['--', process.execPath, fileURLToPath(import.meta.url), '--session'],
        {cwd: repositoryRoot, detached: true, env: environment, stdio: ['ignore', 'pipe', 'pipe']}
    );
    const processId = child.pid;

    if (processId === undefined) {
        interruption.dispose();
        throw new Error('dbus-run-session did not start');
    }

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
        stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
        stderr += String(chunk);
    });

    // `close` rather than `exit`: the child's last stderr chunk is usually the
    // diagnosis, and `exit` can fire before the pipes are drained.
    const exit = once(child, 'close') as Promise<[number | null, NodeJS.Signals | null]>;
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>(resolveTimeout => {
        timeoutId = setTimeout(() => {
            resolveTimeout('timeout');
        }, SESSION_TIMEOUT_MILLISECONDS);
    });

    try {
        const outcome = await Promise.race([exit.then(() => 'exit' as const), timeout]);

        if (outcome === 'timeout') {
            throw new Error(`isolated GNOME session timed out\n${stderr}`);
        }
        const [code, signal] = await exit;

        if (code !== 0) {
            throw new Error(
                `isolated GNOME session exited with ${String(code ?? signal)}\n${stderr}`
            );
        }
        return extractCompletion(stdout);
    } finally {
        clearTimeout(timeoutId);
        signalProcessGroup(processId, 'SIGKILL');
        interruption.dispose();
    }
}

function extractCompletion(output: string): string {
    const line = output
        .split('\n')
        .map(candidate => candidate.trim())
        .find(candidate => candidate.startsWith(COMPLETE_PREFIX));

    if (line === undefined) {
        throw new Error('the isolated session exited without capturing frames');
    }
    return line;
}

async function runCaptureSession(): Promise<void> {
    for (const [schema, key, value] of buildGSettingsCommands()) {
        await execFile('gsettings', ['set', schema, key, value], {encoding: 'utf8'});
    }

    const automationScript = process.env.GIWS_AUTOMATION_SCRIPT;

    if (automationScript === undefined) {
        throw new Error('demo automation script is not configured');
    }
    const shell = spawn(
        'gnome-shell',
        buildHeadlessShellArguments(automationScript, DEMO_MONITOR_SIZE),
        {
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );
    let shellLog = '';

    shell.stdout.setEncoding('utf8');
    shell.stderr.setEncoding('utf8');
    shell.stdout.on('data', chunk => {
        shellLog += String(chunk);
    });
    shell.stderr.on('data', chunk => {
        shellLog += String(chunk);
    });

    const [code, signal] = (await once(shell, 'close')) as [number | null, NodeJS.Signals | null];

    if (code !== 0) {
        throw new Error(`demo GNOME session exited with ${String(code ?? signal)}\n${shellLog}`);
    }
    assertNoShellRuntimeErrors(shellLog);
    process.stdout.write(shellLog);
}

function reportCaptureRate(frames: readonly CapturedFrame[]): void {
    const first = frames.at(0);
    const last = frames.at(-1);

    if (first === undefined || last === undefined || frames.length < 2) {
        return;
    }
    const seconds = (last.time - first.time) / 1_000_000;

    process.stdout.write(
        `captured ${String(frames.length)} frames over ${seconds.toFixed(1)}s ` +
            `(${(frames.length / seconds).toFixed(1)} per second)\n`
    );
}

async function assemble(frames: string): Promise<void> {
    const manifest: unknown = JSON.parse(await readFile(join(frames, 'frames.json'), 'utf8'));

    if (!isFrameManifest(manifest) || manifest.frames.length === 0) {
        throw new Error('the captured frame manifest is empty or malformed');
    }
    const list = join(frames, 'frames.txt');

    await mkdir(assetsDirectory, {recursive: true});
    await writeFile(list, buildConcatList(manifest.frames), 'utf8');

    reportCaptureRate(manifest.frames);

    const gif = join(assetsDirectory, 'demo.gif');
    const still = join(assetsDirectory, 'workspace-behaviour.png');
    const filter = [
        `fps=${String(GIF_FRAMES_PER_SECOND)},scale=${String(GIF_WIDTH)}:-1:flags=lanczos,split[a][b]`,
        '[a]palettegen=stats_mode=diff[palette]',
        '[b][palette]paletteuse=dither=bayer:bayer_scale=3',
    ].join(';');

    await execFile('ffmpeg', [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        list,
        '-filter_complex',
        filter,
        '-loop',
        '0',
        gif,
    ]);

    const lastFrame = manifest.frames.at(-1);

    if (lastFrame !== undefined) {
        await execFile('ffmpeg', [
            '-y',
            '-i',
            join(frames, lastFrame.name),
            '-vf',
            `scale=${String(GIF_WIDTH * 2)}:-1:flags=lanczos`,
            still,
        ]);
    }
    process.stdout.write(`demo written: ${gif}\ndemo still written: ${still}\n`);
}

const entryPoint = process.argv[1];

if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
    await run();
}
