import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useState } from "react";
import { Toaster } from "sonner";
import { authStatus } from "@/ipc/auth";
import { toAppError } from "@/ipc/errors";
import { ErrorNotice } from "@/components/status";
import { Onboarding } from "@/features/auth/onboarding";
import { useApplyTheme } from "@/features/settings/use-theme";
import { queryKeys } from "@/query/keys";
import { createQueryClient } from "./query-client";
import { router } from "./router";

function Gate() {
  useApplyTheme();
  const auth = useQuery({ queryKey: queryKeys.auth, queryFn: authStatus, staleTime: Infinity });
  if (auth.isPending) return <div className="h-full bg-ground" />;
  if (auth.isError) {
    return (
      <div className="grid h-full place-items-center p-8">
        <ErrorNotice error={toAppError(auth.error)} className="max-w-md" />
      </div>
    );
  }
  if (!auth.data.username) return <Onboarding />;
  return <RouterProvider router={router} />;
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
      <Toaster
        position="bottom-right"
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              "flex w-[340px] items-start gap-2 rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[13px] text-ink",
            title: "font-medium",
            description: "text-muted",
            error: "[&_[data-icon]]:text-danger",
            success: "[&_[data-icon]]:text-success",
          },
        }}
      />
    </QueryClientProvider>
  );
}
