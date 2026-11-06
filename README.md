# Paseo Git diff with submodule

Paseo 工作区变更插件。递归读取已初始化的 submodule，即使它们配置了 `ignore = all`，也能查看内部文件的 Git diff。

Review Git changes, commit graphs, and historical diffs across a workspace and its nested submodules. [English overview](OVERVIEW.md) · [中文介绍](OVERVIEW.zh-CN.md)

![Git 差异与多文件标签](assets/git-diff.png)

![Git 提交图与可调整高度的提交详情](assets/git-history.png)

## 安装与打开

要求 Paseo daemon 和客户端均为 0.12.0 或更高版本，daemon 机器已安装 Git。

```bash
paseo plugin install https://github.com/MinLeeV5/paseo-git-diff-with-submodule --ref v0.3.0
```

在目标 daemon 的 Settings → Plugins 中开启插件功能。进入任意 Git 工作区，打开 Command Center（⌘K / Ctrl+K），选择 **Git Changes · 包含 Submodule**；也可以从工作区或 Explorer 添加 Git Changes 面板。

从源码开发时运行：

```bash
git clone https://github.com/MinLeeV5/paseo-git-diff-with-submodule.git
cd paseo-git-diff-with-submodule
npm ci
npm run check
paseo plugin install "$PWD"
```

修改插件代码后运行 `npm run check` 和 `paseo plugin reload git-diff-with-submodule`。普通 Git 安装直接使用已生成的离线资源，不需要安装开发依赖。

发布时使用 `npm version` 同步生成设置中显示的版本号；若跳过生命周期脚本，需运行 `npm run sync:version`。`npm run check` 会检查版本一致性。

## 行为

- 主仓和每层已初始化的 submodule 分组显示；覆盖 submodule ignore 配置，不修改任何 Git 配置。
- 通过左侧图标下拉菜单切换“更改 / 提交图”。提交图参考 GitLens，以彩色分支连线展示分叉、合并、HEAD、本地 / 远端分支和标签，可独立选择主仓或子模块、筛选分支与标签，并分页加载本地历史。
- 点击提交查看作者、完整消息、SHA、父提交和修改文件；点击文件查看历史统一 / 左右 diff。合并提交与第一父提交比较，初始提交与空树比较；历史内容不受当前工作目录和暂存区修改影响。
- 默认“全部未提交”：逐仓比较各自 HEAD 与工作目录，包含暂存区和未跟踪文件。
- “已暂存”比较 HEAD 与暂存区；“未暂存”比较暂存区与工作目录，并显示未跟踪文件。
- 继续遵守 `.gitignore`、全局 ignore 和 `.git/info/exclude`；已跟踪文件仍按 Git 规则显示。
- 父仓记录的 gitlink 与子仓当前 HEAD 不同时，在仓库标题中单独显示，不将子仓历史提交计入本地修改。
- 采用 VS Code 风格的紧凑布局：图标与悬停提示、可拖动 / 隐藏侧栏、列表 / 目录树、文件路径和增删行底色。
- 文件采用 vscode-icons 的彩色类型图标，操作按钮采用 VS Code Codicons；代码按语言着色，适配深浅主题。图标来源与许可见 [第三方资源](docs/third-party-notices.md)。
- 点击文件新增可关闭标签，重复打开定位已有标签；标签栏支持触控板、横向滚动条和普通滚轮。
- Markdown、HTML 与图片可切换全文预览，已暂存视图读取真实暂存区内容；侧栏和标签右键均可复制路径、复制相对工作区路径，并在主机 Finder / 文件管理器中定位；标签还支持关闭当前、其他、左侧、右侧或全部。
- 右上角设置按「外观、代码、比较、行为」四个 Tab 分类，字体、字号、字重等使用下拉选择，提供实时字体示例。设置自动保存到 Paseo 主机，包括布局、侧栏宽度、左右对比比例、标签缓存数量、字体、Tab 宽度、语法着色、行号、换行、上下文、空白、预览偏好和刷新策略。
- 提供文件筛选、统一 / 左右对比、行号、差异块跳转、忽略空白、上下文和换行选项。
- 默认扫描结束约 2 秒后自动刷新，间隔可配置；可暂停，后台不轮询，失败时逐步退避，回到前台恢复读取。手动刷新立即重新扫描。
- 支持重命名、删除、二进制状态、符号链接、权限变化、空仓库和 linked worktree。未初始化的子模块显示状态，不自动 clone、fetch 或更新指针。
- Git 读取在 daemon 机器上执行，客户端通过普通 RPC 获取文件状态与按需加载的补丁。

