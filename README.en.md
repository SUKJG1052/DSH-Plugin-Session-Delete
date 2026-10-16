[简体中文](README.md) · **English**

# dsh-plugin-session-delete

**Delete sessions from the DeepSeek Harness UI — for real.** Archiving only hides them, and a corrupted session just won't go away. This plugin supplies the missing last step.

Built for DSH **0.2.x** (the web client and the desktop app alike).

<img width="1800" height="1020" alt="Delete-session confirmation dialog" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## Features

**Two entry points, one confirmation dialog**

- **Trash button in the conversation header**: the delete action next to the session title; for a running session its tooltip becomes "Delete session (running — deleting will stop the task)".
- **Sidebar session-row "…" menu → Delete session**: placed after the shipped pin / rename / fork / archive group.

**Confirmation dialog**: shows the session name and id, adds a warning when the session is running, and keeps the delete button disabled until **"I understand the consequences. Confirm deletion"** is ticked.

**Delete chain**: the session log, the projection cache and the workspace accounting are removed together, through the live storageDomain, so in-memory state and on-disk units stay consistent — a later flush cannot resurrect the session.

**Agent tool**: `workbench_session_delete`, so agents can delete sessions too.

**Bilingual**: all copy follows the UI language (the language setting or the browser language) and switches live.

## Installation

The plugin lives on GitHub only (it is not published to npm). **No clone, no local path** — install it from the repository's tarball URL and anyone can just copy-paste the command.

`v0.4.1` below is the version and `<profile>` is your profile name: `web` for the web client, `desktop` for the desktop app.

```
https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/tags/v0.4.1
```

**Option 1 — install from the UI (recommended)**

Sidebar → "Plugins" page → "Add plugin" → paste the line above into "Package name or URL" → "Install" → restart DSH.

**Option 2 — command line**

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/tags/v0.4.1
```

- The desktop app ships no global `dsh` command; use the CLI it carries, `resources\runtime\cli\bin\dsh.cmd` under the install directory (`resources/runtime/cli/bin/dsh` on macOS / Linux). The arguments are identical.
- Before the first CLI use on the desktop app, launch it once (so the `desktop` profile exists), then fully quit it before running the command.
- The command must carry `--profile`; without it the CLI fails with `required option '--profile <name>' not specified`.
- Restart the profile to apply (a profile with HMR enabled picks it up immediately).

**To always track the latest code**, swap the tail of the URL for `refs/heads/main`:

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/heads/main
```

**Upgrading**: in the UI, uninstall and install the new version (the install dialog says so itself: there is no automatic update yet); on the command line, run `add` again with the new version's URL — the package name is unchanged, so pnpm replaces the version.

**Uninstall**

```sh
dsh plugin --profile <profile> remove @huanlin/dsh-plugin-session-delete
```

**Why the codeload URL instead of the `github:` shorthand?** With `github:SUKJG1052/DSH-Plugin-Session-Delete` or `https://github.com/SUKJG1052/DSH-Plugin-Session-Delete`, DSH first runs a `git ls-remote` reachability check against GitHub, and an unreachable GitHub stops there with "GitHub connection timed out"; the `.tar.gz` URL counts as a tarball install and skips that check. The repository is public, so the URL needs no credentials or account.

## Usage

- To delete a session: hover a sidebar row → "…" → "Delete session", or click the trash button in the conversation header; tick the consent box, then click Delete. The client re-fetches the session list afterwards.
- To have an agent delete one: describe which session to delete and the agent calls `workbench_session_delete` (parameter `sessionId`; both the raw `uuid` and the `session-<uuid>` form are accepted).
- Deleting a **running** session stops its task first — work in progress is interrupted.

## How it works

The host half (`src/index.js`) registers two HTTP endpoints and one tool:

| Endpoint / tool | Purpose |
| --- | --- |
| `GET /__chameleon/session/list` | Lets the client resolve session ids and titles |
| `POST /__chameleon/session/delete` | Delete entry point used by the button and the menu item |
| `workbench_session_delete` | Delete tool used by agents |

