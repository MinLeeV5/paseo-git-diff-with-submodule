import { readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import type {
  PaseoAgentHandle,
  PaseoAgentRunResult,
  PaseoProviderSnapshotResult,
} from "@getpaseo/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CommitMessagePaseo,
  commitMessagePrompt,
  commitMessageProviders,
} from "../server/commit-message";
import { CommitMessageJobs } from "../server/commit-message-jobs";
import { GitChangesService } from "../server/service";
import { panelSettingsSchema } from "../shared/settings";
import { addModule, command, commit, fixture, put } from "./fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanups.splice(0).map((close) => close()));
});
const entries: PaseoProviderSnapshotResult["entries"] = [
  {
    provider: "codex",
    enabled: true,
    status: "ready",
    models: [
      {
        provider: "codex",
        id: "test-mini",
        label: "Test mini",
        isDefault: true,
        thinkingOptions: [{ id: "low", label: "Low" }],
        defaultThinkingOptionId: "low",
      },
    ],
  },
];
const idle: PaseoAgentRunResult = {
  status: "idle",
  final: null,
  error: null,
  lastMessage: '{"message":"fix: 修复文件导航"}',
};
function fakePaseo(providers = entries) {
  const run = vi.fn<PaseoAgentHandle["run"]>().mockResolvedValue(idle);
  const archive = vi
    .fn<PaseoAgentHandle["archive"]>()
    .mockResolvedValue({ archivedAt: new Date().toISOString() });
  const refetch = vi.fn<PaseoAgentHandle["timeline"]["refetch"]>();
  const create = vi.fn<CommitMessagePaseo["agents"]["create"]>().mockImplementation(
    async () =>
      ({
        id: "commit-generator",
        run,
        archive,
        timeline: { refetch },
      }) as unknown as PaseoAgentHandle,
  );
  const get = vi.fn<CommitMessagePaseo["config"]["get"]>().mockResolvedValue({
    config: { metadataGeneration: { providers: [{ provider: "codex", model: "test-mini" }] } },
  } as Awaited<ReturnType<CommitMessagePaseo["config"]["get"]>>);
  const waitForReady = vi.fn<CommitMessagePaseo["providers"]["waitForReady"]>().mockResolvedValue({
    entries: providers,
    generatedAt: new Date().toISOString(),
  } as PaseoProviderSnapshotResult);
  return {
    paseo: { config: { get }, providers: { waitForReady }, agents: { create } },
    run,
    archive,
    create,
    get,
    refetch,
  };
}
async function setup() {
  const f = await fixture();
  cleanups.push(f.close);
  const directory = await f.repo("workspace");
  const service = new GitChangesService();
  cleanups.push(async () => service.close());
  await put(directory, "file.txt", "baseline\n");
  await commit(directory);
  return { f, directory, service };
}
const settings = panelSettingsSchema.parse({});

