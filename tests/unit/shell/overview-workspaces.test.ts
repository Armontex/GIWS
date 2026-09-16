import {describe, expect, test, vi} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {MonitorWorkspaces} from '../../../src/core/monitor-workspaces.js';
import {WorkspaceSwitcher} from '../../../src/core/workspace-switcher.js';
import {
    OverviewWorkspaceAdapter,
    type OverviewAdjustment,
    type OverviewThumbnailBox,
    type OverviewWorkspacesDisplay,
    type OverviewWorkspaceView,
} from '../../../src/shell/overview-workspaces.js';

class FakeAdjustment implements OverviewAdjustment {
    completeEaseImmediately = true;
    easeCalls = 0;
    lower = 0;
    page_increment = 1;
    page_size = 1;
    step_increment = 1;
    upper = 4;
    value: number;
    readonly #callbacks = new Map<object, (() => void)[]>();
    readonly #signalCallbacks = new Map<number, () => void>();
    #nextId = 1;

    constructor(value: number) {
        this.value = value;
    }

    connectObject(_signal: string, callback: () => void, owner: object): void {
        const callbacks = this.#callbacks.get(owner) ?? [];
        callbacks.push(callback);
        this.#callbacks.set(owner, callbacks);
    }

    disconnectObject(owner: object): void {
        this.#callbacks.delete(owner);
    }

    connect(_signal: string, callback: () => void): number {
        const id = this.#nextId;
        this.#nextId += 1;
        this.#signalCallbacks.set(id, callback);
        return id;
    }

    disconnect(id: number): void {
        this.#signalCallbacks.delete(id);
    }

    remove_transition(): void {
        return;
    }

    ease(value: number, options: {onComplete?: () => void}): void {
        this.easeCalls += 1;
        if (!this.completeEaseImmediately) {
            return;
        }

        this.setValue(value);
        options.onComplete?.();
    }

    setValue(value: number): void {
        this.value = value;
        for (const callbacks of this.#callbacks.values()) {
            callbacks.forEach(callback => {
                callback();
            });
        }
        for (const callback of this.#signalCallbacks.values()) {
            callback();
        }
    }
}

class FakeSwipeTracker {
    readonly #beginCallbacks = new Map<
        number,
        (tracker: FakeSwipeTracker, monitor: number) => void
    >();
    readonly #endCallbacks = new Map<
        number,
        (tracker: FakeSwipeTracker, duration: number, endProgress: number) => void
    >();
    #nextId = 1;

    connect(
        signal: 'begin',
        callback: (tracker: FakeSwipeTracker, monitor: number) => void
    ): number;
    connect(
        signal: 'end',
        callback: (tracker: FakeSwipeTracker, duration: number, endProgress: number) => void
    ): number;
    connect(
        signal: 'begin' | 'end',
        callback:
            | ((tracker: FakeSwipeTracker, monitor: number) => void)
            | ((tracker: FakeSwipeTracker, duration: number, endProgress: number) => void)
    ): number {
        const id = this.#nextId;
        this.#nextId += 1;
        if (signal === 'begin') {
            this.#beginCallbacks.set(
                id,
                callback as (tracker: FakeSwipeTracker, monitor: number) => void
            );
        } else {
            this.#endCallbacks.set(id, callback);
        }
        return id;
    }

    disconnect(id: number): void {
        this.#beginCallbacks.delete(id);
        this.#endCallbacks.delete(id);
    }

    begin(monitor: number): void {
        for (const callback of this.#beginCallbacks.values()) {
            callback(this, monitor);
        }
    }

    end(duration: number, endProgress: number): void {
        for (const callback of this.#endCallbacks.values()) {
            callback(this, duration, endProgress);
        }
    }
}

function actors(): {metaWorkspace: {index(): number}; show(): void; visible: boolean}[] {
    return Array.from({length: 4}, (_, index) => ({
        metaWorkspace: {index: () => index},
        show: vi.fn(),
        visible: true,
    }));
}

function view(monitor: number, adjustment: OverviewAdjustment): OverviewWorkspaceView {
    return {
        _animating: false,
        _gestureActive: false,
        _monitorIndex: monitor,
        _scrollAdjustment: adjustment,
        _scrollToActive: vi.fn(),
        _updateVisibility: vi.fn(),
        _updateWorkspacesState: vi.fn(),
        _onScrollAdjustmentChanged: vi.fn(),
        _workspaces: actors(),
        getActiveWorkspace: vi.fn(),
        queue_relayout: vi.fn(),
    };
}

