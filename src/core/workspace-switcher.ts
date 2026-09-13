import type {MonitorIndex} from './monitor.js';
import {type WindowMove, type WindowPlacement, planGlobalSwitchCompensation} from './workspaces.js';

export interface WorkspaceEnvironment<WindowId> {
    activeMonitor(): MonitorIndex;
    activeWorkspace(): number;
    apply(moves: readonly WindowMove<WindowId>[]): void;
    windowPlacements(): readonly WindowPlacement<WindowId>[];
    workspaceCount(): number;
}

export class WorkspaceSwitcher<WindowId> {
    readonly #environment: WorkspaceEnvironment<WindowId>;
    #activeWorkspace: number;
    #expectedMonitor: MonitorIndex | null = null;

    constructor(environment: WorkspaceEnvironment<WindowId>) {
        this.#environment = environment;
        this.#activeWorkspace = environment.activeWorkspace();
    }

    switch(nativeSwitch: () => void): void {
        this.switchOn(this.#environment.activeMonitor(), nativeSwitch);
    }

    switchOn(targetMonitor: MonitorIndex, nativeSwitch: () => void): void {
        const previousExpectedMonitor = this.#expectedMonitor;
        this.#expectedMonitor = targetMonitor;

        try {
            nativeSwitch();
        } finally {
            this.#expectedMonitor = previousExpectedMonitor;
        }
    }

    workspaceChanged(): void {
        const previousWorkspace = this.#activeWorkspace;
        const activeWorkspace = this.#environment.activeWorkspace();
        this.#activeWorkspace = activeWorkspace;

        if (activeWorkspace === previousWorkspace) {
            return;
        }

        this.#completeTransition(
            this.#expectedMonitor ?? this.#environment.activeMonitor(),
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
    }
}
