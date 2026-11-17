import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { programNoteGet, programNoteSave, type ProgramNote } from "@/ipc/ai";
import { describeError, toAppError } from "@/ipc/errors";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ErrorNotice } from "@/components/status";
import { formatRelative } from "@/domain/format";
import { queryKeys } from "@/query/keys";

const SAVE_DELAY_MS = 600;

/** Private, local-only notes for one program: recon findings, credentials hints, ideas. */
export function NotesPanel({ handle }: { handle: string }) {
  const note = useQuery({
    queryKey: queryKeys.programNote(handle),
    queryFn: () => programNoteGet(handle),
    staleTime: Infinity,
  });
  if (note.isError) return <ErrorNotice error={toAppError(note.error)} className="m-5" />;
  if (!note.isSuccess) return null;
  return <NotesEditor key={handle} handle={handle} initial={note.data} />;
}

function NotesEditor({ handle, initial }: { handle: string; initial: ProgramNote | null }) {
  const queryClient = useQueryClient();
  const labelId = useId();
  const [body, setBody] = useState(initial?.body ?? "");
  const [savedAt, setSavedAt] = useState(initial?.updatedAt ?? null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ timer: number; body: string } | null>(null);

  const flush = useRef(async (next: string) => {
    try {
      const saved = await programNoteSave(handle, next);
      queryClient.setQueryData(queryKeys.programNote(handle), saved.body ? saved : null);
      setSavedAt(saved.updatedAt);
      setError(null);
    } catch (cause) {
      setError(describeError(toAppError(cause)).title);
    }
  });

  // NOTE: Unmounting (switching tabs or programs) must not drop the last keystrokes.
  useEffect(
    () => () => {
      const last = pending.current;
      if (last) {
        window.clearTimeout(last.timer);
        void flush.current(last.body);
      }
    },
    [],
  );

  const onChange = (next: string) => {
    setBody(next);
    if (pending.current) window.clearTimeout(pending.current.timer);
    const timer = window.setTimeout(() => {
      pending.current = null;
      void flush.current(next);
    }, SAVE_DELAY_MS);
    pending.current = { timer, body: next };
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-2 text-[12px] text-faint">
        <span id={labelId}>Stored only on this machine. Never sent to HackerOne.</span>
        <span className={error ? "text-danger" : undefined}>
          {error ?? (savedAt && body ? `Saved ${formatRelative(savedAt)}` : "")}
        </span>
      </div>
      <MarkdownEditor
        label="Program notes"
        value={body}
        onChange={onChange}
        placeholder="Recon notes, test accounts, interesting endpoints, ideas to come back to"
      />
    </div>
  );
}
