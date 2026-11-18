import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import type { Cached } from "@/ipc/common";
import { describeError, toAppError } from "@/ipc/errors";
import {
  localSearch,
  programCached,
  programSetPinned,
  programSync,
  programsCached,
  programsSync,
  type ProgramDetail,
  type ProgramRow,
} from "@/ipc/programs";
import { queryKeys } from "@/query/keys";
import { useCachedResource } from "@/query/use-cached-resource";

export function usePrograms() {
  return useCachedResource({
    cacheKey: queryKeys.programs.cached,
    syncKey: queryKeys.programs.sync,
    readCache: programsCached,
    sync: programsSync,
  });
}

export function useProgram(handle: string | null) {
  return useCachedResource({
    cacheKey: queryKeys.program.cached(handle ?? ""),
    syncKey: queryKeys.program.sync(handle ?? ""),
    readCache: () => programCached(handle ?? ""),
    sync: () => programSync(handle ?? ""),
    enabled: handle !== null && handle !== "",
  });
}

export function useProgramSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed, ["program", "scope"]),
    queryFn: async () => {
      const hits = await localSearch(trimmed, ["program", "scope"], 50);
      return new Set(hits.map((hit) => hit.program ?? hit.reference));
    },
    enabled: trimmed.length > 0,
    placeholderData: (previous) => previous,
  });
}

export function usePinProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ handle, pinned }: { handle: string; pinned: boolean }) => programSetPinned(handle, pinned),
    onSuccess: (_, { handle, pinned }) => {
      queryClient.setQueryData<Cached<ProgramRow[]>>(queryKeys.programs.cached, (current) =>
        current
          ? {
              ...current,
              data: current.data.map((row) => (row.handle === handle ? { ...row, pinned } : row)),
            }
          : current,
      );
      queryClient.setQueryData<Cached<ProgramDetail>>(queryKeys.program.cached(handle), (current) =>
        current?.data.program
          ? { ...current, data: { ...current.data, program: { ...current.data.program, pinned } } }
          : current,
      );
    },
    onError: (error) => {
      toast.error(describeError(toAppError(error)).title);
    },
  });
}

/**
 * Programs by handle, from the local cache only. Lets reports, Hacktivity and earnings rows
 * show program logos without triggering a sync.
 */
export function useProgramLookup(): ReadonlyMap<string, ProgramRow> {
  const cached = useQuery({
    queryKey: queryKeys.programs.cached,
    queryFn: programsCached,
    staleTime: Infinity,
  });
  return useMemo(
    () => new Map((cached.data?.data ?? []).map((row) => [row.handle, row] as const)),
    [cached.data],
  );
}

/**
 * Programs by API id, from the local cache only. Report intents reference their program by id,
 * not by handle.
 */
export function useProgramLookupById(): ReadonlyMap<string, ProgramRow> {
  const byHandle = useProgramLookup();
  return useMemo(() => new Map([...byHandle.values()].map((row) => [row.id, row] as const)), [byHandle]);
}
