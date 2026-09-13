import {describe, expect, test, vi} from 'vitest';

import {
    PrimaryMonitorAnimationScope,
    type WorkspaceAnimationController,
    type WorkspaceAnimationMonitor,
} from '../../../src/shell/workspace-animation.js';

function monitor(index: number): WorkspaceAnimationMonitor {
    return {
        destroy: vi.fn(),
        index,
    };
}

describe('PrimaryMonitorAnimationScope', () => {
    test('keeps only the primary monitor in the native workspace animation', () => {
        const primary = monitor(0);
        const secondary = monitor(1);
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch() {
                this._switchData = {monitors: [primary, secondary]};
            },
            _switchData: null,
        };
        const originalPrepare = controller._prepareWorkspaceSwitch;
        const scope = new PrimaryMonitorAnimationScope(controller, () => 0);

        scope.run(() => {
            controller._prepareWorkspaceSwitch([0, 1]);
        });

        expect(controller._switchData?.monitors).toEqual([primary]);
        expect(secondary.destroy).toHaveBeenCalledOnce();
        expect(primary.destroy).not.toHaveBeenCalled();
        expect(controller._prepareWorkspaceSwitch).toBe(originalPrepare);
    });

    test('restores the native animation hook when switching throws', () => {
        const controller: WorkspaceAnimationController = {
            _prepareWorkspaceSwitch: vi.fn(),
            _switchData: null,
        };
        const originalPrepare = controller._prepareWorkspaceSwitch;
        const scope = new PrimaryMonitorAnimationScope(controller, () => 0);

        expect(() => {
            scope.run(() => {
                throw new Error('switch failed');
            });
        }).toThrow('switch failed');

        expect(controller._prepareWorkspaceSwitch).toBe(originalPrepare);
    });
});
