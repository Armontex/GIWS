<!-- TODO(brand): Add the GIWS logo here. Recommended: assets/logo.svg, approximately 160 px wide. -->

<div align="center">

<h1>GIWS</h1>

<h3>Independent workspaces. Every monitor. Native GNOME shortcuts.</h3>

<p>
  GIWS brings monitor-aware workspace switching to GNOME Shell.<br />
  Move through workspaces on the display you are using without disturbing the others.
</p>

<p><strong>English</strong> · <a href="docs/readmes/README.ru.md">Русский</a></p>

<p>
  <a href="https://github.com/Armontex/GIWS/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Armontex/GIWS/actions/workflows/ci.yml/badge.svg?branch=develop" /></a>
  <a href="https://release.gnome.org/46/"><img alt="GNOME Shell 46" src="https://img.shields.io/badge/GNOME%20Shell-46-4A86CF?logo=gnome&amp;logoColor=white" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript ESM" src="https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript&amp;logoColor=white" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-22A699.svg" /></a>
  <a href="#project-status"><img alt="Active development" src="https://img.shields.io/badge/Status-Active%20development-F4A261" /></a>
</p>

<p>
  <a href="#why-giws">Overview</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#development">Development</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

</div>

<!-- TODO(media): Add a short GIF showing workspace switching on the active monitor. Recommended: assets/demo.gif, under 8 MB. -->

---

## Why GIWS?

GNOME normally treats workspace switching as a global action. GIWS keeps the
familiar shortcuts, but makes the result depend on the monitor under your
pointer.

| Interaction               | What happens                                                  |
| ------------------------- | ------------------------------------------------------------- |
| Shortcut on any monitor   | Its workspace changes with native GNOME animation and popup.  |
| Dash or window activation | Only the monitor containing the selected window changes.      |
| All other monitors        | Their visible windows and workspace context remain untouched. |

No replacement keybindings, separate workspace switcher or new interaction
model: keep using the GNOME workflow you already know.

## How it works

1. GIWS observes GNOME workspace changes from native shortcuts and window
   activation, including the Dash.
2. It identifies the target from the pointer for shortcuts or from the window
   being activated.
3. GNOME performs the transition while GIWS compensates every other monitor
   and limits native visual feedback to the target display.

When the extension is disabled, the original GNOME keybinding handlers are
restored.

<!-- TODO(media): Add a two-column screenshot here: primary-monitor switch vs secondary-monitor switch. Recommended: assets/workspace-behaviour.png. -->

## Highlights

- **Monitor-aware switching** — change the workspace context where you are
  working.
- **Native shortcuts** — configure keys in GNOME Settings as usual.
- **Native feedback everywhere** — GNOME animation follows the target monitor;
  the workspace popup follows it for shortcut-driven switching.
- **Clean lifecycle** — original handlers are restored when GIWS is disabled.
- **TypeScript codebase** — compiled to native GJS ES modules with strict
  checks.
- **Isolated runtime validation** — smoke tests exercise GNOME Shell without
  modifying the active desktop session.

## Installation

> [!IMPORTANT]
> GIWS currently targets **GNOME Shell 46**, static workspaces, and workspaces
> spanning all displays. See [Project status](#project-status) before installing.

### From a CI artifact

1. Open the latest successful
   [develop CI run](https://github.com/Armontex/GIWS/actions/workflows/ci.yml?query=branch%3Adevelop).
2. Download and unpack the `giws-extension` artifact.
3. Install the enclosed `giws@armontex.shell-extension.zip`:

```bash
gnome-extensions install --force giws@armontex.shell-extension.zip
```

On Wayland, log out and back in after installing a new extension. Then prepare
GNOME and enable GIWS:

```bash
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.mutter workspaces-only-on-primary false
gnome-extensions enable giws@armontex
```

GIWS refuses to enable when either workspace requirement is not met, leaving
the native shortcuts unchanged.

<!-- TODO(media): Add an Extension Manager installation screenshot after the extension is published. Recommended: assets/extension-manager.png. -->

### From source

Requirements:

- Node.js 22.18 or newer and npm 10;
- `zip`, `glib-compile-schemas` and `gnome-extensions`;
- GNOME Shell 46 for installation and runtime validation.

```bash
git clone --branch develop https://github.com/Armontex/GIWS.git
cd GIWS
npm ci
npm run install:extension
```

## Usage

Place the pointer on the monitor you want to control, then use GNOME's regular
workspace shortcuts. Common defaults include:

- `Ctrl+Alt+Left` / `Ctrl+Alt+Right`;
- `Super+Page Up` / `Super+Page Down`.

The exact key combinations remain controlled by GNOME Settings.

<!-- TODO(media): Add a preferences screenshot when user-facing settings are available. Recommended: assets/preferences.png. -->

## Project status

GIWS is under active development. `develop` contains the latest integrated
changes; `main` is reserved for stable releases.

Current compatibility and limitations:

| Area                  | Current support                   |
| --------------------- | --------------------------------- |
| GNOME Shell           | Version 46                        |
| Workspace mode        | Static workspaces                 |
| Display configuration | Workspaces spanning every display |
| Navigation            | Left and right                    |
| Windows               | Normal application windows        |
| Visual feedback       | Native animation on every monitor |

Sticky windows, special windows and other non-standard window types are left
untouched. A short manual check on physical monitors is still recommended for
visible animation and keyboard feel.

## Quality and testing

The regular quality gate covers formatting, ESLint, TypeScript, production
builds and the full Vitest suite:

```bash
npm run check
```

Unit tests cover GNOME-independent workspace calculations, shell adapters,
lifecycle cleanup and the build artifact contract.

The Linux-only runtime smoke test starts separate headless GNOME Shell sessions
with isolated D-Bus, dconf and XDG directories. It validates:

- extension lifecycle: `ACTIVE → INACTIVE → ACTIVE`;
- discovery of two virtual monitors;
- stock keyboard shortcut dispatch through Mutter;
- primary and secondary monitor window placement;
- Dash-style window activation in both directions;
- native animation and popup targeting;
- absence of GJS runtime errors during the interaction scenario.

```bash
npm run runtime:smoke
```

The smoke environment does not modify the active desktop session.

## Development

```bash
npm ci
npm run check
npm run pack
```

| Command                 | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `npm run check`         | Formatting, linting, type checking, build and tests |
| `npm test`              | Build and run the test suite                        |
| `npm run build`         | Compile the extension into `dist/`                  |
| `npm run pack`          | Create the installable extension ZIP                |
| `npm run runtime:smoke` | Run isolated GNOME lifecycle and interaction checks |

Commits and pull-request titles follow
[Conventional Commits](https://www.conventionalcommits.org/). Jira references
are intentionally not used.

### Project structure

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

## Roadmap

- [ ] Expand support to newer GNOME Shell releases.
- [ ] Publish GIWS for one-click installation through Extension Manager.
- [ ] Add the project logo, visual walkthrough and real multi-monitor demo.

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

## License

GIWS is available under the [MIT License](LICENSE).
