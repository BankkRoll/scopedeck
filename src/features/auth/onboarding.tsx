import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { signIn } from "@/ipc/auth";
import { toAppError } from "@/ipc/errors";
import { ExternalLink } from "@/components/external-link";
import { ErrorNotice } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { hackerOne } from "@/domain/deep-links";
import { queryKeys } from "@/query/keys";

interface CredentialFormProps {
  submitLabel: string;
  onSignedIn?: () => void;
}

export function CredentialForm({ submitLabel, onSignedIn }: CredentialFormProps) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const usernameId = useId();
  const tokenId = useId();
  const mutation = useMutation({
    mutationFn: () => signIn(username, token),
    onSuccess: async (status) => {
      setToken("");
      queryClient.setQueryData(queryKeys.auth, status);
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
      onSignedIn?.();
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field
        label="HackerOne username"
        htmlFor={usernameId}
        hint="The name in your profile URL. HackerOne calls this the token identifier."
      >
        <Input
          id={usernameId}
          name="username"
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
          }}
          autoFocus
        />
      </Field>
      <Field label="API token" htmlFor={tokenId} hint="Stored in your system keychain, never on disk.">
        <Input
          id={tokenId}
          name="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(event) => {
            setToken(event.target.value);
          }}
        />
      </Field>
      {mutation.isError ? <ErrorNotice error={toAppError(mutation.error)} /> : null}
      <Button
        type="submit"
        variant="primary"
        disabled={mutation.isPending || !username.trim() || !token.trim()}
        className="self-start"
      >
        {mutation.isPending ? "Checking credentials" : submitLabel}
      </Button>
    </form>
  );
}

export function Onboarding() {
  return (
    <main className="grid h-full place-items-center overflow-y-auto bg-ground px-6 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center gap-2.5">
          <AppMark />
          <span className="text-[15px] font-semibold tracking-tight">Scopedeck</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Connect your HackerOne API token</h1>
        <p className="mt-2 text-[14px] leading-[22px] text-muted">
          Scopedeck talks to the Hacker API with your own token. Create one under{" "}
          <ExternalLink href={hackerOne.apiToken}>Settings, API token</ExternalLink> on HackerOne, then paste
          it here with your username. One read request checks them before anything is saved.
        </p>
        <div className="mt-6 rounded-lg border border-line bg-surface p-5">
          <CredentialForm submitLabel="Connect" />
        </div>
        <p className="mt-6 text-[13px] text-faint">
          Not affiliated with HackerOne. Requests go from this machine straight to api.hackerone.com.
        </p>
      </div>
    </main>
  );
}

export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "size-5"} aria-hidden>
      <rect width="24" height="24" rx="5" fill="var(--ink)" />
      <path
        d="M6.5 9.5v-3h3M14.5 6.5h3v3M17.5 14.5v3h-3M9.5 17.5h-3v-3"
        fill="none"
        stroke="var(--ground)"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
      <rect x="10.3" y="10.3" width="3.4" height="3.4" fill="var(--accent)" />
    </svg>
  );
}
