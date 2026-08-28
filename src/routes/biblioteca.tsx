import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { Field, TagInput, VariablePicker } from "@/components/configuracion/shared/FormControls";
import {
  createFlagLibraryEntry,
  createModusOperandiLibraryEntry,
  createSimilarCaseLibraryEntry,
  createTaxonomyLibraryEntry,
  deleteFlagLibraryEntry,
  deleteModusOperandiLibraryEntry,
  deleteSimilarCaseLibraryEntry,
  deleteTaxonomyLibraryEntry,
  listFlagLibraryEntries,
  listModusOperandiLibraryEntries,
  listSimilarCaseLibraryEntries,
  listTaxonomyLibraryEntries,
  updateFlagLibraryEntry,
  updateModusOperandiLibraryEntry,
  updateSimilarCaseLibraryEntry,
  updateTaxonomyLibraryEntry,
  type FlagLibraryEntry,
  type FlagTypeValue,
  type ModusOperandiLibraryEntry,
  type SimilarCaseLibraryEntry,
  type TaxonomyLibraryEntry,
} from "@/lib/api/knowledgeLibrary.functions";

export const Route = createFileRoute("/biblioteca")({
  head: () => ({
    meta: [
      { title: "ARIA - Agente prevención de Fraude" },
      {
        name: "description",
        content: "Biblioteca global de taxonomías, modus operandi, flags y casos similares.",
      },
    ],
  }),
  component: BibliotecaPage,
});

/* ─── Biblioteca global (backlog #3) ─────────────────────
   Global, config-independent reference data - NOT tied to any segment or
   configuration version, unlike SegmentKnowledgeBaseSection's local
   taxonomies/modusOperandi/flags. Segments "importan de biblioteca"
   (snapshot-copy, see that component) rather than referencing these rows
   live, so editing here never retroactively changes an already-built
   config. Own top-level route (not a configuración tab) because it's
   reference data multiple configs pull from, not a per-config setting -
   see AppSidebar.tsx for the nav entry and useRole.ts for admin-only
   visibility. */

const FLAG_TYPE_STYLES: Record<FlagTypeValue, string> = {
  red: "bg-danger/15 text-danger border-danger/40",
  yellow: "bg-warning/15 text-warning border-warning/40",
};
const FLAG_TYPE_LABELS: Record<FlagTypeValue, string> = { red: "Roja", yellow: "Amarilla" };

