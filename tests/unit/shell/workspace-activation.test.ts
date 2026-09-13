import {describe, expect, test, vi} from 'vitest';

import {WorkspaceActivationRouter} from '../../../src/shell/workspace-activation.js';

describe('WorkspaceActivationRouter', () => {
    test('routes app activation through its most recent window monitor', () => {
        const runOnMonitor = vi.fn((_monitor: number, activate: () => void) => {
            activate();
        });
        const activate = vi.fn();
        const router = new WorkspaceActivationRouter(runOnMonitor);

        router.activateApp({get_windows: () => [{get_monitor: () => 1}]}, activate);

        expect(runOnMonitor).toHaveBeenCalledWith(1, activate);
        expect(activate).toHaveBeenCalledOnce();
    });

    test('routes explicit window activation through that window monitor', () => {
        const monitors: number[] = [];
        const router = new WorkspaceActivationRouter((monitor, activate) => {
            monitors.push(monitor);
            activate();
        });
        const activate = vi.fn();

        router.activateWindow({get_monitor: () => 2}, activate);

        expect(monitors).toEqual([2]);
        expect(activate).toHaveBeenCalledOnce();
    });

    test('preserves activation when an app has no existing window', () => {
        const runOnMonitor = vi.fn();
        const activate = vi.fn();
        const router = new WorkspaceActivationRouter(runOnMonitor);

        router.activateApp({get_windows: () => []}, activate);

        expect(runOnMonitor).not.toHaveBeenCalled();
        expect(activate).toHaveBeenCalledOnce();
    });

    test('preserves explicit activation when no focus window is provided', () => {
        const runOnMonitor = vi.fn();
        const activate = vi.fn();
        const router = new WorkspaceActivationRouter(runOnMonitor);

        router.activateWindow(null, activate);

        expect(runOnMonitor).not.toHaveBeenCalled();
        expect(activate).toHaveBeenCalledOnce();
    });
});
