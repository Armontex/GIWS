import type {MonitorIndex} from './monitor.js';

export interface WindowPlacement<WindowId> {
    id: WindowId;
    monitor: MonitorIndex;
    workspace: number;
}

export interface WindowMove<WindowId> {
    id: WindowId;
    workspace: number;
}

export function planGlobalSwitchCompensation<WindowId>(
    windows: readonly WindowPlacement<WindowId>[],
    activeMonitor: MonitorIndex,
    workspaceCount: number,
    previousWorkspace: number,
    activeWorkspace: number
): WindowMove<WindowId>[] {
    const shift = activeWorkspace - previousWorkspace;

    return windows
        .filter(window => window.monitor !== activeMonitor)
        .map(({id, workspace}) => ({
            id,
            workspace: wrapWorkspace(workspace + shift, workspaceCount),
        }));
}

function wrapWorkspace(workspace: number, workspaceCount: number): number {
    if (!Number.isInteger(workspaceCount) || workspaceCount < 1) {
        throw new RangeError(`Invalid workspace count: ${String(workspaceCount)}`);
    }

    return ((workspace % workspaceCount) + workspaceCount) % workspaceCount;
}
