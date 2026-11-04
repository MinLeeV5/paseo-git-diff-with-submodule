# 验证记录

验证日期：2026-11-04，包含 VS Code 风格重设计、第二轮编辑器功能、图标/字体/拖动/Mermaid 精修与设置分类整理。

## 代码与 Git 正确性

`npm run check` 包含 TypeScript 严格类型检查、Biome 和 7 个测试文件、42 项回归。

保留递归子模块、`ignore = all`、独立 HEAD、标准 ignore、未初始化子模块、暂存与工作目录、空仓库、重命名、特殊文件名、二进制、大文件、持续编辑、linked worktree、权限、符号链接、删除重建、冲突、空白、上下文及左右行号覆盖。

第二轮新增验证：标签追加/复用/跨仓库区分/相邻关闭；语言 token 与文本保真；旧新两侧独立多行注释、Python 多行字符串；异常长行的词法与 Markdown 降级；Markdown 结构与 HTML/URL 转义；预览资源策略；暂存区与工作目录全文分离、暂存图片字节；二进制/过大/删除状态；越界路径、未知文件与工作目录符号链接拒绝；删除文件定位最近父目录。

## 浏览器交互与视觉

使用 Tabbit 驱动正式 React Native Web 面板。普通场景使用独立临时 Git 仓库，故障/并发/大列表使用受控 RPC。未修改业务项目。

- 暗色 1440×900 多文件/语法着色：`artifacts/scm-editor-desktop.png`。
- Markdown 全文预览与代码块：`artifacts/scm-editor-markdown.png`。
- 360×800 独立统一差异页：`artifacts/scm-editor-compact.png`。
- 浅色主题与持久设置：`artifacts/scm-editor-settings.png`。
- 截图均实际打开检查，无页面横向溢出。长代码行在代码区独立滚动，设置内容独立滚动且页脚固定可用。
- 17 文件标签追加与重复复用，关闭当前标签选中邻项：通过。
- 普通滚轮使标签 scrollLeft 从 910 变为 540，保留触控板和原生横向滚动：通过。
- 全部标签关闭后不自行重开文件；侧栏方向键打开对应文件；筛选 worker.rs 后 Enter 打开匹配文件：通过。
- 隐藏侧栏后 `/` 重新显示并聚焦筛选：通过 DOM KeyboardEvent 验证；浏览器外壳会在页面收到 keydown 前拦截物理 `/`。
- 鼠标拖动 240→300px、左右键每次 10px、双击/Home 恢复默认、重载恢复拖动宽度：通过。
- 字号、换行、刷新间隔重载恢复：通过。模拟另一写入版本，设置字段合并与版本冲突重试：通过。
- 模拟设置写入 HTTP 500，保留本地改动、重试恢复、立即重载后仍保留恢复值：通过。普通设置已改为立即提交，拖动在松手时提交。
- 实际悬停 title、标签 aria-selected、开关 aria-checked、侧栏 separator 数值：通过。已处理 RN Web 会过滤 title/wheel/旧可访问属性的运行时差异。
- Markdown 标题、任务、表格、代码块、工作目录新增段落：通过；切至暂存视图后该新增段落消失，显示真实暂存内容。
- HTML 静态页面：通过；iframe sandbox 为空，内容受资源策略限制。PNG 等图片内容及暂存区字节由回归验证。
- 右键 README 显示 Finder 菜单，点击后真实 RPC 返回 `revealed: true, directory: false`：通过。未通过 shell 拼接路径。
- 深浅主题代码分别出现关键字、字符串、注释、函数、类型等颜色：通过；浅色样本 7 种颜色。

上一轮已验证列表/目录树、折叠、空白/上下文/换行/原始补丁、错误保留旧列表、补丁缓存与版本失效、乱序响应隔离、后台/暂停停止轮询、失败退避与强制手动刷新。Esc/Cmd+F 和 `/` 的保留键逻辑通过 DOM KeyboardEvent 验证；浏览器外壳会截获它们，未将原生键盘派发作为通过证据。本轮方向键、Enter 与侧栏键盘通过真实键盘操作。

导航时浏览器 Locale Switcher 扩展仍可能报告读取 `global` 的异常；上一轮已通过 CDP 定位为扩展隔离世界，并非插件主页面错误。HTTP 500 是本轮主动注入的保存失败场景。

以上覆盖桌面/Web。未在 iOS/Android 实机验证；HTML 和格式化 Markdown 预览未提供原生渲染，原生回退文本。

## 图标、字体与交互精修验收

- 73 个离线资源：40 个 vscode-icons 文件/目录图标与 33 个 Codicons 操作图标；Web SVG、原生 PNG。附完整来源与许可。
- 默认 Paseo 等宽字体栈 / 13px / 500；VS Code 字体、600 字重、14px 改动刷新后实际计算样式仍为 Menlo/Monaco/Consolas、600、14px。自定义字体输入与回退说明通过。
- 主仓标题在列表滚动 1000px 后仍位于 y=108.5；长子仓滚至内部时同样吸顶于 y=108.5。保留虚拟化与折叠。
- 侧栏真实鼠标拖动 240→300px，Home 复位；中线真实拖动 50%→60%，支持左右键每次 2%、Home 和双击复位。比例在保存后重载恢复。
- 19 个标签保持追加；普通滚轮横向滚动，固定按钮 x=1371 不受标签滚动影响，隐藏/恢复侧栏后位置仍固定。
- 左右两侧独立横向滚动，左侧滚动时右侧仍为 0；长行文本容器宽 3491px，右侧可滚至 2800px 以上。处理 RN Web 单行 Text 默认 max-width，避免长行先被省略而无法读到尾部。
- Mermaid 真实离线流程图与时序图通过；两次打开图表文件只请求引擎一次。错误图表展开源码并提示，后续有效图表仍绘制。主动模拟引擎请求 HTTP 500，点击重试后两图成功绘制。HTML iframe sandbox 仍为空，示例脚本未执行。
- 1440×900 深浅主题、360×800 紧凑页均无面板横向溢出；窄屏自动统一对比，固定返回按钮可回列表。
- 5000 文件、10000 行的受控浏览器输入：仅挂载 47 个文件按钮、4021 个代码文本字符、235 个带方向属性的代码节点。该样本下中线键盘调整正常。
- 修正 Web 拖动的指针捕获与保存队列：松手/键盘提交在已有写入完成后继续保存，待提交设置不再提前显示“自动保存”。

