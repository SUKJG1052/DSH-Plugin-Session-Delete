[简体中文](README.md) · **English**

# dsh-plugin-session-delete

**Delete sessions from the DeepSeek Harness UI — for real.** Archiving only hides them, and a corrupted session just won't go away. This plugin supplies the missing last step.

Built for DSH **0.2.x** (the web client and the desktop app alike); the current release has been verified against **0.2.1-rc.3**.

<img width="1800" height="1020" alt="Delete-session confirmation dialog" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## Features

**Entry points**

- **Trash button in the conversation header**: the delete action next to the session title; for a running session its tooltip becomes "Delete session (running — deleting will stop the task)".
- **Sidebar session-row "…" menu → Delete session**: placed after the shipped pin / rename / fork / archive group.

**Confirmation dialog**: shows the session name and id, adds a warning when the session is running, and keeps the delete button disabled until **"I understand the consequences. Confirm deletion"** is ticked.

**Delete chain**: the session log, the projection cache and the workspace accounting are removed together, through the live storageDomain, so in-memory state and on-disk units stay consistent — a later flush cannot resurrect the session.

**Agent tool**: `workbench_session_delete`, so agents can delete sessions too.

**Bilingual**: all copy follows the UI language (the language setting or the browser language) and switches live.

**Plugins page entry**: the plugin list shows the localized title "Session Delete" and a one-line description (`locale/zh.json` / `locale/en.json`) instead of the bare package name.

## Installation

The plugin is published on GitHub only; it installs like any other GitHub plugin.

```sh
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.2
dsh --profile <profile> --dump-config   # optional: confirm chameleon-session-delete is in the tree
```

- The desktop app ships no global `dsh` command; use the CLI it carries, `resources\runtime\cli\bin\dsh.cmd` under the install directory (`resources/runtime/cli/bin/dsh` on macOS / Linux). The arguments are identical.
- Before the first CLI use on the desktop app, launch it once (so the `desktop` profile exists), then fully quit it before running the command.
- The command must carry `--profile`; without it the CLI fails with `required option '--profile <name>' not specified`.
- Restart the profile to apply (a profile with HMR enabled picks it up immediately).

**Install failing, or no git on the machine?** The `github:` form clones through your local `git`, so it needs git and a reachable github.com. The tarball URL needs neither — pnpm downloads it directly and DSH's GitHub reachability pre-check is skipped:

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/tags/v1.0.2
```

**To install the latest code from the default branch**: with `github:` swap `#v1.0.2` for `#main` (or drop it entirely); with the tarball URL swap `refs/tags/v1.0.2` for `refs/heads/main`.

**Install from the UI**: Sidebar → "Plugins" page → "Add plugin" → paste `github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.2` (or the tarball URL) into "Package name or URL" → "Install" → restart DSH.

**Upgrading**: in the UI, uninstall and install the new version (the install dialog says so itself: there is no automatic update yet); on the command line, run `add` again with the new version — as long as the package name is unchanged, pnpm replaces the version.

**Upgrading from 0.5.x or earlier**: v1.0.0 renamed the package (`@huanlin/…` → `@sukjg1052/…`), so uninstall the old one first:

```sh
dsh plugin --profile <profile> remove @huanlin/dsh-plugin-session-delete
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.2
```

**Uninstall**

```sh
dsh plugin --profile <profile> remove @sukjg1052/dsh-plugin-session-delete
```

## Usage

- To delete a session: hover a sidebar row → "…" → "Delete session", or click the trash button in the conversation header; tick the consent box, then click Delete. The client re-fetches the session list afterwards.
- To have an agent delete one: describe which session to delete and the agent calls `workbench_session_delete` (parameter `sessionId`: the bare id and the `session-` prefixed form both work, and UUIDs, counter ids and custom ids are all accepted).
- Deleting a **running** session stops its task first — work in progress is interrupted.

## Compatibility

- **DSH 0.2.1 and later 0.2.x** (web and the desktop client; tested on `0.2.1-rc.3`): supported.
- **DSH 0.2.0-rc.x**: still works (the host / client code is identical to v0.4.2).
- **DSH 0.1.x**: not supported. Since 0.2.0 the ui-primitives icon naming and the sidebar menu slot contract both changed, and v0.4.x is written against 0.2.x.

The supported range is declared by `engines.dsh` alone (`>=0.2.0-rc.1 <0.3.0-0`, i.e. the whole 0.2.x line), which DSH 0.2.1 and later judge the plugin by. v1.0.1 drops the `peerDependencies` declaration: under npm's prerelease rules a peer range like `^0.2.0-rc.1` (upper bound `<0.3.0-0`) never matches `0.2.1-rc.2`, so the plugin market's (dshmarket) diagnostics reported a spurious incompatibility and pnpm added an unmet-peer warning to every profile operation — while the host has ignored peers since 0.2.1 anyway. On a mismatch DSH refuses the install and prints an exact-version exemption command (`dsh plugin allow-version ... --accept-risk`). Do not take the exemption unless you understand the risk — the right move is the plugin version that matches your DSH version.

## Changelog

- **v1.0.2 (2026-10-25)**: adapted to DSH 0.2.1-rc.3 (host / client interfaces and slot contracts re-checked); the code is unchanged.
- **v1.0.1 (2026-10-19)**: dropped `peerDependencies`, removing the plugin market's spurious peer-compatibility warning; tightened the `engines.dsh` upper bound to `<0.3.0-0`.
- **v1.0.0 (2026-10-18)**: standalone release, renamed to `@sukjg1052/dsh-plugin-session-delete`; non-UUID session ids supported; added `LICENSE`.
- **v0.5.0 (2026-10-17)**: adapted to DSH 0.2.1 (`engines.dsh`, plugin display metadata, client inject list).
- **v0.4.2 (2026-10-16)**: install command switched to the `github:` shorthand.
- **v0.4.1 (2026-10-16)**: rewrote the installation docs; added the cross-site request fence to the delete endpoints.
- **v0.4.0 (2026-09-29)**: adapted to DSH 0.2.x (official slots, icons, client inject list).
- **v0.3.1 (2026-08-14)**: fixed deleted sessions being left as "Ungrouped" rows.
- **v0.3.0 (2026-08-14)**: added English adaptation (i18n).

## License & credits

MIT — see [LICENSE](LICENSE) for the full text. This repository started from [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) and has been maintained independently against the DSH 0.2.x interfaces since v0.4.0; both the upstream and this repository's copyright notices are kept in the LICENSE file.

[← 简体中文](README.md)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
