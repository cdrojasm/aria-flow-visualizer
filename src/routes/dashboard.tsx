import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronRight } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · ARIA" },
      { name: "description", content: "Dashboard operacional ARIA — monitoreo en tiempo real de alertas, agente y SLA." },
    ],
  }),
  component: DashboardPage,
});

type Trend = "up" | "down";
const stats: { value: number; label: string; trend: Trend; delta: string }[] = [
  { value: 142, label: "Alertas activas", trend: "up", delta: "+8%" },
  { value: 36, label: "En evaluación por agente", trend: "up", delta: "+3%" },
  { value: 12, label: "Esperando analista", trend: "down", delta: "-15%" },
  { value: 287, label: "Resueltas este turno", trend: "up", delta: "+22%" },
];

const funnel = [
  { name: "Entrada ARIC", count: 412, warn: false },
  { name: "Clasificación ARIC", count: 268, warn: false },
  { name: "Evaluación Agente", count: 96, warn: true },
  { name: "Executor", count: 41, warn: false },
  { name: "Analista", count: 12, warn: false },
];

const slaRows = [
  { id: "ALR-48201", stage: "Evaluación Agente", elapsed: "07:42", pct: 92, level: "danger" as const },
  { id: "ALR-48198", stage: "Analista", elapsed: "06:15", pct: 78, level: "warning" as const },
  { id: "ALR-48190", stage: "Executor", elapsed: "05:03", pct: 65, level: "warning" as const },
  { id: "ALR-48177", stage: "Analista", elapsed: "04:48", pct: 58, level: "warning" as const },
  { id: "ALR-48165", stage: "Evaluación Agente", elapsed: "03:21", pct: 42, level: "success" as const },
  { id: "ALR-48150", stage: "Executor", elapsed: "02:58", pct: 36, level: "success" as const },
];

const taxonomyColors: Record<string, string> = {
  "Fraude tarjeta": "bg-[#fee2e2] text-[#991b1b]",
  "Lavado": "bg-[#fef3c7] text-[#92400e]",
  "Phishing": "bg-[#ede9fe] text-[#5b21b6]",
  "Identidad": "bg-[#dbeafe] text-[#1e40af]",
  "Cuenta mula": "bg-[#fce7f3] text-[#9d174d]",
};

const verdicts: Record<string, string> = {
  "Auto-resuelto": "bg-[#dcfce7] text-[#166534]",
  "Derivado a analista": "bg-primary-light text-primary",
  "Sospechoso re-evaluado": "bg-[#fef3c7] text-[#92400e]",
};

const activity = Array.from({ length: 14 }).map((_, i) => {
  const samples = [
    { type: "Fraude tarjeta", verdict: "Auto-resuelto", agent: "Sub-agente FRAUD-01" },
    { type: "Phishing", verdict: "Derivado a analista", agent: "Sub-agente PHISH-02" },
    { type: "Lavado", verdict: "Sospechoso re-evaluado", agent: "Sub-agente AML-03" },
    { type: "Identidad", verdict: "Auto-resuelto", agent: "Sub-agente IDV-01" },
    { type: "Cuenta mula", verdict: "Derivado a analista", agent: "Sub-agente MULE-02" },
  ];
  const s = samples[i % samples.length];
  const minutes = i * 3 + 2;
  return {
    id: `ALR-${48210 - i}`,
    time: `Hace ${minutes} min`,
    ...s,
  };
});

function StatCard({ value, label, trend, delta }: typeof stats[number]) {
  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-[32px] font-bold leading-none text-primary tabular-nums">{value}</span>
        <span className={`flex items-center gap-1 text-[12px] font-medium ${trend === "up" ? "text-success" : "text-danger"}`}>
          {trend === "up" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {delta}
        </span>
      </div>
      <div className="mt-3 text-[13px] text-text-secondary">{label}</div>
    </div>
  );
}

