import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { authStatus, signOut } from "@/ipc/auth";
import { describeError, toAppError } from "@/ipc/errors";
import { notificationsEnable, updateCheck, updateInstall } from "@/ipc/system";
import { cacheClear, type Settings } from "@/ipc/workspace";
import { openOnHackerOne } from "@/lib/open-external";
import { ErrorNotice, PageHeader } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { hackerOne } from "@/domain/deep-links";
import { CredentialForm } from "@/features/auth/onboarding";
import { queryKeys } from "@/query/keys";
import { useSettings } from "./use-settings";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[240px_minmax(0,1fr)] gap-8 border-b border-line px-5 py-6">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-faint">{description}</p> : null}
      </div>
      <div className="flex max-w-xl flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <label htmlFor={htmlFor} className="text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const INTERVALS = [5, 15, 30, 60, 240];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { settings, save } = useSettings();
  const ids = { theme: useId(), interval: useId(), notifications: useId() };
  const [rotateOpen, setRotateOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const auth = useQuery({ queryKey: queryKeys.auth, queryFn: authStatus, staleTime: Infinity });

  const apply = async (patch: Partial<Settings>) => {
    try {
      await save({ ...settings, ...patch });
    } catch (error) {
      toast.error(describeError(toAppError(error)).title);
    }
  };

  const notifications = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled && !(await notificationsEnable())) {
        throw new Error(
          "Notifications are blocked by the operating system. Allow them for Scopedeck and try again.",
        );
      }
      await save({ ...settings, notifications: enabled });
    },
    onError: (error) => toast.error(describeError(toAppError(error)).title),
  });
  const clear = useMutation({
    mutationFn: cacheClear,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Cached API data cleared. Drafts and templates were kept.");
    },
  });
  const leave = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(queryKeys.auth, { username: null });
    },
  });
  const update = useQuery({ queryKey: queryKeys.update, queryFn: updateCheck, enabled: false, retry: false });
  const install = useMutation({ mutationFn: updateInstall });

  return (
    <>
      <PageHeader title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Appearance">
          <Row label="Theme" htmlFor={ids.theme}>
            <Select
              id={ids.theme}
              className="w-40"
              value={settings.theme}
              onChange={(event) => {
                const theme = event.target.value;
                if (theme === "dark" || theme === "light" || theme === "system") void apply({ theme });
              }}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Match system</option>
            </Select>
          </Row>
        </Section>

        <Section
          title="Sync"
          description="Cached data renders instantly; the API is checked in the background on this interval."
        >
          <Row label="Refresh every" htmlFor={ids.interval}>
            <Select
              id={ids.interval}
              className="w-40"
              value={settings.syncIntervalMinutes}
              onChange={(event) => void apply({ syncIntervalMinutes: Number(event.target.value) })}
            >
              {INTERVALS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes < 60
                    ? `${minutes} minutes`
                    : `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Notify me when a report changes state or gets new activity" htmlFor={ids.notifications}>
            <input
              id={ids.notifications}
              type="checkbox"
              checked={settings.notifications}
              disabled={notifications.isPending}
              onChange={(event) => {
                notifications.mutate(event.target.checked);
              }}
              className="size-4 accent-[var(--accent)]"
            />
          </Row>
          <Row label="Clear cached programs, reports, hacktivity and earnings">
            <Button
              variant="secondary"
              onClick={() => {
                clear.mutate();
              }}
              disabled={clear.isPending}
            >
              Clear cache
            </Button>
          </Row>
        </Section>

        <Section
          title="Account"
          description="Your token lives in the system keychain. Nothing else on disk can read it."
        >
          <Row label={auth.data?.username ? `Signed in as ${auth.data.username}` : "Signed in"}>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setRotateOpen(true);
                }}
              >
                Replace token
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setSignOutOpen(true);
                }}
              >
                Sign out
              </Button>
            </div>
          </Row>
          <div className="flex flex-wrap gap-2">
            {[
              ["API token", hackerOne.apiToken],
              ["Account settings", hackerOne.accountSettings],
              ["Two-factor authentication", hackerOne.twoFactor],
              ...(auth.data?.username
                ? [["Public profile", hackerOne.profile(auth.data.username)] as const]
                : []),
            ].map(([label, url]) => (
              <Button key={label} size="sm" variant="ghost" onClick={() => void openOnHackerOne(url)}>
                {label} on HackerOne
                <ArrowUpRight />
              </Button>
            ))}
          </div>
        </Section>

        <Section
          title="Updates"
          description="Releases are signed; an update installs only if its signature verifies."
        >
          <Row
            label={
              update.data
                ? `Version ${update.data.version} is available`
                : update.isFetched
                  ? "You are on the latest version"
                  : "Check for a newer release"
            }
          >
            {update.data ? (
              <Button
                variant="primary"
                onClick={() => {
                  install.mutate();
                }}
                disabled={install.isPending}
              >
                {install.isPending ? "Installing" : "Install and restart"}
              </Button>
            ) : (
              <Button onClick={() => void update.refetch()} disabled={update.isFetching}>
                {update.isFetching ? "Checking" : "Check for updates"}
              </Button>
            )}
          </Row>
          {update.isError ? <ErrorNotice error={toAppError(update.error)} /> : null}
          {install.isError ? <ErrorNotice error={toAppError(install.error)} /> : null}
        </Section>

        <Section title="About">
          <p className="text-muted">
            Scopedeck is an independent open-source client. It is not affiliated with or endorsed by
            HackerOne. It only calls the documented Hacker API at api.hackerone.com.
          </p>
        </Section>
      </div>

      <Dialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title="Replace API token"
        description="The new token is verified before it replaces the stored one."
      >
        <CredentialForm
          submitLabel="Verify and replace"
          onSignedIn={() => {
            setRotateOpen(false);
            toast.success("Token replaced");
          }}
        />
      </Dialog>
      <Dialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out and wipe local data"
        description="Removes the token from the keychain and deletes the local database, including drafts, templates and saved searches."
        footer={
          <>
            <Button
              onClick={() => {
                setSignOutOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                leave.mutate();
              }}
              disabled={leave.isPending}
            >
              Sign out and wipe
            </Button>
          </>
        }
      >
        {leave.isError ? (
          <ErrorNotice error={toAppError(leave.error)} />
        ) : (
          <p className="text-muted">This cannot be undone.</p>
        )}
      </Dialog>
    </>
  );
}
