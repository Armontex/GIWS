import {asMonitorIndex} from '../core/monitor.js';
import type {MonitorWorkspaces} from '../core/monitor-workspaces.js';
import type {WorkspaceSwitchLease} from '../core/workspace-switcher.js';

export interface OverviewAdjustment {
    lower: number;
    page_increment: number;
    page_size: number;
    step_increment: number;
    upper: number;
    value: number;
    connectObject(signal: string, callback: (...args: never[]) => void, owner: object): void;
    connect(signal: 'notify::value', callback: () => void): number;
    disconnect(id: number): void;
    disconnectObject(owner: object): void;
    ease(value: number, options: {duration?: number; onComplete?: () => void}): void;
    remove_transition(name: string): void;
}

export interface OverviewSwipeTracker {
    readonly distance: number;
    readonly _snapPoints: number[];
    confirmSwipe(
        distance: number,
        snapPoints: number[],
        currentProgress: number,
        cancelProgress: number
    ): void;
    connect(
        signal: 'begin',
        callback: (tracker: OverviewSwipeTracker, monitor: number) => void
    ): number;
    connect(
        signal: 'end',
        callback: (tracker: OverviewSwipeTracker, duration: number, endProgress: number) => void
    ): number;
    disconnect(id: number): void;
}

interface OverviewWorkspaceActor {
    readonly metaWorkspace: {index(): number};
    readonly _windows?: OverviewWindowPreview[];
    show(): void;
    visible: boolean;
}

interface OverviewWindowPreview {
    get_transition(name: string): object | null;
    remove_transition(name: string): void;
    scale_x: number;
    scale_y: number;
    set_pivot_point(x: number, y: number): void;
}

interface OverviewActor {
    connect(signal: 'destroy', callback: () => void): number;
    disconnect(id: number): void;
}

export interface OverviewWorkspaceView extends OverviewActor {
    _animating: boolean;
    readonly _gestureActive: boolean;
    readonly _monitorIndex: number;
    _scrollAdjustment: OverviewAdjustment;
    _scrollToActive(): void;
    _updateVisibility(): void;
    _updateWorkspacesState(): void;
    _onScrollAdjustmentChanged(): void;
    _workspaces: OverviewWorkspaceActor[];
    getActiveWorkspace(): OverviewWorkspaceActor | undefined;
    queue_relayout(): void;
}

export interface OverviewThumbnailBox extends OverviewActor {
    _animatingIndicator: boolean;
    _createThumbnails(): void;
    _destroyThumbnails(): void;
    _queueUpdateStates(): void;
    _scrollAdjustment: OverviewAdjustment;
    _thumbnails: OverviewWorkspaceActor[];
    _updateIndicator(): void;
    queue_relayout(): void;
}

interface SecondaryOverviewWorkspaceView {
    readonly _monitorIndex: number;
    readonly _thumbnails: OverviewThumbnailBox;
    readonly _workspacesView: OverviewWorkspaceView;
}

export interface OverviewWorkspacesDisplay {
    _endTouchGesture(): void;
    readonly _scrollAdjustment: OverviewAdjustment;
    readonly _swipeTracker: OverviewSwipeTracker;
    _workspacesViews: (OverviewWorkspaceView | SecondaryOverviewWorkspaceView)[];
    _updateWorkspacesViews(): void;
}

type AdjustmentFactory = (
    value: number,
    source: OverviewAdjustment,
    actor: OverviewWorkspaceView
) => OverviewAdjustment;

interface ViewMethods {
    getActiveWorkspace: OverviewWorkspaceView['getActiveWorkspace'];
    scrollToActive: OverviewWorkspaceView['_scrollToActive'];
    updateVisibility: OverviewWorkspaceView['_updateVisibility'];
}

interface ThumbnailMethods {
    updateIndicator: OverviewThumbnailBox['_updateIndicator'];
}

interface MonitorBinding {
    adjustment: OverviewAdjustment;
    animationTarget: number | null;
    monitor: number;
    nativeAdjustment: OverviewAdjustment;
    thumbnails: OverviewThumbnailBox;
    // Null once GNOME destroyed the actor: it must not be touched again.
    thumbnailsDestroyId: number | null;
    thumbnailMethods: ThumbnailMethods;
    view: OverviewWorkspaceView;
    viewDestroyId: number | null;
    viewMethods: ViewMethods;
}

