import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  RESOLUTION_TAG_LABELS,
  type AnalystConfig,
  type AnalystPlaybook,
  type ResolutionTag,
  type Taxonomy,
  type VoicebotCategoryPrompt,
} from "@/data/configs";
import { listResolutionMethods } from "@/lib/api/resolutionMethod.functions";
import { MarcacionCatalogManager } from "./MarcacionCatalogManager";
import { ResolutionMethodCatalogManager } from "./ResolutionMethodCatalogManager";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor } from "./shared/PromptEditor";

/* ─── Analista + Voicebot (Phase 5) ─────────────────────
   Playbooks map a semantic strategy to one resolution method (catalog,
   see ResolutionMethodCatalogManager) - each method carries a fixed
   resolutionTag underneath, kept denormalized on the playbook for
   whatever eventually reads it. When the tag is "handle_by_aria" the
   agent marks the alert with a marcación category at alert-review time -
   the category itself is separate runtime-assignable reference data
   (managed catalog, see MarcacionCatalogManager), not a field on the
   playbook. Voicebot has one base prompt plus optional per-taxonomy
   prompts, dynamically concatenated at runtime. */

export function SegmentAnalystSection({
  value,
  taxonomies,
  onChange,
  disabled,
}: {
  value: AnalystConfig;
  taxonomies: Taxonomy[];
  onChange: (value: AnalystConfig) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState<AnalystPlaybook | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [showResolutionCatalog, setShowResolutionCatalog] = useState(false);

  const resolutionMethodsQuery = useQuery({
    queryKey: ["resolutionMethods"],
    queryFn: () => listResolutionMethods({ data: { activeOnly: true } }),
  });
  const resolutionMethods = resolutionMethodsQuery.data ?? [];
  const resolutionMethodLabel = (p: AnalystPlaybook) =>
    resolutionMethods.find((m) => m.id === p.resolutionMethodId)?.value ??
    RESOLUTION_TAG_LABELS[p.resolutionTag];

  const openCreate = () => {
    setEditing({ id: "", name: "", strategy: "", resolutionTag: "scale_to_analyst" });
    setShowForm(true);
  };
  const openEdit = (p: AnalystPlaybook) => {
    setEditing({ ...p });
    setShowForm(true);
  };
  const removePlaybook = (id: string) =>
    onChange({ ...value, playbooks: value.playbooks.filter((p) => p.id !== id) });
  const savePlaybook = () => {
    if (!editing || !editing.name.trim() || !editing.resolutionMethodId) return;
    const playbooks = editing.id
      ? value.playbooks.map((p) => (p.id === editing.id ? editing : p))
      : [...value.playbooks, { ...editing, id: `pb-${Date.now()}` }];
    onChange({ ...value, playbooks });
    setShowForm(false);
    setEditing(null);
  };

  const addCategoryPrompt = () => {
    const firstTaxonomy = taxonomies[0];
    if (!firstTaxonomy) return;
    const categoryPrompts: VoicebotCategoryPrompt[] = [
      ...value.voicebot.categoryPrompts,
      { id: `vcp-${Date.now()}`, taxonomyId: firstTaxonomy.id, prompt: "" },
    ];
    onChange({ ...value, voicebot: { ...value.voicebot, categoryPrompts } });
  };
  const updateCategoryPrompt = (id: string, patch: Partial<VoicebotCategoryPrompt>) =>
    onChange({
      ...value,
      voicebot: {
        ...value.voicebot,
        categoryPrompts: value.voicebot.categoryPrompts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    });
  const removeCategoryPrompt = (id: string) =>
    onChange({
      ...value,
      voicebot: { ...value.voicebot, categoryPrompts: value.voicebot.categoryPrompts.filter((c) => c.id !== id) },
    });

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-[14px] font-semibold text-text-primary">Playbooks</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Estrategia semántica y{" "}
              <button
                type="button"
                onClick={() => setShowResolutionCatalog(true)}
                className="text-primary hover:underline"
              >
                método de resolución
              </button>{" "}
              esperado para cada tipo de caso. "Resolver con ARIA" marca la alerta con una categoría de{" "}
              <button type="button" onClick={() => setShowCatalog(true)} className="text-primary hover:underline">
                marcación
              </button>
              .
            </p>
          </div>
          <button
            onClick={openCreate}
            disabled={disabled}
            className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" /> Nuevo playbook
          </button>
        </div>
        <div className="divide-y divide-border">
          {value.playbooks.map((p) => (
            <div key={p.id} className="px-6 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-text-primary">{p.name}</p>
                <p className="text-[12px] text-text-secondary mt-0.5">{p.strategy}</p>
                <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">
                  {resolutionMethodLabel(p)}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(p)} disabled={disabled} className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-50">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removePlaybook(p.id)} disabled={disabled} className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {value.playbooks.length === 0 && (
            <p className="px-6 py-8 text-center text-text-secondary text-[13px]">Sin playbooks configurados.</p>
          )}
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Voicebot</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Prompt base para toda llamada, más prompts específicos por taxonomía que se concatenan dinámicamente.
          </p>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Prompt base">
            <PromptEditor
              value={value.voicebot.basePrompt}
              onChange={(basePrompt) => onChange({ ...value, voicebot: { ...value.voicebot, basePrompt } })}
              rows={4}
              disabled={disabled}
              placeholder="Ej: Eres el asistente de voz de ARIA, confirma con {nombre_del_cliente} los detalles de {ultima_transaccion}."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">Variables disponibles para este prompt</p>
              <VariablePicker
                value={value.voicebot.basePromptVars}
                onChange={(basePromptVars) => onChange({ ...value, voicebot: { ...value.voicebot, basePromptVars } })}
              />
            </div>
          </Field>

          <div className="pt-2 border-t border-border space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-text-primary">Prompts por taxonomía</p>
              <button
                onClick={addCategoryPrompt}
                disabled={disabled || taxonomies.length === 0}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" /> Agregar prompt
              </button>
            </div>
            {value.voicebot.categoryPrompts.length === 0 && (
              <p className="text-[12px] text-text-secondary">Sin prompts específicos por taxonomía.</p>
            )}
            {value.voicebot.categoryPrompts.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={c.taxonomyId}
                    onChange={(e) => updateCategoryPrompt(c.id, { taxonomyId: e.target.value })}
                    disabled={disabled}
                    className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary bg-background disabled:opacity-50"
                  >
                    {taxonomies.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeCategoryPrompt(c.id)}
                    disabled={disabled}
                    className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <PromptEditor
                  value={c.prompt}
                  onChange={(prompt) => updateCategoryPrompt(c.id, { prompt })}
                  rows={2}
                  disabled={disabled}
                  placeholder="Prompt adicional para esta taxonomía…"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {showForm && editing && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-[14px] font-semibold text-text-primary">{editing.id ? "Editar playbook" : "Nuevo playbook"}</h3>
              <button onClick={() => setShowForm(false)} className="text-text-secondary hover:text-text-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nombre">
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                  placeholder="Ej: Fraude confirmado con evidencia clara"
                />
              </Field>
              <Field label="Estrategia" hint="Texto libre: cómo debe razonar el analista/agente ante este tipo de caso.">
                <textarea
                  value={editing.strategy}
                  onChange={(e) => setEditing({ ...editing, strategy: e.target.value })}
                  rows={4}
                  className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary resize-none"
                />
              </Field>
              <Field label="Resolución" hint="Método de resolución del catálogo - determina la vía (analista, voicebot o ARIA) que ARIA ejecuta.">
                <select
                  value={editing.resolutionMethodId ?? ""}
                  onChange={(e) => {
                    const method = resolutionMethods.find((m) => m.id === e.target.value);
                    if (!method) return;
                    setEditing({
                      ...editing,
                      resolutionMethodId: method.id,
                      resolutionTag: method.resolution_tag as ResolutionTag,
                    });
                  }}
                  className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                >
                  {!editing.resolutionMethodId && (
                    <option value="" disabled>
                      Selecciona un método
                    </option>
                  )}
                  {resolutionMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.value} ({RESOLUTION_TAG_LABELS[m.resolution_tag as ResolutionTag]})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md text-[13px] border border-border hover:bg-surface">
                Cancelar
              </button>
              <button
                onClick={savePlaybook}
                disabled={!editing.name.trim() || !editing.resolutionMethodId}
                className="px-4 py-2 rounded-md text-[13px] bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editing.id ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      <MarcacionCatalogManager open={showCatalog} onOpenChange={setShowCatalog} />
      <ResolutionMethodCatalogManager open={showResolutionCatalog} onOpenChange={setShowResolutionCatalog} />
    </div>
  );
}
