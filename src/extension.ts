import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

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
    type WorkspaceAnimationController,
} from './shell/workspace-animation.js';
import {
    StockWorkspaceKeybindings,
    type KeybindingRegistry,
    type WorkspaceKeyHandler,
} from './shell/keybindings.js';
import {assertWorkspaceConfiguration} from './shell/workspace-configuration.js';
import {GnomeWorkspaceEnvironment} from './shell/workspace-environment.js';
import {retargetWorkspacePopup, type WorkspacePopup} from './shell/workspace-popup.js';
import type {ShellWindow} from './shell/workspace-windows.js';
import {WorkspaceActivationRouter} from './shell/workspace-activation.js';

interface NativeWorkspaceWindowManager extends KeybindingRegistry {
    _showWorkspaceSwitcher: WorkspaceKeyHandler;
    _workspaceAnimation: WorkspaceAnimationController;
    _workspaceSwitcherPopup: WorkspacePopup | null;
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
            const workspaceManager = shellGlobal.workspace_manager;
            const workspaceChangedId = workspaceManager.connect('active-workspace-changed', () => {
                switcher.workspaceChanged();
            });
            resources.defer(() => {
                workspaceManager.disconnect(workspaceChangedId);
            });
            const activationRouter = new WorkspaceActivationRouter((monitor, activate) => {
                switcher.switchOn(asMonitorIndex(monitor), () => {
                    animation.run(monitor, activate);
                });
            });
            const injections = new InjectionManager();
            resources.defer(() => {
                injections.clear();
            });
            installActivationOverrides(injections, activationRouter);
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

function installActivationOverrides(
    injections: MethodInjectionManager,
    router: WorkspaceActivationRouter
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
