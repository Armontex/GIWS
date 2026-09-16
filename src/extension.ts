import type Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as ExtensionModule from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {asMonitorIndex} from './core/monitor.js';
import {WorkspaceSwitcher} from './core/workspace-switcher.js';
import {DisposableStack} from './lifecycle/disposables.js';
import {Logger} from './logging/logger.js';
import {SETTINGS_SCHEMA} from './settings/keys.js';
import {GiwsSettings} from './settings/settings.js';
import {
    TargetMonitorAnimationScope,
    WorkspaceGestureAnimationRouter,
    type WorkspaceGestureAnimationController,
} from './shell/workspace-animation.js';
import {
    StockWorkspaceKeybindings,
    type KeybindingRegistry,
    type WorkspaceKeyHandler,
} from './shell/keybindings.js';
import {assertWorkspaceConfiguration} from './shell/workspace-configuration.js';
import {GnomeWorkspaceEnvironment} from './shell/workspace-environment.js';
import {
    OverviewWorkspaceAdapter,
    type OverviewAdjustment,
    type OverviewThumbnailBox,
    type OverviewWorkspacesDisplay,
} from './shell/overview-workspaces.js';
import {retargetWorkspacePopup, type WorkspacePopup} from './shell/workspace-popup.js';
import type {ShellWindow} from './shell/workspace-windows.js';
import {WorkspaceActivationRouter, type RunOnMonitor} from './shell/workspace-activation.js';

interface NativeWorkspaceWindowManager extends KeybindingRegistry {
    _showWorkspaceSwitcher: WorkspaceKeyHandler;
    _workspaceAnimation: WorkspaceGestureAnimationController;
    _workspaceSwitcherPopup: WorkspacePopup | null;
    handleWorkspaceScroll(event: Clutter.Event): boolean;
}

interface NativeOverview {
    readonly _overview: {
        readonly controls: {
            readonly _thumbnailsBox: OverviewThumbnailBox;
            readonly _workspacesDisplay: OverviewWorkspacesDisplay;
        };
    };
    readonly visible: boolean;
    connect(signal: 'hiding' | 'showing', callback: () => void): number;
    disconnect(id: number): void;
}

interface MethodInjectionManager {
    clear(): void;
    overrideMethod<Method extends object>(
        prototype: object,
        methodName: string,
        createOverride: (originalMethod: Method) => Method
    ): void;
}

type MethodInjectionManagerConstructor = new () => MethodInjectionManager;

const InjectionManager = (
    ExtensionModule as unknown as {InjectionManager: MethodInjectionManagerConstructor}
).InjectionManager;

type AppActivate = (this: Shell.App) => void;
type AppActivateFull = (this: Shell.App, workspace: number, timestamp: number) => void;
type AppActivateWindow = (this: Shell.App, window: Meta.Window | null, timestamp: number) => void;
type WorkspaceActivateWithFocus = (
    this: Meta.Workspace,
    window: Meta.Window | null,
    timestamp: number
) => void;
type HandleWorkspaceScroll = (this: NativeWorkspaceWindowManager, event: Clutter.Event) => boolean;

export default class GiwsExtension extends Extension {
    #resources: DisposableStack | null = null;
    #logger: Logger | null = null;

    override enable(): void {
        const resources = new DisposableStack();
        const settings = new GiwsSettings(this.getSettings(SETTINGS_SCHEMA));
        const logger = new Logger('extension', console, () => settings.debugLogging);

        this.#resources = resources;
        this.#logger = logger;

        try {
            assertWorkspaceConfiguration({
                dynamicWorkspaces: Meta.prefs_get_dynamic_workspaces(),
                primaryOnly: Meta.prefs_get_workspaces_only_on_primary(),
            });

            const shellGlobal = global as unknown as Shell.Global;
            const environment = new GnomeWorkspaceEnvironment(
                shellGlobal.display,
                shellGlobal.workspace_manager,
                Meta.WindowType.NORMAL
            );
            const windowManager = Main.wm as unknown as NativeWorkspaceWindowManager;
            const nativeHandler: WorkspaceKeyHandler = (display, window, event, binding) => {
                windowManager._showWorkspaceSwitcher(display, window, event, binding);
            };
            const animation = new TargetMonitorAnimationScope(windowManager._workspaceAnimation);
            const switcher = new WorkspaceSwitcher(environment);
            const gestureAnimation = new WorkspaceGestureAnimationRouter(
                windowManager._workspaceAnimation,
                animation,
                monitor => switcher.beginGestureOn(asMonitorIndex(monitor)),
                () => environment.activeWorkspace()
            );
            gestureAnimation.bind();
            resources.defer(() => {
                gestureAnimation.dispose();
            });
            const runOnMonitor: RunOnMonitor = (monitor, action) => {
                switcher.switchOn(asMonitorIndex(monitor), () => {
                    animation.run(monitor, action);
                });
            };
            const overview = Main.overview as unknown as NativeOverview;
            const overviewAdapter = new OverviewWorkspaceAdapter(
                switcher.workspaces,
                () => environment.activeWorkspace(),
                (value, source, actor) => {
                    return new St.Adjustment({
                        actor: actor as unknown as Clutter.Actor,
                        lower: source.lower,
                        page_increment: source.page_increment,
                        page_size: source.page_size,
                        step_increment: source.step_increment,
                        upper: source.upper,
                        value,
                    }) as unknown as OverviewAdjustment;
                },
                monitor => switcher.beginGestureOn(asMonitorIndex(monitor))
            );
            const workspaceManager = shellGlobal.workspace_manager;
            const bindOverview = (): void => {
                switcher.refresh();
                const controls = overview._overview.controls;
                overviewAdapter.bind(controls._workspacesDisplay, controls._thumbnailsBox);
            };
            const rebuildOverview = (rebuildPrimaryThumbnails: boolean): void => {
                const controls = overview._overview.controls;

                overviewAdapter.dispose();
                if (rebuildPrimaryThumbnails) {
                    controls._thumbnailsBox._destroyThumbnails();
                    controls._thumbnailsBox._createThumbnails();
                }

                controls._workspacesDisplay._updateWorkspacesViews();
                for (const entry of controls._workspacesDisplay._workspacesViews) {
                    if ('_thumbnails' in entry) {
                        entry._thumbnails._createThumbnails();
                    }
                }

                bindOverview();
            };
            const workspaceChangedId = workspaceManager.connect('active-workspace-changed', () => {
                switcher.workspaceChanged();
                overviewAdapter.sync();
            });
            resources.defer(() => {
                workspaceManager.disconnect(workspaceChangedId);
            });
            const activationRouter = new WorkspaceActivationRouter(runOnMonitor);
            const injections = new InjectionManager();
            resources.defer(() => {
                injections.clear();
            });
            installShellOverrides(
                injections,
                activationRouter,
                windowManager,
                shellGlobal.display,
                runOnMonitor
            );
            const overviewShowingId = overview.connect('showing', () => {
                bindOverview();
            });
            const overviewHidingId = overview.connect('hiding', () => {
                overviewAdapter.unbind();
            });
            resources.defer(() => {
                overviewAdapter.dispose();
                overview.disconnect(overviewShowingId);
                overview.disconnect(overviewHidingId);
            });
            const monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
                switcher.reset();
                if (overview.visible) {
                    rebuildOverview(false);
                }
            });
            const workspaceCountChangedId = workspaceManager.connect('notify::n-workspaces', () => {
                switcher.refresh();
                if (overview.visible) {
                    rebuildOverview(true);
                }
            });
            resources.defer(() => {
                Main.layoutManager.disconnect(monitorsChangedId);
                workspaceManager.disconnect(workspaceCountChangedId);
            });
            if (overview.visible) {
                bindOverview();
            }
            const modes = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;
            const keybindings = new StockWorkspaceKeybindings(windowManager, modes, nativeHandler);

