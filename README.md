**简体中文** · [English](README.en.md)

# dsh-plugin-session-delete

**在 DeepSeek Harness 界面里彻底删除会话。** 归档只是隐藏，损坏的会话又删不掉 —— 这个插件补上最后一步：删掉就是真的删掉。

适用于 DSH **0.2.x**（Web 端与桌面端）。

<img width="1800" height="1020" alt="删除会话确认弹窗" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## 功能

**界面入口（两处，同一个确认弹窗）**

- **会话头部垃圾桶按钮**：会话标题右侧的删除动作，运行中会话的提示文案会变成「删除会话（运行中，删除将停止任务）」。
- **侧栏会话行「…」菜单 → 删除会话**：排在宿主自带的 pin / 重命名 / fork / 归档之后。

**确认弹窗**：显示会话名与会话 id；运行中的会话额外给出警告；**必须勾选「我已了解后果，确认删除」**才能点下删除按钮。

**删除链路**：会话日志 + 投影缓存 + 工作区记账一起清掉，经活动的 storageDomain 操作，内存状态与磁盘一致 —— 不会出现下次 flush 又把会话「复活」回来的情况。

**Agent 工具**：`workbench_session_delete`，让 agent 也能删除会话。

**中英双语**：所有文案跟随界面语言（设置里的语言或浏览器语言）实时切换。

## 安装

插件只发布在 GitHub 上（没有发布到 npm）。**不需要 clone 到本地，也不要填本地路径** —— 用仓库的 tarball 直链安装，任何人复制粘贴即可。

下面 URL 里的 `v0.4.1` 是版本号，`<profile>` 是你的 profile 名：Web 端是 `web`，桌面端是 `desktop`。

```
https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/tags/v0.4.1
```

**方式一：在界面里装（推荐）**

侧边栏 →「插件」页 →「添加插件」→ 在「包名或地址」里粘贴上面那一行 →「安装」→ 重启 DSH。

**方式二：命令行**

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/tags/v0.4.1
```

- 桌面端没有全局 `dsh` 命令，用应用自带的那一个：安装目录下的 `resources\runtime\cli\bin\dsh.cmd`（macOS / Linux 为 `resources/runtime/cli/bin/dsh`），参数完全一样。
- 桌面端第一次用命令行前，先启动过一次应用（把 `desktop` profile 初始化出来），并在执行命令前完全退出它。
- 命令必须带 `--profile`；漏了 CLI 会直接报 `required option '--profile <name>' not specified`。
- 装完重启 profile 生效（开启 HMR 的 profile 会即时生效）。

**想始终装最新代码**，把 URL 末尾换成 `refs/heads/main`：

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/heads/main
```

**升级**：界面里「卸载 → 再装新版」（安装对话框自己会提示：安装后暂不支持自动更新）；命令行用新版本的直链再 `add` 一次即可 —— 包名不变，pnpm 会替换成新版本。

**卸载**

```sh
dsh plugin --profile <profile> remove @huanlin/dsh-plugin-session-delete
```

**为什么用 codeload 直链，而不是 `github:` 简写？** 填 `github:SUKJG1052/DSH-Plugin-Session-Delete` 或 `https://github.com/SUKJG1052/DSH-Plugin-Session-Delete` 时，DSH 会先对 GitHub 做一次 `git ls-remote` 连通性检查，网络不通就会停在「连接 GitHub 超时」；`.tar.gz` 直链属于压缩包安装，跳过这一步。仓库是公开的，直链不需要任何凭据或账号。

## 使用

- 想删会话：鼠标移到侧栏会话行 →「…」→「删除会话」，或在会话头部点垃圾桶按钮；勾选确认框后点「删除」。删除成功后客户端会重新拉取会话列表。
- 想让 agent 删：直接说清楚要删哪个会话，agent 会调用 `workbench_session_delete`（参数 `sessionId`，`uuid` 与 `session-<uuid>` 两种写法都认）。
- 删除**运行中**的会话会先停止其任务再删除，正在进行的操作会中断。

## 工作原理

Host 半边（`src/index.js`）注册两个 HTTP 端点与一个工具：

| 端点 / 工具 | 作用 |
| --- | --- |
| `GET /__chameleon/session/list` | 供客户端解析会话 id 与标题 |
| `POST /__chameleon/session/delete` | 界面按钮/菜单项调用的删除入口 |
| `workbench_session_delete` | agent 调用的删除工具 |

