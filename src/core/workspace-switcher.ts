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

export interface WorkspaceSwitchLease {
    commit(workspace: number): void;
    finish(): void;
}

interface ExpectedMonitor {
    destination: number | null;
    monitor: MonitorIndex;
    token: symbol;
}

export class WorkspaceSwitcher<WindowId> {
    readonly #environment: WorkspaceEnvironment<WindowId>;
    readonly workspaces: MonitorWorkspaces;
    #activeWorkspace: number;
    readonly #expectedMonitors: ExpectedMonitor[] = [];

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
        const expected = this.#pushExpectedMonitor(targetMonitor);
        let active = true;

        return (): void => {
            if (!active) {
                return;
            }

            active = false;
            this.#removeExpectedMonitor(expected.token);
        };
    }

    beginGestureOn(targetMonitor: MonitorIndex): WorkspaceSwitchLease {
        const expected = this.#pushExpectedMonitor(targetMonitor);
        let active = true;

        return {
            commit: workspace => {
                if (active) {
                    expected.destination = workspace;
                }
            },
            finish: () => {
                if (!active) {
                    return;
                }

                active = false;
                if (expected.destination === null) {
                    this.#removeExpectedMonitor(expected.token);
                }
            },
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

        const expected = this.#findExpectedMonitor(activeWorkspace);
        try {
            this.#completeTransition(
                expected?.monitor ?? this.#environment.activeMonitor(),
                this.#environment.windowPlacements(),
                this.#environment.workspaceCount(),
                previousWorkspace,
                activeWorkspace
            );
        } finally {
            if (expected !== undefined) {
                this.#removeExpectedMonitor(expected.token);
            }
        }
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

    #pushExpectedMonitor(monitor: MonitorIndex): ExpectedMonitor {
        const expected = {
            destination: null,
            monitor,
            token: Symbol('workspace-switch-target'),
        };
        this.#expectedMonitors.push(expected);
        return expected;
    }

    #findExpectedMonitor(activeWorkspace: number): ExpectedMonitor | undefined {
        return this.#expectedMonitors.findLast(expected => {
            return expected.destination === null || expected.destination === activeWorkspace;
        });
    }

    #removeExpectedMonitor(token: symbol): void {
        const index = this.#expectedMonitors.findIndex(expected => expected.token === token);
        if (index !== -1) {
            this.#expectedMonitors.splice(index, 1);
        }
    }
}
