import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const repositoryInput = {
  directory: z.string().min(1),
  repositoryId: z.string().min(1),
};
export const repositoryActionRpc = defineRpc({
  name: "git.repository-action",
  input: z.discriminatedUnion("action", [
    z.object({
      ...repositoryInput,
      action: z.literal("stage"),
      paths: z.array(z.string().min(1)).min(1).max(10000).optional(),
    }),
    z.object({
      ...repositoryInput,
      action: z.literal("unstage"),
      paths: z.array(z.string().min(1)).min(1).max(10000).optional(),
    }),
    z.object({
      ...repositoryInput,
      action: z.literal("commit"),
      message: z.string().trim().min(1).max(32000),
      stageAll: z.boolean().default(false),
      expectedHead: z.string().nullable(),
    }),
    z.object({ ...repositoryInput, action: z.literal("pull") }),
    z.object({ ...repositoryInput, action: z.literal("push") }),
  ]),
  output: z.object({ message: z.string(), head: z.string().nullable() }),
});
export type RepositoryAction = z.infer<typeof repositoryActionRpc.input>;

export const generateCommitMessageRpc = defineRpc({
  name: "git.generate-commit-message",
  input: z.object({
    ...repositoryInput,
    scope: z.enum(["staged", "all"]),
    generationId: z.string().uuid().optional(),
  }),
  output: z.discriminatedUnion("status", [
    z.object({ status: z.literal("working"), generationId: z.string().uuid() }),
    z.object({
      status: z.literal("ready"),
      message: z.string(),
      scope: z.enum(["staged", "all"]),
      source: z.enum(["local", "paseo"]),
    }),
    z.object({ status: z.literal("failed"), error: z.string() }),
  ]),
});
export type CommitMessageRequest = z.infer<typeof generateCommitMessageRpc.input>;
export type CommitMessageResult = z.infer<typeof generateCommitMessageRpc.output>;
export type CommitMessageDraft = Omit<Extract<CommitMessageResult, { status: "ready" }>, "status">;
