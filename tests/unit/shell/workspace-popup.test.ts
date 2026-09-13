import {describe, expect, test} from 'vitest';

import {retargetWorkspacePopup} from '../../../src/shell/workspace-popup.js';

describe('retargetWorkspacePopup', () => {
    test('moves the native workspace popup constraint to the requested monitor', () => {
        const constraint = {index: -1};
        const popup = {get_constraints: () => [constraint]};

        expect(retargetWorkspacePopup(popup, 1)).toBe(true);
        expect(constraint.index).toBe(1);
    });

    test('leaves an unavailable popup untouched', () => {
        expect(retargetWorkspacePopup(null, 1)).toBe(false);
        expect(retargetWorkspacePopup({get_constraints: () => []}, 1)).toBe(false);
    });
});
