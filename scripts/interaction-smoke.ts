import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import type Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};
const shellGlobal = global as unknown as Shell.Global;

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function normalWindows(): Meta.Window[] {
    return shellGlobal
        .get_window_actors()
        .map(actor => actor.meta_window)
        .filter(
            (window): window is Meta.Window =>
                window !== null && window.get_window_type() === Meta.WindowType.NORMAL
        );
}

async function createWindow(): Promise<Meta.Window> {
    const before = new Set(normalWindows());

    await Scripting.createTestWindow({width: 320, height: 240});
    await Scripting.waitTestWindows();
    await Scripting.waitLeisure();

    const created = normalWindows().find(window => !before.has(window));
    assert(created !== undefined, 'test window was not created');
    return created;
}

function workspaceOf(window: Meta.Window): number {
    return window.get_workspace().index();
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (predicate()) {
            return;
        }
        await Scripting.sleep(50);
    }

    throw new Error(message);
}

function sendWorkspaceRight(device: Clutter.VirtualInputDevice): void {
    const time = Clutter.get_current_event_time() * 1000;

    device.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    device.notify_keyval(time, Clutter.KEY_Alt_L, Clutter.KeyState.PRESSED);
    device.notify_keyval(time, Clutter.KEY_Right, Clutter.KeyState.PRESSED);
    device.notify_keyval(time, Clutter.KEY_Right, Clutter.KeyState.RELEASED);
    device.notify_keyval(time, Clutter.KEY_Alt_L, Clutter.KeyState.RELEASED);
    device.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
}

export async function run(): Promise<void> {
    await Scripting.sleep(1000);
    assert(shellGlobal.display.get_n_monitors() === 2, 'expected two monitors');
    assert(shellGlobal.workspace_manager.get_n_workspaces() === 4, 'expected four workspaces');

    const primary = await createWindow();
    primary.move_to_monitor(0);
    const secondaryCurrent = await createWindow();
    secondaryCurrent.move_to_monitor(1);
    const secondaryNext = await createWindow();
    secondaryNext.move_to_monitor(1);
    secondaryNext.change_workspace_by_index(1, false);

    await waitUntil(
        () =>
            primary.get_monitor() === 0 &&
            secondaryCurrent.get_monitor() === 1 &&
            secondaryNext.get_monitor() === 1 &&
            workspaceOf(secondaryNext) === 1,
        'test windows did not reach their initial placement'
    );

    const seat = Clutter.get_default_backend().get_default_seat();
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const primaryMonitor = Main.layoutManager.monitors[0];
    const secondaryMonitor = Main.layoutManager.monitors[1];
    assert(primaryMonitor !== undefined, 'primary monitor is unavailable');
    assert(secondaryMonitor !== undefined, 'secondary monitor is unavailable');

    pointer.notify_absolute_motion(
        Clutter.get_current_event_time() * 1000,
        secondaryMonitor.x + secondaryMonitor.width / 2,
        secondaryMonitor.y + secondaryMonitor.height / 2
    );
    await waitUntil(
        () => shellGlobal.display.get_current_monitor() === 1,
        'pointer did not select secondary monitor'
    );

    sendWorkspaceRight(keyboard);
    await waitUntil(
        () => workspaceOf(secondaryCurrent) === 3 && workspaceOf(secondaryNext) === 0,
        'secondary switch did not rotate its windows'
    );
    assert(
        shellGlobal.workspace_manager.get_active_workspace_index() === 0,
        'secondary switch changed global workspace'
    );
    assert(workspaceOf(primary) === 0, 'secondary switch moved primary window');

    pointer.notify_absolute_motion(
        Clutter.get_current_event_time() * 1000,
        primaryMonitor.x + primaryMonitor.width / 2,
        primaryMonitor.y + primaryMonitor.height / 2
    );
    await waitUntil(
        () => shellGlobal.display.get_current_monitor() === 0,
        'pointer did not select primary monitor'
    );

    sendWorkspaceRight(keyboard);
    await waitUntil(
        () =>
            shellGlobal.workspace_manager.get_active_workspace_index() === 1 &&
            workspaceOf(secondaryCurrent) === 0 &&
            workspaceOf(secondaryNext) === 1,
        'primary switch did not compensate secondary windows'
    );
    assert(workspaceOf(primary) === 0, 'primary switch moved primary window');

    await Scripting.waitLeisure();
    await Scripting.destroyTestWindows();
    print('interaction smoke passed: shortcuts and window placement');
}
