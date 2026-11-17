import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { toAppError } from "@/ipc/errors";
import { intentsList, type ReportIntent } from "@/ipc/intents";
import { DataTable } from "@/components/data-table";
import { EmptyState, ErrorNotice, PageHeader, SyncStatus } from "@/components/status";
import { Dialog } from "@/components/ui/dialog";
import { formatRelative, humanize } from "@/domain/format";
import { columnHelper } from "@/lib/table";
import { useViewAction } from "@/features/shell/view-actions";
import { queryKeys } from "@/query/keys";
import { IntentTracker } from "./intent-tracker";

const helper = columnHelper<ReportIntent>();

const columns = helper.columns([
  helper.accessor((row) => row.title ?? row.description, {
    id: "title",
    header: "Intent",
    cell: (info) => <span className="text-ink">{info.getValue().split("\n")[0]}</span>,
  }),
  helper.accessor("phase", {
    header: "Status",
    size: 140,
    cell: (info) => (
      <span className={info.getValue() === "failed" ? "text-danger" : "text-muted"}>
        {humanize(info.getValue())}
      </span>
    ),
  }),
  helper.accessor((row) => row.attachments.length, {
    id: "attachments",
    header: "Files",
    size: 80,
    cell: (info) => <span className="font-mono text-muted">{info.getValue()}</span>,
  }),
  helper.accessor((row) => row.updatedAt ?? row.createdAt ?? "", {
    id: "updated",
    header: "Updated",
    size: 130,
    cell: (info) => <span className="text-muted">{formatRelative(info.getValue())}</span>,
  }),
]);

export function IntentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const intents = useQuery({ queryKey: queryKeys.intents, queryFn: intentsList });
  const { refetch } = intents;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  useViewAction("refresh", refresh);

  return (
    <>
      <PageHeader
        title="Report intents"
        meta="Drafts analyzed by HackerOne's Report Assistant"
        actions={
          <SyncStatus
            syncedAt={intents.dataUpdatedAt ? new Date(intents.dataUpdatedAt).toISOString() : null}
            syncing={intents.isFetching}
            onRefresh={refresh}
          />
        }
      />
      {intents.isError ? <ErrorNotice error={toAppError(intents.error)} className="mx-5 mt-3" /> : null}
      <DataTable
        label="Report intents"
        data={intents.data ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        initialSorting={[{ id: "updated", desc: true }]}
        onActivate={(row) => {
          setSelected(row.id);
        }}
        empty={
          intents.isPending ? (
            "Loading report intents"
          ) : (
            <EmptyState title="No report intents">
              Intents are created when you submit a draft with attachments to a program that has the Report
              Assistant.
            </EmptyState>
          )
        }
      />
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Report intent"
        className="w-[min(760px,calc(100vw-32px))]"
      >
        {selected ? (
          <IntentTracker
            intentId={selected}
            onSubmitted={(reportId) => {
              setSelected(null);
              toast.success(reportId ? `Report #${reportId} submitted` : "Report submitted");
              void queryClient.invalidateQueries({ queryKey: queryKeys.reports.cached });
              if (reportId) void navigate({ to: "/reports/$id", params: { id: reportId } });
            }}
            onDeleted={() => {
              setSelected(null);
              toast("Report intent deleted");
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
