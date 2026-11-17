import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Base style shared by text inputs and dropdown triggers. */
export const controlClass =
  "w-full rounded-md border border-line bg-raised text-[13px] text-ink placeholder:text-faint transition-colors hover:border-line-strong focus-visible:border-focus focus-visible:outline-none aria-invalid:border-danger disabled:opacity-50";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlClass, "h-8 px-2.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(controlClass, "min-h-24 resize-y px-2.5 py-2 leading-5", className)} {...props} />
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | undefined;
  errorId?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, errorId, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? (
        <p id={errorId} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}
