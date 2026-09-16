import type {WorkspaceSwitchLease} from '../core/workspace-switcher.js';

export interface WorkspaceAnimationMonitor {
    readonly _container: {x: number; y: number};
    connect(signal: 'notify::progress', callback: () => void): number;
    destroy: () => void;
    disconnect(id: number): void;
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
    connect(
        signal: 'end',
        callback: (tracker: WorkspaceSwipeTracker, duration: number, endProgress: number) => void
    ): number;
    disconnect(id: number): void;
}

export interface WorkspaceGestureAnimationController extends WorkspaceAnimationController {
    _finishWorkspaceSwitch(switchData: WorkspaceAnimationSwitchData): void;
    readonly _swipeTracker: WorkspaceSwipeTracker;
}

export class TargetMonitorAnimationScope {
    readonly #controller: WorkspaceAnimationController;
    readonly #freezeIds = new WeakMap<WorkspaceAnimationMonitor, number>();

    constructor(controller: WorkspaceAnimationController) {
        this.#controller = controller;
    }

    run(targetMonitor: number, nativeSwitch: () => void): void {
        const controller = this.#controller;
        const originalPrepare = controller._prepareWorkspaceSwitch;

        const prepareTargetOnly = (workspaceIndices?: readonly number[]): void => {
            originalPrepare.call(controller, workspaceIndices);
            this.show(targetMonitor);
        };

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
        const switchData = this.#controller._switchData;

        if (!switchData?.monitors.some(monitor => monitor.index === targetMonitor)) {
            return;
        }

        for (const monitor of switchData.monitors) {
            monitor.opacity = 255;
            const freezeId = this.#freezeIds.get(monitor);

            if (monitor.index === targetMonitor) {
                if (freezeId !== undefined) {
                    monitor.disconnect(freezeId);
                    this.#freezeIds.delete(monitor);
                }
                continue;
            }

            if (freezeId !== undefined) {
                continue;
            }

            const {x, y} = monitor._container;
            this.#freezeIds.set(
                monitor,
                monitor.connect('notify::progress', () => {
                    monitor._container.x = x;
                    monitor._container.y = y;
                })
            );
        }
    }
}

export class WorkspaceGestureAnimationRouter {
    readonly #animation: TargetMonitorAnimationScope;
    readonly #beginOn: (monitor: number) => WorkspaceSwitchLease;
    readonly #controller: WorkspaceGestureAnimationController;
    #beginId: number | null = null;
    #endId: number | null = null;
    #gesture: {lease: WorkspaceSwitchLease; startWorkspace: number} | null = null;
    readonly #activeWorkspace: () => number;

    constructor(
        controller: WorkspaceGestureAnimationController,
        animation: TargetMonitorAnimationScope,
        beginOn: (monitor: number) => WorkspaceSwitchLease,
        activeWorkspace: () => number
    ) {
        this.#controller = controller;
        this.#animation = animation;
        this.#beginOn = beginOn;
        this.#activeWorkspace = activeWorkspace;
    }

    bind(): void {
        this.dispose();

        this.#beginId = this.#controller._swipeTracker.connect('begin', (_tracker, monitor) => {
            this.#finish();
            this.#gesture = {
                lease: this.#beginOn(monitor),
                startWorkspace: this.#activeWorkspace(),
            };
            this.#animation.show(monitor);
        });
        this.#endId = this.#controller._swipeTracker.connect(
            'end',
            (_tracker, _duration, endProgress) => {
                const gesture = this.#gesture;
                if (gesture === null) {
                    return;
                }

                if (endProgress !== gesture.startWorkspace) {
                    gesture.lease.commit(endProgress);
                }
                this.#finish();
            }
        );
    }

    dispose(): void {
        if (this.#beginId !== null) {
            this.#controller._swipeTracker.disconnect(this.#beginId);
            this.#beginId = null;
        }
        if (this.#endId !== null) {
            this.#controller._swipeTracker.disconnect(this.#endId);
            this.#endId = null;
        }
        this.#finish();
    }

    #finish(): void {
        this.#gesture?.lease.finish();
        this.#gesture = null;
    }
}
