import {describe, expect, test, vi} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {
    WorkspaceSwitcher,
    type WorkspaceEnvironment,
} from '../../../src/core/workspace-switcher.js';
import {SwitchDirection, type WindowPlacement} from '../../../src/core/workspaces.js';

function environment(
    options: {
        activeMonitor?: number;
        activeWorkspace?: number;
        primaryMonitor?: number;
        windows?: WindowPlacement<string>[];
    } = {}
): {
    apply: ReturnType<typeof vi.fn>;
    environment: WorkspaceEnvironment<string>;
    setActiveMonitor(index: number): void;
    setActiveWorkspace(index: number): void;
} {
    let activeMonitor = options.activeMonitor ?? 1;
    let activeWorkspace = options.activeWorkspace ?? 0;
    const apply = vi.fn();

    return {
        apply,
        environment: {
            activeMonitor: () => asMonitorIndex(activeMonitor),
            activeWorkspace: () => activeWorkspace,
            apply,
            primaryMonitor: () => asMonitorIndex(options.primaryMonitor ?? 0),
            windowPlacements: () => options.windows ?? [],
            workspaceCount: () => 4,
        },
        setActiveMonitor(index): void {
            activeMonitor = index;
        },
        setActiveWorkspace(index): void {
            activeWorkspace = index;
        },
    };
}

describe('WorkspaceSwitcher', () => {
    test('rotates windows locally when a secondary monitor is active', () => {
        const {apply, environment: shell} = environment({
            windows: [
                {id: 'secondary-next', monitor: asMonitorIndex(1), workspace: 1},
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 0},
            ],
        });
        const nativeSwitch = vi.fn();
        const switcher = new WorkspaceSwitcher(shell);

        switcher.switch(SwitchDirection.Next, nativeSwitch);

        expect(nativeSwitch.mock.calls).toHaveLength(0);
        expect(apply.mock.calls).toEqual([[[{id: 'secondary-next', workspace: 0}]]]);
    });

    test('delegates to GNOME when the primary monitor is active', () => {
        const {apply, environment: shell} = environment({activeMonitor: 0});
        const nativeSwitch = vi.fn();
        const switcher = new WorkspaceSwitcher(shell);

        switcher.switch(SwitchDirection.Previous, nativeSwitch);

        expect(nativeSwitch).toHaveBeenCalledOnce();
        expect(apply.mock.calls).toHaveLength(0);
    });

    test('compensates the captured inactive monitor before a delegated native switch', () => {
        const events: string[] = [];
        const state = environment({
            activeMonitor: 0,
            windows: [
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 0},
                {id: 'secondary', monitor: asMonitorIndex(1), workspace: 0},
            ],
        });
        state.apply.mockImplementation(() => {
            events.push('compensate');
        });
        const switcher = new WorkspaceSwitcher(state.environment);

        switcher.switch(SwitchDirection.Next, () => {
            events.push('native-switch');
            state.setActiveWorkspace(1);
            state.setActiveMonitor(1);
        });

        expect(events).toEqual(['compensate', 'native-switch']);
        expect(state.apply.mock.calls).toEqual([[[{id: 'secondary', workspace: 1}]]]);
    });
});