            const handler = createHandler(
                switcher,
                nativeHandler,
                animation,
                environment,
                windowManager,
                logger
            );
            keybindings.enable(handler, handler);
            resources.defer(() => {
                keybindings.dispose();
            });
            logger.debug('enabled');
        } catch (error) {
            logger.error('enable failed', error);
            this.disable();
            throw error;
        }
    }

    override disable(): void {
        try {
            this.#resources?.dispose();
            this.#logger?.debug('disabled');
        } catch (error) {
            this.#logger?.error('disable failed', error);
        } finally {
            this.#resources = null;
            this.#logger = null;
        }
    }
}

function installShellOverrides(
    injections: MethodInjectionManager,
    router: WorkspaceActivationRouter,
    windowManager: NativeWorkspaceWindowManager,
    display: Meta.Display,
    runOnMonitor: RunOnMonitor
): void {
    injections.overrideMethod<AppActivate>(Shell.App.prototype, 'activate', originalActivate => {
        return function (this: Shell.App): void {
            router.activateApp(this, () => {
                originalActivate.call(this);
            });
        };
    });
    injections.overrideMethod<AppActivateFull>(
        Shell.App.prototype,
        'activate_full',
        originalActivate => {
            return function (this: Shell.App, workspace: number, timestamp: number): void {
                router.activateApp(this, () => {
                    originalActivate.call(this, workspace, timestamp);
                });
            };
        }
    );
    injections.overrideMethod<AppActivateWindow>(
        Shell.App.prototype,
        'activate_window',
        originalActivate => {
            return function (this: Shell.App, window: Meta.Window | null, timestamp: number): void {
                router.activateWindow(window ?? this.get_windows()[0] ?? null, () => {
                    originalActivate.call(this, window, timestamp);
                });
            };
        }
    );
    injections.overrideMethod<WorkspaceActivateWithFocus>(
        Meta.Workspace.prototype,
        'activate_with_focus',
        originalActivate => {
            return function (
                this: Meta.Workspace,
                window: Meta.Window | null,
                timestamp: number
            ): void {
                router.activateWindow(window, () => {
                    originalActivate.call(this, window, timestamp);
                });
            };
        }
    );
    injections.overrideMethod<HandleWorkspaceScroll>(
        Object.getPrototypeOf(windowManager) as object,
        'handleWorkspaceScroll',
        originalHandle => {
            return function (this: NativeWorkspaceWindowManager, event: Clutter.Event): boolean {
                const [x, y] = event.get_coords();
                const monitor = display.get_monitor_index_for_rect(
                    new Mtk.Rectangle({x: Math.floor(x), y: Math.floor(y), width: 1, height: 1})
                );
                let result = false;
                runOnMonitor(monitor, () => {
                    result = originalHandle.call(this, event);
                });
                return result;
            };
        }
    );
}

function createHandler(
    switcher: WorkspaceSwitcher<ShellWindow>,
    nativeHandler: WorkspaceKeyHandler,
    animation: TargetMonitorAnimationScope,
    environment: GnomeWorkspaceEnvironment,
    windowManager: NativeWorkspaceWindowManager,
    logger: Logger
): WorkspaceKeyHandler {
    return (display, window, event, binding): void => {
        try {
            const targetMonitor = environment.activeMonitor();
            switcher.switch(() => {
                animation.run(targetMonitor, () => {
                    nativeHandler(display, window, event, binding);
                });
            });
            retargetWorkspacePopup(windowManager._workspaceSwitcherPopup, targetMonitor);
        } catch (error) {
            logger.error('workspace switch failed', error);
        }
    };
}
