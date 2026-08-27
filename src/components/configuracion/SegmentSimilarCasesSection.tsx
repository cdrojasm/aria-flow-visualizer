import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { SegmentAgentConfig, SimilarCase } from "@/data/configs";
import { Field } from "./shared/FormControls";

/* ─── Similar cases for one segment (Phase 3) ───────────
   New to the frontend - the backend ExampleCase/SimilarCaseDocument
   concept had zero UI before. A similar case belongs to exactly one
   modus operandi (+ its taxonomy, denormalized) - no M2M here, unlike
   flags. The user expresses the case in terms of red/yellow flags and
   particular features as free text, without deep-diving into specifics. */

export function SegmentSimilarCasesSection({
  value,
  onChange,
  disabled,
}: {
  value: SegmentAgentConfig;
  onChange: (patch: Partial<SegmentAgentConfig>) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState<SimilarCase | null>(null);
  const [showForm, setShowForm] = useState(false);

  const openCreate = () => {
    const firstMO = value.modusOperandi[0];
    setEditing({ id: "", text: "", modusOperandiId: firstMO?.id ?? "", taxonomyId: firstMO?.taxonomyId ?? "" });
    setShowForm(true);
  };
  const openEdit = (c: SimilarCase) => { setEditing({ ...c }); setShowForm(true); };
  const remove = (id: string) => onChange({ similarCases: value.similarCases.filter((c) => c.id !== id) });
  const save = () => {
    if (!editing || !editing.text.trim() || !editing.modusOperandiId) return;
    const similarCases = editing.id
      ? value.similarCases.map((c) => (c.id === editing.id ? editing : c))
      : [...value.similarCases, { ...editing, id: `sc-${Date.now()}` }];
    onChange({ similarCases });
    setShowForm(false); setEditing(null);
  };

  const modusOperandiForTaxonomy = (taxonomyId: string) =>
    value.modusOperandi.filter((m) => m.taxonomyId === taxonomyId);

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">Casos similares</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">Ejemplos, en texto libre, de cómo se manifiesta un modus operandi — en términos de red/yellow flags y particularidades del caso, sin profundizar en detalles técnicos.</p>
          </div>
          <button onClick={openCreate} disabled={disabled || value.modusOperandi.length === 0} className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="h-4 w-4" /> Nuevo caso
          </button>
        </div>
        <div className="divide-y divide-border">
          {value.similarCases.map((c) => {
            const mo = value.modusOperandi.find((m) => m.id === c.modusOperandiId);
            return (
              <div key={c.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] text-text-primary">{c.text}</p>
                  <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">{mo ? mo.title : "Modus operandi eliminado"}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(c)} disabled={disabled} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(c.id)} disabled={disabled} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
          {value.similarCases.length === 0 && <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin casos similares configurados.</p>}
        </div>
      </section>

      {showForm && editing && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">{editing.id ? "Editar caso similar" : "Nuevo caso similar"}</h3>
              <button onClick={() => setShowForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Taxonomía">
                <select value={editing.taxonomyId} onChange={(e) => {
                  const taxonomyId = e.target.value;
                  const firstMO = modusOperandiForTaxonomy(taxonomyId)[0];
                  setEditing({ ...editing, taxonomyId, modusOperandiId: firstMO?.id ?? "" });
                }} className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                  {value.taxonomies.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                </select>
              </Field>
              <Field label="Modus operandi" hint="Caso concreto al que pertenece este ejemplo.">
                <select value={editing.modusOperandiId} onChange={(e) => setEditing({ ...editing, modusOperandiId: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                  <option value="" disabled>Selecciona un modus operandi</option>
                  {modusOperandiForTaxonomy(editing.taxonomyId).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </Field>
              <Field label="Descripción del caso" hint="Texto libre: red/yellow flags observadas y particularidades del caso, sin profundizar en detalles técnicos.">
                <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  rows={4} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                  placeholder="Ej: Cliente reporta llamada de 'soporte' pidiendo el código OTP; minutos después se registra una transferencia a un tercero nuevo." />
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
              <button onClick={save} disabled={!editing.text.trim() || !editing.modusOperandiId}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {editing.id ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