这是只读 diff 与提交历史浏览插件。暂存、丢弃、提交、推送、分支切换以及任意两个 ref 之间的比较暂未提供。单个工作 / 历史文件超过 1 MiB 或补丁超过 2 MiB 时，显示状态和限制说明，使用本地 Git 工具查看完整内容。

## 界面与键盘

文件列表内使用方向键切换文件，Enter 打开；筛选框中 Enter / Shift+Enter 循环选择下一个 / 上一个匹配文件，并保留输入焦点，窄屏保留列表以便连续查找。`Ctrl+PageUp/PageDown` 切换已打开标签，`Ctrl/Cmd+W` 关闭当前标签；`Ctrl/Cmd+F` 或 `/` 定位筛选，`Esc` 清除筛选或在窄屏返回列表，`F7` / `Shift+F7` 跳转下一个 / 上一个差异块。图标按钮支持悬停说明与键盘焦点。

提交图中 `Ctrl/Cmd+F` 定位搜索框，按提交消息、作者、邮箱或 SHA 查找已加载提交；搜索保留分支拓扑并淡化未匹配行，输入框中 Enter / Shift+Enter 循环跳转下一个 / 上一个匹配，焦点留在搜索框，中文输入法确认候选词时不跳转。提交行聚焦后使用方向键、Home / End 选择，Enter 打开详情。窄屏点击提交进入独立详情页，返回按钮回到图；桌面详情可展开，也可拖动顶部边界调整高度，松手记住比例。聚焦边界后上下键每次调整 10px，双击或 Home 恢复默认比例。切换“更改 / 提交图”保留各自的标签、选择和滚动区域，后台更改视图暂停轮询。

历史每页读取 100 条，通过“加载更多提交”继续；分支或标签在分页期间变化时提示刷新，避免混合不同版本的历史。提交图手动刷新，不执行 fetch，也不读取远端尚未下载的提交；浅克隆缺少父提交时说明差异不可用。

面板小于 720px 时以完整列表和独立 diff 页面显示，点击文件进入差异；代码区域不足 650px 时自动使用统一对比。拖动侧栏边缘改变宽度，双击边缘恢复 240px；聚焦边缘后左右方向键微调，Home 恢复默认。仓库标题在文件列表中吸顶，滚动到下一仓库时接替显示。侧栏按钮固定在标签栏右侧，不随标签滚动。左右对比的中线可拖动到 20%–80%，两侧代码可独立横向滚动；聚焦中线后方向键每次调整 2%，Home 或双击恢复均分。顶部只保留可滚动标签与单行路径工具栏，其他显示选项集中在设置中。主界面颜色跟随 Paseo 主题。

默认界面字体跟随 Paseo；默认代码字体使用 Paseo 的 SFMono/Menlo/Consolas 栈、13px 与 500 字重。设置支持 Paseo / VS Code / JetBrains Mono / 自定义已安装字体，以及 400/500/600 字重；缺失字体使用系统等宽回退。已有用户保存的字号保留。

设置抽屉只滚动当前分类内容，顶部分类和底部保存状态、插件版本号、恢复默认入口保持固定。分类支持左右键、Home/End 切换；自动刷新关闭时禁用间隔下拉并保留原值，保存失败可直接重试。分组与控件设计见 [设置面板设计](docs/settings-design.md)。

