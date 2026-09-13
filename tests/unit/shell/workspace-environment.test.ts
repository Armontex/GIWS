import {describe, expect, test, vi} from 'vitest';

import {GnomeWorkspaceEnvironment} from '../../../src/shell/workspace-environment.js';
import type {ShellWindow} from '../../../src/shell/workspace-windows.js';

describe('GnomeWorkspaceEnvironment', () => {
    test('adapts GNOME display and workspace state to the core contract', () => {
        const changeWorkspace = vi.fn();
        const window: ShellWindow = {
            change_workspace_by_index: changeWorkspace,
            get_monitor: () => 1,
            get_window_type: () => 0,
            is_on_all_workspaces: () => false,
        };
        const environment = new GnomeWorkspaceEnvironment(
            {
                get_current_monitor: () => 1,
                get_primary_monitor: () => 0,
            },
            {
                get_active_workspace_index: () => 0,
                get_n_workspaces: () => 2,
                get_workspace_by_index: index => ({
                    list_windows: () => (index === 0 ? [window] : []),
                }),
            },
            0
        );

        expect(environment.activeMonitor()).toBe(1);
        expect(environment.primaryMonitor()).toBe(0);
        expect(environment.activeWorkspace()).toBe(0);
        expect(environment.workspaceCount()).toBe(2);
        expect(environment.windowPlacements()).toEqual([{id: window, monitor: 1, workspace: 0}]);

        environment.apply([{id: window, workspace: 1}]);
        expect(changeWorkspace.mock.calls).toEqual([[1, false]]);
    });
});
