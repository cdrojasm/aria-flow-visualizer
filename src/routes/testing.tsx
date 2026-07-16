import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Play, Square, CheckCircle2, AlertTriangle, Database, Layers, Clock,
  ChevronDown, ChevronRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/testing")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Ejecuta pruebas del agente ARIA sobre datasets controlados." },
    ],
  }),
  component: TestingPage,
});

/* ─── Types ──────────────────────────────────────────── */

type AgentConfig = { id: string; name: string; description: string; env: "production" | "staging" | "canary" };
type Dataset = { id: string; name: string; description: string; categories: number; records: number };
type AlertEntry = { id: string; amount: string; date: string; channel: string; country: string; account: string; client: string; status: "confirmed" | "suspected" | "false_positive" };
type AlertGroup = { classification: string; code: string; alerts: AlertEntry[] };
type TestRun = { id: string; date: string; dataset: string; config: string; duration: string; processed: number; total: number; failed: number; fraudeNoDetectado: string; falsosPositivos: string; tiempoAhorrado: string; latencia: string };
type ExecState = "idle" | "running" | "done";

/* ─── Static data ────────────────────────────────────── */

const CONFIGS: AgentConfig[] = [
  { id: "cfg-prod", name: "Producción", description: "Agente activo con umbrales estrictos y todas las taxonomías habilitadas.", env: "production" },
  { id: "cfg-staging", name: "Staging", description: "Ambiente de pruebas con taxonomías experimentales y umbral relajado.", env: "staging" },
  { id: "cfg-canary", name: "Canario 2%", description: "Despliegue progresivo al 2% del tráfico real para validación.", env: "canary" },
];

const ENV_STYLES: Record<AgentConfig["env"], string> = {
  production: "bg-success/10 text-success border-success/30",
  staging: "bg-warning/10 text-warning border-warning/30",
  canary: "bg-primary/10 text-primary border-primary/30",
};

const DATASETS: Dataset[] = [
  { id: "ds-1", name: "Producción Q1 2025", description: "Muestra representativa del tráfico real del primer trimestre.", categories: 5, records: 340 },
  { id: "ds-2", name: "Sintético Balanceado", description: "Dataset generado con distribución uniforme por categoría de fraude.", categories: 5, records: 150 },
  { id: "ds-3", name: "Casos Críticos 2024", description: "Alertas de alta severidad confirmadas como fraude en 2024.", categories: 3, records: 87 },
];

