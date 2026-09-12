import {execFile as execFileCallback, spawn} from 'node:child_process';
import {once} from 'node:events';
import {chmod, cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';

const ACTIVE_SESSION_VARIABLES = new Set([
    'DBUS_SESSION_BUS_ADDRESS',
    'DISPLAY',
    'WAYLAND_DISPLAY',
    'XDG_SESSION_ID',
]);
const EXTENSION_UUID = 'giws@armontex';
const SUCCESS_PREFIX = 'runtime smoke passed:';
const execFile = promisify(execFileCallback);
const repositoryRoot = resolve(import.meta.dirname, '..');

export type GSettingsCommand = readonly [schema: string, key: string, value: string];
export interface IsolatedEnvironment extends NodeJS.ProcessEnv {
    DCONF_PROFILE: string;
    HOME: string;
    XDG_CACHE_HOME: string;
    XDG_CONFIG_HOME: string;
    XDG_DATA_HOME: string;
    XDG_RUNTIME_DIR: string;
    XDG_STATE_HOME: string;
}

export function buildGSettingsCommands(): GSettingsCommand[] {
    return [
        ['org.gnome.mutter', 'dynamic-workspaces', 'false'],
        ['org.gnome.mutter', 'workspaces-only-on-primary', 'false'],
        ['org.gnome.desktop.wm.preferences', 'num-workspaces', '4'],
        ['org.gnome.shell', 'disable-user-extensions', 'false'],
        ['org.gnome.shell', 'enabled-extensions', `[\'${EXTENSION_UUID}\']`],
    ];
}

export function buildHeadlessShellArguments(): string[] {
    return [
        '--headless',
        '--no-x11',
        '--mode=user',
        '--wayland-display=giws-smoke',
        '--virtual-monitor=1280x720',
        '--virtual-monitor=1280x720',
    ];
}

export function createIsolatedEnvironment(
    root: string,
    inherited: NodeJS.ProcessEnv
): IsolatedEnvironment {
    const environment = Object.fromEntries(
        Object.entries(inherited).filter(([name]) => !ACTIVE_SESSION_VARIABLES.has(name))
    );

    return {
        ...environment,
        DCONF_PROFILE: join(root, 'dconf-profile'),
        HOME: join(root, 'home'),
        NO_AT_BRIDGE: '1',
        XDG_CACHE_HOME: join(root, 'cache'),
        XDG_CONFIG_HOME: join(root, 'config'),
        XDG_DATA_HOME: join(root, 'data'),
        XDG_RUNTIME_DIR: join(root, 'runtime'),
        XDG_STATE_HOME: join(root, 'state'),
    };
}

export function extensionInstallPath(root: string): string {
    return join(root, 'data', 'gnome-shell', 'extensions', EXTENSION_UUID);
}

export function parseExtensionState(output: string): string | null {
    const state = /'state':\s*<(\d+)(?:\.0)?>/u.exec(output)?.[1];

    if (state === '1') {
        return 'ACTIVE';
    }
    if (state === '2') {
        return 'INACTIVE';
    }
    return state === undefined ? null : `STATE_${state}`;
}

interface WaitOptions {
    attempts: number;
    delay(): Promise<void>;
}

export async function waitForExtensionState(
    expected: string,
    inspect: () => Promise<string | null>,
    options: WaitOptions
): Promise<void> {
    let lastState: string | null = null;

    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
        lastState = await inspect();
        if (lastState === expected) {
            return;
        }
        await options.delay();
    }

    throw new Error(`extension did not reach ${expected}; last state: ${lastState ?? 'unknown'}`);
}

export function assertVirtualMonitors(displayState: string): void {
    if (!displayState.includes('Meta-0') || !displayState.includes('Meta-1')) {
        throw new Error('headless GNOME did not expose both virtual monitors');
    }
}

export function extractSmokeResult(output: string): string {
    const result = output
        .split('\n')
        .map(line => line.trim())
        .find(line => line.startsWith(SUCCESS_PREFIX));

    if (result === undefined) {
        throw new Error('isolated session exited without a success result');
    }
    return result;
}

type SignalSender = (processId: number, signal: NodeJS.Signals) => boolean;
type InterruptHandler = () => void;
type SubscribeToSignal = (signal: NodeJS.Signals, handler: InterruptHandler) => void;
type UnsubscribeFromSignal = (signal: NodeJS.Signals, handler: InterruptHandler) => void;
const INTERRUPT_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

