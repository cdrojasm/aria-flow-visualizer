import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, KeyboardEvent } from "react";
import {
  Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, CheckCircle2,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      { name: "description", content: "Ajustes del agente ARIA." },
    ],
  }),
  component: ConfiguracionPage,
});

/* ─── Types ──────────────────────────────────────────── */

type Taxonomy = { id: string; code: string; name: string; redFlags: string[]; description: string; active: boolean };
type AgentConfig = { id: string; name: string; description: string; env: "production" | "staging" | "canary" };

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

const initialTaxonomies: Taxonomy[] = [
  { id: "tx-1", code: "FRD-CARD", name: "Fraude con tarjeta", redFlags: ["Transacción nocturna", "País distinto al habitual", "Monto elevado"], description: "Uso no autorizado de tarjeta de crédito/débito.", active: true },
  { id: "tx-2", code: "PHISH", name: "Phishing", redFlags: ["Link sospechoso", "Cambio de datos de contacto"], description: "Suplantación de identidad por canales digitales.", active: true },
  { id: "tx-3", code: "AML", name: "Lavado de activos", redFlags: ["Múltiples transferencias pequeñas", "Cuentas mula relacionadas", "Origen de fondos dudoso"], description: "Patrones sospechosos de movimientos.", active: true },
  { id: "tx-4", code: "ID-THEFT", name: "Robo de identidad", redFlags: ["Apertura de cuenta sin presencia física"], description: "Apertura o uso de cuentas con identidad ajena.", active: true },
  { id: "tx-5", code: "MULE", name: "Cuenta mula", redFlags: ["Mucho flujo de entrada/salida", "Titular joven sin historial"], description: "Cuentas usadas como puente para transferencias ilícitas.", active: false },
];

const ALL_ALERT_FIELDS = [
  "Altamira", "Documento", "Celular", "Nombre del cliente", "Teléfono adicional",
  "Segmento", "Fecha de alta", "Correo", "Saldo", "Dirección", "Fecha de nacimiento",
  "Segmento empresa", "País de origen", "Canal de ingreso", "Tipo de cuenta",
  "Última transacción", "Número de cuenta", "Oficina", "Producto",
];

/* ─── Page ───────────────────────────────────────────── */

