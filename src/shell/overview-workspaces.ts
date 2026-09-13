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
    show(): void;
    visible: boolean;
}

export interface OverviewWorkspaceView {
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

export interface OverviewThumbnailBox {
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
    readonly _workspacesViews: (OverviewWorkspaceView | SecondaryOverviewWorkspaceView)[];
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
    monitor: number;
    nativeAdjustment: OverviewAdjustment;
    thumbnails: OverviewThumbnailBox;
    thumbnailMethods: ThumbnailMethods;
    view: OverviewWorkspaceView;
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
    logicalStart: number;
    monitor: MonitorBinding | null;
    physicalStart: number;
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
        })
    ) {
        this.#model = model;
        this.#activeWorkspace = activeWorkspace;
        this.#createAdjustment = createAdjustment;
        this.#beginOn = beginOn;
    }

    bind(display: OverviewWorkspacesDisplay, primaryThumbnails: OverviewThumbnailBox): void {
        if (this.#gesture?.monitor !== null && this.#gesture?.monitor !== undefined) {
            this.#pendingBind = {display, primaryThumbnails};
            this.#unbindRequested = true;
            this.#disconnectGestureSignals(this.#gesture);
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
        this.#bindGesture(display);
    }

    sync(animate = true): void {
        for (const binding of this.#bindings) {
            this.#order(binding);
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
            this.#disconnectGestureSignals(this.#gesture);
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
            const {adjustment, nativeAdjustment, thumbnails, view} = binding;

            adjustment.disconnectObject(view);
            adjustment.disconnectObject(thumbnails);
            view._scrollAdjustment = nativeAdjustment;
            thumbnails._scrollAdjustment = nativeAdjustment;
            view._scrollToActive = binding.viewMethods.scrollToActive;
            view._updateVisibility = binding.viewMethods.updateVisibility;
            view.getActiveWorkspace = binding.viewMethods.getActiveWorkspace;
            thumbnails._updateIndicator = binding.thumbnailMethods.updateIndicator;
            this.#orderPhysical(view._workspaces);
            this.#orderPhysical(thumbnails._thumbnails);
            nativeAdjustment.connectObject(
                'notify::value',
                view._onScrollAdjustmentChanged.bind(view),
                view
            );
            nativeAdjustment.connectObject(
                'notify::value',
                thumbnails._updateIndicator.bind(thumbnails),
                thumbnails
            );
        }

        this.#bindings = [];
    }

    #bindGesture(display: OverviewWorkspacesDisplay): void {
        // Preserve the exact GNOME method so unbinding restores the native Overview object.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const endTouchGesture = display._endTouchGesture;
        const gesture: GestureBinding = {
            adjustmentId: null,
            beginId: null,
            display,
            endTouchGesture,
            endTouchGestureOverride: endTouchGesture,
            endId: null,
            lease: null,
            logicalStart: 0,
            monitor: null,
            physicalStart: 0,
            workspaceStart: 0,
        };
        const endTouchGestureOverride = (): void => {
            try {
                endTouchGesture.call(display);
            } finally {
                this.#finishGesture();
            }
        };
        gesture.endTouchGestureOverride = endTouchGestureOverride;
        display._endTouchGesture = endTouchGestureOverride;
        gesture.beginId = display._swipeTracker.connect('begin', (_tracker, monitor) => {
            this.#finishGesture();
            const binding = this.#bindings.find(candidate => candidate.monitor === monitor);
            if (binding === undefined) {
                return;
            }

            gesture.monitor = binding;
            gesture.physicalStart = display._scrollAdjustment.value;
            gesture.logicalStart = binding.adjustment.value;
            gesture.workspaceStart = this.#activeWorkspace();
            gesture.lease = this.#beginOn(monitor);
        });
        gesture.endId = display._swipeTracker.connect('end', (_tracker, _duration, endProgress) => {
            if (gesture.lease !== null && endProgress !== gesture.workspaceStart) {
                gesture.lease.commit(endProgress);
            }
        });
        gesture.adjustmentId = display._scrollAdjustment.connect('notify::value', () => {
            const binding = gesture.monitor;
            if (binding === null) {
                return;
            }

            const progress =
                gesture.logicalStart + (display._scrollAdjustment.value - gesture.physicalStart);
            const maximum = binding.adjustment.upper - binding.adjustment.page_size;
            binding.adjustment.value = Math.min(
                maximum,
                Math.max(binding.adjustment.lower, progress)
            );
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
        const monitor = view._monitorIndex;
        const nativeAdjustment = view._scrollAdjustment;
        const adjustment = this.#createAdjustment(
            this.#logicalActive(monitor),
            nativeAdjustment,
            view
        );
        const binding: MonitorBinding = {
            adjustment,
            monitor,
            nativeAdjustment,
            thumbnails,
            thumbnailMethods: {updateIndicator: thumbnails._updateIndicator.bind(thumbnails)},
            view,
            viewMethods: {
                getActiveWorkspace: view.getActiveWorkspace.bind(view),
                scrollToActive: view._scrollToActive.bind(view),
                updateVisibility: view._updateVisibility.bind(view),
            },
        };

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

        if (Math.abs(adjustment.value - active) <= POSITION_EPSILON) {
            view._animating = false;
            view._updateVisibility();
            return;
        }

        view._animating = true;
        view._updateVisibility();
        adjustment.remove_transition('value');
        adjustment.ease(active, {
            duration: WORKSPACE_SWITCH_TIME,
            onComplete: () => {
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
