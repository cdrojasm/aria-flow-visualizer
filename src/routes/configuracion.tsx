import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, Trash2, Save, X, AlertTriangle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

export const Route = createFileRoute("/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · ARIA" },
      { name: "description", content: "Ajustes del agente ARIA: taxonomías de fraude, límites de instancias y cuotas de API." },
    ],
  }),
  component: ConfiguracionPage,
});

type Taxonomy = {
  id: string;
  code: string;
  name: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  active: boolean;
};

const initialTaxonomies: Taxonomy[] = [
  { id: "tx-1", code: "FRD-CARD", name: "Fraude con tarjeta", severity: "high", description: "Uso no autorizado de tarjeta de crédito/débito.", active: true },
  { id: "tx-2", code: "PHISH", name: "Phishing", severity: "medium", description: "Suplantación de identidad por canales digitales.", active: true },
  { id: "tx-3", code: "AML", name: "Lavado de activos", severity: "critical", description: "Patrones sospechosos de movimientos.", active: true },
  { id: "tx-4", code: "ID-THEFT", name: "Robo de identidad", severity: "high", description: "Apertura o uso de cuentas con identidad ajena.", active: true },
  { id: "tx-5", code: "MULE", name: "Cuenta mula", severity: "medium", description: "Cuentas usadas como puente para transferencias ilícitas.", active: false },
];

const severityStyles: Record<Taxonomy["severity"], string> = {
  low: "bg-success/10 text-success",
  medium: "bg-warning/10 text-warning",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-danger/10 text-danger",
};

const severityLabel: Record<Taxonomy["severity"], string> = {
  low: "Baja", medium: "Media", high: "Alta", critical: "Crítica",
};

function ConfiguracionPage() {
  const [taxonomies, setTaxonomies] = useState<Taxonomy[]>(initialTaxonomies);
  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [maxInstances, setMaxInstances] = useState(8);
  const [maxApiRpm, setMaxApiRpm] = useState(600);
  const [aricTimeout, setAricTimeout] = useState(2500);
  const [autoScale, setAutoScale] = useState(true);
  const [saved, setSaved] = useState(false);

  const openCreate = () => { setEditing({ id: "", code: "", name: "", severity: "medium", description: "", active: true }); setShowForm(true); };
  const openEdit = (t: Taxonomy) => { setEditing({ ...t }); setShowForm(true); };
  const remove = (id: string) => setTaxonomies((rs) => rs.filter((r) => r.id !== id));
  const save = () => {
    if (!editing) return;
    if (!editing.code.trim() || !editing.name.trim()) return;
    setTaxonomies((rs) =>
      editing.id ? rs.map((r) => (r.id === editing.id ? editing : r)) : [...rs, { ...editing, id: `tx-${Date.now()}` }]
    );
    setShowForm(false); setEditing(null);
  };

  const saveLimits = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px]">
        <header className="mb-6">
          <h1 className="text-[20px] font-semibold text-text-primary">Configuración del Agente</h1>
          <p className="text-[13px] text-text-secondary mt-1">Ajusta taxonomías de fraude y los límites operativos del agente ARIA.</p>
        </header>

        {/* Taxonomías */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] mb-6">
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
                <th className="px-3 py-2 font-medium">Severidad</th>
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
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${severityStyles[t.severity]}`}>{severityLabel[t.severity]}</span>
                  </td>
                  <td className="px-3 py-3 text-text-secondary max-w-md truncate">{t.description}</td>
                  <td className="px-3 py-3">
                    <span className={`text-[11px] uppercase tracking-wider ${t.active ? "text-success" : "text-text-secondary"}`}>
                      {t.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(t.id)} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {taxonomies.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-text-secondary">Sin taxonomías configuradas.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Límites operativos */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Límites operativos</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">Controla el consumo de recursos del agente y la integración con ARIC.</p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <LimitField
              label="Máxima cantidad de instancias del agente"
              hint="Número máximo de sub-agentes ejecutándose en paralelo."
              value={maxInstances} onChange={setMaxInstances} min={1} max={32} suffix="instancias"
            />
            <LimitField
              label="Máximas peticiones a la API de ARIC"
              hint="Tope de requests por minuto contra el endpoint de ARIC."
              value={maxApiRpm} onChange={setMaxApiRpm} min={60} max={5000} step={10} suffix="req/min"
            />
            <LimitField
              label="Timeout de petición a ARIC"
              hint="Tiempo máximo de espera por respuesta antes de fallback."
              value={aricTimeout} onChange={setAricTimeout} min={500} max={10000} step={100} suffix="ms"
            />
            <div className="flex flex-col">
              <label className="text-[13px] font-medium text-text-primary">Autoescalado de instancias</label>
              <p className="text-[12px] text-text-secondary mt-0.5 mb-3">Permitir que ARIA escale dinámicamente hasta el límite definido.</p>
              <button
                onClick={() => setAutoScale((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoScale ? "bg-primary" : "bg-border"}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${autoScale ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>

          {maxApiRpm > 3000 && (
            <div className="mx-6 mb-4 flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
              <p className="text-[12px] text-warning">Cuotas altas pueden generar throttling en ARIC. Verifica el acuerdo con el proveedor antes de aplicar.</p>
            </div>
          )}

          <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
            {saved && <span className="text-[12px] text-success">Cambios guardados</span>}
            <button onClick={saveLimits} className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90">
              <Save className="h-4 w-4" /> Guardar cambios
            </button>
          </div>
        </section>
      </div>

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
              <Field label="Severidad">
                <select value={editing.severity} onChange={(e) => setEditing({ ...editing, severity: e.target.value as Taxonomy["severity"] })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] bg-white focus:outline-none focus:border-primary">
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="critical">Crítica</option>
                </select>
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
              <button onClick={save} disabled={!editing.code.trim() || !editing.name.trim()}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-text-primary mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function LimitField({
  label, hint, value, onChange, min, max, step = 1, suffix,
}: { label: string; hint: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; suffix: string }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-text-primary">{label}</label>
      <p className="text-[12px] text-text-secondary mt-0.5 mb-2">{hint}</p>
      <div className="flex items-center gap-3">
        <input type="number" value={value} min={min} max={max} step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
        <span className="text-[12px] text-text-secondary">{suffix}</span>
        <span className="text-[11px] text-text-secondary ml-auto">rango {min}–{max}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-primary" />
    </div>
  );
}
