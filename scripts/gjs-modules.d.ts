declare module 'resource:///org/gnome/shell/ui/scripting.js' {
    export function createTestWindow(parameters: {height?: number; width?: number}): Promise<void>;
    export function destroyTestWindows(): Promise<void>;
    export function sleep(milliseconds: number): Promise<void>;
    export function waitLeisure(): Promise<void>;
    export function waitTestWindows(): Promise<void>;
}
