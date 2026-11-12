import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, Lock, Search, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/ui/DataTable";
import { SideDrawer } from "@/components/ui/side-drawer";
import {
  archiveErrorMessage,
  getArchivedAlert,
  getLegalHold,
  listLegalHolds,
  placeLegalHold,
  releaseLegalHold,
  searchArchivedAlerts,
  type ApiArchivedAlertHit,
  type ApiLegalHold,
  type ArchiveSearchBy,
} from "@/lib/api/fraudArchive.functions";

/* Cold fraud-history archive (alerts older than the hot window) and legal
   holds. Search by alert id, event id (what other systems know) or creation
   day; the detail is read-only, shows the integrity check, can be exported as
   evidence and, with `legal_hold`, retained or released. */

const SEARCH_MODES: Array<{ key: ArchiveSearchBy; label: string; placeholder: string }> = [
  { key: "alert_id", label: "ID de alerta", placeholder: "UUID de la alerta" },
  { key: "event_id", label: "ID de evento", placeholder: "ID del evento en el sistema origen" },
  { key: "day", label: "Día de llegada", placeholder: "AAAA-MM-DD" },
];
const inputClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary";

export function FraudArchiveDrawer({
  open,
  onOpenChange,
  canHold,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canHold: boolean;
}) {
  const [tab, setTab] = useState<"search" | "holds">("search");
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <SideDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Archivo de alertas"
      description="Alertas con más de un año, guardadas en frío. Cada consulta queda registrada."
    >
      <div className="mb-4 flex gap-2 border-b border-border" role="tablist">
        <TabButton active={tab === "search"} onClick={() => setTab("search")}>
          Buscar
        </TabButton>
        {canHold && (
          <TabButton active={tab === "holds"} onClick={() => setTab("holds")}>
            Retenciones
          </TabButton>
        )}
      </div>
      {/* The search stays mounted (hidden) under the detail so "Volver" brings
          back the same query and results, refreshed after a hold change. */}
      <div hidden={tab !== "search" || selected !== null}>
        <ArchiveSearch onOpen={setSelected} />
      </div>
      {tab === "search" && selected && (
        <ArchivedAlertDetail
          alertId={selected}
          canHold={canHold}
          onBack={() => setSelected(null)}
        />
      )}
      {tab === "holds" && <HoldsTab />}
    </SideDrawer>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${active ? "border-primary text-primary" : "border-transparent text-text-secondary"}`}
    >
      {children}
    </button>
  );
}

function ArchiveSearch({ onOpen }: { onOpen: (alertId: string) => void }) {
  const [by, setBy] = useState<ArchiveSearchBy>("alert_id");
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState<{ by: ArchiveSearchBy; value: string } | null>(null);
  const search = useQuery({
    queryKey: ["archiveSearch", submitted],
    queryFn: () => searchArchivedAlerts(submitted!.by, submitted!.value),
    enabled: submitted !== null,
    retry: false,
  });
  const mode = SEARCH_MODES.find((item) => item.key === by)!;
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) setSubmitted({ by, value: value.trim() });
        }}
      >
        <select
          aria-label="Buscar por"
          value={by}
          onChange={(event) => {
            setBy(event.target.value as ArchiveSearchBy);
            setValue("");
            setSubmitted(null);
          }}
          className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
        >
          {SEARCH_MODES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <input
          aria-label="Valor a buscar en el archivo"
          type={by === "day" ? "date" : "text"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={mode.placeholder}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <ActionButton
          tone="primary"
          type="submit"
          disabled={!value.trim() || search.isFetching}
          icon={
            search.isFetching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )
          }
        >
          Buscar
        </ActionButton>
      </form>
      {search.isError && (
        <p role="alert" className="text-[12px] text-danger">
          {archiveErrorMessage(search.error)}
        </p>
      )}
      {search.isSuccess && search.data.length === 0 && (
        <p className="text-[13px] text-text-secondary">
          No hay alertas archivadas con ese criterio. Si es reciente, sigue en el histórico.
        </p>
      )}
      {search.isSuccess && search.data.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {search.data.map((hit) => (
            <HitRow key={hit.alert_id} hit={hit} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}

function HitRow({ hit, onOpen }: { hit: ApiArchivedAlertHit; onOpen: (alertId: string) => void }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
      <div className="min-w-0">
        <div className="truncate font-mono text-[12px] text-text-primary">{hit.alert_id}</div>
        <div className="text-text-secondary">
          Evento {hit.event_id ?? "—"} · llegó el {hit.created_day}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {hit.legal_hold && <HoldBadge />}
        <ActionButton aria-label={`Abrir ${hit.alert_id}`} onClick={() => onOpen(hit.alert_id)}>
          Abrir
        </ActionButton>
      </div>
    </li>
  );
}

function HoldBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
      <Lock className="h-3 w-3" /> Retenida
    </span>
  );
}

function ArchivedAlertDetail({
  alertId,
  canHold,
  onBack,
}: {
  alertId: string;
  canHold: boolean;
  onBack: () => void;
}) {
  const detail = useQuery({
    queryKey: ["archivedAlert", alertId],
    queryFn: () => getArchivedAlert(alertId),
    retry: false,
  });
  const exportJson = () => {
    if (!detail.data) return;
    const blob = new Blob([JSON.stringify(detail.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alerta-archivada-${alertId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <ActionButton icon={<ArrowLeft className="h-3 w-3" />} onClick={onBack}>
        Volver a los resultados
      </ActionButton>
      {detail.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {detail.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {archiveErrorMessage(detail.error)}
        </p>
      )}
      {detail.data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-mono text-[12px] text-text-primary">{detail.data.alert_id}</div>
              <div className="text-[12px] text-text-secondary">
                Archivada · llegó el {detail.data.created_day}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">
                <ShieldCheck className="h-3 w-3" /> Integridad verificada (
                {detail.data.verified_against === "record" ? "registro" : "objeto del día"})
              </span>
              <ActionButton icon={<Download className="h-3 w-3" />} onClick={exportJson}>
                Exportar JSON
              </ActionButton>
            </div>
          </div>
          <HoldPanel alertId={alertId} canHold={canHold} />
          <Section title="Alerta">
            <pre className="max-h-[320px] overflow-auto rounded-lg bg-card p-3 text-[11px]">
              {JSON.stringify(detail.data.alert, null, 2)}
            </pre>
          </Section>
          <Section title={`Revisiones de fraude (${detail.data.fraud_label_reviews.length})`}>
            {detail.data.fraud_label_reviews.length === 0 ? (
              <p className="text-[12px] text-text-secondary">Sin revisiones.</p>
            ) : (
              <pre className="max-h-[240px] overflow-auto rounded-lg bg-card p-3 text-[11px]">
                {JSON.stringify(detail.data.fraud_label_reviews, null, 2)}
              </pre>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-[12px] font-semibold text-text-secondary">{title}</h3>
      {children}
    </section>
  );
}

function HoldPanel({ alertId, canHold }: { alertId: string; canHold: boolean }) {
  const queryClient = useQueryClient();
  const hold = useQuery({
    queryKey: ["legalHold", alertId],
    queryFn: () => getLegalHold(alertId),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["legalHold", alertId] });
    void queryClient.invalidateQueries({ queryKey: ["legalHolds"] });
    void queryClient.invalidateQueries({ queryKey: ["archiveSearch"] });
  };
  const active = hold.data?.active ? hold.data : null;
  return (
    <section
      aria-label="Retención legal"
      className="space-y-2 rounded-lg border border-border p-3 text-[13px]"
    >
      <div className="flex items-center gap-2 font-medium text-text-primary">
        <Lock className="h-3.5 w-3.5" /> Retención legal
      </div>
      {hold.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : active ? (
        <>
          <HoldSummary hold={active} />
          {canHold && <ReleaseForm alertId={alertId} onDone={refresh} />}
        </>
      ) : (
        <>
          <p className="text-text-secondary">
            Sin retención activa.
            {hold.data?.released_at &&
              ` La última se levantó el ${hold.data.released_at.slice(0, 10)}.`}
          </p>
          {canHold && <PlaceForm initialAlertId={alertId} onDone={refresh} />}
        </>
      )}
    </section>
  );
}

function HoldSummary({ hold }: { hold: ApiLegalHold }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt className="text-text-secondary">Motivo</dt>
      <dd>{hold.reason}</dd>
      <dt className="text-text-secondary">Caso</dt>
      <dd>{hold.case_reference ?? "—"}</dd>
      <dt className="text-text-secondary">Retenida</dt>
      <dd>
        {hold.placed_at.slice(0, 10)} · {hold.placed_by}
      </dd>
    </dl>
  );
}

function PlaceForm({ initialAlertId, onDone }: { initialAlertId?: string; onDone: () => void }) {
  const [alertId, setAlertId] = useState(initialAlertId ?? "");
  const [reason, setReason] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const place = useMutation({
    mutationFn: () => placeLegalHold({ alertId: alertId.trim(), reason, caseReference }),
    onSuccess: () => {
      setReason("");
      setCaseReference("");
      if (!initialAlertId) setAlertId("");
      onDone();
    },
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        place.mutate();
      }}
    >
      {!initialAlertId && (
        <input
          aria-label="ID de la alerta a retener"
          value={alertId}
          onChange={(event) => setAlertId(event.target.value)}
          placeholder="UUID de la alerta (caliente o archivada)"
          className={inputClass}
        />
      )}
      <textarea
        aria-label="Motivo de la retención"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo (obligatorio, mínimo 10 caracteres)"
        rows={2}
        className={inputClass}
      />
      <input
        aria-label="Referencia del caso"
        value={caseReference}
        onChange={(event) => setCaseReference(event.target.value)}
        placeholder="Referencia del caso (opcional)"
        className={inputClass}
      />
      {place.isError && (
        <p role="alert" className="text-[12px] text-danger">
          {archiveErrorMessage(place.error)}
        </p>
      )}
      <ActionButton
        tone="primary"
        type="submit"
        disabled={!alertId.trim() || reason.trim().length < 10 || place.isPending}
        icon={<Lock className="h-3 w-3" />}
      >
        Retener
      </ActionButton>
    </form>
  );
}

function ReleaseForm({ alertId, onDone }: { alertId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const release = useMutation({
    mutationFn: () => releaseLegalHold({ alertId, reason }),
    onSuccess: () => {
      setReason("");
      onDone();
    },
  });
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        release.mutate();
      }}
    >
      <input
        aria-label="Motivo para levantar la retención"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo para levantarla (obligatorio)"
        className={`${inputClass} min-w-0 flex-1`}
      />
      <ActionButton type="submit" disabled={reason.trim().length < 10 || release.isPending}>
        Levantar retención
      </ActionButton>
      {release.isError && (
        <p role="alert" className="w-full text-[12px] text-danger">
          {archiveErrorMessage(release.error)}
        </p>
      )}
    </form>
  );
}

function HoldsTab() {
  const queryClient = useQueryClient();
  const holds = useQuery({ queryKey: ["legalHolds"], queryFn: listLegalHolds });
  const [releasing, setReleasing] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[12px] font-semibold text-text-secondary">Retener una alerta</h3>
        <PlaceForm
          onDone={() => void queryClient.invalidateQueries({ queryKey: ["legalHolds"] })}
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-[12px] font-semibold text-text-secondary">
          Retenciones activas ({holds.data?.length ?? 0})
        </h3>
        {holds.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {holds.isError && (
          <p role="alert" className="text-[12px] text-danger">
            {archiveErrorMessage(holds.error)}
          </p>
        )}
        {holds.data?.length === 0 && (
          <p className="text-[13px] text-text-secondary">No hay alertas retenidas.</p>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(holds.data ?? []).map((hold) => (
            <li key={hold.alert_id} className="space-y-2 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[12px]">{hold.alert_id}</span>
                <ActionButton
                  aria-label={`Levantar ${hold.alert_id}`}
                  onClick={() => setReleasing(releasing === hold.alert_id ? null : hold.alert_id)}
                >
                  Levantar
                </ActionButton>
              </div>
              <HoldSummary hold={hold} />
              {releasing === hold.alert_id && (
                <ReleaseForm
                  alertId={hold.alert_id}
                  onDone={() => {
                    setReleasing(null);
                    void queryClient.invalidateQueries({ queryKey: ["legalHolds"] });
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