interface GestureBinding {
    adjustmentId: number | null;
    beginId: number | null;
    display: OverviewWorkspacesDisplay;
    endTouchGesture: OverviewWorkspacesDisplay['_endTouchGesture'];
    endTouchGestureOverride: OverviewWorkspacesDisplay['_endTouchGesture'];
    endId: number | null;
    lease: WorkspaceSwitchLease | null;
    monitor: MonitorBinding | null;
    updateWorkspacesViews: OverviewWorkspacesDisplay['_updateWorkspacesViews'];
    updateWorkspacesViewsOverride: OverviewWorkspacesDisplay['_updateWorkspacesViews'];
    ease: OverviewAdjustment['ease'];
    easeOverride: OverviewAdjustment['ease'];
    workspaceStart: number;
}

interface PendingBinding {
    display: OverviewWorkspacesDisplay;
    primaryThumbnails: OverviewThumbnailBox;
}

const WORKSPACE_SWITCH_TIME = 250;
const POSITION_EPSILON = 0.001;

export class OverviewWorkspaceAdapter {
    readonly #activeWorkspace: () => number;
    readonly #createAdjustment: AdjustmentFactory;
    readonly #model: MonitorWorkspaces;
    readonly #beginOn: (monitor: number) => WorkspaceSwitchLease;
    readonly #activate: (workspace: number) => void;
    #bindings: MonitorBinding[] = [];
    #gesture: GestureBinding | null = null;
    #pendingBind: PendingBinding | null = null;
    #unbindRequested = false;

    constructor(
        model: MonitorWorkspaces,
        activeWorkspace: () => number,
        createAdjustment: AdjustmentFactory,
        beginOn: (monitor: number) => WorkspaceSwitchLease = () => ({
            commit: () => undefined,
            finish: () => undefined,
        }),
        activate: (workspace: number) => void = () => undefined
    ) {
        this.#model = model;
        this.#activeWorkspace = activeWorkspace;
        this.#createAdjustment = createAdjustment;
        this.#beginOn = beginOn;
        this.#activate = activate;
    }

