export interface WorkspaceAnimationMonitor {
    destroy: () => void;
    readonly index: number;
    opacity: number;
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

export class TargetMonitorAnimationScope {
    readonly #controller: WorkspaceAnimationController;

    constructor(controller: WorkspaceAnimationController) {
        this.#controller = controller;
    }

    run(targetMonitor: number, nativeSwitch: () => void): void {
        const controller = this.#controller;
        const originalPrepare = controller._prepareWorkspaceSwitch;

        function prepareTargetOnly(
            this: WorkspaceAnimationController,
            workspaceIndices?: readonly number[]
        ): void {
            originalPrepare.call(this, workspaceIndices);
            showTargetMonitor(this, targetMonitor);
        }

        controller._prepareWorkspaceSwitch = prepareTargetOnly;

        try {
            nativeSwitch();
        } finally {
            if (controller._prepareWorkspaceSwitch === prepareTargetOnly) {
                controller._prepareWorkspaceSwitch = originalPrepare;
            }
        }
    }
}

function showTargetMonitor(controller: WorkspaceAnimationController, targetMonitor: number): void {
    const switchData = controller._switchData;

    if (!switchData?.monitors.some(monitor => monitor.index === targetMonitor)) {
        return;
    }

    switchData.monitors.forEach(monitor => {
        monitor.opacity = monitor.index === targetMonitor ? 255 : 0;
    });
}
