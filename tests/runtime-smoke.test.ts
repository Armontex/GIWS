import {describe, expect, test} from 'vitest';

import {
    assertVirtualMonitors,
    assertNoShellRuntimeErrors,
    buildGSettingsCommands,
    buildHeadlessShellArguments,
    createInteractionEnvironment,
    createIsolatedEnvironment,
    extractInteractionResult,
    extractSmokeResult,
    extensionInstallPath,
    parseExtensionState,
    signalProcessGroup,
    waitForExtensionState,
    watchForInterruption,
} from '../scripts/runtime-smoke.js';

describe('runtime smoke harness', () => {
    test('starts GNOME Shell headlessly with two virtual monitors', () => {
        expect(buildHeadlessShellArguments()).toEqual([
            '--headless',
            '--no-x11',
            '--mode=user',
            '--wayland-display=giws-smoke',
            '--virtual-monitor=1280x720',
            '--virtual-monitor=1280x720',
        ]);
    });

    test('loads the GNOME automation module for the interaction session', () => {
        expect(buildHeadlessShellArguments('/tmp/giws-smoke/interaction-smoke.js')).toEqual([
            '--headless',
            '--no-x11',
            '--mode=user',
            '--wayland-display=giws-smoke',
            '--virtual-monitor=1280x720',
            '--virtual-monitor=1280x720',
            '--automation-script=/tmp/giws-smoke/interaction-smoke.js',
        ]);
    });

    test('isolates mutable desktop state from the active user session', () => {
        const environment = createIsolatedEnvironment('/tmp/giws-smoke-test', {
            DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
            DISPLAY: ':1',
            HOME: '/home/maxim',
            WAYLAND_DISPLAY: 'wayland-0',
            XDG_SESSION_ID: '3',
        });

        expect(environment).toEqual(
            expect.objectContaining({
                DCONF_PROFILE: '/tmp/giws-smoke-test/dconf-profile',
                HOME: '/tmp/giws-smoke-test/home',
                XDG_CACHE_HOME: '/tmp/giws-smoke-test/cache',
                XDG_CONFIG_HOME: '/tmp/giws-smoke-test/config',
                XDG_DATA_HOME: '/tmp/giws-smoke-test/data',
                XDG_RUNTIME_DIR: '/tmp/giws-smoke-test/runtime',
                XDG_STATE_HOME: '/tmp/giws-smoke-test/state',
            })
        );
        expect(environment).not.toHaveProperty('DBUS_SESSION_BUS_ADDRESS');
        expect(environment).not.toHaveProperty('DISPLAY');
        expect(environment).not.toHaveProperty('WAYLAND_DISPLAY');
        expect(environment).not.toHaveProperty('XDG_SESSION_ID');
    });

    test('routes test clients only to the isolated Wayland compositor', () => {
        const environment = createInteractionEnvironment(
            createIsolatedEnvironment('/tmp/giws-smoke-test', {})
        );

        expect(environment).toEqual(
            expect.objectContaining({
                GDK_BACKEND: 'wayland',
                WAYLAND_DISPLAY: 'giws-smoke',
                XDG_SESSION_TYPE: 'wayland',
            })
        );
    });

    test('signals the complete isolated process group', () => {
        const signals: [number, NodeJS.Signals][] = [];

        signalProcessGroup(1234, 'SIGTERM', (processId, signal) => {
            signals.push([processId, signal]);
            return true;
        });

        expect(signals).toEqual([[-1234, 'SIGTERM']]);
    });

    test('turns external termination into a controlled cleanup event', async () => {
        const handlers = new Map<NodeJS.Signals, () => void>();
        const removed: NodeJS.Signals[] = [];
        const interruption = watchForInterruption(
            (signal, handler) => handlers.set(signal, handler),
            signal => {
                removed.push(signal);
            }
        );

        handlers.get('SIGTERM')?.();

        await expect(interruption.signal).resolves.toBe('SIGTERM');
        interruption.dispose();
        expect(removed).toEqual(['SIGINT', 'SIGTERM']);
    });

    test('installs and configures only the isolated GNOME session', () => {
        expect(extensionInstallPath('/tmp/giws-smoke-test')).toBe(
            '/tmp/giws-smoke-test/data/gnome-shell/extensions/giws@armontex'
        );
        expect(buildGSettingsCommands()).toEqual([
            ['org.gnome.mutter', 'dynamic-workspaces', 'false'],
            ['org.gnome.mutter', 'workspaces-only-on-primary', 'false'],
            ['org.gnome.desktop.wm.preferences', 'num-workspaces', '4'],
            ['org.gnome.shell', 'disable-user-extensions', 'false'],
            ['org.gnome.shell', 'enabled-extensions', "['giws@armontex']"],
        ]);
    });

    test('reads the extension state reported by the Shell D-Bus API', () => {
        expect(parseExtensionState("({'state': <1.0>},)")).toBe('ACTIVE');
        expect(parseExtensionState("({'state': <2.0>},)")).toBe('INACTIVE');
        expect(parseExtensionState('({},)')).toBeNull();
    });

    test('waits until GNOME reports the requested lifecycle state', async () => {
        const states = ['INITIALIZED', 'ACTIVE'];

        await expect(
            waitForExtensionState('ACTIVE', () => Promise.resolve(states.shift() ?? null), {
                attempts: 2,
                delay: () => Promise.resolve(),
            })
        ).resolves.toBeUndefined();
    });

    test('requires both virtual monitors in Mutter state', () => {
        expect(() => {
            assertVirtualMonitors("('Meta-0', 'Meta-1')");
        }).not.toThrow();
        expect(() => {
            assertVirtualMonitors("('Meta-0',)");
        }).toThrow('headless GNOME did not expose both virtual monitors');
    });

    test('keeps successful command output stable despite session service noise', () => {
        expect(
            extractSmokeResult(
                'service message\nruntime smoke passed: 2 virtual monitors, ACTIVE -> INACTIVE -> ACTIVE\n'
            )
        ).toBe('runtime smoke passed: 2 virtual monitors, ACTIVE -> INACTIVE -> ACTIVE');
        expect(() => extractSmokeResult('service message only')).toThrow(
            'isolated session exited without a success result'
        );
        expect(
            extractInteractionResult(
                'service message\ninteraction smoke passed: shortcuts and window placement\n'
            )
        ).toBe('interaction smoke passed: shortcuts and window placement');
    });

    test('rejects GJS runtime errors even when GNOME exits successfully', () => {
        expect(() => {
            assertNoShellRuntimeErrors('ordinary session warning');
        }).not.toThrow();
        expect(() => {
            assertNoShellRuntimeErrors('GNOME Shell-CRITICAL **: JS ERROR: broken animation');
        }).toThrow('isolated GNOME reported a GJS runtime error');
    });
});
