**简体中文** · [English](README.en.md)

# dsh-plugin-session-delete

**在 DeepSeek Harness 界面里彻底删除会话。** 归档只是隐藏，损坏的会话又删不掉 —— 这个插件补上最后一步：删掉就是真的删掉。

适用于 DSH **0.2.x**（Web 端与桌面端）；当前版本按 **0.2.1-rc.2** 逐项核对验证。

<img width="1800" height="1020" alt="删除会话确认弹窗" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## 功能

**界面入口（两处，同一个确认弹窗）**

- **会话头部垃圾桶按钮**：会话标题右侧的删除动作，运行中会话的提示文案会变成「删除会话（运行中，删除将停止任务）」。
- **侧栏会话行「…」菜单 → 删除会话**：排在宿主自带的 pin / 重命名 / fork / 归档之后。

**确认弹窗**：显示会话名与会话 id；运行中的会话额外给出警告；**必须勾选「我已了解后果，确认删除」**才能点下删除按钮。

**删除链路**：会话日志 + 投影缓存 + 工作区记账一起清掉，经活动的 storageDomain 操作，内存状态与磁盘一致 —— 不会出现下次 flush 又把会话「复活」回来的情况。

**Agent 工具**：`workbench_session_delete`，让 agent 也能删除会话。

**中英双语**：所有文案跟随界面语言（设置里的语言或浏览器语言）实时切换。

**插件页展示**：插件列表里显示本地化标题「删除会话」与一句说明（`locale/zh.json` / `locale/en.json`），不再是包名。

## 安装

插件只发布在 GitHub 上（没有发布到 npm），装法和其他 GitHub 插件一样 —— 一行命令，不用 clone 到本地，也不用填本地路径。

`<profile>` 换成你的 profile 名：Web 端是 `web`，桌面端是 `desktop`；`#v1.0.0` 是要装的版本。

```sh
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.0
dsh --profile <profile> --dump-config   # 可选：确认配置树里出现 chameleon-session-delete
```

- 桌面端没有全局 `dsh` 命令，用应用自带的那一个：安装目录下的 `resources\runtime\cli\bin\dsh.cmd`（macOS / Linux 为 `resources/runtime/cli/bin/dsh`），参数完全一样。
- 桌面端第一次用命令行前，先启动过一次应用（把 `desktop` profile 初始化出来），并在执行命令前完全退出它。
- 命令必须带 `--profile`；漏了 CLI 会直接报 `required option '--profile <name>' not specified`。
- 装完重启 profile 生效（开启 HMR 的 profile 会即时生效）。

**装不上，或者机器上没有 git？** `github:` 形式由本机 `git` 拉取仓库，需要机器上有 git、且能连上 github.com。改用压缩包直链就不需要 git —— pnpm 直接下载，同时也跳过 DSH 对 GitHub 的连通性预检：

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/tags/v1.0.0
```

**想装默认分支上的最新代码**：`github:` 形式把 `#v1.0.0` 换成 `#main`（或整个去掉），直链把 `refs/tags/v1.0.0` 换成 `refs/heads/main`。

**在界面里装**：侧边栏 →「插件」页 →「添加插件」→ 在「包名或地址」里粘贴 `github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.0`（或上面那条直链）→「安装」→ 重启 DSH。

**升级**：界面里「卸载 → 再装新版」（安装对话框自己会提示：安装后暂不支持自动更新）；命令行把版本号换成新版再 `add` 一次即可 —— 只要包名不变，pnpm 会替换成新版本。

**从旧版本升级（0.5.x 及更早）**：v1.0.0 换了包名（`@huanlin/…` → `@sukjg1052/…`），要先卸旧包再装新包：

```sh
dsh plugin --profile <profile> remove @huanlin/dsh-plugin-session-delete
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.0
```

**卸载**

```sh
dsh plugin --profile <profile> remove @sukjg1052/dsh-plugin-session-delete
```

## 使用

- 想删会话：鼠标移到侧栏会话行 →「…」→「删除会话」，或在会话头部点垃圾桶按钮；勾选确认框后点「删除」。删除成功后客户端会重新拉取会话列表。
- 想让 agent 删：直接说清楚要删哪个会话，agent 会调用 `workbench_session_delete`（参数 `sessionId`：裸 id 和 `session-` 前缀两种写法都认，UUID、计数器 id 与自定义 id 都能删）。
- 删除**运行中**的会话会先停止其任务再删除，正在进行的操作会中断。

## 兼容性

- **DSH 0.2.1 及其后的 0.2.x**（Web 端与桌面端，`0.2.1-rc.2` 实测）：支持。v0.5.0 按 0.2.1 逐项核对过插件依赖的全部接口 —— 三个插槽的契约（`conversation.session.header.actions`、`sidebar.workspaces.session.menu.item`、`shell.overlay`）、`ui-primitives` 的 `Modal` / `MenuItemButton` / `IconTrashOutlineRegular`、客户端模块加载协议（`window.__ModuleLoader__.load`）与 host 侧服务（`defineTool`、`ctx.tools.register`、`storageDomain`、`agents`、`sessions`、`webServer.register`），均与 0.2.0 一致。
- **DSH 0.2.0-rc.x**：仍然可用（v0.5.0 的 host / client 代码与 v0.4.2 相同）。
- **DSH 0.1.x**：不支持。0.2.0 起 ui-primitives 的图标命名与侧栏菜单的槽位契约都已变更，v0.4.x 起按 0.2.x 编写。

