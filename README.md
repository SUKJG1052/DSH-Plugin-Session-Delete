# dsh-plugin-session-delete

你是否困扰于 web 端无法删除对话？是否觉得归档对话键只是隐藏对话，删除得不够彻底？是否在尝试编辑 harness 时遇到对话话历史无法同步，而损坏的对话又无法删除？这个插件可以帮你！

**在 DeepSeek Harness 界面里安全地彻底删除会话。** 在会话顶部添加垃圾桶按钮，侧栏会话行 "..." 菜单内添加"删除会话"项，点击后出现风险确认弹窗（需勾选）；确认后会删除会话日志、投影缓存与工作区记账；运行中的会话会有提示，若仍选择删除会停止运行并删除。可在web中使用，并且理论上兼容一切web套壳的客户端。
**添加agent工具让agent可以删除会话。** 工具名`workbench_session_delete`

## 安装

从仓库直接装（不用先 clone；部分网络下 `github:` 简写会去连 github.com 而超时，codeload 直链更稳）：

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/heads/main
```

本地开发时用 `file:`：

```sh
dsh plugin --profile <profile> add file:C:/path/to/DSH-Plugin-Session-Delete
```

重启 profile 生效。

## 兼容性

- **DSH 0.2.x**（web 与桌面端，含 0.2.0-rc.1 / 0.2.0-rc.2）：支持。`peerDependencies` 声明为 `@deepseek-ai/dsh-tools ^0.2.0-rc.1`。
- **DSH 0.1.x**：不支持。0.2.0 起 ui-primitives 的图标命名与侧栏菜单的槽位契约都已变更，v0.4.0 按 0.2.x 编写。

## 功能

- 会话头部垃圾桶按钮
- 侧栏会话行 "..." 菜单注入"删除会话"项
- `RiskConfirmation` 风险确认：勾选"我已了解后果"后确认可用
- 删除链路：会话目录 + 投影缓存 + 工作区记账（经活动 storageDomain，内存/磁盘一致）
- `workbench_session_delete` 工具：agent 可直接删除会话

## 后续开发计划

- 添加更多针对会话的操作工具和选项
- 将已有的针对会话的选项做成工具提供给agent
- 
<img width="1800" height="1020" alt="image" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## 更新日志

- **v0.4.0（2026-09-29）**：适配 DSH 0.2.x。
  - 图标改用 `IconTrashOutlineRegular`（0.2.x 已移除 `IconTrashOutline16` 这类 16 后缀命名），并保留 `Regular → Medium → 旧名` 回退链，避免组件为 undefined 时整块 UI 崩掉。
  - 侧栏会话行「...」菜单项从 DOM 注入（依赖 `[class*=sessionRow]`，该标识在 0.2.x 已不存在、会静默失效）改为官方槽位 `sidebar.workspaces.session.menu.item`：用宿主 `MenuItemButton` 获得一致的样式与危险色，直接取该行的 `sessionId`/`displayTitle`，不再依赖标题匹配；`order: 500` 排在宿主自带固定组（pin 100 / rename 200 / fork 300 / archive 400）之后。
  - `peerDependencies` 由 `@deepseek-ai/dsh-tools ^0.1.0-rc.6` 提升到 `^0.2.0-rc.1`：旧声明会被 0.2.x 的兼容门禁直接拒绝安装。
  - `dsh.client.inject` 换成真实存在的客户端包（`@deepseek-ai/dsh-client-runtime` 在 0.2.x 已不存在），并补上 `dsh.manifestVersion: 1`。
  - host 半边无需改动：`defineTool`、`ctx.tools.register`、`agents`、`sessions.flush`、`storageDomain` 的 `table`/`global`、`webServer.register` 在 0.2.x 中签名一致。

- **v0.3.1（2026-08-14）**：修复删除会话后残留日志导致会话跑到「未分组」的问题。删除时同时清理原始 id 与 `session-` 前缀两种 id 形式；先删除磁盘日志并确认成功后再解除工作区记账，避免半删除会话脱离原分组；删除前先 flush 活动会话，防止 dispose 阶段回写/重建日志目录。
- **v0.3.0（2026-08-14）**：新增英文适配（i18n）。删除对话框、头部垃圾桶按钮与侧栏「删除会话」菜单项的全部文案接入客户端 zh/en 字典，跟随界面语言（设置中的语言或浏览器语言）自动切换并即时生效；未加载 locale 服务的环境会按浏览器语言回退到内置中英文字典。

---

# dsh-plugin-session-delete

Frustrated that sessions can't be deleted from the web client? Bothered by abandoned or mistyped conversations cluttering your sidebar? Ever tried editing your harness only to find the session history out of sync — with a corrupted session that just won't go away? This plugin has your back!

**Safely delete sessions from the DeepSeek Harness UI.** Adds a trash button at the top of the conversation and a "Delete session" item to the sidebar session-row "..." menu; clicking either opens a risk-consent dialog (checkbox required). On confirm, the session log, projection cache and workspace accounting are removed. Running sessions show a warning — if you still choose to delete, the session is stopped and then deleted. Works in the web, and is theoretically compatible with any web-shell-based client.
**Also adds an agent tool so agents can delete sessions.** Tool name: `workbench_session_delete`

## Installation

Install straight from the repository (no clone needed; on some networks the `github:` shorthand tries github.com and times out, while the codeload tarball URL goes through):

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/heads/main
```

