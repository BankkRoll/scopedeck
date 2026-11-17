import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isNetworkError, toAppError } from "@/ipc/errors";
import { reportApiReachable } from "@/lib/connectivity";

function track(error: unknown) {
  if (isNetworkError(toAppError(error))) reportApiReachable(false);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: track,
      onSuccess: () => {
        reportApiReachable(true);
      },
    }),
    mutationCache: new MutationCache({ onError: track }),
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        networkMode: "always",
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}