export function signalProcessGroup(
    leaderProcessId: number,
    signal: NodeJS.Signals,
    send: SignalSender = (processId, sentSignal) => process.kill(processId, sentSignal)
): boolean {
    try {
        return send(-leaderProcessId, signal);
    } catch (error) {
        if (!isMissingProcessError(error)) {
            throw error;
        }
        return false;
    }
}

export function watchForInterruption(
    subscribe: SubscribeToSignal = (signal, handler) => process.once(signal, handler),
    unsubscribe: UnsubscribeFromSignal = (signal, handler) => process.off(signal, handler)
): {signal: Promise<NodeJS.Signals>; dispose(): void} {
    let resolveSignal: (signal: NodeJS.Signals) => void = () => undefined;
    const signal = new Promise<NodeJS.Signals>(resolvePromise => {
        resolveSignal = resolvePromise;
    });
    const handlers = new Map<NodeJS.Signals, InterruptHandler>();

    for (const interruptSignal of INTERRUPT_SIGNALS) {
        const handler = (): void => {
            resolveSignal(interruptSignal);
        };
        handlers.set(interruptSignal, handler);
        subscribe(interruptSignal, handler);
    }

    return {
        signal,
        dispose(): void {
            for (const [interruptSignal, handler] of handlers) {
                unsubscribe(interruptSignal, handler);
            }
        },
    };
}

async function run(): Promise<void> {
    if (process.argv.includes('--session')) {
        await runIsolatedSession();
        return;
    }

    await runParent();
}

async function runParent(): Promise<void> {
    const root = await mkdtemp(join(tmpdir(), 'giws-smoke-'));

    try {
        await prepareRuntime(root);
        const environment = createIsolatedEnvironment(root, process.env);
        const stdout = await runIsolatedProcess(environment);

        process.stdout.write(`${extractSmokeResult(stdout)}\n`);
    } finally {
        await rm(root, {force: true, recursive: true});
    }
}

async function prepareRuntime(root: string): Promise<void> {
    const environment = createIsolatedEnvironment(root, process.env);

    await Promise.all([
        mkdir(environment.HOME, {recursive: true}),
        mkdir(environment.XDG_CACHE_HOME, {recursive: true}),
        mkdir(environment.XDG_CONFIG_HOME, {recursive: true}),
        mkdir(environment.XDG_DATA_HOME, {recursive: true}),
        mkdir(environment.XDG_RUNTIME_DIR, {recursive: true}),
        mkdir(environment.XDG_STATE_HOME, {recursive: true}),
    ]);
    await chmod(environment.XDG_RUNTIME_DIR, 0o700);
    await writeFile(environment.DCONF_PROFILE, 'user-db:user\n', 'utf8');
    await cp(resolve(repositoryRoot, 'dist'), extensionInstallPath(root), {recursive: true});
}

