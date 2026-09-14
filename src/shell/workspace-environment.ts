import {asMonitorIndex, type MonitorIndex} from '../core/monitor.js';
import type {WorkspaceEnvironment} from '../core/workspace-switcher.js';
import type {WindowMove, WindowPlacement} from '../core/workspaces.js';
import {getActiveMonitor} from './active-monitor.js';
import {
    applyWindowMoves,
    getWindowPlacements,
    type ShellWindow,
    type WorkspaceProvider,
} from './workspace-windows.js';

export interface DisplayProvider {
    get_current_monitor(): number;
    get_n_monitors(): number;
    get_primary_monitor(): number;
}

export interface WorkspaceStateProvider extends WorkspaceProvider {
    get_active_workspace_index(): number;
}

export class GnomeWorkspaceEnvironment implements WorkspaceEnvironment<ShellWindow> {
    readonly #display: DisplayProvider;
    readonly #workspaces: WorkspaceStateProvider;
    readonly #normalWindowType: number;

    constructor(
        display: DisplayProvider,
        workspaces: WorkspaceStateProvider,
        normalWindowType: number
    ) {
        this.#display = display;
        this.#workspaces = workspaces;
        this.#normalWindowType = normalWindowType;
    }

    activeMonitor(): MonitorIndex {
        return getActiveMonitor(this.#display);
    }

    primaryMonitor(): MonitorIndex {
        return asMonitorIndex(this.#display.get_primary_monitor());
    }

    monitorCount(): number {
        return this.#display.get_n_monitors();
    }

    activeWorkspace(): number {
        return this.#workspaces.get_active_workspace_index();
    }

    workspaceCount(): number {
        return this.#workspaces.get_n_workspaces();
    }

    windowPlacements(): WindowPlacement<ShellWindow>[] {
        return getWindowPlacements(this.#workspaces, this.#normalWindowType);
    }

    apply(moves: readonly WindowMove<ShellWindow>[]): void {
        applyWindowMoves(moves);
    }
}
