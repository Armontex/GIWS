import {describe, expect, test} from 'vitest';

import {assertWorkspaceConfiguration} from '../../../src/shell/workspace-configuration.js';

describe('assertWorkspaceConfiguration', () => {
    test('accepts static workspaces spanning all displays', () => {
        expect(() => {
            assertWorkspaceConfiguration({dynamicWorkspaces: false, primaryOnly: false});
        }).not.toThrow();
    });

    test.each([
        [{dynamicWorkspaces: true, primaryOnly: false}, 'static workspaces'],
        [{dynamicWorkspaces: false, primaryOnly: true}, 'span all displays'],
    ])('rejects an incompatible GNOME configuration', (configuration, message) => {
        expect(() => {
            assertWorkspaceConfiguration(configuration);
        }).toThrow(message);
    });
});
