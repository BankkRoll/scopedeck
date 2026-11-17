import { FileJson } from "lucide-react";
import { useId, useState, type DragEvent } from "react";
import type { ScopeExclusion, StructuredScope, Weakness } from "@/ipc/programs";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { mapFinding, parseFinding, type ImportResult } from "@/domain/finding-import";
import { cn } from "@/lib/cn";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: { scopes: StructuredScope[]; weaknesses: Weakness[]; exclusions: ScopeExclusion[] } | null;
  onApply: (result: ImportResult) => void;
}

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function ImportDialog({ open, onOpenChange, context, onApply }: ImportDialogProps) {
  const [raw, setRaw] = useState("");
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const textareaId = useId();

  const parsed = raw.trim() ? parseFinding(raw) : null;
  const result = parsed?.ok && context ? mapFinding(parsed.finding, context) : null;

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setReadError(`${file.name} is larger than 2 MB.`);
      return;
    }
    setReadError(null);
    setRaw(await file.text());
  };

  const close = (next: boolean) => {
    if (!next) {
      setRaw("");
      setReadError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Import a finding"
      description="Paste or drop a finding in the documented JSON format (schemaVersion 1)."
      className="w-[min(720px,calc(100vw-32px))]"
      footer={
        <>
          <Button
            onClick={() => {
              close(false);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!result}
            onClick={() => {
              if (result) {
                onApply(result);
                close(false);
              }
            }}
          >
            {result && result.issues.length > 0 ? "Import with flagged fields" : "Import"}
          </Button>
        </>
      }
    >
      {!context ? (
        <p className="mb-3 text-warning">Choose a program first so assets and weaknesses can be matched.</p>
      ) : null}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(event) => void onDrop(event)}
        className={cn(
          "rounded-md border border-dashed border-line-strong p-1",
          dragging && "border-accent bg-raised",
        )}
      >
        <label htmlFor={textareaId} className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-faint">
          <FileJson className="size-4" /> Drop a .json file or paste below
        </label>
        <Textarea
          id={textareaId}
          value={raw}
          onChange={(event) => {
            setRaw(event.target.value);
          }}
          spellCheck={false}
          className="min-h-48 border-0 bg-transparent font-mono hover:border-0"
          placeholder='{ "schemaVersion": 1, "title": "...", "steps": ["..."], "impact": "..." }'
        />
      </div>
      {readError ? <p className="mt-3 text-danger">{readError}</p> : null}
      {parsed && !parsed.ok ? (
        <ul className="mt-3 flex flex-col gap-1 text-danger" aria-label="Problems">
          {parsed.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      {result ? (
        <div className="mt-4">
          <p className="font-medium">{result.content.title}</p>
          {result.issues.length === 0 ? (
            <p className="mt-1 text-success">Asset, weakness and severity all matched this program.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5" aria-label="Fields that need attention">
              {result.issues.map((issue) => (
                <li key={issue.field} className="flex gap-2">
                  <span className="w-20 shrink-0 text-warning">{issue.field}</span>
                  <span className="text-muted">{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
