import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, X } from "lucide-react";
import { Field } from "@/components/configuracion/shared/FormControls";
import { ResolutionMethodCatalogManager } from "@/components/configuracion/ResolutionMethodCatalogManager";
import { ResolutionMethodPicker } from "@/components/configuracion/shared/ResolutionMethodPicker";
import { RESOLUTION_TAG_LABELS, type ResolutionTag, type ShortageBehavior } from "@/data/configs";
import {
  updateModusOperandiLibraryEntry,
  type ModusOperandiLibraryEntry,
} from "@/lib/api/knowledgeLibrary.functions";
import { listResolutionMethods } from "@/lib/api/resolutionMethod.functions";
import { playbookPath, shortageFromApi, shortageToApi } from "@/lib/playbookPath";

/* Playbook of one modus operandi (Biblioteca, not versioned): how the
   analyst agent resolves an alert that resembles it, and what to do when
   a resource is short. The analyst agent reads all of it together with the
   live availability; the executor applies the fallbacks on its own (no LLM)
   if the resource is gone by the time it reserves it. */

type Playbook = {
  strategy: string;
  resolution: ShortageBehavior;
  ifNoVoicebot: ShortageBehavior;
  ifNoAnalyst: ShortageBehavior;
};

const PRIMARY_TAGS: ResolutionTag[] = ["scale_to_analyst", "send_to_voicebot", "handle_by_aria"];
// A fallback runs without LLM, so it must be a concrete action - and never
// the resource that is short.
const IF_NO_VOICEBOT_TAGS: ResolutionTag[] = ["scale_to_analyst", "block_soft", "block_hard"];
const IF_NO_ANALYST_TAGS: ResolutionTag[] = ["send_to_voicebot", "block_soft", "block_hard"];

function initialPlaybook(entry: ModusOperandiLibraryEntry): Playbook {
  const p = entry.playbook;
  return p
    ? {
        strategy: p.strategy,
        resolution: shortageFromApi(p.resolution),
        ifNoVoicebot: shortageFromApi(p.if_no_voicebot),
        ifNoAnalyst: shortageFromApi(p.if_no_analyst),
      }
    : {
        strategy: "",
        resolution: { resolutionTag: "scale_to_analyst", resolutionMethodId: null },
        ifNoVoicebot: { resolutionTag: "block_soft", resolutionMethodId: null },
        ifNoAnalyst: { resolutionTag: "block_soft", resolutionMethodId: null },
      };
}

export function PlaybookPath({ path }: { path: ResolutionTag[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {path.map((tag, index) => (
        <span key={`${tag}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 && <ArrowRight className="h-3 w-3 text-text-secondary" />}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
            {RESOLUTION_TAG_LABELS[tag]}
          </span>
        </span>
      ))}
    </span>
  );
}

export function ModusOperandiPlaybookModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: ModusOperandiLibraryEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Playbook>(() => initialPlaybook(entry));
  const [showCatalog, setShowCatalog] = useState(false);
  const resolutionMethodsQuery = useQuery({
    queryKey: ["resolutionMethods"],
    queryFn: () => listResolutionMethods({ data: { activeOnly: true } }),
  });
  const resolutionMethods = resolutionMethodsQuery.data ?? [];
  const save = useMutation({
    mutationFn: () =>
      updateModusOperandiLibraryEntry({
        data: {
          entryId: entry.id,
          playbook: {
            strategy: draft.strategy,
            resolution: shortageToApi(draft.resolution),
            if_no_voicebot: shortageToApi(draft.ifNoVoicebot),
            if_no_analyst: shortageToApi(draft.ifNoAnalyst),
          },
        },
      }),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });

  const usesVoicebot = playbookPath(draft).includes("send_to_voicebot");
  const usesAnalyst = playbookPath(draft).includes("scale_to_analyst");

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-label={`Playbook de ${entry.title}`}
          className="bg-card rounded-xl border border-border w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h3 className="text-[14px] font-semibold text-text-primary">Playbook</h3>
              <p className="text-[12px] text-text-secondary">{entry.title}</p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-5 space-y-5">
            <Field
              label="Estrategia"
              hint="Cómo debe tratar el analista (agente) una alerta de este modus operandi."
            >
              <textarea
                value={draft.strategy}
                onChange={(e) => setDraft({ ...draft, strategy: e.target.value })}
                rows={4}
                maxLength={4000}
                placeholder="Ej: Confirmar con el cliente antes de bloquear; si reporta desconocer la transacción, bloquear la tarjeta."
                className="w-full rounded-md border border-border px-3 py-2 text-[13px] focus:outline-none focus:border-primary"
              />
            </Field>
            <Field
              label="Método de resolución"
              hint="Camino preferido. 'Resolver con ARIA' deja que el agente decida entre bloquear, dejar pasar o bidi."
            >
              <ResolutionMethodPicker
                name="Método de resolución"
                value={draft.resolution}
                onChange={(v) => setDraft({ ...draft, resolution: v })}
                allowedTags={PRIMARY_TAGS}
                resolutionMethods={resolutionMethods}
                onManage={() => setShowCatalog(true)}
              />
            </Field>
            <Field
              label="Si no hay voicebot"
              hint={
                usesVoicebot
                  ? "Qué hacer cuando no quedan slots o el voicebot está apagado."
                  : "Solo aplica si el camino pasa por el voicebot."
              }
            >
              <ResolutionMethodPicker
                name="Si no hay voicebot"
                value={draft.ifNoVoicebot}
                onChange={(v) => setDraft({ ...draft, ifNoVoicebot: v })}
                allowedTags={IF_NO_VOICEBOT_TAGS}
                resolutionMethods={resolutionMethods}
              />
            </Field>
            <Field
              label="Si no hay analista"
              hint={
                usesAnalyst
                  ? "Qué hacer cuando no hay analistas disponibles en la hora actual o están apagados."
                  : "Solo aplica si el camino pasa por un analista."
              }
            >
              <ResolutionMethodPicker
                name="Si no hay analista"
                value={draft.ifNoAnalyst}
                onChange={(v) => setDraft({ ...draft, ifNoAnalyst: v })}
                allowedTags={IF_NO_ANALYST_TAGS}
                resolutionMethods={resolutionMethods}
              />
            </Field>
            <div className="rounded-lg bg-surface p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-secondary mb-2">
                Camino si faltan recursos
              </p>
              <PlaybookPath path={playbookPath(draft)} />
            </div>
            {save.isError && (
              <p className="text-[12px] text-danger">No se pudo guardar: {String(save.error)}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-md text-[13px] text-text-secondary hover:bg-surface"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar playbook
            </button>
          </div>
        </div>
      </div>
      {/* Outside the overlay: clicks inside the catalog dialog bubble through
        the React tree and would otherwise close this modal. */}
      <ResolutionMethodCatalogManager open={showCatalog} onOpenChange={setShowCatalog} />
    </>
  );
}
