# dsh-seq-viewer · 序列比对侧边栏

[简体中文](README.md) | [English](README.en.md)

版本 **0.1.0**

DeepSeek Harness（DSH）Web / 桌面端插件：在右侧边栏中直接查看序列比对。打开 DSH 自带的 **工作区文件**，点击 FASTA、CLUSTAL、PHYLIP、Stockholm 等比对文件，就会在右侧栏打开一个 **序列比对** 标签页。文件只在本地读取，不会上传。

查看器来自 [ReSeqt 1.0.1](https://reseqt.vaaloo.fr)（作者 vaaloo / Valentin Gorgodian，MIT）的源码改造：保留它的 Canvas 渲染、残基 / 保守性 / 一致性 / 单色配色、保守性直方图、一致性行、序列 Logo、搜索、排序、参考序列、跳转、缩放、选区复制、概览图与 PNG 导出。

---

## 功能

- **工作区文件直开**：DSH「工作区文件」树中的比对文件通过资源路由打开；本插件以 `extension` 优先级注册 `sequence-alignment` 标签类型，优先于内置的文本预览。
- **右侧边栏的一部分**：查看器在右侧栏标签页中渲染，与「文件」「终端」等标签并列；标签可切换、可关闭、可拖动分栏。`keepMounted` 保证切走再切回时比对和视图状态都还在。
- **可自定义认领格式**：「工作区文件」标题栏中的绿色 **序列** 按钮打开格式设置面板：常用 glob 默认全部勾选，也可自行填写；保存后立即生效。
- **多种比对格式**：FASTA（含 A2M/A3M）直接显示；CLUSTAL W / MUSCLE、PHYLIP（交错或单行）、Stockholm 在前端转换为 FASTA 后交给 ReSeqt。支持对应的 `.gz` 压缩文件。
- **自动识别核酸 / 蛋白**：根据内容中蛋白特有残基的比例判断；`.faa`、`.aa`、`.prot`、`.pep` 后缀直接按蛋白显示。也可以随时在查看器里切换配色方案。
- **文件内容只走 DSH 的会话授权**：浏览器通过 `remote.workspaceFiles.readBytes(sessionId, path, {}, signal)` 读取文件（默认上限 32 MB），不经过本插件的任何服务端路由，也不需要把文件路径交给第三方。
- **文件变化提示**：通过 `resources` 观察文件 `version`；磁盘上的比对变化后标签栏出现「文件已变化，重新加载」，不会自动重解析。
- **深色模式同步**：从 DSH 页面读取当前主题（`color-scheme` 或页面背景），在文件加载时和主题切换时通过 postMessage 通知查看器。
- **窄侧栏适配**：宽度不足 760 px 时工具栏收紧并隐藏重复的统计块（统计信息显示在标签栏），图例可横向滚动。
- **右键「打开方式」**：在比对标签上右键可以选择其他内部标签类型（内置文本预览等），以及 DSH 发现的本机关联应用；外部应用通过 `remote.session.workspacePathApplications/openWorkspacePath` 打开，失败时仍可「显示文件位置」。
- **解析失败可退**：无法识别格式、文件为空或超过上限时，标签页内显示中文错误卡片，并提供「用文本预览打开」和「重试」。

## 默认支持的文件

| 格式 | 默认 glob |
|---|---|
| FASTA（含 A2M/A3M） | `*.fasta` `*.fa` `*.fna` `*.faa` `*.fas` `*.fsa` `*.mfa` `*.afa` |
| 通用比对 | `*.aln` `*.msa` `*.a2m` `*.a3m` |
| PHYLIP | `*.phy` `*.phylip` `*.ph` |
| CLUSTAL | `*.clustal` `*.clw` |
| Stockholm | `*.sto` `*.stockholm` `*.st` |
| gzip 压缩 | 以上每个 glob 的 `*.gz` 形式（如 `*.fasta.gz`、`*.phy.gz`） |

格式按内容识别，扩展名只用于判断是否由本插件认领文件；`.txt` 有意不认领，继续交给 DSH 内置的文本预览。

## 文件格式设置

在右侧栏「工作区文件」标题栏里有一个绿色的 **序列** 按钮（DNA 双螺旋图标），点开即可配置本插件认领哪些文件。

- **常用 glob 勾选**：FASTA / 序列、通用比对、PHYLIP、CLUSTAL、Stockholm、gzip 六组，共 40 个 glob，**默认全部勾选**。
- **全选 / 全不选 / 恢复默认**：一键调整；全不选时本插件不认领任何文件。
- **自定义 glob**：每行一个，支持 `*` 通配（如 `*.seq`、`*.alignment.txt`）；`#` 开头为注释；不能包含 `/` 或 `\`。
- **立即生效**：保存会重新注册右侧栏标签类型，之后点击的文件按新规则路由；已经打开的标签不受影响。
- 配置保存在浏览器 `localStorage` 的 `dsh-seq-viewer:formats:v1`，按浏览器 / DSH profile 独立保存。

## 示例文件

`examples/` 下有六份可直接打开的样例：

| 文件 | 说明 |
|---|---|
| [`examples/demo_alignment.fasta`](examples/demo_alignment.fasta) | 8 条核酸序列 × 60 列，含变异位点与缺口 |
| [`examples/demo_alignment_aa.fasta`](examples/demo_alignment_aa.fasta) | 6 条蛋白序列 × 60 列，验证蛋白配色 |
| [`examples/demo_alignment.aln`](examples/demo_alignment.aln) | CLUSTAL W 块格式 |
| [`examples/demo_alignment.phy`](examples/demo_alignment.phy) | 交错 PHYLIP |
| [`examples/demo_alignment.sto`](examples/demo_alignment.sto) | Stockholm 1.0 |
| [`examples/demo_alignment.fasta.gz`](examples/demo_alignment.fasta.gz) | gzip 压缩的 FASTA |

可以把这些文件复制到任意 DSH 工作区，或直接打开自己的比对文件。

## 安装

### 桌面端（DSH NEXT）

- 在 DSH 的 **插件** 页面选择从本地目录安装：`/absolute/path/to/dsh-seq-viewer`；或
- 退出 DSH NEXT，使用桌面端自带的插件安装器（`resources/app.asar/lib/plugin-cli.js`）操作 `desktop` profile。

安装后重启 DSH NEXT。公共 `dsh` CLI 不允许直接操作保留的 `desktop` profile。

### 其他 profile（如 `dsh web`）

```sh
dsh plugin --profile <profile> add file:/absolute/path/to/dsh-seq-viewer
```

重启对应 profile，刷新页面。

卸载：

```sh
dsh plugin --profile <profile> remove dsh-seq-viewer
```

## 使用

1. 在会话中打开右侧边栏 → **工作区文件**。
2. 点击 `demo_alignment.fasta` / `demo_alignment.aln` 等文件。
3. 右侧栏出现同名标签，比对自动渲染。拖动右侧栏边缘可以加宽。
4. 工具栏提供搜索（Ctrl+F）、跳转（Ctrl+G）、排序、配色方案、图例、一致性行、概览图、序列 Logo、PNG 导出和 7 级缩放（Ctrl+滚轮）。
5. 标签顶部的 `↻` 重新读取文件；文件在磁盘上变化后会出现「文件已变化，重新加载」提示。
6. 右键比对标签 → **打开方式**：可选择内置 / 插件提供的其他标签类型；桌面端还会列出本机关联应用，并可「显示文件位置」。

## 实现

```
工作区文件行
  └─ tab.actions.openResource('dsh-resource://file/session/<id>/<path>')
       └─ ctx.sidebarRightTabs 路由：按插件配置的 glob 以 extension 优先级命中
            └─ sidebar.right.pane.tab 标签体（lib/client.js）
                 ├─ 解析地址 → sessionId + path
                 ├─ remote.workspaceFiles.readBytes(...)（RemoteResult 解包）
                 ├─ gzip 解压 + UTF-8 解码、格式识别、转 FASTA、核酸/蛋白判定
                 ├─ useResource(address) 观察 version → 文件变化提示
                 └─ Blob iframe（viewer-app 单文件构建）
                      └─ ready → postMessage({ type: 'dsh-seq-viewer:load', payload: { fasta, isAminoAcid, theme } })

格式设置（sidebar.right.tab.files.actions）
  └─ 勾选 / 自定义 glob → localStorage → 重新注册 sidebarRightTabs 标签类型

比对标签右键菜单（sidebar.right.tab.menu.item）
  ├─ sidebarRightTabs.candidates(address) → 其他内部标签类型
  └─ remote.session.workspacePathApplications/openWorkspacePath → 本机关联应用 / 默认程序 / 显示位置
```

## 与 dsh-phylo-viewer 共存

两个插件都通过扩展名认领「工作区文件」，设置入口都在文件面板标题栏：

| 插件 | 按钮 | 配置键 |
|---|---|---|
| `dsh-seq-viewer` | 绿色 **序列** + DNA 图标 | `dsh-seq-viewer:formats:v1` |
| `dsh-phylo-viewer` | 中性的树 / 格式图标（仅图标） | `dsh-phylo-viewer:formats:v2` |

两个按钮使用不同的 DOM id、CSS 前缀、图标、标题和存储键，可以同时显示并分别打开。不要把同一个扩展名同时勾选到两个插件：扩展名无法区分「比对的 `.phy`」和「树的 `.phy`」，先匹配到的插件会抢走文件。

## 隐私

- 比对文件通过 DSH 的会话授权读取，只在本地浏览器中解析，不上传。
- 插件没有服务端路由，也不包含遥测或统计代码。
- 插件只把格式偏好保存在浏览器 `localStorage`；清除站点数据即可恢复默认全选。

## 开发

需要 Node.js 20 或更高版本。

```sh
cd viewer-app && npm install
cd .. && npm run build:viewer    # 构建 viewer-app 并嵌入 lib/client.js
npm test                         # 27 项单测：地址解析、格式转换、gzip、格式设置、标签注册、右键菜单
```

`lib/client.js` 是生成物，不要手改；修改 `scripts/client.template.js` 或 `viewer-app/` 后重新构建。

## 许可与归属

- 插件本体：MIT，见 [LICENSE](LICENSE)。
- 查看器基于 [ReSeqt 1.0.1](https://github.com/vaaloo/reseqt)，MIT，原许可证见 [LICENSE.reseqt](LICENSE.reseqt)，改造说明见 [NOTICE](NOTICE)。
- 内嵌查看器包含 React 19（MIT，Copyright Meta Platforms, Inc. and affiliates），许可证见 [LICENSE.react](LICENSE.react)。
