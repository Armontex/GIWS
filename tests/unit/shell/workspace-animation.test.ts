import {describe, expect, test, vi} from 'vitest';

import {asMonitorIndex} from '../../../src/core/monitor.js';
import {WorkspaceSwitcher} from '../../../src/core/workspace-switcher.js';
import {
    WorkspaceGestureAnimationRouter,
    TargetMonitorAnimationScope,
    type WorkspaceAnimationController,
    type WorkspaceAnimationMonitor,
    type WorkspaceOrder,
} from '../../../src/shell/workspace-animation.js';

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

interface FakeWorkspaceAnimationMonitor extends WorkspaceAnimationMonitor {
    readonly _container: {x: number; y: number};
    progress: number;
}

const physicalOrder: WorkspaceOrder = {
    activeMonitor: () => 0,
    primaryMonitor: () => 0,
    toLogical: (_monitor, workspace) => workspace,
    workspaceCount: () => 4,
};

function baseMonitorGroup(): {findClosestWorkspace(progress: number): {index(): number}} {
    return {findClosestWorkspace: progress => ({index: () => progress})};
}

function monitor(index: number): FakeWorkspaceAnimationMonitor {
    const callbacks = new Map<number, () => void>();
    const container = {x: 0, y: 0};
    let nextId = 1;
    let progress = 0;

    return {
        _container: container,
        _workspaceGroups: [],
        connect(_signal: 'notify::progress', callback: () => void): number {
            const id = nextId;
            nextId += 1;
            callbacks.set(id, callback);
            return id;
        },
        disconnect(id: number): void {
            callbacks.delete(id);
        },
        destroy: vi.fn(),
        index,
        opacity: 255,
        get progress(): number {
            return progress;
        },
        set progress(value: number) {
            progress = value;
            container.y = -value * 100;
            callbacks.forEach(callback => {
                callback();
            });
        },
    };
}

describe('TargetMonitorAnimationScope', () => {
    test('keeps inactive monitors visible and stationary during the native animation', () => {
        const primary = monitor(0);
        const secondary = monitor(1);
        const tertiary = monitor(2);
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch() {
                this._switchData = {monitors: [primary, secondary, tertiary]};
            },
            _switchData: null,
        };
        const originalPrepare = controller._prepareWorkspaceSwitch;
        const scope = new TargetMonitorAnimationScope(controller, physicalOrder);

        scope.run(1, () => {
            controller._prepareWorkspaceSwitch([0, 1]);
        });
        primary.progress = 1;
        secondary.progress = 1;
        tertiary.progress = 1;

        expect(controller._switchData?.monitors).toEqual([primary, secondary, tertiary]);
        expect(primary.opacity).toBe(255);
        expect(secondary.opacity).toBe(255);
        expect(tertiary.opacity).toBe(255);
        expect(primary._container.y).toBe(0);
        expect(secondary._container.y).toBe(-100);
        expect(tertiary._container.y).toBe(0);
        expect(primary.destroy).not.toHaveBeenCalled();
        expect(secondary.destroy).not.toHaveBeenCalled();
        expect(tertiary.destroy).not.toHaveBeenCalled();
        expect(controller._prepareWorkspaceSwitch).toBe(originalPrepare);
    });

    test('retargets an in-progress animation without losing monitor groups', () => {
        const primary = monitor(0);
        const secondary = monitor(1);
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch() {
                this._switchData ??= {monitors: [primary, secondary]};
            },
            _switchData: null,
        };
        const scope = new TargetMonitorAnimationScope(controller, physicalOrder);

        scope.run(1, () => {
            controller._prepareWorkspaceSwitch([0, 1]);
        });
        scope.run(0, () => {
            controller._prepareWorkspaceSwitch([1, 0]);
        });
        primary.progress = 1;
        secondary.progress = 1;

        expect(controller._switchData?.monitors).toEqual([primary, secondary]);
        expect(primary.opacity).toBe(255);
        expect(secondary.opacity).toBe(255);
        expect(primary._container.y).toBe(-100);
        expect(secondary._container.y).toBe(0);
        expect(primary.destroy).not.toHaveBeenCalled();
        expect(secondary.destroy).not.toHaveBeenCalled();
    });

    test('retargets monitor groups already prepared by a touchpad gesture', () => {
        const primary = monitor(0);
        const secondary = monitor(1);
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch: vi.fn(),
            _switchData: {monitors: [primary, secondary]},
        };
        const scope = new TargetMonitorAnimationScope(controller, physicalOrder);

        scope.show(1);
        primary.progress = 1;
        secondary.progress = 1;

        expect(primary.opacity).toBe(255);
        expect(secondary.opacity).toBe(255);
        expect(primary._container.y).toBe(0);
        expect(secondary._container.y).toBe(-100);
    });

    test('restores the native animation hook when switching throws', () => {
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch: vi.fn(),
            _switchData: null,
        };
        const originalPrepare = controller._prepareWorkspaceSwitch;
        const scope = new TargetMonitorAnimationScope(controller, physicalOrder);

        expect(() => {
            scope.run(0, () => {
                throw new Error('switch failed');
            });
        }).toThrow('switch failed');

        expect(controller._prepareWorkspaceSwitch).toBe(originalPrepare);
    });
});