function thumbnails(adjustment: OverviewAdjustment): OverviewThumbnailBox {
    return {
        _animatingIndicator: false,
        _createThumbnails: vi.fn(),
        _destroyThumbnails: vi.fn(),
        _queueUpdateStates: vi.fn(),
        _scrollAdjustment: adjustment,
        _thumbnails: actors(),
        _updateIndicator: vi.fn(),
        queue_relayout: vi.fn(),
    };
}

function display(
    adjustment: OverviewAdjustment,
    views: OverviewWorkspacesDisplay['_workspacesViews'],
    tracker = new FakeSwipeTracker()
): OverviewWorkspacesDisplay {
    return {
        _endTouchGesture: vi.fn(),
        _scrollAdjustment: adjustment,
        _swipeTracker: tracker,
        _workspacesViews: views,
        _updateWorkspacesViews: vi.fn(),
    };
}

describe('OverviewWorkspaceAdapter', () => {
    test('keeps independent logical workspace positions for every monitor', () => {
        const shared = new FakeAdjustment(0);
        const primaryView = view(0, shared);
        const secondaryView = view(1, shared);
        const primaryThumbnails = thumbnails(shared);
        const secondaryThumbnails = thumbnails(shared);
        const model = new MonitorWorkspaces(2, 4);
        let activeWorkspace = 0;
        const localAdjustments: FakeAdjustment[] = [];
        const adapter = new OverviewWorkspaceAdapter(
            model,
            () => activeWorkspace,
            value => {
                const adjustment = new FakeAdjustment(value);
                localAdjustments.push(adjustment);
                return adjustment;
            }
        );

        adapter.bind(
            display(shared, [
                primaryView,
                {
                    _monitorIndex: 1,
                    _thumbnails: secondaryThumbnails,
                    _workspacesView: secondaryView,
                },
            ]),
            primaryThumbnails
        );

        activeWorkspace = 1;
        model.completeSwitch(asMonitorIndex(0), 0, 1);
        adapter.sync();

        expect(primaryView._scrollAdjustment.value).toBe(1);
        expect(secondaryView._scrollAdjustment.value).toBe(0);
        primaryView._scrollToActive();
        secondaryView._scrollToActive();
        expect(localAdjustments.map(adjustment => adjustment.easeCalls)).toEqual([1, 0]);
        expect(secondaryView._workspaces.map(actor => actor.metaWorkspace.index())).toEqual([
            1, 2, 3, 0,
        ]);
        expect(secondaryThumbnails._thumbnails.map(actor => actor.metaWorkspace.index())).toEqual([
            1, 2, 3, 0,
        ]);
    });

    test('does not restart an in-flight transition to the same workspace', () => {
        const shared = new FakeAdjustment(0);
        const primaryView = view(0, shared);
        const primaryThumbnails = thumbnails(shared);
        const model = new MonitorWorkspaces(1, 4);
        let activeWorkspace = 0;
        let localAdjustment: FakeAdjustment | undefined;
        const adapter = new OverviewWorkspaceAdapter(
            model,
            () => activeWorkspace,
            value => {
                localAdjustment = new FakeAdjustment(value);
                localAdjustment.completeEaseImmediately = false;
                return localAdjustment;
            }
        );

        adapter.bind(display(shared, [primaryView]), primaryThumbnails);
        activeWorkspace = 1;
        model.completeSwitch(asMonitorIndex(0), 0, 1);

        adapter.sync();
        primaryView._scrollToActive();

        expect(localAdjustment?.easeCalls).toBe(1);
    });

    test('settles window preview scale transitions after workspace compensation', () => {
        const shared = new FakeAdjustment(0);
        const primaryView = view(0, shared);
        const primaryThumbnails = thumbnails(shared);
        const preview = {
            get_transition: vi.fn(() => ({})),
            remove_transition: vi.fn(),
            scale_x: 0,
            scale_y: 0,
            set_pivot_point: vi.fn(),
        };
        const model = new MonitorWorkspaces(1, 4);
        let activeWorkspace = 0;
        const adapter = new OverviewWorkspaceAdapter(
            model,
            () => activeWorkspace,
            value => new FakeAdjustment(value)
        );

        adapter.bind(display(shared, [primaryView]), primaryThumbnails);
        const compensatedWorkspace = primaryView._workspaces.at(1);
        if (compensatedWorkspace === undefined) {
            throw new Error('Missing compensated workspace fixture');
        }
        Object.assign(compensatedWorkspace, {_windows: [preview]});
        activeWorkspace = 1;
        model.completeSwitch(asMonitorIndex(0), 0, 1);
        adapter.sync();

        expect(preview.remove_transition.mock.calls).toEqual([['scale-x'], ['scale-y']]);
        expect([preview.scale_x, preview.scale_y]).toEqual([1, 1]);
        expect(preview.set_pivot_point).toHaveBeenCalledWith(0, 0);
    });

    test('restores native adjustments and physical ordering when unbound', () => {
        const shared = new FakeAdjustment(0);
        const primaryView = view(0, shared);
        const secondaryView = view(1, shared);
        const primaryThumbnails = thumbnails(shared);
        const secondaryThumbnails = thumbnails(shared);
        const model = new MonitorWorkspaces(2, 4);
        const adapter = new OverviewWorkspaceAdapter(
            model,
            () => 1,
            value => {
                return new FakeAdjustment(value);
            }
        );

        model.completeSwitch(asMonitorIndex(0), 0, 1);
        adapter.bind(
            display(shared, [
                primaryView,
                {
                    _monitorIndex: 1,
                    _thumbnails: secondaryThumbnails,
                    _workspacesView: secondaryView,
                },
            ]),
            primaryThumbnails
        );
        adapter.unbind();

        expect(primaryView._scrollAdjustment).toBe(shared);
        expect(secondaryView._scrollAdjustment).toBe(shared);
        expect(secondaryView._workspaces.map(actor => actor.metaWorkspace.index())).toEqual([
            0, 1, 2, 3,
        ]);
        expect(secondaryThumbnails._thumbnails.map(actor => actor.metaWorkspace.index())).toEqual([
            0, 1, 2, 3,
        ]);
    });

    test('routes touchpad progress only to the monitor where the gesture began', () => {
        const shared = new FakeAdjustment(0);
        const tracker = new FakeSwipeTracker();
        const primaryView = view(0, shared);
        const secondaryView = view(1, shared);
        const primaryThumbnails = thumbnails(shared);
        const secondaryThumbnails = thumbnails(shared);
        const finishTarget = vi.fn();
        const beginTarget = vi.fn(() => ({commit: vi.fn(), finish: finishTarget}));
        const adapter = new OverviewWorkspaceAdapter(
            new MonitorWorkspaces(2, 4),
            () => 0,
            value => new FakeAdjustment(value),
            beginTarget
        );
        const overview = display(
            shared,
            [
                primaryView,
                {
                    _monitorIndex: 1,
                    _thumbnails: secondaryThumbnails,
                    _workspacesView: secondaryView,
                },
            ],
            tracker
        );

        adapter.bind(overview, primaryThumbnails);
        tracker.begin(1);
        shared.setValue(0.5);

        expect(beginTarget).toHaveBeenCalledWith(1);
        expect(primaryView._scrollAdjustment.value).toBe(0);
        expect(secondaryView._scrollAdjustment.value).toBe(0.5);

        adapter.unbind();
        expect(finishTarget).not.toHaveBeenCalled();
        expect(secondaryView._scrollAdjustment).toBe(shared);

        overview._endTouchGesture();
        expect(finishTarget).toHaveBeenCalledOnce();
        expect(secondaryView._scrollAdjustment).toBe(shared);
    });

    test('keeps the Overview gesture target through delayed workspace activation', () => {
        const shared = new FakeAdjustment(0);
        const tracker = new FakeSwipeTracker();
        const primaryView = view(0, shared);
        const secondaryView = view(1, shared);
        let activeWorkspace = 0;
        const apply = vi.fn();
        const switcher = new WorkspaceSwitcher({
            activeMonitor: () => asMonitorIndex(0),
            activeWorkspace: () => activeWorkspace,
            apply,
            monitorCount: () => 2,
            windowPlacements: () => [
                {id: 'primary', monitor: asMonitorIndex(0), workspace: 0},
                {id: 'secondary', monitor: asMonitorIndex(1), workspace: 0},
            ],
            workspaceCount: () => 4,
        });
        const overview = display(
            shared,
            [
                primaryView,
                {
                    _monitorIndex: 1,
                    _thumbnails: thumbnails(shared),
                    _workspacesView: secondaryView,
                },
            ],
            tracker
        );
        const adapter = new OverviewWorkspaceAdapter(
            switcher.workspaces,
            () => activeWorkspace,
            value => new FakeAdjustment(value),
            monitor => switcher.beginGestureOn(asMonitorIndex(monitor))
        );

        adapter.bind(overview, thumbnails(shared));
        tracker.begin(1);
        tracker.end(250, 1);
        overview._endTouchGesture();
        activeWorkspace = 1;
        switcher.workspaceChanged();

        expect(apply.mock.calls).toEqual([[[{id: 'primary', workspace: 1}]]]);
    });
});
