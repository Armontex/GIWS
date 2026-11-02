import type {WorkspaceSwitchLease} from '../core/workspace-switcher.js';

interface WorkspaceAnimationWindow {
    get_compositor_private(): unknown;
}

interface WorkspaceAnimationGroup {
    _shouldShowWindow(window: WorkspaceAnimationWindow): boolean;
    readonly _windowRecords: {readonly windowActor: unknown}[];
}

export interface WorkspaceAnimationMonitor {
    readonly _container: {x: number; y: number};
    readonly _workspaceGroups: WorkspaceAnimationGroup[];
    connect(signal: 'notify::progress', callback: () => void): number;
    destroy: () => void;
    disconnect(id: number): void;
    readonly index: number;
    opacity: number;
}

interface WorkspaceAnimationSwitchData {
    baseMonitorGroup?: {
        findClosestWorkspace(progress: number): {index(): number};
    };
    monitors: WorkspaceAnimationMonitor[];
}

export interface WorkspaceOrder {
    activeMonitor(): number;
    primaryMonitor(): number;
    toLogical(monitor: number, workspace: number): number;
    workspaceCount(): number;
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
    readonly #order: WorkspaceOrder;
    #nativePrepare: WorkspaceAnimationController['_prepareWorkspaceSwitch'] | null = null;
    #prepareOverride: WorkspaceAnimationController['_prepareWorkspaceSwitch'] | null = null;

    constructor(controller: WorkspaceAnimationController, order: WorkspaceOrder) {
        this.#controller = controller;
        this.#order = order;
    }

    enable(): void {
        const controller = this.#controller;
        const nativePrepare = controller._prepareWorkspaceSwitch;

        const prepare = (workspaceIndices?: readonly number[]): void => {
            const fresh = controller._switchData === null;
            // Only a swipe passes no indices: it scrolls the monitor under the pointer.
            // ponytail: a touchscreen swipe elsewhere gets that monitor's order; read the
            // tracker's monitor if touch input ever matters.
            nativePrepare.call(
                controller,
                workspaceIndices ?? this.#logicalOrder(this.#order.activeMonitor())
            );
            if (fresh) {
                this.#hardenSwitchData();
            }
        };

        this.#nativePrepare = nativePrepare;
        this.#prepareOverride = prepare;
        controller._prepareWorkspaceSwitch = prepare;
    }

    dispose(): void {
        if (
            this.#nativePrepare !== null &&
            this.#controller._prepareWorkspaceSwitch === this.#prepareOverride
        ) {
            this.#controller._prepareWorkspaceSwitch = this.#nativePrepare;
        }
        this.#nativePrepare = null;
        this.#prepareOverride = null;
    }

    run(targetMonitor: number, nativeSwitch: () => void): void {
        const controller = this.#controller;
        const originalPrepare = controller._prepareWorkspaceSwitch;

        const prepareTargetOnly = (workspaceIndices?: readonly number[]): void => {
            originalPrepare.call(controller, this.#logicalOrder(targetMonitor, workspaceIndices));
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

    #logicalOrder(monitor: number, workspaces?: readonly number[]): number[] {
        const indices =
            workspaces ?? Array.from({length: this.#order.workspaceCount()}, (_, i) => i);

        return [...indices].sort(
            (left, right) =>
                this.#order.toLogical(monitor, left) - this.#order.toLogical(monitor, right)
        );
    }

    #hardenSwitchData(): void {
        const primary = this.#order.primaryMonitor();
        const monitors = this.#controller._switchData?.monitors ?? [];

        // GNOME finishes the switch from the primary group's animation and destroys every group.
        // A zero-length animation finishes synchronously, inside its loop over the groups.
        monitors.sort((a, b) => Number(a.index === primary) - Number(b.index === primary));

        // Compensation moves windows onto a workspace after its group was built. GNOME's
        // _syncStacking then looks up a clone that was never created and throws.
        for (const group of monitors.flatMap(monitor => monitor._workspaceGroups)) {
            const shouldShowWindow = group._shouldShowWindow.bind(group);
            group._shouldShowWindow = window => {
                const actor = window.get_compositor_private();
                return (
                    group._windowRecords.some(record => record.windowActor === actor) &&
                    shouldShowWindow(window)
                );
            };
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

                // The swipe runs along logical positions. Without switch data the instant
                // animation has already activated the workspace.
                const workspace = this.#controller._switchData?.baseMonitorGroup
                    ?.findClosestWorkspace(endProgress)
                    .index();
                if (workspace !== undefined && workspace !== gesture.startWorkspace) {
                    gesture.lease.commit(workspace);
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