兼容范围以 `engines.dsh`（`>=0.2.0-rc.1 <0.3.0`）声明，同时保留 `peerDependencies` 的 `@deepseek-ai/dsh-tools ^0.2.0-rc.1`：DSH 0.2.1 起优先按 `engines.dsh` 判定（两者同时存在时忽略 peer），更早的版本仍读 peer。不匹配时 DSH 会拒绝安装并打印一条按版本豁免的命令（`dsh plugin allow-version ... --accept-risk`）。除非你清楚风险，否则不要豁免 —— 正确的做法是换用对应 DSH 版本的插件版本。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 「连接 GitHub 超时」/「无法访问 GitHub」 | DSH 对 GitHub 的连通性预检没过。改用 codeload `.tar.gz` 直链（跳过该检查）。 |
| `github:` 形式报 git 相关错误（如 `getRepoRefs` 失败） | 机器上没有 git，或 git 不在 PATH 上。装上 git，或改用压缩包直链。 |
| 「该插件已安装。如需升级，请卸载后重新安装」 | 界面里先卸载再装新版；命令行把版本号换成新版再 `add` 一次即可。 |
| 「这个包没有声明组合包，无法作为插件安装」 | 装错包了 —— 本插件的包名是 `@sukjg1052/dsh-plugin-session-delete`。 |
| 桌面端 `dsh plugin --profile desktop` 报 profile 未初始化 | 先启动一次桌面端把 profile 建出来，再完全退出应用重试。 |
| 装完界面里没有变化 | 重启 DSH（对话框会提示「已安装，下次启动后加载」）。 |
| 插件列表显示「异常」/ 不兼容 | 版本不匹配，见上面的「兼容性」。 |

## 更新日志

- **v1.0.0（2026-10-18）**：脱离 fork，成为独立维护版本。
  - 包名由 `@huanlin/dsh-plugin-session-delete` 改为 `@sukjg1052/dsh-plugin-session-delete`（`@huanlin` 是上游的命名空间）；`cordis.patch.yml` 的行名与客户端 bundle 的注册 id 同步更新。从 0.5.x 升级需要先卸旧包再装新包（命令见「安装 → 从旧版本升级」）。
  - 支持非 UUID 会话 id：端点与工具不再强制 UUID 形状，改为**路径安全校验**（拒绝路径分隔符、Windows 保留字符、控制字符、`.` / `..`，以及结尾的点或空格），计数器 id、自定义 id 和带不带 `session-` 前缀的写法都能删。
  - 补 `LICENSE`（MIT，保留上游 lsz-asd 与本仓库的版权声明）；README 中的仓库身份从「fork」改为「源自上游的独立维护版本」。
  - 其余（插槽实现、删除链路、跨站请求围栏）与 v0.5.0 相同。
- **v0.5.0（2026-10-17）**：适配 DSH 0.2.1。
  - 兼容声明改到 0.2.1 的 `engines.dsh`（`>=0.2.0-rc.1 <0.3.0`）：0.2.1 起 DSH 优先按它判定，同时保留 `peerDependencies` 供更早版本读取。
  - 新增插件展示元数据：`locale/zh.json` / `locale/en.json` 的 `meta.title` / `meta.description` 让插件列表显示「删除会话」与一句说明（不再是包名）；`exports` 补 `./locale/*.json`，`files` 收录 `locale/`。
  - `dsh.client.inject` 删掉 0.2.1 已不存在的 `@deepseek-ai/dsh-client-ui-slots`：ui-slots / ui-primitives 已并入 Web 外壳的共享模块表，插件里的 `require` 依旧可用。
  - host / client 代码未改动。按 0.2.1 逐项核对（插槽契约、`Modal` / `MenuItemButton` / 图标导出、客户端模块加载协议、host 侧服务）确认一致；同一套 host 行为测试全部通过（跨站围栏、两种 id 写法的删除、400 / 404 / 405、agent 工具）；线上实例的 session 列表端点与客户端 bundle 均正常加载。
- **v0.4.2（2026-10-16）**：安装命令改成和其他插件一致的 `github:` 简写。
  - 主推 `dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v0.4.2`，并紧跟一行 `dsh --profile <profile> --dump-config` 自检（确认配置树里出现 `chameleon-session-delete`）。
  - codeload 直链降级成替代方案，并写明适用场景：本机没有 git、或连不上 github.com 时用它 —— `github:` 形式由本机 git 拉取仓库，机器上必须有 git；直链由 pnpm 直接下载，既不需要 git，也跳过 DSH 对 GitHub 的连通性预检。
  - 仅文档变更，代码与 v0.4.1 相同。
- **v0.4.1（2026-10-16）**：安装说明重写 + 端点加跨站围栏。
  - 安装章节改成任何人都能照抄的形式：把混在安装步骤里的 `file:C:/path/to/...` 移出安装章节并注明它只适合本人调试，正文只保留「界面里添加插件」和「命令行 `dsh plugin add <tarball 直链>`」两种真正可用的方式，补上固定 tag / main 分支两种直链、升级与卸载步骤、桌面端自带 CLI 的路径与注意事项，以及常见报错对照表。
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

MIT，完整文本见 [LICENSE](LICENSE)。本仓库源自 [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) 的初始实现，自 v0.4.0 起按 DSH 0.2.x 的接口独立维护；上游与本仓库的版权声明都保留在 LICENSE 中。

[English version →](README.en.md)
