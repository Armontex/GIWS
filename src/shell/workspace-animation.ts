export interface WorkspaceAnimationMonitor {
    destroy: () => void;
    readonly index: number;
}

interface WorkspaceAnimationSwitchData {
    monitors: WorkspaceAnimationMonitor[];
}

export interface WorkspaceAnimationController {
    _prepareWorkspaceSwitch: (
        this: WorkspaceAnimationController,
        workspaceIndices?: readonly number[]
    ) => void;
    _switchData: WorkspaceAnimationSwitchData | null;
}

export class PrimaryMonitorAnimationScope {
    readonly #controller: WorkspaceAnimationController;
    readonly #primaryMonitor: () => number;

    constructor(controller: WorkspaceAnimationController, primaryMonitor: () => number) {
        this.#controller = controller;
        this.#primaryMonitor = primaryMonitor;
    }

    run(nativeSwitch: () => void): void {
        const controller = this.#controller;
        const originalPrepare = controller._prepareWorkspaceSwitch;
        const primaryMonitor = this.#primaryMonitor;

        function preparePrimaryOnly(
            this: WorkspaceAnimationController,
            workspaceIndices?: readonly number[]
        ): void {
            originalPrepare.call(this, workspaceIndices);

            const switchData = this._switchData;
            const primaryIndex = primaryMonitor();

            if (!switchData?.monitors.some(monitor => monitor.index === primaryIndex)) {
                return;
            }

            const secondaryMonitors = switchData.monitors.filter(
                monitor => monitor.index !== primaryIndex
            );
            switchData.monitors = switchData.monitors.filter(
                monitor => monitor.index === primaryIndex
            );
            secondaryMonitors.forEach(monitor => {
                monitor.destroy();
            });
        }

        controller._prepareWorkspaceSwitch = preparePrimaryOnly;

        try {
            nativeSwitch();
        } finally {
            if (controller._prepareWorkspaceSwitch === preparePrimaryOnly) {
                controller._prepareWorkspaceSwitch = originalPrepare;
            }
        }
    }
}
