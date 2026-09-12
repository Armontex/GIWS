import {describe, expect, test, vi} from 'vitest';

import {
    StockWorkspaceKeybinding,
    StockWorkspaceKeybindings,
    type WorkspaceKeyHandler,
} from '../../../src/shell/keybindings.js';

const handler = vi.fn<WorkspaceKeyHandler>();

describe('StockWorkspaceKeybindings', () => {
    test('overrides the stock horizontal workspace handlers', () => {
        const setHandler = vi.fn();
        const keybindings = new StockWorkspaceKeybindings(
            {setCustomKeybindingHandler: setHandler},
            3,
            handler
        );
        const previous: WorkspaceKeyHandler = handler;
        const next: WorkspaceKeyHandler = handler;

        keybindings.enable(previous, next);

        expect(setHandler.mock.calls).toEqual([
            [StockWorkspaceKeybinding.Left, 3, previous],
            [StockWorkspaceKeybinding.Right, 3, next],
        ]);
    });

    test('restores the native handler exactly once', () => {
        const setHandler = vi.fn();
        const keybindings = new StockWorkspaceKeybindings(
            {setCustomKeybindingHandler: setHandler},
            3,
            handler
        );

        keybindings.enable(handler, handler);
        keybindings.dispose();
        keybindings.dispose();

        expect(setHandler.mock.calls.slice(2)).toEqual([
            [StockWorkspaceKeybinding.Left, 3, handler],
            [StockWorkspaceKeybinding.Right, 3, handler],
        ]);
    });

    test('restores native handlers after partial registration failure', () => {
        const setHandler = vi
            .fn()
            .mockImplementationOnce(() => undefined)
            .mockImplementationOnce(() => {
                throw new Error('registration failed');
            });
        const keybindings = new StockWorkspaceKeybindings(
            {setCustomKeybindingHandler: setHandler},
            3,
            handler
        );

        expect(() => {
            keybindings.enable(handler, handler);
        }).toThrow('registration failed');

        expect(setHandler.mock.calls.slice(2)).toEqual([
            [StockWorkspaceKeybinding.Left, 3, handler],
            [StockWorkspaceKeybinding.Right, 3, handler],
        ]);
    });
});
