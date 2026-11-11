# GitLens

**Review and commit across repositories, without leaving Paseo.**

- 🧩 **Nested repositories**: Review the root and initialized submodules, even with `ignore = all`. Each uses its own HEAD.
- 🔍 **Focused diffs**: Split or unified views, staged/unstaged comparisons, file tabs, change markers, and stable refresh.
- ✍️ **Commit and sync**: Stage, unstage, commit, fast-forward pull, and push per repository; draft messages with Paseo AI or local rules.
- 🌿 **Trace history**: Browse branches, merges, refs, and tags; search loaded commits and inspect historical diffs.
- 📖 **Preview documents**: Read Markdown, offline Mermaid, static HTML, and images; follow workspace links and heading anchors.

## Workflow

Open GitLens in a workspace, choose a repository, and review its changes or history. Customize fonts, layout, refresh behavior, and commit instructions per host. Git runs on the daemon host using its identity, authentication, and hooks.

AI drafts send file paths, change metadata, diff excerpts, and instructions to the configured Paseo provider. Local rules run on the host.

## Requirements and scope

Requires **Paseo daemon and client 0.12.0+**, with Git on the host. Files and previews are limited to **1 MiB**, patches to **2 MiB**. HTML and rendered Mermaid are for desktop/Web; native mobile shows Mermaid source.

Submodule initialization, branch switching, discarding changes, and arbitrary-ref comparisons are not provided.