删除按固定顺序执行，避免删一半：

1. 会话正在运行 → `cancel` 并等待其静默（有超时上限，避免卡住的驱动阻塞删除）；
2. flush 活动会话，防止 dispose 阶段回写；
3. 删除磁盘上的会话日志目录（同时清理原始 uuid 与 `session-` 前缀两种 id 形式）；
4. 删除投影缓存行（`session_projcache` / `sessions`）；
5. **确认日志已删除之后**，才解除工作区记账（`sessionIds` 数组与 `global.archivedSessionIds`）。

第 3、5 步的顺序是 v0.3.1 修掉「删一半的会话掉进未分组」的关键。

Client 半边（`src/client.js`）走 DSH 的声明式槽位，不做 DOM 注入：

| 槽位 | 内容 |
| --- | --- |
| `conversation.session.header.actions` | 头部垃圾桶按钮 |
| `sidebar.workspaces.session.menu.item` | 侧栏会话行「…」菜单项，直接拿到该行的 `sessionId` / `displayTitle` |
| `shell.overlay` | 风险确认弹窗 |

这两个端点挂在 `webServer` 上，而 DSH 的浏览器鉴权（Host/Origin 检查 + 登录 Cookie）只作用于 `/api` 的 Host Connection 通道，所以 v0.4.1 起插件在两个 handler 里自己加了一道**跨站请求围栏**：`Sec-Fetch-Site: cross-site`，或 `Origin` 与本次请求 `Host` 不同源（含 `Origin: null`）的浏览器请求一律返回 403。应用页面本身是同源请求，命令行 / curl / 进程内工具不带这两个头，都不受影响。

## 兼容性

- **DSH 0.2.x**（Web 端与桌面端，含 0.2.0-rc.1 / 0.2.0-rc.2）：支持。`peerDependencies` 声明为 `@deepseek-ai/dsh-tools ^0.2.0-rc.1`，与 0.2.x 的兼容门禁匹配。
- **DSH 0.1.x**：不支持。0.2.0 起 ui-primitives 的图标命名与侧栏菜单的槽位契约都已变更，v0.4.x 按 0.2.x 编写。

安装时 DSH 会拿运行版本和上面的 peer 范围比对，不匹配就拒绝安装，并打印一条按版本豁免的命令（`dsh plugin allow-version ... --accept-risk`）。除非你清楚风险，否则不要豁免 —— 正确的做法是换用对应 DSH 版本的插件版本。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 「连接 GitHub 超时」/「无法访问 GitHub」 | 填的是 GitHub 仓库地址，DSH 的连通性检查没通过。改用上面的 codeload `.tar.gz` 直链。 |
| 「该插件已安装。如需升级，请卸载后重新安装」 | 界面里先卸载再装新版；命令行直接 `add` 新版本直链即可。 |
| 「这个包没有声明组合包，无法作为插件安装」 | 装错包了 —— 本插件的包名是 `@huanlin/dsh-plugin-session-delete`。 |
| 桌面端 `dsh plugin --profile desktop` 报 profile 未初始化 | 先启动一次桌面端把 profile 建出来，再完全退出应用重试。 |
| 装完界面里没有变化 | 重启 DSH（对话框会提示「已安装，下次启动后加载」）。 |
| 插件列表显示「异常」/ 不兼容 | 版本不匹配，见上面的「兼容性」。 |

## 注意事项

- 删除是**永久**的：会话日志、统计与工作区记账都会被移除，插件不提供回收站。
- 桌面端与 Web 端共用同一份 `~/.dsh` 存储，同一时间只应运行一个 DSH 实例，避免两边并发写。
- 装上 host 半边后，agent 就真的具备删除会话的能力了（相当于把界面上那个按钮交给了模型）。介意的话可以不装，或用权限设置约束 agent。
- 插件的两个 HTTP 端点不走 DSH 的浏览器鉴权：跨站浏览器请求从 v0.4.1 起被拒（403），但**本机其它进程仍然可以直接调用**。别把 webServer 绑到 `0.0.0.0` 暴露给不受信任的网络，也只在信任本机环境的前提下使用。

## 本地开发

`file:` 安装指向的是你本机的目录，**只适合自己开发调试**，别人照抄这条命令是装不上的：

```sh
dsh plugin --profile <profile> add file:C:/path/to/DSH-Plugin-Session-Delete
```

源码只有两个文件，没有构建步骤：