const DATASET_GROUPS: Record<string, AlertGroup[]> = {
  "ds-1": [
    { classification: "Fraude con tarjeta", code: "FRD-CARD", alerts: [
      { id: "ALR-48001", amount: "$2,340", date: "2025-03-15", channel: "App Móvil", country: "Colombia", account: "****4521", client: "Ana Martínez", status: "confirmed" },
      { id: "ALR-48002", amount: "$890", date: "2025-03-14", channel: "Web", country: "México", account: "****8834", client: "Carlos Ríos", status: "suspected" },
      { id: "ALR-48007", amount: "$5,200", date: "2025-03-13", channel: "ATM", country: "Colombia", account: "****2210", client: "Laura Peña", status: "confirmed" },
    ]},
    { classification: "Phishing", code: "PHISH", alerts: [
      { id: "ALR-48003", amount: "$140", date: "2025-03-15", channel: "Email", country: "Colombia", account: "****3309", client: "Jorge Ruiz", status: "suspected" },
      { id: "ALR-48009", amount: "$300", date: "2025-03-12", channel: "SMS", country: "Colombia", account: "****7701", client: "María López", status: "false_positive" },
    ]},
    { classification: "Lavado de activos", code: "AML", alerts: [
      { id: "ALR-48005", amount: "$18,500", date: "2025-03-14", channel: "Transferencia", country: "Panamá", account: "****9921", client: "Roberto Díaz", status: "confirmed" },
      { id: "ALR-48011", amount: "$7,200", date: "2025-03-13", channel: "Transferencia", country: "Colombia", account: "****0042", client: "Sandra Torres", status: "suspected" },
    ]},
    { classification: "Robo de identidad", code: "ID-THEFT", alerts: [
      { id: "ALR-48004", amount: "—", date: "2025-03-15", channel: "Sucursal", country: "Colombia", account: "****6650", client: "Felipe Castro", status: "confirmed" },
    ]},
    { classification: "Cuenta mula", code: "MULE", alerts: [
      { id: "ALR-48006", amount: "$3,100", date: "2025-03-14", channel: "App Móvil", country: "Colombia", account: "****1123", client: "Diana Vargas", status: "suspected" },
      { id: "ALR-48008", amount: "$950", date: "2025-03-13", channel: "Web", country: "Colombia", account: "****8890", client: "Andrés Mora", status: "suspected" },
    ]},
  ],
  "ds-2": [
    { classification: "Fraude con tarjeta", code: "FRD-CARD", alerts: [
      { id: "SYN-001", amount: "$1,200", date: "2025-01-10", channel: "App Móvil", country: "Colombia", account: "****0011", client: "Sintético A", status: "confirmed" },
      { id: "SYN-002", amount: "$670", date: "2025-01-11", channel: "Web", country: "Colombia", account: "****0022", client: "Sintético B", status: "false_positive" },
    ]},
    { classification: "Phishing", code: "PHISH", alerts: [
      { id: "SYN-010", amount: "$200", date: "2025-01-12", channel: "Email", country: "Colombia", account: "****0033", client: "Sintético C", status: "suspected" },
    ]},
    { classification: "Lavado de activos", code: "AML", alerts: [
      { id: "SYN-020", amount: "$9,400", date: "2025-01-13", channel: "Transferencia", country: "Venezuela", account: "****0044", client: "Sintético D", status: "confirmed" },
    ]},
  ],
  "ds-3": [
    { classification: "Lavado de activos", code: "AML", alerts: [
      { id: "CRT-001", amount: "$45,000", date: "2024-11-03", channel: "Transferencia", country: "Islas Caimán", account: "****5501", client: "Caso crítico 1", status: "confirmed" },
      { id: "CRT-002", amount: "$32,000", date: "2024-09-17", channel: "Transferencia", country: "Panamá", account: "****7712", client: "Caso crítico 2", status: "confirmed" },
    ]},
    { classification: "Robo de identidad", code: "ID-THEFT", alerts: [
      { id: "CRT-010", amount: "—", date: "2024-08-22", channel: "Sucursal", country: "Colombia", account: "****3390", client: "Caso crítico 3", status: "confirmed" },
    ]},
    { classification: "Fraude con tarjeta", code: "FRD-CARD", alerts: [
      { id: "CRT-020", amount: "$8,900", date: "2024-07-14", channel: "ATM", country: "Ecuador", account: "****1102", client: "Caso crítico 4", status: "confirmed" },
    ]},
  ],
};

const LAST_RUNS: TestRun[] = [
  { id: "run-001", date: "2025-06-28 14:32", dataset: "Producción Q1 2025", config: "Staging", duration: "4m 12s", processed: 338, total: 340, failed: 2, fraudeNoDetectado: "1.8%", falsosPositivos: "9.2%", tiempoAhorrado: "11.4 h", latencia: "924 ms" },
  { id: "run-002", date: "2025-06-25 09:15", dataset: "Sintético Balanceado", config: "Canario 2%", duration: "2m 31s", processed: 148, total: 150, failed: 2, fraudeNoDetectado: "3.4%", falsosPositivos: "12.1%", tiempoAhorrado: "6.2 h", latencia: "1,102 ms" },
  { id: "run-003", date: "2025-06-20 16:44", dataset: "Casos Críticos 2024", config: "Producción", duration: "1m 08s", processed: 87, total: 87, failed: 0, fraudeNoDetectado: "0.0%", falsosPositivos: "4.6%", tiempoAhorrado: "2.8 h", latencia: "812 ms" },
];

const ALERT_STATUS: Record<AlertEntry["status"], { label: string; cls: string }> = {
  confirmed:      { label: "Confirmado",     cls: "bg-success/10 text-success" },
  suspected:      { label: "Sospechoso",     cls: "bg-warning/10 text-warning" },
  false_positive: { label: "Falso positivo", cls: "bg-danger/10 text-danger" },
};