标签默认缓存最近访问的 5 个，可在「设置 → 行为 → 缓存标签数量」选择 1–10 个。缓存保留已挂载的差异 / 预览与滚动位置，切回未变化文件不重新读取；文件版本或比较参数变化时更新，关闭标签立即释放。较大内容按估算 24 MiB 预算提前淘汰旧页，当前标签始终保留；这是缓存估算，不是浏览器堆内存上限。面板关闭后内容缓存释放，数量设置仍会保留。差异布局仅提供左右与统一对比，旧版补丁布局偏好自动迁移到统一对比。

预览提供 Markdown 常见排版与代码块着色、离线 Mermaid 图表、HTML 静态页面和常见图片。Mermaid 首次需要时加载压缩引擎，单份预览最多绘制 16 张图，每张最多 20000 字符、500 条边；错误图表保留可展开源码，不影响后续图表。HTML 不运行脚本或加载外部 / 相对资源；Markdown 原始 HTML 按文本显示，图片路径显示占位。Markdown 文件链接会在插件内打开或复用标签，也支持未修改文件、跨子模块、页内和跨文件标题锚点；普通代码文件以只读语法着色展示。相对路径从当前文档解析，`/` 开头从工作区根解析，工作区内的 `file://` 路径也可用；目录链接交由主机文件管理器显示，HTTP(S) 链接使用客户端外部浏览器打开。拒绝越出工作区和 Git 内部文件的路径。不是带构建服务的网页调试器。HTML 和格式化 Markdown 预览面向桌面 / Web；原生移动端目前回退到文本。预览最多读取 1 MiB。Finder 在 daemon 所在主机执行；删除文件定位最近仍存在的父目录。

“全部”比较每个仓库的 HEAD 与工作目录。暂存后又反向修改时，两部分可能互相抵消；切换“已暂存”和“未暂存”可分别审阅。与 VS Code 的交互、视觉和性能对照及剩余差距见 [差距分析](docs/vscode-gap-analysis.md)。

## 验证

```bash
npm run check
npm run check:compatibility
npm run acceptance -- /absolute/path/to/git-project
npm run verify:installed -- /absolute/path/to/git-project
npm run benchmark
```

验证结果与运行范围见 [验证记录](docs/verification.md)。

- 回归测试只写临时 Git 仓库，覆盖多层 ignore、worktree、暂存区、重命名和特殊文件名等情况。
- 兼容性脚本下载 0.12.0、0.13.0、0.14.0、0.15.0 的 SDK 声明并分别执行类型检查；它不替代各版本客户端的运行测试。
- 验收脚本只读目标项目，逐仓对照原生 Git 文件列表并读取每个补丁，报告写入本插件的 `artifacts/acceptance.json`，只记录路径、统计和状态。
- `verify:installed` 使用本机 daemon 的现有认证，调用已安装插件的真实 RPC，报告写入 `artifacts/runtime.json`；默认连接 `127.0.0.1:6767`。
- `benchmark` 在临时仓库测量 1000 文件扫描、补丁缓存和 10000 文件目录树 / 筛选，以及 5000 行语法状态和 40 行着色，结果写入 `artifacts/performance.json`，完成后删除临时仓库。

真实项目验收示例：

```bash
npm run acceptance -- /absolute/path/to/git-project
```

本地界面验收使用真实的服务端和 React Native Web 渲染面板：

```bash
PASEO_DIFF_ACCEPTANCE_DIRECTORY=/absolute/path/to/git-project npm run dev:ui
```

浏览器打开 `http://127.0.0.1:4178`。缩窄窗口验证紧凑布局；添加 `?theme=light` 验证浅色主题。预览服务器只监听本机，用于开发验收；正式插件直接运行在 Paseo 中。

## 兼容策略

manifest 声明 `>=0.12.0`，开发依赖锁定 `@getpaseo/plugin@0.12.0`，使用基础面板、普通 RPC 和 React Native 组件。后续 Paseo 版本若调整插件接口，需要重新运行兼容检查并适配。