function BibliotecaPage() {
  const queryClient = useQueryClient();

  const taxonomiesQuery = useQuery({
    queryKey: ["libraryTaxonomies"],
    queryFn: () => listTaxonomyLibraryEntries({ data: { activeOnly: false } }),
  });
  const modusOperandiQuery = useQuery({
    queryKey: ["libraryModusOperandi"],
    queryFn: () => listModusOperandiLibraryEntries({ data: { activeOnly: false } }),
  });
  const flagsQuery = useQuery({
    queryKey: ["libraryFlags"],
    queryFn: () => listFlagLibraryEntries({ data: { activeOnly: false } }),
  });
  const similarCasesQuery = useQuery({
    queryKey: ["librarySimilarCases"],
    queryFn: () => listSimilarCaseLibraryEntries({ data: { activeOnly: false } }),
  });

  const taxonomies = taxonomiesQuery.data ?? [];
  const modusOperandi = modusOperandiQuery.data ?? [];
  const flags = flagsQuery.data ?? [];
  const similarCases = similarCasesQuery.data ?? [];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["libraryTaxonomies"] });
    queryClient.invalidateQueries({ queryKey: ["libraryModusOperandi"] });
    queryClient.invalidateQueries({ queryKey: ["libraryFlags"] });
    queryClient.invalidateQueries({ queryKey: ["librarySimilarCases"] });
  };

  // --- Taxonomies -----------------------------------------------------------
  const [editingTax, setEditingTax] = useState<Partial<TaxonomyLibraryEntry> | null>(null);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const saveTaxMutation = useMutation({
    mutationFn: (draft: Partial<TaxonomyLibraryEntry>) =>
      draft.id
        ? updateTaxonomyLibraryEntry({
            data: {
              entryId: draft.id,
              code: draft.code,
              name: draft.name,
              description: draft.description,
              variables: draft.variables,
              examples: draft.examples,
            },
          })
        : createTaxonomyLibraryEntry({
            data: {
              code: draft.code ?? "",
              name: draft.name ?? "",
              description: draft.description ?? "",
              variables: draft.variables ?? [],
              examples: draft.examples ?? [],
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowTaxForm(false);
      setEditingTax(null);
    },
  });
  const deleteTaxMutation = useMutation({
    mutationFn: (entryId: string) => deleteTaxonomyLibraryEntry({ data: { entryId } }),
    onSuccess: invalidateAll,
  });
  const toggleTaxActive = useMutation({
    mutationFn: (entry: TaxonomyLibraryEntry) =>
      updateTaxonomyLibraryEntry({ data: { entryId: entry.id, active: !entry.active } }),
    onSuccess: invalidateAll,
  });

  // --- Modus operandi ---------------------------------------------------------
  const [editingMO, setEditingMO] = useState<Partial<ModusOperandiLibraryEntry> | null>(null);
  const [showMOForm, setShowMOForm] = useState(false);
  const saveMOMutation = useMutation({
    mutationFn: (draft: Partial<ModusOperandiLibraryEntry>) =>
      draft.id
        ? updateModusOperandiLibraryEntry({
            data: {
              entryId: draft.id,
              title: draft.title,
              narrative: draft.narrative,
              taxonomyLibraryId: draft.taxonomy_library_id,
              evolvedVariables: draft.evolved_variables,
            },
          })
        : createModusOperandiLibraryEntry({
            data: {
              title: draft.title ?? "",
              narrative: draft.narrative ?? "",
              taxonomyLibraryId: draft.taxonomy_library_id ?? taxonomies[0]?.id ?? "",
              evolvedVariables: draft.evolved_variables ?? [],
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowMOForm(false);
      setEditingMO(null);
    },
  });
  const deleteMOMutation = useMutation({
    mutationFn: (entryId: string) => deleteModusOperandiLibraryEntry({ data: { entryId } }),
    onSuccess: invalidateAll,
  });

  // --- Flags ------------------------------------------------------------------
  const [editingFlag, setEditingFlag] = useState<Partial<FlagLibraryEntry> | null>(null);
  const [showFlagForm, setShowFlagForm] = useState(false);
  const saveFlagMutation = useMutation({
    mutationFn: (draft: Partial<FlagLibraryEntry>) =>
      draft.id
        ? updateFlagLibraryEntry({
            data: {
              entryId: draft.id,
              flagType: draft.flag_type,
              name: draft.name,
              description: draft.description,
              evolvedVariables: draft.evolved_variables,
              modusOperandiLibraryIds: draft.modus_operandi_library_ids,
            },
          })
        : createFlagLibraryEntry({
            data: {
              flagType: draft.flag_type ?? "red",
              name: draft.name ?? "",
              description: draft.description ?? "",
              evolvedVariables: draft.evolved_variables ?? [],
              modusOperandiLibraryIds: draft.modus_operandi_library_ids ?? [],
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowFlagForm(false);
      setEditingFlag(null);
    },
  });
  const deleteFlagMutation = useMutation({
    mutationFn: (entryId: string) => deleteFlagLibraryEntry({ data: { entryId } }),
    onSuccess: invalidateAll,
  });

  // --- Similar cases ------------------------------------------------------------
  const [editingCase, setEditingCase] = useState<Partial<SimilarCaseLibraryEntry> | null>(null);
  const [showCaseForm, setShowCaseForm] = useState(false);
  const saveCaseMutation = useMutation({
    mutationFn: (draft: Partial<SimilarCaseLibraryEntry>) =>
      draft.id
        ? updateSimilarCaseLibraryEntry({
            data: {
              entryId: draft.id,
              text: draft.text,
              modusOperandiLibraryId: draft.modus_operandi_library_id,
              taxonomyLibraryId: draft.taxonomy_library_id,
            },
          })
        : createSimilarCaseLibraryEntry({
            data: {
              text: draft.text ?? "",
              modusOperandiLibraryId: draft.modus_operandi_library_id ?? modusOperandi[0]?.id ?? "",
              taxonomyLibraryId: draft.taxonomy_library_id ?? modusOperandi[0]?.taxonomy_library_id ?? "",
            },
          }),
    onSuccess: () => {
      invalidateAll();
      setShowCaseForm(false);
      setEditingCase(null);
    },
  });
  const deleteCaseMutation = useMutation({
    mutationFn: (entryId: string) => deleteSimilarCaseLibraryEntry({ data: { entryId } }),
    onSuccess: invalidateAll,
  });

  const modusOperandiForTaxonomy = (taxonomyLibraryId?: string) =>
    modusOperandi.filter((m) => m.taxonomy_library_id === taxonomyLibraryId);

  return (
    <DashboardLayout>
      <div className="px-8 py-6 max-w-[1280px] space-y-6">
        <header>
          <h1 className="text-[20px] font-semibold text-text-primary">Biblioteca</h1>
          <p className="text-[13px] text-text-secondary mt-1">
            Catálogo global de taxonomías, modus operandi, flags y casos similares. Las configuraciones por
            segmento importan (copian) desde aquí para construir su propio conocimiento — editar una entrada
            aquí no afecta configuraciones ya construidas.
          </p>
        </header>

        {/* Taxonomías */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Taxonomías de fraude</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">
                Categorías abstractas de fraude, disponibles para cualquier segmento.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingTax({ code: "", name: "", description: "", variables: [], examples: [] });
                setShowTaxForm(true);
              }}
              className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Nueva taxonomía
            </button>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-text-secondary text-left border-b border-border">
                <th className="px-6 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium w-24"></th>
              </tr>
            </thead>
            <tbody>
              {taxonomies.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface align-top">
                  <td className="px-6 py-3 font-mono text-[12px]">{t.code}</td>
                  <td className="px-3 py-3 font-medium text-text-primary">{t.name}</td>
                  <td className="px-3 py-3 text-text-secondary max-w-xs truncate">{t.description}</td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => toggleTaxActive.mutate(t)}
                      className={`text-[11px] uppercase tracking-wider ${t.active ? "text-success" : "text-text-secondary"}`}
                    >
                      {t.active ? "Activa" : "Inactiva"}
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingTax({ ...t });
                          setShowTaxForm(true);
                        }}
                        className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteTaxMutation.mutate(t.id)}
                        className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {taxonomies.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-secondary">
                    Sin taxonomías en la biblioteca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Modus operandi */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Modus operandi</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">Casos concretos que aplican una taxonomía.</p>
            </div>
            <button
              onClick={() => {
                setEditingMO({
                  title: "",
                  narrative: "",
                  taxonomy_library_id: taxonomies[0]?.id ?? "",
                  evolved_variables: [],
                });
                setShowMOForm(true);
              }}
              disabled={taxonomies.length === 0}
              className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" /> Nuevo modus operandi
            </button>
          </div>
          <div className="divide-y divide-border">
            {modusOperandi.map((m) => {
              const tax = taxonomies.find((t) => t.id === m.taxonomy_library_id);
              return (
                <div key={m.id} className="px-6 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-text-primary">{m.title}</p>
                    <p className="text-[12px] text-text-secondary mt-0.5">{m.narrative}</p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-mono">
                      {tax ? tax.code : "Taxonomía eliminada"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingMO({ ...m });
                        setShowMOForm(true);
                      }}
                      className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteMOMutation.mutate(m.id)}
                      className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {modusOperandi.length === 0 && (
              <p className="px-6 py-8 text-center text-text-secondary text-[13px]">
                Sin modus operandi en la biblioteca.
              </p>
            )}
          </div>
        </section>

        {/* Flags */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Red / Yellow flags</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">Comportamientos asociables a uno o varios modus operandi.</p>
            </div>
            <button
              onClick={() => {
                setEditingFlag({ flag_type: "red", name: "", description: "", evolved_variables: [], modus_operandi_library_ids: [] });
                setShowFlagForm(true);
              }}
              className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Nueva flag
            </button>
          </div>
          <div className="divide-y divide-border">
            {flags.map((f) => (
              <div key={f.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${FLAG_TYPE_STYLES[f.flag_type]}`}>
                      {FLAG_TYPE_LABELS[f.flag_type]}
                    </span>
                    <p className="text-[13px] font-medium text-text-primary">{f.name}</p>
                  </div>
                  <p className="text-[12px] text-text-secondary mt-0.5">{f.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {f.modus_operandi_library_ids.map((mid) => {
                      const mo = modusOperandi.find((m) => m.id === mid);
                      return (
                        <span key={mid} className="px-2 py-0.5 rounded-full bg-surface border border-border text-text-secondary text-[11px]">
                          {mo ? mo.title : "MO eliminado"}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => {
                      setEditingFlag({ ...f });
                      setShowFlagForm(true);
                    }}
                    className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteFlagMutation.mutate(f.id)}
                    className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {flags.length === 0 && (
              <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin flags en la biblioteca.</p>
            )}
          </div>
        </section>

        {/* Casos similares */}
        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h3 className="text-[13px] font-semibold text-text-primary">Casos similares</h3>
              <p className="text-[12px] text-text-secondary mt-0.5">Ejemplos, en texto libre, de cómo se manifiesta un modus operandi.</p>
            </div>
            <button
              onClick={() => {
                const firstMO = modusOperandi[0];
                setEditingCase({ text: "", modus_operandi_library_id: firstMO?.id ?? "", taxonomy_library_id: firstMO?.taxonomy_library_id ?? "" });
                setShowCaseForm(true);
              }}
              disabled={modusOperandi.length === 0}
              className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-4 w-4" /> Nuevo caso
            </button>
          </div>
          <div className="divide-y divide-border">
            {similarCases.map((c) => {
              const mo = modusOperandi.find((m) => m.id === c.modus_operandi_library_id);
              return (
                <div key={c.id} className="px-6 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] text-text-primary">{c.text}</p>
                    <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">
                      {mo ? mo.title : "Modus operandi eliminado"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingCase({ ...c });
                        setShowCaseForm(true);
                      }}
                      className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCaseMutation.mutate(c.id)}
                      className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {similarCases.length === 0 && (
              <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin casos similares en la biblioteca.</p>
            )}
          </div>
        </section>

        {/* Taxonomy modal */}
        {showTaxForm && editingTax && (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowTaxForm(false)}>
            <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">{editingTax.id ? "Editar taxonomía" : "Nueva taxonomía"}</h3>
                <button onClick={() => setShowTaxForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <Field label="Código">
                  <input value={editingTax.code ?? ""} onChange={(e) => setEditingTax({ ...editingTax, code: e.target.value.toUpperCase() })}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] font-mono focus:outline-none focus:border-primary" placeholder="FRD-CARD" />
                </Field>
                <Field label="Nombre">
                  <input value={editingTax.name ?? ""} onChange={(e) => setEditingTax({ ...editingTax, name: e.target.value })}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" placeholder="Fraude con tarjeta" />
                </Field>
                <Field label="Descripción">
                  <textarea value={editingTax.description ?? ""} onChange={(e) => setEditingTax({ ...editingTax, description: e.target.value })}
                    rows={3} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                </Field>
                <Field label="Variables">
                  <VariablePicker value={editingTax.variables ?? []} onChange={(variables) => setEditingTax({ ...editingTax, variables })} />
                </Field>
                <Field label="Ejemplos (opcional)" hint="Presiona Enter o coma para agregar cada uno.">
                  <TagInput value={editingTax.examples ?? []} onChange={(examples) => setEditingTax({ ...editingTax, examples })} />
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowTaxForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
                <button onClick={() => saveTaxMutation.mutate(editingTax)} disabled={!editingTax.code?.trim() || !editingTax.name?.trim() || saveTaxMutation.isPending}
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  {editingTax.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MO modal */}
        {showMOForm && editingMO && (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowMOForm(false)}>
            <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">{editingMO.id ? "Editar modus operandi" : "Nuevo modus operandi"}</h3>
                <button onClick={() => setShowMOForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <Field label="Nombre del caso">
                  <input value={editingMO.title ?? ""} onChange={(e) => setEditingMO({ ...editingMO, title: e.target.value })}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                </Field>
                <Field label="Descripción del caso">
                  <textarea value={editingMO.narrative ?? ""} onChange={(e) => setEditingMO({ ...editingMO, narrative: e.target.value })}
                    rows={4} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                </Field>
                <Field label="Taxonomía">
                  <select value={editingMO.taxonomy_library_id ?? ""} onChange={(e) => setEditingMO({ ...editingMO, taxonomy_library_id: e.target.value })}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                    <option value="" disabled>Selecciona una taxonomía</option>
                    {taxonomies.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                  </select>
                </Field>
                <Field label="Variables evolucionadas">
                  <VariablePicker value={editingMO.evolved_variables ?? []} onChange={(evolved_variables) => setEditingMO({ ...editingMO, evolved_variables })} />
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowMOForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
                <button onClick={() => saveMOMutation.mutate(editingMO)} disabled={!editingMO.title?.trim() || !editingMO.narrative?.trim() || !editingMO.taxonomy_library_id || saveMOMutation.isPending}
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
                    {(["red", "yellow"] as FlagTypeValue[]).map((t) => (
                      <button key={t} type="button" onClick={() => setEditingFlag({ ...editingFlag, flag_type: t })}
                        className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${editingFlag.flag_type === t ? FLAG_TYPE_STYLES[t] + " border" : "text-text-secondary hover:text-text-primary"}`}>
                        {FLAG_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Nombre">
                  <input value={editingFlag.name ?? ""} onChange={(e) => setEditingFlag({ ...editingFlag, name: e.target.value })}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary" />
                </Field>
                <Field label="Descripción del comportamiento">
                  <textarea value={editingFlag.description ?? ""} onChange={(e) => setEditingFlag({ ...editingFlag, description: e.target.value })}
                    rows={3} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                </Field>
                <Field label="Variables evolucionadas">
                  <VariablePicker value={editingFlag.evolved_variables ?? []} onChange={(evolved_variables) => setEditingFlag({ ...editingFlag, evolved_variables })} />
                </Field>
                <Field label="Modus operandi asociados">
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {modusOperandi.length === 0 && <p className="px-3 py-4 text-[12px] text-text-secondary text-center">Sin modus operandi disponibles.</p>}
                    {modusOperandi.map((m) => {
                      const ids = editingFlag.modus_operandi_library_ids ?? [];
                      const checked = ids.includes(m.id);
                      return (
                        <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-[13px] text-text-primary cursor-pointer hover:bg-surface">
                          <input type="checkbox" checked={checked} onChange={() => setEditingFlag({
                            ...editingFlag,
                            modus_operandi_library_ids: checked ? ids.filter((id) => id !== m.id) : [...ids, m.id],
                          })} />
                          {m.title}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowFlagForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
                <button onClick={() => saveFlagMutation.mutate(editingFlag)} disabled={!editingFlag.name?.trim() || saveFlagMutation.isPending}
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  {editingFlag.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Similar case modal */}
        {showCaseForm && editingCase && (
          <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowCaseForm(false)}>
            <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h3 className="text-[14px] font-semibold text-text-primary">{editingCase.id ? "Editar caso similar" : "Nuevo caso similar"}</h3>
                <button onClick={() => setShowCaseForm(false)} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" /></button>
              </div>
              <div className="p-5 space-y-4">
                <Field label="Taxonomía">
                  <select value={editingCase.taxonomy_library_id ?? ""} onChange={(e) => {
                    const taxonomy_library_id = e.target.value;
                    const firstMO = modusOperandiForTaxonomy(taxonomy_library_id)[0];
                    setEditingCase({ ...editingCase, taxonomy_library_id, modus_operandi_library_id: firstMO?.id ?? "" });
                  }} className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                    {taxonomies.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                  </select>
                </Field>
                <Field label="Modus operandi">
                  <select value={editingCase.modus_operandi_library_id ?? ""} onChange={(e) => setEditingCase({ ...editingCase, modus_operandi_library_id: e.target.value })}
                    className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background">
                    <option value="" disabled>Selecciona un modus operandi</option>
                    {modusOperandiForTaxonomy(editingCase.taxonomy_library_id).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                </Field>
                <Field label="Descripción del caso">
                  <textarea value={editingCase.text ?? ""} onChange={(e) => setEditingCase({ ...editingCase, text: e.target.value })}
                    rows={4} className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none" />
                </Field>
              </div>
              <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowCaseForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">Cancelar</button>
                <button onClick={() => saveCaseMutation.mutate(editingCase)} disabled={!editingCase.text?.trim() || !editingCase.modus_operandi_library_id || saveCaseMutation.isPending}
                  className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  {editingCase.id ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
