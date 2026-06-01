import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  X, ChevronRight, AlertTriangle, ShieldCheck, GitBranch, Sparkles,
  CreditCard, Smartphone, Globe, Store, User as UserIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/cola")({
  head: () => ({
    meta: [
      { title: "Mi cola · ARIA" },
      { name: "description", content: "Cola del analista — alertas pendientes de revisión." },
    ],
  }),
  component: ColaPage,
});

type Verdict = "Probable fraude" | "Incierto" | "Revisar señales";
type AlertRow = {
  id: string;
  txType: string;
  arrival: string;
  queueMinutes: number;
  verdict: Verdict;
  confidence: number;
  type: "Fraude tarjeta" | "Phishing" | "Lavado" | "Identidad" | "Cuenta mula";
  amount: string;
  channel: string;
  merchant: string;
  device: string;
  userId: string;
  segment: string;
  signals: { label: string; level: "danger" | "warning" | "neutral" }[];
};

const QUEUE_THRESHOLD = 12;

const rows: AlertRow[] = [
  {
    id: "ALR-48201", txType: "Compra POS", arrival: "10:42", queueMinutes: 18,
    verdict: "Probable fraude", confidence: 92, type: "Fraude tarjeta",
    amount: "$ 2,450.00 USD", channel: "POS", merchant: "ElectroMax (BR)", device: "Card-Present",
    userId: "USR-***4821", segment: "Premium",
    signals: [
      { label: "Geolocalización anómala", level: "danger" },
      { label: "Monto fuera de patrón", level: "danger" },
      { label: "Comercio de alto riesgo", level: "warning" },
    ],
  },
  {
    id: "ALR-48198", txType: "Transferencia", arrival: "10:30", queueMinutes: 14,
    verdict: "Incierto", confidence: 64, type: "Lavado",
    amount: "$ 9,800.00 USD", channel: "Web", merchant: "P2P – USR-***9012", device: "Chrome / Win",
    userId: "USR-***3344", segment: "Estándar",
    signals: [
      { label: "Múltiples destinos en 24h", level: "warning" },
      { label: "Estructuración sospechosa", level: "warning" },
      { label: "Cuenta nueva (<30d)", level: "neutral" },
    ],
  },
  {
    id: "ALR-48190", txType: "Login + cambio datos", arrival: "10:15", queueMinutes: 11,
    verdict: "Revisar señales", confidence: 41, type: "Phishing",
    amount: "—", channel: "Mobile App", merchant: "—", device: "iOS 17 / iPhone 14",
    userId: "USR-***1102", segment: "Estándar",
    signals: [
      { label: "Nuevo dispositivo", level: "warning" },
      { label: "Cambio de email", level: "danger" },
      { label: "IP de VPN conocida", level: "warning" },
    ],
  },
  {
    id: "ALR-48177", txType: "Retiro ATM", arrival: "09:58", queueMinutes: 9,
    verdict: "Probable fraude", confidence: 88, type: "Fraude tarjeta",
    amount: "$ 800.00 USD", channel: "ATM", merchant: "ATM #4521 Miami", device: "Card-Present",
    userId: "USR-***7788", segment: "Premium",
    signals: [
      { label: "País distinto a residencia", level: "danger" },
      { label: "Velocidad de uso", level: "warning" },
      { label: "PIN reintentado", level: "warning" },
    ],
  },
  {
    id: "ALR-48165", txType: "Apertura cuenta", arrival: "09:42", queueMinutes: 6,
    verdict: "Incierto", confidence: 58, type: "Identidad",
    amount: "—", channel: "Web", merchant: "—", device: "Chrome / Mac",
    userId: "USR-***NEW01", segment: "Nuevo",
    signals: [
      { label: "Documento de baja calidad", level: "warning" },
      { label: "Email desechable", level: "warning" },
      { label: "Coincidencia parcial con lista", level: "neutral" },
    ],
  },
  {
    id: "ALR-48150", txType: "Transferencia", arrival: "09:21", queueMinutes: 4,
    verdict: "Revisar señales", confidence: 36, type: "Cuenta mula",
    amount: "$ 1,200.00 USD", channel: "Web", merchant: "P2P – USR-***5566", device: "Edge / Win",
    userId: "USR-***2233", segment: "Estándar",
    signals: [
      { label: "Patrón pass-through", level: "warning" },
      { label: "Beneficiario reciente", level: "neutral" },
      { label: "Sin historia previa", level: "neutral" },
    ],
  },
];

