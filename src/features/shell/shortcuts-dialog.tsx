import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/badge";
import { LIST_SHORTCUTS, SHORTCUTS } from "./shortcuts";

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-muted">{label}</span>
      <span className="flex gap-1">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
    </div>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      <section>
        <h2 className="mb-1 text-[13px] font-medium text-faint">Anywhere</h2>
        <div className="divide-y divide-line">
          {SHORTCUTS.map((shortcut) => (
            <Row key={shortcut.action} keys={shortcut.keys} label={shortcut.label} />
          ))}
        </div>
      </section>
      <section className="mt-5">
        <h2 className="mb-1 text-[13px] font-medium text-faint">Lists and forms</h2>
        <div className="divide-y divide-line">
          {LIST_SHORTCUTS.map((shortcut) => (
            <Row key={shortcut.label} keys={shortcut.keys} label={shortcut.label} />
          ))}
        </div>
      </section>
    </Dialog>
  );
}
