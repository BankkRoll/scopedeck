import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { openOnHackerOne } from "@/lib/open-external";

interface ExternalLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  icon?: boolean;
}

export function ExternalLink({ href, children, className, icon = true }: ExternalLinkProps) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        void openOnHackerOne(href);
      }}
      className={cn(
        "inline-flex items-center gap-0.5 text-link underline-offset-2 hover:underline",
        className,
      )}
    >
      {children}
      {icon ? <ArrowUpRight className="size-3.5" aria-hidden /> : null}
    </a>
  );
}
