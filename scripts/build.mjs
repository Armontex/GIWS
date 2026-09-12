import {execFileSync} from 'node:child_process';
import {copyFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(repositoryRoot, 'dist');
const compiler = resolve(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');

await rm(outputDirectory, {force: true, recursive: true});

execFileSync(process.execPath, [compiler, '--project', 'tsconfig.build.json'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
});

await copyFile(resolve(repositoryRoot, 'metadata.json'), resolve(outputDirectory, 'metadata.json'));
