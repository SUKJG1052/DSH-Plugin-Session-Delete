[简体中文](README.md) · **English**

# dsh-plugin-session-delete

**Delete sessions from the DeepSeek Harness UI — for real.** Archiving only hides them, and a corrupted session just won't go away. This plugin supplies the missing last step.

Built for DSH **0.2.x** (the web client and the desktop app alike); this release is checked item by item against **0.2.1-rc.3**.

<img width="1800" height="1020" alt="Delete-session confirmation dialog" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## Features

**Two entry points, one confirmation dialog**

- **Trash button in the conversation header**: the delete action next to the session title; for a running session its tooltip becomes "Delete session (running — deleting will stop the task)".
- **Sidebar session-row "…" menu → Delete session**: placed after the shipped pin / rename / fork / archive group.

**Confirmation dialog**: shows the session name and id, adds a warning when the session is running, and keeps the delete button disabled until **"I understand the consequences. Confirm deletion"** is ticked.

**Delete chain**: the session log, the projection cache and the workspace accounting are removed together, through the live storageDomain, so in-memory state and on-disk units stay consistent — a later flush cannot resurrect the session.

**Agent tool**: `workbench_session_delete`, so agents can delete sessions too.

**Bilingual**: all copy follows the UI language (the language setting or the browser language) and switches live.

**Plugins page entry**: the plugin list shows the localized title "Session Delete" and a one-line description (`locale/zh.json` / `locale/en.json`) instead of the bare package name.

## Installation

The plugin lives on GitHub only (it is not published to npm), and it installs like any other GitHub plugin — one command, no clone, no local path.

`<profile>` is your profile name (`web` for the web client, `desktop` for the desktop app) and `#v1.0.2` is the version to install.

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

- **DSH 0.2.1 and later 0.2.x** (web and the desktop client; tested on `0.2.1-rc.3`): supported. v0.5.0 re-checked every interface the plugin depends on against 0.2.1 — the three slot contracts (`conversation.session.header.actions`, `sidebar.workspaces.session.menu.item`, `shell.overlay`), `ui-primitives`' `Modal` / `MenuItemButton` / `IconTrashOutlineRegular`, the client module loading protocol (`window.__ModuleLoader__.load`) and the host services (`defineTool`, `ctx.tools.register`, `storageDomain`, `agents`, `sessions`, `webServer.register`) — and all of them are unchanged from 0.2.0. v1.0.2 re-checked the same surface against 0.2.1-rc.3: the `dsh.client` declaration parser (`platform` / `inject` / `external` / `immediately`), the platform baseline module table (`react`, `@deepseek-ai/dsh-client-ui-primitives`), the three slot contracts, `ui-primitives`' `Modal` / `MenuItemButton` / `IconTrashOutlineRegular`, the client module protocol and the host services are unchanged; rc.3's new header View tabs / More menu (`conversation.session.header.views.actions`) and the additive `ui-primitives` exports (`IconAppsAddOutlineRegular` / `Medium`, `MenuItemButton.current`, `Menu.minWidthFromAnchor`) do not conflict.
- **DSH 0.2.0-rc.x**: still works (the host / client code is identical to v0.4.2).
- **DSH 0.1.x**: not supported. Since 0.2.0 the ui-primitives icon naming and the sidebar menu slot contract both changed, and v0.4.x is written against 0.2.x.

The supported range is declared by `engines.dsh` alone (`>=0.2.0-rc.1 <0.3.0-0`, i.e. the whole 0.2.x line), which DSH 0.2.1 and later judge the plugin by. v1.0.1 drops the `peerDependencies` declaration: under npm's prerelease rules a peer range like `^0.2.0-rc.1` (upper bound `<0.3.0-0`) never matches `0.2.1-rc.2`, so the plugin market's (dshmarket) diagnostics reported a spurious incompatibility and pnpm added an unmet-peer warning to every profile operation — while the host has ignored peers since 0.2.1 anyway. On a mismatch DSH refuses the install and prints an exact-version exemption command (`dsh plugin allow-version ... --accept-risk`). Do not take the exemption unless you understand the risk — the right move is the plugin version that matches your DSH version.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "GitHub connection timed out" / "Cannot reach GitHub" | DSH's reachability pre-check failed. Use the codeload `.tar.gz` URL (it skips that check). |
| A git-related failure with the `github:` form (e.g. `getRepoRefs`) | There is no git on the machine, or git is not on PATH. Install git, or use the tarball URL. |
| "This plugin is already installed. To upgrade, uninstall and reinstall" | In the UI, uninstall then install the new version; on the CLI just `add` the new version again. |
| "This package declares no bundle, so it cannot be installed as a plugin" | Wrong package — this plugin's name is `@sukjg1052/dsh-plugin-session-delete`. |
| `dsh plugin --profile desktop` says the profile is not initialized | Launch the desktop app once to create the profile, quit it completely, then retry. |
| Nothing changed in the UI after install | Restart DSH (the dialog says "installed, will load on next start"). |
| The plugin list shows a failure / incompatible | Version mismatch — see Compatibility above. |

## Changelog

