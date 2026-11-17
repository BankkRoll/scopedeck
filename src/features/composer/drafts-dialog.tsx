import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { draftDelete, draftsList } from "@/ipc/workspace";
import { EmptyState } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatRelative } from "@/domain/format";
import { queryKeys } from "@/query/keys";

interface DraftsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId: string | null;
  onOpen: (id: string) => void;
  onDeletedCurrent: () => void;
}

export function DraftsDialog({ open, onOpenChange, currentId, onOpen, onDeletedCurrent }: DraftsDialogProps) {
  const queryClient = useQueryClient();
  const drafts = useQuery({ queryKey: queryKeys.drafts, queryFn: draftsList, enabled: open });
  const remove = useMutation({
    mutationFn: draftDelete,
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.drafts });
      if (id === currentId) onDeletedCurrent();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Drafts"
      description="Autosaved on this machine as you type."
    >
      <ul className="divide-y divide-line border-y border-line">
        {(drafts.data ?? []).map((draft) => (
          <li key={draft.id} className="flex items-center gap-3 py-2">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                onOpen(draft.id);
                onOpenChange(false);
              }}
            >
              <p className="truncate text-ink hover:underline">{draft.title || "Untitled draft"}</p>
              <p className="text-faint">
                {draft.programHandle ?? "No program"} · edited {formatRelative(draft.updatedAt)}
                {draft.attachments.length > 0 ? ` · ${draft.attachments.length} attachments` : ""}
                {draft.id === currentId ? " · open" : ""}
              </p>
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Delete ${draft.title || "untitled draft"}`}
              onClick={() => {
                remove.mutate(draft.id);
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {drafts.data?.length === 0 ? (
        <EmptyState title="No drafts">Start writing and the draft saves itself.</EmptyState>
      ) : null}
    </Dialog>
  );
}
