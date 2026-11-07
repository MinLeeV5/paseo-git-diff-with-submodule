import { useRpc } from "@getpaseo/plugin/client";
import { useCallback, useRef, useState } from "react";
import {
  generateCommitMessageRpc,
  type RepositoryAction,
  repositoryActionRpc,
} from "../shared/repository-contracts";

export type RepositoryOperationState = {
  busy: RepositoryAction["action"] | "generate" | null;
  message: string;
  error: boolean;
};

export function useRepositoryActions(directory: string, refresh: () => void) {
  const action = useRpc(repositoryActionRpc);
  const generate = useRpc(generateCommitMessageRpc);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftRef = useRef(drafts);
  const [states, setStates] = useState<Record<string, RepositoryOperationState>>({});
  const pending = useRef(new Set<string>());
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const setDraft = useCallback((id: string, message: string) => {
    draftRef.current = { ...draftRef.current, [id]: message };
    setDrafts(draftRef.current);
  }, []);
  const clearMessage = useCallback((id: string) => {
    setStates((old) => ({ ...old, [id]: { ...old[id], message: "" } }));
  }, []);
  const run = useCallback(
    async (input: RepositoryAction) => {
      const id = input.repositoryId;
      if (pending.current.has(id)) return;
      pending.current.add(id);
      setStates((old) => ({ ...old, [id]: { busy: input.action, message: "", error: false } }));
      try {
        const result = await action(input);
        if (input.action === "commit" && draftRef.current[id]?.trim() === input.message.trim())
          setDraft(id, "");
        setStates((old) => ({
          ...old,
          [id]: { busy: null, message: result.message, error: false },
        }));
      } catch (error) {
        setStates((old) => ({
          ...old,
          [id]: {
            busy: null,
            message: error instanceof Error ? error.message : String(error),
            error: true,
          },
        }));
      } finally {
        pending.current.delete(id);
        refreshRef.current();
      }
    },
    [action, setDraft],
  );
  const generateMessage = useCallback(
    async (id: string, scope: "staged" | "all") => {
      if (pending.current.has(id)) return;
      pending.current.add(id);
      const before = draftRef.current[id] ?? "";
      setStates((old) => ({ ...old, [id]: { busy: "generate", message: "", error: false } }));
      try {
        let result = await generate({ directory, repositoryId: id, scope });
        while (result.status === "working") {
          await new Promise((resolve) => setTimeout(resolve, 750));
          result = await generate({
            directory,
            repositoryId: id,
            scope,
            generationId: result.generationId,
          });
        }
        if (result.status === "failed") throw new Error(result.error);
        const unchanged = (draftRef.current[id] ?? "") === before;
        if (unchanged) setDraft(id, result.message.split(/\r?\n/, 1)[0]);
        setStates((old) => ({
          ...old,
          [id]: {
            busy: null,
            message: unchanged
              ? result.source === "paseo"
                ? "已通过 Paseo AI 生成提交信息，可继续编辑。"
                : "已根据文件变化生成提交信息，可继续编辑。"
              : "生成期间输入已变化，已保留当前草稿。",
            error: false,
          },
        }));
      } catch (error) {
        setStates((old) => ({
          ...old,
          [id]: {
            busy: null,
            message: error instanceof Error ? error.message : String(error),
            error: true,
          },
        }));
      } finally {
        pending.current.delete(id);
      }
    },
    [directory, generate, setDraft],
  );
  return { drafts, states, setDraft, clearMessage, run, generateMessage };
}
