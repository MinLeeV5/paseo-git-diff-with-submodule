// English catalog. Keys are the zh-CN source strings (gettext style), with
// {param} placeholders where the source used template interpolation. A missing
// key falls back to the Chinese source string.

export const enMessages: Record<string, string> = {
  // ---- shared helpers / separators ----
  "、": ", ",
  "；": "; ",
  "，": ", ",
  默认: "default",
  "工作区不可用。": "Workspace unavailable.",
  "，原路径 {path}": ", previously {path}",
  "新增 {additions} 行，删除 {deletions} 行": "{additions} lines added, {deletions} lines deleted",
  "\n父仓记录 {recorded} → 当前 {head}": "\nparent records {recorded} → current {head}",
  "，{sync}": ", {sync}",
  "重命名：{old} → {new}": "Renamed: {old} → {new}",
  "子模块指针 {from} → {to} · 以下比较子仓自身 {baseline}":
    "Submodule pointer {from} → {to} · comparing the submodule itself against {baseline}",
  此视图没有该文件的更改: "This file has no changes in the current view",
  "可以切换比较范围，或关闭这个标签。": "Switch the comparison scope or close this tab.",
  "{count} 个仓库 · 递归子模块": "{count} repositories · recursive submodules",
  "{count} 个更改": "{count} changes",
  上一个文件: "Previous file",
  下一个文件: "Next file",
  "正在读取 Git 状态…": "Reading Git status…",

  // ---- settings: tabs & chrome ----
  外观: "Appearance",
  代码: "Code",
  比较: "Comparison",
  行为: "Behavior",
  提交: "Commit",
  "Git 设置": "Git settings",
  此主机: "This host",
  设置分类: "Settings sections",
  关闭设置: "Close settings",
  关闭设置背景: "Close settings backdrop",
  "设置自动保存到当前 Paseo 主机": "Settings auto-save to this Paseo host",
  "正在保存…": "Saving…",
  尚未保存: "Not saved yet",
  已保存: "Saved",
  重试保存设置: "Retry saving settings",
  重试: "Retry",
  恢复默认设置: "Restore default settings",
  恢复默认: "Restore defaults",
  "插件版本 {version}": "Plugin version {version}",
  "设置同时被其他面板修改，请重试保存。":
    "Settings were changed by another panel. Try saving again.",
  "{error}；可在设置中恢复默认。": "{error}; you can restore defaults in settings.",
  "已恢复默认设置。": "Default settings restored.",
  重试加载设置: "Retry loading settings",
  "Git 设置 · 保存失败": "Git settings · Save failed",
  语言: "Language",
  "界面与提示语言，提交信息生成提示词会跟随所选语言。":
    "Interface and message language. Commit message generation follows the selected language.",

  // ---- settings: appearance ----
  文件浏览: "File browsing",
  显示文件侧栏: "Show file sidebar",
  文件排列: "File layout",
  列表: "List",
  目录树: "Tree",
  "同时应用于变更文件和提交图中的文件列表。":
    "Applies to the file lists in both changes and the commit graph.",
  滚动条: "Scrollbar",
  纤细: "Thin",
  系统: "System",
  "拖动侧栏边缘或左右对比中线可调整宽度，松手后自动记住。":
    "Drag the sidebar edge or the split divider to resize; widths are remembered on release.",

  // ---- settings: code ----
  字体: "Font",
  代码字体: "Code font",
  "Paseo 默认": "Paseo default",
  自定义: "Custom",
  自定义代码字体: "Custom code font",
  "例如：SF Mono, Menlo": "e.g. SF Mono, Menlo",
  字号: "Font size",
  字重: "Font weight",
  "常规 · 400": "Regular · 400",
  "中等 · 500": "Medium · 500",
  "加粗 · 600": "Semibold · 600",
  "const message = 'Hello, Paseo';\n// 字体预览 0123456789":
    "const message = 'Hello, Paseo';\n// Font preview 0123456789",
  "使用已安装字体；不可用时回退到系统等宽字体。":
    "Uses installed fonts; falls back to the system monospace font when unavailable.",
  代码显示: "Code display",
  语法着色: "Syntax highlighting",
  显示行号: "Show line numbers",
  自动换行: "Wrap lines",
  "Tab 宽度": "Tab width",
  "{value} 空格": "{value} spaces",

  // ---- settings: comparison ----
  差异视图: "Diff view",
  比较范围: "Comparison scope",
  全部: "All",
  已暂存: "Staged",
  未暂存: "Unstaged",
  差异布局: "Diff layout",
  左右: "Split",
  统一: "Unified",
  上下文: "Context",
  "3 行": "3 lines",
  "20 行": "20 lines",
  全文: "Whole file",
  忽略空白变化: "Ignore whitespace changes",

  // ---- settings: commit ----
  提交信息: "Commit message",
  生成方式: "Generation",
  本地文件规则: "Local file rules",
  "沿用 Paseo 的元数据模型与认证。生成后填入单行草稿，可编辑后再提交。":
    "Uses Paseo's model metadata and credentials. The result fills a single-line draft you can edit before committing.",
  "按文件名与变更类型生成，不调用 AI。":
    "Generated from file names and change types without calling AI.",
  自定义提示词: "Custom instructions",
  提交信息生成提示词: "Commit message instructions",
  "例如：用中文，遵循 Conventional Commits，说明变更目的。":
    "e.g. Use English, follow Conventional Commits, describe the purpose of the change.",
  "留空时使用各仓库 paseo.json 中的 metadataGeneration.commitMessage.instructions；未配置时使用默认提示词。":
    "When empty, metadataGeneration.commitMessage.instructions from each repository's paseo.json is used; otherwise the default prompt.",
  "此提示词保存在当前主机，适用于所有仓库。":
    "Stored on this host and applied to all repositories.",

  // ---- settings: behavior ----
  打开面板: "Panel startup",
  默认进入: "Default view",
  "下次打开 Git 面板时生效。": "Takes effect the next time you open the Git panel.",
  标签缓存: "Tab cache",
  缓存标签数量: "Cached tabs",
  "{count} 个{suffix}": "{count} tabs{suffix}",
  "保留最近访问标签的内容和滚动位置；大文件或图表较多时会提前释放较早的缓存。":
    "Keeps content and scroll positions of recently visited tabs; large files or heavy diagrams may evict older entries early.",
  文件预览: "File preview",
  优先打开预览: "Open preview by default",
  "适用于 Markdown、HTML 和图片。": "Applies to Markdown, HTML, and images.",
  "Markdown 支持 Mermaid。在文件工具栏随时切换预览与差异。":
    "Markdown supports Mermaid. Switch between preview and diff anytime from the file toolbar.",
  "Git 状态": "Git status",
  "自动刷新 Git 状态": "Auto-refresh Git status",
  刷新间隔: "Refresh interval",
  "{seconds} 秒": "{seconds}s",
  "已暂停自动刷新，仍可在文件侧栏手动刷新。":
    "Auto-refresh is paused; you can still refresh manually from the file sidebar.",

  // ---- view labels ----
  更改: "Changes",
  提交图: "Commit graph",
  "Git 视图": "Git view",
  "切换 Git 视图，当前：{label}": "Switch Git view. Current: {label}",

  // ---- change status & comparison labels ----
  新增: "Added",
  修改: "Modified",
  删除: "Deleted",
  重命名: "Renamed",
  复制: "Copied",
  类型变化: "Type changed",
  冲突: "Conflict",
  未跟踪: "Untracked",
  未知: "Unknown",
  未提交的更改: "Uncommitted changes",
  工作目录: "Working tree",
  暂存区: "Index",
  已暂存的更改: "Staged changes",
  主仓库: "Main repository",
  子模块: "Submodule",
  部分暂存: "Partially staged",
  子模块未初始化: "Submodule not initialized",
  子模块提交指针已变化: "Submodule pointer changed",

  // ---- repository controls & actions ----
  "提交信息（⌘ / Ctrl+Enter）": "Commit message (⌘ / Ctrl+Enter)",
  "{label} 提交信息": "{label} commit message",
  "为{label}自动生成{scope}的提交信息":
    "Generate a commit message for {label} from {scope} changes",
  全部更改: "all",
  "暂存{label}全部更改": "Stage all changes in {label}",
  "取消{label}全部暂存": "Unstage all changes in {label}",
  "拉取{label}": "Pull {label}",
  "推送{label}": "Push {label}",
  " · {count} 个待拉取提交": " · {count} commits to pull",
  " · {count} 个待推送提交": " · {count} commits to push",
  "提交已暂存 ({count})": "Commit staged ({count})",
  暂存并提交全部: "Stage & commit all",
  提交已暂存更改: "Commit staged changes",
  暂存并提交全部更改: "Stage and commit all changes",
  "{action} · {label}": "{action} · {label}",
  "{count} 个冲突 · 请解决后暂存": "{count} conflicts · resolve and stage to continue",
  "已暂存 {staged} · 未暂存 {unstaged}": "Staged {staged} · Unstaged {unstaged}",
  "正在暂存…": "Staging…",
  "正在取消暂存…": "Unstaging…",
  "正在提交…": "Committing…",
  "正在拉取…": "Pulling…",
  "正在推送…": "Pushing…",
  "正在生成提交信息…": "Generating commit message…",
  "关闭{label}操作结果": "Close {label} action result",
  暂存: "Stage",
  取消暂存: "Unstage",
  暂存更改: "Stage changes",
  拉取: "Pull",
  推送: "Push",
  待拉取: "to pull",
  待推送: "to push",
  "{count} 个{label}提交": "{count} commits {label}",
  "{repo}：{action}失败。{error}": "{repo}: {action} failed. {error}",
  "{repo}：{message}": "{repo}: {message}",
  "{label}：{value}": "{label}: {value}",
  "关闭{label}选择": "Close {label} picker",
  "{label}：{option}": "{label}: {option}",
  "{repo}：提交信息生成失败，已保留草稿。":
    "{repo}: commit message generation failed; the draft was kept.",

  // ---- changes panel ----
  "（无提交说明）": "(no commit message)",
  "{count} 个{action}提交": "{count} commits {action}",
  "{action}仓库 {name}{sync}": "{action} repository {name}{sync}",
  "{action}仓库 {name}": "{action} repository {name}",
  "{action}提交目录 {path}": "{action} commit directory {path}",
  "{action}目录 {path}": "{action} directory {path}",
  展开: "Expand",
  收起: "Collapse",
  尚无提交: "no commits yet",
  "{directory}\nHEAD {head}{drift}": "{directory}\nHEAD {head}{drift}",
  "暂存更改 {path}": "Stage changes for {path}",
  "取消暂存 {path}": "Unstage {path}",
  "查看 diff {label}": "View diff {label}",
  关闭: "Close",
  关闭其他: "Close others",
  关闭右侧: "Close to the right",
  关闭左侧: "Close to the left",
  关闭全部: "Close all",
  关闭文件状态提示: "Dismiss file status notice",
  在文件管理器中显示: "Reveal in file manager",
  "刷新 Git 状态": "Refresh Git status",
  折叠或展开全部仓库: "Collapse or expand all repositories",
  切换为列表视图: "Switch to list view",
  切换为目录树: "Switch to tree view",
  筛选变更文件: "Filter changed files",
  "筛选文件路径…": "Filter file paths…",
  清除筛选: "Clear filter",
  "刷新失败，显示上次结果。": "Refresh failed; showing the previous result.",
  "无法读取 Git 状态。": "Cannot read Git status.",
  "重试读取 Git 状态": "Retry reading Git status",
  没有可用仓库: "No repositories available",
  没有匹配的更改: "No matching changes",
  正在读取更改: "Reading changes",
  仓库状态未完整读取: "Repository status not fully read",
  选择文件开始审阅: "Select a file to start reviewing",
  没有已暂存的更改: "No staged changes",
  没有未暂存的更改: "No unstaged changes",
  "与 HEAD 没有差异": "No differences from HEAD",
  "从侧栏打开文件；多个文件会保留在独立标签中。":
    "Open files from the sidebar; multiple files stay in separate tabs.",
  "试试其他文件名或路径。": "Try a different file name or path.",
  "没有已暂存的更改，可以切换查看全部。": "No staged changes. You can switch to view all.",
  "没有未暂存的更改，可以切换查看全部。": "No unstaged changes. You can switch to view all.",
  "工作目录与各仓库 HEAD 一致；可切换已暂存或未暂存，单独查看暂存区。":
    "The working tree matches each repository's HEAD. Switch to staged or unstaged to inspect the index alone.",
  统计不含二进制及超限文件: "Stats exclude binary and oversized files",
  此视图没有更改: "No changes in this view",
  二进制文件: "Binary file",
  "，同时有已暂存和未暂存更改": ", has both staged and unstaged changes",
  "，同时有已暂存和未暂存更改，点击查看 diff":
    ", has both staged and unstaged changes, click to view diff",
  "{repo}：定位文件失败。{error}": "{repo}: failed to locate the file. {error}",
  "{repo}：文件已删除，已定位到所在目录。": "{repo}: the file was deleted; showing its directory.",
  "{repo}：已复制{kind}。": "{repo}: copied the {kind}.",
  相对路径: "relative path",
  路径: "path",
  "{repo}：复制失败。{error}": "{repo}: copy failed. {error}",
  复制路径: "Copy path",
  复制相对路径: "Copy relative path",
  "打开链接失败：{error}": "Failed to open the link: {error}",
  "打开文件链接失败：{error}": "Failed to open the file link: {error}",
  "链接所属仓库已变化，请刷新后重试。": "The link's repository changed. Refresh and try again.",
  "文件所属仓库已变化，请刷新后重试。": "The file's repository changed. Refresh and try again.",
  "无法检查文件最新状态：{error}": "Cannot check the latest file state: {error}",
  "自动刷新 · {seconds}s": "Auto-refresh · {seconds}s",
  读取异常: "Read error",
  刷新已暂停: "Refresh paused",
  开启自动刷新: "Resume auto-refresh",
  暂停自动刷新: "Pause auto-refresh",
  打开文件预览: "Open file preview",
  "{path} 文件预览": "{path} file preview",
  "上一个差异块（Shift+F7）· {position}/{count}":
    "Previous diff hunk (Shift+F7) · {position}/{count}",
  "下一个差异块（F7）· {position}/{count}": "Next diff hunk (F7) · {position}/{count}",
  "当前{mode}": "{mode}",
  "左右对比，切换为统一对比": "Split view. Switch to unified",
  "统一对比，切换为左右对比": "Unified view. Switch to split",
  查看文件差异: "View file diff",
  "预览 {kind} · {revision}": "Preview {kind} · {revision}",
  图片: "Image",
  "{path} · 只读": "{path} · read-only",
  "{path}{readonly}": "{path}{readonly}",
  工作目录文件: "Working tree file",
  只读: "read-only",

  // ---- editor tabs ----
  "打开的文件，支持滚轮与触控板横向滚动":
    "Open files. Scroll horizontally with the wheel or trackpad",
  "打开标签 {path}（{repository}）": "Open tab {path} ({repository})",
  "关闭标签 {path}（{repository}）": "Close tab {path} ({repository})",
  返回变更列表: "Back to changes list",
  隐藏文件侧栏: "Hide file sidebar",
  重试读取差异: "Retry reading diff",
  重试更新差异: "Retry updating diff",
  "正在更新差异…": "Updating diff…",
  "正在读取文件差异…": "Reading file diff…",

  // ---- history panel ----
  提交图仓库: "Commit graph repository",
  提交图分支范围: "Commit graph branch scope",
  所有分支: "All branches",
  "当前 HEAD": "Current HEAD",
  标签: "Tag",
  远端: "Remote",
  分支: "Branch",
  "{kind} · {name}": "{kind} · {name}",
  " · 未初始化": " · uninitialized",
  " · 读取失败": " · read failed",
  "在已加载提交中查找消息、作者或 SHA": "Search loaded commits by message, author, or SHA",
  搜索已加载提交: "Search loaded commits",
  上一个匹配提交: "Previous matching commit",
  下一个匹配提交: "Next matching commit",
  清除提交搜索: "Clear commit search",
  刷新提交图: "Refresh commit graph",
  重试刷新提交图: "Retry refreshing the commit graph",
  无法读取提交历史: "Cannot read commit history",
  "正在读取提交历史…": "Reading commit history…",
  加载更多提交: "Load more commits",
  此仓库还没有提交: "This repository has no commits yet",
  "首次提交后，分支与提交历史会显示在这里。":
    "Branches and commit history will appear here after the first commit.",
  提交详情: "Commit details",
  "正在读取提交详情…": "Reading commit details…",
  读取提交详情失败: "Failed to read commit details",
  展开提交详情: "Expand commit details",
  收起提交详情: "Collapse commit details",
  关闭提交详情: "Close commit details",
  返回提交图: "Back to commit graph",
  "{count} 个分支 · 只读": "{count} branches · read-only",
  "（可继续加载）": "(more available)",
  作者: "Author",
  时间: "Time",
  已显示全部本地历史: "All local history is shown",
  "{count} 次提交": "{count} commits",
  "复制完整提交 SHA": "Copy full commit SHA",
  "{repo}：已复制提交 SHA。": "{repo}: commit SHA copied.",

  // ---- commit details & graph ----
  与第一父提交比较: "Compare with first parent",
  以列表显示提交文件: "Show commit files as a list",
  以目录树显示提交文件: "Show commit files as a tree",
  点击文件查看差异: "Click a file to view its diff",
  "查看父提交 {oid}": "View parent commit {oid}",
  "提交 {oid} {subject} · {author}": "Commit {oid} {subject} · {author}",
  "查看提交文件 {path} 的差异": "View the diff of commit file {path}",
  "{status} · 查看本次提交差异": "{status} · view this commit's diff",
  切换历史差异布局: "Toggle history diff layout",
  上一个历史差异块: "Previous history diff hunk",
  下一个历史差异块: "Next history diff hunk",
  "返回提交详情（Esc）": "Back to commit details (Esc)",
  "正在读取历史差异…": "Reading history diff…",
  读取历史差异失败: "Failed to read history diff",
  无法读取文件差异: "Cannot read the file diff",
  此提交没有文件变化: "This commit has no file changes",
  "这是一个空提交。": "This is an empty commit.",
  空树: "Empty tree",
  二进制: "Binary",
  父提交: "Parents",
  "初始提交 · 与空树比较": "Root commit · compared with the empty tree",
  提交者: "Committer",
  "{count} 个文件": "{count} files",

  // ---- diff viewer & overview ----
  二进制文件已更改: "Binary file changed",
  文件过大: "File too large",
  没有文本差异: "No text diff",
  修改代码横向滚动: "Scroll modified code horizontally",
  原始代码横向滚动: "Scroll original code horizontally",
  "差异位置：红色为删除，绿色为新增，点击跳转":
    "Diff positions: red for deletions, green for additions. Click to jump",
  "原始 · {side}": "Original · {side}",
  "修改 · {side}": "Modified · {side}",
  "超长行显示前 2000 字符；开启自动换行可查看完整内容。":
    "Lines longer than 2,000 characters show the first 2,000; enable wrap to see the full content.",
  "Mermaid 图表源码（图形预览可在桌面或 Web 打开）":
    "Mermaid diagram source (rendered previews are available on desktop or web)",
  "{kind}第 {line} 行，点击跳转": "{kind} line {line}, click to jump",
  "新增 · 修改": "added · modified",
  "删除 · 原始": "deleted · original",

  // ---- file menu / preview / mermaid ----
  "{path} 文件操作": "File actions for {path}",
  关闭文件菜单: "Close file menu",
  重试读取预览: "Retry reading preview",
  "重试加载 Mermaid": "Retry loading Mermaid",
  "正在加载 Mermaid 图表…": "Loading Mermaid diagram…",
  "图表引擎加载失败，可展开查看源码。":
    "The diagram engine failed to load; expand to view the source.",
  "HTML 预览请在桌面或 Web 面板中打开。": "Open HTML previews in a desktop or web panel.",
  "Mermaid 源码": "Mermaid source",
  "（图片路径）": " (image path)",
  "Mermaid 无法绘制：": "Mermaid cannot render: ",
  "Mermaid 加载失败：{error}": "Mermaid failed to load: {error}",
  "图表超过 20000 字符，请缩小图表。": "The diagram exceeds 20,000 characters. Make it smaller.",
  "每份预览最多绘制 16 个图表，其余图表保留源码。":
    "At most 16 diagrams are rendered per preview; the rest keep their source.",
  "当前浏览器不支持离线图表解压，请更新浏览器。":
    "This browser does not support offline diagram decompression. Update your browser.",
  离线图表引擎未能加载: "The offline diagram engine failed to load",

  // ---- web chrome ----
  "调整侧栏宽度，方向键每次 10 像素": "Resize the sidebar. Arrow keys move 10 px at a time",
  "调整左右对比宽度，方向键调整，Home 或双击恢复均分":
    "Resize the split view. Arrow keys adjust; Home or double-click resets to equal halves",
  "调整提交详情高度，上下方向键调整，Home 或双击恢复默认":
    "Resize commit details. Up/down arrow keys adjust; Home or double-click resets",

  // ---- server: service & repositories ----
  "所属仓库不可用，请刷新后重试。": "The owning repository is unavailable. Refresh and try again.",
  "此仓库正在执行 Git 操作，请等待完成。":
    "A Git operation is already running for this repository. Wait for it to finish.",
  "文件已不在当前变更列表中，请刷新后重试。":
    "The file is no longer in the current changes list. Refresh and try again.",
  "不能打开 Git 内部文件。": "Git internal files cannot be opened.",
  "不能操作 Git 内部文件。": "Git internal files cannot be modified.",
  "文件必须位于所属仓库内。": "Files must be inside their owning repository.",
  "不是有效的工作区文件链接。": "Not a valid workspace file link.",
  "文件链接必须位于当前工作区内。": "File links must point inside the current workspace.",
  "链接指向的文件或目录不存在。": "The link target file or directory does not exist.",
  "所属仓库不可用。": "The owning repository is unavailable.",
  "链接所属仓库不可用。": "The repository owning this link is unavailable.",
  "链接目标不是普通文件或目录。": "The link target is not a regular file or directory.",
  "文件路径必须位于所属仓库内。": "File paths must be inside their owning repository.",
  "检测到重复的子模块仓库路径。": "Duplicate submodule repository paths detected.",
  "仓库快照不完整，请刷新后重试。": "The repository snapshot is incomplete. Refresh and try again.",

  // ---- server: diff & history ----
  "二进制文件已变化，无法显示文本行差异。": "The binary file changed; line diffs cannot be shown.",
  "仅文件名、类型或权限等元数据发生变化。":
    "Only metadata such as file name, type, or permissions changed.",
  "仅文件名、类型、子模块指针或权限等元数据发生变化。":
    "Only metadata such as file name, type, submodule pointer, or permissions changed.",
  "该文件已不在当前变更列表中，请刷新后重试。":
    "The file is no longer in the current changes list. Refresh and try again.",
  "文件存在未解决的合并冲突，请切换全部未提交查看工作目录中的冲突标记。":
    "The file has unresolved merge conflicts. Switch to All uncommitted to see the conflict markers in the working tree.",
  "这是未注册的嵌套仓库目录，请单独打开该仓库。":
    "This is an unregistered nested repository directory. Open that repository separately.",
  "文件超过 1 MiB，保留变更状态和统计；请在本地 Git 工具中查看完整内容。":
    "The file exceeds 1 MiB. Change status and stats are kept; view the full content in a local Git tool.",
  "补丁超过 2 MiB，请在本地 Git 工具中查看完整内容。":
    "The patch exceeds 2 MiB. View the full content in a local Git tool.",
  "文件超过 1 MiB，无法预览。": "The file exceeds 1 MiB and cannot be previewed.",
  "历史文件超过 1 MiB，请在本地 Git 工具中查看完整内容。":
    "The historical file exceeds 1 MiB. View the full content in a local Git tool.",
  "当前没有文本差异。": "There is no text diff.",
  "忽略空白后没有文本差异。": "There is no text diff after ignoring whitespace.",
  "仓库已更新，请重试读取差异。": "The repository changed. Try reading the diff again.",
  "分支或标签已不存在，请刷新提交图。":
    "The branch or tag no longer exists. Refresh the commit graph.",
  "提交历史已变化，请刷新后继续加载。": "Commit history changed. Refresh before loading more.",
  "提交不存在，请刷新提交图。": "The commit does not exist. Refresh the commit graph.",
  "父提交尚未在本地可用（可能是浅克隆），无法读取本次提交的文件差异。":
    "The parent commit is not available locally (possibly a shallow clone), so the commit's file diff cannot be read.",
  "文件不在该提交的变更列表中。": "The file is not part of this commit's changes.",
  "当前选项下没有文本差异。": "There is no text diff under the current selection.",

  // ---- server: files ----
  "此文件已从暂存区删除。": "This file was deleted from the index.",
  "符号链接和目录不支持文件预览。": "Symlinks and directories do not support file preview.",
  "预览文件必须位于所属仓库内。": "Previewed files must be inside their owning repository.",
  "文件已删除，请切换差异查看原始内容。":
    "The file was deleted. Switch to the diff to view the original content.",
  "此文件是二进制文件，无法显示文本预览。": "This is a binary file; text preview is unavailable.",
  "在 Finder 中显示": "Reveal in Finder",
  在文件资源管理器中显示: "Reveal in File Explorer",
  打开所在文件夹: "Open containing folder",
  "当前主机不支持打开文件管理器。": "This host does not support opening the file manager.",

  // ---- server: repository actions ----
  "所选文件已变化，请刷新后重试。": "The selected files changed. Refresh and try again.",
  "上游必须指向远程分支。": "The upstream must point to a remote branch.",
  "此仓库没有远程仓库，请先配置 remote。": "This repository has no remote. Configure one first.",
  "无法确定远程仓库，请先为当前分支配置上游。":
    "Cannot determine the remote repository. Configure an upstream for the current branch first.",
  "请先在本地分支上创建提交，再拉取或推送。":
    "Create a commit on a local branch before pulling or pushing.",
  "请填写提交信息。": "Enter a commit message.",
  "仓库 HEAD 已变化，请刷新并检查后重新提交。":
    "The repository HEAD changed. Refresh, review, and commit again.",
  "仓库仍有未解决的冲突，请先解决冲突并暂存。":
    "The repository still has unresolved conflicts. Resolve them and stage the files first.",
  "没有可提交的已暂存更改。": "There are no staged changes to commit.",
  "提交成功。": "Committed successfully.",
  "已暂存所选文件。": "Staged the selected files.",
  "已暂存此仓库的全部更改。": "Staged all changes in this repository.",
  "已取消暂存，工作目录内容已保留。": "Unstaged; working tree contents were kept.",
  "请先解决此仓库的冲突，再拉取。": "Resolve this repository's conflicts before pulling.",
  "拉取完成。": "Pull completed.",
  "推送完成。": "Push completed.",
  "此仓库没有可提交的更改。": "This repository has no changes to commit.",
  "没有已暂存的更改可生成提交信息。":
    "There are no staged changes to generate a commit message from.",
  "请先解决冲突，再生成提交信息。": "Resolve the conflicts before generating a commit message.",
  更新: "Updated",
  添加: "Added",
  移除: "Removed",
  "- {labels} {path}": "- {labels} {path}",
  "{files}等 {count} 个文件": "{files} and {count} more files",
  "- 其余 {count} 个文件": "- {count} more files",
  "（原路径 {path}）": " (was {path})",

  // ---- server: commit message ----
  "用简洁的中文概括变更目的，遵循 Conventional Commits，使用祈使句，不加句号，尽量不超过 72 个字符。":
    "Summarize the purpose of the changes concisely in English, follow Conventional Commits, use the imperative mood, omit the final period, and stay within 72 characters when possible.",
  "paseo.json 超过 1 MiB。": "paseo.json exceeds 1 MiB.",
  "无法读取此仓库 paseo.json 中的提交信息指令，请检查配置或在插件设置中填写提示词。":
    "Cannot read the commit message instructions in this repository's paseo.json. Check the configuration or fill in instructions in plugin settings.",
  "AI 返回的提交信息格式无效，需要包含单行 message 的 JSON。":
    "The AI returned an invalid commit message format; JSON with a single-line message is required.",
  "生成会话已停止。": "The generation session was stopped.",
  "当前工作区不可用或目录不匹配，请重新打开 Git 面板后再试。":
    "The current workspace is unavailable or its directory does not match. Reopen the Git panel and try again.",
  "无法确定当前工作区，请重新打开 Git 面板后生成提交信息。":
    "Cannot determine the current workspace. Reopen the Git panel before generating a commit message.",
  "Paseo 没有可用的 AI 模型，请先在 Paseo 中启用模型提供商。":
    "Paseo has no available AI model. Enable a model provider in Paseo first.",
  "提交信息 · {repository}": "Commit message · {repository}",
  "生成会话请求了工具权限，已停止。":
    "The generation session requested tool permissions and was stopped.",
  "生成提交信息超时。": "Commit message generation timed out.",
  "生成会话失败。": "The generation session failed.",
  "生成会话未能归档，请在 Paseo 会话列表中检查后重试。":
    "The generation session could not be archived. Check the Paseo session list and try again.",
  "AI 提交信息生成失败，已保留当前草稿。{failures}":
    "AI commit message generation failed; the current draft was kept. {failures}",
  "生成任务已失效，请重新生成提交信息。":
    "The generation job is no longer valid. Generate the commit message again.",
  "生成任务过多，请等待其他仓库完成后重试。":
    "Too many generation jobs. Wait for other repositories to finish and try again.",
  "请先在插件设置中修复或恢复默认设置。":
    "Fix or restore default settings in the plugin settings first.",
};
