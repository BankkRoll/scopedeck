import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  Coins,
  FileStack,
  Inbox,
  LayoutList,
  PenLine,
  Search,
  Settings,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { authStatus } from "@/ipc/auth";
import { REPORTS_UPDATED_EVENT } from "@/ipc/system";
import { Kbd } from "@/components/ui/badge";
import { AppMark } from "@/features/auth/onboarding";
import { useOnline } from "@/lib/connectivity";
import { queryKeys } from "@/query/keys";
import { CommandPalette } from "./command-palette";
import { MOD_LABEL, useGlobalShortcuts, type ShortcutAction } from "./shortcuts";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { runViewAction } from "./view-actions";

type NavTarget = "/programs" | "/reports" | "/intents" | "/hacktivity" | "/earnings";

const NAV: { to: NavTarget; label: string; icon: ReactNode; keys: string }[] = [
  { to: "/programs", label: "Programs", icon: <LayoutList />, keys: "G P" },
  { to: "/reports", label: "Reports", icon: <Inbox />, keys: "G R" },
  { to: "/intents", label: "Report intents", icon: <FileStack />, keys: "G I" },
  { to: "/hacktivity", label: "Hacktivity", icon: <Activity />, keys: "G H" },
  { to: "/earnings", label: "Earnings", icon: <Coins />, keys: "G E" },
];

const navClass =
  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-ink [&_svg]:size-4 [&_svg]:text-faint data-[status=active]:bg-raised data-[status=active]:text-ink data-[status=active]:[&_svg]:text-ink";

function useBackendEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unlisten = listen(REPORTS_UPDATED_EVENT, () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cached });
    });
    return () => {
      void unlisten.then((stop) => {
        stop();
      });
    };
  }, [queryClient]);
}

export function AppShell() {
  const navigate = useNavigate();
  const online = useOnline();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const auth = useQuery({ queryKey: queryKeys.auth, queryFn: authStatus, staleTime: Infinity });
  useBackendEvents();

  useGlobalShortcuts((action: ShortcutAction) => {
    const routes: Partial<Record<ShortcutAction, NavTarget | "/settings">> = {
      goPrograms: "/programs",
      goReports: "/reports",
      goIntents: "/intents",
      goHacktivity: "/hacktivity",
      goEarnings: "/earnings",
      goSettings: "/settings",
    };
    const route = routes[action];
    if (route) {
      void navigate({ to: route });
      return;
    }
    switch (action) {
      case "palette":
        setPaletteOpen((open) => !open);
        return;
      case "help":
        setShortcutsOpen(true);
        return;
      case "compose":
        void navigate({ to: "/compose", search: {} });
        return;
      case "refresh":
        if (!runViewAction("refresh")) toast("Nothing to sync on this view");
        return;
      case "search":
        runViewAction("search");
        return;
      default:
        return;
    }
  });

  return (
    <div className="flex h-full">
      <aside className="flex w-[216px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <AppMark />
          <span className="text-[14px] font-semibold tracking-tight">Scopedeck</span>
        </div>
        <div className="p-2">
          <button
            type="button"
            onClick={() => {
              setPaletteOpen(true);
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-raised px-2.5 text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Jump to</span>
            <Kbd>{MOD_LABEL} K</Kbd>
          </button>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className={navClass}>
              {item.icon}
              <span className="flex-1">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-4 px-2">
          <Link to="/compose" search={{}} className={navClass}>
            <PenLine />
            <span className="flex-1">New report</span>
            <span className="font-mono text-faint">C</span>
          </Link>
        </div>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line p-2">
          {!online ? (
            <div role="status" className="flex h-8 items-center gap-2.5 px-2.5 text-[13px] text-warning">
              <WifiOff className="size-4" />
              Offline, showing cached data
            </div>
          ) : null}
          <Link to="/settings" className={navClass}>
            <Settings />
            <span className="flex-1 truncate">{auth.data?.username ?? "Settings"}</span>
          </Link>
          <button
            type="button"
            onClick={() => {
              setShortcutsOpen(true);
            }}
            className={navClass}
          >
            <span className="flex-1 text-left">Keyboard shortcuts</span>
            <Kbd>?</Kbd>
          </button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col bg-ground">
        <Outlet />
      </main>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onShowShortcuts={() => {
          setShortcutsOpen(true);
        }}
        username={auth.data?.username ?? null}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
