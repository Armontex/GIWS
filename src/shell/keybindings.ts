import type Meta from 'gi://Meta';

export type WorkspaceKeyHandler = Meta.KeyHandlerFunc;

export const StockWorkspaceKeybinding = {
    Left: 'switch-to-workspace-left',
    Right: 'switch-to-workspace-right',
} as const;

export interface KeybindingRegistry {
    setCustomKeybindingHandler(name: string, modes: number, handler: WorkspaceKeyHandler): void;
}

export class StockWorkspaceKeybindings {
    readonly #registry: KeybindingRegistry;
    readonly #modes: number;
    readonly #nativeHandler: WorkspaceKeyHandler;
    #enabled = false;

    constructor(registry: KeybindingRegistry, modes: number, nativeHandler: WorkspaceKeyHandler) {
        this.#registry = registry;
        this.#modes = modes;
        this.#nativeHandler = nativeHandler;
    }

    enable(previous: WorkspaceKeyHandler, next: WorkspaceKeyHandler): void {
        if (this.#enabled) {
            return;
        }

        this.#enabled = true;

        try {
            this.#registry.setCustomKeybindingHandler(
                StockWorkspaceKeybinding.Left,
                this.#modes,
                previous
            );
            this.#registry.setCustomKeybindingHandler(
                StockWorkspaceKeybinding.Right,
                this.#modes,
                next
            );
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    dispose(): void {
        if (!this.#enabled) {
            return;
        }

        this.#registry.setCustomKeybindingHandler(
            StockWorkspaceKeybinding.Left,
            this.#modes,
            this.#nativeHandler
        );
        this.#registry.setCustomKeybindingHandler(
            StockWorkspaceKeybinding.Right,
            this.#modes,
            this.#nativeHandler
        );
        this.#enabled = false;
    }
}
