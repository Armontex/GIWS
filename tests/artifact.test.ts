import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

import {describe, expect, test} from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourceMetadataPath = resolve(repositoryRoot, 'metadata.json');
const builtMetadataPath = resolve(repositoryRoot, 'dist', 'metadata.json');
const builtExtensionPath = resolve(repositoryRoot, 'dist', 'extension.js');

describe('extension artifact', () => {
    test('declares the supported GNOME Shell contract', () => {
        expect(existsSync(sourceMetadataPath)).toBe(true);

        const metadata = JSON.parse(readFileSync(sourceMetadataPath, 'utf8')) as unknown;

        expect(metadata).toEqual(
            expect.objectContaining({
                name: 'GIWS',
                'shell-version': ['46'],
                url: 'https://github.com/Armontex/GIWS',
                uuid: 'giws@armontex',
            })
        );
    });

    test('builds the files required by GNOME Shell', () => {
        expect(existsSync(builtMetadataPath)).toBe(true);
        expect(existsSync(builtExtensionPath)).toBe(true);

        const extension = readFileSync(builtExtensionPath, 'utf8');

        expect(extension).toContain('export default class GiwsExtension');
    });
});
