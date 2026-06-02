import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronRight, AlertTriangle, Check, ChevronDown, Clock,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/alerta/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de alerta · ARIA" },
      { name: "description", content: "Detalle completo de la alerta y razonamiento del agente." },
    ],
  }),
  component: AlertaDetailPage,
});

type Stage = {
  key: string;
  name: string;
  duration: string;
  description: string;
  status: "done" | "active" | "skipped";
};

const stages: Stage[] = [
  { key: "aric", name: "Generada por ARIC", duration: "0.0s", status: "done",
    description: "ARIC detectó el evento como candidato a alerta a partir de las reglas de monitoreo transaccional." },
  { key: "clasif", name: "Clasificación", duration: "0.4s", status: "done",
    description: "El clasificador asignó la alerta a la categoría 'fraude tarjeta' con confianza 0.92." },
  { key: "enrich", name: "Enriquecimiento", duration: "1.2s", status: "done",
    description: "Se agregó contexto del usuario, dispositivo, ubicación e historial de transacciones de 90 días." },
  { key: "tax", name: "Taxonomía", duration: "0.8s", status: "done",
    description: "Se evaluó contra la taxonomía 'card-present geo anomaly'. Match alto." },
  { key: "adv", name: "Adversarial", duration: "1.5s", status: "active",
    description: "El sub-agente adversarial cuestionó dos señales (monto y comercio) por presentar varianza histórica reciente." },
  { key: "exec", name: "Executor", duration: "—", status: "skipped",
    description: "Aún no se ejecutaron acciones automáticas — pendiente de revisión por analista." },
  { key: "analyst", name: "Analista", duration: "—", status: "skipped",
    description: "Derivada a cola humana por confianza bajo umbral tras revisión adversarial." },
];

const signals = [
  { name: "Geolocalización anómala", desc: "Transacción en São Paulo, último login en CDMX hace 2h", weight: 95, flagged: false },
  { name: "Monto fuera de patrón", desc: "Excede 4.2× la media móvil de 30 días", weight: 82, flagged: true },
  { name: "Comercio de alto riesgo", desc: "MCC 5732 con historial de chargebacks", weight: 68, flagged: true },
  { name: "Dispositivo no reconocido", desc: "Primera aparición de fingerprint", weight: 54, flagged: false },
  { name: "Horario inusual", desc: "Fuera de la ventana 8:00–22:00 habitual", weight: 31, flagged: false },
];

const txData: [string, string][] = [
  ["ID transacción", "TX-9981234"],
  ["Monto", "$ 2,450.00 USD"],
  ["Canal", "POS"],
  ["Comercio", "ElectroMax (BR)"],
  ["MCC", "5732"],
  ["Dispositivo", "Card-Present"],
  ["Usuario", "USR-***4821"],
  ["Segmento", "Premium"],
  ["Timestamp", "2026-06-02 10:42:18"],
  ["BIN país", "MX"],
];

const executorActions = [
  "Hold temporal de la transacción aplicado",
  "Notificación push al usuario enviada",
  "Bloqueo preventivo de tarjeta sugerido",
];

const history30d = [
  3, 2, 5, 1, 4, 2, 3, 6, 2, 1, 3, 4, 2, 5, 3, 2, 4, 1, 2, 3, 5, 4, 2, 3, 1, 2, 4, 3, 2, 8,
];

const prevAlerts = [
  { id: "ALR-47120", date: "2026-05-21", result: "Falso positivo" },
  { id: "ALR-46004", date: "2026-04-18", result: "Auto-cerrada" },
  { id: "ALR-44872", date: "2026-03-02", result: "Falso positivo" },
];

