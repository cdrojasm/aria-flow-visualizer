import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ChevronRight, History, Loader2, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  ActionButton,
  ActionLink,
  DataTable,
  TruncText,
  type DataTableColumn,
} from "@/components/ui/DataTable";
import { MetricsFilterBar } from "@/components/MetricsFilterBar";
import { FilterBar, PageHeader } from "@/components/PageHeader";
import { ErrorBox, RangeControl } from "@/components/metrics/MetricsShared";
import { initialRange, type RangeState } from "@/lib/api/metricsMapping";
import { FraudReviewDialog, FraudReviewTrailDialog } from "@/components/fraude/FraudReview";
import { useFraudReviewImport } from "@/hooks/useFraudReviewImport";
import { MARK_BADGES, MARK_LABELS } from "@/lib/fraudLabels";
import { segmentoBadgeClass } from "@/data/channels";
import { useRole } from "@/hooks/useRole";
import {
  collectAlertHistoryPage,
  type ApiAlertHistoryItem,
  type ApiAlertHistoryPage,
  type ApiFraudReviewResponse,
} from "@/lib/api/alerts.functions";
import {
  formatAmount,
  formatDuration,
  resolutionMethodLabel,
  statusLabel,
  toMetricsQuery,
  type FilterSelection,
} from "@/lib/api/metricsMapping";

export const Route = createFileRoute("/historico-fraude")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content: "Histórico de gestión de fraude — alertas ya resueltas por el agente.",
      },
    ],
  }),
  component: HistoricoFraudePage,
});

const PAGE_SIZE = 50;

