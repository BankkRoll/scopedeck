import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsGet, settingsSave, type Settings } from "@/ipc/workspace";
import { queryKeys } from "@/query/keys";

export const DEFAULT_SETTINGS: Settings = { theme: "dark", syncIntervalMinutes: 15, notifications: false };

export function useSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.settings, queryFn: settingsGet, staleTime: Infinity });
  const mutation = useMutation({
    mutationFn: settingsSave,
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings, saved);
    },
  });
  return {
    settings: query.data ?? DEFAULT_SETTINGS,
    save: mutation.mutateAsync,
    saving: mutation.isPending,
  };
}
