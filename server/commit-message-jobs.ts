import { randomUUID } from "node:crypto";
import type {
  CommitMessageDraft,
  CommitMessageRequest,
  CommitMessageResult,
} from "../shared/repository-contracts";
import { errorMessage } from "./git";

// Model calls can outlast the host's RPC deadline. Keep each RPC short and let
// panels poll the same job; restarting a poll must never create another session.
export class CommitMessageJobs {
  private readonly jobs = new Map<
    string,
    { key: string; result: CommitMessageResult; finishedAt: number | null }
  >();

  request(
    input: CommitMessageRequest,
    generate: () => Promise<CommitMessageDraft>,
  ): CommitMessageResult {
    const key = JSON.stringify([
      input.workspaceId,
      input.directory,
      input.repositoryId,
      input.scope,
    ]);
    for (const [id, job] of this.jobs)
      if (job.finishedAt !== null && Date.now() - job.finishedAt > 600000) this.jobs.delete(id);
    if (input.generationId) {
      const job = this.jobs.get(input.generationId);
      if (!job || job.key !== key) throw new Error("生成任务已失效，请重新生成提交信息。");
      return job.result;
    }
    for (const job of this.jobs.values())
      if (job.key === key && job.result.status === "working") return job.result;
    if (this.jobs.size >= 32) {
      for (const [id, job] of this.jobs) {
        if (job.finishedAt !== null) this.jobs.delete(id);
        if (this.jobs.size < 32) break;
      }
      if (this.jobs.size >= 32) throw new Error("生成任务过多，请等待其他仓库完成后重试。");
    }
    const generationId = randomUUID();
    const job = {
      key,
      result: { status: "working", generationId } as CommitMessageResult,
      finishedAt: null as number | null,
    };
    this.jobs.set(generationId, job);
    void Promise.resolve()
      .then(generate)
      .then(
        (draft) => {
          job.result = { status: "ready", ...draft };
          job.finishedAt = Date.now();
        },
        (error) => {
          job.result = { status: "failed", error: errorMessage(error) };
          job.finishedAt = Date.now();
        },
      );
    return job.result;
  }

  clear() {
    this.jobs.clear();
  }
}
