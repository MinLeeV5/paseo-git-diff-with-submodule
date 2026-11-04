Review local Git changes across a workspace and its initialized nested submodules, including submodules configured with `ignore = all`. Each repository is compared against its own HEAD. You can review all uncommitted changes, staged changes, or unstaged changes while keeping standard Git ignore rules.

The workspace panel provides a compact file list or tree, file type icons, language-aware syntax colors, and scrollable tabs for multiple files. Compare changes side by side, in a unified view, or as a patch. Resize the file sidebar and comparison split, filter file paths, jump between change blocks, and adjust whitespace, context, line numbers, and wrapping.

Markdown, HTML, and images support full-file previews. Markdown includes offline Mermaid diagrams. HTML previews do not run scripts, and document previews block external and relative resources. Rich document previews are available on desktop and Web; native mobile clients fall back to text. The file context menu reveals a file in Finder or the file manager on the daemon host, or its nearest existing parent if the file was deleted.

Settings are grouped into Appearance, Code, Comparison, and Behavior. Fonts, weight, size, and other display preferences are saved on the current Paseo host. Git status refreshes every two seconds by default, with configurable intervals and a pause control; polling stops in the background. Existing tabs remain local to the panel session.

Requires Paseo daemon and client 0.12.0 or later, and Git on the daemon host. Git commands and file reads run on that host; the client receives status, diffs, and previews through Paseo RPC. The plugin does not transmit repository contents to external services or read service credentials. Preview rendering and icons use bundled assets.

This is a read-only review tool. It does not stage, discard, commit, push, or initialize submodules. Branch and arbitrary commit comparisons are not provided. Files and previews are limited to 1 MiB, and patches to 2 MiB; larger or binary entries retain their status and explain the reading limit.
