import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import {
  Activity,
  Coins,
  FileStack,
  Inbox,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Search,
  Settings,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { authStatus } from "@/ipc/auth";
import { REPORTS_UPDATED_EVENT } from "@/ipc/system";
import { Kbd } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { usePersistedState } from "@/lib/persisted-state";
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

function SidebarHint({ label, keys }: { label: string; keys?: string }) {
  return (
    <>
      {label}
      {keys ? <span className="font-mono text-faint">{keys}</span> : null}
    </>
  );
}

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
  const [collapsed, setCollapsed] = usePersistedState("sidebar.collapsed", z.boolean(), false);
  const toggleSidebar = () => {
    setCollapsed((current) => !current);
  };

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
      case "toggleSidebar":
        toggleSidebar();
        return;
      default:
        return;
    }
  });

  return (
    <div className="flex h-full">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-150",
          collapsed ? "w-[52px]" : "w-[216px]",
        )}
      >
        <div
          className={cn(
            "flex h-14 items-center gap-2.5 border-b border-line",
            collapsed ? "justify-center" : "px-4",
          )}
        >
          <AppMark />
          {collapsed ? null : (
            <span className="flex-1 text-[14px] font-semibold tracking-tight">Scopedeck</span>
          )}
          {collapsed ? null : (
            <Tooltip content={<SidebarHint label="Hide sidebar" />} side="bottom">
              <button
                type="button"
                aria-label="Hide sidebar"
                onClick={toggleSidebar}
                className="grid size-7 place-items-center rounded-md text-faint hover:bg-hover hover:text-ink"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </Tooltip>
          )}
        </div>
        <div className="p-2">
          <Tooltip content={<SidebarHint label="Jump to" keys={`${MOD_LABEL} K`} />} disabled={!collapsed}>
            <button
              type="button"
              aria-label="Jump to"
              onClick={() => {
                setPaletteOpen(true);
              }}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-md border border-line bg-raised text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted",
                collapsed ? "justify-center" : "px-2.5",
              )}
            >
              <Search className="size-3.5" />
              {collapsed ? null : (
                <>
                  <span className="flex-1 text-left">Jump to</span>
                  <Kbd>{MOD_LABEL} K</Kbd>
                </>
              )}
            </button>
          </Tooltip>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
          {NAV.map((item) => (
            <Tooltip
              key={item.to}
              content={<SidebarHint label={item.label} keys={item.keys} />}
              disabled={!collapsed}
            >
              <Link
                to={item.to}
                aria-label={collapsed ? item.label : undefined}
                className={cn(navClass, collapsed && "justify-center px-0")}
              >
                {item.icon}
                {collapsed ? null : <span className="flex-1">{item.label}</span>}
              </Link>
            </Tooltip>
          ))}
        </nav>
        <div className="mt-4 px-2">
          <Tooltip content={<SidebarHint label="New report" keys="C" />} disabled={!collapsed}>
            <Link
              to="/compose"
              search={{}}
              aria-label={collapsed ? "New report" : undefined}
              className={cn(navClass, collapsed && "justify-center px-0")}
            >
              <PenLine />
              {collapsed ? null : (
                <>
                  <span className="flex-1">New report</span>
                  <span className="font-mono text-faint">C</span>
                </>
              )}
            </Link>
          </Tooltip>
        </div>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line p-2">
          {!online ? (
            <Tooltip content="Offline, showing cached data" disabled={!collapsed}>
              <div
                role="status"
                aria-label={collapsed ? "Offline, showing cached data" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 text-[13px] text-warning",
                  collapsed ? "justify-center" : "px-2.5",
                )}
              >
                <WifiOff className="size-4" />
                {collapsed ? null : "Offline, showing cached data"}
              </div>
            </Tooltip>
          ) : null}
          <Tooltip content={<SidebarHint label="Settings" keys={`${MOD_LABEL} ,`} />} disabled={!collapsed}>
            <Link
              to="/settings"
              aria-label={collapsed ? "Settings" : undefined}
              className={cn(navClass, collapsed && "justify-center px-0")}
            >
              <Settings />
              {collapsed ? null : (
                <span className="flex-1 truncate">{auth.data?.username ?? "Settings"}</span>
              )}
            </Link>
          </Tooltip>
          {collapsed ? (
            <Tooltip content={<SidebarHint label="Show sidebar" keys={`${MOD_LABEL} B`} />}>
              <button
                type="button"
                aria-label="Show sidebar"
                onClick={toggleSidebar}
                className={cn(navClass, "justify-center px-0")}
              >
                <PanelLeftOpen />
              </button>
            </Tooltip>
          ) : (
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
          )}
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