const columns: DataTableColumn<ApiAlertHistoryItem>[] = [
  {
    key: "fraude",
    label: "Marca / resultado",
    minWidth: 150,
    sortValue: (i) => MARK_LABELS[i.fraud_label],
    render: (i) => <FraudCell item={i} />,
  },
  {
    key: "created_at",
    label: "Llegada",
    minWidth: 150,
    sortValue: (i) => (i.created_at ? new Date(i.created_at).getTime() : null),
    render: (i) => (
      <span className="text-text-secondary tabular-nums whitespace-nowrap">
        {formatDate(i.created_at)}
      </span>
    ),
  },
  {
    key: "event",
    label: "Alerta",
    minWidth: 100,
    sortValue: (i) => i.event_id,
    searchValue: (i) => `${i.alert_id} ${i.event_id}`,
    render: (i) => (
      <div title={i.alert_id}>
        <TruncText
          maxWidth={110}
          maxChars={8}
          className="text-[13px] font-medium text-text-primary tabular-nums"
        >
          {i.event_id}
        </TruncText>
        <TruncText maxWidth={180} className="text-[11px] text-text-secondary">
          {i.event_type}
        </TruncText>
      </div>
    ),
  },
  {
    key: "customer",
    label: "Cliente",
    minWidth: 120,
    sortValue: (i) => i.customer_id,
    searchValue: (i) => i.customer_id,
    render: (i) => (
      <TruncText maxWidth={140} className="text-text-secondary tabular-nums">
        {i.customer_id}
      </TruncText>
    ),
  },
  {
    key: "segment",
    label: "Segmento",
    minWidth: 110,
    sortValue: (i) => i.segment,
    render: (i) =>
      i.segment ? (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${segmentoBadgeClass(i.segment)}`}
        >
          {i.segment}
        </span>
      ) : (
        "—"
      ),
  },
  {
    key: "channel",
    label: "Canal / subcanal",
    minWidth: 150,
    sortValue: (i) => i.channel,
    render: (i) => (
      <div>
        <TruncText maxWidth={160} className="text-text-primary">
          {i.channel}
        </TruncText>
        <TruncText maxWidth={160} className="text-[11px] text-text-secondary">
          {i.subchannel}
        </TruncText>
      </div>
    ),
  },
  {
    key: "amount",
    label: "Monto",
    minWidth: 110,
    sortValue: (i) => i.amount,
    render: (i) => (
      <div className="tabular-nums whitespace-nowrap">
        <div className="text-text-primary">{i.amount === null ? "—" : formatAmount(i.amount)}</div>
        <div className="text-[11px] text-text-secondary">
          {i.amount_tier === "unknown" ? "sin rango" : i.amount_tier}
        </div>
      </div>
    ),
  },
  {
    key: "status",
    label: "Estado",
    minWidth: 130,
    sortValue: (i) => statusLabel(i.status),
    render: (i) => <TruncText maxWidth={160}>{statusLabel(i.status)}</TruncText>,
  },
  {
    key: "resolution_method",
    label: "Método resolución",
    minWidth: 150,
    sortValue: (i) => resolutionMethodLabel(i.resolution_method),
    render: (i) => (
      <TruncText maxWidth={180}>{resolutionMethodLabel(i.resolution_method)}</TruncText>
    ),
  },
  {
    key: "marked_at",
    label: "Marcada",
    minWidth: 150,
    sortValue: (i) => (i.marked_at ? new Date(i.marked_at).getTime() : null),
    render: (i) => (
      <span className="text-text-secondary tabular-nums whitespace-nowrap">
        {formatDate(i.marked_at)}
      </span>
    ),
  },
  {
    key: "reviews",
    label: "Revisiones",
    minWidth: 130,
    sortValue: (i) => i.fraud_review_count,
    render: (i) =>
      i.fraud_review_count > 0 ? (
        <div className="whitespace-nowrap">
          <span className="font-medium tabular-nums">{i.fraud_review_count}</span>
          <div className="text-[11px] text-text-secondary tabular-nums">
            {formatDate(i.fraud_reviewed_at)}
          </div>
        </div>
      ) : (
        <span className="text-text-secondary">Sin revisar</span>
      ),
  },
  {
    key: "resolution_time",
    label: "Tiempo resolución",
    minWidth: 130,
    sortValue: (i) => i.resolution_time_seconds,
    render: (i) => (
      <span className="tabular-nums whitespace-nowrap">
        {i.resolution_time_seconds === null ? "—" : formatDuration(i.resolution_time_seconds)}
      </span>
    ),
  },
];

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO") : "—");

function FraudCell({ item }: { item: ApiAlertHistoryItem }) {
  if (item.fraud_label !== item.mark) {
    return (
      <div
        className="relative inline-flex items-start"
        title={`Marca: ${MARK_LABELS[item.mark]} · Resultado revisado: ${MARK_LABELS[item.fraud_label]}`}
      >
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium line-through opacity-60 ${MARK_BADGES[item.mark]}`}
        >
          {MARK_LABELS[item.mark]}
        </span>
        <span
          className={`-ml-3 mt-2.5 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ring-2 ring-card ${MARK_BADGES[item.fraud_label]}`}
        >
          {MARK_LABELS[item.fraud_label]}
        </span>
      </div>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${MARK_BADGES[item.mark]}`}
    >
      {MARK_LABELS[item.mark]}
    </span>
  );
}

function HistoricoFraudePage() {
  const { user } = useRole();
  const permissions = user?.permissions ?? [];
  const canReview = permissions.includes("fraud_review");
  const queryClient = useQueryClient();
  const [range, setRange] = useState<RangeState>(() => initialRange());
  const [filters, setFilters] = useState<FilterSelection>({});
  const [reviewing, setReviewing] = useState<ApiAlertHistoryItem | null>(null);
  const [auditing, setAuditing] = useState<ApiAlertHistoryItem | null>(null);

  const query = toMetricsQuery({ from: range.from, to: range.to }, filters);
  const queryKey = ["alertHistory", { from: range.from, to: range.to }, query.filters];
  const history = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => collectAlertHistoryPage(query, pageParam, { minItems: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const items = useMemo(() => (history.data?.pages ?? []).flatMap((p) => p.items), [history.data]);
  const onReviewed = (alertId: string, result: ApiFraudReviewResponse) => {
    queryClient.setQueryData<InfiniteData<ApiAlertHistoryPage>>(
      queryKey,
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((i) =>
              i.alert_id === alertId
                ? {
                    ...i,
                    mark: result.mark,
                    fraud_label: result.fraud_label,
                    marked_at: result.marked_at,
                    fraud_reviewed_at: result.fraud_reviewed_at,
                    fraud_review_count: result.fraud_review_count,
                  }
                : i,
            ),
          })),
        },
    );
  };
  const onImportFinished = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["alertHistory"] });
    void queryClient.invalidateQueries({ queryKey: ["metrics"] });
  }, [queryClient]);
  const importer = useFraudReviewImport(onImportFinished);

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        <PageHeader
          title="Histórico de Gestión de Fraude"
          actions={
            canReview && (
              <>
                {importer.input}
                {importer.templateButton}
                {importer.trigger}
              </>
            )
          }
        />
        <FilterBar
          activeCount={Object.values(filters).filter(Boolean).length}
          onClear={() => setFilters({})}
          trailing={<RangeControl value={range} onChange={setRange} />}
        >
          <MetricsFilterBar
            value={filters}
            onChange={setFilters}
            dimensions={[
              "segment",
              "channel",
              "subchannel",
              "amount_tier",
              "status",
              "resolution_method",
            ]}
            range={{ from: range.from, to: range.to }}
            canReadObservedValues={permissions.includes("dashboard")}
          />
        </FilterBar>

        {importer.panel}
        {history.isError && <ErrorBox error={history.error} what="el histórico de alertas" />}

        <DataTable
          storageKey="historico-fraude-v3"
          title={
            <>
              Alertas del rango{" "}
              <span className="font-normal text-text-secondary">· más recientes primero</span>
            </>
          }
          itemLabel="alerta"
          rows={items}
          rowKey={(i) => i.alert_id}
          columns={columns}
          defaultSort={{ key: "created_at", dir: "desc" }}
          searchPlaceholder="Buscar en lo cargado por alerta, evento o cliente…"
          isLoading={history.isLoading}
          emptyLabel="No hay alertas en el rango con esos filtros."
          noMatchLabel="Ninguna alerta cargada coincide con la búsqueda."
          actionsWidth={230}
          actions={(item) => (
            <>
              {canReview && (
                <ActionButton
                  tone="primary"
                  aria-label="Revisar fraude"
                  icon={<ShieldCheck className="h-3 w-3" />}
                  onClick={() => setReviewing(item)}
                >
                  Revisar
                </ActionButton>
              )}
              <ActionButton
                icon={<History className="h-3 w-3" />}
                aria-label={`Auditoría de ${item.event_id}`}
                onClick={() => setAuditing(item)}
              >
                Auditoría
              </ActionButton>
              <ActionLink
                to="/alerta/$id"
                params={{ id: item.alert_id }}
                icon={<ChevronRight className="h-3 w-3" />}
              >
                Ver
              </ActionLink>
            </>
          )}
          footerExtra={
            history.hasNextPage ? (
              <ActionButton
                onClick={() => void history.fetchNextPage()}
                disabled={history.isFetchingNextPage}
                icon={
                  history.isFetchingNextPage ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : undefined
                }
              >
                Cargar más
              </ActionButton>
            ) : (
              !history.isLoading && (
                <span className="text-[11px] text-text-secondary">
                  No hay más alertas en el rango.
                </span>
              )
            )
          }
        />
      </div>

      <FraudReviewDialog
        item={reviewing}
        onClose={() => setReviewing(null)}
        onReviewed={onReviewed}
      />
      <FraudReviewTrailDialog item={auditing} onClose={() => setAuditing(null)} />
    </DashboardLayout>
  );
}
