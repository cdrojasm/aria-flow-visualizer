import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Hand, Loader2, Users } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RefreshControl } from "@/components/RefreshControl";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import {
  AlertFiltersBar,
  matchesAlertFilters,
  type AlertFiltersValue,
} from "@/components/AlertFiltersBar";
import {
  ActionButton,
  ActionLink,
  DataTable,
  TruncText,
  type DataTableColumn,
} from "@/components/ui/DataTable";
import { segmentoBadgeClass, type Canal, type Segmento } from "@/data/channels";
import { useRole } from "@/hooks/useRole";
import { getActiveAlertSchema, type AlertSchemaVersion } from "@/lib/api/alertSchema.functions";
import { formatSchemaValue } from "@/components/alert/AlertSchemaView";
import {
  getOperationsCapacity,
  listAnalystQueue,
  listInProcessAlerts,
  queueConflictCode,
  takeAlert,
  type AnalystQueueAlert,
  type InProcessAlert,
} from "@/lib/api/operations.functions";
import { STEP_LABELS } from "@/lib/alertSteps";

export const Route = createFileRoute("/cola")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content: "Alertas en proceso — revisión y gestión de alertas activas.",
      },
    ],
  }),
  component: ColaPage,
});

type Verdict = "Probable fraude" | "Incierto" | "Revisar señales" | "Escalada";

type BaseRow = {
  id: string;
  userId: string;
  arrival: string;
  queueMinutes: number;
  amount: string;
  canal: Canal;
  subcanal: string;
  segmento: Exclude<Segmento, "Todos">;
  reglas: string[];
};

// ARIA aún está analizando el caso — no se ha derivado a ningún medio de resolución.
type ProcesoRow = BaseRow & {
  alertId: string;
  etapa: string;
};

// ARIA ya derivó el caso a un analista humano — puede estar sin tomar o ya asignado.
type PendingRow = BaseRow & {
  alertId: string;
  verdict: Verdict;
  analista?: string;
  // true when the current user is the analyst holding it.
  mine: boolean;
};

const QUEUE_THRESHOLD = 12;

const TAKE_ERRORS: Record<string, string> = {
  analyst_busy:
    "Ya estás atendiendo otra alerta. Resuélvela o libérala antes de tomar otra (esta la puedes ver en solo lectura).",
  alert_taken: "Otro analista tomó esta alerta.",
  no_capacity:
    "No hay analistas disponibles en la matriz para esta hora (o los analistas están apagados).",
  not_in_queue: "La alerta ya no está en la cola.",
};

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

type AlertPayload = Pick<AnalystQueueAlert, "alert_id" | "customer_id" | "created_at" | "input">;

// Maps an alert's canonical payload onto the columns both tables share.
// Payload shape follows ARIC's event (amount.baseValue, channel,
// object.triggeredRules[].name); anything missing renders as "—".
function toBaseRow(
  alert: AlertPayload,
  schema: AlertSchemaVersion | null,
): BaseRow & { alertId: string } {
  const fieldForRole = (role: string) => {
    const id = schema?.field_roles[role];
    return schema?.fields.find((field) => field.id === id);
  };
  const valueForRole = (role: string) => {
    const field = fieldForRole(role);
    return field ? alert.input[field.field] : undefined;
  };
  const amountField = fieldForRole("amount");
  const channelField = fieldForRole("channel");
  const entrypointField = fieldForRole("entrypoint");
  const created = new Date(alert.created_at);
  const amount = num(valueForRole("amount"));
  const rulesField = schema?.fields.find((field) => field.field === "rules");
  const rulesValue = rulesField ? alert.input[rulesField.field] : undefined;
  const rules = Array.isArray(rulesValue)
    ? rulesValue.map(String)
    : rulesValue
      ? [String(rulesValue)]
      : [];
  return {
    alertId: alert.alert_id,
    id: alert.alert_id.slice(0, 8),
    userId: alert.customer_id ?? "—",
    arrival: created.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    queueMinutes: Math.max(0, Math.round((Date.now() - created.getTime()) / 60000)),
    amount:
      amount === null
        ? "—"
        : formatSchemaValue(
            amount,
            amountField ?? { type: "number", use_locale: true, locale_type: "es-CO" },
          ),
    canal: (channelField
      ? formatSchemaValue(valueForRole("channel"), channelField)
      : "—") as BaseRow["canal"],
    subcanal: entrypointField
      ? formatSchemaValue(valueForRole("entrypoint"), entrypointField)
      : "—",
    segmento: "—" as BaseRow["segmento"],
    reglas: rules,
  };
}

