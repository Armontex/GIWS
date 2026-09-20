import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import type Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};

// GNOME switches a workspace in 250 ms, and a headless shell renders about
// three frames a second: at native speed the slide would be a single frame,
// which reads as a jump rather than a movement. The motion stays GNOME's own,
// it is only stretched far enough for the recording to catch it.
// `ExtensionState` from the shell's own module is not reachable from an
// automation script, and the two values it needs have been stable for years.
const DISABLED = 2;
const ENABLED = 1;
const EXTENSION_UUID = 'giws@armontex';
// Below the monitor badge, above the caption: the overlays carry the
// explanation, and a window centred by GNOME would sit on top of both.
const WINDOW_TOP = 104;
const SLOW_DOWN_FACTOR = 8;
const shellGlobal = global as unknown as Shell.Global;

interface CapturedFrame {
    name: string;
    time: number;
}

interface Recording {
    frames: CapturedFrame[];
    index: number;
    running: boolean;
}

interface OverviewFacade {
    hide: () => void;
    readonly visible: boolean;
}

interface ShellMainFacade {
    readonly overview: OverviewFacade;
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function frameDirectory(): string {
    const directory = GLib.getenv('GIWS_DEMO_FRAMES');
    assert(directory !== null, 'GIWS_DEMO_FRAMES is not configured');
    return directory;
}

// `@girs/gnome-shell` carries its own copy of `@girs/gio-2.0`, so the stream
// built from the top-level Gio is a structurally identical but nominally
// different type at the Shell boundary. The cast crosses that seam alone.
type ScreenshotStream = Parameters<Shell.Screenshot['screenshot']>[1];

function captureFrame(shooter: Shell.Screenshot, stream: Gio.OutputStream): Promise<void> {
    return new Promise((resolve, reject) => {
        shooter.screenshot(false, stream as unknown as ScreenshotStream, (source, result) => {
            try {
                assert(source !== null, 'screenshot reported no source');
                source.screenshot_finish(result);
                resolve();
            } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    });
}

// The loop runs alongside the scenario: every `await` hands the main loop back
// to GNOME, so the animation it records keeps advancing while a frame encodes.
async function record(recording: Recording, directory: string): Promise<void> {
    const shooter = new Shell.Screenshot();

    while (recording.running) {
        const name = `frame-${String(recording.index).padStart(5, '0')}.png`;
        const file = Gio.File.new_for_path(GLib.build_filenamev([directory, name]));
        const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);

        await captureFrame(shooter, stream);
        stream.close(null);
        recording.frames.push({name, time: GLib.get_monotonic_time()});
        recording.index += 1;
    }
}

function writeManifest(recording: Recording, directory: string): void {
    const manifest = JSON.stringify({frames: recording.frames}, null, 4);
    const path = GLib.build_filenamev([directory, 'frames.json']);

    GLib.file_set_contents(path, manifest);
}

function badgeStyle(): string {
    return [
        'font-size: 30px',
        'font-weight: 700',
        'color: #ffffff',
        'background-color: rgba(36, 31, 49, 0.88)',
        'border: 3px solid rgba(53, 132, 228, 0.0)',
        'border-radius: 16px',
        'padding: 12px 24px',
    ].join('; ');
}

function activeBadgeStyle(): string {
    return badgeStyle().replace('rgba(53, 132, 228, 0.0)', '#3584E4');
}

function captionStyle(): string {
    return [
        'font-size: 34px',
        'font-weight: 700',
        'color: #ffffff',
        'background-color: rgba(36, 31, 49, 0.92)',
        'border-radius: 18px',
        'padding: 16px 32px',
    ].join('; ');
}

function addChrome(style: string): St.Label {
    const label = new St.Label({style, text: ''});

    Main.layoutManager.addTopChrome(label);
    return label;
}

function centerOn(label: St.Label, centerX: number, y: number): void {
    label.set_position(Math.round(centerX - label.width / 2), y);
}

function windowTitled(title: string): Meta.Window | undefined {
    return shellGlobal
        .get_window_actors()
        .map(actor => actor.meta_window)
        .find((window): window is Meta.Window => window !== null && window.get_title() === title);
}

// The stand-in windows are ordinary Wayland clients, so the workspace animation
// carries them exactly as it carries anything else. `createTestWindow` would be
// less code, but a white rectangle with a red cross says nothing about which
// monitor is showing what.
async function createWindow(kind: string, title: string): Promise<Meta.Window> {
    const script = GLib.getenv('GIWS_DEMO_WINDOW');

    assert(script !== null, 'GIWS_DEMO_WINDOW is not configured');
    GLib.spawn_async(
        null,
        ['gjs', '-m', script, '--kind', kind, '--title', title],
        null,
        GLib.SpawnFlags.SEARCH_PATH,
        null
    );
    await waitUntil(() => windowTitled(title) !== undefined, `${title} never appeared`);
    await Scripting.waitLeisure();

    const created = windowTitled(title);

    assert(created !== undefined, `${title} disappeared before it could be placed`);
    return created;
}

// A window that has only just been mapped answers the move and then lands
// where its own client wanted it. Asking again until the answer sticks is
// shorter than guessing how long a cold GTK start takes.
async function place(window: Meta.Window, monitor: number, workspace: number): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (window.get_monitor() === monitor && workspaceOf(window) === workspace) {
            return;
        }
        window.move_to_monitor(monitor);
        window.change_workspace_by_index(workspace, false);
        await Scripting.sleep(100);
    }