Deletion runs in a fixed order so it cannot half-succeed:

1. session running → `cancel` and wait for quiescence (time-boxed, so a stuck driver never blocks the deletion);
2. flush the live session so dispose-time teardown has no pending writes;
3. remove the persisted log directory (cleaning both the raw uuid and the `session-` prefixed id form);
4. drop the projection-cache row (`session_projcache` / `sessions`);
5. **only after the log is confirmed gone**, remove the workspace accounting (`sessionIds` arrays and `global.archivedSessionIds`).

That ordering between steps 3 and 5 is what v0.3.1 fixed so a partially deleted session cannot fall out of its group.

The client half (`src/client.js`) uses declared slots rather than DOM injection:

| Slot | Content |
| --- | --- |
| `conversation.session.header.actions` | Header trash button |
| `sidebar.workspaces.session.menu.item` | Session-row "…" menu item, handed the row's `sessionId` / `displayTitle` directly |
| `shell.overlay` | Risk-consent dialog |

Both endpoints are registered on `webServer`, and DSH's browser authentication (Host/Origin fence plus the session cookie) only covers the `/api` Host Connection carrier — so since v0.4.1 the plugin applies its own **cross-site fence** inside both handlers: a browser request that carries `Sec-Fetch-Site: cross-site`, or an `Origin` whose authority differs from the request's own `Host` (including `Origin: null`), gets 403. The app's own page is same-origin, and the CLI / curl / in-process tools send neither header, so nothing inside the app changes.

## Compatibility

- **DSH 0.2.x** (web and the desktop client, including 0.2.0-rc.1 / 0.2.0-rc.2): supported. `peerDependencies` declares `@deepseek-ai/dsh-tools ^0.2.0-rc.1`, which satisfies the 0.2.x compatibility gate.
- **DSH 0.1.x**: not supported. Since 0.2.0 the ui-primitives icon naming and the sidebar menu slot contract both changed, and v0.4.x is written against 0.2.x.

At install time DSH compares the running version against that peer range and refuses the install on a mismatch, printing an exact-version exemption command (`dsh plugin allow-version ... --accept-risk`). Do not take the exemption unless you understand the risk — the right move is the plugin version that matches your DSH version.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "GitHub connection timed out" / "Cannot reach GitHub" | You used the repository URL and DSH's reachability check failed. Use the codeload `.tar.gz` URL above instead. |
| "This plugin is already installed. To upgrade, uninstall and reinstall" | In the UI, uninstall then install the new version; on the CLI just `add` the new URL. |
| "This package declares no bundle, so it cannot be installed as a plugin" | Wrong package — this plugin's name is `@huanlin/dsh-plugin-session-delete`. |
| `dsh plugin --profile desktop` says the profile is not initialized | Launch the desktop app once to create the profile, quit it completely, then retry. |
| Nothing changed in the UI after install | Restart DSH (the dialog says "installed, will load on next start"). |
| The plugin list shows a failure / incompatible | Version mismatch — see Compatibility above. |

## Caveats

- Deletion is **permanent**: log, statistics and workspace accounting are all removed; there is no trash bin.
- The desktop app and the web client share one `~/.dsh` store — run only one DSH instance at a time to avoid concurrent writes.
- With the host half installed, agents genuinely can delete sessions (the UI button is handed to the model). If that is not wanted, skip the plugin or constrain agents through permissions.
- The two HTTP endpoints do not go through DSH's browser authentication: cross-site browser requests are refused since v0.4.1 (403), but **other processes on the same machine can still call them**. Do not bind webServer to `0.0.0.0` on an untrusted network, and use this only where you trust the local machine.

## Development

A `file:` install points at a directory on your own machine, so it is **for your own debugging only** — other people cannot install from that command:

```sh
dsh plugin --profile <profile> add file:C:/path/to/DSH-Plugin-Session-Delete
```

Two source files, no build step:

