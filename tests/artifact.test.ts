import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {describe, expect, test} from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourceMetadataPath = resolve(repositoryRoot, 'metadata.json');
const builtMetadataPath = resolve(repositoryRoot, 'dist', 'metadata.json');
const builtExtensionPath = resolve(repositoryRoot, 'dist', 'extension.js');
const builtPreferencesPath = resolve(repositoryRoot, 'dist', 'prefs.js');
const builtSchemaPath = resolve(repositoryRoot, 'dist', 'schemas', 'gschemas.compiled');

describe('extension artifact', () => {
    test('declares the supported GNOME Shell contract', () => {
        expect(existsSync(sourceMetadataPath)).toBe(true);

        const metadata = JSON.parse(readFileSync(sourceMetadataPath, 'utf8')) as unknown;

        expect(metadata).toEqual(
            expect.objectContaining({
                name: 'GIWS',
                'shell-version': ['46'],
                'settings-schema': 'org.gnome.shell.extensions.giws',
                url: 'https://github.com/Armontex/GIWS',
                uuid: 'giws@armontex',
            })
        );
    });

    test('builds the files required by GNOME Shell', () => {
        expect(existsSync(builtMetadataPath)).toBe(true);
        expect(existsSync(builtExtensionPath)).toBe(true);
        expect(existsSync(builtPreferencesPath)).toBe(true);
        expect(existsSync(builtSchemaPath)).toBe(true);

        const extension = readFileSync(builtExtensionPath, 'utf8');

        expect(extension).toContain('export default class GiwsExtension');
        expect(extension).toContain('new WorkspaceSwitcher');
        expect(extension).toContain('new StockWorkspaceKeybindings');
    });

    test('builds the project modules used by the GNOME entry points', () => {
        const modules = [
            'core/monitor.js',
            'core/workspace-switcher.js',
            'core/workspaces.js',
            'lifecycle/disposables.js',
            'logging/logger.js',
            'preferences/preferences.js',
            'settings/keys.js',
            'settings/settings.js',
            'shell/active-monitor.js',
            'shell/keybindings.js',
            'shell/workspace-configuration.js',
            'shell/workspace-environment.js',
            'shell/workspace-windows.js',
        ];

        for (const module of modules) {
            expect(existsSync(resolve(repositoryRoot, 'dist', module)), module).toBe(true);
        }
    });
});