- `src/index.js` —— host 半边（ESM，命名导出 `apply` / `inject` / `name`）。
- `src/client.js` —— client 半边（classic script，经 `window.__ModuleLoader__.load({ id, factory })` 注册；只用 `React.createElement`，样式走 `--dsw-*` 主题变量）。
- `cordis.patch.yml` —— bundle 层，插入行 id `chameleon-session-delete`。

以 `file:` 方式安装时 pnpm 会做硬链接：直接改工作区里的源码，已安装的 profile 会跟着变；但用 git 切分支、`checkout` 覆盖文件后硬链接会断开，重新执行一次 `add` 即可。

改完想先验证语法，可以 `node --check` 过一遍（文件是 ESM，`.js` 后缀要先复制成 `.mjs`），再重启 profile 看「插件」页里的运行状态。

## 更新日志

- **v0.4.1（2026-10-16）**：安装说明重写 + 端点加跨站围栏。
  - 安装章节改成任何人都能照抄的形式：把混在安装步骤里的 `file:C:/path/to/...` 挪到「本地开发」并注明它只适合本人调试，正文只保留「界面里添加插件」和「命令行 `dsh plugin add <tarball 直链>`」两种真正可用的方式，补上固定 tag / main 分支两种直链、升级与卸载步骤、桌面端自带 CLI 的路径与注意事项，以及常见报错对照表。
  - 新增跨站请求围栏：`/__chameleon/session/list` 与 `/__chameleon/session/delete` 注册在 `webServer` 上，而这一层不做浏览器鉴权（DSH 只在 `/api` 的 Host Connection 通道上做 Host/Origin 检查与 Cookie 校验），此前任何能访问到该端口的人都能调用删除接口。现在 `Sec-Fetch-Site: cross-site`、或 `Origin` 与请求 `Host` 不同源（含 `Origin: null`）的浏览器请求一律 403；应用页面是同源请求，CLI / curl / 进程内工具不带这两个头，删除链路行为不变。
  - host 半边的删除链路、client 半边的槽位实现与 v0.4.0 相同，未改动。
- **v0.4.0（2026-09-29）**：适配 DSH 0.2.x。
  - 图标改用 `IconTrashOutlineRegular`（0.2.x 已移除 `IconTrashOutline16` 这类 16 后缀命名），并保留 `Regular → Medium → 旧名` 回退链，避免组件为 undefined 时整块 UI 崩掉。
  - 侧栏会话行「…」菜单项从 DOM 注入（依赖 `[class*=sessionRow]`，该标识在 0.2.x 已不存在、会静默失效）改为官方槽位 `sidebar.workspaces.session.menu.item`：用宿主 `MenuItemButton` 获得一致的样式与危险色，直接取该行的 `sessionId`/`displayTitle`，不再依赖标题匹配；`order: 500` 排在宿主自带固定组（pin 100 / rename 200 / fork 300 / archive 400）之后。
  - `peerDependencies` 由 `@deepseek-ai/dsh-tools ^0.1.0-rc.6` 提升到 `^0.2.0-rc.1`：旧声明会被 0.2.x 的兼容门禁直接拒绝安装。
  - `dsh.client.inject` 换成真实存在的客户端包（`@deepseek-ai/dsh-client-runtime` 在 0.2.x 已不存在），并补上 `dsh.manifestVersion: 1`。
  - host 半边无需改动：`defineTool`、`ctx.tools.register`、`agents`、`sessions.flush`、`storageDomain` 的 `table`/`global`、`webServer.register` 在 0.2.x 中签名一致。
- **v0.3.1（2026-08-14）**：修复删除会话后残留日志导致会话跑到「未分组」的问题。删除时同时清理原始 id 与 `session-` 前缀两种 id 形式；先删除磁盘日志并确认成功后再解除工作区记账，避免半删除会话脱离原分组；删除前先 flush 活动会话，防止 dispose 阶段回写/重建日志目录。
- **v0.3.0（2026-08-14）**：新增英文适配（i18n）。删除对话框、头部垃圾桶按钮与侧栏「删除会话」菜单项的全部文案接入客户端 zh/en 字典，跟随界面语言（设置中的语言或浏览器语言）自动切换并即时生效；未加载 locale 服务的环境会按浏览器语言回退到内置中英文字典。

## 许可证与致谢

MIT。本仓库是 [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) 的 fork，v0.4.0 起按 DSH 0.2.x 的接口重做适配。

[English version →](README.en.md)