function AlertaDetailPage() {
  const { id } = Route.useParams();
  const [openStage, setOpenStage] = useState<string | null>("adv");
  const [confirmAction, setConfirmAction] = useState<null | "fraud" | "fp" | "escalate">(null);
  const [justification, setJustification] = useState("");

  return (
    <DashboardLayout>
      <div className="p-8 pb-28 max-w-[1400px]">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-2">
              <Link to="/cola" className="hover:text-primary">Cola</Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-text-primary font-medium">Alerta #{id}</span>
            </nav>
            <h1 className="text-[20px] font-semibold text-text-primary">Alerta #{id}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-warning/10 text-warning text-[12px] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              En revisión adversarial
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary">
              <Clock className="h-3.5 w-3.5" />
              4m 12s en sistema
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[60fr_40fr] gap-6">
          {/* LEFT */}
          <div className="space-y-6">
            {/* Timeline */}
            <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
              <h2 className="text-[14px] font-semibold text-text-primary mb-5">Línea de tiempo del ciclo</h2>
              <ol className="relative">
                {stages.map((s, i) => {
                  const open = openStage === s.key;
                  const isActive = s.status === "active";
                  const isSkipped = s.status === "skipped";
                  return (
                    <li key={s.key} className="relative pl-10 pb-5 last:pb-0">
                      {i < stages.length - 1 && (
                        <span className="absolute left-[14px] top-7 bottom-0 w-px bg-border" />
                      )}
                      <button
                        onClick={() => setOpenStage(open ? null : s.key)}
                        className="w-full text-left"
                      >
                        <span
                          className={`absolute left-0 top-0 h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 ${
                            isActive
                              ? "border-primary bg-primary-light text-primary"
                              : isSkipped
                                ? "border-border bg-surface text-text-secondary"
                                : "border-success bg-success text-white"
                          }`}
                        >
                          {isSkipped ? i + 1 : isActive ? i + 1 : <Check className="h-3.5 w-3.5" />}
                        </span>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-medium ${isSkipped ? "text-text-secondary" : "text-text-primary"}`}>
                              {s.name}
                            </span>
                            <span className="text-[11px] text-text-secondary">· {s.duration}</span>
                          </div>
                          <ChevronDown className={`h-4 w-4 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {open && (
                        <p className="mt-2 text-[12px] text-text-secondary leading-relaxed">{s.description}</p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>

            {/* Risk signals */}
            <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
              <h2 className="text-[14px] font-semibold text-text-primary mb-5">Señales de riesgo</h2>
              <ul className="space-y-4">
                {signals.map((sig) => (
                  <li key={sig.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-text-primary">{sig.name}</span>
                        {sig.flagged && (
                          <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label="Cuestionada por adversarial" />
                        )}
                      </div>
                      <span className="text-[12px] tabular-nums text-text-secondary">{sig.weight}</span>
                    </div>
                    <p className="text-[12px] text-text-secondary mb-1.5">{sig.desc}</p>
                    <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${sig.weight}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            {/* Tx data */}
            <section className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-[14px] font-semibold text-text-primary mb-4">Datos de la transacción</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {txData.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] uppercase tracking-wider text-text-secondary">{k}</dt>
                    <dd className="text-[13px] text-text-primary font-medium mt-0.5">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* Proposed route */}
            <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
              <h2 className="text-[14px] font-semibold text-text-primary mb-3">Ruta propuesta por el agente</h2>
              <p className="text-[12px] text-text-secondary leading-relaxed mb-4">
                El agente identifica un patrón de <span className="text-text-primary font-medium">card-testing</span> seguido
                de transacción de alto valor en comercio extranjero. Hipótesis: tarjeta comprometida vía skimming
                en transacción POS previa, ahora utilizada en cadena de retail electrónico.
              </p>
              <div className="text-[12px] font-medium text-text-primary mb-2">Acciones ya ejecutadas</div>
              <ul className="space-y-2">
                {executorActions.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-[12px] text-text-primary">
                    <Check className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* User history */}
            <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
              <h2 className="text-[14px] font-semibold text-text-primary mb-1">Historial del usuario</h2>
              <p className="text-[11px] text-text-secondary mb-4">Actividad últimos 30 días</p>
              <div className="flex items-end gap-[3px] h-20 mb-4">
                {history30d.map((v, i) => {
                  const isTarget = i === history30d.length - 1;
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm ${isTarget ? "bg-danger" : "bg-primary-light"}`}
                      style={{ height: `${(v / 8) * 100}%` }}
                      title={isTarget ? "Transacción en cuestión" : `Día -${30 - i}`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-text-secondary mb-4">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary-light" /> Actividad</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-danger" /> Esta transacción</span>
              </div>
              <div className="text-[12px] font-medium text-text-primary mb-2">Alertas previas</div>
              <ul className="divide-y divide-border">
                {prevAlerts.map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between text-[12px]">
                    <span className="font-mono text-text-primary">{a.id}</span>
                    <span className="text-text-secondary">{a.date}</span>
                    <span className="text-text-primary">{a.result}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>

      {/* Sticky footer actions */}
      <div className="fixed bottom-0 left-[220px] right-0 bg-card border-t border-border px-8 py-3 flex items-center justify-end gap-3 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <button
          onClick={() => setConfirmAction("escalate")}
          className="h-9 px-4 rounded-md border border-primary text-primary text-[13px] font-medium hover:bg-primary-light"
        >Escalar</button>
        <button
          onClick={() => setConfirmAction("fp")}
          className="h-9 px-4 rounded-md bg-success text-white text-[13px] font-medium hover:bg-success/90"
        >Falso positivo</button>
        <button
          onClick={() => setConfirmAction("fraud")}
          className="h-9 px-4 rounded-md bg-danger text-white text-[13px] font-medium hover:bg-danger/90"
        >Confirmar fraude</button>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { setConfirmAction(null); setJustification(""); }}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-text-primary mb-1">
              {confirmAction === "fraud" && "Confirmar fraude"}
              {confirmAction === "fp" && "Marcar como falso positivo"}
              {confirmAction === "escalate" && "Escalar alerta"}
            </h3>
            <p className="text-[12px] text-text-secondary mb-4">Justificación obligatoria (mínimo 20 caracteres).</p>
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-border bg-background p-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Describe el razonamiento de tu decisión…"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-text-secondary">{justification.length}/20</span>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => { setConfirmAction(null); setJustification(""); }}
                className="h-9 px-4 rounded-md border border-border text-[13px] font-medium hover:bg-surface"
              >Cancelar</button>
              <button
                disabled={justification.length < 20}
                onClick={() => { setConfirmAction(null); setJustification(""); }}
                className="h-9 px-4 rounded-md bg-primary text-white text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
              >Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
