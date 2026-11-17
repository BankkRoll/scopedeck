import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toAppError, type AppError } from "@/ipc/errors";
import { draftGet, draftSave, type Draft, type DraftContent } from "@/ipc/workspace";
import { queryKeys } from "@/query/keys";

const AUTOSAVE_DELAY_MS = 400;

export const EMPTY_DRAFT: DraftContent = {
  programHandle: null,
  title: "",
  structuredScopeId: null,
  weaknessId: null,
  severityRating: null,
  vulnerabilityInformation: "",
  impact: "",
  acknowledgedExclusions: [],
};

function contentOf(draft: Draft): DraftContent {
  return {
    programHandle: draft.programHandle,
    title: draft.title,
    structuredScopeId: draft.structuredScopeId,
    weaknessId: draft.weaknessId,
    severityRating: draft.severityRating,
    vulnerabilityInformation: draft.vulnerabilityInformation,
    impact: draft.impact,
    acknowledgedExclusions: draft.acknowledgedExclusions,
  };
}

export type SaveState =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: string } | { kind: "failed"; error: AppError };

/**
 * Local edits win over the stored copy, and each edit is written to SQLite shortly after it
 * happens, so a crash or reload loses at most the last few hundred milliseconds of typing.
 * The composer is remounted per draft, so this hook never has to reset itself.
 */
export function useDraft(draftId: string | undefined, initialProgram: string | undefined) {
  const queryClient = useQueryClient();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<DraftContent | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const loaded = useQuery({
    queryKey: queryKeys.draft(draftId ?? createdId ?? ""),
    queryFn: () => draftGet(draftId ?? createdId ?? ""),
    enabled: Boolean(draftId ?? createdId),
    staleTime: Infinity,
  });

  const id = draftId ?? createdId;
  const base = useMemo(
    () => (loaded.data ? contentOf(loaded.data) : { ...EMPTY_DRAFT, programHandle: initialProgram ?? null }),
    [loaded.data, initialProgram],
  );
  const content = edits ?? base;
  const latest = useRef({ id, content });
  useEffect(() => {
    latest.current = { id, content };
  });

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return latest.current.id;
    dirty.current = false;
    setSaveState({ kind: "saving" });
    try {
      const saved = await draftSave(latest.current.id, latest.current.content);
      latest.current = { ...latest.current, id: saved.id };
      setCreatedId((current) => current ?? saved.id);
      queryClient.setQueryData(queryKeys.draft(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.drafts });
      setSaveState({ kind: "saved", at: saved.updatedAt });
      return saved.id;
    } catch (error) {
      dirty.current = true;
      setSaveState({ kind: "failed", error: toAppError(error) });
      return latest.current.id;
    }
  }, [queryClient]);

  const update = useCallback(
    (patch: Partial<DraftContent>) => {
      setEdits((current) => {
        const next = { ...(current ?? base), ...patch };
        latest.current = { ...latest.current, content: next };
        return next;
      });
      dirty.current = true;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [base, flush],
  );

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (dirty.current) void draftSave(latest.current.id, latest.current.content);
    },
    [],
  );

  return {
    id,
    content,
    update,
    flush,
    saveState,
    attachments: loaded.data?.attachments ?? [],
    intentId: loaded.data?.intentId ?? null,
    loadError: loaded.error ? toAppError(loaded.error) : null,
  };
}
