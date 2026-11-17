import { useInfiniteQuery } from "@tanstack/react-query";
import { isNetworkError, toAppError } from "@/ipc/errors";
import {
  hacktivityCached,
  hacktivityFetch,
  type CachedHacktivityPage,
  type HacktivitySort,
} from "@/ipc/hacktivity";
import { queryKeys } from "@/query/keys";

const PAGE_SIZE = 50;

interface LoadedPage extends CachedHacktivityPage {
  fromCache: boolean;
}

/** Each page comes from the API; when the network is down, the last cached copy is served instead. */
async function loadPage(queryString: string, sort: HacktivitySort, pageNumber: number): Promise<LoadedPage> {
  const query = { queryString, sort, pageNumber, pageSize: PAGE_SIZE };
  try {
    return { ...(await hacktivityFetch(query)), fromCache: false };
  } catch (error) {
    if (!isNetworkError(toAppError(error))) throw error;
    const cached = await hacktivityCached(query);
    if (!cached) throw error;
    return { ...cached, fromCache: true };
  }
}

export function useHacktivity(queryString: string, sort: HacktivitySort, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: queryKeys.hacktivity({ queryString, sort, pageSize: PAGE_SIZE }),
    queryFn: ({ pageParam }) => loadPage(queryString, sort, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page.hasNextPage ? last.page.pageNumber + 1 : undefined),
    enabled,
    staleTime: 5 * 60_000,
  });
}
