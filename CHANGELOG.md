# Changelog

All notable changes to GIWS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Upload each release archive to extensions.gnome.org from the release workflow
  when the `EGO_USERNAME` and `EGO_PASSWORD` secrets are set.

## [0.1.2] - 2026-11-02

### Fixed

- Keep the Overview bound to the views GNOME rebuilds while it stays open, so a
  vertical swipe no longer leaves every monitor scrolling together, and let go
  of views GNOME has destroyed.
- Order secondary-monitor thumbnails by that monitor's own workspaces, so the
  current-workspace frame sits on the right thumbnail.
- Bound Overview and desktop swipes, keyboard shortcuts, scrolling and the
  workspace popup by the logical workspaces of the monitor they act on, instead
  of the physical order.
- Stop an interrupted Overview swipe from activating its logical position as a
  physical workspace.
- Forget the target of a swipe that a new swipe took over, so it no longer
  claims a later switch on another monitor and leaves that monitor's windows
  behind.
- Finish workspace animations without touching groups or window clones that
  GNOME has already disposed.

## [0.1.1] - 2026-09-21

### Fixed

- Stop shipping the compiled GSettings schema inside the extension archive.
  extensions.gnome.org compiles it on install and rejects packages that carry
  the build artifact.

## [0.1.0] - 2026-09-17

### Added

- Independent workspace switching for each monitor on GNOME Shell 46.
- Monitor-aware handling for native keyboard shortcuts, Overview scrolling,
  touchpad gestures, Dash activation, and focused-window activation.
- Native workspace animations and workspace popup targeting on the monitor where
  the interaction started.
- Runtime guards for static workspaces spanning all displays, with clean
  restoration of GNOME handlers when the extension is disabled.
- TypeScript-based extension structure with settings, preferences, lifecycle,
  and contextual logging support.
- Isolated headless GNOME runtime and interaction smoke tests covering two
  virtual monitors without modifying the active desktop session.
- Continuous integration for static checks, builds, tests, and installable
  extension package artifacts.
- Automated release flow: a version without a tag proposes the merge into
  `main`, the merged commit is tagged and published with the extension archive
  attached, and `main` is merged back into `develop`.
- Project logo and a recorded two-monitor demonstration, captured from the same
  headless GNOME session the smoke tests use.

### Fixed

- Preserve the explicitly selected monitor during nested window activation.
- Keep inactive monitors visually stable while another monitor changes
  workspace.
- Prevent redundant or restarted Overview animations and settle compensated
  window previews after transitions.
- Limit primary-monitor workspace animation to the primary monitor.

[Unreleased]: https://github.com/Armontex/GIWS/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Armontex/GIWS/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Armontex/GIWS/releases/tag/v0.1.0
