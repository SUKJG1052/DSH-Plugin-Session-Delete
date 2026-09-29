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

从仓库直装（不用先 clone）：

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/heads/main
```

> 用 codeload 直链而不是 `github:` 简写：部分网络下简写会去连 github.com 而超时，codeload 更稳。

本地开发用 `file:`：

```sh
dsh plugin --profile <profile> add file:C:/path/to/DSH-Plugin-Session-Delete
```

重启 profile 生效。桌面端用应用自带的 CLI（安装目录下的 `resources\runtime\cli\bin\dsh.cmd`）执行同样的命令即可，`desktop` profile 的插件操作是允许的。

卸载：

```sh
dsh plugin --profile <profile> remove @huanlin/dsh-plugin-session-delete
```

## 使用

- 想删会话：鼠标移到侧栏会话行 → 「…」→「删除会话」，或在会话头部点垃圾桶按钮；勾选确认框后点「删除」。删除成功后客户端会重新拉取会话列表。
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
| overlay 槽位 | 风险确认弹窗 |

## 兼容性

- **DSH 0.2.x**（Web 端与桌面端，含 0.2.0-rc.1 / 0.2.0-rc.2）：支持。`peerDependencies` 声明为 `@deepseek-ai/dsh-tools ^0.2.0-rc.1`，与 0.2.x 的兼容门禁匹配。
- **DSH 0.1.x**：不支持。0.2.0 起 ui-primitives 的图标命名与侧栏菜单的槽位契约都已变更，v0.4.0 按 0.2.x 编写。

## 注意事项

- 删除是**永久**的：会话日志、统计与工作区记账都会被移除，插件不提供回收站。
- 桌面端与 Web 端共用同一份 `~/.dsh` 存储，同一时间只应运行一个 DSH 实例，避免两边并发写。
- 装上 host 半边后，agent 就真的具备删除会话的能力了（相当于把界面上那个按钮交给了模型）。介意的话可以不装，或用权限设置约束 agent。

## 本地开发

源码只有两个文件，没有构建步骤：

- `src/index.js` —— host 半边（ESM，命名导出 `apply` / `inject` / `name`）。
- `src/client.js` —— client 半边（classic script，经 `window.__ModuleLoader__.load({ id, factory })` 注册；只用 `React.createElement`，样式走 `--dsw-*` 主题变量）。
- `cordis.patch.yml` —— bundle 层，插入行 id `chameleon-session-delete`。

以 `file:` 方式安装时 pnpm 会做硬链接：直接改工作区里的源码，已安装的 profile 会跟着变；但用 git 切分支/`checkout` 覆盖文件后硬链接会断开，重新执行一次 `add` 即可。

## 更新日志

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