function ConfiguracionPage() {
  const [selectedConfig, setSelectedConfig] = useState("cfg-prod");

  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>(initialTaxonomies);
  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [maxInstances, setMaxInstances] = useState(8);
  const [autoScale, setAutoScale] = useState(true);

  const [perfilUsuario, setPerfilUsuario] = useState("");
  const [perfilTransaccion, setPerfilTransaccion] = useState("");
  const [perfilTransaccional, setPerfilTransaccional] = useState("");

  const [camposOpen, setCamposOpen] = useState(false);
  const [activeFields, setActiveFields] = useState<string[]>(["Altamira", "Documento", "Celular", "Nombre del cliente", "Saldo"]);
  const [fieldSearch, setFieldSearch] = useState("");

  const [pickDenominator, setPickDenominator] = useState(150);
  const [promptClasificacion, setPromptClasificacion] = useState("");
  const [promptAnalista, setPromptAnalista] = useState("");
  const [promptMonitoreo, setPromptMonitoreo] = useState("");

  const [saved, setSaved] = useState(false);

  const openCreate = () => { setEditing({ id: "", code: "", name: "", redFlags: [], description: "", active: true }); setShowForm(true); };
  const openEdit = (t: Taxonomy) => { setEditing({ ...t, redFlags: [...t.redFlags] }); setShowForm(true); };
  const remove = (id: string) => setTaxonomies((rs) => rs.filter((r) => r.id !== id));
  const saveTax = () => {
    if (!editing || !editing.code.trim() || !editing.name.trim()) return;
    setTaxonomies((rs) => editing.id ? rs.map((r) => (r.id === editing.id ? editing : r)) : [...rs, { ...editing, id: `tx-${Date.now()}` }]);
    setShowForm(false); setEditing(null);
  };

  const addField = (f: string) => { if (!activeFields.includes(f)) setActiveFields((p) => [...p, f]); };
  const removeField = (f: string) => setActiveFields((p) => p.filter((x) => x !== f));
  const filteredAvailable = ALL_ALERT_FIELDS.filter((f) => !activeFields.includes(f) && f.toLowerCase().includes(fieldSearch.toLowerCase()));

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header className="mb-2">
          <h1 className="text-[20px] font-semibold text-text-primary">Configuración del Agente</h1>
          <p className="text-[13px] text-text-secondary mt-1">Ajusta taxonomías, límites, perfilamiento y monitoreo de ARIA.</p>
        </header>

        {/* Config selector */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
          <h2 className="text-[12px] font-semibold text-text-secondary uppercase tracking-wider mb-3">Configuración activa</h2>
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

        {/* Taxonomías */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Taxonomías de fraude</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">Categorías que el agente puede asignar a cada alerta.</p>
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
                <th className="px-3 py-2 font-medium">Red flags</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium w-24"></th>
              </tr>
            </thead>
            <tbody>
              {taxonomies.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface">
                  <td className="px-6 py-3 font-mono text-[12px]">{t.code}</td>
                  <td className="px-3 py-3 font-medium text-text-primary">{t.name}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.redFlags.length === 0
                        ? <span className="text-text-secondary text-[12px]">—</span>
                        : t.redFlags.map((f) => <span key={f} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">{f}</span>)}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-text-secondary max-w-xs truncate">{t.description}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] uppercase tracking-wider ${t.active ? "text-success" : "text-text-secondary"}`}>{t.active ? "Activa" : "Inactiva"}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(t.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {taxonomies.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-text-secondary">Sin taxonomías configuradas.</td></tr>}
            </tbody>
          </table>
        </section>

        {/* Límites */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Límites operativos</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Controla el consumo de recursos del agente.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <LimitField label="Máxima cantidad de instancias del agente" hint="Número máximo de sub-agentes ejecutándose en paralelo." value={maxInstances} onChange={setMaxInstances} min={1} max={32} suffix="instancias" />
            <div className="flex flex-col">
              <label className="text-[13px] font-medium text-text-primary">Autoescalado de instancias</label>
              <p className="text-[12px] text-text-secondary mt-0.5 mb-3">Permitir que ARIA escale dinámicamente hasta el límite definido.</p>
              <button onClick={() => setAutoScale((v) => !v)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoScale ? "bg-primary" : "bg-border"}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${autoScale ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Perfilamiento */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Perfilamiento</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Instrucciones de perfilamiento que el agente utiliza al analizar entidades.</p>
          </div>
          <div className="p-6 grid grid-cols-1 gap-5">
            <Field label="Perfilamiento de usuario" hint="Describe cómo el agente debe construir el perfil del titular de la cuenta.">
              <textarea value={perfilUsuario} onChange={(e) => setPerfilUsuario(e.target.value)} rows={3} placeholder="Ej: Considerar historial de 12 meses, segmento, antigüedad y canales habituales." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
            </Field>
            <Field label="Perfilamiento de transacción" hint="Describe cómo el agente evalúa una transacción individual.">
              <textarea value={perfilTransaccion} onChange={(e) => setPerfilTransaccion(e.target.value)} rows={3} placeholder="Ej: Comparar monto, canal, horario y geolocalización contra la media del cliente." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
            </Field>
            <Field label="Perfil transaccional" hint="Parámetros que definen el comportamiento transaccional esperado del cliente.">
              <textarea value={perfilTransaccional} onChange={(e) => setPerfilTransaccional(e.target.value)} rows={3} placeholder="Ej: Volumen semanal habitual, tope de transferencias, frecuencia por canal." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
            </Field>
          </div>
        </section>

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
            <div className="p-6 space-y-5">
              <div>
                <p className="text-[12px] font-medium text-text-secondary mb-2">Campos activos ({activeFields.length})</p>
                <div className="flex flex-wrap gap-2 min-h-[36px]">
                  {activeFields.length === 0 && <span className="text-[12px] text-text-secondary">Ningún campo seleccionado.</span>}
                  {activeFields.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-medium">
                      {f}<button onClick={() => removeField(f)} className="hover:text-danger transition-colors"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[12px] font-medium text-text-secondary mb-2">Campos disponibles</p>
                <input value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} placeholder="Buscar campo…" className="w-full h-8 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary mb-2" />
                <div className="flex flex-wrap gap-2">
                  {filteredAvailable.length === 0 && <span className="text-[12px] text-text-secondary">Todos los campos están activos.</span>}
                  {filteredAvailable.map((f) => (
                    <button key={f} onClick={() => addField(f)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-text-secondary text-[12px] hover:border-primary hover:text-primary transition-colors">
                      <Plus className="h-3 w-3" /> {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Monitoreo */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Monitoreo</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Configuración de supervisión y evaluación continua del agente.</p>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-[13px] font-medium text-text-primary">Pick each alerts to assess</label>
              <p className="text-[12px] text-text-secondary mt-0.5 mb-3">Fracción de alertas seleccionadas para evaluación aleatoria de calidad.</p>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-text-secondary font-mono">1 /</span>
                <input type="number" value={pickDenominator} min={1} max={10000} onChange={(e) => setPickDenominator(Number(e.target.value))}
                  className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                <span className="text-[12px] text-text-secondary">alertas</span>
                <span className="text-[11px] text-text-secondary ml-auto font-mono">≈ {(1 / pickDenominator * 100).toFixed(2)} %</span>
              </div>
              <input type="range" min={1} max={500} value={pickDenominator} onChange={(e) => setPickDenominator(Number(e.target.value))} className="w-full mt-2 accent-primary" />
            </div>
            <div className="grid grid-cols-1 gap-5">
              <Field label="Prompt de evaluación — Agente clasificación" hint="Instrucción usada para evaluar la calidad del agente de clasificación.">
                <textarea value={promptClasificacion} onChange={(e) => setPromptClasificacion(e.target.value)} rows={4} placeholder="Ej: Evalúa si la taxonomía asignada es coherente con los indicadores de la alerta." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
              </Field>
              <Field label="Prompt de evaluación — Agente analista" hint="Instrucción usada para evaluar la calidad del agente analista.">
                <textarea value={promptAnalista} onChange={(e) => setPromptAnalista(e.target.value)} rows={4} placeholder="Ej: Verifica que el análisis narrativo sea consistente con los datos disponibles y la taxonomía." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
              </Field>
              <Field label="Prompt de evaluación — Agente monitoreo" hint="Instrucción usada para evaluar la calidad del agente de monitoreo.">
                <textarea value={promptMonitoreo} onChange={(e) => setPromptMonitoreo(e.target.value)} rows={4} placeholder="Ej: Comprueba que las alertas de baja prioridad descartadas realmente no representen riesgo." className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
              </Field>
            </div>
          </div>
        </section>

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pb-6">
          {saved && <span className="text-[12px] text-success">Cambios guardados</span>}
          <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90">
            <Save className="h-4 w-4" /> Guardar cambios
          </button>
        </div>
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
              <Field label="Red flags" hint="Presiona Enter o coma para agregar cada indicador.">
                <RedFlagsInput value={editing.redFlags} onChange={(flags) => setEditing({ ...editing, redFlags: flags })} />
              </Field>
              <Field label="Descripción">
                <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
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
    </DashboardLayout>
  );
}

/* ─── Red flags input ────────────────────────────────── */

function RedFlagsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
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
        placeholder={value.length === 0 ? "Ej: Transacción nocturna" : ""}
        className="flex-1 min-w-[120px] text-[13px] outline-none bg-transparent" />
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
