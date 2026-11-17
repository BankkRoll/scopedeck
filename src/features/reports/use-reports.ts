import { useQuery, useQueryClient } from "@tanstack/react-query";
import { reportCached, reportSync, reportsCached, reportsSync } from "@/ipc/reports";
import { toAppError } from "@/ipc/errors";
import { queryKeys } from "@/query/keys";
import { useCachedResource } from "@/query/use-cached-resource";

export function useReports() {
  return useCachedResource({
    cacheKey: queryKeys.reports.cached,
    syncKey: queryKeys.reports.sync,
    readCache: reportsCached,
    sync: reportsSync,
  });
}

export function useReport(id: string) {
  const queryClient = useQueryClient();
  const cached = useQuery({
    queryKey: queryKeys.report.cached(id),
    queryFn: () => reportCached(id),
    staleTime: Infinity,
  });
  const sync = useQuery({
    queryKey: queryKeys.report.sync(id),
    queryFn: async () => {
      const fresh = await reportSync(id);
      queryClient.setQueryData(queryKeys.report.cached(id), fresh);
      return fresh.id;
    },
    staleTime: 60_000,
  });
  return {
    report: cached.data ?? undefined,
    syncing: sync.isFetching,
    syncError: sync.error ? toAppError(sync.error) : null,
    syncedAt: sync.dataUpdatedAt ? new Date(sync.dataUpdatedAt).toISOString() : null,
    refresh: () => {
      void sync.refetch();
    },
  };
}
