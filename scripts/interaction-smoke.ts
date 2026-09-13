import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import type Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

export const METRICS = {};
const shellGlobal = global as unknown as Shell.Global;

interface WorkspaceAnimationMonitor {
    readonly index: number;
    readonly opacity: number;
    readonly visible: boolean;
}

interface WorkspaceAnimationController {
    _switchData: {monitors: WorkspaceAnimationMonitor[]} | null;
    readonly _swipeTracker: SwipeTracker;
    animateSwitch: (
        this: WorkspaceAnimationController,
        from: number,
        to: number,
        direction: Meta.MotionDirection,
        onComplete: () => void
    ) => void;
}

interface SwipeTracker {
    emit(signal: string, ...args: number[]): void;
}

interface AnimationSnapshot {
    index: number;
    visible: boolean;
}

interface AnimationObservation {
    monitors: AnimationSnapshot[] | null;
}

interface OverviewFacade {
    hide: () => void;
    show: () => void;
    readonly _overview: {
        readonly controls: {
            readonly _workspacesDisplay: OverviewWorkspacesDisplay;
        };
    };
    readonly visible: boolean;
}

interface OverviewAdjustment {
    readonly value: number;
}

interface OverviewWorkspaceActor {
    readonly metaWorkspace: Meta.Workspace;
}

interface OverviewWorkspaceView {
    readonly _monitorIndex: number;
    readonly _scrollAdjustment: OverviewAdjustment;
    readonly _workspaces: OverviewWorkspaceActor[];
}

interface SecondaryOverviewWorkspaceView {
    readonly _monitorIndex: number;
    readonly _workspacesView: OverviewWorkspaceView;
}

interface OverviewWorkspacesDisplay {
    readonly _swipeTracker: SwipeTracker;
    readonly _workspacesViews: (OverviewWorkspaceView | SecondaryOverviewWorkspaceView)[];
}

interface WorkspaceWindowManager {
    _shouldAnimate: () => boolean;
    _workspaceAnimation: WorkspaceAnimationController;
    _workspaceSwitcherPopup: {
        get_constraints(): {index?: number}[];
    } | null;
}