- **v1.0.2 (2026-10-25)**: adapted to DSH 0.2.1-rc.3; the code is unchanged.
  - Compatibility gate: `engines.dsh` (`>=0.2.0-rc.1 <0.3.0-0`) already covers 0.2.1-rc.3; installation, loading and the gate verdict were verified on rc.3.
  - Host side: between rc.2 and rc.3, `dsh-tools` / `dsh-host-webserver` / `dsh-app-boot` / `dsh-client-locale` only changed dependency manifests — `defineTool`, `ctx.tools.register`, `storageDomain`, `agents`, `sessions` and `webServer.register` are unchanged.
  - Client side: the `dsh.client` declaration parser and the client module system runtime are unchanged (client-modules only changed its release commit); `react` and `@deepseek-ai/dsh-client-ui-primitives` are still in the platform baseline table; the three slot contracts are unchanged. rc.3's new header View tabs / More menu and the additive ui-primitives exports are purely additive and do not affect the implementation.
  - Verified on an isolated `web` profile with `DSH_HOME` under a temp directory, booted on 0.2.1-rc.3: the boot graph carries this plugin's entry (with the correct `inject` list), the client bundle is served through `/plugins` and registers via `__ModuleLoader__.load`, `apply` registers the three slots, and the host tool `workbench_session_delete` is registered.
- **v1.0.1 (2026-10-19)**: fixed a spurious peer-compatibility warning shown in the plugin market.
  - Dropped `peerDependencies` (`@deepseek-ai/dsh-tools ^0.2.0-rc.1`). Under npm's prerelease rules `^0.2.0-rc.1` means `>=0.2.0-rc.1 <0.3.0-0`, and `0.2.1-rc.2` is admitted only when a comparator with the **same major.minor.patch tuple** itself carries a prerelease tag — none here is on `0.2.1`, so it was judged a mismatch. dshmarket's diagnostics therefore printed `peer range @deepseek-ai/dsh-tools@^0.2.0-rc.1 does not match resolved 0.2.1-rc.2`, and pnpm added an unmet-peer warning after every profile operation. Since DSH 0.2.1 already judges the plugin by `engines.dsh` and ignores a coexisting peer, removing the declaration changes no host gate — it only removes those two false alarms.
  - Tightened the `engines.dsh` upper bound from `<0.3.0` to `<0.3.0-0`: under npm's `includePrerelease` semantics `<0.3.0` also admits `0.3.0` prereleases (e.g. `0.3.0-rc.1`), while `<0.3.0-0` is the correct "0.2.x only" bound; every 0.2.x prerelease and release still passes.
  - The code is identical to v1.0.0; the only other changes are the version bump and this documentation.
- **v1.0.0 (2026-10-18)**: standalone release, no longer a fork.
  - The package was renamed from `@huanlin/dsh-plugin-session-delete` to `@sukjg1052/dsh-plugin-session-delete` (`@huanlin` is the upstream namespace); the `cordis.patch.yml` row name and the client bundle's registration id follow. Upgrading from 0.5.x means uninstalling the old package first (see "Upgrading from 0.5.x or earlier").
  - Non-UUID session ids are supported: the endpoint and the agent tool no longer require a UUID shape and validate for **path safety** instead (rejecting path separators, Windows-reserved characters, control characters, `.` / `..`, and trailing dots or spaces), so counter ids, custom ids and both `session-` spellings all work.
  - Added `LICENSE` (MIT, keeping the upstream lsz-asd notice and this repository's notice); the README's identity changed from "fork" to "started from upstream, maintained independently".
  - Everything else (slot implementation, delete chain, cross-site fence) is unchanged from v0.5.0.
- **v0.5.0 (2026-10-17)**: adapted to DSH 0.2.1.
  - Compatibility moved to 0.2.1's `engines.dsh` (`>=0.2.0-rc.1 <0.3.0`) — DSH 0.2.1 and later judge by it, while `peerDependencies` stays for older runtimes.
  - Added plugin display metadata: `locale/zh.json` / `locale/en.json` `meta.title` / `meta.description` make the plugins page show "Session Delete" and a one-line description instead of the bare package name; `exports` gained `./locale/*.json` and `files` now ships `locale/`.
  - `dsh.client.inject` no longer lists `@deepseek-ai/dsh-client-ui-slots`, which no longer exists in 0.2.1: ui-slots / ui-primitives now live in the web shell's shared module table, so the bundle's `require` calls still resolve.
  - No host / client code changes. Every dependency was re-checked against 0.2.1 (slot contracts, `Modal` / `MenuItemButton` / icon exports, the client module protocol, host services) and matches; the same host behaviour tests pass (cross-site fence, deletion in both id spellings, 400 / 404 / 405, the agent tool), and on the live instance both the session-list endpoint and the client bundle load.
- **v0.4.2 (2026-10-16)**: the install command is now the `github:` shorthand every other plugin uses.
  - Primary form: `dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v0.4.2`, followed by a `dsh --profile <profile> --dump-config` self-check (the `chameleon-session-delete` row must appear in the tree).
  - The codeload tarball URL became the fallback, with its actual use case spelled out: no git on the machine, or an unreachable github.com — the `github:` form clones through your local git, while the tarball URL is downloaded by pnpm directly, needs no git and skips DSH's GitHub reachability pre-check.
  - Documentation only; the code is identical to v0.4.1.
- **v0.4.1 (2026-10-16)**: rewrote the installation docs and fenced the endpoints against cross-site calls.
  - The installation section is now copy-pasteable by anyone: the `file:C:/path/to/...` line moved out of the install steps with an explicit note that it is author-only, leaving two genuinely usable routes — "Add plugin" in the UI and `dsh plugin add <tarball URL>` — plus pinned-tag and main-branch URLs, upgrade and uninstall steps, the bundled desktop CLI path and its caveats, and a troubleshooting table of the real error messages.
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

MIT — see [LICENSE](LICENSE) for the full text. This repository started from [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) and has been maintained independently against the DSH 0.2.x interfaces since v0.4.0; both the upstream and this repository's copyright notices are kept in the LICENSE file.

[← 简体中文](README.md)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