describe('TargetMonitorAnimationScope workspace order', () => {
    // Monitor 1 shows physical workspace 2 as its logical first workspace.
    const rotatedOrder: WorkspaceOrder = {
        activeMonitor: () => 1,
        primaryMonitor: () => 0,
        toLogical: (monitorIndex, workspace) =>
            monitorIndex === 1 ? (workspace + 2) % 4 : workspace,
        workspaceCount: () => 4,
    };

    function recordingController(): WorkspaceAnimationController & {
        prepared: (readonly number[] | undefined)[];
    } {
        const prepared: (readonly number[] | undefined)[] = [];
        return {
            prepared,
            _prepareWorkspaceSwitch(workspaceIndices) {
                prepared.push(workspaceIndices);
                this._switchData ??= {monitors: []};
            },
            _switchData: null,
        };
    }

    test('lays a swipe out in the logical order of the monitor under the pointer', () => {
        const controller = recordingController();
        const scope = new TargetMonitorAnimationScope(controller, rotatedOrder);

        scope.enable();
        controller._prepareWorkspaceSwitch();

        expect(controller.prepared).toEqual([[2, 3, 0, 1]]);
    });

    test('animates a shortcut along the logical order of its target monitor', () => {
        const controller = recordingController();
        const scope = new TargetMonitorAnimationScope(controller, rotatedOrder);

        scope.enable();
        scope.run(1, () => {
            // GNOME sees physical 3 -> 0 as a move to the left and orders them [0, 3].
            controller._prepareWorkspaceSwitch([0, 3]);
        });

        expect(controller.prepared).toEqual([[3, 0]]);
    });

    test('keeps the primary monitor last so an instant finish cannot outrun the others', () => {
        const groups = [monitor(0), monitor(1), monitor(2)];
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch() {
                this._switchData = {monitors: [...groups]};
            },
            _switchData: null,
        };
        const scope = new TargetMonitorAnimationScope(controller, physicalOrder);

        scope.enable();
        controller._prepareWorkspaceSwitch();

        expect(controller._switchData?.monitors.map(group => group.index)).toEqual([1, 2, 0]);
    });

    test('ignores windows that reach a workspace after its animation group was built', () => {
        const animated = {get_compositor_private: () => 'animated-actor'};
        const compensated = {get_compositor_private: () => 'compensated-actor'};
        const group = {
            _shouldShowWindow: vi.fn<(window: unknown) => boolean>(() => true),
            _windowRecords: [{windowActor: 'animated-actor'}],
        };
        const animatedMonitor = Object.assign(monitor(0), {_workspaceGroups: [group]});
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch() {
                this._switchData = {monitors: [animatedMonitor]};
            },
            _switchData: null,
        };
        const scope = new TargetMonitorAnimationScope(controller, physicalOrder);

        scope.enable();
        controller._prepareWorkspaceSwitch();

        expect(group._shouldShowWindow(animated)).toBe(true);
        expect(group._shouldShowWindow(compensated)).toBe(false);
    });

    test('restores the native hook when disposed', () => {
        const controller = recordingController();
        const nativePrepare = controller._prepareWorkspaceSwitch;
        const scope = new TargetMonitorAnimationScope(controller, physicalOrder);

        scope.enable();
        expect(controller._prepareWorkspaceSwitch).not.toBe(nativePrepare);
        scope.dispose();

        expect(controller._prepareWorkspaceSwitch).toBe(nativePrepare);
    });
});