// Escalated alert (backend AnalystQueueAlert) -> pending-for-analyst row.
function toPendingRow(
  alert: AnalystQueueAlert,
  userId: string | undefined,
  schema: AlertSchemaVersion | null,
): PendingRow {
  return {
    ...toBaseRow(alert, schema),
    verdict: "Escalada",
    analista: alert.reservation?.holder_name ?? (alert.reservation ? "Otro analista" : undefined),
    mine: !!alert.reservation && alert.reservation.holder === userId,
  };
}

// Alert ARIA is still analysing -> in-process row, with the workflow step
// it is in right now.
function toProcesoRow(alert: InProcessAlert, schema: AlertSchemaVersion | null): ProcesoRow {
  return {
    ...toBaseRow(alert, schema),
    etapa: alert.current_step
      ? (STEP_LABELS[alert.current_step] ?? alert.current_step)
      : "En espera de procesamiento",
  };
}

const verdictStyles: Record<Verdict, string> = {
  "Probable fraude": "bg-[#fee2e2] text-[#991b1b]",
  Incierto: "bg-[#fef3c7] text-[#92400e]",
  "Revisar señales": "bg-[#f3f4f6] text-[#374151]",
  Escalada: "bg-[#e0e7ff] text-[#3730a3]",
};
function parseAmount(amount: string): number {
  const num = Number(amount.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function matchesFilters(row: BaseRow, filters: AlertFiltersValue): boolean {
  return matchesAlertFilters(
    {
      canal: row.canal,
      subcanal: row.subcanal,
      segmento: row.segmento,
      monto: parseAmount(row.amount),
      reglas: row.reglas,
    },
    filters,
  );
}

const reglaChip =
  "inline-flex items-center px-1.5 py-0.5 rounded bg-[#f3f4f6] text-[#374151] text-[10px] font-medium whitespace-nowrap";

// Columns both tables share; the pending table interleaves its verdict column.
const baseColumns = <T extends BaseRow & { alertId: string }>(): Record<
  string,
  DataTableColumn<T>
> => ({
  id: {
    key: "id",
    label: "ID alerta",
    minWidth: 100,
    sortValue: (r) => r.id,
    searchValue: (r) => `${r.id} ${r.alertId}`,
    render: (r) => (
      <span className="text-[13px] font-medium text-text-primary tabular-nums" title={r.alertId}>
        {r.id}
      </span>
    ),
  },
  userId: {
    key: "userId",
    label: "Código Altamira",
    minWidth: 150,
    sortValue: (r) => r.userId,
    searchValue: (r) => r.userId,
    render: (r) => (
      <TruncText maxWidth={160} className="text-text-secondary tabular-nums">
        {r.userId}
      </TruncText>
    ),
  },
  arrival: {
    key: "arrival",
    label: "Llegada",
    minWidth: 90,
    // Earlier arrival = more minutes in queue, so ascending lists oldest first.
    sortValue: (r) => -r.queueMinutes,
    render: (r) => <span className="text-text-secondary tabular-nums">{r.arrival}</span>,
  },
  queueMinutes: {
    key: "queueMinutes",
    label: "Tiempo en cola",
    minWidth: 120,
    sortValue: (r) => r.queueMinutes,
    render: (r) => (
      <span
        className={`font-medium tabular-nums whitespace-nowrap ${r.queueMinutes >= QUEUE_THRESHOLD ? "text-danger" : "text-text-secondary"}`}
      >
        {r.queueMinutes} min
      </span>
    ),
  },
  amount: {
    key: "amount",
    label: "Monto",
    minWidth: 110,
    sortValue: (r) => parseAmount(r.amount),
    render: (r) => <span className="text-text-primary tabular-nums">{r.amount}</span>,
  },
  canal: {
    key: "canal",
    label: "Canal",
    minWidth: 90,
    sortValue: (r) => r.canal,
    searchValue: (r) => r.canal,
    render: (r) => <TruncText maxWidth={120}>{r.canal}</TruncText>,
  },
  subcanal: {
    key: "subcanal",
    label: "Subcanal",
    minWidth: 130,
    sortValue: (r) => r.subcanal,
    searchValue: (r) => r.subcanal,
    render: (r) => <TruncText maxWidth={160}>{r.subcanal}</TruncText>,
  },
  segmento: {
    key: "segmento",
    label: "Segmento",
    minWidth: 110,
    sortValue: (r) => r.segmento,
    render: (r) => (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${segmentoBadgeClass(r.segmento)}`}
      >
        {r.segmento}
      </span>
    ),
  },
  reglas: {
    key: "reglas",
    label: "Reglas",
    minWidth: 160,
    searchValue: (r) => r.reglas.join(" "),
    render: (r) =>
      r.reglas.length === 0 ? (
        <span className="text-text-secondary">—</span>
      ) : (
        <div className="flex gap-1 max-w-[220px] overflow-hidden" title={r.reglas.join(", ")}>
          {r.reglas.slice(0, 2).map((rule) => (
            <span key={rule} className={`${reglaChip} max-w-[100px] truncate`}>
              {rule}
            </span>
          ))}
          {r.reglas.length > 2 && <span className={reglaChip}>+{r.reglas.length - 2}</span>}
        </div>
      ),
  },
});

const procesoColumns = (): DataTableColumn<ProcesoRow>[] => {
  const c = baseColumns<ProcesoRow>();
  return [
    c.id,
    c.userId,
    c.arrival,
    c.queueMinutes,
    c.amount,
    c.canal,
    c.subcanal,
    c.segmento,
    c.reglas,
    {
      key: "etapa",
      label: "Etapa actual",
      minWidth: 160,
      sortValue: (r) => r.etapa,
      searchValue: (r) => r.etapa,
      render: (r) => (
        <TruncText maxWidth={200} className="text-text-secondary">
          {r.etapa}
        </TruncText>
      ),
    },
  ];
};

const pendingColumns = (): DataTableColumn<PendingRow>[] => {
  const c = baseColumns<PendingRow>();
  return [
    c.id,
    c.userId,
    c.arrival,
    c.queueMinutes,
    {
      key: "verdict",
      label: "Veredicto",
      minWidth: 120,
      sortValue: (r) => r.verdict,
      render: (r) => (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${verdictStyles[r.verdict]}`}
        >
          {r.verdict}
        </span>
      ),
    },
    c.amount,
    c.canal,
    c.subcanal,
    c.segmento,
    c.reglas,
    {
      key: "analista",
      label: "Analista",
      minWidth: 130,
      sortValue: (r) => r.analista ?? "",
      searchValue: (r) => r.analista,
      render: (r) =>
        r.analista ? (
          <TruncText maxWidth={160} className="text-text-primary">
            {r.mine ? `${r.analista} (tú)` : r.analista}
          </TruncText>
        ) : (
          <span className="text-text-secondary italic">Sin tomar</span>
        ),
    },
  ];
};

function ColaPage() {
  const [mainTab, setMainTab] = useState<"pending" | "proceso">("pending");
  const { lastRefresh, refresh } = useAutoRefresh();
  const { user, role } = useRole();
  const isFraudAnalyst = role === "fraud_analyst";
  const navigate = useNavigate();
  const queueQuery = useQuery({
    queryKey: ["analystQueue"],
    queryFn: () => listAnalystQueue(),
  });
  const inProcessQuery = useQuery({
    queryKey: ["inProcessAlerts"],
    queryFn: () => listInProcessAlerts(),
  });
  const schemaQuery = useQuery({ queryKey: ["activeAlertSchema"], queryFn: getActiveAlertSchema });
  const capacityQuery = useQuery({
    queryKey: ["operationsCapacity"],
    queryFn: () => getOperationsCapacity(),
  });
  // Same 15 s cadence as RefreshControl's auto-refresh.
  useEffect(() => {
    void queueQuery.refetch();
    void inProcessQuery.refetch();
    void capacityQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRefresh]);
  const pendingRows = useMemo(
    () =>
      (queueQuery.data ?? []).map((alert) =>
        toPendingRow(alert, user?.id, schemaQuery.data ?? null),
      ),
    [queueQuery.data, schemaQuery.data, user?.id],
  );
  const procesoRows = useMemo(
    () => (inProcessQuery.data ?? []).map((alert) => toProcesoRow(alert, schemaQuery.data ?? null)),
    [inProcessQuery.data, schemaQuery.data],
  );
  const [takeError, setTakeError] = useState<string | null>(null);
  const takeMutation = useMutation({
    mutationFn: (alertId: string) => takeAlert({ data: { alertId } }),
    onSuccess: (_, alertId) => navigate({ to: "/alerta/$id", params: { id: alertId } }),
    onError: (error) => {
      setTakeError(TAKE_ERRORS[queueConflictCode(error) ?? ""] ?? String(error));
      void queueQuery.refetch();
    },
  });
  const analysts = capacityQuery.data?.analysts;
  const [filters, setFilters] = useState<AlertFiltersValue>({
    canal: "Todos",
    subcanal: "Todos",
    segmento: "Todos",
    monto: "Todos",
    reglas: [],
  });
  const filteredProceso = useMemo(
    () => procesoRows.filter((r) => matchesFilters(r, filters)),
    [procesoRows, filters],
  );
  const filteredPending = useMemo(
    () => pendingRows.filter((r) => matchesFilters(r, filters)),
    [pendingRows, filters],
  );

  const tomarCaso = (alertId: string) => {
    setTakeError(null);
    takeMutation.mutate(alertId);
  };

  const procesoCols = useMemo(procesoColumns, []);
  const pendingCols = useMemo(pendingColumns, []);

  const activeCount = mainTab === "proceso" ? filteredProceso.length : filteredPending.length;

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Header */}
        <div className="sticky top-0 z-20 -mx-8 px-8 py-4 mb-6 bg-background border-b border-border flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-text-primary">Alertas en progreso</h1>
            <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold tabular-nums">
              {activeCount}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <AlertFiltersBar value={filters} onChange={setFilters} />
            <RefreshControl lastRefresh={lastRefresh} onRefresh={refresh} />
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {(
            [
              ["pending", "Pending Alerts for Analyst"],
              ["proceso", "Alertas en proceso"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMainTab(id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                mainTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mainTab === "proceso" ? (
          <DataTable
            storageKey="cola-proceso-v2"
            title="Alertas en proceso"
            description="Casos que ARIA todavía está analizando — aún no se han derivado a analista ni voicebot."
            itemLabel="alerta"
            rows={filteredProceso}
            rowKey={(r) => r.alertId}
            columns={procesoCols}
            defaultSort={{ key: "queueMinutes", dir: "desc" }}
            isLoading={inProcessQuery.isLoading}
            loadingLabel="Cargando alertas en proceso…"
            emptyLabel="ARIA no tiene alertas en análisis en este momento."
            error={
              inProcessQuery.isError && (
                <p className="px-5 py-3 text-[13px] text-danger">
                  No se pudieron cargar las alertas en proceso: {String(inProcessQuery.error)}
                </p>
              )
            }
            actionsWidth={70}
            actions={(row) => (
              <ActionLink
                to="/alerta/$id"
                params={{ id: row.alertId }}
                icon={<ChevronRight className="h-3 w-3" />}
              >
                Ver
              </ActionLink>
            )}
          />
        ) : (
          <DataTable
            storageKey="cola-pending-v2"
            title="Pending Alerts for Analyst"
            description="Casos que ARIA ya derivó a un analista humano, tomados o sin tomar. Cada analista atiende uno a la vez; la reserva vence a los 30 min."
            itemLabel="alerta"
            rows={filteredPending}
            rowKey={(r) => r.alertId}
            columns={pendingCols}
            defaultSort={{ key: "queueMinutes", dir: "desc" }}
            isLoading={queueQuery.isLoading}
            loadingLabel="Cargando cola…"
            emptyLabel="No hay alertas escaladas esperando a un analista."
            headerExtra={
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-[12px] text-text-secondary"
                title="Matriz de analistas para la hora actual menos los que están atendiendo una alerta"
              >
                <Users className="h-3.5 w-3.5" />
                {analysts
                  ? analysts.status === "unavailable"
                    ? "Analistas apagados"
                    : `${analysts.available} / ${analysts.total ?? 0} analistas libres`
                  : "—"}
              </span>
            }
            error={
              <>
                {takeError && (
                  <p className="px-5 py-3 text-[12px] text-danger bg-danger/5">{takeError}</p>
                )}
                {queueQuery.isError && (
                  <p className="px-5 py-3 text-[13px] text-danger">
                    No se pudo cargar la cola: {String(queueQuery.error)}
                  </p>
                )}
              </>
            }
            actionsWidth={100}
            actions={(row) =>
              row.mine ? (
                <ActionLink
                  tone="primary"
                  to="/alerta/$id"
                  params={{ id: row.alertId }}
                  icon={<ChevronRight className="h-3 w-3" />}
                >
                  Seguir
                </ActionLink>
              ) : !row.analista && isFraudAnalyst ? (
                <ActionButton
                  tone="primary"
                  onClick={() => tomarCaso(row.alertId)}
                  aria-label="Tomar caso"
                  disabled={takeMutation.isPending}
                  icon={
                    takeMutation.isPending && takeMutation.variables === row.alertId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Hand className="h-3 w-3" />
                    )
                  }
                >
                  Tomar
                </ActionButton>
              ) : (
                <ActionLink
                  to="/alerta/$id"
                  params={{ id: row.alertId }}
                  icon={<ChevronRight className="h-3 w-3" />}
                >
                  Ver
                </ActionLink>
              )
            }
          />
        )}
      </div>
    </DashboardLayout>
  );
}
