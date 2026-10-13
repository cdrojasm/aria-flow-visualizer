import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ChevronRight, History, Loader2, Search, ShieldCheck } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ColumnVisibilityMenu, useHiddenColumns } from "@/components/ColumnVisibilityMenu";
import { MetricsFilterBar } from "@/components/MetricsFilterBar";
import { CARD, ErrorBox, RangeControl } from "@/components/metrics/MetricsShared";
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

type ColKey =
  | "fraude"
  | "created_at"
  | "event"
  | "customer"
  | "segment"
  | "channel"
  | "amount"
  | "status"
  | "resolution_method"
  | "marked_at"
  | "reviews"
  | "resolution_time";

const columns: { key: ColKey; label: string }[] = [
  { key: "fraude", label: "Marca / resultado" },
  { key: "created_at", label: "Llegada" },
  { key: "event", label: "Alerta" },
  { key: "customer", label: "Cliente" },
  { key: "segment", label: "Segmento" },
  { key: "channel", label: "Canal / subcanal" },
  { key: "amount", label: "Monto" },
  { key: "status", label: "Estado" },
  { key: "resolution_method", label: "Método resolución" },
  { key: "marked_at", label: "Marcada" },
  { key: "reviews", label: "Revisiones" },
  { key: "resolution_time", label: "Tiempo resolución" },
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
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<ApiAlertHistoryItem | null>(null);
  const [auditing, setAuditing] = useState<ApiAlertHistoryItem | null>(null);
  const { hidden: hiddenCols, toggle: toggleCol } = useHiddenColumns<ColKey>("historico-fraude-v2");
  const visibleColumns = useMemo(() => columns.filter((c) => !hiddenCols.has(c.key)), [hiddenCols]);

  const query = toMetricsQuery({ from: range.from, to: range.to }, filters);
  const queryKey = ["alertHistory", { from: range.from, to: range.to }, query.filters];
  const history = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => collectAlertHistoryPage(query, pageParam, { minItems: PAGE_SIZE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const items = useMemo(() => (history.data?.pages ?? []).flatMap((p) => p.items), [history.data]);
  const term = search.trim().toLowerCase();
  const shown = term
    ? items.filter((i) =>
        [i.alert_id, i.event_id, i.customer_id ?? ""].some((v) => v.toLowerCase().includes(term)),
      )
    : items;

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
  const show = (key: ColKey) => !hiddenCols.has(key);

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        <div className="sticky top-0 z-20 -mx-8 px-8 py-4 mb-6 bg-background border-b border-border flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-[20px] font-bold text-text-primary">
            Histórico de Gestión de Fraude
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
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
            <RangeControl value={range} onChange={setRange} />
            {canReview && (
              <>
                {importer.input}
                {importer.templateButton}
                {importer.trigger}
              </>
            )}
          </div>
        </div>

        {importer.panel}
        {history.isError && <ErrorBox error={history.error} what="el histórico de alertas" />}

        <section className={`relative ${CARD}`}>
          <div className="px-5 pt-4 pb-3 border-b border-border space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-text-primary">
                Alertas del rango{" "}
                <span className="font-normal text-text-secondary">· más recientes primero</span>
              </h2>
              <ColumnVisibilityMenu columns={columns} hidden={hiddenCols} onToggle={toggleCol} />
            </div>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en lo cargado por alerta, evento o cliente…"
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-card text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                  {visibleColumns.map((col) => (
                    <th key={col.key} className="font-normal py-3 px-5 whitespace-nowrap text-left">
                      {col.label}
                    </th>
                  ))}
                  <th className="text-right font-normal px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {history.isLoading ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="px-5 py-8 text-center text-[13px] text-text-secondary"
                    >
                      <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                      Cargando histórico…
                    </td>
                  </tr>
                ) : shown.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="px-5 py-8 text-center text-[13px] text-text-secondary"
                    >
                      {term
                        ? "Ninguna alerta cargada coincide con la búsqueda."
                        : "No hay alertas en el rango con esos filtros."}
                    </td>
                  </tr>
                ) : (
                  shown.map((item, i) => (
                    <tr
                      key={item.alert_id}
                      className={`border-t border-border ${i % 2 === 1 ? "bg-surface" : "bg-card"}`}
                    >
                      {show("fraude") && (
                        <td className="px-5 py-3 whitespace-nowrap">
                          <FraudCell item={item} />
                        </td>
                      )}
                      {show("created_at") && (
                        <td className="px-5 py-3 text-[12px] text-text-secondary tabular-nums whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </td>
                      )}
                      {show("event") && (
                        <td
                          className="px-5 py-3 text-[13px] font-medium text-text-primary tabular-nums whitespace-nowrap"
                          title={item.alert_id}
                        >
                          {item.event_id}
                          <div className="text-[11px] font-normal text-text-secondary">
                            {item.event_type}
                          </div>
                        </td>
                      )}
                      {show("customer") && (
                        <td className="px-5 py-3 text-[12px] text-text-secondary tabular-nums whitespace-nowrap">
                          {item.customer_id ?? "—"}
                        </td>
                      )}
                      {show("segment") && (
                        <td className="px-5 py-3 whitespace-nowrap">
                          {item.segment ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${segmentoBadgeClass(item.segment)}`}
                            >
                              {item.segment}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                      {show("channel") && (
                        <td className="px-5 py-3 text-[13px] text-text-primary whitespace-nowrap">
                          {item.channel ?? "—"}
                          {item.subchannel && (
                            <div className="text-[11px] text-text-secondary">{item.subchannel}</div>
                          )}
                        </td>
                      )}
                      {show("amount") && (
                        <td className="px-5 py-3 text-[13px] text-text-primary tabular-nums whitespace-nowrap">
                          {item.amount === null ? "—" : formatAmount(item.amount)}
                          <div className="text-[11px] text-text-secondary">
                            {item.amount_tier === "unknown" ? "sin rango" : item.amount_tier}
                          </div>
                        </td>
                      )}
                      {show("status") && (
                        <td className="px-5 py-3 text-[12px] whitespace-nowrap">
                          {statusLabel(item.status)}
                        </td>
                      )}
                      {show("resolution_method") && (
                        <td className="px-5 py-3 text-[12px] whitespace-nowrap">
                          {resolutionMethodLabel(item.resolution_method)}
                        </td>
                      )}
                      {show("marked_at") && (
                        <td className="px-5 py-3 text-[12px] text-text-secondary tabular-nums whitespace-nowrap">
                          {formatDate(item.marked_at)}
                        </td>
                      )}
                      {show("reviews") && (
                        <td className="px-5 py-3 text-[12px] whitespace-nowrap">
                          {item.fraud_review_count > 0 ? (
                            <>
                              <span className="font-medium tabular-nums">
                                {item.fraud_review_count}
                              </span>
                              <div className="text-[11px] text-text-secondary tabular-nums">
                                {formatDate(item.fraud_reviewed_at)}
                              </div>
                            </>
                          ) : (
                            <span className="text-text-secondary">Sin revisar</span>
                          )}
                        </td>
                      )}
                      {show("resolution_time") && (
                        <td className="px-5 py-3 text-[12px] tabular-nums whitespace-nowrap">
                          {item.resolution_time_seconds === null
                            ? "—"
                            : formatDuration(item.resolution_time_seconds)}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canReview && (
                            <button
                              type="button"
                              onClick={() => setReviewing(item)}
                              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Revisar fraude
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setAuditing(item)}
                            aria-label={`Auditoría de ${item.event_id}`}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface"
                          >
                            <History className="h-3.5 w-3.5" /> Auditoría
                          </button>
                          <Link
                            to="/alerta/$id"
                            params={{ id: item.alert_id }}
                            className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-text-primary text-[12px] font-medium hover:bg-surface"
                          >
                            Ver <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-[12px] text-text-secondary">
            <span>
              {items.length} alerta{items.length === 1 ? "" : "s"} cargada
              {items.length === 1 ? "" : "s"}
            </span>
            {history.hasNextPage ? (
              <button
                type="button"
                onClick={() => void history.fetchNextPage()}
                disabled={history.isFetchingNextPage}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-text-primary font-medium hover:bg-surface disabled:opacity-60"
              >
                {history.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Cargar más
              </button>
            ) : (
              !history.isLoading && <span>No hay más alertas en el rango.</span>
            )}
          </div>
        </section>
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
