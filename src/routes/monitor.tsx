import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle, TrendingDown, TrendingUp,
  CheckCircle2, Brain, Zap, ShieldAlert, Users, Bot,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/monitor")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Telemetría y log de decisiones del agente ARIA." },
    ],
  }),
  component: MonitorPage,
});

// ─── Config data ────────────────────────────────────────────────────────────

type AgentConfig = {
  id: string;
  name: string;
  description: string;
  env: "production" | "staging" | "canary";
};

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

// ─── KPI data per config ─────────────────────────────────────────────────────

type ConfigKPIs = {
  latencia: string;
  errores: string;
  avgTokens: string;
  fraudeNoDetectado: string;
  falsosPositivos: string;
  procesados: string;
  fallos: string;
  disponibilidad: string;
  caidas: number;
  alucinaciones: string;
  usoCorrectoData: string;
  recAceptadas: number;
  recIgnoradas: number;
  tiempoAhorrado: string;
  casosHumano: number;
  casosAI: number;
};

const KPIS: Record<string, ConfigKPIs> = {
  "cfg-prod": {
    latencia: "842 ms", errores: "6.4%", avgTokens: "2,340",
    fraudeNoDetectado: "1.2%", falsosPositivos: "8.7%",
    procesados: "97.3%", fallos: "2.7%",
    disponibilidad: "99.1%", caidas: 2,
    alucinaciones: "0.3%", usoCorrectoData: "98.7%",
    recAceptadas: 73, recIgnoradas: 27,
    tiempoAhorrado: "14.2 h", casosHumano: 48, casosAI: 312,
  },
  "cfg-staging": {
    latencia: "1,120 ms", errores: "11.2%", avgTokens: "3,810",
    fraudeNoDetectado: "3.1%", falsosPositivos: "14.5%",
    procesados: "88.9%", fallos: "11.1%",
    disponibilidad: "97.4%", caidas: 7,
    alucinaciones: "2.1%", usoCorrectoData: "91.4%",
    recAceptadas: 58, recIgnoradas: 42,
    tiempoAhorrado: "8.6 h", casosHumano: 61, casosAI: 188,
  },
  "cfg-canary": {
    latencia: "910 ms", errores: "7.8%", avgTokens: "2,650",
    fraudeNoDetectado: "1.9%", falsosPositivos: "10.2%",
    procesados: "92.1%", fallos: "7.9%",
    disponibilidad: "98.5%", caidas: 3,
    alucinaciones: "0.8%", usoCorrectoData: "96.2%",
    recAceptadas: 68, recIgnoradas: 32,
    tiempoAhorrado: "11.4 h", casosHumano: 54, casosAI: 247,
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

function MonitorPage() {
  const agentStatus: "ok" | "degraded" = "degraded";
  const [selectedConfig, setSelectedConfig] = useState<string>("cfg-prod");

  const kpi = KPIS[selectedConfig];

  return (
    <DashboardLayout>
      <div className="p-8 max-w-[1400px] space-y-6">
        {agentStatus === "degraded" && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div className="text-[13px] text-text-primary">
              <span className="font-semibold">Agente degradado.</span> Latencia de enriquecimiento por encima del umbral y un sub-agente reportando timeouts intermitentes.
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-4">
          <h1 className="text-[20px] font-semibold text-text-primary">Monitor del Agente</h1>
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-warning/10 text-warning text-[12px] font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-warning opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
            </span>
            Degradado
          </span>
        </div>

        {/* ── Config selector ────────────────────────────────────────────── */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <h2 className="text-[13px] font-semibold text-text-primary mb-3 uppercase tracking-wider">Configuración activa</h2>
          <div className="flex gap-3 flex-wrap">
            {CONFIGS.map((cfg) => {
              const active = selectedConfig === cfg.id;
              return (
                <button
                  key={cfg.id}
                  onClick={() => setSelectedConfig(cfg.id)}
                  className={`relative flex-1 min-w-[200px] text-left rounded-lg border px-4 py-3.5 transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-background hover:border-primary/40 hover:bg-surface"
                  }`}
                >
                  {active && (
                    <span className="absolute top-3 right-3">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    </span>
                  )}
                  <div className="flex items-center gap-2 mb-1 pr-6">
                    <span className="text-[13px] font-semibold text-text-primary">{cfg.name}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ENV_STYLES[cfg.env]}`}>
                      {cfg.env}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">{cfg.description}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── KPIs operativos ───────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="text-[13px] font-semibold text-text-primary uppercase tracking-wider">Indicadores operativos</h2>
          <div className="grid grid-cols-4 gap-4">
            <KpiCard label="Latencia promedio" value={kpi.latencia} tone="warning" trend="up" delta="+18% vs 1h" icon={<Zap className="h-4 w-4" />} />
            <KpiCard label="Errores de ejecución" value={kpi.errores} tone="danger" trend="up" delta="umbral 4%" icon={<AlertTriangle className="h-4 w-4" />} />
            <KpiCard label="Avg token usage" value={kpi.avgTokens} unit="tok" tone="primary" trend="down" delta="-120 vs turno previo" icon={<Brain className="h-4 w-4" />} />
            <KpiCard label="Fraude no detectado" value={kpi.fraudeNoDetectado} tone="danger" trend="down" delta="-0.2pp vs ayer" icon={<ShieldAlert className="h-4 w-4" />} />
            <KpiCard label="Falsos positivos" value={kpi.falsosPositivos} tone="warning" trend="up" delta="+1.1pp vs ayer" icon={<AlertTriangle className="h-4 w-4" />} />
            <KpiCard label="Procesados" value={kpi.procesados} tone="primary" trend="up" delta="sobre total" icon={<CheckCircle2 className="h-4 w-4" />} />
            <KpiCard label="Fallos" value={kpi.fallos} tone="danger" trend="up" delta="sobre total" icon={<AlertTriangle className="h-4 w-4" />} />
            <KpiCard label="Disponibilidad" value={kpi.disponibilidad} tone="primary" trend="down" delta={`${kpi.caidas} caída(s) hoy`} icon={<CheckCircle2 className="h-4 w-4" />} />
          </div>

          {/* Explicabilidad subsection */}
          <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-4 w-4 text-primary" />
              <h3 className="text-[13px] font-semibold text-text-primary">Explicabilidad</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ExplainCard
                label="Alucinaciones"
                value={kpi.alucinaciones}
                description="Porcentaje de decisiones con razonamiento factualmente incorrecto detectado."
                tone={parseFloat(kpi.alucinaciones) > 1 ? "warning" : "primary"}
              />
              <ExplainCard
                label="Uso correcto de datos"
                value={kpi.usoCorrectoData}
                description="Decisiones donde el agente citó y aplicó correctamente los datos disponibles."
                tone={parseFloat(kpi.usoCorrectoData) >= 95 ? "primary" : "warning"}
              />
            </div>
          </div>
        </section>

        {/* ── Recomendaciones ───────────────────────────────────────────── */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center gap-2 mb-5">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h2 className="text-[13px] font-semibold text-text-primary uppercase tracking-wider">% Recomendaciones</h2>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Acceptance donut-style bars */}
            <div className="col-span-1 space-y-3">
              <RecBar label="Aceptadas" pct={kpi.recAceptadas} tone="success" />
              <RecBar label="Ignoradas" pct={kpi.recIgnoradas} tone="warning" />
              <div className="pt-1 flex items-center justify-between text-[11px] text-text-secondary border-t border-border">
                <span>Total recomendaciones emitidas</span>
                <span className="font-semibold text-text-primary">{kpi.casosAI + kpi.casosHumano}</span>
              </div>
            </div>

            {/* Human vs AI */}
            <div className="col-span-1 flex flex-col gap-3">
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-1">Revisión de casos</p>
              <div className="flex items-end gap-6 h-24">
                <CasesBar label="Por humano" value={kpi.casosHumano} max={kpi.casosAI} icon={<Users className="h-3.5 w-3.5" />} tone="warning" />
                <CasesBar label="Por AI" value={kpi.casosAI} max={kpi.casosAI} icon={<Bot className="h-3.5 w-3.5" />} tone="primary" />
              </div>
              <p className="text-[11px] text-text-secondary">
                Ratio AI/humano: <span className="font-semibold text-text-primary">{(kpi.casosAI / kpi.casosHumano).toFixed(1)}x</span>
              </p>
            </div>

            {/* Tiempo ahorrado */}
            <div className="col-span-1 bg-surface rounded-lg border border-border p-4 flex flex-col justify-center items-center text-center">
              <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider mb-2">Tiempo ahorrado</span>
              <span className="text-[38px] font-bold text-primary leading-none">{kpi.tiempoAhorrado}</span>
              <span className="text-[11px] text-text-secondary mt-2">estimado en turno actual<br />vs revisión 100% manual</span>
            </div>
          </div>
        </section>

      </div>
    </DashboardLayout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, unit, trend, delta, tone, icon,
}: {
  label: string; value: string; unit?: string;
  trend: "up" | "down"; delta: string;
  tone: "primary" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const toneClass =
    tone === "danger" ? "text-danger" :
    tone === "warning" ? "text-warning" :
    "text-primary";
  const TrendIcon = trend === "up" ? TrendingUp : TrendingDown;
  return (
    <div className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-text-secondary">{label}</div>
        <span className={`${toneClass} opacity-60`}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-[28px] font-bold leading-none ${toneClass}`}>{value}</span>
        {unit && <span className="text-[12px] text-text-secondary">{unit}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[11px] text-text-secondary">
        <TrendIcon className={`h-3.5 w-3.5 ${toneClass}`} />
        <span>{delta}</span>
      </div>
    </div>
  );
}

function ExplainCard({
  label, value, description, tone,
}: {
  label: string; value: string; description: string;
  tone: "primary" | "warning";
}) {
  const toneClass = tone === "warning" ? "text-warning" : "text-primary";
  const bgClass = tone === "warning" ? "bg-warning/5 border-warning/20" : "bg-primary/5 border-primary/20";
  return (
    <div className={`rounded-lg border p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-semibold text-text-primary">{label}</span>
        <span className={`text-[22px] font-bold ${toneClass}`}>{value}</span>
      </div>
      <p className="text-[11px] text-text-secondary leading-relaxed">{description}</p>
    </div>
  );
}

function RecBar({ label, pct, tone }: { label: string; pct: number; tone: "success" | "warning" }) {
  const fill = tone === "success" ? "bg-success" : "bg-warning";
  const text = tone === "success" ? "text-success" : "text-warning";
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span className="text-text-primary font-medium">{label}</span>
        <span className={`font-bold ${text}`}>{pct}%</span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden border border-border">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CasesBar({
  label, value, max, icon, tone,
}: { label: string; value: number; max: number; icon: React.ReactNode; tone: "primary" | "warning" }) {
  const fill = tone === "primary" ? "bg-primary" : "bg-warning";
  const text = tone === "primary" ? "text-primary" : "text-warning";
  const pct = (value / max) * 100;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className={`text-[20px] font-bold ${text}`}>{value}</span>
      <div className="w-full bg-surface border border-border rounded-sm overflow-hidden" style={{ height: `${pct}%`, minHeight: 8 }}>
        <div className={`w-full h-full ${fill} opacity-80`} />
      </div>
      <div className={`flex items-center gap-1 text-[11px] ${text}`}>{icon}<span>{label}</span></div>
    </div>
  );
}

