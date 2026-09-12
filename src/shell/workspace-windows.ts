import {asMonitorIndex} from '../core/monitor.js';
import type {WindowMove, WindowPlacement} from '../core/workspaces.js';

export interface ShellWindow {
    change_workspace_by_index(index: number, append: boolean): void;
    get_monitor(): number;
    get_window_type(): number;
    is_on_all_workspaces(): boolean;
}

export interface ShellWorkspace {
    list_windows(): ShellWindow[];
}

export interface WorkspaceProvider {
    get_n_workspaces(): number;
    get_workspace_by_index(index: number): ShellWorkspace | null;
}

export function getWindowPlacements(
    provider: WorkspaceProvider,
    normalWindowType: number
): WindowPlacement<ShellWindow>[] {
    const placements: WindowPlacement<ShellWindow>[] = [];
    const seen = new Set<ShellWindow>();

    for (let workspace = 0; workspace < provider.get_n_workspaces(); workspace += 1) {
        const shellWorkspace = provider.get_workspace_by_index(workspace);

        if (shellWorkspace === null) {
            continue;
        }

        for (const window of shellWorkspace.list_windows()) {
            if (
                seen.has(window) ||
                window.get_window_type() !== normalWindowType ||
                window.is_on_all_workspaces()
            ) {
                continue;
            }

            seen.add(window);
            placements.push({
                id: window,
                monitor: asMonitorIndex(window.get_monitor()),
                workspace,
            });
        }
    }

    return placements;
}

export function applyWindowMoves(moves: readonly WindowMove<ShellWindow>[]): void {
    for (const {id, workspace} of moves) {
        id.change_workspace_by_index(workspace, false);
    }
}