    throw new Error(
        `${window.get_title()} stayed on monitor ` +
            `${String(window.get_monitor())} workspace ${String(workspaceOf(window))} ` +
            `instead of monitor ${String(monitor)} workspace ${String(workspace)}`
    );
}

// Left where GNOME puts it, a window lands under the monitor badge or half off
// the stage, and the first one is still being mapped when the next is created.
// The demo is about which monitor moves, so every window sits in the same place
// on its own monitor, and they are placed once everything has settled.
function centerOnMonitor(window: Meta.Window, monitor: number): void {
    const geometry = Main.layoutManager.monitors[monitor];

    assert(geometry !== undefined, `monitor ${String(monitor)} is unavailable`);
    const frame = window.get_frame_rect();

    window.move_frame(
        true,
        Math.round(geometry.x + (geometry.width - frame.width) / 2),
        geometry.y + WINDOW_TOP
    );
}

function workspaceOf(window: Meta.Window): number {
    return window.get_workspace().index();
}

async function waitUntil(predicate: () => boolean, message: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        if (predicate()) {
            return;
        }
        await Scripting.sleep(50);
    }

    throw new Error(message);
}

function sendWorkspaceShortcut(device: Clutter.VirtualInputDevice, key: number): void {
    const time = Clutter.get_current_event_time() * 1000;

    device.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
    device.notify_keyval(time, Clutter.KEY_Alt_L, Clutter.KeyState.PRESSED);
    device.notify_keyval(time, key, Clutter.KeyState.PRESSED);
    device.notify_keyval(time, key, Clutter.KeyState.RELEASED);
    device.notify_keyval(time, Clutter.KEY_Alt_L, Clutter.KeyState.RELEASED);
    device.notify_keyval(time, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
}

function extensionState(): number | undefined {
    return Main.extensionManager.lookup(EXTENSION_UUID).state;
}

// The demo argues by comparison, so it has to turn the extension off and on
// inside the recording. `enabled-extensions` still lists it either way; only
// the runtime state moves.
async function setExtensionEnabled(enabled: boolean): Promise<void> {
    const changed = enabled
        ? Main.extensionManager.enableExtension(EXTENSION_UUID)
        : Main.extensionManager.disableExtension(EXTENSION_UUID);

    assert(changed, `GIWS refused to become ${enabled ? 'enabled' : 'disabled'}`);
    await waitUntil(
        () => extensionState() === (enabled ? ENABLED : DISABLED),
        `GIWS did not become ${enabled ? 'enabled' : 'disabled'}`
    );
    await Scripting.waitLeisure();
}

export async function run(): Promise<void> {
    const directory = frameDirectory();

    await Scripting.sleep(1500);
    assert(shellGlobal.display.get_n_monitors() === 2, 'expected two monitors');
    assert(shellGlobal.workspace_manager.get_n_workspaces() === 4, 'expected four workspaces');

    const leftCurrent = await createWindow('browser', 'Browser');
    const leftNext = await createWindow('messenger', 'Telegram');
    const rightCurrent = await createWindow('terminal', 'Claude Code');
    const rightNext = await createWindow('editor', 'VS Code');

    // Closing the Overview only takes once the startup animation is over, and
    // creating the windows is what reliably outlasts it.
    const shellMain = Main as unknown as ShellMainFacade;
    shellMain.overview.hide();
    await waitUntil(() => !shellMain.overview.visible, 'overview did not hide before the demo');

    St.Settings.get().slow_down_factor = SLOW_DOWN_FACTOR;

    const layout = [
        [leftCurrent, 0, 0],
        [leftNext, 0, 1],
        [rightCurrent, 1, 0],
        [rightNext, 1, 1],
    ] as const;

    for (const [window, monitor, workspace] of layout) {
        await place(window, monitor, workspace);
    }
    for (const [window, monitor] of layout) {
        centerOnMonitor(window, monitor);
    }
    await Scripting.waitLeisure();

    const leftMonitor = Main.layoutManager.monitors[0];
    const rightMonitor = Main.layoutManager.monitors[1];
    assert(leftMonitor !== undefined && rightMonitor !== undefined, 'monitors are unavailable');

    const leftBadge = addChrome(badgeStyle());
    const rightBadge = addChrome(badgeStyle());
    const caption = addChrome(captionStyle());

    const describe = (left: number, right: number, active: number, text: string): void => {
        leftBadge.set_text(`Monitor 1 · Workspace ${String(left)}`);
        rightBadge.set_text(`Monitor 2 · Workspace ${String(right)}`);
        leftBadge.set_style(active === 0 ? activeBadgeStyle() : badgeStyle());
        rightBadge.set_style(active === 1 ? activeBadgeStyle() : badgeStyle());
        caption.set_text(text);
        centerOn(leftBadge, leftMonitor.x + leftMonitor.width / 2, leftMonitor.y + 44);
        centerOn(rightBadge, rightMonitor.x + rightMonitor.width / 2, rightMonitor.y + 44);
        centerOn(
            caption,
            leftMonitor.x + (leftMonitor.width + rightMonitor.width) / 2,
            leftMonitor.y + leftMonitor.height - 80
        );
    };

    const seat = Clutter.get_default_backend().get_default_seat();
    const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

    const pointTo = async (monitor: number): Promise<void> => {
        const target = monitor === 0 ? leftMonitor : rightMonitor;

        pointer.notify_absolute_motion(
            Clutter.get_current_event_time() * 1000,
            target.x + target.width / 2,
            target.y + target.height / 2
        );
        await waitUntil(
            () => shellGlobal.display.get_current_monitor() === monitor,
            `pointer did not select monitor ${String(monitor)}`
        );
    };

    await pointTo(0);
    describe(1, 1, 0, 'Two monitors, both showing workspace 1');

    const recording: Recording = {frames: [], index: 0, running: true};
    const recorded = record(recording, directory);

    try {
        await Scripting.sleep(1400);

        // First, what GNOME does on its own: one shortcut, every monitor.
        await setExtensionEnabled(false);
        describe(1, 1, 0, 'Without GIWS: Ctrl+Alt+Right moves every monitor');
        await Scripting.sleep(1400);

        sendWorkspaceShortcut(keyboard, Clutter.KEY_Right);
        await waitUntil(
            () => shellGlobal.workspace_manager.get_active_workspace_index() === 1,
            'plain GNOME did not reach workspace 2'
        );
        assert(
            workspaceOf(leftNext) === 1 && workspaceOf(rightNext) === 1,
            'plain GNOME unexpectedly moved windows between workspaces'
        );
        await Scripting.sleep(700);
        describe(2, 2, 0, 'Both monitors followed the shortcut');
        await Scripting.sleep(1800);

        // Back to the start, still without the extension, so the two halves of
        // the comparison begin from the same place.
        sendWorkspaceShortcut(keyboard, Clutter.KEY_Left);
        await waitUntil(
            () => shellGlobal.workspace_manager.get_active_workspace_index() === 0,
            'plain GNOME did not return to workspace 1'
        );
        await setExtensionEnabled(true);
        describe(1, 1, 0, 'With GIWS: the same shortcut, pointer on monitor 1');
        await Scripting.sleep(1600);

        sendWorkspaceShortcut(keyboard, Clutter.KEY_Right);
        await waitUntil(
            () => workspaceOf(leftNext) === 1 && workspaceOf(rightCurrent) === 1,
            'monitor 1 did not switch while monitor 2 stayed'
        );
        await Scripting.sleep(700);
        describe(2, 1, 0, 'Monitor 1 moved. Monitor 2 kept its windows');
        await Scripting.sleep(1800);

        await pointTo(1);
        describe(2, 1, 1, 'Pointer on monitor 2 now');
        await Scripting.sleep(1200);

        sendWorkspaceShortcut(keyboard, Clutter.KEY_Right);
        await waitUntil(
            () => workspaceOf(rightNext) === 2 && workspaceOf(leftNext) === 2,
            'monitor 2 did not switch while monitor 1 stayed'
        );
        await Scripting.sleep(700);
        describe(2, 2, 1, 'Monitor 2 moved. Monitor 1 stayed on workspace 2');
        await Scripting.sleep(2000);
    } finally {
        recording.running = false;
        await recorded;
    }

    writeManifest(recording, directory);
    print(`demo capture complete: ${String(recording.frames.length)} frames`);
}