For local development use `file:`:

```sh
dsh plugin --profile <profile> add file:C:/path/to/DSH-Plugin-Session-Delete
```

Restart the profile to apply.

## Compatibility

- **DSH 0.2.x** (web and the desktop client, including 0.2.0-rc.1 / 0.2.0-rc.2): supported. `peerDependencies` declares `@deepseek-ai/dsh-tools ^0.2.0-rc.1`.
- **DSH 0.1.x**: not supported. Since 0.2.0 the ui-primitives icon naming and the sidebar menu slot contract both changed, and v0.4.0 is written against 0.2.x.

## Features

- Trash button at the top of the conversation
- "Delete session" item injected into the sidebar session-row "..." menu
- `RiskConfirmation` risk-consent dialog: confirm is only enabled after ticking "I understand the consequences"
- Delete chain: session log + projection cache + workspace accounting (through the active storageDomain, so in-memory state and on-disk units stay consistent)
- `workbench_session_delete` tool: agents can delete sessions directly

## Roadmap

- Add more session-operation tools and options
- Expose the existing session options to agents as tools

## Changelog

- **v0.4.0 (2026-09-29)**: Adapted to DSH 0.2.x.
  - Icons now use `IconTrashOutlineRegular` (0.2.x dropped the 16-suffixed names such as `IconTrashOutline16`), with a `Regular → Medium → legacy name` fallback chain so an undefined component can never crash the whole surface.
  - The sidebar session-row "..." menu item moved from DOM injection (it matched `[class*=sessionRow]`, an identifier that no longer exists in 0.2.x and would fail silently) to the declared slot `sidebar.workspaces.session.menu.item`: the host's `MenuItemButton` supplies the matching row styling and danger colors, the entry receives the row's `sessionId`/`displayTitle` directly (no title matching), and `order: 500` places it after the shipped group (pin 100 / rename 200 / fork 300 / archive 400).
  - `peerDependencies` raised from `@deepseek-ai/dsh-tools ^0.1.0-rc.6` to `^0.2.0-rc.1`; the old declaration is refused outright by the 0.2.x compatibility gate.
  - `dsh.client.inject` now lists packages that actually exist (`@deepseek-ai/dsh-client-runtime` is gone in 0.2.x), plus `dsh.manifestVersion: 1`.
  - The host half needed no code change: `defineTool`, `ctx.tools.register`, `agents`, `sessions.flush`, `storageDomain`'s `table`/`global` and `webServer.register` all keep their 0.2.x signatures.

- **v0.3.1 (2026-08-14)**: Fixed deleted sessions being left as "Ungrouped" rows after a partial delete. The host now cleans both raw UUID and `session-`-prefixed id forms, deletes the on-disk log and confirms it before removing workspace accounting (so a failed delete cannot detach a session from its group), and flushes a live session before detaching it to prevent dispose-time rewrites from recreating the log directory.
- **v0.3.0 (2026-08-14)**: Added English adaptation (i18n). All copy of the delete dialog, the header trash button and the sidebar "Delete session" menu item now lives in client zh/en dictionaries and follows the UI language (the language setting or the browser language), updating live on switch; environments without the locale service fall back to the built-in dictionaries by browser language.
