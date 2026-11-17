import { Avatar } from "radix-ui";
import { cn } from "@/lib/cn";

const SIZES = {
  xs: "size-4 rounded-[3px] text-[9px]",
  sm: "size-5 rounded-[4px] text-[10px]",
  md: "size-6 rounded-[5px] text-[11px]",
  lg: "size-10 rounded-md text-[15px]",
} as const;

/** Props for {@link ProgramAvatar}. */
export interface ProgramAvatarProps {
  name: string;
  /** Logo URL from the API. Falls back to the first letter of `name`. */
  src?: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}

/** A program's logo, or its initial while the logo loads or when it has none. */
export function ProgramAvatar({ name, src, size = "sm", className }: ProgramAvatarProps) {
  const initial = /\p{L}|\p{N}/u.exec(name)?.[0]?.toUpperCase() ?? "?";
  return (
    <Avatar.Root
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-line bg-raised select-none",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <Avatar.Image src={src} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : null}
      <Avatar.Fallback delayMs={src ? 300 : 0} className="font-medium text-muted" aria-hidden>
        {initial}
      </Avatar.Fallback>
    </Avatar.Root>
  );
}
