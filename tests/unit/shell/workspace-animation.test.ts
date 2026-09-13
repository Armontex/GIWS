import {describe, expect, test, vi} from 'vitest';

import {
    TargetMonitorAnimationScope,
    type WorkspaceAnimationController,
    type WorkspaceAnimationMonitor,
} from '../../../src/shell/workspace-animation.js';

function monitor(index: number): WorkspaceAnimationMonitor {
    return {
        destroy: vi.fn(),
        index,
        opacity: 255,
    };
}

describe('TargetMonitorAnimationScope', () => {
    test('makes only the requested monitor visible in the native workspace animation', () => {
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
        const scope = new TargetMonitorAnimationScope(controller);

        scope.run(1, () => {
            controller._prepareWorkspaceSwitch([0, 1]);
        });

        expect(controller._switchData?.monitors).toEqual([primary, secondary, tertiary]);
        expect(primary.opacity).toBe(0);
        expect(secondary.opacity).toBe(255);
        expect(tertiary.opacity).toBe(0);
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
        const scope = new TargetMonitorAnimationScope(controller);

        scope.run(1, () => {
            controller._prepareWorkspaceSwitch([0, 1]);
        });
        scope.run(0, () => {
            controller._prepareWorkspaceSwitch([1, 0]);
        });

        expect(controller._switchData?.monitors).toEqual([primary, secondary]);
        expect(primary.opacity).toBe(255);
        expect(secondary.opacity).toBe(0);
        expect(primary.destroy).not.toHaveBeenCalled();
        expect(secondary.destroy).not.toHaveBeenCalled();
    });

    test('restores the native animation hook when switching throws', () => {
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch: vi.fn(),
            _switchData: null,
        };
        const originalPrepare = controller._prepareWorkspaceSwitch;
        const scope = new TargetMonitorAnimationScope(controller);

        expect(() => {
            scope.run(0, () => {
                throw new Error('switch failed');
            });
        }).toThrow('switch failed');

        expect(controller._prepareWorkspaceSwitch).toBe(originalPrepare);
    });
});