/* ─── Page ───────────────────────────────────────────── */

function TestingPage() {
  const [selectedConfig, setSelectedConfig] = useState("cfg-staging");
  const [selectedDataset, setSelectedDataset] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedAlerts, setExpandedAlerts] = useState<Set<string>>(new Set());
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [execState, setExecState] = useState<ExecState>("idle");
  const [execStats, setExecStats] = useState({ processed: 0, pending: 0, failed: 0, instances: 4 });

  useEffect(() => {
    if (execState !== "running") return;
    const total = DATASETS.find((d) => d.id === selectedDataset)?.records ?? 100;
    const iv = setInterval(() => {
      setExecStats((prev) => {
        const addFail = Math.random() < 0.04 ? 1 : 0;
        const addOk = Math.min(Math.floor(Math.random() * 8) + 3, total - prev.processed - prev.failed - addFail);
        const newProcessed = prev.processed + addOk;
        const newFailed = prev.failed + addFail;
        const newPending = total - newProcessed - newFailed;
        if (newPending <= 0) {
          setExecState("done");
          clearInterval(iv);
          return { ...prev, processed: total - newFailed, pending: 0, failed: newFailed };
        }
        return { ...prev, processed: newProcessed, pending: newPending, failed: newFailed };
      });
    }, 220);
    return () => clearInterval(iv);
  }, [execState, selectedDataset]);

  const startExec = () => {
    const total = DATASETS.find((d) => d.id === selectedDataset)?.records ?? 100;
    setExecStats({ processed: 0, pending: total, failed: 0, instances: 4 });
    setExecState("running");
  };
  const stopExec = () => setExecState("idle");
  const resetExec = () => { setExecState("idle"); setExecStats({ processed: 0, pending: 0, failed: 0, instances: 4 }); };

  const toggleGroup = (code: string) => setExpandedGroups((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const toggleAlert = (id: string) => setExpandedAlerts((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleRun = (id: string) => setExpandedRuns((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const groups = selectedDataset ? (DATASET_GROUPS[selectedDataset] ?? []) : [];
  const total = DATASETS.find((d) => d.id === selectedDataset)?.records ?? 0;

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-text-primary">Testing del Agente</h1>
            <p className="text-[13px] text-text-secondary mt-1">Ejecuta pruebas sobre datasets controlados y analiza el comportamiento del agente.</p>
          </div>
          {execState === "idle" && (
            <button onClick={startExec} disabled={!selectedDataset}
              className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
              <Play className="h-3.5 w-3.5" /> Iniciar prueba
            </button>
          )}
          {execState === "running" && (
            <button onClick={stopExec} className="inline-flex items-center gap-2 bg-danger text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-danger/90">
              <Square className="h-3.5 w-3.5" /> Detener
            </button>
          )}
          {execState === "done" && (
            <button onClick={resetExec} className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-md text-[13px] text-text-primary hover:bg-surface">
              Reiniciar
            </button>
          )}
        </header>

        {/* Config selector */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Configuración a evaluar</h2>
          <div className="flex gap-3 flex-wrap">
            {CONFIGS.map((cfg) => {
              const active = selectedConfig === cfg.id;
              return (
                <button key={cfg.id} onClick={() => setSelectedConfig(cfg.id)}
                  className={`relative flex-1 min-w-[200px] text-left rounded-lg border px-4 py-3.5 transition-all ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-background hover:border-primary/40 hover:bg-surface"}`}>
                  {active && <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-primary" />}
                  <div className="flex items-center gap-2 mb-1 pr-6">
                    <span className="text-[13px] font-semibold text-text-primary">{cfg.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ENV_STYLES[cfg.env]}`}>{cfg.env}</span>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">{cfg.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Dataset selector */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Dataset</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {DATASETS.map((ds) => {
              const active = selectedDataset === ds.id;
              return (
                <button key={ds.id} onClick={() => { setSelectedDataset(ds.id); resetExec(); }}
                  className={`text-left rounded-lg border px-4 py-3.5 transition-all ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40 hover:bg-surface"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-[13px] font-semibold text-text-primary">{ds.name}</span>
                    </div>
                    {active && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  <p className="text-[11px] text-text-secondary mb-3 leading-relaxed">{ds.description}</p>
                  <div className="flex items-center gap-3 text-[11px] text-text-secondary">
                    <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> {ds.categories} categorías</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {ds.records.toLocaleString()} registros</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Dataset viewer */}
        {selectedDataset && groups.length > 0 && (
          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-[14px] font-semibold text-text-primary">Vista del dataset</h2>
              <span className="text-[11px] text-text-secondary">Muestra representativa · {groups.reduce((s, g) => s + g.alerts.length, 0)} alertas de {total.toLocaleString()}</span>
            </div>
            <div className="divide-y divide-border">
              {groups.map((g) => {
                const gOpen = expandedGroups.has(g.code);
                return (
                  <div key={g.code}>
                    <button onClick={() => toggleGroup(g.code)} className="w-full flex items-center justify-between px-5 py-3 bg-surface hover:bg-border/20 text-left">
                      <div className="flex items-center gap-3">
                        {gOpen ? <ChevronDown className="h-3.5 w-3.5 text-text-secondary" /> : <ChevronRight className="h-3.5 w-3.5 text-text-secondary" />}
                        <span className="text-[13px] font-semibold text-text-primary">{g.classification}</span>
                        <span className="font-mono text-[11px] text-text-secondary">{g.code}</span>
                      </div>
                      <span className="text-[11px] text-text-secondary">{g.alerts.length} alertas</span>
                    </button>
                    {gOpen && (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-text-secondary border-t border-border">
                            <th className="text-left font-medium px-12 py-2 w-8"></th>
                            <th className="text-left font-medium px-3 py-2">ID</th>
                            <th className="text-left font-medium px-3 py-2">Cliente</th>
                            <th className="text-left font-medium px-3 py-2">Monto</th>
                            <th className="text-left font-medium px-3 py-2">Canal</th>
                            <th className="text-left font-medium px-3 py-2">Fecha</th>
                            <th className="text-left font-medium px-3 py-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.alerts.map((a) => {
                            const aOpen = expandedAlerts.has(a.id);
                            const st = ALERT_STATUS[a.status];
                            return (
                              <>
                                <tr key={a.id} onClick={() => toggleAlert(a.id)} className="border-t border-border hover:bg-surface cursor-pointer">
                                  <td className="px-12 py-2.5 text-text-secondary">
                                    {aOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                  </td>
                                  <td className="px-3 py-2.5 font-mono text-text-primary">{a.id}</td>
                                  <td className="px-3 py-2.5 text-text-primary">{a.client}</td>
                                  <td className="px-3 py-2.5 text-text-primary font-medium">{a.amount}</td>
                                  <td className="px-3 py-2.5 text-text-secondary">{a.channel}</td>
                                  <td className="px-3 py-2.5 text-text-secondary tabular-nums">{a.date}</td>
                                  <td className="px-3 py-2.5">
                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                                  </td>
                                </tr>
                                {aOpen && (
                                  <tr className="border-t border-border bg-surface">
                                    <td colSpan={7} className="px-12 py-4">
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
                                        {([
                                          ["ID alerta", a.id], ["Cliente", a.client], ["Cuenta", a.account],
                                          ["Monto", a.amount], ["Canal", a.channel], ["País", a.country],
                                          ["Fecha", a.date], ["Clasificación", g.classification],
                                        ] as [string, string][]).map(([k, v]) => (
                                          <div key={k}>
                                            <span className="text-[11px] text-text-secondary">{k}</span>
                                            <p className="text-[12px] font-medium text-text-primary">{v}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Execution visualizer */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Ejecución</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Estado en tiempo real de la prueba.</p>
          </div>
          <div className="p-5">
            {execState === "idle" && (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-text-secondary text-[13px]">
                {selectedDataset ? 'Listo para ejecutar. Haz clic en "Iniciar prueba".' : "Selecciona un dataset para habilitar la ejecución."}
              </div>
            )}
            {(execState === "running" || execState === "done") && (
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                  <span className="text-[12px] font-medium text-text-secondary">Instancias corriendo</span>
                  <div className="flex items-center gap-1.5">
                    {Array.from({ length: execStats.instances }).map((_, i) => (
                      <span key={i} className={`h-2.5 w-2.5 rounded-full ${execState === "running" ? "bg-primary animate-pulse" : "bg-success"}`} style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                  <span className="text-[12px] font-semibold text-text-primary">{execStats.instances}</span>
                  {execState === "done" && <span className="ml-auto text-[11px] text-success font-semibold">Completado</span>}
                </div>
                <div className="grid grid-cols-3 divide-x divide-border">
                  {[
                    { label: "Procesadas", value: execStats.processed, tone: "text-success" },
                    { label: "Pendientes", value: execStats.pending, tone: "text-primary" },
                    { label: "Fallos", value: execStats.failed, tone: execStats.failed > 0 ? "text-danger" : "text-text-secondary" },
                  ].map(({ label, value, tone }) => (
                    <div key={label} className="px-5 py-5 text-center">
                      <p className="text-[11px] text-text-secondary mb-1">{label}</p>
                      <p className={`text-[32px] font-bold leading-none ${tone}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="px-5 pb-5 pt-2">
                  <div className="h-2 bg-surface rounded-full overflow-hidden border border-border">
                    <div className="h-full bg-primary rounded-full transition-all duration-200"
                      style={{ width: `${total > 0 ? ((execStats.processed + execStats.failed) / total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1.5 text-right">
                    {total > 0 ? Math.round(((execStats.processed + execStats.failed) / total) * 100) : 0}% completado
                  </p>
                </div>
                {execState === "done" && (
                  <div className="border-t border-border px-5 py-5 bg-success/5">
                    <p className="text-[12px] font-semibold text-text-primary mb-4">Resumen de ejecución</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Total procesadas", value: `${execStats.processed} / ${total}` },
                        { label: "Tasa de fallo", value: `${total > 0 ? ((execStats.failed / total) * 100).toFixed(1) : 0}%` },
                        { label: "Tasa de éxito", value: `${total > 0 ? ((execStats.processed / total) * 100).toFixed(1) : 0}%` },
                        { label: "Instancias usadas", value: String(execStats.instances) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-[11px] text-text-secondary">{label}</p>
                          <p className="text-[15px] font-semibold text-text-primary">{value}</p>
                        </div>
                      ))}
                    </div>
                    {execStats.failed > 0 && (
                      <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/30">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
                        <p className="text-[11px] text-warning">{execStats.failed} alerta(s) fallaron durante el procesamiento. Revisa los logs del agente.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Last runs */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Últimas pruebas</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Historial de ejecuciones anteriores.</p>
          </div>
          <div className="divide-y divide-border">
            {LAST_RUNS.map((run) => {
              const open = expandedRuns.has(run.id);
              const ok = run.failed === 0;
              return (
                <div key={run.id}>
                  <button onClick={() => toggleRun(run.id)} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-surface text-left">
                    {open ? <ChevronDown className="h-3.5 w-3.5 text-text-secondary shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-text-secondary shrink-0" />}
                    <span className="text-[12px] tabular-nums text-text-secondary w-36 shrink-0">{run.date}</span>
                    <span className="text-[13px] font-medium text-text-primary flex-1">{run.dataset}</span>
                    <span className="text-[11px] text-text-secondary w-24">{run.config}</span>
                    <span className="text-[11px] text-text-secondary w-16 text-right">{run.duration}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ml-2 ${ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                      {ok ? "OK" : `${run.failed} fallo(s)`}
                    </span>
                  </button>
                  {open && (
                    <div className="px-14 py-5 bg-surface border-t border-border grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "Procesadas",           value: `${run.processed} / ${run.total}` },
                        { label: "Latencia promedio",    value: run.latencia },
                        { label: "Fraude no detectado",  value: run.fraudeNoDetectado },
                        { label: "Falsos positivos",     value: run.falsosPositivos },
                        { label: "Tiempo ahorrado",      value: run.tiempoAhorrado },
                        { label: "Configuración",        value: run.config },
                        { label: "Duración",             value: run.duration },
                        { label: "Fallos",               value: String(run.failed) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-[11px] text-text-secondary">{label}</p>
                          <p className="text-[13px] font-semibold text-text-primary">{value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
