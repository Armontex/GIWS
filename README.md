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

The current skeleton intentionally implements no workspace behavior. Commits
and pull-request titles follow
[Conventional Commits](https://www.conventionalcommits.org/); Jira references
are not used.

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
