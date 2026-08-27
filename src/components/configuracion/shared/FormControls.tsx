import { Plus, Trash2, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ALL_VARIABLES, type DistributionValue, type SamplingCriterion } from "@/data/configs";

/* ─── Shared form controls, extracted verbatim from configuracion.tsx ──
   (Phase 2) so the new per-segment components (SegmentMonitoringSection,
   SegmentAgentSection) can reuse them without duplicating logic.
   configuracion.tsx imports Field/LimitField back for its own remaining
   general/infra/ops/test usages. */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-text-primary mb-1">{label}</label>
      {hint && <p className="text-[11px] text-text-secondary mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

export function LimitField({ label, hint, value, onChange, min, max, step = 1, suffix }: { label: string; hint: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; suffix: string }) {
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

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
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

export function VariablePicker({ value, onChange, pool = ALL_VARIABLES }: { value: string[]; onChange: (v: string[]) => void; pool?: string[] }) {
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

export function SamplingDistributionEditor({ value, onChange }: { value: SamplingCriterion[]; onChange: (v: SamplingCriterion[]) => void }) {
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
