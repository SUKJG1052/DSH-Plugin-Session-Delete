[简体中文](README.md) · **English**

# dsh-plugin-session-delete

**Delete sessions from the DeepSeek Harness UI — for real.** Archiving only hides them, and a corrupted session just won't go away. This plugin supplies the missing last step.

Built for DSH **0.2.x** (the web client and the desktop app alike); the current release has been verified against **0.2.2-rc.3**.

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
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.5
dsh --profile <profile> --dump-config   # optional: confirm chameleon-session-delete is in the tree
```

**Install from the UI**: Sidebar → "Plugins" page → "Add plugin" → paste `github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.5` (or the tarball URL) into "Package name or URL" → "Install" → restart DSH.

**Upgrading**: in the UI, uninstall and install the new version (the install dialog says so itself: there is no automatic update yet); on the command line, run `add` again with the new version — as long as the package name is unchanged, pnpm replaces the version.

**Uninstall**

```sh
dsh plugin --profile <profile> remove @sukjg1052/dsh-plugin-session-delete
```

## Usage

- To delete a session: hover a sidebar row → "…" → "Delete session", or click the trash button in the conversation header; tick the consent box, then click Delete. The client re-fetches the session list afterwards.
- To have an agent delete one: describe which session to delete and the agent calls `workbench_session_delete` (parameter `sessionId`: the bare id and the `session-` prefixed form both work, and UUIDs, counter ids and custom ids are all accepted).
- Deleting a **running** session stops its task first — work in progress is interrupted.

## Compatibility

- **DSH 0.2.1 and later 0.2.x** (web and the desktop client; tested on `0.2.2-rc.3`): supported.
- **DSH 0.2.0-rc.x**: still works (the host / client code is identical to v0.4.2).
- **DSH 0.1.x**: not supported. Since 0.2.0 the ui-primitives icon naming and the sidebar menu slot contract both changed, and v0.4.x is written against 0.2.x.

## License & credits

MIT — see [LICENSE](LICENSE) for the full text. This repository started from [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) and has been maintained independently against the DSH 0.2.x interfaces since v0.4.0; both the upstream and this repository's copyright notices are kept in the LICENSE file.

[← 简体中文](README.md)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
