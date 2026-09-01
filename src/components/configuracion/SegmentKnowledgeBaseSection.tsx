import { Library, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { Flag, FlagType, ModusOperandi, SegmentAgentConfig, Taxonomy } from "@/data/configs";
import {
  listFlagLibraryEntries,
  listModusOperandiLibraryEntries,
  listTaxonomyLibraryEntries,
} from "@/lib/api/knowledgeLibrary.functions";
import { SegmentSimilarCasesSection } from "./SegmentSimilarCasesSection";
import { Field, TagInput, VariablePicker } from "./shared/FormControls";

const FLAG_TYPE_STYLES: Record<FlagType, string> = {
  red: "bg-danger/15 text-danger border-danger/40",
  yellow: "bg-warning/15 text-warning border-warning/40",
};
const FLAG_TYPE_LABELS: Record<FlagType, string> = { red: "Roja", yellow: "Amarilla" };

/* ─── Knowledge base for one segment (Phase 3) ──────────
   Taxonomies (+ a shortcut to create a modus operandi straight from a
   row), modus operandi (now with evolvedVariables + active/status), and
   a single unified red/yellow flags table, many-to-many with modus
   operandi (a flag picks any number of MOs; a MO can be picked by any
   number of flags). */

export function SegmentKnowledgeBaseSection({
  value,
  onChange,
  disabled,
}: {
  value: SegmentAgentConfig;
  onChange: (patch: Partial<SegmentAgentConfig>) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMO, setEditingMO] = useState<ModusOperandi | null>(null);
  const [showMOForm, setShowMOForm] = useState(false);
  const [editingFlag, setEditingFlag] = useState<Flag | null>(null);
  const [showFlagForm, setShowFlagForm] = useState(false);

  const [showImportTax, setShowImportTax] = useState(false);
  const [showImportMO, setShowImportMO] = useState(false);
  const [showImportFlag, setShowImportFlag] = useState(false);
  const libraryTaxonomiesQuery = useQuery({
    queryKey: ["libraryTaxonomies"],
    queryFn: () => listTaxonomyLibraryEntries({ data: { activeOnly: true } }),
    enabled: showImportTax || showImportMO,
  });
  const libraryModusOperandiQuery = useQuery({
    queryKey: ["libraryModusOperandi"],
    queryFn: () => listModusOperandiLibraryEntries({ data: { activeOnly: true } }),
    enabled: showImportMO,
  });
  const libraryFlagsQuery = useQuery({
    queryKey: ["libraryFlags"],
    queryFn: () => listFlagLibraryEntries({ data: { activeOnly: true } }),
    enabled: showImportFlag,
  });
  const libraryTaxonomies = libraryTaxonomiesQuery.data ?? [];
  const libraryModusOperandi = libraryModusOperandiQuery.data ?? [];
  const libraryFlags = libraryFlagsQuery.data ?? [];

  // Snapshot-copy from the global biblioteca (see routes/biblioteca.tsx) -
  // never a live reference, matches the confirmed backlog decision.
  // Matched by `code` (taxonomies) so re-importing an already-imported
  // entry is a no-op instead of a duplicate row.
  const importTaxonomy = (entry: Taxonomy) => {
    if (value.taxonomies.some((t) => t.code === entry.code)) { setShowImportTax(false); return; }
    onChange({ taxonomies: [...value.taxonomies, { ...entry, id: `tx-${Date.now()}`, active: true }] });
    setShowImportTax(false);
  };

  // MOs need a local taxonomyId - cascades the parent taxonomy in too
  // (matched/created the same way as importTaxonomy) so the imported MO
  // never dangles on a taxonomy that doesn't exist in this segment yet.
  const importModusOperandi = (entry: (typeof libraryModusOperandi)[number]) => {
    const libTax = libraryTaxonomies.find((t) => t.id === entry.taxonomy_library_id);
    let taxonomies = value.taxonomies;
    let localTax = libTax ? taxonomies.find((t) => t.code === libTax.code) : undefined;
    if (!localTax && libTax) {
      localTax = { id: `tx-${Date.now()}`, code: libTax.code, name: libTax.name, description: libTax.description, variables: [...libTax.variables], examples: [...libTax.examples], active: true };
      taxonomies = [...taxonomies, localTax];
    }
    if (!localTax) { setShowImportMO(false); return; }
    if (value.modusOperandi.some((m) => m.title === entry.title && m.taxonomyId === localTax!.id)) {
      onChange({ taxonomies });
      setShowImportMO(false);
      return;
    }
    const modusOperandi = [...value.modusOperandi, {
      id: `mo-${Date.now()}`, title: entry.title, narrative: entry.narrative, taxonomyId: localTax.id,
      evolvedVariables: [...entry.evolved_variables], active: true,
    }];
    onChange({ taxonomies, modusOperandi });
    setShowImportMO(false);
  };

  // modusOperandiIds intentionally starts empty - there's no reliable
  // natural key to match a library MO to a local one (titles aren't
  // guaranteed unique), so re-linking is left to the existing flag edit
  // modal rather than guessing.
  const importFlag = (entry: (typeof libraryFlags)[number]) => {
    if (value.flags.some((f) => f.name === entry.name && f.flagType === entry.flag_type)) { setShowImportFlag(false); return; }
    const flags = [...value.flags, {
      id: `fl-${Date.now()}`, flagType: entry.flag_type, name: entry.name, description: entry.description,
      evolvedVariables: [...entry.evolved_variables], modusOperandiIds: [],
    }];
    onChange({ flags });
    setShowImportFlag(false);
  };

  const openCreate = () => { setEditing({ id: "", code: "", name: "", description: "", variables: [], examples: [], active: true }); setShowForm(true); };
  const openEdit = (t: Taxonomy) => { setEditing({ ...t, variables: [...t.variables], examples: [...t.examples] }); setShowForm(true); };
  const removeTax = (id: string) => onChange({ taxonomies: value.taxonomies.filter((t) => t.id !== id) });
  const saveTax = () => {
    if (!editing || !editing.code.trim() || !editing.name.trim()) return;
    const taxonomies = editing.id ? value.taxonomies.map((t) => (t.id === editing.id ? editing : t)) : [...value.taxonomies, { ...editing, id: `tx-${Date.now()}` }];
    onChange({ taxonomies });
    setShowForm(false); setEditing(null);
  };

  const openCreateMO = (taxonomyId?: string) => { setEditingMO({ id: "", title: "", narrative: "", taxonomyId: taxonomyId ?? value.taxonomies[0]?.id ?? "", evolvedVariables: [], active: true }); setShowMOForm(true); };
  const openEditMO = (m: ModusOperandi) => { setEditingMO({ ...m, evolvedVariables: [...m.evolvedVariables] }); setShowMOForm(true); };
  const removeMO = (id: string) => onChange({ modusOperandi: value.modusOperandi.filter((m) => m.id !== id) });
  const saveMO = () => {
    if (!editingMO || !editingMO.title.trim() || !editingMO.narrative.trim() || !editingMO.taxonomyId) return;
    const modusOperandi = editingMO.id ? value.modusOperandi.map((m) => (m.id === editingMO.id ? editingMO : m)) : [...value.modusOperandi, { ...editingMO, id: `mo-${Date.now()}` }];
    onChange({ modusOperandi });
    setShowMOForm(false); setEditingMO(null);
  };

  const openCreateFlag = () => { setEditingFlag({ id: "", flagType: "red", name: "", description: "", evolvedVariables: [], modusOperandiIds: [] }); setShowFlagForm(true); };
  const openEditFlag = (f: Flag) => { setEditingFlag({ ...f, evolvedVariables: [...f.evolvedVariables], modusOperandiIds: [...f.modusOperandiIds] }); setShowFlagForm(true); };
  const removeFlag = (id: string) => onChange({ flags: value.flags.filter((f) => f.id !== id) });
  const saveFlag = () => {
    if (!editingFlag || !editingFlag.name.trim()) return;
    const flags = editingFlag.id ? value.flags.map((f) => (f.id === editingFlag.id ? editingFlag : f)) : [...value.flags, { ...editingFlag, id: `fl-${Date.now()}` }];
    onChange({ flags });
    setShowFlagForm(false); setEditingFlag(null);
  };

  return (
    <div className="space-y-6">
      {/* Taxonomías de fraude */}
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">Taxonomías de fraude</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">Categorías abstractas de fraude que el agente puede asignar a cada alerta.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImportTax(true)} disabled={disabled} className="inline-flex items-center gap-2 border border-border text-text-secondary px-3 py-2 rounded-md text-[13px] font-medium hover:border-primary hover:text-primary disabled:opacity-50">
              <Library className="h-4 w-4" /> Importar de biblioteca
            </button>
            <button onClick={openCreate} disabled={disabled} className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Nueva taxonomía
            </button>
          </div>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-secondary text-left border-b border-border">
              <th className="px-6 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Descripción</th>
              <th className="px-3 py-2 font-medium">Variables</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium w-32"></th>
            </tr>
          </thead>
          <tbody>
            {value.taxonomies.map((t) => (
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
                    <button onClick={() => openCreateMO(t.id)} disabled={disabled} title="Nuevo modus operandi para esta taxonomía" className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-50"><Plus className="h-3.5 w-3.5" /></button>
                    <button onClick={() => openEdit(t)} disabled={disabled} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removeTax(t.id)} disabled={disabled} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {value.taxonomies.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-text-secondary">Sin taxonomías configuradas.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Modus operandi */}
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">Modus operandi</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">Casos concretos que aplican una taxonomía en la práctica.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImportMO(true)} disabled={disabled} className="inline-flex items-center gap-2 border border-border text-text-secondary px-3 py-2 rounded-md text-[13px] font-medium hover:border-primary hover:text-primary disabled:opacity-50">
              <Library className="h-4 w-4" /> Importar de biblioteca
            </button>
            <button onClick={() => openCreateMO()} disabled={disabled || value.taxonomies.length === 0} className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus className="h-4 w-4" /> Nuevo modus operandi
            </button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {value.modusOperandi.map((m) => {
            const tax = value.taxonomies.find((t) => t.id === m.taxonomyId);
            return (
              <div key={m.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-primary">{m.title}</p>
                  <p className="text-[12px] text-text-secondary mt-0.5">{m.narrative}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono">{tax ? tax.code : "Taxonomía eliminada"}</span>
                    <span className={`text-[11px] uppercase tracking-wider ${m.active ? "text-success" : "text-text-secondary"}`}>{m.active ? "Activo" : "Inactivo"}</span>
                    {m.evolvedVariables.map((v) => <span key={v} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">{v}</span>)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEditMO(m)} disabled={disabled} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeMO(m.id)} disabled={disabled} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            );
          })}
          {value.modusOperandi.length === 0 && <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin modus operandi configurados.</p>}
        </div>
      </section>

      {/* Flags (rojas/amarillas) */}
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">Red / Yellow flags</h3>
            <p className="text-[12px] text-text-secondary mt-0.5">Comportamientos de alerta, cada una asociable a uno o varios modus operandi.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImportFlag(true)} disabled={disabled} className="inline-flex items-center gap-2 border border-border text-text-secondary px-3 py-2 rounded-md text-[13px] font-medium hover:border-primary hover:text-primary disabled:opacity-50">
              <Library className="h-4 w-4" /> Importar de biblioteca
            </button>
            <button onClick={openCreateFlag} disabled={disabled} className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50">
              <Plus className="h-4 w-4" /> Nueva flag
            </button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {value.flags.map((f) => (
            <div key={f.id} className="px-6 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${FLAG_TYPE_STYLES[f.flagType]}`}>{FLAG_TYPE_LABELS[f.flagType]}</span>
                  <p className="text-[13px] font-medium text-text-primary">{f.name}</p>
                </div>
                <p className="text-[12px] text-text-secondary mt-0.5">{f.description}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {f.evolvedVariables.map((v) => <span key={v} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">{v}</span>)}
                  {f.modusOperandiIds.map((mid) => {
                    const mo = value.modusOperandi.find((m) => m.id === mid);
                    return <span key={mid} className="px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary text-[11px]">{mo ? mo.title : "MO eliminado"}</span>;
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEditFlag(f)} disabled={disabled} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => removeFlag(f.id)} disabled={disabled} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
          {value.flags.length === 0 && <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin flags configuradas.</p>}
        </div>
      </section>

      {/* Casos similares */}
      <SegmentSimilarCasesSection value={value} onChange={onChange} disabled={disabled} />

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
                  {value.taxonomies.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                </select>
              </Field>
              <Field label="Variables evolucionadas" hint="Variables que este modus operandi produce/afecta a lo largo del tiempo.">
                <VariablePicker value={editingMO.evolvedVariables} onChange={(v) => setEditingMO({ ...editingMO, evolvedVariables: v })} />
              </Field>
              <label className="flex items-center gap-2 text-[13px] text-text-primary">
                <input type="checkbox" checked={editingMO.active} onChange={(e) => setEditingMO({ ...editingMO, active: e.target.checked })} />
                Modus operandi activo
              </label>
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

      {/* Flag modal */}
      {showFlagForm && editingFlag && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowFlagForm(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">{editingFlag.id ? "Editar flag" : "Nueva flag"}</h3>
              <button onClick={() => setShowFlagForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Tipo">
                <div className="flex items-center gap-1 rounded-lg border border-border p-1 w-fit">
                  {(["red", "yellow"] as FlagType[]).map((t) => (
                    <button key={t} type="button" onClick={() => setEditingFlag({ ...editingFlag, flagType: t })}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${editingFlag.flagType === t ? FLAG_TYPE_STYLES[t] + " border" : "text-text-secondary hover:text-text-primary"}`}>
                      {FLAG_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Nombre">
                <input value={editingFlag.name} onChange={(e) => setEditingFlag({ ...editingFlag, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" placeholder="Ej: Transacción nocturna" />
              </Field>
              <Field label="Descripción del comportamiento" hint="Describe la señal de forma abstracta, apoyándote en las variables disponibles.">
                <textarea value={editingFlag.description} onChange={(e) => setEditingFlag({ ...editingFlag, description: e.target.value })}
                  rows={3} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" placeholder="Ej: Movimiento ejecutado en horario atípico, fuera del patrón habitual del cliente." />
              </Field>
              <Field label="Variables evolucionadas" hint="Variables que evidencian este comportamiento.">
                <VariablePicker value={editingFlag.evolvedVariables} onChange={(v) => setEditingFlag({ ...editingFlag, evolvedVariables: v })} />
              </Field>
              <Field label="Modus operandi asociados" hint="Esta flag puede asociarse a uno o varios modus operandi.">
                <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                  {value.modusOperandi.length === 0 && <p className="px-3 py-4 text-[12px] text-text-secondary text-center">Sin modus operandi disponibles.</p>}
                  {value.modusOperandi.map((m) => {
                    const checked = editingFlag.modusOperandiIds.includes(m.id);
                    return (
                      <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-[13px] text-text-primary cursor-pointer hover:bg-surface">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setEditingFlag({
                            ...editingFlag,
                            modusOperandiIds: checked
                              ? editingFlag.modusOperandiIds.filter((id) => id !== m.id)
                              : [...editingFlag.modusOperandiIds, m.id],
                          })}
                        />
                        {m.title}
                      </label>
                    );
                  })}
                </div>
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

      {/* Import taxonomy from library */}
      {showImportTax && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowImportTax(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">Importar taxonomía de biblioteca</h3>
              <button onClick={() => setShowImportTax(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {libraryTaxonomies.map((t) => (
                <button key={t.id} onClick={() => importTaxonomy(t)} className="w-full text-left px-5 py-3 hover:bg-surface">
                  <span className="text-[13px] font-medium text-text-primary">{t.name}</span>
                  <span className="ml-2 font-mono text-[11px] text-text-secondary">{t.code}</span>
                  <p className="text-[12px] text-text-secondary mt-0.5 truncate">{t.description}</p>
                </button>
              ))}
              {libraryTaxonomies.length === 0 && <p className="px-5 py-8 text-center text-text-secondary text-[13px]">Sin taxonomías en la biblioteca.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Import modus operandi from library */}
      {showImportMO && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowImportMO(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">Importar modus operandi de biblioteca</h3>
              <button onClick={() => setShowImportMO(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <p className="px-5 pt-3 text-[11px] text-text-secondary">Su taxonomía se importa junto con él si aún no está en este segmento.</p>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {libraryModusOperandi.map((m) => {
                const tax = libraryTaxonomies.find((t) => t.id === m.taxonomy_library_id);
                return (
                  <button key={m.id} onClick={() => importModusOperandi(m)} className="w-full text-left px-5 py-3 hover:bg-surface">
                    <span className="text-[13px] font-medium text-text-primary">{m.title}</span>
                    {tax && <span className="ml-2 font-mono text-[11px] text-text-secondary">{tax.code}</span>}
                    <p className="text-[12px] text-text-secondary mt-0.5 truncate">{m.narrative}</p>
                  </button>
                );
              })}
              {libraryModusOperandi.length === 0 && <p className="px-5 py-8 text-center text-text-secondary text-[13px]">Sin modus operandi en la biblioteca.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Import flag from library */}
      {showImportFlag && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowImportFlag(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">Importar flag de biblioteca</h3>
              <button onClick={() => setShowImportFlag(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
            </div>
            <p className="px-5 pt-3 text-[11px] text-text-secondary">Sus vínculos a modus operandi no se copian — asócialos después de importar.</p>
            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {libraryFlags.map((f) => (
                <button key={f.id} onClick={() => importFlag(f)} className="w-full text-left px-5 py-3 hover:bg-surface">
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${FLAG_TYPE_STYLES[f.flag_type]}`}>{FLAG_TYPE_LABELS[f.flag_type]}</span>
                  <span className="ml-2 text-[13px] font-medium text-text-primary">{f.name}</span>
                  <p className="text-[12px] text-text-secondary mt-0.5 truncate">{f.description}</p>
                </button>
              ))}
              {libraryFlags.length === 0 && <p className="px-5 py-8 text-center text-text-secondary text-[13px]">Sin flags en la biblioteca.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
