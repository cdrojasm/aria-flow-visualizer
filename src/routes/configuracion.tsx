import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, KeyboardEvent, ChangeEvent } from "react";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2, X,
  PlayCircle, Loader2, AlertTriangle, ShieldCheck, ShieldAlert,
  Power, Clock, Radio, Eye, ExternalLink, FileSpreadsheet,
  Rocket, Zap, CalendarClock,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { registerTestRun, type TestRunIndicators } from "@/data/testRuns";
import {
  ALL_VARIABLES, EVALUATION_VARIABLES, PROFILE_COLORS,
  INITIAL_CONFIGS, RUNNING_DEFAULT, defaultSettings, defaultAnalystCapacity,
  type RedFlag, type Taxonomy, type ModusOperandi, type TabKey, type DayProfile,
  type DistributionValue, type SamplingCriterion, type SamplingIntervalUnit,
  type ShortageBehavior, type AnalystCapacity, type DraftResult, type TestCleanupPolicy,
  type VersionEntry, type AgentConfig, type ConfigSettings,
} from "@/data/configs";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Configura ARIA a nivel de infraestructura, operación, test y agente." },
    ],
  }),
  component: ConfiguracionPage,
});

/* ─── Static data ────────────────────────────────────── */

const TAB_META: { key: TabKey; label: string }[] = [
  { key: "general", label: "General" },
  { key: "infra", label: "Infraestructura" },
  { key: "ops", label: "Operación" },
  { key: "monitoring", label: "Monitoreo" },
  { key: "agent", label: "Agente" },
  { key: "test", label: "Test" },
];

/* ─── Page ───────────────────────────────────────────── */

