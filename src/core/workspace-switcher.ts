import type {MonitorIndex} from './monitor.js';
import {
    type SwitchDirection,
    type WindowMove,
    type WindowPlacement,
    planGlobalSwitchCompensation,
    planMonitorSwitch,
} from './workspaces.js';

export interface WorkspaceEnvironment<WindowId> {
    activeMonitor(): MonitorIndex;
    activeWorkspace(): number;
    apply(moves: readonly WindowMove<WindowId>[]): void;
    primaryMonitor(): MonitorIndex;
    windowPlacements(): readonly WindowPlacement<WindowId>[];
    workspaceCount(): number;
}

export class WorkspaceSwitcher<WindowId> {
    readonly #environment: WorkspaceEnvironment<WindowId>;

    constructor(environment: WorkspaceEnvironment<WindowId>) {
        this.#environment = environment;
    }

    switch(direction: SwitchDirection, nativeSwitch: () => void): void {
        const activeMonitor = this.#environment.activeMonitor();

        if (activeMonitor === this.#environment.primaryMonitor()) {
            const previousWorkspace = this.#environment.activeWorkspace();

            nativeSwitch();
            const activeWorkspace = this.#environment.activeWorkspace();

            if (activeWorkspace !== previousWorkspace) {
                this.#environment.apply(
                    planGlobalSwitchCompensation(
                        this.#environment.windowPlacements(),
                        activeMonitor,
                        this.#environment.workspaceCount(),
                        previousWorkspace,
                        activeWorkspace
                    )
                );
            }
            return;
        }

        this.#environment.apply(
            planMonitorSwitch(
                this.#environment.windowPlacements(),
                activeMonitor,
                this.#environment.workspaceCount(),
                direction
            )
        );
    }
}