describe('WorkspaceGestureAnimationRouter', () => {
    test('commits the physical workspace behind a logical swipe target', () => {
        const tracker = new FakeSwipeTracker();
        const commit = vi.fn();
        const controller = {
            _finishWorkspaceSwitch: vi.fn(),
            _prepareWorkspaceSwitch: vi.fn(),
            _swipeTracker: tracker,
            _switchData: {
                baseMonitorGroup: {
                    findClosestWorkspace: (progress: number) => ({
                        index: () => (progress + 2) % 4,
                    }),
                },
                monitors: [monitor(0), monitor(1)],
            },
        };
        const router = new WorkspaceGestureAnimationRouter(
            controller,
            new TargetMonitorAnimationScope(controller, physicalOrder),
            () => ({commit, finish: vi.fn()}),
            () => 2
        );

        router.bind();
        tracker.begin(1);
        tracker.end(250, 3);

        expect(commit).toHaveBeenCalledWith(1);

        router.dispose();
    });

    test('keeps the gesture monitor selected until delayed workspace activation', () => {
        const primary = monitor(0);
        const secondary = monitor(1);
        const tracker = new FakeSwipeTracker();
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
        const controller = {
            _finishWorkspaceSwitch: vi.fn(),
            _prepareWorkspaceSwitch: vi.fn(),
            _swipeTracker: tracker,
            _switchData: {baseMonitorGroup: baseMonitorGroup(), monitors: [primary, secondary]},
        };
        const router = new WorkspaceGestureAnimationRouter(
            controller,
            new TargetMonitorAnimationScope(controller, physicalOrder),
            monitorIndex => switcher.beginGestureOn(asMonitorIndex(monitorIndex)),
            () => activeWorkspace
        );

        router.bind();
        tracker.begin(1);

        expect(primary.opacity).toBe(255);
        expect(secondary.opacity).toBe(255);

        tracker.end(250, 1);
        controller._finishWorkspaceSwitch(controller._switchData);
        activeWorkspace = 1;
        switcher.workspaceChanged();

        expect(apply.mock.calls).toEqual([[[{id: 'primary', workspace: 1}]]]);

        router.dispose();
    });

    test('releases the gesture monitor when the swipe returns to its starting workspace', () => {
        const tracker = new FakeSwipeTracker();
        const finishTarget = vi.fn();
        const controller = {
            _finishWorkspaceSwitch: vi.fn(),
            _prepareWorkspaceSwitch: vi.fn(),
            _swipeTracker: tracker,
            _switchData: {baseMonitorGroup: baseMonitorGroup(), monitors: [monitor(0), monitor(1)]},
        };
        const router = new WorkspaceGestureAnimationRouter(
            controller,
            new TargetMonitorAnimationScope(controller, physicalOrder),
            () => ({commit: vi.fn(), finish: finishTarget}),
            () => 0
        );

        router.bind();
        tracker.begin(1);
        tracker.end(250, 0);
        controller._finishWorkspaceSwitch(controller._switchData);

        expect(finishTarget).toHaveBeenCalledOnce();

        router.dispose();
    });
});
