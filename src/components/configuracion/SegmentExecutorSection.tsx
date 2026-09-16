import { Plus, X } from "lucide-react";
import { useRef } from "react";

import type { ExecutorConfig, VoicebotCategoryPrompt } from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { useVectorStoreVersions } from "@/hooks/useVectorStoreVersions";
import { SegmentDocumentationSection } from "./SegmentDocumentationSection";
import { Field, VariablePicker } from "./shared/FormControls";
import { PromptEditor, type PromptEditorHandle } from "./shared/PromptEditor";
import { spliceToken, variablesInPrompt } from "./shared/promptTokens";

/* ─── Ejecutor (Wave 6) ──────────────────────────────────
   Former "Descripción de campos" subtab, renamed and expanded to 4
   sections (item 4): a) Marcación ARIC - the comment the agent leaves,
   given the alert's JSON input; b) Llamada Voicebot - moved verbatim from
   SegmentAnalystSection (item 5), now sourcing its per-taxonomy dropdown
   from the global Vector Store's latest version instead of a per-segment
   taxonomies list (which no longer exists, see item 9); c) Documentador -
   reuses SegmentDocumentationSection unchanged, just relocated here; d)
   Escalado al analista - personalizes the concept handed to the analyst. */

export function SegmentExecutorSection({
  value,
  onChange,
  extraVariables,
  disabled,
}: {
  value: ExecutorConfig;
  onChange: (value: ExecutorConfig) => void;
  extraVariables: string[];
  disabled?: boolean;
}) {
  const aricPromptRef = useRef<PromptEditorHandle>(null);
  const escalationPromptRef = useRef<PromptEditorHandle>(null);
  const voicebotPromptRef = useRef<PromptEditorHandle>(null);
  const { variables } = useVariableCatalog();
  const pool = [...variables, ...extraVariables];
  const { latest } = useVectorStoreVersions();
  const taxonomies = latest?.taxonomies ?? [];

  const addCategoryPrompt = () => {
    const firstTaxonomy = taxonomies[0];
    if (!firstTaxonomy) return;
    const categoryPrompts: VoicebotCategoryPrompt[] = [
      ...value.voicebotCall.categoryPrompts,
      { id: `vcp-${Date.now()}`, taxonomyId: firstTaxonomy.id, prompt: "" },
    ];
    onChange({ ...value, voicebotCall: { ...value.voicebotCall, categoryPrompts } });
  };
  const updateCategoryPrompt = (id: string, patch: Partial<VoicebotCategoryPrompt>) =>
    onChange({
      ...value,
      voicebotCall: {
        ...value.voicebotCall,
        categoryPrompts: value.voicebotCall.categoryPrompts.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        ),
      },
    });
  const removeCategoryPrompt = (id: string) =>
    onChange({
      ...value,
      voicebotCall: {
        ...value.voicebotCall,
        categoryPrompts: value.voicebotCall.categoryPrompts.filter((c) => c.id !== id),
      },
    });

  return (
    <div className="space-y-6">
      {/* a) Marcación ARIC */}
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Marcación ARIC</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Instrucción para el LLM que redacta el comentario de marcación, a partir del JSON de
            entrada de la alerta.
          </p>
        </div>
        <div className="p-6">
          <Field label="Prompt">
            <PromptEditor
              ref={aricPromptRef}
              value={value.aricMarking.prompt}
              onChange={(prompt) =>
                onChange({ ...value, aricMarking: { ...value.aricMarking, prompt } })
              }
              onBlur={(prompt) =>
                onChange({
                  ...value,
                  aricMarking: {
                    ...value.aricMarking,
                    promptVars: variablesInPrompt(prompt).filter((variable) =>
                      pool.includes(variable),
                    ),
                  },
                })
              }
              rows={4}
              disabled={disabled}
              placeholder="Ej: Redacta el comentario de marcación ARIC a partir de {taxonomia_asignada} y {resultado_final}."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">
                Variables disponibles para este prompt
              </p>
              <VariablePicker
                value={value.aricMarking.promptVars}
                onChange={(promptVars) =>
                  onChange({ ...value, aricMarking: { ...value.aricMarking, promptVars } })
                }
                pool={pool}
                prompt={value.aricMarking.prompt}
                onInsert={(v) => {
                  const { next, cursor } = spliceToken(
                    value.aricMarking.prompt,
                    aricPromptRef.current?.getSelection() ?? null,
                    `{${v}}`,
                  );
                  onChange({
                    ...value,
                    aricMarking: {
                      ...value.aricMarking,
                      prompt: next,
                      promptVars: [...value.aricMarking.promptVars, v],
                    },
                  });
                  aricPromptRef.current?.focusAt(cursor);
                }}
              />
            </div>
          </Field>
        </div>
      </section>

      {/* b) Llamada Voicebot */}
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Llamada Voicebot</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Prompt base para toda llamada, más prompts específicos por taxonomía que se concatenan
            dinámicamente.
          </p>
        </div>
        <div className="p-6 space-y-5">
          <Field label="Prompt base">
            <PromptEditor
              ref={voicebotPromptRef}
              value={value.voicebotCall.basePrompt}
              onChange={(basePrompt) =>
                onChange({ ...value, voicebotCall: { ...value.voicebotCall, basePrompt } })
              }
              onBlur={(basePrompt) =>
                onChange({
                  ...value,
                  voicebotCall: {
                    ...value.voicebotCall,
                    basePromptVars: variablesInPrompt(basePrompt).filter((variable) =>
                      pool.includes(variable),
                    ),
                  },
                })
              }
              rows={4}
              disabled={disabled}
              placeholder="Ej: Eres el asistente de voz de ARIA, confirma con {nombre_del_cliente} los detalles de {ultima_transaccion}."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">
                Variables disponibles para este prompt
              </p>
              <VariablePicker
                value={value.voicebotCall.basePromptVars}
                onChange={(basePromptVars) =>
                  onChange({ ...value, voicebotCall: { ...value.voicebotCall, basePromptVars } })
                }
                pool={pool}
                prompt={value.voicebotCall.basePrompt}
                onInsert={(v) => {
                  const { next, cursor } = spliceToken(
                    value.voicebotCall.basePrompt,
                    voicebotPromptRef.current?.getSelection() ?? null,
                    `{${v}}`,
                  );
                  onChange({
                    ...value,
                    voicebotCall: {
                      ...value.voicebotCall,
                      basePrompt: next,
                      basePromptVars: [...value.voicebotCall.basePromptVars, v],
                    },
                  });
                  voicebotPromptRef.current?.focusAt(cursor);
                }}
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
            {value.voicebotCall.categoryPrompts.length === 0 && (
              <p className="text-[12px] text-text-secondary">
                Sin prompts específicos por taxonomía.
              </p>
            )}
            {value.voicebotCall.categoryPrompts.map((c) => (
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

      {/* c) Documentador */}
      <SegmentDocumentationSection
        value={value.documentador}
        onChange={(documentador) => onChange({ ...value, documentador })}
        extraVariables={extraVariables}
        disabled={disabled}
      />

      {/* d) Escalado al analista */}
      <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold text-text-primary">Escalado al analista</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Personaliza el concepto que el agente entrega al analista al escalar el caso.
          </p>
        </div>
        <div className="p-6">
          <Field label="Prompt">
            <PromptEditor
              ref={escalationPromptRef}
              value={value.analystEscalation.prompt}
              onChange={(prompt) =>
                onChange({ ...value, analystEscalation: { ...value.analystEscalation, prompt } })
              }
              onBlur={(prompt) =>
                onChange({
                  ...value,
                  analystEscalation: {
                    ...value.analystEscalation,
                    promptVars: variablesInPrompt(prompt).filter((variable) =>
                      pool.includes(variable),
                    ),
                  },
                })
              }
              rows={4}
              disabled={disabled}
              placeholder="Ej: Redacta el concepto para el analista usando {taxonomia_asignada} y {cot_cadena_de_razonamiento}."
            />
            <div className="mt-2">
              <p className="text-[11px] font-medium text-text-secondary mb-1.5">
                Variables disponibles para este prompt
              </p>
              <VariablePicker
                value={value.analystEscalation.promptVars}
                onChange={(promptVars) =>
                  onChange({
                    ...value,
                    analystEscalation: { ...value.analystEscalation, promptVars },
                  })
                }
                pool={pool}
                prompt={value.analystEscalation.prompt}
                onInsert={(v) => {
                  const { next, cursor } = spliceToken(
                    value.analystEscalation.prompt,
                    escalationPromptRef.current?.getSelection() ?? null,
                    `{${v}}`,
                  );
                  onChange({
                    ...value,
                    analystEscalation: {
                      ...value.analystEscalation,
                      prompt: next,
                      promptVars: [...value.analystEscalation.promptVars, v],
                    },
                  });
                  escalationPromptRef.current?.focusAt(cursor);
                }}
              />
            </div>
          </Field>
        </div>
      </section>
    </div>
  );
}