function ConfiguracionPage() {
  const [configs, setConfigs] = useState<AgentConfig[]>(INITIAL_CONFIGS);
  const [running, setRunning] = useState(RUNNING_DEFAULT);
  const [selectedConfigId, setSelectedConfigId] = useState("cfg-prod");
  const [selectedVersion, setSelectedVersion] = useState<number | "draft">(3);
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingFlag, setEditingFlag] = useState<RedFlag | null>(null);
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [editingMO, setEditingMO] = useState<ModusOperandi | null>(null);
  const [showMOForm, setShowMOForm] = useState(false);
  const [camposOpen, setCamposOpen] = useState(true);
  const [newConfigForm, setNewConfigForm] = useState<{ name: string; baseId: string } | null>(null);

  const [deployTarget, setDeployTarget] = useState<{ configId: string; version: number } | null>(null);
  const [deployMode, setDeployMode] = useState<"immediate" | "window">("immediate");
  const [deployConfirmText, setDeployConfirmText] = useState("");
  const [scheduledDeploys, setScheduledDeploys] = useState<Record<string, { version: number; hour: string }>>({});

  const selectedConfig = configs.find((c) => c.id === selectedConfigId)!;
  const isDraftView = selectedVersion === "draft";
  const viewingVersion = isDraftView ? undefined : selectedConfig.versions.find((v) => v.version === selectedVersion);
  const settings = isDraftView ? selectedConfig.workingCopy : viewingVersion!.settings;
  const readOnlyHistorical = !isDraftView;
  const locked = readOnlyHistorical || selectedConfig.testState === "testing";
  const showDraftRow = selectedConfig.dirtyTabs.length > 0 || selectedConfig.versions.length === 0;

  const defaultVersionFor = (c: AgentConfig): number | "draft" => {
    if (c.dirtyTabs.length > 0 || c.versions.length === 0) return "draft";
    return c.versions[c.versions.length - 1].version;
  };

  const selectConfigRow = (c: AgentConfig) => { setSelectedConfigId(c.id); setSelectedVersion(defaultVersionFor(c)); };

  const patchSettings = (tab: TabKey, patch: Partial<ConfigSettings>) => {
    if (!isDraftView) return;
    setConfigs((prev) => prev.map((c) => {
      if (c.id !== selectedConfigId) return c;
      const dirtyTabs = c.dirtyTabs.includes(tab) ? c.dirtyTabs : [...c.dirtyTabs, tab];
      return { ...c, workingCopy: { ...c.workingCopy, ...patch }, dirtyTabs, lastTestResult: undefined };
    }));
  };

  const runCycle = () => {
    if (!isDraftView) return;
    setConfigs((prev) => prev.map((c) => (c.id === selectedConfigId ? { ...c, testState: "testing" } : c)));
    setTimeout(() => {
      const accuracy = 92 + Math.random() * 7;
      const result: DraftResult = { accuracy, samples: 1240, passed: accuracy >= 95 };
      setConfigs((prev) => prev.map((c) => (c.id === selectedConfigId ? { ...c, testState: "idle", dirtyTabs: [], lastTestResult: result } : c)));
    }, 1600);
  };

  const activateConfig = () => {
    if (!isDraftView || !selectedConfig.lastTestResult?.passed) return;
    const draftResult = selectedConfig.lastTestResult;
    const newVersionNum = (selectedConfig.versions.length ? Math.max(...selectedConfig.versions.map((v) => v.version)) : 0) + 1;
    const testRun: TestRunIndicators = {
      id: `run-${selectedConfigId}-v${newVersionNum}-${Date.now()}`,
      configId: selectedConfigId,
      configName: selectedConfig.name,
      version: newVersionNum,
      date: new Date().toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      dataset: "Dataset de validación",
      duration: "—",
      processed: draftResult.samples,
      total: draftResult.samples,
      failed: 0,
      fraudeNoDetectado: `${(100 - draftResult.accuracy).toFixed(1)}%`,
      falsosPositivos: `${(Math.random() * 10).toFixed(1)}%`,
      tiempoAhorrado: `${(Math.random() * 8 + 2).toFixed(1)} h`,
      latencia: `${Math.round(800 + Math.random() * 400)} ms`,
      accuracy: draftResult.accuracy,
      passed: draftResult.passed,
    };
    registerTestRun(testRun);
    const entry: VersionEntry = { version: newVersionNum, settings: selectedConfig.workingCopy, testRun };
    setConfigs((prev) => prev.map((c) => (c.id === selectedConfigId ? { ...c, versions: [...c.versions, entry], dirtyTabs: [], lastTestResult: undefined } : c)));
    setRunning({ configId: selectedConfigId, version: newVersionNum });
    setSelectedVersion(newVersionNum);
  };

  const openDeploy = (configId: string, version: number) => {
    setDeployTarget({ configId, version });
    setDeployMode("immediate");
    setDeployConfirmText("");
  };
  const closeDeploy = () => { setDeployTarget(null); setDeployConfirmText(""); };

  const deployVersionEntry = deployTarget
    ? configs.find((c) => c.id === deployTarget.configId)?.versions.find((v) => v.version === deployTarget.version)
    : undefined;
  const deployWindowEnabled = deployVersionEntry?.settings.migrationWindowEnabled ?? false;
  const deployWindowHour = deployVersionEntry?.settings.migrationWindowHour ?? "02:00";
  const deployConfirmed = deployConfirmText.trim().toUpperCase() === "CONFIRMAR";
  const canConfirmDeploy = deployConfirmed && (deployMode === "immediate" || deployWindowEnabled);

  const confirmDeploy = () => {
    if (!deployTarget || !canConfirmDeploy) return;
    const { configId, version } = deployTarget;
    if (deployMode === "immediate") {
      setRunning({ configId, version });
      setScheduledDeploys((prev) => { const n = { ...prev }; delete n[configId]; return n; });
    } else {
      setScheduledDeploys((prev) => ({ ...prev, [configId]: { version, hour: deployWindowHour } }));
    }
    closeDeploy();
  };

  const cancelScheduledDeploy = (configId: string) =>
    setScheduledDeploys((prev) => { const n = { ...prev }; delete n[configId]; return n; });

  const createConfig = () => {
    if (!newConfigForm || !newConfigForm.name.trim()) return;
    const base = configs.find((c) => c.id === newConfigForm.baseId)!;
    const baseSettings = base.versions.length ? base.versions[base.versions.length - 1].settings : base.workingCopy;
    const clonedSettings: ConfigSettings = {
      ...baseSettings,
      taxonomies: baseSettings.taxonomies.map((t) => ({ ...t, variables: [...t.variables], examples: [...t.examples] })),
      redFlags: baseSettings.redFlags.map((r) => ({ ...r, variables: [...r.variables] })),
      modusOperandi: baseSettings.modusOperandi.map((m) => ({ ...m })),
      activeFields: [...baseSettings.activeFields],
      perfilUsuarioVars: [...baseSettings.perfilUsuarioVars],
      perfilTransaccionVars: [...baseSettings.perfilTransaccionVars],
      perfilTransaccionalVars: [...baseSettings.perfilTransaccionalVars],
      samplingCriteria: baseSettings.samplingCriteria.map((c) => ({ ...c, values: c.values.map((v) => ({ ...v })) })),
      evaluationVariables: [...baseSettings.evaluationVariables],
      voicebotShortageBehavior: { ...baseSettings.voicebotShortageBehavior },
      analystShortageBehavior: { ...baseSettings.analystShortageBehavior },
    };
    const id = `cfg-${Date.now()}`;
    setConfigs((prev) => [...prev, { id, name: newConfigForm.name.trim(), description: `Basada en ${base.name}.`, versions: [], workingCopy: clonedSettings, dirtyTabs: [], testState: "idle" }]);
    setSelectedConfigId(id);
    setSelectedVersion("draft");
    setActiveTab("general");
    setNewConfigForm(null);
  };

  const openCreate = () => { setEditing({ id: "", code: "", name: "", description: "", variables: [], examples: [], active: true }); setShowForm(true); };
  const openEdit = (t: Taxonomy) => { setEditing({ ...t, variables: [...t.variables], examples: [...t.examples] }); setShowForm(true); };
  const removeTax = (id: string) => patchSettings("agent", { taxonomies: settings.taxonomies.filter((r) => r.id !== id) });
  const saveTax = () => {
    if (!editing || !editing.code.trim() || !editing.name.trim()) return;
    const taxonomies = editing.id ? settings.taxonomies.map((r) => (r.id === editing.id ? editing : r)) : [...settings.taxonomies, { ...editing, id: `tx-${Date.now()}` }];
    patchSettings("agent", { taxonomies });
    setShowForm(false); setEditing(null);
  };

  const openCreateFlag = () => { setEditingFlag({ id: "", name: "", description: "", variables: [] }); setShowFlagForm(true); };
  const openEditFlag = (r: RedFlag) => { setEditingFlag({ ...r, variables: [...r.variables] }); setShowFlagForm(true); };
  const removeFlag = (id: string) => patchSettings("agent", { redFlags: settings.redFlags.filter((r) => r.id !== id) });
  const saveFlag = () => {
    if (!editingFlag || !editingFlag.name.trim()) return;
    const redFlags = editingFlag.id ? settings.redFlags.map((r) => (r.id === editingFlag.id ? editingFlag : r)) : [...settings.redFlags, { ...editingFlag, id: `rf-${Date.now()}` }];
    patchSettings("agent", { redFlags });
    setShowFlagForm(false); setEditingFlag(null);
  };

  const openCreateMO = () => { setEditingMO({ id: "", title: "", narrative: "", taxonomyId: settings.taxonomies[0]?.id ?? "", redFlagId: null }); setShowMOForm(true); };
  const openEditMO = (m: ModusOperandi) => { setEditingMO({ ...m }); setShowMOForm(true); };
  const removeMO = (id: string) => patchSettings("agent", { modusOperandi: settings.modusOperandi.filter((m) => m.id !== id) });
  const saveMO = () => {
    if (!editingMO || !editingMO.title.trim() || !editingMO.narrative.trim() || !editingMO.taxonomyId) return;
    const modusOperandi = editingMO.id ? settings.modusOperandi.map((m) => (m.id === editingMO.id ? editingMO : m)) : [...settings.modusOperandi, { ...editingMO, id: `mo-${Date.now()}` }];
    patchSettings("agent", { modusOperandi });
    setShowMOForm(false); setEditingMO(null);
  };

  const dirtyTabLabels = selectedConfig.dirtyTabs.map((k) => TAB_META.find((t) => t.key === k)?.label).filter(Boolean).join(", ");

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header className="mb-2">
          <h1 className="text-[20px] font-semibold text-text-primary">Configuración del Agente</h1>
          <p className="text-[13px] text-text-secondary mt-1">Configura a ARIA aquí. Es posible realizar configuraciones a nivel de infraestructura, operación, test, agente.</p>
        </header>

        {/* Config + version selector */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider">Configuraciones</h2>
            <button onClick={() => setNewConfigForm({ name: "", baseId: selectedConfigId })}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Nueva configuración
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Configuración</div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {configs.map((c) => {
                  const selected = c.id === selectedConfigId;
                  const isRunning = running.configId === c.id;
                  return (
                    <button key={c.id} onClick={() => selectConfigRow(c)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${selected ? "bg-primary/5" : "hover:bg-surface"}`}>
                      <div className="min-w-0">
                        <span className="text-[13px] font-medium text-text-primary truncate">{c.name}</span>
                        <p className="text-[11px] text-text-secondary truncate mt-0.5">{c.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.dirtyTabs.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-warning" title="Cambios sin guardar" />}
                        {scheduledDeploys[c.id] && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary" title={`Despliegue en ventana programado — v${scheduledDeploys[c.id].version} a las ${scheduledDeploys[c.id].hour}`}>
                            <CalendarClock className="h-3.5 w-3.5" />
                          </span>
                        )}
                        {isRunning && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                            <Radio className="h-3.5 w-3.5" /> Producción
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-surface border-b border-border text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Versión</div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {showDraftRow && (
                  <button onClick={() => setSelectedVersion("draft")}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${isDraftView ? "bg-primary/5" : "hover:bg-surface"}`}>
                    <div>
                      <span className="text-[13px] font-medium text-warning">Cambios sin guardar</span>
                      <p className="text-[11px] text-text-secondary">Borrador editable, aún no validado.</p>
                    </div>
                  </button>
                )}
                {[...selectedConfig.versions].reverse().map((v) => {
                  const isRunningVersion = running.configId === selectedConfig.id && running.version === v.version;
                  const isSelected = !isDraftView && selectedVersion === v.version;
                  const scheduled = scheduledDeploys[selectedConfig.id];
                  const isScheduledVersion = scheduled?.version === v.version;
                  return (
                    <div key={v.version} className="group">
                      <div role="button" tabIndex={0} onClick={() => setSelectedVersion(v.version)}
                        onKeyDown={(e) => { if (e.key === "Enter") setSelectedVersion(v.version); }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-surface"}`}>
                        <div>
                          <span className="text-[13px] font-medium text-text-primary">v{v.version}</span>
                          <p className="text-[11px] text-text-secondary">{v.testRun.date} · {v.testRun.accuracy.toFixed(1)}% precisión</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isScheduledVersion && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary" title={`Programado para las ${scheduled!.hour}`}>
                              <CalendarClock className="h-3.5 w-3.5" /> Programado
                            </span>
                          )}
                          {isRunningVersion ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success">
                              <Radio className="h-3.5 w-3.5" /> Producción
                            </span>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); openDeploy(selectedConfig.id, v.version); }}
                              title="Desplegar a producción"
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/10">
                              <Rocket className="h-3.5 w-3.5" /> Desplegar
                            </button>
                          )}
                        </div>
                      </div>
                      <Link to="/testing/$runId" params={{ runId: v.testRun.id }} onClick={(e) => e.stopPropagation()}
                        className="hidden group-hover:flex flex-col gap-1.5 mx-3 mb-2 p-2.5 rounded-md border border-border bg-surface hover:border-primary/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-text-primary">Salida del test guardado</span>
                          <ExternalLink className="h-3 w-3 text-primary shrink-0" />
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-text-secondary">
                          <span>Fraude no detectado: <b className="text-text-primary font-medium">{v.testRun.fraudeNoDetectado}</b></span>
                          <span>Falsos positivos: <b className="text-text-primary font-medium">{v.testRun.falsosPositivos}</b></span>
                          <span>Tiempo ahorrado: <b className="text-text-primary font-medium">{v.testRun.tiempoAhorrado}</b></span>
                          <span>Latencia: <b className="text-text-primary font-medium">{v.testRun.latencia}</b></span>
                        </div>
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {isDraftView && selectedConfig.dirtyTabs.length > 0 && (
          <section className="bg-card rounded-xl border border-warning/30 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="px-6 py-4 border-b border-warning/30 bg-warning/5 rounded-t-xl">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
                <h2 className="text-[14px] font-semibold text-text-primary">Ciclo de validación</h2>
              </div>
              <p className="text-[12px] text-text-secondary mt-0.5">
                Cambios sin validar en <span className="font-medium">{dirtyTabLabels}</span>. Corre esta configuración contra el dataset de prueba antes de activarla.
              </p>
            </div>
            <div className="p-6 space-y-5">
              <button onClick={runCycle} disabled={locked}
                className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {locked ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                {locked ? "Corriendo ciclo…" : "Correr ciclo"}
              </button>

              {selectedConfig.lastTestResult && !locked && (
                <div className={`rounded-lg border p-4 ${selectedConfig.lastTestResult.passed ? "border-success/30 bg-success/5" : "border-danger/30 bg-danger/5"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    {selectedConfig.lastTestResult.passed ? <ShieldCheck className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-danger" />}
                    <span className={`text-[13px] font-semibold ${selectedConfig.lastTestResult.passed ? "text-success" : "text-danger"}`}>
                      {selectedConfig.lastTestResult.passed ? "Ciclo aprobado" : "Ciclo no aprobado — precisión bajo el umbral (95%)"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-[12px] mb-4">
                    <div>
                      <p className="text-text-secondary">Precisión</p>
                      <p className="text-[16px] font-semibold text-text-primary font-mono">{selectedConfig.lastTestResult.accuracy.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-text-secondary">Alertas evaluadas</p>
                      <p className="text-[16px] font-semibold text-text-primary font-mono">{selectedConfig.lastTestResult.samples.toLocaleString()}</p>
                    </div>
                  </div>
                  <button onClick={activateConfig} disabled={!selectedConfig.lastTestResult.passed}
                    className="inline-flex items-center gap-2 bg-success text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed">
                    <CheckCircle2 className="h-4 w-4" /> Activar esta versión
                  </button>
                </div>
              )}

              {!selectedConfig.lastTestResult && !locked && (
                <p className="text-[12px] text-text-secondary">Sin resultados todavía. Corre el ciclo para poder activar esta configuración.</p>
              )}
            </div>
          </section>
        )}

        {readOnlyHistorical && (
          <div className="flex items-center gap-2.5 bg-text-secondary/10 border border-border rounded-lg px-4 py-2.5">
            <Eye className="h-4 w-4 text-text-secondary shrink-0" />
            <p className="text-[12px] text-text-primary">
              Viendo la versión <span className="font-medium">v{selectedVersion}</span> — histórica, de solo lectura.
            </p>
            <button onClick={() => setSelectedVersion("draft")} className="ml-auto text-[12px] font-medium text-primary hover:underline shrink-0">Ir a Cambios sin guardar</button>
          </div>
        )}

        {selectedConfig.testState === "testing" && (
          <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
            <Loader2 className="h-4 w-4 text-primary shrink-0 animate-spin" />
            <p className="text-[12px] text-text-primary">Ciclo de validación en curso — edición bloqueada para evitar comportamiento inconsistente y pérdida de trazabilidad.</p>
          </div>
        )}

        {scheduledDeploys[selectedConfig.id] && (
          <div className="flex items-center gap-2.5 bg-primary/10 border border-primary/30 rounded-lg px-4 py-2.5">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <p className="text-[12px] text-text-primary">
              Despliegue en ventana programado: <span className="font-medium">v{scheduledDeploys[selectedConfig.id].version}</span> se aplicará a las <span className="font-medium">{scheduledDeploys[selectedConfig.id].hour}</span>.
            </p>
            <button onClick={() => cancelScheduledDeploy(selectedConfig.id)} className="ml-auto text-[12px] font-medium text-danger hover:underline shrink-0">Cancelar despliegue</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {TAB_META.map((t) => {
            const active = activeTab === t.key;
            const dirty = selectedConfig.dirtyTabs.includes(t.key);
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`relative px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors ${active ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}>
                {t.label}
                {dirty && <span className="absolute top-1.5 right-0.5 h-1.5 w-1.5 rounded-full bg-warning" />}
              </button>
            );
          })}
        </div>

        <fieldset disabled={locked} className="contents">
          {activeTab === "general" && (
            <div className="space-y-6">
              {/* Estado del agente */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Estado del agente</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Enciende o apaga la operación de ARIA para esta configuración.</p>
                </div>
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center justify-center h-9 w-9 rounded-full ${settings.agentEnabled ? "bg-success/10 text-success" : "bg-text-secondary/10 text-text-secondary"}`}>
                      <Power className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">{settings.agentEnabled ? "Agente encendido" : "Agente apagado"}</p>
                      <p className="text-[12px] text-text-secondary">{settings.agentEnabled ? "ARIA está procesando alertas normalmente." : "ARIA no procesará nuevas alertas hasta que se encienda."}</p>
                    </div>
                  </div>
                  <button onClick={() => patchSettings("general", { agentEnabled: !settings.agentEnabled })}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium ${settings.agentEnabled ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-success text-white hover:bg-success/90"}`}>
                    <Power className="h-4 w-4" /> {settings.agentEnabled ? "Apagar" : "Prender"}
                  </button>
                </div>
              </section>

              {/* Ventana de migración */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Ventana de migración de configuración</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Define la hora en la que se aplican los cambios de configuración: ARIA procesa y cierra la cola de alertas pendientes, aplica la nueva configuración y reinicia la operación.</p>
                </div>
                <div className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[13px] font-medium text-text-primary">Migración programada</label>
                      <p className="text-[12px] text-text-secondary mt-0.5">Si está desactivada, la activación ocurre de inmediato al correr el ciclo.</p>
                    </div>
                    <button onClick={() => patchSettings("general", { migrationWindowEnabled: !settings.migrationWindowEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.migrationWindowEnabled ? "bg-primary" : "bg-border"}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.migrationWindowEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  {settings.migrationWindowEnabled && (
                    <Field label="Hora de migración" hint="Hora del día en que se cierra la cola, se cambia la configuración y se reinicia la operación.">
                      <div className="flex items-center gap-2 max-w-[180px]">
                        <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                        <input type="time" value={settings.migrationWindowHour} onChange={(e) => patchSettings("general", { migrationWindowHour: e.target.value })}
                          className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                      </div>
                    </Field>
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === "infra" && (
            <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-[14px] font-semibold text-text-primary">Límites operativos</h2>
                <p className="text-[12px] text-text-secondary mt-0.5">Controla el consumo de recursos del agente.</p>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <LimitField label="Máxima cantidad de instancias del agente" hint="Número máximo de sub-agentes ejecutándose en paralelo." value={settings.maxInstances} onChange={(v) => patchSettings("infra", { maxInstances: v })} min={1} max={32} suffix="instancias" />
                <div className="flex flex-col">
                  <label className="text-[13px] font-medium text-text-primary">Autoescalado de instancias</label>
                  <p className="text-[12px] text-text-secondary mt-0.5 mb-3">Permitir que ARIA escale dinámicamente hasta el límite definido.</p>
                  <button onClick={() => patchSettings("infra", { autoScale: !settings.autoScale })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoScale ? "bg-primary" : "bg-border"}`}>
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${settings.autoScale ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === "ops" && (
            <div className="space-y-6">
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Voicebot</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Capacidad del recurso físico de voicebot.</p>
                </div>
                <div className="p-6">
                  <LimitField label="Máximo de llamadas concurrentes" hint="Cantidad máxima de llamadas simultáneas que el componente voicebot puede sostener en paralelo." value={settings.voicebotMaxConcurrentCalls} onChange={(v) => patchSettings("ops", { voicebotMaxConcurrentCalls: v })} min={1} max={500} suffix="llamadas" />
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Analista — disponibilidad</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Cantidad de analistas listos para escalar alertas, por hora del día. Define perfiles de disponibilidad y asígnalos a días del mes (ej. días de pago).</p>
                </div>
                <div className="p-6">
                  <AnalystCapacityEditor value={settings.analystCapacity} onChange={(v) => patchSettings("ops", { analystCapacity: v })} />
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Manejo de encolamiento</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Tiempo máximo que una alerta puede esperar en cola antes de ser saltada (skip).</p>
                </div>
                <div className="p-6">
                  <Field label="Tiempo de vida máximo en cola" hint="Si una alerta lleva encolada más de este tiempo, ARIA la saltea en vez de procesarla.">
                    <div className="flex items-center gap-2 max-w-xs">
                      <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                      <input type="number" min={1} value={settings.queueMaxLifetimeValue}
                        onChange={(e) => patchSettings("ops", { queueMaxLifetimeValue: Number(e.target.value) })}
                        className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                      <select value={settings.queueMaxLifetimeUnit}
                        onChange={(e) => patchSettings("ops", { queueMaxLifetimeUnit: e.target.value as SamplingIntervalUnit })}
                        className="h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                        <option value="minutes">Minutos</option>
                        <option value="hours">Horas</option>
                        <option value="days">Días</option>
                      </select>
                    </div>
                  </Field>
                </div>
              </section>

              <div className="space-y-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-text-primary">Comportamiento ante fallas o escasez</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Qué debe hacer ARIA cuando no hay suficiente capacidad de voicebot o de analistas para atender las alertas.</p>
                </div>
                <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-[13px] font-semibold text-text-primary">Escasez de voicebot</h3>
                    <p className="text-[12px] text-text-secondary mt-0.5">ARIA no logra asignar una llamada de voicebot disponible para una alerta.</p>
                  </div>
                  <div className="p-6">
                    <ShortageBehaviorEditor name="voicebot-shortage" value={settings.voicebotShortageBehavior} onChange={(v) => patchSettings("ops", { voicebotShortageBehavior: v })} />
                  </div>
                </section>
                <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-[13px] font-semibold text-text-primary">Escasez de analistas</h3>
                    <p className="text-[12px] text-text-secondary mt-0.5">No hay analistas disponibles para recibir una alerta escalada.</p>
                  </div>
                  <div className="p-6">
                    <ShortageBehaviorEditor name="analyst-shortage" value={settings.analystShortageBehavior} onChange={(v) => patchSettings("ops", { analystShortageBehavior: v })} />
                  </div>
                </section>
              </div>
            </div>
          )}

          {activeTab === "monitoring" && (
            <div className="space-y-6">
              {/* 1. Intervalo de muestreo */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">1. Intervalo de muestreo</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Cada cuánto tiempo ARIA toma una muestra de la operación para evaluarla.</p>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 max-w-xs">
                    <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                    <input type="number" min={1} value={settings.samplingIntervalValue}
                      onChange={(e) => patchSettings("monitoring", { samplingIntervalValue: Number(e.target.value) })}
                      className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                    <select value={settings.samplingIntervalUnit}
                      onChange={(e) => patchSettings("monitoring", { samplingIntervalUnit: e.target.value as SamplingIntervalUnit })}
                      className="h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                      <option value="minutes">Minutos</option>
                      <option value="hours">Horas</option>
                      <option value="days">Días</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* 2. Filtros y distribución */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">2. Filtros y distribución de la muestra</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Criterios de muestreo (canal, monto, hora, resultado, …) y el porcentaje de la muestra que corresponde a cada valor.</p>
                </div>
                <div className="p-6 space-y-5">
                  <SamplingDistributionEditor value={settings.samplingCriteria} onChange={(v) => patchSettings("monitoring", { samplingCriteria: v })} />
                  <div className="pt-2 border-t border-border">
                    <LimitField label="Máximo de muestras por intervalo" hint="Tope de alertas tomadas en cada intervalo de muestreo, tras aplicar filtros y distribución." value={settings.maxSamples} onChange={(v) => patchSettings("monitoring", { maxSamples: v })} min={1} max={5000} suffix="muestras" />
                  </div>
                </div>
              </section>

              {/* 3. Evaluación */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">3. Evaluación</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Prompts e insumos que el agente de monitoreo usa para calificar cada muestra.</p>
                </div>
                <div className="p-6 space-y-5">
                  <Field label="Prompt de evaluación — Agente clasificación" hint="Instrucción usada para evaluar la calidad del agente de clasificación.">
                    <textarea value={settings.promptClasificacion} onChange={(e) => patchSettings("monitoring", { promptClasificacion: e.target.value })} rows={4} placeholder="Ej: Evalúa si la taxonomía asignada es coherente con los indicadores de la alerta." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                  </Field>
                  <Field label="Prompt de evaluación — Agente analista" hint="Instrucción usada para evaluar la calidad del agente analista.">
                    <textarea value={settings.promptAnalista} onChange={(e) => patchSettings("monitoring", { promptAnalista: e.target.value })} rows={4} placeholder="Ej: Verifica que el análisis narrativo sea consistente con los datos disponibles y la taxonomía." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                  </Field>
                  <Field label="Prompt de evaluación — Agente monitoreo" hint="Instrucción usada para evaluar la calidad del agente de monitoreo.">
                    <textarea value={settings.promptMonitoreo} onChange={(e) => patchSettings("monitoring", { promptMonitoreo: e.target.value })} rows={4} placeholder="Ej: Comprueba que las alertas de baja prioridad descartadas realmente no representen riesgo." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                  </Field>
                  <Field label="Variables consideradas en la evaluación" hint="Insumos que el evaluador puede inspeccionar por muestra, además de los prompts anteriores.">
                    <VariablePicker value={settings.evaluationVariables} onChange={(v) => patchSettings("monitoring", { evaluationVariables: v })} pool={EVALUATION_VARIABLES} />
                  </Field>
                </div>
              </section>
            </div>
          )}

          {activeTab === "agent" && (
            <div className="space-y-8">
              {/* 1. Perfilamiento */}
              <div className="space-y-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-text-primary">1. Perfilamiento</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Estrategias de prompt que el agente usa para construir cada tipo de perfil. Indica, por cada una, qué variables puede referenciar.</p>
                </div>
                <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <div className="p-6 grid grid-cols-1 gap-6">
                    <Field label="Perfilamiento de usuario" hint="Cómo debe el agente construir el perfil del titular de la cuenta.">
                      <textarea value={settings.perfilUsuario} onChange={(e) => patchSettings("agent", { perfilUsuario: e.target.value })} rows={3} placeholder="Ej: Considerar historial de 12 meses, segmento, antigüedad y canales habituales." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
                        <VariablePicker value={settings.perfilUsuarioVars} onChange={(v) => patchSettings("agent", { perfilUsuarioVars: v })} />
                      </div>
                    </Field>
                    <Field label="Perfilamiento de transacción" hint="Cómo evalúa el agente una transacción individual.">
                      <textarea value={settings.perfilTransaccion} onChange={(e) => patchSettings("agent", { perfilTransaccion: e.target.value })} rows={3} placeholder="Ej: Comparar monto, canal, horario y geolocalización contra la media del cliente." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
                        <VariablePicker value={settings.perfilTransaccionVars} onChange={(v) => patchSettings("agent", { perfilTransaccionVars: v })} />
                      </div>
                    </Field>
                    <Field label="Perfil transaccional" hint="Parámetros que definen el comportamiento transaccional esperado del cliente en el tiempo.">
                      <textarea value={settings.perfilTransaccional} onChange={(e) => patchSettings("agent", { perfilTransaccional: e.target.value })} rows={3} placeholder="Ej: Volumen semanal habitual, tope de transferencias, frecuencia por canal." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
                        <VariablePicker value={settings.perfilTransaccionalVars} onChange={(v) => patchSettings("agent", { perfilTransaccionalVars: v })} />
                      </div>
                    </Field>
                  </div>
                </section>
              </div>

              {/* 2. Clasificación y señales */}
              <div className="space-y-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-text-primary">2. Clasificación y señales</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Red flags, taxonomías de fraude y modus operandi que el agente usa para clasificar alertas.</p>
                </div>

                {/* 2a. Red flags */}
                <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                      <h3 className="text-[13px] font-semibold text-text-primary">a. Red flags</h3>
                      <p className="text-[12px] text-text-secondary mt-0.5">Comportamientos de alerta en la actividad transaccional, descritos con variables.</p>
                    </div>
                    <button onClick={openCreateFlag} className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90">
                      <Plus className="h-4 w-4" /> Nueva red flag
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {settings.redFlags.map((r) => (
                      <div key={r.id} className="px-6 py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-text-primary">{r.name}</p>
                          <p className="text-[12px] text-text-secondary mt-0.5">{r.description}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {r.variables.length === 0
                              ? <span className="text-text-secondary text-[11px]">Sin variables asociadas.</span>
                              : r.variables.map((v) => <span key={v} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">{v}</span>)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => openEditFlag(r)} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => removeFlag(r.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                    {settings.redFlags.length === 0 && <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin red flags configuradas.</p>}
                  </div>
                </section>

                {/* 2b. Taxonomías de fraude */}
                <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                      <h3 className="text-[13px] font-semibold text-text-primary">b. Taxonomías de fraude</h3>
                      <p className="text-[12px] text-text-secondary mt-0.5">Categorías abstractas de fraude que el agente puede asignar a cada alerta.</p>
                    </div>
                    <button onClick={openCreate} className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90">
                      <Plus className="h-4 w-4" /> Nueva taxonomía
                    </button>
                  </div>
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-text-secondary text-left border-b border-border">
                        <th className="px-6 py-2 font-medium">Código</th>
                        <th className="px-3 py-2 font-medium">Nombre</th>
                        <th className="px-3 py-2 font-medium">Descripción</th>
                        <th className="px-3 py-2 font-medium">Variables</th>
                        <th className="px-3 py-2 font-medium">Estado</th>
                        <th className="px-3 py-2 font-medium w-24"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {settings.taxonomies.map((t) => (
                        <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface align-top">
                          <td className="px-6 py-3 font-mono text-[12px]">{t.code}</td>
                          <td className="px-3 py-3 font-medium text-text-primary">{t.name}</td>
                          <td className="px-3 py-3 text-text-secondary max-w-xs">
                            <p className="truncate">{t.description}</p>
                            {t.examples.length > 0 && (
                              <p className="text-[11px] text-text-secondary/80 mt-1 truncate" title={t.examples.join(" · ")}>Ej: {t.examples.join(" · ")}</p>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[220px]">
                              {t.variables.length === 0
                                ? <span className="text-text-secondary text-[12px]">—</span>
                                : t.variables.map((v) => <span key={v} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">{v}</span>)}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-[11px] uppercase tracking-wider ${t.active ? "text-success" : "text-text-secondary"}`}>{t.active ? "Activa" : "Inactiva"}</span>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => removeTax(t.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {settings.taxonomies.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-text-secondary">Sin taxonomías configuradas.</td></tr>}
                    </tbody>
                  </table>
                </section>

                {/* 2c. Modus operandi */}
                <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div>
                      <h3 className="text-[13px] font-semibold text-text-primary">c. Modus operandi</h3>
                      <p className="text-[12px] text-text-secondary mt-0.5">Casos concretos — con actores, canales y nombres reales de la infraestructura del banco — que aplican una taxonomía en la práctica.</p>
                    </div>
                    <button onClick={openCreateMO} disabled={settings.taxonomies.length === 0} className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                      <Plus className="h-4 w-4" /> Nuevo modus operandi
                    </button>
                  </div>
                  <div className="divide-y divide-border">
                    {settings.modusOperandi.map((m) => {
                      const tax = settings.taxonomies.find((t) => t.id === m.taxonomyId);
                      const flag = settings.redFlags.find((r) => r.id === m.redFlagId);
                      return (
                        <div key={m.id} className="px-6 py-3 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-text-primary">{m.title}</p>
                            <p className="text-[12px] text-text-secondary mt-0.5">{m.narrative}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono">{tax ? tax.code : "Taxonomía eliminada"}</span>
                              {flag && <span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[11px]">{flag.name}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEditMO(m)} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => removeMO(m.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
                    {settings.modusOperandi.length === 0 && <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin modus operandi configurados.</p>}
                  </div>
                </section>
              </div>

              {/* Campos de alerta */}
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <button onClick={() => setCamposOpen((v) => !v)} className="w-full flex items-center justify-between px-6 py-4 border-b border-border text-left">
                  <div>
                    <h2 className="text-[14px] font-semibold text-text-primary">Campos de alerta</h2>
                    <p className="text-[12px] text-text-secondary mt-0.5">Selecciona qué campos se muestran en el detalle de cada alerta.</p>
                  </div>
                  {camposOpen ? <ChevronUp className="h-4 w-4 text-text-secondary" /> : <ChevronDown className="h-4 w-4 text-text-secondary" />}
                </button>
                {camposOpen && (
                  <div className="p-6">
                    <VariablePicker value={settings.activeFields} onChange={(v) => patchSettings("agent", { activeFields: v })} />
                  </div>
                )}
              </section>
            </div>
          )}
        </fieldset>

        {activeTab === "test" && (
          <div className="space-y-6">
            <fieldset disabled={locked} className="contents">
              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Escala del ciclo de test</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Controla cuántas instancias y experimentos usa el ciclo de validación al correr.</p>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <LimitField label="Máxima cantidad de instancias para test" hint="Número de sub-agentes en paralelo usados exclusivamente durante el ciclo de validación." value={settings.maxTestInstances} onChange={(v) => patchSettings("test", { maxTestInstances: v })} min={1} max={32} suffix="instancias" />
                  <LimitField label="Máximo de experimentos concurrentes" hint="Cuántos ciclos de validación (de la misma o distintas configuraciones) pueden correr al mismo tiempo." value={settings.maxConcurrentExperiments} onChange={(v) => patchSettings("test", { maxConcurrentExperiments: v })} min={1} max={20} suffix="experimentos" />
                  <LimitField label="Timeout por experimento" hint="Minutos máximos que puede tomar un ciclo antes de marcarse como fallido y liberar sus instancias." value={settings.experimentTimeoutMinutes} onChange={(v) => patchSettings("test", { experimentTimeoutMinutes: v })} min={5} max={180} suffix="minutos" />
                </div>
              </section>

              <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-[14px] font-semibold text-text-primary">Almacenamiento de resultados de test</h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">Cuántos resultados de ciclos se conservan y qué hacer cuando se supera el límite.</p>
                </div>
                <div className="p-6 space-y-5">
                  <LimitField label="Máxima cantidad de test runs almacenados" hint="Tope de resultados de ciclos guardados por configuración." value={settings.maxStoredTestRuns} onChange={(v) => patchSettings("test", { maxStoredTestRuns: v })} min={1} max={100} suffix="runs" />
                  <Field label="Política de limpieza" hint="Qué hacer cuando se alcanza el máximo de test runs almacenados.">
                    <select value={settings.testCleanupPolicy} onChange={(e) => patchSettings("test", { testCleanupPolicy: e.target.value as TestCleanupPolicy })}
                      className="w-full max-w-xs h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                      <option value="oldest">Borrar automáticamente los más antiguos</option>
                      <option value="failed-first">Borrar automáticamente los fallidos primero</option>
                      <option value="manual">No borrar — requiere limpieza manual</option>
                    </select>
                  </Field>
                </div>
              </section>
            </fieldset>
          </div>
        )}
      </div>

      {/* Taxonomy modal */}
      {showForm && editing && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">{editing.id ? "Editar taxonomía" : "Nueva taxonomía"}</h3>
              <button onClick={() => setShowForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Código">
                <input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] font-mono focus:outline-none focus:border-primary" placeholder="FRD-CARD" />
              </Field>
              <Field label="Nombre">
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" placeholder="Fraude con tarjeta" />
              </Field>
              <Field label="Descripción" hint="Qué caracteriza a esta categoría de fraude.">
                <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
              </Field>
              <Field label="Variables" hint="Variables que el agente considera para asignar esta taxonomía.">
                <VariablePicker value={editing.variables} onChange={(v) => setEditing({ ...editing, variables: v })} />
              </Field>
              <Field label="Ejemplos (opcional)" hint="Casos ilustrativos, en abstracto. Presiona Enter o coma para agregar cada uno.">
                <TagInput value={editing.examples} onChange={(examples) => setEditing({ ...editing, examples })} placeholder="Ej: Compra internacional tras rechazo por fondos insuficientes" />
              </Field>
              <label className="flex items-center gap-2 text-[13px] text-text-primary">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                Taxonomía activa
              </label>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={saveTax} disabled={!editing.code.trim() || !editing.name.trim()}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {editing.id ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Red flag modal */}
      {showFlagForm && editingFlag && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowFlagForm(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">{editingFlag.id ? "Editar red flag" : "Nueva red flag"}</h3>
              <button onClick={() => setShowFlagForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nombre">
                <input value={editingFlag.name} onChange={(e) => setEditingFlag({ ...editingFlag, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" placeholder="Ej: Transacción nocturna" />
              </Field>
              <Field label="Descripción del comportamiento" hint="Describe la señal de forma abstracta, apoyándote en las variables disponibles.">
                <textarea value={editingFlag.description} onChange={(e) => setEditingFlag({ ...editingFlag, description: e.target.value })}
                  rows={3} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" placeholder="Ej: Movimiento ejecutado en horario atípico, fuera del patrón habitual del cliente." />
              </Field>
              <Field label="Variables" hint="Variables que evidencian este comportamiento.">
                <VariablePicker value={editingFlag.variables} onChange={(v) => setEditingFlag({ ...editingFlag, variables: v })} />
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowFlagForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={saveFlag} disabled={!editingFlag.name.trim()}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {editingFlag.id ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modus operandi modal */}
      {showMOForm && editingMO && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowMOForm(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">{editingMO.id ? "Editar modus operandi" : "Nuevo modus operandi"}</h3>
              <button onClick={() => setShowMOForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nombre del caso">
                <input value={editingMO.title} onChange={(e) => setEditingMO({ ...editingMO, title: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" placeholder="Ej: Vishing con suplantación de soporte" />
              </Field>
              <Field label="Descripción del caso" hint="Caso concreto: actores, canales y nombres reales de la infraestructura del banco involucrados — no una categoría abstracta.">
                <textarea value={editingMO.narrative} onChange={(e) => setEditingMO({ ...editingMO, narrative: e.target.value })}
                  rows={4} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                  placeholder="Ej: Un tercero llama por teléfono al cliente haciéndose pasar por soporte de Stripe, lo convence de compartir el código OTP y retira los fondos por transferencia inmediata." />
              </Field>
              <Field label="Taxonomía" hint="Categoría de fraude que este caso aplica en la práctica.">
                <select value={editingMO.taxonomyId} onChange={(e) => setEditingMO({ ...editingMO, taxonomyId: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                  <option value="" disabled>Selecciona una taxonomía</option>
                  {settings.taxonomies.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                </select>
              </Field>
              <Field label="Red flag (opcional)" hint="Señal asociada, si aplica.">
                <select value={editingMO.redFlagId ?? ""} onChange={(e) => setEditingMO({ ...editingMO, redFlagId: e.target.value || null })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                  <option value="">Ninguna</option>
                  {settings.redFlags.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowMOForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={saveMO} disabled={!editingMO.title.trim() || !editingMO.narrative.trim() || !editingMO.taxonomyId}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {editingMO.id ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New config modal */}
      {newConfigForm && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setNewConfigForm(null)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">Nueva configuración</h3>
              <button onClick={() => setNewConfigForm(null)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nombre">
                <input value={newConfigForm.name} onChange={(e) => setNewConfigForm({ ...newConfigForm, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" placeholder="Ej: Canario 5%" />
              </Field>
              <Field label="Basada en" hint="Clona las taxonomías, límites y prompts de la configuración elegida.">
                <select value={newConfigForm.baseId} onChange={(e) => setNewConfigForm({ ...newConfigForm, baseId: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                  {configs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setNewConfigForm(null)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={createConfig} disabled={!newConfigForm.name.trim()}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                Crear borrador
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy to production modal */}
      {deployTarget && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={closeDeploy}>
          <div className="bg-card rounded-xl border border-border w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                <h3 className="text-[14px] font-semibold text-text-primary">Desplegar v{deployTarget.version} a producción</h3>
              </div>
              <button onClick={closeDeploy} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-[12px] text-text-secondary">
                Esta versión de <span className="font-medium text-text-primary">{configs.find((c) => c.id === deployTarget.configId)?.name}</span> reemplazará la configuración activa en producción. Elige cómo aplicar el cambio.
              </p>

              <div className="space-y-2.5">
                <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${deployMode === "immediate" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}>
                  <input type="radio" name="deploy-mode" checked={deployMode === "immediate"} onChange={() => setDeployMode("immediate")} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                      <Zap className="h-3.5 w-3.5 text-warning" /> Despliegue inmediato
                    </span>
                    <p className="text-[12px] text-text-secondary mt-0.5">La versión reemplaza la configuración de producción de inmediato. Las alertas en curso se procesan con la nueva configuración tan pronto se confirme.</p>
                  </span>
                </label>

                <label className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${!deployWindowEnabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${deployMode === "window" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}>
                  <input type="radio" name="deploy-mode" checked={deployMode === "window"} disabled={!deployWindowEnabled} onChange={() => setDeployMode("window")} className="mt-0.5" />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
                      <Clock className="h-3.5 w-3.5 text-primary" /> Despliegue en ventana
                    </span>
                    {deployWindowEnabled ? (
                      <p className="text-[12px] text-text-secondary mt-0.5">Se aplica en la próxima ventana de migración (<span className="font-medium text-text-primary">{deployWindowHour}</span>): ARIA cierra la cola de alertas pendientes, aplica esta versión y reinicia la operación.</p>
                    ) : (
                      <p className="text-[12px] text-text-secondary mt-0.5">Esta versión no tiene ventana de migración configurada. Actívala en la pestaña General para usar esta opción.</p>
                    )}
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-text-primary mb-1">Escribe CONFIRMAR para autorizar el despliegue</label>
                <input value={deployConfirmText} onChange={(e) => setDeployConfirmText(e.target.value)} placeholder="CONFIRMAR"
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={closeDeploy} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={confirmDeploy} disabled={!canConfirmDeploy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                <Rocket className="h-4 w-4" /> {deployMode === "immediate" ? "Desplegar ahora" : "Programar despliegue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

/* ─── Tag input (free-text chips) ───────────────────── */

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = input.trim().replace(/,$/, "");
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
    if (e.key === "Backspace" && !input && value.length > 0) onChange(value.slice(0, -1));
  };

  return (
    <div onClick={() => inputRef.current?.focus()} className="min-h-[40px] flex flex-wrap gap-1.5 items-center rounded-md border border-border px-3 py-2 cursor-text focus-within:border-primary">
      {value.map((f) => (
        <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[12px]">
          {f}<button type="button" onClick={() => onChange(value.filter((x) => x !== f))}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onBlur={commit}
        placeholder={value.length === 0 ? placeholder ?? "" : ""}
        className="flex-1 min-w-[120px] text-[13px] outline-none bg-transparent" />
    </div>
  );
}

/* ─── Variable pool picker ──────────────────────────── */

function VariablePicker({ value, onChange, pool = ALL_VARIABLES }: { value: string[]; onChange: (v: string[]) => void; pool?: string[] }) {
  const [search, setSearch] = useState("");
  const available = pool.filter((v) => !value.includes(v) && v.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {value.length === 0 && <span className="text-[11px] text-text-secondary">Sin variables seleccionadas.</span>}
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-medium">
            {v}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="hover:text-danger transition-colors"><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar variable…"
        className="w-full h-8 rounded-md border border-border px-3 text-[12px] focus:outline-none focus:border-primary" />
      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
        {available.length === 0 && <span className="text-[11px] text-text-secondary">Sin coincidencias.</span>}
        {available.map((v) => (
          <button key={v} type="button" onClick={() => onChange([...value, v])}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-text-secondary text-[11px] hover:border-primary hover:text-primary transition-colors">
            <Plus className="h-3 w-3" /> {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Sampling distribution editor ──────────────────── */

function SamplingDistributionEditor({ value, onChange }: { value: SamplingCriterion[]; onChange: (v: SamplingCriterion[]) => void }) {
  const updateCriterion = (id: string, patch: Partial<SamplingCriterion>) =>
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addCriterion = () =>
    onChange([...value, { id: `crit-${Date.now()}`, name: "Nuevo criterio", values: [{ id: `v-${Date.now()}`, label: "Valor", pct: 100 }] }]);

  const removeCriterion = (id: string) => onChange(value.filter((c) => c.id !== id));

  const updateValue = (critId: string, valId: string, patch: Partial<DistributionValue>) =>
    updateCriterion(critId, { values: value.find((c) => c.id === critId)!.values.map((v) => (v.id === valId ? { ...v, ...patch } : v)) });

  const addValue = (critId: string) =>
    updateCriterion(critId, { values: [...value.find((c) => c.id === critId)!.values, { id: `v-${Date.now()}`, label: "Nuevo valor", pct: 0 }] });

  const removeValue = (critId: string, valId: string) => {
    const criterion = value.find((c) => c.id === critId)!;
    if (criterion.values.length <= 1) return;
    updateCriterion(critId, { values: criterion.values.filter((v) => v.id !== valId) });
  };

  return (
    <div className="space-y-4">
      {value.map((c) => {
        const total = c.values.reduce((sum, v) => sum + v.pct, 0);
        return (
          <div key={c.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center gap-2 mb-2">
              <input value={c.name} onChange={(e) => updateCriterion(c.id, { name: e.target.value })}
                className="h-8 rounded-md border border-border px-2 text-[13px] font-medium focus:outline-none focus:border-primary" />
              <span className={`text-[11px] font-mono ml-1 ${total === 100 ? "text-success" : "text-warning"}`}>{total}% {total === 100 ? "" : "(debería sumar 100%)"}</span>
              <button onClick={() => removeCriterion(c.id)} className="ml-auto p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {c.values.map((v) => (
                <div key={v.id} className="flex items-center gap-2">
                  <input value={v.label} onChange={(e) => updateValue(c.id, v.id, { label: e.target.value })}
                    className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary" />
                  <input type="number" min={0} max={100} value={v.pct} onChange={(e) => updateValue(c.id, v.id, { pct: Number(e.target.value) })}
                    className="w-16 h-8 rounded-md border border-border px-2 text-[12px] text-right focus:outline-none focus:border-primary" />
                  <span className="text-[11px] text-text-secondary">%</span>
                  <button onClick={() => removeValue(c.id, v.id)} disabled={c.values.length <= 1} className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addValue(c.id)} className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-primary hover:underline">
              <Plus className="h-3 w-3" /> Agregar valor
            </button>
          </div>
        );
      })}
      <button onClick={addCriterion} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
        <Plus className="h-3.5 w-3.5" /> Nuevo criterio de filtrado
      </button>
    </div>
  );
}

/* ─── Analyst capacity editor ────────────────────────── */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function AnalystCapacityEditor({ value, onChange }: { value: AnalystCapacity; onChange: (v: AnalystCapacity) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<"idle" | "loading" | "done">("idle");
  const [importInfo, setImportInfo] = useState<{ file: string; count: number } | null>(null);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportState("loading");
    setTimeout(() => {
      const mockProfiles: DayProfile[] = [
        { id: `imp-fin-semana-${Date.now()}`, name: "Fin de semana", description: "Demanda reducida, cobertura mínima sábados y domingos.", hourly: Array(24).fill(2) },
        { id: `imp-cierre-mes-${Date.now() + 1}`, name: "Cierre de mes", description: "Pico de alertas por conciliación y cierre contable.", hourly: Array(24).fill(10) },
      ];
      onChange({ ...value, profiles: [...value.profiles, ...mockProfiles] });
      setImportState("done");
      setImportInfo({ file: file.name, count: mockProfiles.length });
      setTimeout(() => setImportState("idle"), 3000);
    }, 1200);
  };

  const colorFor = (profileId: string) => {
    const idx = value.profiles.findIndex((p) => p.id === profileId);
    return PROFILE_COLORS[idx % PROFILE_COLORS.length] ?? "bg-text-secondary/10 text-text-secondary border-border";
  };

  const updateProfile = (id: string, patch: Partial<DayProfile>) =>
    onChange({ ...value, profiles: value.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const updateHour = (id: string, hour: number, hourly: number) =>
    updateProfile(id, { hourly: value.profiles.find((p) => p.id === id)!.hourly.map((h, i) => (i === hour ? hourly : h)) });

  const addProfile = () => {
    const id = `profile-${Date.now()}`;
    onChange({ ...value, profiles: [...value.profiles, { id, name: "Nuevo perfil", description: "", hourly: Array(24).fill(4) }] });
  };

  const removeProfile = (id: string) => {
    if (value.profiles.length <= 1) return;
    const remainingProfiles = value.profiles.filter((p) => p.id !== id);
    const defaultProfileId = value.defaultProfileId === id ? remainingProfiles[0].id : value.defaultProfileId;
    const dayOverrides = Object.fromEntries(Object.entries(value.dayOverrides).filter(([, pid]) => pid !== id));
    onChange({ profiles: remainingProfiles, defaultProfileId, dayOverrides });
  };

  const cycleDay = (day: number) => {
    const current = value.dayOverrides[day] ?? value.defaultProfileId;
    const idx = value.profiles.findIndex((p) => p.id === current);
    const next = value.profiles[(idx + 1) % value.profiles.length];
    const dayOverrides = { ...value.dayOverrides };
    if (next.id === value.defaultProfileId) delete dayOverrides[day];
    else dayOverrides[day] = next.id;
    onChange({ ...value, dayOverrides });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[12px] font-medium text-text-secondary">Perfiles de disponibilidad (analistas por hora)</p>
          <div className="flex items-center gap-3">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={importState === "loading"}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
              {importState === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
              {importState === "loading" ? "Importando…" : "Cargar desde Excel"}
            </button>
            <button onClick={addProfile} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline">
              <Plus className="h-3.5 w-3.5" /> Nuevo perfil
            </button>
          </div>
        </div>
        {importState === "done" && importInfo && (
          <p className="text-[11px] text-success mb-2">Se importaron {importInfo.count} perfiles desde "{importInfo.file}" (simulado).</p>
        )}
        <div className="space-y-4 mt-3">
          {value.profiles.map((p) => (
            <div key={p.id} className={`rounded-lg border p-3 ${colorFor(p.id)}`}>
              <div className="flex items-center gap-2 mb-2">
                <input value={p.name} onChange={(e) => updateProfile(p.id, { name: e.target.value })}
                  className="h-8 rounded-md border border-border px-2 text-[13px] font-medium bg-card focus:outline-none focus:border-primary" />
                <label className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary ml-2">
                  <input type="radio" name="defaultProfile" checked={value.defaultProfileId === p.id} onChange={() => onChange({ ...value, defaultProfileId: p.id })} />
                  Perfil por defecto
                </label>
                <button onClick={() => removeProfile(p.id)} disabled={value.profiles.length <= 1} className="ml-auto p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input value={p.description} onChange={(e) => updateProfile(p.id, { description: e.target.value })} placeholder="Descripción del perfil (ej. cuándo aplica, qué lo distingue)"
                className="w-full h-8 rounded-md border border-border px-2 text-[12px] bg-card focus:outline-none focus:border-primary mb-2" />
              <div className="flex gap-1 overflow-x-auto pb-1">
                {HOURS.map((h) => (
                  <div key={h} className="flex flex-col items-center shrink-0">
                    <span className="text-[9px] text-text-secondary font-mono mb-0.5">{h}</span>
                    <input type="number" min={0} value={p.hourly[h]} onChange={(e) => updateHour(p.id, h, Number(e.target.value))}
                      className="w-9 h-8 rounded border border-border px-1 text-[11px] text-center bg-card focus:outline-none focus:border-primary" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium text-text-secondary mb-2">Asignación por día del mes</p>
        <p className="text-[11px] text-text-secondary mb-3">Clic sobre un día para rotar entre perfiles. Patrón recurrente: aplica todos los meses (ej. días de pago 15, 20, 30).</p>
        <div className="grid grid-cols-7 gap-1.5 max-w-lg">
          {DAYS.map((d) => {
            const profileId = value.dayOverrides[d] ?? value.defaultProfileId;
            const profile = value.profiles.find((p) => p.id === profileId);
            return (
              <button key={d} onClick={() => cycleDay(d)} title={profile?.name}
                className={`h-9 rounded-md border text-[12px] font-mono transition-colors ${colorFor(profileId)}`}>
                {d}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {value.profiles.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
              <span className={`h-2.5 w-2.5 rounded-full border ${colorFor(p.id)}`} /> {p.name}{p.id === value.defaultProfileId && " (defecto)"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Shortage behavior editor ──────────────────────── */

function ShortageBehaviorEditor({ value, onChange, name }: { value: ShortageBehavior; onChange: (v: ShortageBehavior) => void; name: string }) {
  return (
    <div className="space-y-3">
      <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${value.action === "block-soft" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}>
        <input type="radio" name={name} checked={value.action === "block-soft"}
          onChange={() => onChange({ ...value, action: "block-soft" })} className="mt-0.5" />
        <span>
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
            <ShieldAlert className="h-3.5 w-3.5 text-warning" /> Marcar como riesgoso y aplicar bloqueo soft
          </span>
          <p className="text-[12px] text-text-secondary mt-0.5">ARIA marca la alerta como riesgosa y aplica un bloqueo soft sobre la cuenta mientras se resuelve la falta de capacidad.</p>
        </span>
      </label>
      <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${value.action === "custom" ? "border-primary bg-primary/5" : "border-border hover:bg-surface"}`}>
        <input type="radio" name={name} checked={value.action === "custom"}
          onChange={() => onChange({ ...value, action: "custom" })} className="mt-0.5" />
        <span className="flex-1">
          <span className="text-[13px] font-medium text-text-primary">Otro comportamiento</span>
          <p className="text-[12px] text-text-secondary mt-0.5 mb-2">Define una acción alternativa.</p>
          <textarea value={value.customText} disabled={value.action !== "custom"}
            onChange={(e) => onChange({ ...value, customText: e.target.value })} rows={2}
            placeholder="Ej: Dejar la alerta en cola de prioridad y notificar al supervisor de turno."
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none disabled:bg-surface disabled:text-text-secondary" />
        </span>
      </label>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-text-primary mb-1">{label}</label>
      {hint && <p className="text-[11px] text-text-secondary mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function LimitField({ label, hint, value, onChange, min, max, step = 1, suffix }: { label: string; hint: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; suffix: string }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-text-primary">{label}</label>
      <p className="text-[12px] text-text-secondary mt-0.5 mb-2">{hint}</p>
      <div className="flex items-center gap-3">
        <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
        {suffix && <span className="text-[12px] text-text-secondary">{suffix}</span>}
        <span className="text-[11px] text-text-secondary ml-auto">rango {min}–{max}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full mt-2 accent-primary" />
    </div>
  );
}
