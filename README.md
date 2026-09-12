# GIWS

[![CI](https://github.com/Armontex/GIWS/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/Armontex/GIWS/actions/workflows/ci.yml)

GIWS provides independent workspace switching per monitor for GNOME Shell 46.
It is written in TypeScript and compiled to native GJS ES modules.

The project is under active development. `develop` contains the latest runtime
changes; `main` is the stable integration branch.

## Features

- Uses the existing GNOME workspace shortcuts without rewriting them.
- Switches only the active secondary monitor while leaving other monitors in
  place.
- Preserves native GNOME switching on the primary monitor.
- Restores the original GNOME keybinding handlers when disabled.
- Provides an isolated two-monitor runtime smoke test.

## Compatibility and limitations

- GNOME Shell 46 only.
- Static workspaces are required.
- Workspaces must span every display.
- Only left and right workspace switching is handled.
- Only normal application windows participate in switching; sticky and special
  windows are ignored.
- Secondary-monitor animation is not implemented yet.

## Installation

### From a CI build

Open the latest successful
[CI run](https://github.com/Armontex/GIWS/actions/workflows/ci.yml?query=branch%3Adevelop),
download the `giws-extension` artifact and extract
`giws@armontex.shell-extension.zip`.

Install it with:

```bash
gnome-extensions install --force giws@armontex.shell-extension.zip
```

### From source

Requirements:

- Node.js 22.18 or newer;
- npm 10;
- `zip`, `glib-compile-schemas` and `gnome-extensions`;
- GNOME Shell 46 for installation and runtime tests.

Build and install:

```bash
npm ci
npm run install:extension
```

On Wayland, log out and back in after installing a new extension. Before
enabling GIWS, configure GNOME to use static workspaces on all displays:

```bash
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.mutter workspaces-only-on-primary false
gnome-extensions enable giws@armontex
```

GIWS refuses to enable when either workspace requirement is not met and leaves
the native shortcuts unchanged.

## Usage

Use the normal `switch-to-workspace-left` and
`switch-to-workspace-right` shortcuts while the required monitor is active.
Common GNOME defaults include:

- `Ctrl+Alt+Left` and `Ctrl+Alt+Right`;
- `Super+Page Up` and `Super+Page Down`.

The exact shortcuts remain controlled by GNOME Settings. On the primary monitor,
GNOME performs its normal global transition. On a secondary monitor, GIWS rotates
that monitor's application windows between workspaces without changing the
global active workspace.

## Development

```bash
npm ci
npm run check
npm run pack
```

Important commands:

| Command                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `npm run check`         | Formatting, linting, type checking, build and tests |
| `npm test`              | Build and run the test suite                        |
| `npm run build`         | Compile the extension into `dist/`                  |
| `npm run pack`          | Create `giws@armontex.shell-extension.zip`          |
| `npm run runtime:smoke` | Run isolated GNOME lifecycle and interaction checks |

Commits and pull-request titles follow
[Conventional Commits](https://www.conventionalcommits.org/). Jira references
are not used.

## Testing

Unit tests cover the GNOME-independent workspace calculations, shell adapters,
lifecycle cleanup and build artifact contract.

The Linux-only runtime smoke test starts separate headless GNOME Shell sessions
with isolated D-Bus, dconf and XDG directories. It verifies:

- extension lifecycle `ACTIVE -> INACTIVE -> ACTIVE`;
- discovery of two virtual monitors;
- stock keyboard shortcut dispatch through Mutter;
- primary and secondary monitor window placement;
- absence of GJS runtime errors during the interaction scenario.

Run it on a machine with GNOME Shell 46:

```bash
npm run runtime:smoke
```

The active desktop session is not modified. A short manual test on physical
monitors is still required to assess visible animation and keyboard feel.

## Project structure

```text
src/
├── core/          # GNOME-independent workspace logic
├── lifecycle/     # cleanup of registered runtime resources
├── logging/       # contextual journal logging
├── preferences/   # preferences window components
├── settings/      # typed GSettings access
├── shell/         # GNOME Shell and Mutter adapters
├── extension.ts   # runtime composition root
└── prefs.ts       # preferences composition root
```

Runtime resources must be registered with the disposable stack and released
from `disable()`.

## Troubleshooting

Follow GNOME Shell logs:

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell
```

Disable GIWS from a terminal:

```bash
gnome-extensions disable giws@armontex
```

If the session cannot load user extensions, disable them globally from a TTY:

```bash
gsettings set org.gnome.shell disable-user-extensions true
```
