import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ChevronRight, AlertTriangle, Check, ChevronDown, Clock,
  RefreshCw, ExternalLink, GitBranch, ShieldCheck, Sparkles, Database, X,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/alerta/$id")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Detalle completo de la alerta y razonamiento del agente." },
    ],
  }),
  component: AlertaDetailPage,
});

type AlertTab = "resumen" | "razonamiento" | "data" | "estados" | "usuario" | "historial";

const TABS: { id: AlertTab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "razonamiento", label: "Razonamiento del agente" },
  { id: "data", label: "Data alerta" },
  { id: "estados", label: "Estados" },
  { id: "usuario", label: "Usuario" },
  { id: "historial", label: "Historial" },
];

/* ────────────── mock data ────────────── */

const stages = [
  { key: "aric", name: "Generada por ARIC", duration: "0.0s", status: "done" as const,
    description: "ARIC detectó el evento como candidato a alerta a partir de las reglas de monitoreo transaccional.",
    cot: "Reglas disparadas: dg_vpn_pse=true, Score1000Net_PRE=true, geo_anomaly=HIGH.\nThreshold superado: 3 reglas activas con score acumulado 0.87 > 0.75.\n→ Alerta generada y encolada." },
  { key: "clasif", name: "Clasificación", duration: "0.4s", status: "done" as const,
    description: "El clasificador asignó la alerta a la categoría 'fraude tarjeta' con confianza 0.92.",
    cot: "Evaluando 5 categorías candidatas.\n[fraude_tarjeta: p=0.92] geo_anomaly=+0.31, monto_pattern=+0.28, mcc_risk=+0.18\n[identidad: p=0.31] [cuenta_mula: p=0.12] [phishing: p=0.08]\n→ fraude_tarjeta seleccionado (margen 0.61)." },
  { key: "enrich", name: "Enriquecimiento", duration: "1.2s", status: "done" as const,
    description: "Se agregó contexto del usuario, dispositivo, ubicación e historial de transacciones de 90 días.",
    cot: "Fuentes consultadas: perfil_cliente (OK), historial_tx_90d (OK), biocatch (OK), geo_ip (OK).\nDatos adjuntados: score_biocatch=369, sessions=38, deviceId=5BDCC9FE-…\n→ Enriquecimiento completo en 1.2s." },
  { key: "tax", name: "Taxonomía", duration: "0.8s", status: "done" as const,
    description: "Se evaluó contra la taxonomía 'card-present geo anomaly'. Match alto.",
    cot: "Taxonomía card_present_geo_anomaly: match_score=0.94.\nCriterios: geo_distance_km=7800 (MX→BR), time_delta_h=2.1, mcc=5732 (alto riesgo).\n→ Clasificación confirmada." },
  { key: "adv", name: "Adversarial", duration: "1.5s", status: "active" as const,
    description: "El sub-agente adversarial cuestionó dos señales por presentar varianza histórica reciente.",
    cot: "H1 (fraude): geo inválido para viaje legítimo → CONFIRMADO\nH2 (viaje legítimo): sin notificación de viaje → REFUTADA\nH3 (skimming+uso): MCC 5732 + monto alto → PLAUSIBLE\nAjuste: 0.94→0.92 por varianza en monto último mes." },
  { key: "exec", name: "Executor", duration: "—", status: "skipped" as const,
    description: "Aún no se ejecutaron acciones automáticas — pendiente de revisión.",
    cot: "En espera. confidence=0.92 < umbral auto-acción=0.95.\nDecisión pendiente de analista." },
  { key: "analyst", name: "Analista", duration: "—", status: "skipped" as const,
    description: "Derivada a cola humana por confianza bajo umbral tras revisión adversarial.",
    cot: "Estado: ENCOLADA_ANALISTA. SLA: 15min. Prioridad: ALTA." },
];

const signals = [
  { name: "Geolocalización anómala", desc: "Transacción en São Paulo, último login en CDMX hace 2h", weight: 95, flagged: false },
  { name: "Monto fuera de patrón", desc: "Excede 4.2× la media móvil de 30 días", weight: 82, flagged: true },
  { name: "Comercio de alto riesgo", desc: "MCC 5732 con historial de chargebacks", weight: 68, flagged: true },
  { name: "Dispositivo no reconocido", desc: "Primera aparición de fingerprint", weight: 54, flagged: false },
  { name: "Horario inusual", desc: "Fuera de la ventana 8:00–22:00 habitual", weight: 31, flagged: false },
];