async function runIsolatedProcess(environment: IsolatedEnvironment): Promise<string> {
    const interruption = watchForInterruption();
    let child: ReturnType<typeof spawn>;

    try {
        child = spawn(
            'dbus-run-session',
            ['--', process.execPath, fileURLToPath(import.meta.url), '--session'],
            {
                cwd: repositoryRoot,
                detached: true,
                env: environment,
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        );
    } catch (error) {
        interruption.dispose();
        throw error;
    }
    const processId = child.pid;

    if (processId === undefined) {
        interruption.dispose();
        throw new Error('dbus-run-session did not start');
    }
    const childStdout = child.stdout;
    const childStderr = child.stderr;

    if (childStdout === null || childStderr === null) {
        signalProcessGroup(processId, 'SIGKILL');
        interruption.dispose();
        throw new Error('dbus-run-session pipes are unavailable');
    }

    let stdout = '';
    let stderr = '';
    childStdout.setEncoding('utf8');
    childStderr.setEncoding('utf8');
    childStdout.on('data', chunk => {
        stdout += String(chunk);
    });
    childStderr.on('data', chunk => {
        stderr += String(chunk);
    });

    const exit = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<{kind: 'timeout'}>(resolveTimeout => {
        timeoutId = setTimeout(() => {
            resolveTimeout({kind: 'timeout'});
        }, 30_000);
    });
    try {
        const outcome = await Promise.race([
            exit.then(([code, signal]) => ({code, kind: 'exit' as const, signal})),
            interruption.signal.then(signal => ({kind: 'interrupted' as const, signal})),
            timeout,
        ]);

        if (outcome.kind === 'timeout') {
            throw new Error(`isolated GNOME session timed out\n${stderr}`);
        }
        if (outcome.kind === 'interrupted') {
            throw new Error(`isolated GNOME session interrupted by ${outcome.signal}`);
        }
        if (outcome.code !== 0) {
            throw new Error(
                `isolated GNOME session exited with ${String(outcome.code ?? outcome.signal)}\n${stderr}`
            );
        }
        return stdout;
    } finally {
        clearTimeout(timeoutId);
        try {
            await terminateProcessGroup(processId, exit);
        } finally {
            interruption.dispose();
        }
    }
}

async function terminateProcessGroup(
    leaderProcessId: number,
    exit: Promise<[number | null, NodeJS.Signals | null]>
): Promise<void> {
    if (!signalProcessGroup(leaderProcessId, 'SIGTERM')) {
        return;
    }

    await delay(250);
    signalProcessGroup(leaderProcessId, 'SIGKILL');
    await Promise.race([exit.catch(() => undefined), delay(2_000)]);
}

async function runIsolatedSession(): Promise<void> {
    for (const [schema, key, value] of buildGSettingsCommands()) {
        await execFile('gsettings', ['set', schema, key, value], {encoding: 'utf8'});
    }

    const shell = spawn('gnome-shell', buildHeadlessShellArguments(), {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let shellLog = '';

    shell.stdout.setEncoding('utf8');
    shell.stderr.setEncoding('utf8');
    shell.stdout.on('data', chunk => {
        shellLog += String(chunk);
    });
    shell.stderr.on('data', chunk => {
        shellLog += String(chunk);
    });

    try {
        await waitForExtensionState('ACTIVE', inspectExtensionState, defaultWaitOptions());

        const {stdout: displayState} = await execFile(
            'gdbus',
            [
                'call',
                '--session',
                '--dest',
                'org.gnome.Mutter.DisplayConfig',
                '--object-path',
                '/org/gnome/Mutter/DisplayConfig',
                '--method',
                'org.gnome.Mutter.DisplayConfig.GetCurrentState',
            ],
            {encoding: 'utf8'}
        );
        assertVirtualMonitors(displayState);

        await setExtensionEnabled(false);
        await waitForExtensionState('INACTIVE', inspectExtensionState, defaultWaitOptions());

        await setExtensionEnabled(true);
        await waitForExtensionState('ACTIVE', inspectExtensionState, defaultWaitOptions());

        process.stdout.write(
            'runtime smoke passed: 2 virtual monitors, ACTIVE -> INACTIVE -> ACTIVE\n'
        );
    } catch (error) {
        process.stderr.write(shellLog);
        throw error;
    } finally {
        shell.kill('SIGTERM');
        await Promise.race([once(shell, 'exit'), delay(5_000)]);
        if (shell.exitCode === null) {
            shell.kill('SIGKILL');
            await once(shell, 'exit');
        }
    }
}

async function inspectExtensionState(): Promise<string | null> {
    try {
        const {stdout} = await callShellExtensionMethod('GetExtensionInfo');
        return parseExtensionState(stdout);
    } catch {
        return null;
    }
}

async function setExtensionEnabled(enabled: boolean): Promise<void> {
    const method = enabled ? 'EnableExtension' : 'DisableExtension';
    const {stdout} = await callShellExtensionMethod(method);

    if (!stdout.includes('true')) {
        throw new Error(`${method} was rejected by GNOME Shell`);
    }
}

async function callShellExtensionMethod(
    method: 'DisableExtension' | 'EnableExtension' | 'GetExtensionInfo'
): Promise<{stdout: string; stderr: string}> {
    return execFile(
        'gdbus',
        [
            'call',
            '--session',
            '--dest',
            'org.gnome.Shell',
            '--object-path',
            '/org/gnome/Shell',
            '--method',
            `org.gnome.Shell.Extensions.${method}`,
            EXTENSION_UUID,
        ],
        {encoding: 'utf8'}
    );
}

function defaultWaitOptions(): WaitOptions {
    return {
        attempts: 40,
        delay: async () => delay(250),
    };
}

function delay(milliseconds: number): Promise<void> {
    return new Promise(resolveDelay => {
        setTimeout(resolveDelay, milliseconds);
    });
}

function isMissingProcessError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ESRCH';
}

const entryPoint = process.argv[1];

if (entryPoint !== undefined && import.meta.url === pathToFileURL(entryPoint).href) {
    await run();
}
