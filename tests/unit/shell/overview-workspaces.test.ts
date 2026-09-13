import {describe, expect, test, vi} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {MonitorWorkspaces} from '../../../src/core/monitor-workspaces.js';
import {
    OverviewWorkspaceAdapter,
    type OverviewAdjustment,
    type OverviewThumbnailBox,
    type OverviewWorkspacesDisplay,
    type OverviewWorkspaceView,
} from '../../../src/shell/overview-workspaces.js';

class FakeAdjustment implements OverviewAdjustment {
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
    readonly #callbacks = new Map<number, (tracker: FakeSwipeTracker, monitor: number) => void>();
    #nextId = 1;

    connect(
        _signal: string,
        callback: (tracker: FakeSwipeTracker, monitor: number) => void
    ): number {
        const id = this.#nextId;
        this.#nextId += 1;
        this.#callbacks.set(id, callback);
        return id;
    }

    disconnect(id: number): void {
        this.#callbacks.delete(id);
    }

    begin(monitor: number): void {
        for (const callback of this.#callbacks.values()) {
            callback(this, monitor);
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
        const adapter = new OverviewWorkspaceAdapter(
            model,
            () => activeWorkspace,
            value => new FakeAdjustment(value)
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
        expect(secondaryView._workspaces.map(actor => actor.metaWorkspace.index())).toEqual([
            1, 2, 3, 0,
        ]);
        expect(secondaryThumbnails._thumbnails.map(actor => actor.metaWorkspace.index())).toEqual([
            1, 2, 3, 0,
        ]);
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
        const beginTarget = vi.fn(() => finishTarget);
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
});
