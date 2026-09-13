import type {MonitorIndex} from './monitor.js';
import {MonitorWorkspaces} from './monitor-workspaces.js';
import {type WindowMove, type WindowPlacement, planGlobalSwitchCompensation} from './workspaces.js';

export interface WorkspaceEnvironment<WindowId> {
    activeMonitor(): MonitorIndex;
    activeWorkspace(): number;
    apply(moves: readonly WindowMove<WindowId>[]): void;
    monitorCount(): number;
    windowPlacements(): readonly WindowPlacement<WindowId>[];
    workspaceCount(): number;
}

export class WorkspaceSwitcher<WindowId> {
    readonly #environment: WorkspaceEnvironment<WindowId>;
    readonly workspaces: MonitorWorkspaces;
    #activeWorkspace: number;
    readonly #expectedMonitors: {monitor: MonitorIndex; token: symbol}[] = [];

    constructor(environment: WorkspaceEnvironment<WindowId>) {
        this.#environment = environment;
        this.#activeWorkspace = environment.activeWorkspace();
        this.workspaces = new MonitorWorkspaces(
            environment.monitorCount(),
            environment.workspaceCount()
        );
    }

    switch(nativeSwitch: () => void): void {
        this.switchOn(this.#environment.activeMonitor(), nativeSwitch);
    }

    switchOn(targetMonitor: MonitorIndex, nativeSwitch: () => void): void {
        const finish = this.beginOn(targetMonitor);

        try {
            nativeSwitch();
        } finally {
            finish();
        }
    }

    beginOn(targetMonitor: MonitorIndex): () => void {
        const token = Symbol('workspace-switch-target');
        this.#expectedMonitors.push({monitor: targetMonitor, token});
        let active = true;

        return (): void => {
            if (!active) {
                return;
            }

            active = false;
            const index = this.#expectedMonitors.findIndex(entry => entry.token === token);
            if (index !== -1) {
                this.#expectedMonitors.splice(index, 1);
            }
        };
    }

    refresh(): void {
        this.workspaces.resize(
            this.#environment.monitorCount(),
            this.#environment.workspaceCount()
        );
    }

    reset(): void {
        this.workspaces.reset(this.#environment.monitorCount(), this.#environment.workspaceCount());
    }

    workspaceChanged(): void {
        this.refresh();
        const previousWorkspace = this.#activeWorkspace;
        const activeWorkspace = this.#environment.activeWorkspace();
        this.#activeWorkspace = activeWorkspace;

        if (activeWorkspace === previousWorkspace) {
            return;
        }

        this.#completeTransition(
            this.#expectedMonitors.at(-1)?.monitor ?? this.#environment.activeMonitor(),
            this.#environment.windowPlacements(),
            this.#environment.workspaceCount(),
            previousWorkspace,
            activeWorkspace
        );
    }

    #completeTransition(
        targetMonitor: MonitorIndex,
        windows: readonly WindowPlacement<WindowId>[],
        workspaceCount: number,
        previousWorkspace: number,
        activeWorkspace: number
    ): void {
        this.#environment.apply(
            planGlobalSwitchCompensation(
                windows,
                targetMonitor,
                workspaceCount,
                previousWorkspace,
                activeWorkspace
            )
        );
        this.workspaces.completeSwitch(targetMonitor, previousWorkspace, activeWorkspace);
    }
}