    bind(display: OverviewWorkspacesDisplay, primaryThumbnails: OverviewThumbnailBox): void {
        if (this.#gesture?.monitor !== null && this.#gesture?.monitor !== undefined) {
            this.#pendingBind = {display, primaryThumbnails};
            this.#unbindRequested = true;
            this.#unbindViews();
            return;
        }

        this.#unbindNow();

        this.#bindings = display._workspacesViews.map(entry => {
            const secondary = '_workspacesView' in entry;
            const view = secondary ? entry._workspacesView : entry;
            const thumbnails = secondary ? entry._thumbnails : primaryThumbnails;
            return this.#bindMonitor(view, thumbnails);
        });

        this.sync(false);
        this.#bindGesture(display, primaryThumbnails);
    }

    sync(animate = true): void {
        for (const binding of this.#bindings) {
            this.#order(binding);
            this.#settleWindowPreviewScale(binding);
            const active = this.#logicalActive(binding.monitor);

            if (animate && Math.abs(binding.adjustment.value - active) > POSITION_EPSILON) {
                binding.view._scrollToActive();
            } else {
                binding.adjustment.value = active;
                binding.view._updateVisibility();
                binding.view._updateWorkspacesState();
                binding.thumbnails._updateIndicator();
            }
        }
    }

    unbind(): void {
        this.#pendingBind = null;
        if (this.#gesture?.monitor !== null && this.#gesture?.monitor !== undefined) {
            this.#unbindRequested = true;
            this.#unbindViews();
            return;
        }

        this.#unbindNow();
    }

    dispose(): void {
        this.#pendingBind = null;
        this.#unbindRequested = false;
        this.#unbindNow();
    }

    #unbindNow(): void {
        this.#unbindGesture();
        this.#unbindViews();
    }

    #unbindViews(): void {
        for (const binding of this.#bindings) {
            this.#restore(binding);
        }

        this.#bindings = [];
    }

    // GNOME destroys the views when the Overview hides or rebuilds them, which may happen
    // while they are still bound; a destroyed actor can't be reconnected, only forgotten.
    #forget(binding: MonitorBinding): void {
        this.#bindings = this.#bindings.filter(candidate => candidate !== binding);
        this.#restore(binding);
    }

    #restore(binding: MonitorBinding): void {
        const {adjustment, nativeAdjustment, thumbnails, view} = binding;

        if (binding.viewDestroyId !== null) {
            view.disconnect(binding.viewDestroyId);
            binding.viewDestroyId = null;
            adjustment.disconnectObject(view);
            view._scrollAdjustment = nativeAdjustment;
            view._scrollToActive = binding.viewMethods.scrollToActive;
            view._updateVisibility = binding.viewMethods.updateVisibility;
            view.getActiveWorkspace = binding.viewMethods.getActiveWorkspace;
            this.#orderPhysical(view._workspaces);
            nativeAdjustment.connectObject(
                'notify::value',
                view._onScrollAdjustmentChanged.bind(view),
                view
            );
        }

        if (binding.thumbnailsDestroyId !== null) {
            thumbnails.disconnect(binding.thumbnailsDestroyId);
            binding.thumbnailsDestroyId = null;
            adjustment.disconnectObject(thumbnails);
            thumbnails._scrollAdjustment = nativeAdjustment;
            thumbnails._updateIndicator = binding.thumbnailMethods.updateIndicator;
            this.#orderPhysical(thumbnails._thumbnails);
            nativeAdjustment.connectObject(
                'notify::value',
                thumbnails._updateIndicator.bind(thumbnails),
                thumbnails
            );
        }
    }

    #bindGesture(
        display: OverviewWorkspacesDisplay,
        primaryThumbnails: OverviewThumbnailBox
    ): void {
        // Preserve the exact GNOME methods so unbinding restores the native Overview object.
        /* eslint-disable @typescript-eslint/unbound-method */
        const endTouchGesture = display._endTouchGesture;
        const updateWorkspacesViews = display._updateWorkspacesViews;
        const ease = display._scrollAdjustment.ease;
        /* eslint-enable @typescript-eslint/unbound-method */
        const gesture: GestureBinding = {
            adjustmentId: null,
            beginId: null,
            display,
            endTouchGesture,
            endTouchGestureOverride: endTouchGesture,
            endId: null,
            lease: null,
            monitor: null,
            updateWorkspacesViews,
            updateWorkspacesViewsOverride: updateWorkspacesViews,
            ease,
            easeOverride: ease,
            workspaceStart: 0,
        };
        // A vertical swipe in the open Overview re-runs prepareToEnterOverview: GNOME replaces
        // the views, and no 'showing' follows to bind the new ones.
        const updateWorkspacesViewsOverride = (): void => {
            updateWorkspacesViews.call(display);
            if (!this.#unbindRequested) {
                this.bind(display, primaryThumbnails);
            }
        };
        gesture.updateWorkspacesViewsOverride = updateWorkspacesViewsOverride;
        display._updateWorkspacesViews = updateWorkspacesViewsOverride;
        const endTouchGestureOverride = (): void => {
            try {
                endTouchGesture.call(display);
            } finally {
                this.#finishGesture();
            }
        };
        gesture.endTouchGestureOverride = endTouchGestureOverride;
        display._endTouchGesture = endTouchGestureOverride;
        // GNOME's end handler eases to the physical workspace endProgress and activates it. An
        // interrupted swipe has zero duration, which completes inside that call: skip it.
        const easeOverride: OverviewAdjustment['ease'] = (value, options) => {
            if (gesture.monitor === null) {
                ease.call(display._scrollAdjustment, value, options);
            }
        };
        gesture.easeOverride = easeOverride;
        display._scrollAdjustment.ease = easeOverride;
        // GNOME's handlers run first and drive the swipe in physical workspaces. We re-confirm
        // it in the logical workspaces of the monitor it began on, so its progress, bounds and
        // end point are all logical, and translate only the workspace finally activated.
        gesture.beginId = display._swipeTracker.connect('begin', (tracker, monitor) => {
            this.#finishGesture();
            const binding = this.#bindings.find(candidate => candidate.monitor === monitor);
            if (binding === undefined) {
                return;
            }

            gesture.monitor = binding;
            gesture.workspaceStart = this.#activeWorkspace();
            gesture.lease = this.#beginOn(monitor);
            const progress = binding.adjustment.value;
            display._scrollAdjustment.value = progress;
            tracker.confirmSwipe(
                tracker.distance,
                tracker._snapPoints,
                progress,
                Math.round(progress)
            );
        });
        gesture.endId = display._swipeTracker.connect('end', (_tracker, duration, endProgress) => {
            const binding = gesture.monitor;
            if (binding === null) {
                return;
            }

            const workspace = this.#model.toPhysical(asMonitorIndex(binding.monitor), endProgress);
            if (gesture.lease !== null && workspace !== gesture.workspaceStart) {
                gesture.lease.commit(workspace);
            }

            // ponytail: default easing instead of GNOME's EASE_OUT_CUBIC; pass the mode in if
            // the difference ever shows.
            ease.call(display._scrollAdjustment, endProgress, {
                duration,
                onComplete: () => {
                    if (workspace !== this.#activeWorkspace()) {
                        this.#activate(workspace);
                    }
                    display._endTouchGesture();
                    // The views get this adjustment back when the Overview closes.
                    display._scrollAdjustment.value = this.#activeWorkspace();
                },
            });
        });
        gesture.adjustmentId = display._scrollAdjustment.connect('notify::value', () => {
            if (gesture.monitor !== null) {
                gesture.monitor.adjustment.value = display._scrollAdjustment.value;
            }
        });
        this.#gesture = gesture;
    }

    #unbindGesture(): void {
        const gesture = this.#gesture;
        if (gesture === null) {
            return;
        }

        this.#disconnectGestureSignals(gesture);
        if (gesture.display._endTouchGesture === gesture.endTouchGestureOverride) {
            gesture.display._endTouchGesture = gesture.endTouchGesture;
        }
        if (gesture.display._updateWorkspacesViews === gesture.updateWorkspacesViewsOverride) {
            gesture.display._updateWorkspacesViews = gesture.updateWorkspacesViews;
        }
        if (gesture.display._scrollAdjustment.ease === gesture.easeOverride) {
            gesture.display._scrollAdjustment.ease = gesture.ease;
        }
        gesture.lease?.finish();
        this.#gesture = null;
    }

    #disconnectGestureSignals(gesture: GestureBinding): void {
        if (gesture.beginId !== null) {
            gesture.display._swipeTracker.disconnect(gesture.beginId);
            gesture.beginId = null;
        }
        if (gesture.adjustmentId !== null) {
            gesture.display._scrollAdjustment.disconnect(gesture.adjustmentId);
            gesture.adjustmentId = null;
        }
        if (gesture.endId !== null) {
            gesture.display._swipeTracker.disconnect(gesture.endId);
            gesture.endId = null;
        }
    }

    #finishGesture(): void {
        const gesture = this.#gesture;
        if (gesture === null) {
            return;
        }

        gesture.lease?.finish();
        gesture.lease = null;
        gesture.monitor = null;

        if (this.#unbindRequested) {
            const pending = this.#pendingBind;
            this.#pendingBind = null;
            this.#unbindRequested = false;
            this.#unbindGesture();
            if (pending !== null) {
                this.bind(pending.display, pending.primaryThumbnails);
            }
        }
    }

    #bindMonitor(view: OverviewWorkspaceView, thumbnails: OverviewThumbnailBox): MonitorBinding {
        // Secondary thumbnails are created by their own 'showing' handler, which runs after
        // ours and would fill them in physical order; creating them first makes it a no-op.
        thumbnails._createThumbnails();
        const monitor = view._monitorIndex;
        const nativeAdjustment = view._scrollAdjustment;
        const adjustment = this.#createAdjustment(
            this.#logicalActive(monitor),
            nativeAdjustment,
            view
        );
        const binding: MonitorBinding = {
            adjustment,
            animationTarget: null,
            monitor,
            nativeAdjustment,
            thumbnails,
            thumbnailsDestroyId: null,
            thumbnailMethods: {updateIndicator: thumbnails._updateIndicator.bind(thumbnails)},
            view,
            viewDestroyId: null,
            viewMethods: {
                getActiveWorkspace: view.getActiveWorkspace.bind(view),
                scrollToActive: view._scrollToActive.bind(view),
                updateVisibility: view._updateVisibility.bind(view),
            },
        };
        binding.viewDestroyId = view.connect('destroy', () => {
            binding.viewDestroyId = null;
            this.#forget(binding);
        });
        binding.thumbnailsDestroyId = thumbnails.connect('destroy', () => {
            binding.thumbnailsDestroyId = null;
            this.#forget(binding);
        });

        nativeAdjustment.disconnectObject(view);
        nativeAdjustment.disconnectObject(thumbnails);
        view._scrollAdjustment = adjustment;
        thumbnails._scrollAdjustment = adjustment;
        view._scrollToActive = () => {
            this.#scrollToActive(binding);
        };
        view._updateVisibility = () => {
            this.#updateVisibility(binding);
        };
        view.getActiveWorkspace = () => {
            return view._workspaces[this.#logicalActive(monitor)];
        };
        thumbnails._updateIndicator = () => {
            this.#updateIndicator(binding);
        };
        adjustment.connectObject(
            'notify::value',
            () => {
                view._updateWorkspacesState();
                view.queue_relayout();
            },
            view
        );
        adjustment.connectObject(
            'notify::value',
            () => {
                thumbnails._updateIndicator();
            },
            thumbnails
        );

        return binding;
    }

    #scrollToActive(binding: MonitorBinding): void {
        const {adjustment, view} = binding;
        const active = this.#logicalActive(binding.monitor);

        if (binding.animationTarget === active) {
            return;
        }

        if (Math.abs(adjustment.value - active) <= POSITION_EPSILON) {
            if (binding.animationTarget !== null) {
                adjustment.remove_transition('value');
                binding.animationTarget = null;
            }
            view._animating = false;
            view._updateVisibility();
            return;
        }

        binding.animationTarget = active;
        view._animating = true;
        view._updateVisibility();
        adjustment.remove_transition('value');
        adjustment.ease(active, {
            duration: WORKSPACE_SWITCH_TIME,
            onComplete: () => {
                if (binding.animationTarget !== active) {
                    return;
                }

                binding.animationTarget = null;
                view._animating = false;
                view._updateVisibility();
            },
        });
    }

    #updateVisibility(binding: MonitorBinding): void {
        const {view} = binding;
        const active = this.#logicalActive(binding.monitor);

        view._workspaces.forEach((workspace, index) => {
            if (view._animating || view._gestureActive) {
                workspace.show();
            } else {
                workspace.visible = Math.abs(index - active) <= 1;
            }
        });
    }

    #updateIndicator(binding: MonitorBinding): void {
        const {adjustment, thumbnails} = binding;
        thumbnails._animatingIndicator =
            Math.abs(adjustment.value - this.#logicalActive(binding.monitor)) > 0.001;

        if (!thumbnails._animatingIndicator) {
            thumbnails._queueUpdateStates();
        }

        thumbnails.queue_relayout();
    }

    #settleWindowPreviewScale(binding: MonitorBinding): void {
        for (const workspace of binding.view._workspaces) {
            for (const preview of workspace._windows ?? []) {
                const scaleX = preview.get_transition('scale-x');
                const scaleY = preview.get_transition('scale-y');
                if (scaleX === null && scaleY === null) {
                    continue;
                }

                if (scaleX !== null) {
                    preview.remove_transition('scale-x');
                }
                if (scaleY !== null) {
                    preview.remove_transition('scale-y');
                }
                preview.scale_x = 1;
                preview.scale_y = 1;
                preview.set_pivot_point(0, 0);
            }
        }
    }

    #order(binding: MonitorBinding): void {
        const logicalIndex = (actor: OverviewWorkspaceActor): number => {
            return this.#model.toLogical(
                asMonitorIndex(binding.monitor),
                actor.metaWorkspace.index()
            );
        };

        binding.view._workspaces.sort((left, right) => logicalIndex(left) - logicalIndex(right));
        binding.thumbnails._thumbnails.sort(
            (left, right) => logicalIndex(left) - logicalIndex(right)
        );
    }

    #orderPhysical(actors: OverviewWorkspaceActor[]): void {
        actors.sort((left, right) => left.metaWorkspace.index() - right.metaWorkspace.index());
    }

    #logicalActive(monitor: number): number {
        return this.#model.active(asMonitorIndex(monitor), this.#activeWorkspace());
    }
}
