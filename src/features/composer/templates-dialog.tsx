import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toAppError } from "@/ipc/errors";
import { templateDelete, templateSave, templatesList, type Template } from "@/ipc/workspace";
import { EmptyState, ErrorNotice } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { formatRelative } from "@/domain/format";
import { queryKeys } from "@/query/keys";

interface TemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: { title: string; vulnerabilityInformation: string; impact: string };
  onApply: (template: Template) => void;
}

export function TemplatesDialog({ open, onOpenChange, current, onApply }: TemplatesDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const nameId = useId();
  const templates = useQuery({ queryKey: queryKeys.templates, queryFn: templatesList, enabled: open });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.templates });
  const save = useMutation({
    mutationFn: () => templateSave(null, { name, ...current }),
    onSuccess: async () => {
      setName("");
      await invalidate();
    },
  });
  const remove = useMutation({ mutationFn: templateDelete, onSuccess: invalidate });
  const hasContent = Boolean(
    current.title.trim() || current.vulnerabilityInformation.trim() || current.impact.trim(),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Report templates"
      description="Stored on this machine only."
    >
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Save the current report as a template" htmlFor={nameId} className="flex-1">
          <Input
            id={nameId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="Template name"
          />
        </Field>
        <Button type="submit" disabled={!name.trim() || !hasContent || save.isPending}>
          Save template
        </Button>
      </form>
      {save.isError ? <ErrorNotice error={toAppError(save.error)} className="mt-3" /> : null}
      <ul className="mt-5 divide-y divide-line border-y border-line">
        {(templates.data ?? []).map((template) => (
          <li key={template.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-ink">{template.name}</p>
              <p className="text-faint">Updated {formatRelative(template.updatedAt)}</p>
            </div>
            <Button
              size="sm"
              onClick={() => {
                onApply(template);
                onOpenChange(false);
              }}
            >
              Use
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Delete ${template.name}`}
              onClick={() => {
                remove.mutate(template.id);
              }}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {templates.data?.length === 0 ? (
        <EmptyState title="No templates yet">
          Save a report skeleton you reuse, such as an XSS or IDOR write-up.
        </EmptyState>
      ) : null}
    </Dialog>
  );
}
