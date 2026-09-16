import {describe, expect, test, vi} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {
    WorkspaceSwitcher,
    type WorkspaceEnvironment,
} from '../../../src/core/workspace-switcher.js';
import type {WindowPlacement} from '../../../src/core/workspaces.js';

function environment(
    options: {
        activeMonitor?: number;
        activeWorkspace?: number;
        windows?: WindowPlacement<string>[];
    } = {}
): {
    apply: ReturnType<typeof vi.fn>;
    environment: WorkspaceEnvironment<string>;
    setActiveMonitor(index: number): void;
    setActiveWorkspace(index: number): void;
    setMonitorCount(count: number): void;
    setWorkspaceCount(count: number): void;
} {
    let activeMonitor = options.activeMonitor ?? 1;
    let activeWorkspace = options.activeWorkspace ?? 0;
    let monitorCount = 3;
    let workspaceCount = 4;
    const apply = vi.fn();

    return {
        apply,
        environment: {
            activeMonitor: () => asMonitorIndex(activeMonitor),
            activeWorkspace: () => activeWorkspace,
            apply,
            monitorCount: () => monitorCount,
            windowPlacements: () => options.windows ?? [],
            workspaceCount: () => workspaceCount,
        },
        setActiveMonitor(index): void {
            activeMonitor = index;
        },
        setActiveWorkspace(index): void {
            activeWorkspace = index;
        },
        setMonitorCount(count): void {
            monitorCount = count;
        },
        setWorkspaceCount(count): void {
            workspaceCount = count;
        },
    };
}

describe('WorkspaceSwitcher', () => {
    test('delegates to GNOME when a secondary monitor is active', () => {
        const {apply, environment: shell} = environment({
            windows: [
                {id: 'secondary-next', monitor: asMonitorIndex(1), workspace: 1},
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 0},
            ],
        });
        const nativeSwitch = vi.fn();
        const switcher = new WorkspaceSwitcher(shell);

        switcher.switch(nativeSwitch);

        expect(nativeSwitch).toHaveBeenCalledOnce();
        expect(apply).not.toHaveBeenCalled();
    });

    test('delegates to GNOME when the primary monitor is active', () => {
        const {apply, environment: shell} = environment({activeMonitor: 0});
        const nativeSwitch = vi.fn();
        const switcher = new WorkspaceSwitcher(shell);

        switcher.switch(nativeSwitch);

        expect(nativeSwitch).toHaveBeenCalledOnce();
        expect(apply.mock.calls).toHaveLength(0);
    });

    test('compensates inactive monitors when a delegated switch changes workspace', () => {
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

        switcher.switch(() => {
            events.push('native-switch');
            state.setActiveWorkspace(1);
            switcher.workspaceChanged();
        });

        expect(events).toEqual(['native-switch', 'compensate']);
        expect(state.apply.mock.calls).toEqual([[[{id: 'secondary', workspace: 1}]]]);
    });

    test('uses the activated window monitor for an external workspace switch', () => {
        const state = environment({
            activeMonitor: 0,
            activeWorkspace: 1,
            windows: [
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 1},
                {id: 'secondary', monitor: asMonitorIndex(1), workspace: 0},
            ],
        });
        const switcher = new WorkspaceSwitcher(state.environment);

        switcher.switchOn(asMonitorIndex(1), () => {
            state.setActiveWorkspace(0);
            switcher.workspaceChanged();
        });

        expect(state.apply.mock.calls).toEqual([[[{id: 'primary', workspace: 0}]]]);
    });

    test('restores the target monitor after a nested activation', () => {
        const state = environment({
            activeMonitor: 0,
            windows: [
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 0},
                {id: 'secondary', monitor: asMonitorIndex(1), workspace: 0},
                {id: 'tertiary', monitor: asMonitorIndex(2), workspace: 0},
            ],
        });
        const switcher = new WorkspaceSwitcher(state.environment);

        switcher.switchOn(asMonitorIndex(1), () => {
            switcher.switchOn(asMonitorIndex(2), () => undefined);
            state.setActiveWorkspace(1);
            switcher.workspaceChanged();
        });

        expect(state.apply.mock.calls).toEqual([
            [
                [
                    {id: 'primary', workspace: 1},
                    {id: 'tertiary', workspace: 1},
                ],
            ],
        ]);
    });

    test('keeps the explicit switch target during nested focus activation', () => {
        const state = environment({
            activeMonitor: 1,
            windows: [
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 0},
                {id: 'secondary', monitor: asMonitorIndex(1), workspace: 0},
            ],
        });
        const switcher = new WorkspaceSwitcher(state.environment);

        switcher.switchOn(asMonitorIndex(1), () => {
            switcher.switchOn(asMonitorIndex(0), () => {
                state.setActiveWorkspace(1);
                switcher.workspaceChanged();
            });
        });

        expect(state.apply.mock.calls).toEqual([[[{id: 'primary', workspace: 1}]]]);
    });

    test('keeps the target monitor until an asynchronous gesture finishes', () => {
        const state = environment({
            activeMonitor: 0,
            windows: [
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 0},
                {id: 'secondary', monitor: asMonitorIndex(1), workspace: 0},
            ],
        });
        const switcher = new WorkspaceSwitcher(state.environment);

        const finishGesture = switcher.beginOn(asMonitorIndex(1));
        state.setActiveWorkspace(1);
        switcher.workspaceChanged();
        finishGesture();

        expect(state.apply.mock.calls).toEqual([[[{id: 'primary', workspace: 1}]]]);
    });

    test('refreshes logical workspace dimensions after monitor changes', () => {
        const state = environment();
        const switcher = new WorkspaceSwitcher(state.environment);

        state.setMonitorCount(4);
        state.setWorkspaceCount(2);
        switcher.refresh();

        expect(switcher.workspaces.active(asMonitorIndex(3), 0)).toBe(0);
    });
});
