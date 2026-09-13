import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {WorkspaceSwitcher} from './core/workspace-switcher.js';
import {SwitchDirection} from './core/workspaces.js';
import {DisposableStack} from './lifecycle/disposables.js';
import {Logger} from './logging/logger.js';
import {SETTINGS_SCHEMA} from './settings/keys.js';
import {GiwsSettings} from './settings/settings.js';
import {
    PrimaryMonitorAnimationScope,
    type WorkspaceAnimationController,
} from './shell/workspace-animation.js';
import {
    StockWorkspaceKeybindings,
    type KeybindingRegistry,
    type WorkspaceKeyHandler,
} from './shell/keybindings.js';
import {assertWorkspaceConfiguration} from './shell/workspace-configuration.js';
import {GnomeWorkspaceEnvironment} from './shell/workspace-environment.js';
import type {ShellWindow} from './shell/workspace-windows.js';

interface NativeWorkspaceWindowManager extends KeybindingRegistry {
    _showWorkspaceSwitcher: WorkspaceKeyHandler;
    _workspaceAnimation: WorkspaceAnimationController;
}

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
            const switcher = new WorkspaceSwitcher(environment);
            const windowManager = Main.wm as unknown as NativeWorkspaceWindowManager;
            const nativeHandler: WorkspaceKeyHandler = (display, window, event, binding) => {
                windowManager._showWorkspaceSwitcher(display, window, event, binding);
            };
            const primaryAnimation = new PrimaryMonitorAnimationScope(
                windowManager._workspaceAnimation,
                () => environment.primaryMonitor()
            );
            const modes = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW;
            const keybindings = new StockWorkspaceKeybindings(windowManager, modes, nativeHandler);

            keybindings.enable(
                createHandler(
                    SwitchDirection.Previous,
                    switcher,
                    nativeHandler,
                    primaryAnimation,
                    logger
                ),
                createHandler(
                    SwitchDirection.Next,
                    switcher,
                    nativeHandler,
                    primaryAnimation,
                    logger
                )
            );
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

function createHandler(
    direction: SwitchDirection,
    switcher: WorkspaceSwitcher<ShellWindow>,
    nativeHandler: WorkspaceKeyHandler,
    primaryAnimation: PrimaryMonitorAnimationScope,
    logger: Logger
): WorkspaceKeyHandler {
    return (display, window, event, binding): void => {
        try {
            switcher.switch(direction, () => {
                primaryAnimation.run(() => {
                    nativeHandler(display, window, event, binding);
                });
            });
        } catch (error) {
            logger.error('workspace switch failed', error);
        }
    };
}