describe("Paseo commit messages", () => {
  it("follows metadata configuration, nested models, default order and enablement", () => {
    const providers: PaseoProviderSnapshotResult["entries"] = [
      ...entries,
      {
        provider: "disabled",
        enabled: false,
        status: "ready",
        models: [{ provider: "disabled", id: "haiku", label: "Haiku" }],
      },
      {
        provider: "broken",
        enabled: true,
        status: "error",
        models: [{ provider: "broken", id: "haiku", label: "Haiku" }],
      },
      {
        provider: "pi",
        enabled: true,
        status: "ready",
        models: [
          {
            provider: "pi",
            id: "nested/haiku",
            label: "Haiku",
            metadata: { providerId: "nested", modelId: "haiku" },
          },
        ],
      },
    ];
    expect(
      commitMessageProviders(providers, [
        { provider: "codex", model: "custom-model", thinkingOptionId: "medium" },
        { provider: "nested", model: "haiku" },
        { provider: "codex" },
        { provider: "codex" },
        { provider: "disabled", model: "haiku" },
      ]),
    ).toEqual([
      { provider: "codex/custom-model", thinkingOptionId: "medium" },
      { provider: "pi/nested/haiku" },
      { provider: "codex/test-mini", thinkingOptionId: "low" },
    ]);
    expect(commitMessageProviders(providers, [])[0]).toEqual({ provider: "pi/nested/haiku" });
  });

  it("uses the staged patch even when the working copy cancels HEAD changes, without modifying Git", async () => {
    const { directory, service } = await setup();
    await put(directory, "file.txt", "staged-only-content\n");
    await command(directory, "add", "file.txt");
    await put(directory, "file.txt", "baseline\n");
    await put(directory, "untracked.txt", "untracked-content\n");
    const before = await command(directory, "diff", "--cached");
    const head = await command(directory, "rev-parse", "HEAD");
    const fake = fakePaseo();
    const result = await service.generateCommitMessage(
      { directory, repositoryId: ".", scope: "staged" },
      { paseo: fake.paseo, settings },
    );
    expect(result).toEqual({ message: "fix: 修复文件导航", source: "paseo", scope: "staged" });
    expect(fake.run.mock.calls[0][0]).toContain("+staged-only-content");
    expect(fake.run.mock.calls[0][0]).not.toContain("untracked");
    expect(fake.create.mock.calls[0][0]).toMatchObject({
      cwd: await realpath(directory),
      autoArchive: true,
      config: {
        provider: "codex/test-mini",
        thinkingOptionId: "low",
        options: { sandbox_mode: "read-only", approval_policy: "never" },
      },
    });
    expect(fake.archive).toHaveBeenCalledOnce();
    expect(await command(directory, "diff", "--cached")).toBe(before);
    expect(await command(directory, "rev-parse", "HEAD")).toBe(head);
    expect(await readFile(join(directory, "file.txt"), "utf8")).toBe("baseline\n");
  });

  it("uses each submodule's instructions and patch while creating the session in the root workspace", async () => {
    const { f, directory, service } = await setup();
    const source = await f.repo("source");
    await put(source, "child.txt", "child-baseline\n");
    await put(
      source,
      "paseo.json",
      JSON.stringify({ metadataGeneration: { commitMessage: { instructions: "CHILD_STYLE" } } }),
    );
    await commit(source);
    const child = await addModule(directory, source, "modules/child");
    await put(
      directory,
      "paseo.json",
      JSON.stringify({ metadataGeneration: { commitMessage: { instructions: "ROOT_STYLE" } } }),
    );
    await commit(directory);
    await put(directory, "file.txt", "ROOT_CHANGE\n");
    await put(child, "child.txt", "CHILD_CHANGE\n");
    const fake = fakePaseo();
    await service.generateCommitMessage(
      { directory, repositoryId: "modules/child", scope: "all" },
      { paseo: fake.paseo, settings },
    );
    const prompt = fake.run.mock.calls[0][0];
    expect(prompt).toContain("CHILD_STYLE");
    expect(prompt).toContain("+CHILD_CHANGE");
    expect(prompt).not.toContain("ROOT_STYLE");
    expect(prompt).not.toContain("ROOT_CHANGE");
    expect(fake.create.mock.calls[0][0].cwd).toBe(await realpath(directory));
    const snapshot = await service.snapshot({ directory, comparison: "head" });
    const rootPrompt = await commitMessagePrompt(snapshot.repositories[0], "all", "");
    expect(rootPrompt).toContain("ROOT_STYLE");
    expect(rootPrompt).toContain("+ROOT_CHANGE");
    expect(rootPrompt).not.toContain("CHILD_CHANGE");
  });

  it("honors the plugin prompt over project style, validates bad configuration, and defaults when absent", async () => {
    const { directory, service } = await setup();
    await put(directory, "file.txt", "after\n");
    await put(
      directory,
      "paseo.json",
      JSON.stringify({ metadataGeneration: { commitMessage: { instructions: "PROJECT_STYLE" } } }),
    );
    await command(directory, "add", "file.txt");
    const snapshot = await service.snapshot({ directory, comparison: "staged" });
    const repo = snapshot.repositories[0];
    const custom = await commitMessagePrompt(repo, "staged", "PLUGIN_STYLE");
    expect(custom).toContain("PLUGIN_STYLE");
    expect(custom).not.toContain("PROJECT_STYLE");
    expect(custom).not.toContain("祈使句");
    expect(await commitMessagePrompt(repo, "staged", "")).toContain("PROJECT_STYLE");
    await put(directory, "paseo.json", "invalid-json");
    await expect(commitMessagePrompt(repo, "staged", "")).rejects.toThrow("paseo.json");
    expect(await commitMessagePrompt(repo, "staged", "OVERRIDE")).toContain("OVERRIDE");
    await rm(join(directory, "paseo.json"));
    expect(await commitMessagePrompt(repo, "staged", "")).toContain("Conventional Commits");
  });

  it("limits large inputs and includes untracked content and changed gitlink metadata", async () => {
    const { f, directory, service } = await setup();
    const source = await f.repo("source");
    await put(source, "child.txt", "initial\n");
    await commit(source);
    const child = await addModule(directory, source, "modules/child");
    await commit(directory);
    await put(child, "child.txt", "CHILD_PRIVATE_PATCH\n");
    await commit(child);
    await put(directory, "new.txt", "UNTRACKED_CONTENT\n");
    await put(directory, "large.txt", "LARGE_CONTENT".repeat(130000));
    await put(directory, "file.txt", "CHANGED_LINE\n".repeat(14000));
    const snapshot = await service.snapshot({ directory, comparison: "head" });
    const prompt = await commitMessagePrompt(snapshot.repositories[0], "all", "");
    expect(prompt.includes("modules/child")).toBe(true);
    expect(prompt).not.toContain("CHILD_PRIVATE_PATCH");
    expect(prompt).not.toContain("LARGE_CONTENT");
    expect(prompt).toContain("Diff truncated");
    expect(prompt.length).toBeLessThan(123000);
    // The individual small untracked file is included when the earlier patch fits.
    await put(directory, "file.txt", "small-change\n");
    const smallPrompt = await commitMessagePrompt(snapshot.repositories[0], "all", "");
    expect(smallPrompt.includes("UNTRACKED_CONTENT")).toBe(true);
    expect(smallPrompt.includes("Subproject commit")).toBe(true);
  });

  it("reads the right versions for an unborn repository and omits staged files removed from disk", async () => {
    const f = await fixture();
    cleanups.push(f.close);
    const directory = await f.repo("unborn");
    const service = new GitChangesService();
    cleanups.push(async () => service.close());
    await put(directory, "new.txt", "INDEX_CONTENT\n");
    await put(directory, "removed.txt", "removed\n");
    await command(directory, "add", ".");
    await put(directory, "new.txt", "WORKING_CONTENT\n");
    await rm(join(directory, "removed.txt"));
    const snapshot = await service.snapshot({ directory, comparison: "head" });
    const all = await commitMessagePrompt(snapshot.repositories[0], "all", "");
    expect(all).toContain("WORKING_CONTENT");
    expect(all).not.toContain("INDEX_CONTENT");
    expect(all).not.toContain("removed.txt");
    const staged = await commitMessagePrompt(snapshot.repositories[0], "staged", "");
    expect(staged).toContain("INDEX_CONTENT");
    expect(staged).not.toContain("WORKING_CONTENT");
    expect(staged).toContain("removed.txt");
  });

  it.each([
    { status: "timeout", error: null, lastMessage: null },
    { status: "permission", error: null, lastMessage: null },
    { status: "error", error: "provider unavailable", lastMessage: null },
    { status: "idle", error: null, lastMessage: '{"message":"first\\nsecond"}' },
    { status: "idle", error: null, lastMessage: "not JSON" },
  ] as const)("archives $status sessions even after failure", async (response) => {
    const { directory, service } = await setup();
    await put(directory, "file.txt", "after\n");
    const fake = fakePaseo();
    fake.run.mockResolvedValue({ ...response, final: null });
    await expect(
      service.generateCommitMessage(
        { directory, repositoryId: ".", scope: "all" },
        { paseo: fake.paseo, settings },
      ),
    ).rejects.toThrow("AI 提交信息生成失败");
    expect(fake.archive).toHaveBeenCalledOnce();
    await expect(
      service.repositoryAction({ directory, repositoryId: ".", action: "stage" }),
    ).resolves.toMatchObject({ message: expect.any(String) });
  });

  it("tries the next configured model after failure and parses fenced JSON", async () => {
    const { directory, service } = await setup();
    await put(directory, "file.txt", "after\n");
    const fake = fakePaseo();
    fake.get.mockResolvedValue({
      config: {
        metadataGeneration: {
          providers: [
            { provider: "codex", model: "first" },
            { provider: "codex", model: "test-mini" },
          ],
        },
      },
    } as Awaited<ReturnType<CommitMessagePaseo["config"]["get"]>>);
    fake.run
      .mockResolvedValueOnce({ ...idle, status: "error", error: "first model failed" })
      .mockResolvedValueOnce({
        ...idle,
        lastMessage: '```json\n{"message":"fix: second model"}\n```',
      });
    await expect(
      service.generateCommitMessage(
        { directory, repositoryId: ".", scope: "all" },
        { paseo: fake.paseo, settings },
      ),
    ).resolves.toMatchObject({ message: "fix: second model" });
    expect(fake.create.mock.calls.map(([options]) => options.config.provider)).toEqual([
      "codex/first",
      "codex/test-mini",
    ]);
    expect(fake.archive).toHaveBeenCalledTimes(2);
  });

  it("blocks concurrent writes and stops an active generation when the service closes", async () => {
    const { directory, service } = await setup();
    await put(directory, "file.txt", "after\n");
    const fake = fakePaseo();
    let release = (_: PaseoAgentRunResult) => {};
    fake.run.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const running = service.generateCommitMessage(
      { directory, repositoryId: ".", scope: "all" },
      { paseo: fake.paseo, settings },
    );
    const failure = expect(running).rejects.toThrow();
    await vi.waitFor(() => expect(fake.run).toHaveBeenCalledOnce());
    await expect(
      service.repositoryAction({ directory, repositoryId: ".", action: "stage" }),
    ).rejects.toThrow("正在执行");
    service.close();
    expect(fake.archive).toHaveBeenCalledOnce();
    release(idle);
    await failure;
    expect(fake.create).toHaveBeenCalledOnce();
    expect(fake.archive).toHaveBeenCalledOnce();
  });

  it("explains unavailable models and lets users explicitly choose the local generator", async () => {
    const { directory, service } = await setup();
    await put(directory, "file.txt", "after\n");
    const fake = fakePaseo([]);
    const input = { directory, repositoryId: ".", scope: "all" as const };
    await expect(
      service.generateCommitMessage(input, { paseo: fake.paseo, settings }),
    ).rejects.toThrow("没有可用的 AI 模型");
    await expect(
      service.generateCommitMessage(input, {
        paseo: fake.paseo,
        settings: { ...settings, commitMessageGenerator: "local" },
      }),
    ).resolves.toMatchObject({ source: "local" });
    expect(fake.create).not.toHaveBeenCalled();
  });
});