interface ShellMainFacade {
    readonly overview: OverviewFacade;
    readonly wm: WorkspaceWindowManager;
}

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
    for (let attempt = 0; attempt < 100; attempt += 1) {
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

function popupMonitor(windowManager: WorkspaceWindowManager): number | null {
    const constraint = windowManager._workspaceSwitcherPopup
        ?.get_constraints()
        .find(candidate => typeof candidate.index === 'number');
    return constraint?.index ?? null;
}

function hasAnimation(
    monitors: readonly AnimationSnapshot[] | null,
    index: number,
    visible: boolean
): boolean {
    return (
        monitors?.some(monitor => monitor.index === index && monitor.visible === visible) ?? false
    );
}

function observedAnimations(observation: AnimationObservation): AnimationSnapshot[] | null {
    return observation.monitors;
}

function overviewWorkspaceView(
    display: OverviewWorkspacesDisplay,
    monitor: number
): OverviewWorkspaceView {
    const candidate = display._workspacesViews.find(view => view._monitorIndex === monitor);
    assert(candidate !== undefined, `overview view for monitor ${String(monitor)} is unavailable`);
    return '_workspacesView' in candidate ? candidate._workspacesView : candidate;
}

export async function run(): Promise<void> {
    await Scripting.sleep(1000);
    assert(shellGlobal.display.get_n_monitors() === 2, 'expected two monitors');
    assert(shellGlobal.workspace_manager.get_n_workspaces() === 4, 'expected four workspaces');

    const primaryCurrent = await createWindow();
    primaryCurrent.move_to_monitor(0);
    const primaryNext = await createWindow();
    primaryNext.move_to_monitor(0);
    primaryNext.change_workspace_by_index(1, false);
    const secondaryCurrent = await createWindow();
    secondaryCurrent.move_to_monitor(1);
    const secondaryNext = await createWindow();
    secondaryNext.move_to_monitor(1);
    secondaryNext.change_workspace_by_index(1, false);

    await waitUntil(
        () =>
            primaryCurrent.get_monitor() === 0 &&
            primaryNext.get_monitor() === 0 &&
            workspaceOf(primaryNext) === 1 &&
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
        primaryMonitor.x + primaryMonitor.width / 2,
        primaryMonitor.y + primaryMonitor.height / 2
    );
    await waitUntil(
        () => shellGlobal.display.get_current_monitor() === 0,
        'pointer did not select primary monitor'
    );

    const shellMain = Main as unknown as ShellMainFacade;
    shellMain.overview.hide();
    await waitUntil(
        () => !shellMain.overview.visible,
        'overview did not hide before primary switch'
    );

    const workspaceWindowManager = shellMain.wm;
    assert(workspaceWindowManager._shouldAnimate(), 'workspace animation is disabled');

    const animationController = workspaceWindowManager._workspaceAnimation;
    const nativeAnimate = animationController.animateSwitch;
    const animationObservation: AnimationObservation = {monitors: null};

    animationController.animateSwitch = function (
        from: number,
        to: number,
        direction: Meta.MotionDirection,
        onComplete: () => void
    ): void {
        nativeAnimate.call(this, from, to, direction, onComplete);
        animationObservation.monitors =
            this._switchData?.monitors.map(monitor => ({
                index: monitor.index,
                visible: monitor.visible && monitor.opacity > 0,
            })) ?? null;
    };

    try {
        sendWorkspaceShortcut(keyboard, Clutter.KEY_Right);
        await waitUntil(
            () =>
                shellGlobal.workspace_manager.get_active_workspace_index() === 1 &&
                workspaceOf(secondaryCurrent) === 1 &&
                workspaceOf(secondaryNext) === 2,
            'primary switch did not compensate secondary windows'
        );
    } finally {
        animationController.animateSwitch = nativeAnimate;
    }

    const animatedMonitors = observedAnimations(animationObservation);
    assert(
        animatedMonitors?.length === 2 &&
            hasAnimation(animatedMonitors, 0, true) &&
            hasAnimation(animatedMonitors, 1, false),
        `expected only visible primary monitor animation, got ${JSON.stringify(animatedMonitors)}`
    );
    assert(popupMonitor(workspaceWindowManager) === 0, 'workspace popup was not on primary');
    assert(workspaceOf(primaryCurrent) === 0, 'primary switch moved current primary window');
    assert(workspaceOf(primaryNext) === 1, 'primary switch moved next primary window');
    await waitUntil(
        () => animationController._switchData === null,
        'primary workspace animation did not finish'
    );

    Main.activateWindow(primaryCurrent);
    await waitUntil(
        () =>
            shellGlobal.workspace_manager.get_active_workspace_index() === 0 &&
            workspaceOf(secondaryCurrent) === 0 &&
            workspaceOf(secondaryNext) === 1,
        'Dash-style primary activation did not preserve the secondary monitor'
    );
    await waitUntil(
        () => animationController._switchData === null,
        'Dash-style primary animation did not finish'
    );

    Main.activateWindow(secondaryNext);
    await waitUntil(
        () =>
            shellGlobal.workspace_manager.get_active_workspace_index() === 1 &&
            workspaceOf(primaryCurrent) === 1 &&
            workspaceOf(primaryNext) === 2 &&
            workspaceOf(secondaryNext) === 1,
        'Dash-style secondary activation did not preserve the primary monitor'
    );
    await waitUntil(
        () => animationController._switchData === null,
        'Dash-style secondary animation did not finish'
    );

    pointer.notify_absolute_motion(
        Clutter.get_current_event_time() * 1000,
        secondaryMonitor.x + secondaryMonitor.width / 2,
        secondaryMonitor.y + secondaryMonitor.height / 2
    );
    await waitUntil(
        () => shellGlobal.display.get_current_monitor() === 1,
        'pointer did not select secondary monitor'
    );

    animationObservation.monitors = null;
    animationController.animateSwitch = function (
        from: number,
        to: number,
        direction: Meta.MotionDirection,
        onComplete: () => void
    ): void {
        nativeAnimate.call(this, from, to, direction, onComplete);
        animationObservation.monitors =
            this._switchData?.monitors.map(monitor => ({
                index: monitor.index,
                visible: monitor.visible && monitor.opacity > 0,
            })) ?? null;
    };

    try {
        sendWorkspaceShortcut(keyboard, Clutter.KEY_Left);
        await waitUntil(
            () =>
                shellGlobal.workspace_manager.get_active_workspace_index() === 0 &&
                workspaceOf(primaryCurrent) === 0 &&
                workspaceOf(primaryNext) === 1 &&
                workspaceOf(secondaryCurrent) === 0 &&
                workspaceOf(secondaryNext) === 1,
            'secondary keyboard switch did not preserve the primary monitor'
        );
    } finally {
        animationController.animateSwitch = nativeAnimate;
    }

    const secondaryAnimation = observedAnimations(animationObservation);
    assert(
        secondaryAnimation?.length === 2 &&
            hasAnimation(secondaryAnimation, 0, false) &&
            hasAnimation(secondaryAnimation, 1, true),
        `expected only visible secondary monitor animation, got ${JSON.stringify(secondaryAnimation)}`
    );
    assert(popupMonitor(workspaceWindowManager) === 1, 'workspace popup was not on secondary');

    pointer.notify_absolute_motion(
        Clutter.get_current_event_time() * 1000,
        primaryMonitor.x + primaryMonitor.width / 2,
        primaryMonitor.y + primaryMonitor.height / 2
    );
    await waitUntil(
        () => shellGlobal.display.get_current_monitor() === 0,
        'pointer did not return to primary monitor'
    );

    shellMain.overview.show();
    await waitUntil(() => shellMain.overview.visible, 'overview did not open');
    await Scripting.sleep(500);
    await Scripting.waitLeisure();

    pointer.notify_discrete_scroll(
        Clutter.get_current_event_time() * 1000,
        Clutter.ScrollDirection.DOWN,
        Clutter.ScrollSource.WHEEL
    );
    await waitUntil(
        () => shellGlobal.workspace_manager.get_active_workspace_index() === 1,
        'overview scroll did not switch the primary monitor'
    );

    const overviewDisplay = shellMain.overview._overview.controls._workspacesDisplay;
    const primaryOverview = overviewWorkspaceView(overviewDisplay, 0);
    const secondaryOverview = overviewWorkspaceView(overviewDisplay, 1);
    assert(
        secondaryOverview._scrollAdjustment.value === 0,
        'secondary overview advanced with the primary monitor'
    );
    assert(
        secondaryOverview._workspaces[0]?.metaWorkspace.index() === 1,
        'secondary overview did not preserve its logical first workspace'
    );

    pointer.notify_absolute_motion(
        Clutter.get_current_event_time() * 1000,
        secondaryMonitor.x + secondaryMonitor.width / 2,
        secondaryMonitor.y + secondaryMonitor.height / 2
    );
    await waitUntil(
        () => shellGlobal.display.get_current_monitor() === 1,
        'pointer did not select secondary monitor in overview'
    );
    await Scripting.sleep(200);

    overviewDisplay._swipeTracker.emit('begin', 1);
    overviewDisplay._swipeTracker.emit('update', 2);
    assert(
        primaryOverview._scrollAdjustment.value <= 1.01,
        'primary overview followed the secondary touchpad gesture'
    );
    assert(
        Math.abs(secondaryOverview._scrollAdjustment.value - 1) < 0.01,
        'secondary gesture did not advance'
    );

    overviewDisplay._swipeTracker.emit('end', 0, 2);
    await waitUntil(
        () =>
            shellGlobal.workspace_manager.get_active_workspace_index() === 2 &&
            workspaceOf(primaryCurrent) === 1 &&
            workspaceOf(primaryNext) === 2 &&
            workspaceOf(secondaryCurrent) === 1 &&
            workspaceOf(secondaryNext) === 2,
        'overview touchpad gesture lost its target monitor'
    );

    shellMain.overview.hide();
    await waitUntil(() => !shellMain.overview.visible, 'overview did not close');

    pointer.notify_absolute_motion(
        Clutter.get_current_event_time() * 1000,
        secondaryMonitor.x + secondaryMonitor.width / 2,
        secondaryMonitor.y + secondaryMonitor.height / 2
    );
    await waitUntil(
        () => shellGlobal.display.get_current_monitor() === 1,
        'pointer did not select secondary monitor for desktop touchpad gesture'
    );

    animationObservation.monitors = null;
    animationController._swipeTracker.emit('begin', 1);
    animationObservation.monitors =
        animationController._switchData?.monitors.map(monitor => ({
            index: monitor.index,
            visible: monitor.visible && monitor.opacity > 0,
        })) ?? null;
    animationController._swipeTracker.emit('update', 1);
    animationController._swipeTracker.emit('end', 0, 1);
    await waitUntil(
        () =>
            shellGlobal.workspace_manager.get_active_workspace_index() === 1 &&
            workspaceOf(primaryCurrent) === 0 &&
            workspaceOf(primaryNext) === 1 &&
            workspaceOf(secondaryCurrent) === 1 &&
            workspaceOf(secondaryNext) === 2,
        'secondary desktop touchpad gesture did not preserve the primary monitor'
    );
    const desktopGestureAnimation = observedAnimations(animationObservation);
    assert(
        desktopGestureAnimation?.length === 2 &&
            hasAnimation(desktopGestureAnimation, 0, false) &&
            hasAnimation(desktopGestureAnimation, 1, true),
        `expected only visible secondary touchpad animation, got ${JSON.stringify(desktopGestureAnimation)}`
    );

    await Scripting.waitLeisure();
    await Scripting.destroyTestWindows();
    print(
        'interaction smoke passed: shortcuts, Dash activation, animation, popup, overview scroll and touchpad gestures'
    );
}
