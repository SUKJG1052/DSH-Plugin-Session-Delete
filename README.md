**简体中文** · [English](README.en.md)

# dsh-plugin-session-delete

**在 DeepSeek Harness 界面里彻底删除会话。** 归档只是隐藏，损坏的会话又删不掉 —— 这个插件补上最后一步：删掉就是真的删掉，**没有回收站，也不能撤销**。

适用于 DSH **0.2.x**（Web 端与桌面端）；当前版本已按 **0.2.2-rc.3** 实测验证。

<img width="1800" height="1020" alt="删除会话确认弹窗" src="https://github.com/user-attachments/assets/c66f6185-457d-4261-9e10-1b44b9959896" />

## 功能

**界面入口**

- **会话头部垃圾桶按钮**：会话标题右侧的删除动作，运行中会话的提示文案会变成「删除会话（运行中，删除将停止任务）」。
- **侧栏会话行「…」菜单 → 删除会话**：排在宿主自带的 pin / 重命名 / fork / 归档之后。

**确认弹窗**：显示会话名与会话 id；运行中的会话额外给出警告；**必须勾选「我已了解后果，确认删除」**才能点下删除按钮。

**删除链路**：会话日志、投影缓存、工作区记账（所有权、置顶与归档标记）一起清掉，经活动的 storageDomain / workspaceRegistry 操作，内存状态与磁盘一致 —— 不会出现下次 flush 又把会话「复活」回来的情况。同时清掉该会话的工具输出临时文件，以及**只被这个会话引用**的附件对象（仍被其它会话引用的会保留）；客户端里该会话的输入框草稿与面板状态也一并删除（含其它插件以会话 id 命名的键，如 `dsh-sidebar:v1:<id>`）。

**Agent 工具**：`workbench_session_delete` 让 agent 也能删除会话；`workbench_session_gc` 用来清理历史残留（孤儿工作区引用、无日志的投影缓存行、空目录，可选扫附件），默认 dry run。

**中英双语**：所有文案跟随界面语言（设置里的语言或浏览器语言）实时切换。

**插件页展示**：插件列表里显示本地化标题「删除会话」与一句说明（`locale/zh.json` / `locale/en.json`），不再是包名。

## 安装

插件只发布在 GitHub 上，装法和其他 GitHub 插件一样。

```sh
dsh plugin --profile <profile> add github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.5
dsh --profile <profile> --dump-config   # 可选：确认配置树里出现 chameleon-session-delete
```

**在界面里装**：侧边栏 →「插件」页 →「添加插件」→ 在「包名或地址」里粘贴 `github:SUKJG1052/DSH-Plugin-Session-Delete#v1.0.5` →「安装」→ 重启 DSH。

**升级**：界面里「卸载 → 再装新版」（安装对话框自己会提示：安装后暂不支持自动更新）；命令行把版本号换成新版再 `add` 一次即可 —— 只要包名不变，pnpm 会替换成新版本。

**卸载**

```sh
dsh plugin --profile <profile> remove @sukjg1052/dsh-plugin-session-delete
```

## 使用

- 想删会话：鼠标移到侧栏会话行 →「…」→「删除会话」，或在会话头部点垃圾桶按钮；勾选确认框后点「删除」。删除成功后客户端会重新拉取会话列表。
- 想让 agent 删：直接说清楚要删哪个会话，agent 会调用 `workbench_session_delete`（参数 `sessionId`：裸 id 和 `session-` 前缀两种写法都认，UUID、计数器 id 与自定义 id 都能删）。
- 删除**运行中**的会话会先停止其任务再删除，正在进行的操作会中断。
- 以前手工删过日志、或用旧版本删过会话留下的孤儿记录，重启 DSH 后插件会做一次轻量清理（含其它插件按会话 id 命名的 localStorage 键，如 `dsh-sidebar:v1:<id>`）；附件孤儿需要另外让 agent 运行 `workbench_session_gc`（先 dry run 查看，再加 `dryRun: false` 与 `attachments: true` 执行）。

## 兼容性

- **DSH 0.2.1 及其后的 0.2.x**（Web 端与桌面端，`0.2.2-rc.3` 实测）：支持。
- **DSH 0.2.0-rc.x**：仍然可用（v0.5.0 的 host / client 代码与 v0.4.2 相同）。
- **DSH 0.1.x**：不支持。0.2.0 起 ui-primitives 的图标命名与侧栏菜单的槽位契约都已变更，v0.4.x 起按 0.2.x 编写。

## 许可证与致谢

MIT，完整文本见 [LICENSE](LICENSE)。本仓库源自 [lsz-asd/dsh-plugin-session-delete](https://github.com/lsz-asd/dsh-plugin-session-delete) 的初始实现，自 v0.4.0 起按 DSH 0.2.x 的接口独立维护；上游与本仓库的版权声明都保留在 LICENSE 中。

[English version →](README.en.md)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
