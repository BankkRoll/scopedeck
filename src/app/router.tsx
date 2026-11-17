import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import { z } from "zod";
import { EarningsPage } from "@/features/earnings/earnings-page";
import { HacktivityPage } from "@/features/hacktivity/hacktivity-page";
import { IntentsPage } from "@/features/intents/intents-page";
import { ProgramPage } from "@/features/programs/program-page";
import { ProgramsPage } from "@/features/programs/programs-page";
import { ReportPage } from "@/features/reports/report-page";
import { ReportsPage } from "@/features/reports/reports-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { AppShell } from "@/features/shell/app-shell";

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router signals redirects by throwing
    throw redirect({ to: "/programs" });
  },
});

const programsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/programs",
  component: ProgramsPage,
});
const programRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/programs/$handle",
  component: ProgramPage,
});

const composeSearchSchema = z.object({
  draft: z.string().optional(),
  program: z.string().optional(),
});

const composeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/compose",
  validateSearch: (search) => composeSearchSchema.parse(search),
  component: lazyRouteComponent(() => import("@/features/composer/composer-page"), "ComposerPage"),
});

const reportsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports",
  component: ReportsPage,
});
const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reports/$id",
  component: ReportPage,
});
const intentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/intents",
  component: IntentsPage,
});
const hacktivityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/hacktivity",
  component: HacktivityPage,
});
const earningsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/earnings",
  component: EarningsPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  programsRoute,
  programRoute,
  composeRoute,
  reportsRoute,
  reportRoute,
  intentsRoute,
  hacktivityRoute,
  earningsRoute,
  settingsRoute,
]);

export const router = createRouter({ routeTree, history: createHashHistory(), defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
