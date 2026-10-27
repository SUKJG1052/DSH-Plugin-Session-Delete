**简体中文** · [English](README.en.md)

# dsh-plugin-session-delete

**在 DeepSeek Harness 界面里彻底删除会话。** 归档只是隐藏，损坏的会话又删不掉 —— 这个插件补上最后一步：删掉就是真的删掉。

适用于 DSH **0.2.x**（Web 端与桌面端）；当前版本已按 **0.2.1-rc.3** 实测验证。

<img width="1800" height="1020" alt="删除会话确认弹窗" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## 功能

**界面入口**

- **会话头部垃圾桶按钮**：会话标题右侧的删除动作，运行中会话的提示文案会变成「删除会话（运行中，删除将停止任务）」。
- **侧栏会话行「…」菜单 → 删除会话**：排在宿主自带的 pin / 重命名 / fork / 归档之后。

**确认弹窗**：显示会话名与会话 id；运行中的会话额外给出警告；**必须勾选「我已了解后果，确认删除」**才能点下删除按钮。

**删除链路**：会话日志 + 投影缓存 + 工作区记账一起清掉，经活动的 storageDomain 操作，内存状态与磁盘一致 —— 不会出现下次 flush 又把会话「复活」回来的情况。

**Agent 工具**：`workbench_session_delete`，让 agent 也能删除会话。

**中英双语**：所有文案跟随界面语言（设置里的语言或浏览器语言）实时切换。

**插件页展示**：插件列表里显示本地化标题「删除会话」与一句说明（`locale/zh.json` / `locale/en.json`），不再是包名。

## 安装

插件只发布在 GitHub 上，装法和其他 GitHub 插件一样。

```sh
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.2
dsh --profile <profile> --dump-config   # 可选：确认配置树里出现 chameleon-session-delete
```

- 桌面端没有全局 `dsh` 命令，用应用自带的那一个：安装目录下的 `resources\runtime\cli\bin\dsh.cmd`（macOS / Linux 为 `resources/runtime/cli/bin/dsh`），参数完全一样。
- 桌面端第一次用命令行前，先启动过一次应用（把 `desktop` profile 初始化出来），并在执行命令前完全退出它。
- 命令必须带 `--profile`；漏了 CLI 会直接报 `required option '--profile <name>' not specified`。
- 装完重启 profile 生效（开启 HMR 的 profile 会即时生效）。

**装不上，或者机器上没有 git？** `github:` 形式由本机 `git` 拉取仓库，需要机器上有 git、且能连上 github.com。改用压缩包直链就不需要 git —— pnpm 直接下载，同时也跳过 DSH 对 GitHub 的连通性预检：

```sh
dsh plugin --profile <profile> add https://codeload.github.com/SUKJG1052/DSH-Plugin-Session-Delete/tar.gz/refs/tags/v1.0.2
```

**想装默认分支上的最新代码**：`github:` 形式把 `#v1.0.2` 换成 `#main`（或整个去掉），直链把 `refs/tags/v1.0.2` 换成 `refs/heads/main`。

**在界面里装**：侧边栏 →「插件」页 →「添加插件」→ 在「包名或地址」里粘贴 `github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.2`（或上面那条直链）→「安装」→ 重启 DSH。

**升级**：界面里「卸载 → 再装新版」（安装对话框自己会提示：安装后暂不支持自动更新）；命令行把版本号换成新版再 `add` 一次即可 —— 只要包名不变，pnpm 会替换成新版本。

**从旧版本升级（0.5.x 及更早）**：v1.0.0 换了包名（`@huanlin/…` → `@sukjg1052/…`），要先卸旧包再装新包：

```sh
dsh plugin --profile <profile> remove @huanlin/dsh-plugin-session-delete
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.2
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

- **DSH 0.2.1 及其后的 0.2.x**（Web 端与桌面端，`0.2.1-rc.3` 实测）：支持。
- **DSH 0.2.0-rc.x**：仍然可用（v0.5.0 的 host / client 代码与 v0.4.2 相同）。
- **DSH 0.1.x**：不支持。0.2.0 起 ui-primitives 的图标命名与侧栏菜单的槽位契约都已变更，v0.4.x 起按 0.2.x 编写。

兼容范围只以 `engines.dsh`（`>=0.2.0-rc.1 <0.3.0-0`，即 0.2.x 全系）声明 —— DSH 0.2.1 起按它判定。v1.0.1 起不再声明 `peerDependencies`：`^0.2.0-rc.1` 这样的 peer 范围在 npm 的预发布规则下匹配不到 `0.2.1-rc.2`，会让插件市场（dshmarket）的诊断页误报一条不兼容，pnpm 也会跟着打 unmet peer 警告，而 0.2.1 起宿主本来就忽略 peer。不匹配时 DSH 会拒绝安装并打印一条按版本豁免的命令（`dsh plugin allow-version ... --accept-risk`）。除非你清楚风险，否则不要豁免 —— 正确的做法是换用对应 DSH 版本的插件版本。

## 更新日志

- **v1.0.2（2026-10-25）**：适配 DSH 0.2.1-rc.3（核对宿主 / 客户端接口与插槽契约），代码未改动。
- **v1.0.1（2026-10-19）**：移除 `peerDependencies`，消除插件市场的 peer 兼容误报；`engines.dsh` 上界收紧为 `<0.3.0-0`。
- **v1.0.0（2026-10-18）**：脱离 fork 并改名为 `@sukjg1052/dsh-plugin-session-delete`；支持非 UUID 会话 id；补 `LICENSE`。
- **v0.5.0（2026-10-17）**：适配 DSH 0.2.1（`engines.dsh`、插件展示元数据、客户端注入列表）。
- **v0.4.2（2026-10-16）**：安装命令改用 `github:` 简写。
- **v0.4.1（2026-10-16）**：重写安装说明；删除端点加跨站请求围栏。
- **v0.4.0（2026-09-29）**：适配 DSH 0.2.x（官方槽位、图标与客户端注入）。
- **v0.3.1（2026-08-14）**：修复残留日志导致会话跑到「未分组」的问题。
- **v0.3.0（2026-08-14）**：新增中英双语适配（i18n）。

## 许可证与致谢

MIT，完整文本见 [LICENSE](LICENSE)。本仓库源自 [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) 的初始实现，自 v0.4.0 起按 DSH 0.2.x 的接口独立维护；上游与本仓库的版权声明都保留在 LICENSE 中。

[English version →](README.en.md)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