describe("commit generation polling", () => {
  it("returns immediately, reuses a running job, binds it to its repo and retains the result", async () => {
    const jobs = new CommitMessageJobs();
    const input = { directory: "/root", repositoryId: ".", scope: "staged" as const };
    let release = (_: { message: string; source: "paseo"; scope: "staged" }) => {};
    const generate = vi.fn(
      () =>
        new Promise<{ message: string; source: "paseo"; scope: "staged" }>((resolve) => {
          release = resolve;
        }),
    );
    const started = jobs.request(input, generate);
    expect(started.status).toBe("working");
    if (started.status !== "working") throw new Error("not started");
    expect(jobs.request(input, generate)).toEqual(started);
    expect(jobs.request({ ...input, generationId: started.generationId }, generate)).toEqual(
      started,
    );
    expect(() =>
      jobs.request(
        { ...input, repositoryId: "other", generationId: started.generationId },
        generate,
      ),
    ).toThrow("任务已失效");
    await Promise.resolve();
    release({ message: "fix: draft", source: "paseo", scope: "staged" });
    await vi.waitFor(() =>
      expect(
        jobs.request({ ...input, generationId: started.generationId }, generate),
      ).toMatchObject({ status: "ready", message: "fix: draft" }),
    );
    expect(generate).toHaveBeenCalledOnce();
  });

  it("retains errors for polling clients and allows a fresh attempt", async () => {
    const jobs = new CommitMessageJobs();
    const input = { directory: "/root", repositoryId: ".", scope: "all" as const };
    const generate = vi.fn().mockRejectedValue(new Error("AI failed"));
    const result = jobs.request(input, generate);
    if (result.status !== "working") throw new Error("not started");
    await vi.waitFor(() =>
      expect(jobs.request({ ...input, generationId: result.generationId }, generate)).toEqual({
        status: "failed",
        error: "AI failed",
      }),
    );
    const retry = jobs.request(input, generate);
    expect(retry.status).toBe("working");
    expect(retry).not.toEqual(result);
  });
});