function FunnelStage({ stage, idx, total }: { stage: typeof funnel[number]; idx: number; total: number }) {
  const heightPct = 100 - (idx / total) * 35;
  return (
    <div className="flex items-center flex-1 min-w-0">
      <div
        className={`flex-1 rounded-lg flex flex-col items-center justify-center px-3 transition-colors ${
          stage.warn ? "bg-[#fef3c7] border border-[#fde68a]" : "bg-primary-light border border-transparent"
        }`}
        style={{ height: `${heightPct * 1.4}px` }}
      >
        <span className={`text-[11px] uppercase tracking-wider mb-1 ${stage.warn ? "text-[#92400e]" : "text-primary/70"}`}>
          {stage.name}
        </span>
        <span className={`text-[28px] font-bold tabular-nums ${stage.warn ? "text-[#92400e]" : "text-primary"}`}>
          {stage.count}
        </span>
      </div>
      {idx < total - 1 && <ChevronRight className="h-5 w-5 mx-1 text-border shrink-0" />}
    </div>
  );
}

function SlaBar({ pct, level }: { pct: number; level: "success" | "warning" | "danger" }) {
  const color = level === "danger" ? "bg-danger" : level === "warning" ? "bg-warning" : "bg-success";
  return (
    <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DashboardPage() {
  const [shift, setShift] = useState<"current" | "8h" | "24h">("current");
  const shifts: { id: typeof shift; label: string }[] = [
    { id: "current", label: "Turno actual" },
    { id: "8h", label: "Últimas 8h" },
    { id: "24h", label: "Últimas 24h" },
  ];

  return (
    <DashboardLayout>
      <div className="px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[20px] font-bold text-text-primary">Dashboard</h1>
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {shifts.map((s) => (
              <button
                key={s.id}
                onClick={() => setShift(s.id)}
                className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-colors ${
                  shift === s.id ? "bg-primary text-primary-foreground" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((s) => <StatCard key={s.label} {...s} />)}
        </div>

        {/* Funnel + SLA panel */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
          <section className="xl:col-span-2 bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[14px] font-semibold text-text-primary">Embudo en tiempo real</h2>
              <span className="text-[11px] uppercase tracking-wider text-text-secondary">Live</span>
            </div>
            <div className="flex items-center">
              {funnel.map((stage, idx) => (
                <FunnelStage key={stage.name} stage={stage} idx={idx} total={funnel.length} />
              ))}
            </div>
          </section>

          <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <h2 className="text-[14px] font-semibold text-text-primary mb-4">SLA en riesgo</h2>
            {slaRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="h-10 w-10 text-success mb-3" />
                <p className="text-[13px] text-text-secondary">Sin alertas en riesgo de SLA</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {slaRows.map((row) => (
                  <li key={row.id}>
                    <button className="w-full text-left py-3 hover:bg-surface rounded-md px-2 -mx-2 transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-medium text-text-primary tabular-nums">{row.id}</span>
                        <span className="text-[11px] text-text-secondary tabular-nums">{row.elapsed}</span>
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">{row.stage}</div>
                      <SlaBar pct={row.pct} level={row.level} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Activity feed */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Actividad reciente del agente</h2>
          </div>
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary">
                  <th className="text-left font-normal px-5 py-3 w-[140px]">Timestamp</th>
                  <th className="text-left font-normal py-3 w-[120px]">Alerta</th>
                  <th className="text-left font-normal py-3">Tipo</th>
                  <th className="text-left font-normal py-3">Veredicto</th>
                  <th className="text-left font-normal px-5 py-3">Sub-agente</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row, i) => (
                  <tr key={row.id} className={`border-t border-border ${i % 2 === 1 ? "bg-surface" : "bg-card"}`}>
                    <td className="px-5 py-3 text-[12px] text-text-secondary tabular-nums">{row.time}</td>
                    <td className="py-3 text-[13px] font-medium text-text-primary tabular-nums">{row.id}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${taxonomyColors[row.type]}`}>
                        {row.type}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${verdicts[row.verdict]}`}>
                        {row.verdict}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[12px] text-text-secondary">{row.agent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-border flex justify-between items-center">
            <span className="text-[11px] text-text-secondary">Mostrando 14 de 20</span>
            <button className="text-[12px] font-medium text-primary hover:underline">Cargar más</button>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