const dataFields: { num: number; name: string; available: "yes" | "partial" | "no"; value: string }[] = [
  { num: 1, name: "Lista de reglas", available: "yes", value: "dg_vpn_pse, Score1000Net_PRE: true" },
  { num: 2, name: "Lista de marcas", available: "partial", value: "cancelTSEC, riesgo: Alto" },
  { num: 3, name: "Modelos que alertaron", available: "yes", value: "bbva_payments_model_1, businessrules" },
  { num: 4, name: "Score Biocatch", available: "yes", value: "369.0" },
  { num: 5, name: "Hora", available: "yes", value: "2026-06-09T11:17:43-05:00" },
  { num: 6, name: "Tipo de transacción", available: "yes", value: "paymentRT" },
  { num: 7, name: "Código Altamira", available: "yes", value: "10264559" },
  { num: 8, name: "Cuenta origen", available: "partial", value: "00130655000200349835" },
  { num: 9, name: "Canal", available: "yes", value: "OM" },
  { num: 10, name: "BIN", available: "partial", value: "450408" },
  { num: 11, name: "4 dígitos tarjeta", available: "no", value: "No disponible (hash)" },
  { num: 12, name: "Entry mode", available: "partial", value: "10 - Card on file - Pago recurrente" },
  { num: 13, name: "Comercio (ID)", available: "partial", value: "15000108778" },
  { num: 14, name: "Nombre comercio", available: "partial", value: "APPLE.COM/BILL" },
  { num: 15, name: "ID sesión", available: "yes", value: "51876a2715ee…" },
  { num: 16, name: "Integration Point", available: "yes", value: "SMGG20211063 - patchPaymentRequest" },
  { num: 17, name: "Autorización", available: "partial", value: "00  4002150001" },
  { num: 18, name: "Descripción", available: "partial", value: "PAGOS PSE" },
  { num: 19, name: "Contraparte", available: "partial", value: "COMUNIDAD DE HERMANOS MARISTAS" },
  { num: 20, name: "Monto", available: "partial", value: "680871.0" },
  { num: 21, name: "Respuesta (msgStatus)", available: "yes", value: "new" },
  { num: 22, name: "Direction", available: "yes", value: "outbound" },
  { num: 23, name: "IP Canal", available: "partial", value: "163.116.234.50" },
  { num: 24, name: "IP BioCatch", available: "partial", value: "163.116.234.50" },
  { num: 25, name: "DeviceID", available: "yes", value: "5BDCC9FE-F28F-41F1-…" },
  { num: 26, name: "Reason Code", available: "partial", value: "00" },
  { num: 27, name: "BioCatch muid", available: "partial", value: "1781021844002-A45BD437-…" },
  { num: 28, name: "ClientCode", available: "yes", value: "CC000000027082275" },
  { num: 29, name: "UserAgent", available: "yes", value: "Mozilla/5.0 (Windows NT 10.0…)" },
  { num: 30, name: "ID Evento", available: "yes", value: "0537d77f-76bd-496c-… (UUID)" },
  { num: 31, name: "IsMobileRat", available: "yes", value: "false" },
];

const estados = [
  { name: "MontoMasAltoFacturas", value: "$45,200", note: null },
  { name: "MontoMasAltoFondos", value: "$120,500", note: null },
  { name: "MontoMasAltoGlomo", value: "$8,300", note: null },
  { name: "MontoMasAltoNet", value: "$67,800", note: null },
  { name: "MontoMasAltoPSE", value: "$200,000", note: null },
  { name: "MontoMasAltoPrestamo", value: "$25,000,000", note: "A partir de 20M; bajo condición dg_creditoNuevo_10MM" },
  { name: "MontoMasAltoRetirosTarjeta", value: "$2,450", note: null },
];

const userFields: { field: string; available: "yes" | "partial" | "no"; value: string }[] = [
  { field: "Altamira", available: "yes", value: "10264559" },
  { field: "Documento", available: "yes", value: "CC000000027082275" },
  { field: "Celular", available: "partial", value: "0003108228674" },
  { field: "Nombre del cliente", available: "partial", value: "Ana Martínez" },
  { field: "Teléfono adicional", available: "no", value: "—" },
  { field: "Segmento", available: "no", value: "—" },
  { field: "Fecha de alta", available: "no", value: "—" },
  { field: "Correo", available: "no", value: "—" },
  { field: "Saldo", available: "partial", value: "$2,340 disponible" },
  { field: "Dirección", available: "partial", value: "Calle 100 #45-32, Bogotá" },
  { field: "Fecha de nacimiento", available: "partial", value: "1982-03-15" },
  { field: "Segmento empresa", available: "no", value: "—" },
];

