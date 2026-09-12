# GIWS

Independent workspaces per monitor for GNOME Shell 46, written in TypeScript
and compiled to native GJS ES modules.

The project targets GNOME Shell 46. Runtime functionality is developed on the
`develop` branch; `main` remains the stable integration branch.

## Requirements

- GNOME Shell 46
- Node.js 22 or newer
- npm 10
- `zip` and `gnome-extensions` for local installation

## Development

```bash
npm ci
npm run check
npm run pack
```

Run the GNOME integration smoke test on a Linux development host with:

```bash
npm run runtime:smoke
```

The smoke test starts a separate headless GNOME Shell on its own D-Bus session,
dconf profile and temporary XDG directories. It exposes two virtual monitors and
verifies that GIWS can complete an `ACTIVE -> INACTIVE -> ACTIVE` lifecycle. The
temporary extension installation and settings are removed after the run; the
active desktop session is not modified.

This check covers loading, monitor discovery and lifecycle cleanup. Actual
keyboard input, window movement and animations still require a short manual test
on a real multi-monitor session.

The package is written to `giws@armontex.shell-extension.zip`. Install it with:

```bash
npm run install:extension
```

On Wayland, log out and back in before enabling a newly installed extension:

```bash
gnome-extensions enable giws@armontex
```

Inspect runtime errors with:

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell
```

If an extension breaks the session, disable user extensions from a TTY:

```bash
gsettings set org.gnome.shell disable-user-extensions true
```

Commits and pull-request titles follow
[Conventional Commits](https://www.conventionalcommits.org/); Jira references
are not used.

## Workspace switching

GIWS handles the existing `switch-to-workspace-left` and
`switch-to-workspace-right` shortcuts, including `Ctrl+Alt+Left/Right` and
`Super+Page Up/Down` when they are present in the system configuration. It does
not rewrite the user's shortcuts and restores the native GNOME handlers when
disabled.

On the primary monitor, GNOME performs the native workspace transition. On a
secondary monitor, GIWS rotates normal application windows while leaving the
other monitors unchanged. Secondary-monitor animation is not implemented yet.

The first runtime version requires static workspaces spanning all displays:

```bash
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.mutter workspaces-only-on-primary false
```

If either requirement is not met, enabling the extension fails without changing
the shortcuts.

## Source layout

```text
src/
├── core/          # GNOME-independent domain types
├── lifecycle/     # cleanup of signals, keybindings, timeouts and actors
├── logging/       # contextual journal logging
├── preferences/   # preferences window components
├── settings/      # typed GSettings access
├── shell/         # GNOME Shell and Mutter adapters
├── extension.ts   # runtime composition root
└── prefs.ts       # preferences composition root
```

Modules are added only when they own real behavior. Runtime resources must be
registered with the disposable stack and released from `disable()`.