const verdictStyles: Record<Verdict, string> = {
  "Probable fraude": "bg-[#fee2e2] text-[#991b1b]",
  "Incierto": "bg-[#fef3c7] text-[#92400e]",
  "Revisar señales": "bg-[#f3f4f6] text-[#374151]",
};

const signalColors = {
  danger: "bg-[#fee2e2] text-[#991b1b]",
  warning: "bg-[#fef3c7] text-[#92400e]",
  neutral: "bg-[#f3f4f6] text-[#374151]",
};

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-danger" : value >= 50 ? "bg-warning" : "bg-neutral";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="h-1.5 flex-1 bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-text-secondary w-9 text-right">{value}%</span>
    </div>
  );
}

type SortKey = "oldest" | "confidence" | "type";
type ActionKind = "fraud" | "fp" | "escalate" | null;

function ColaPage() {
  const [sort, setSort] = useState<SortKey>("oldest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"resumen" | "razonamiento" | "historial">("resumen");
  const [action, setAction] = useState<ActionKind>(null);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "oldest") copy.sort((a, b) => b.queueMinutes - a.queueMinutes);
    if (sort === "confidence") copy.sort((a, b) => b.confidence - a.confidence);
    if (sort === "type") copy.sort((a, b) => a.type.localeCompare(b.type));
    return copy;
  }, [sort]);

  const open = rows.find((r) => r.id === openId) ?? null;

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-[20px] font-bold text-text-primary">Mi cola</h1>
            <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary text-primary-foreground text-[12px] font-semibold tabular-nums">
              {rows.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-text-secondary">Ordenar</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 px-3 rounded-lg border border-border bg-card text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="oldest">Más antiguas primero</option>
              <option value="confidence">Por confianza del agente</option>
              <option value="type">Por tipo de caso</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                <th className="w-10 px-4 py-3"></th>
                <th className="text-left font-normal py-3 w-[110px]">ID alerta</th>
                <th className="text-left font-normal py-3">Tipo de transacción</th>
                <th className="text-left font-normal py-3 w-[110px]">Llegada</th>
                <th className="text-left font-normal py-3 w-[130px]">Tiempo en cola</th>
                <th className="text-left font-normal py-3 w-[170px]">Veredicto</th>
                <th className="text-left font-normal py-3 w-[200px]">Confianza</th>
                <th className="text-right font-normal px-4 py-3 w-[110px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const overdue = row.queueMinutes >= QUEUE_THRESHOLD;
                const active = openId === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => { setOpenId(row.id); setTab("resumen"); }}
                    className={`cursor-pointer border-t border-border transition-colors ${
                      active ? "bg-primary-light" : i % 2 === 1 ? "bg-surface" : "bg-card"
                    } hover:bg-primary-light/60`}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="h-4 w-4 rounded border-border accent-[rgb(0,17,148)]"
                      />
                    </td>
                    <td className="py-3 text-[13px] font-medium text-text-primary tabular-nums">{row.id}</td>
                    <td className="py-3 text-[13px] text-text-primary">{row.txType}</td>
                    <td className="py-3 text-[12px] text-text-secondary tabular-nums">{row.arrival}</td>
                    <td className={`py-3 text-[13px] tabular-nums font-medium ${overdue ? "text-danger" : "text-text-secondary"}`}>
                      {row.queueMinutes} min
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${verdictStyles[row.verdict]}`}>
                        {row.verdict}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <ConfidenceBar value={row.confidence} />
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => { setOpenId(row.id); setTab("resumen"); }}
                        className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-medium hover:opacity-90"
                      >
                        Abrir <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      {/* Drawer */}
      {open && (
        <Drawer
          row={open}
          tab={tab}
          onTab={setTab}
          onClose={() => setOpenId(null)}
          onAction={setAction}
        />
      )}

      {/* Confirmation modal */}
      {action && open && (
        <ConfirmModal
          action={action}
          alertId={open.id}
          onCancel={() => setAction(null)}
          onConfirm={() => { setAction(null); setOpenId(null); }}
        />
      )}
    </DashboardLayout>
  );
}

/* ------------------------------- Drawer ------------------------------- */

function Drawer({
  row, tab, onTab, onClose, onAction,
}: {
  row: AlertRow;
  tab: "resumen" | "razonamiento" | "historial";
  onTab: (t: "resumen" | "razonamiento" | "historial") => void;
  onClose: () => void;
  onAction: (a: ActionKind) => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 w-[480px] bg-card z-40 border-l border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-1">Alerta</div>
            <div className="text-[16px] font-bold text-text-primary tabular-nums">{row.id}</div>
            <div className="text-[12px] text-text-secondary mt-0.5">{row.type} · {row.txType}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface text-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 border-b border-border flex gap-1">
          {[
            { id: "resumen", label: "Resumen" },
            { id: "razonamiento", label: "Razonamiento del agente" },
            { id: "historial", label: "Historial del usuario" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id as never)}
              className={`px-3 py-3 text-[12px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {tab === "resumen" && <ResumenTab row={row} />}
          {tab === "razonamiento" && <RazonamientoTab />}
          {tab === "historial" && <HistorialTab />}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-4 space-y-3">
          <button
            type="button"
            className="block w-full text-center text-[12px] font-medium text-primary hover:underline"
          >
            Ver detalle completo →
          </button>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onAction("fraud")}
              className="h-9 rounded-lg bg-danger text-white text-[12px] font-medium hover:opacity-90"
            >
              Confirmar fraude
            </button>
            <button
              onClick={() => onAction("fp")}
              className="h-9 rounded-lg bg-success text-white text-[12px] font-medium hover:opacity-90"
            >
              Falso positivo
            </button>
            <button
              onClick={() => onAction("escalate")}
              className="h-9 rounded-lg border border-primary text-primary text-[12px] font-medium hover:bg-primary-light"
            >
              Escalar
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof CreditCard; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-text-secondary mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-text-secondary">{label}</div>
        <div className="text-[13px] text-text-primary truncate">{value}</div>
      </div>
    </div>
  );
}

