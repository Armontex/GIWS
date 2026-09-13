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

export interface WorkspaceSwipeTracker {
    connect(
        signal: 'begin',
        callback: (tracker: WorkspaceSwipeTracker, monitor: number) => void
    ): number;
    disconnect(id: number): void;
}

export interface WorkspaceGestureAnimationController extends WorkspaceAnimationController {
    _finishWorkspaceSwitch(switchData: WorkspaceAnimationSwitchData): void;
    readonly _swipeTracker: WorkspaceSwipeTracker;
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

    show(targetMonitor: number): void {
        showTargetMonitor(this.#controller, targetMonitor);
    }
}

export class WorkspaceGestureAnimationRouter {
    readonly #animation: TargetMonitorAnimationScope;
    readonly #beginOn: (monitor: number) => () => void;
    readonly #controller: WorkspaceGestureAnimationController;
    #finishGesture: (() => void) | null = null;
    #beginId: number | null = null;
    #finishOverride: WorkspaceGestureAnimationController['_finishWorkspaceSwitch'] | null = null;
    #originalFinish: WorkspaceGestureAnimationController['_finishWorkspaceSwitch'] | null = null;

    constructor(
        controller: WorkspaceGestureAnimationController,
        animation: TargetMonitorAnimationScope,
        beginOn: (monitor: number) => () => void
    ) {
        this.#controller = controller;
        this.#animation = animation;
        this.#beginOn = beginOn;
    }

    bind(): void {
        this.dispose();

        const controller = this.#controller;
        // Preserve the exact GNOME method so disabling the extension restores its prototype lookup.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const originalFinish = controller._finishWorkspaceSwitch;
        const finishOverride = (switchData: WorkspaceAnimationSwitchData): void => {
            try {
                originalFinish.call(controller, switchData);
            } finally {
                this.#finish();
            }
        };

        this.#originalFinish = originalFinish;
        this.#finishOverride = finishOverride;
        controller._finishWorkspaceSwitch = finishOverride;
        this.#beginId = controller._swipeTracker.connect('begin', (_tracker, monitor) => {
            this.#finish();
            this.#finishGesture = this.#beginOn(monitor);
            this.#animation.show(monitor);
        });
    }

    dispose(): void {
        if (this.#beginId !== null) {
            this.#controller._swipeTracker.disconnect(this.#beginId);
            this.#beginId = null;
        }
        if (
            this.#finishOverride !== null &&
            this.#controller._finishWorkspaceSwitch === this.#finishOverride &&
            this.#originalFinish !== null
        ) {
            this.#controller._finishWorkspaceSwitch = this.#originalFinish;
        }
        this.#finishOverride = null;
        this.#originalFinish = null;
        this.#finish();
    }

    #finish(): void {
        this.#finishGesture?.();
        this.#finishGesture = null;
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
