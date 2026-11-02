import {describe, expect, test, vi} from 'vitest';

import {retargetWorkspacePopup} from '../../../src/shell/workspace-popup.js';

describe('retargetWorkspacePopup', () => {
    test('moves the native workspace popup to the monitor and its logical workspace', () => {
        const constraint = {index: -1};
        const display = vi.fn();
        const popup = {display, get_constraints: () => [constraint]};

        expect(retargetWorkspacePopup(popup, 1, 2)).toBe(true);
        expect(constraint.index).toBe(1);
        expect(display).toHaveBeenCalledWith(2);
    });

    test('leaves an unavailable popup untouched', () => {
        const display = vi.fn();

        expect(retargetWorkspacePopup(null, 1, 0)).toBe(false);
        expect(retargetWorkspacePopup({display, get_constraints: () => []}, 1, 0)).toBe(false);
        expect(display).not.toHaveBeenCalled();
    });
});
