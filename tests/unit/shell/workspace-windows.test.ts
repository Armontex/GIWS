import {describe, expect, test, vi} from 'vitest';

import {
    applyWindowMoves,
    getWindowPlacements,
    type ShellWindow,
    type WorkspaceProvider,
} from '../../../src/shell/workspace-windows.js';

const normalWindowType = 0;

function shellWindow(
    options: {
        monitor?: number;
        sticky?: boolean;
        type?: number;
    } = {}
): ShellWindow {
    return {
        change_workspace_by_index: vi.fn(),
        get_monitor: () => options.monitor ?? 0,
        get_window_type: () => options.type ?? normalWindowType,
        is_on_all_workspaces: () => options.sticky ?? false,
    };
}

function workspaces(...windows: ShellWindow[][]): WorkspaceProvider {
    return {
        get_n_workspaces: () => windows.length,
        get_workspace_by_index: index => ({list_windows: () => windows[index] ?? []}),
    };
}

describe('getWindowPlacements', () => {
    test('collects each movable normal window exactly once', () => {
        const normal = shellWindow({monitor: 1});
        const sticky = shellWindow({sticky: true});
        const dialog = shellWindow({type: 3});
        const provider = workspaces([normal, sticky, dialog], [normal]);

        expect(getWindowPlacements(provider, normalWindowType)).toEqual([
            {id: normal, monitor: 1, workspace: 0},
        ]);
    });
});

describe('applyWindowMoves', () => {
    test('moves every planned window without activating a global workspace', () => {
        const firstMove = vi.fn<(index: number, append: boolean) => void>();
        const secondMove = vi.fn<(index: number, append: boolean) => void>();
        const first = {...shellWindow(), change_workspace_by_index: firstMove};
        const second = {...shellWindow(), change_workspace_by_index: secondMove};

        applyWindowMoves([
            {id: first, workspace: 3},
            {id: second, workspace: 0},
        ]);

        expect(firstMove.mock.calls).toEqual([[3, false]]);
        expect(secondMove.mock.calls).toEqual([[0, false]]);
    });
});