本轮截图已实际打开检查：`artifacts/scm-refinement-desktop.png`、`artifacts/scm-refinement-mermaid.png`、`artifacts/scm-refinement-settings.png`、`artifacts/scm-refinement-compact.png`。机器摘要：`artifacts/scm-refinement.json`。

## 设置分类验收

设计方法与控件取舍见 [设置面板设计](settings-design.md)。在正式 React Native Web 面板、临时 Git 仓库与开发设置存储中验证：

- 四个分类点击与左右键、Home/End 导航通过；选中状态、唯一 Tab 焦点入口、tabpanel 对应关系正确。仅挂载当前分类内容，切换分类不写入设置。
- 字体、字号、字重、Tab 宽度、上下文、刷新间隔下拉通过；自定义字体即时显示输入和预览，实际计算样式为 14px / 600 / Menlo。原生 select 键盘输入 `j` 后 Enter 可选择 JetBrains Mono。
- 关闭自动刷新后间隔禁用且保留 10 秒，重新开启恢复可用。
- 跨分类改动重载恢复；主动注入写入 HTTP 500，错误与重试在切换分类后仍可见，重试后 15px 字号重载保留。恢复默认统一还原各分类配置。
- 1440×900 深浅主题、360×800 与 360×600 检查通过，无抽屉横向溢出。600px 高度内容可滚动到 Tab 宽度，底部恢复按钮始终位于 y=565.5；切回分类从顶部开始。
- 继续通过严格类型、Biome、42 项回归和四个 SDK 版本检查。设置 schema 和主机存储协议未改变；原生选择浮层仅完成类型检查。

截图均已实际打开检查：`artifacts/settings-tabs-code.png`、`artifacts/settings-tabs-behavior.png`、`artifacts/settings-tabs-light.png`、`artifacts/settings-tabs-compact.png`、`artifacts/settings-tabs-short.png`。浏览器结果摘要：`artifacts/settings-tabs.json`。

## 性能

`npm run benchmark` 使用临时仓库，完成后删除。macOS arm64 / Node 22.23.4 单次运行：

| 项目                  |                结果 |
| --------------------- | ------------------: |
| 1000 文件首次 / 复扫  | 332.07ms / 186.59ms |
| 快照缓存              |              0.02ms |
| 补丁首次 / 缓存       |    10.08ms / 0.03ms |
| 10000 文件树 / 筛选   |     4.83ms / 0.85ms |
| 5000 行语法状态预处理 |             27.15ms |
| 40 行着色             |              0.37ms |

浏览器受控输入 5000 文件和 5001 补丁行，只渲染 47 个文件按钮、9619 个文本字符与 2130 个 token span，使用 6 种代码颜色。跳到第 10000 行差异块成功。真实 Git 扫描压力由 1000 文件临时仓库验证。这些数字不构成所有仓库的延迟/FPS 承诺，也未与同环境 VS Code 排名。

完整结果见本地 `artifacts/performance.json`、`artifacts/editor-upgrade.json`；旧轮记录保留于 `artifacts/ui-redesign.json`。

## 安装与真实仓库

新版执行 `paseo plugin reload git-diff-with-submodule` 后为 running。

`verify:installed` 使用 0.12.0 DaemonClient 调用已安装插件的真实 RPC。设置整理后于 23:05（北京时间）重新加载并验证，主仓 123 文件、Client 子仓 47、Web 0，三仓均 ready。有变更仓库均可读取差异与全文；host settings 为 ready，既有偏好保留，Finder 能力为 darwin/可用。Mermaid 12.3.0 离线引擎通过真实 RPC 传输 2123624 字节 base64 压缩数据，解压为 5537838 字节。报告：本地 `artifacts/runtime.json`。业务项目由其他任务持续编辑，文件数量会变化，本任务没有修改业务仓库。

首轮 `acceptance` 在 18:01:19 逐仓对照原生 Git 文件列表、读取全部 57 个变更补丁，通过。覆盖主仓及两个子仓，报告保留于本地 `artifacts/acceptance.json`。

## SDK 与打包

`check:compatibility` 对 SDK 0.12.0、0.13.0、0.14.0、0.15.0 进行类型检查；开发依赖仍为 0.12.0，manifest 保留 `>=0.12.0`。本机运行使用 daemon 0.15.0，未逐个启动旧原生客户端。

`npm pack --dry-run --ignore-scripts` 验证运行文件及新增模块会打包，测试仓库、截图、机器报告不包含。运行时使用宿主模块、Node 内置模块和已生成的离线资源；无需安装外部运行时依赖。Mermaid 引擎保留在服务端，只有含图表的预览才请求，不进入客户端启动脚本。分发包约 1.8MB。

与 VS Code 的剩余差距及预览边界见 [差距分析](vscode-gap-analysis.md)。
