import { ProgramAvatar } from "@/components/program-avatar";
import { useProgramLookup } from "./use-programs";

/**
 * A program's logo and name for table cells. Falls back to the handle when the program is not
 * in the local cache, for example a Hacktivity entry from a program you cannot access.
 */
export function ProgramLabel({ handle, name }: { handle: string | null | undefined; name?: string | null }) {
  const lookup = useProgramLookup();
  if (!handle) return <span className="text-faint">Unknown</span>;
  const program = lookup.get(handle);
  const label = program?.name ?? name ?? handle;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <ProgramAvatar name={label} src={program?.profilePicture} size="xs" />
      <span className="truncate text-muted">{label}</span>
    </span>
  );
}
