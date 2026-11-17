import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toAppError, type AppError } from "@/ipc/errors";
import type { Cached } from "@/ipc/common";
import { useSettings } from "@/features/settings/use-settings";

interface CachedResourceOptions<T> {
  cacheKey: QueryKey;
  syncKey: QueryKey;
  readCache: () => Promise<Cached<T>>;
  sync: () => Promise<Cached<T>>;
  enabled?: boolean;
}

export interface CachedResource<T> {
  data: T | undefined;
  syncedAt: string | null;
  loadingCache: boolean;
  syncing: boolean;
  syncError: AppError | null;
  refresh: () => void;
}

/**
 * Stale-while-revalidate over two queries: the SQLite read renders immediately, and the API
 * sync writes its result into the cache query when it lands.
 */
export function useCachedResource<T>({
  cacheKey,
  syncKey,
  readCache,
  sync,
  enabled = true,
}: CachedResourceOptions<T>): CachedResource<T> {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const cache = useQuery({ queryKey: cacheKey, queryFn: readCache, staleTime: Infinity, enabled });
  const syncQuery = useQuery({
    queryKey: syncKey,
    queryFn: async () => {
      const fresh = await sync();
      queryClient.setQueryData(cacheKey, fresh);
      return fresh.syncedAt;
    },
    enabled,
    staleTime: settings.syncIntervalMinutes * 60_000,
    refetchInterval: settings.syncIntervalMinutes * 60_000,
  });

  return {
    data: cache.data?.data,
    syncedAt: cache.data?.syncedAt ?? null,
    loadingCache: cache.isPending && enabled,
    syncing: syncQuery.isFetching,
    syncError: syncQuery.error ? toAppError(syncQuery.error) : null,
    refresh: () => {
      void syncQuery.refetch();
    },
  };
}