- `src/index.js` — the host half (ESM, named exports `apply` / `inject` / `name`).
- `src/client.js` — the client half (a classic script registered through `window.__ModuleLoader__.load({ id, factory })`; `React.createElement` only, `--dsw-*` theme tokens for styling).
- `cordis.patch.yml` — the bundle layer that inserts the row id `chameleon-session-delete`.

Installed via `file:`, pnpm hardlinks the sources: editing the workspace copy updates the installed profile in place, but a git branch switch or `checkout` replaces the files and breaks the link — just run `add` again.

To check syntax before restarting, run `node --check` on a copy with an `.mjs` extension (the file is ESM), then restart the profile and watch the plugin's status in the "Plugins" page.

## Changelog

- **v0.4.1 (2026-10-16)**: rewrote the installation docs and fenced the endpoints against cross-site calls.
  - The installation section is now copy-pasteable by anyone: the `file:C:/path/to/...` line moved to Development with an explicit note that it is author-only, leaving two genuinely usable routes — "Add plugin" in the UI and `dsh plugin add <tarball URL>` — plus pinned-tag and main-branch URLs, upgrade and uninstall steps, the bundled desktop CLI path and its caveats, and a troubleshooting table of the real error messages.
  - Added a cross-site request fence: the two endpoints are registered on `webServer`, a carrier that runs no browser authentication (DSH applies its Host/Origin fence and cookie check only to the `/api` Host Connection carrier), so previously anything able to reach the port could call the delete endpoint. Browser requests carrying `Sec-Fetch-Site: cross-site`, or an `Origin` whose authority differs from the request `Host` (including `Origin: null`), now get 403; the app's page is same-origin and the CLI / curl / in-process tools send neither header, so the delete chain behaves exactly as before.
  - The host delete chain and the client slot implementation are unchanged from v0.4.0.
- **v0.4.0 (2026-09-29)**: Adapted to DSH 0.2.x.
  - Icons now use `IconTrashOutlineRegular` (0.2.x dropped the 16-suffixed names such as `IconTrashOutline16`), with a `Regular → Medium → legacy name` fallback chain so an undefined component can never crash the whole surface.
  - The sidebar session-row "…" menu item moved from DOM injection (it matched `[class*=sessionRow]`, an identifier that no longer exists in 0.2.x and would fail silently) to the declared slot `sidebar.workspaces.session.menu.item`: the host's `MenuItemButton` supplies the matching row styling and danger colors, the entry receives the row's `sessionId`/`displayTitle` directly (no title matching), and `order: 500` places it after the shipped group (pin 100 / rename 200 / fork 300 / archive 400).
  - `peerDependencies` raised from `@deepseek-ai/dsh-tools ^0.1.0-rc.6` to `^0.2.0-rc.1`; the old declaration is refused outright by the 0.2.x compatibility gate.
  - `dsh.client.inject` now lists packages that actually exist (`@deepseek-ai/dsh-client-runtime` is gone in 0.2.x), plus `dsh.manifestVersion: 1`.
  - The host half needed no code change: `defineTool`, `ctx.tools.register`, `agents`, `sessions.flush`, `storageDomain`'s `table`/`global` and `webServer.register` all keep their 0.2.x signatures.
- **v0.3.1 (2026-08-14)**: Fixed deleted sessions being left as "Ungrouped" rows after a partial delete. The host now cleans both raw UUID and `session-`-prefixed id forms, deletes the on-disk log and confirms it before removing workspace accounting (so a failed delete cannot detach a session from its group), and flushes a live session before detaching it to prevent dispose-time rewrites from recreating the log directory.
- **v0.3.0 (2026-08-14)**: Added English adaptation (i18n). All copy of the delete dialog, the header trash button and the sidebar "Delete session" menu item now lives in client zh/en dictionaries and follows the UI language (the language setting or the browser language), updating live on switch; environments without the locale service fall back to the built-in dictionaries by browser language.

## License & credits

MIT. This repository is a fork of [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete); v0.4.0 reworked it against the DSH 0.2.x interfaces.

[← 简体中文](README.md)