function ResumenTab({ row }: { row: AlertRow }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">Transacción</h3>
        <div className="bg-surface rounded-lg border border-border px-4 py-2 divide-y divide-border">
          <MetaRow icon={CreditCard} label="Monto" value={row.amount} />
          <MetaRow icon={Globe} label="Canal" value={row.channel} />
          <MetaRow icon={Store} label="Comercio / Destino" value={row.merchant} />
          <MetaRow icon={Smartphone} label="Device" value={row.device} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">Usuario</h3>
        <div className="bg-surface rounded-lg border border-border px-4 py-2 divide-y divide-border">
          <MetaRow icon={UserIcon} label="ID" value={row.userId} />
          <MetaRow icon={Sparkles} label="Segmento" value={row.segment} />
        </div>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">Top señales de riesgo</h3>
        <div className="flex flex-wrap gap-2">
          {row.signals.map((s) => (
            <span
              key={s.label}
              className={`inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium ${signalColors[s.level]}`}
            >
              {s.label}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function RazonamientoTab() {
  const steps = [
    { icon: GitBranch, label: "Taxonomía evaluada", desc: "Clasificado como Fraude tarjeta — patrón geo+monto.", note: null },
    { icon: Sparkles, label: "Sub-agente FRAUD-01 activado", desc: "Análisis específico de fraude con tarjeta presente.", note: null },
    { icon: ShieldCheck, label: "Adversarial validó", desc: "Confirmó 92% confianza tras revisar 3 hipótesis alternativas.", note: "Adversarial corrigió: descartó hipótesis de viaje legítimo por falta de notificación previa." },
    { icon: AlertTriangle, label: "Executor derivó", desc: "Decidió derivar a analista por monto > umbral de auto-acción.", note: null },
  ];
  return (
    <ol className="relative border-l border-border ml-2 space-y-5 pl-6">
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <li key={i} className="relative">
            <span className="absolute -left-[34px] top-0 h-7 w-7 rounded-full bg-primary-light text-primary flex items-center justify-center border border-border">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="text-[13px] font-medium text-text-primary">{s.label}</div>
            <div className="text-[12px] text-text-secondary mt-0.5">{s.desc}</div>
            {s.note && (
              <div className="mt-2 rounded-md bg-[#fef9c3] border border-[#fde68a] px-3 py-2 text-[12px] text-[#713f12]">
                <span className="font-semibold">Corrección adversarial: </span>{s.note}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function HistorialTab() {
  const items = [
    { id: "ALR-47980", date: "28 may 2026", result: "Resuelto FP", level: "success" as const },
    { id: "ALR-47812", date: "21 may 2026", result: "Auto-cerrado", level: "neutral" as const },
    { id: "ALR-47650", date: "12 may 2026", result: "Fraude confirmado", level: "danger" as const },
    { id: "ALR-47433", date: "05 may 2026", result: "Resuelto FP", level: "success" as const },
  ];
  const colors = {
    success: "bg-[#dcfce7] text-[#166534]",
    neutral: "bg-[#f3f4f6] text-[#374151]",
    danger: "bg-[#fee2e2] text-[#991b1b]",
  };
  return (
    <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
      {items.map((i) => (
        <li key={i.id} className="flex items-center justify-between px-4 py-3 bg-card">
          <div>
            <div className="text-[13px] font-medium text-text-primary tabular-nums">{i.id}</div>
            <div className="text-[11px] text-text-secondary">{i.date}</div>
          </div>
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${colors[i.level]}`}>
            {i.result}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------- Modal ------------------------------- */

const actionLabels: Record<NonNullable<ActionKind>, { title: string; cta: string; tone: string }> = {
  fraud: { title: "Confirmar fraude", cta: "Confirmar fraude", tone: "bg-danger" },
  fp: { title: "Marcar como falso positivo", cta: "Marcar FP", tone: "bg-success" },
  escalate: { title: "Escalar alerta", cta: "Escalar", tone: "bg-primary" },
};

function ConfirmModal({
  action, alertId, onCancel, onConfirm,
}: {
  action: NonNullable<ActionKind>;
  alertId: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [text, setText] = useState("");
  const meta = actionLabels[action];
  const disabled = text.trim().length < 20;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-card rounded-xl border border-border shadow-xl">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-[16px] font-bold text-text-primary">{meta.title}</div>
          <div className="text-[12px] text-text-secondary mt-0.5">Alerta {alertId}</div>
        </div>
        <div className="px-5 py-4">
          <label className="text-[11px] uppercase tracking-wider text-text-secondary">
            Justificación <span className="text-danger normal-case tracking-normal">(obligatoria, mín. 20 caracteres)</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Describí brevemente la evidencia y el criterio aplicado…"
            className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-1 flex justify-between text-[11px] text-text-secondary tabular-nums">
            <span>{text.trim().length} / 20 mínimo</span>
            <span>{text.length} / 500</span>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-text-primary hover:bg-surface"
          >
            Cancelar
          </button>
          <button
            disabled={disabled}
            onClick={onConfirm}
            className={`h-9 px-4 rounded-lg text-white text-[13px] font-medium transition-opacity ${meta.tone} ${disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"}`}
          >
            {meta.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