const history30d = [3, 2, 5, 1, 4, 2, 3, 6, 2, 1, 3, 4, 2, 5, 3, 2, 4, 1, 2, 3, 5, 4, 2, 3, 1, 2, 4, 3, 2, 8];
const prevAlerts = [
  { id: "ALR-47120", date: "2026-05-21", result: "Falso positivo" },
  { id: "ALR-46004", date: "2026-04-18", result: "Auto-cerrada" },
  { id: "ALR-44872", date: "2026-03-02", result: "Falso positivo" },
];

/* ────────────── badge helpers ────────────── */

const availBadge = {
  yes: "bg-[#dcfce7] text-[#166534]",
  partial: "bg-[#fef3c7] text-[#92400e]",
  no: "bg-[#fee2e2] text-[#991b1b]",
};
const availLabel = { yes: "✓", partial: "⚠", no: "✗" };

/* ────────────── tab content ────────────── */

function ResumenTab() {
  return (
    <div className="max-w-[860px] space-y-6">
      <section>
        <h3 className="text-[12px] uppercase tracking-wider text-text-secondary mb-3">Señales de riesgo</h3>
        <div className="flex flex-wrap gap-2">
          {signals.map((s) => (
            <span key={s.name} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-medium ${
              s.weight >= 80 ? "bg-[#fee2e2] text-[#991b1b]" : s.weight >= 50 ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#f3f4f6] text-[#374151]"
            }`}>
              {s.flagged && <AlertTriangle className="h-3 w-3" />}
              {s.name}
              <span className="opacity-60 text-[11px]">{s.weight}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4">
        <section className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-[12px] uppercase tracking-wider text-text-secondary mb-3">Datos transacción</h3>
          <dl className="space-y-2">
            {[["ID", "TX-9981234"], ["Monto", "$ 2,450.00 USD"], ["Canal", "POS"],
              ["Comercio", "ElectroMax (BR)"], ["MCC", "5732"], ["Timestamp", "2026-06-09 02:17:43"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-[12px] text-text-secondary">{k}</dt>
                <dd className="text-[12px] font-medium text-text-primary text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-[12px] uppercase tracking-wider text-text-secondary mb-3">Datos usuario</h3>
          <dl className="space-y-2">
            {[["ID", "USR-***4821"], ["Segmento", "Premium"], ["Altamira", "10264559"],
              ["Documento", "CC000000027082275"], ["Nombre", "Ana Martínez"], ["Antigüedad", "~6 años"]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-[12px] text-text-secondary">{k}</dt>
                <dd className="text-[12px] font-medium text-text-primary text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-5">
        <h3 className="text-[12px] uppercase tracking-wider text-[#1e40af] mb-2">Recomendación del agente</h3>
        <p className="text-[13px] text-[#1e40af] leading-relaxed">
          Patrón consistente con <strong>fraude card-present en el exterior</strong>. Se recomienda confirmar fraude y proceder con bloqueo de tarjeta. Hipótesis principal: skimming en POS previo + uso en cadena retail de alto valor en Brasil. Confianza: <strong>92%</strong>.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <h3 className="text-[12px] uppercase tracking-wider text-text-secondary">Perfilamiento del agente</h3>
        {[
          {
            title: "Perfilamiento usuario",
            text: "Mujer, 44 años. Nombre: Ana Martínez. Cliente hace aproximadamente 6 años. Segmento Premium. Sin historial de fraude confirmado. Patrón de uso bancario estable, sin cambios recientes en datos de contacto o dispositivos.",
          },
          {
            title: "Perfilamiento transacción",
            text: "Transacción POS en São Paulo, Brasil, a las 02:17 h. Canal y dispositivo (Card-Present) consistentes con el perfil histórico. Sin embargo, horario fuera de ventana habitual (8:00–22:00) por más de 4 horas. Comercio no reconocido en historial de viajes. Monto 4.2× la media móvil de 30 días.",
          },
          {
            title: "Perfil transaccional",
            text: "Cliente que opera principalmente de lunes a viernes entre las 9:00 y las 21:00 h. Montos habituales: $50–$800 USD. Realiza entre 3 y 8 transacciones semanales. Nunca ha superado $1,500 USD en una sola operación. No registra compras card-present en el exterior ni en comercios de electrónica de alto valor.",
          },
        ].map((p) => (
          <div key={p.title} className="bg-surface border border-border rounded-lg px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-1.5">{p.title}</div>
            <p className="text-[13px] text-text-primary leading-relaxed">{p.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function RazonamientoTab() {
  const [openStage, setOpenStage] = useState<string | null>("adv");
  const [openCot, setOpenCot] = useState<string | null>(null);

  return (
    <div className="max-w-[860px] grid grid-cols-[55fr_45fr] gap-6">
      {/* Timeline */}
      <section className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-[14px] font-semibold text-text-primary mb-5">Línea de tiempo del ciclo</h2>
        <ol className="relative">
          {stages.map((s, i) => {
            const open = openStage === s.key;
            const isActive = s.status === "active";
            const isSkipped = s.status === "skipped";
            const cotOpen = openCot === s.key;
            return (
              <li key={s.key} className="relative pl-10 pb-5 last:pb-0">
                {i < stages.length - 1 && (
                  <span className="absolute left-[14px] top-7 bottom-0 w-px bg-border" />
                )}
                <button onClick={() => setOpenStage(open ? null : s.key)} className="w-full text-left">
                  <span className={`absolute left-0 top-0 h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 ${
                    isActive ? "border-primary bg-primary-light text-primary"
                      : isSkipped ? "border-border bg-surface text-text-secondary"
                      : "border-success bg-success text-white"
                  }`}>
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
                  <div className="mt-2">
                    <p className="text-[12px] text-text-secondary leading-relaxed">{s.description}</p>
                    <button
                      onClick={() => setOpenCot(cotOpen ? null : s.key)}
                      className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      Ver razonamiento interno
                      <ChevronDown className={`h-3 w-3 transition-transform ${cotOpen ? "rotate-180" : ""}`} />
                    </button>
                    {cotOpen && (
                      <pre className="mt-2 bg-[#0f172a] text-[#94a3b8] text-[11px] rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap font-mono">
                        {s.cot}
                      </pre>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {/* Signals */}
      <section className="bg-card rounded-xl border border-border p-6 self-start">
        <h2 className="text-[14px] font-semibold text-text-primary mb-5">Señales de riesgo</h2>
        <ul className="space-y-4">
          {signals.map((sig) => (
            <li key={sig.name}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-text-primary">{sig.name}</span>
                  {sig.flagged && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
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
  );
}

function DataAlertaTab() {
  return (
    <div className="max-w-[860px] bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full text-[12px]">
        <thead className="bg-surface">
          <tr className="text-[11px] uppercase tracking-wider text-text-secondary border-b border-border">
            <th className="text-left font-normal px-4 py-3 w-10">#</th>
            <th className="text-left font-normal py-3">Campo</th>
            <th className="text-center font-normal py-3 w-20">Estado</th>
            <th className="text-left font-normal py-3 pl-3">Valor</th>
          </tr>
        </thead>
        <tbody>
          {dataFields.map((f, i) => (
            <tr key={f.num} className={`border-b border-border/50 ${i % 2 === 1 ? "bg-surface/50" : ""}`}>
              <td className="px-4 py-2.5 text-text-secondary tabular-nums">{f.num}</td>
              <td className="py-2.5 text-text-primary font-medium">{f.name}</td>
              <td className="py-2.5 text-center">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold ${availBadge[f.available]}`}>
                  {availLabel[f.available]}
                </span>
              </td>
              <td className="py-2.5 pl-3 text-text-secondary font-mono truncate max-w-[260px]">{f.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstadosTab() {
  return (
    <div className="max-w-[600px] space-y-2">
      <p className="text-[12px] text-text-secondary mb-4">Montos históricos máximos por canal del cliente.</p>
      {estados.map((e) => (
        <div key={e.name} className="bg-card rounded-lg border border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-mono text-text-primary">{e.name}</span>
            <span className="text-[16px] font-bold text-primary tabular-nums">{e.value}</span>
          </div>
          {e.note && <p className="text-[11px] text-text-secondary mt-1">{e.note}</p>}
        </div>
      ))}
    </div>
  );
}

function UsuarioTab() {
  return (
    <div className="max-w-[600px] divide-y divide-border border border-border rounded-xl overflow-hidden">
      {userFields.map((f) => (
        <div key={f.field} className="flex items-center justify-between px-5 py-3 bg-card hover:bg-surface">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${availBadge[f.available]}`}>
              {availLabel[f.available]}
            </span>
            <span className="text-[13px] text-text-secondary">{f.field}</span>
          </div>
          <span className="text-[13px] font-medium text-text-primary tabular-nums">{f.value}</span>
        </div>
      ))}
    </div>
  );
}

function HistorialTab() {
  return (
    <div className="max-w-[860px] space-y-6">
      <section className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-[14px] font-semibold text-text-primary mb-1">Actividad últimos 30 días</h2>
        <p className="text-[11px] text-text-secondary mb-4">Transacciones del usuario</p>
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
        <div className="flex items-center gap-4 text-[11px] text-text-secondary">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary-light" /> Actividad</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-danger" /> Esta transacción</span>
        </div>
      </section>
      <section className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-[14px] font-semibold text-text-primary mb-4">Alertas previas</h2>
        <ul className="divide-y divide-border">
          {prevAlerts.map((a) => (
            <li key={a.id} className="py-3 flex items-center justify-between text-[13px]">
              <span className="font-mono text-text-primary">{a.id}</span>
              <span className="text-text-secondary">{a.date}</span>
              <span className="text-text-primary font-medium">{a.result}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ────────────── page ────────────── */

type ActionKind = "fraud" | "fp" | "dataset" | null;

function AlertaDetailPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<AlertTab>("resumen");
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [action, setAction] = useState<ActionKind>(null);

  useEffect(() => {
    const timer = setInterval(() => setLastRefresh(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <DashboardLayout>
      <div className="p-8 pb-24">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <nav className="flex items-center gap-1.5 text-[12px] text-text-secondary mb-2">
              <Link to="/cola" className="hover:text-primary">In Progress</Link>
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
            <div className="flex items-center gap-1.5 text-[11px] text-text-secondary tabular-nums border border-border rounded-md px-2 py-1">
              <button
                onClick={() => setLastRefresh(new Date())}
                className="hover:text-text-primary transition-colors"
                title="Actualizar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {lastRefresh.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-6">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "resumen" && <ResumenTab />}
        {tab === "razonamiento" && <RazonamientoTab />}
        {tab === "data" && <DataAlertaTab />}
        {tab === "estados" && <EstadosTab />}
        {tab === "usuario" && <UsuarioTab />}
        {tab === "historial" && <HistorialTab />}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-[220px] right-0 bg-card border-t border-border px-8 py-3 flex items-center justify-between gap-3 z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2">
          <button onClick={() => setAction("fraud")}
            className="h-9 px-4 rounded-md bg-danger text-white text-[13px] font-medium hover:opacity-90">
            Confirmar fraude
          </button>
          <button onClick={() => setAction("fp")}
            className="h-9 px-4 rounded-md bg-success text-white text-[13px] font-medium hover:opacity-90">
            Falso positivo
          </button>
          <button onClick={() => setAction("dataset")}
            className="h-9 px-4 rounded-md border border-primary text-primary text-[13px] font-medium hover:bg-primary-light inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" /> Al dataset
          </button>
        </div>
        <a href="#"
          className="inline-flex items-center gap-2 h-9 px-5 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 transition-opacity">
          <ExternalLink className="h-3.5 w-3.5" />
          Ver en ARIC
        </a>
      </div>

      {action && <ActionModal action={action} alertId={id} onClose={() => setAction(null)} />}
    </DashboardLayout>
  );
}

/* ── Action modal ─────────────────────────────────────── */

const ACTION_META: Record<NonNullable<ActionKind>, { title: string; cta: string; tone: string }> = {
  fraud:   { title: "Confirmar fraude",                   cta: "Confirmar fraude", tone: "bg-danger" },
  fp:      { title: "Marcar como falso positivo",         cta: "Marcar FP",        tone: "bg-success" },
  dataset: { title: "Agregar al dataset de entrenamiento", cta: "Agregar",          tone: "bg-primary" },
};

function ActionModal({ action, alertId, onClose }: { action: NonNullable<ActionKind>; alertId: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const meta = ACTION_META[action];
  const disabled = text.trim().length < 20;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-xl border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-[15px] font-bold text-text-primary">{meta.title}</div>
            <div className="text-[12px] text-text-secondary mt-0.5">Alerta {alertId}</div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">
          <label className="text-[11px] uppercase tracking-wider text-text-secondary">
            Justificación <span className="text-danger normal-case tracking-normal">(mín. 20 caracteres)</span>
          </label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={4}
            placeholder="Describe brevemente la evidencia y el criterio aplicado…"
            className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="mt-1 flex justify-between text-[11px] text-text-secondary tabular-nums">
            <span>{text.trim().length} / 20 mínimo</span>
            <span>{text.length} / 500</span>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-text-primary hover:bg-surface">Cancelar</button>
          <button disabled={disabled} onClick={onClose}
            className={`h-9 px-4 rounded-lg text-white text-[13px] font-medium transition-opacity ${meta.tone} ${disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-90"}`}>
            {meta.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
