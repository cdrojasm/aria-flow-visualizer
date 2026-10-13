import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  DollarSign,
  History,
  Loader2,
  Phone,
  Power,
  RotateCcw,
  Save,
  Users,
} from "lucide-react";
import { AmountTierEditor } from "@/components/configuracion/AmountTierEditor";
import { AnalystCapacityEditor } from "@/components/configuracion/AnalystCapacityEditor";
import { ResolutionMethodCatalogManager } from "@/components/configuracion/ResolutionMethodCatalogManager";
import { TagMultiSelect } from "@/components/configuracion/TagMultiSelect";
import { Field, LimitField } from "@/components/configuracion/shared/FormControls";
import { ResolutionMethodPicker } from "@/components/configuracion/shared/ResolutionMethodPicker";
import type { SamplingIntervalUnit } from "@/data/configs";
import { useRole } from "@/hooks/useRole";
import { validateAmountTiers } from "@/lib/amountTiers";
import {
  getOperationalSettings,
  getOperationsCapacity,
  listOperationalSettingsHistory,
  updateOperationalSettings,
  type ChannelCapacity,
  type OperationalSettings,
} from "@/lib/api/operations.functions";
import { listResolutionMethods } from "@/lib/api/resolutionMethod.functions";

/* "Operación" tab. Unlike every other tab on /configuracion, nothing here
   belongs to a configuration version: it reads/writes the backend's
   OperationalSettings singleton and takes effect as soon as it is saved
   (no test/activate cycle), because these are levers operations needs to
   pull right away - switching the agent off, sizing voicebot slots, the
   analyst staffing matrix, queue handling. What to do when a resource is
   short is NOT here: each modus operandi playbook defines it (Biblioteca). */

const CAPACITY_STATUS: Record<string, { label: string; className: string }> = {
  available: { label: "Disponible", className: "bg-success/10 text-success" },
  exhausted: { label: "Sin cupo", className: "bg-warning/15 text-warning" },
  unavailable: { label: "Apagado", className: "bg-text-secondary/10 text-text-secondary" },
};

const SETTING_LABELS: Record<string, string> = {
  agent_enabled: "Estado del agente",
  analyst_enabled: "Estado del analista",
  voicebot_enabled: "Estado del voicebot",
  voicebot_max_concurrent_calls: "Slots de voicebot",
  amount_tiers: "Rangos de monto",
  reasoning_evaluation_sample_rate: "Muestreo de evaluación de razonamiento",
};

function settingLabel(path: string): string {
  if (SETTING_LABELS[path]) return SETTING_LABELS[path];
  if (path.startsWith("analyst_capacity")) return "Matriz de analistas";
  if (path.startsWith("queue_")) return "Manejo de encolamiento";
  return path;
}

function formatValue(value: unknown, path?: string): string {
  if (typeof value === "boolean") return value ? "encendido" : "apagado";
  if (value === null || value === undefined) return "—";
  if (path === "amount_tiers" && Array.isArray(value)) {
    const codes = value.map((tier) => (tier as { code?: unknown }).code).filter(Boolean);
    return codes.length ? codes.join(", ") : "sin rangos";
  }
  if (path === "reasoning_evaluation_sample_rate" && typeof value === "number") {
    return `${(value * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%`;
  }
  if (typeof value === "object") return "(editado)";
  return String(value);
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${on ? "bg-primary" : "bg-border"}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

function CapacityTile({
  icon,
  title,
  channel,
  unit,
}: {
  icon: ReactNode;
  title: string;
  channel: ChannelCapacity | undefined;
  unit: string;
}) {
  const status = CAPACITY_STATUS[channel?.status ?? ""] ?? CAPACITY_STATUS.unavailable;
  return (
    <div className="flex-1 min-w-[220px] rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-text-primary">
          {icon} {title}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-[22px] font-semibold text-text-primary tabular-nums">
        {channel ? channel.available : "—"}
        <span className="text-[13px] font-normal text-text-secondary">
          {" "}
          / {channel?.total ?? 0} {unit} libres
        </span>
      </p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
        <p className="text-[12px] text-text-secondary mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function OperationsPanel({ readOnly }: { readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useRole();
  const settingsQuery = useQuery({
    queryKey: ["operationalSettings"],
    queryFn: () => getOperationalSettings(),
  });
  const capacityQuery = useQuery({
    queryKey: ["operationsCapacity"],
    queryFn: () => getOperationsCapacity(),
    refetchInterval: 15_000,
  });
  const historyQuery = useQuery({
    queryKey: ["operationalSettingsHistory"],
    queryFn: () => listOperationalSettingsHistory({ data: { limit: 10 } }),
  });
  const resolutionMethodsQuery = useQuery({
    queryKey: ["resolutionMethods"],
    queryFn: () => listResolutionMethods({ data: { activeOnly: true } }),
  });
  const resolutionMethods = resolutionMethodsQuery.data ?? [];
  const [showCatalog, setShowCatalog] = useState(false);

  const [draft, setDraft] = useState<OperationalSettings | null>(null);
  useEffect(() => {
    if (settingsQuery.data && draft === null) setDraft(structuredClone(settingsQuery.data));
  }, [settingsQuery.data, draft]);

  const saveMutation = useMutation({
    mutationFn: (settings: OperationalSettings) =>
      updateOperationalSettings({ data: { settings, changedBy: user?.email ?? null } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["operationalSettings"], saved);
      setDraft(structuredClone(saved));
      void queryClient.invalidateQueries({ queryKey: ["operationsCapacity"] });
      void queryClient.invalidateQueries({ queryKey: ["operationalSettingsHistory"] });
    },
  });

  if (settingsQuery.isError) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/5 p-6 text-[13px] text-danger">
        No se pudo cargar la configuración de operación: {String(settingsQuery.error)}
      </div>
    );
  }
  if (!draft || !settingsQuery.data) {
    return (
      <div className="flex items-center gap-2 p-6 text-[13px] text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando operación…
      </div>
    );
  }

  const saved = settingsQuery.data;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const tierErrors = validateAmountTiers(draft.amountTiers);
  const sampleRateValid =
    Number.isFinite(draft.reasoningEvaluationSampleRate) &&
    draft.reasoningEvaluationSampleRate >= 0 &&
    draft.reasoningEvaluationSampleRate <= 1;
  const canSave = dirty && tierErrors.length === 0 && sampleRateValid;
  const patch = (changes: Partial<OperationalSettings>) =>
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev));
  const capacity = capacityQuery.data;

  return (
    <fieldset disabled={readOnly || saveMutation.isPending} className="contents">
      <div className="space-y-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-5 py-3">
          <p className="text-[12px] text-text-primary">
            <span className="font-semibold">Se aplica de inmediato</span> a toda la operación, sin
            versión ni pruebas: no depende de la configuración seleccionada arriba.
          </p>
          <div className="flex items-center gap-2">
            {saveMutation.isError && (
              <span className="text-[12px] text-danger">
                No se pudo guardar
                {String(saveMutation.error).includes("422")
                  ? ": el servidor rechazó los valores (revisa los rangos de monto)."
                  : "."}
              </span>
            )}
            {dirty && !canSave && (
              <span className="text-[12px] text-danger">Corrige los errores antes de guardar.</span>
            )}
            <button
              type="button"
              disabled={!dirty}
              onClick={() => setDraft(structuredClone(saved))}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-text-primary hover:bg-background disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Descartar
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => saveMutation.mutate(draft)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar y aplicar
            </button>
          </div>
        </div>

        <Section
          title="Estado del agente"
          description="Enciende o apaga la operación de ARIA y sus recursos de resolución."
        >
          <div className="p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center justify-center h-9 w-9 rounded-full ${draft.agentEnabled ? "bg-success/10 text-success" : "bg-text-secondary/10 text-text-secondary"}`}
              >
                <Power className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[13px] font-medium text-text-primary">
                  {draft.agentEnabled ? "Agente encendido" : "Agente apagado"}
                </p>
                <p className="text-[12px] text-text-secondary">
                  {draft.agentEnabled
                    ? "ARIA procesa todas las alertas normalmente."
                    : "Las alertas del simulador y de producción se saltan (quedan registradas). Las ejecuciones únicas y los lotes CSV sí se procesan."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => patch({ agentEnabled: !draft.agentEnabled })}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium ${draft.agentEnabled ? "bg-danger/10 text-danger hover:bg-danger/20" : "bg-success text-white hover:bg-success/90"}`}
            >
              <Power className="h-4 w-4" /> {draft.agentEnabled ? "Apagar" : "Encender"}
            </button>
          </div>
          <div className="px-6 pb-6 flex flex-wrap gap-3 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-4 flex-1 min-w-[260px] rounded-lg border border-border p-4">
              <div>
                <p className="text-[13px] font-medium text-text-primary">Estado del analista</p>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  {draft.analystEnabled
                    ? "Operación normal: las alertas escaladas entran a la cola de analistas."
                    : "Analistas no disponibles: la disponibilidad se reporta en 0 y cada playbook aplica su respaldo."}
                </p>
              </div>
              <Toggle
                label="Estado del analista"
                on={draft.analystEnabled}
                onToggle={() => patch({ analystEnabled: !draft.analystEnabled })}
              />
            </div>
            <div className="flex items-center justify-between gap-4 flex-1 min-w-[260px] rounded-lg border border-border p-4">
              <div>
                <p className="text-[13px] font-medium text-text-primary">Estado del voicebot</p>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  {draft.voicebotEnabled
                    ? "Operación normal: cada llamada ocupa un slot hasta su respuesta."
                    : "Voicebot no disponible: los slots disponibles se reportan en 0 y cada playbook aplica su respaldo."}
                </p>
              </div>
              <Toggle
                label="Estado del voicebot"
                on={draft.voicebotEnabled}
                onToggle={() => patch({ voicebotEnabled: !draft.voicebotEnabled })}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Disponibilidad ahora"
          description="Recursos libres en este momento (se actualiza cada 15 s). Analistas: valor de la matriz para la hora actual menos los analistas atendiendo una alerta. Voicebot: slots menos llamadas esperando respuesta."
        >
          <div className="p-6 flex flex-wrap gap-3">
            <CapacityTile
              icon={<Users className="h-4 w-4 text-text-secondary" />}
              title="Analistas"
              channel={capacity?.analysts}
              unit="analistas"
            />
            <CapacityTile
              icon={<Phone className="h-4 w-4 text-text-secondary" />}
              title="Voicebot"
              channel={capacity?.voicebot}
              unit="slots"
            />
          </div>
        </Section>

        <Section
          title="Voicebot"
          description="Cuota fija de slots. Cada llamada bloquea un slot y el callback con la respuesta lo libera; si la respuesta no llega, el slot se libera solo a los 30 minutos."
        >
          <div className="p-6">
            <LimitField
              label="Slots asignados"
              hint="Máximo de llamadas de voicebot en curso a la vez."
              value={draft.voicebotMaxConcurrentCalls}
              onChange={(v) => patch({ voicebotMaxConcurrentCalls: v })}
              min={0}
              max={500}
              suffix="slots"
            />
          </div>
        </Section>

        <Section
          title="Analistas — disponibilidad"
          description="Analistas disponibles por hora del día. Define perfiles y asígnalos a días del mes (ej. días de pago); editar el perfil del día actual cambia la disponibilidad de inmediato. Cada analista atiende una alerta a la vez; si no la resuelve en 30 minutos, la reserva se libera."
        >
          <div className="p-6">
            <AnalystCapacityEditor
              value={draft.analystCapacity}
              onChange={(v) => patch({ analystCapacity: v })}
            />
          </div>
        </Section>

        <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-[14px] font-semibold text-text-primary">Manejo de encolamiento</h2>
            <p className="text-[12px] text-text-secondary mt-0.5">
              Tiempo máximo que una alerta puede esperar en cola antes de ser saltada (skip), y
              monto mínimo para que valga la pena encolarla.
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field
              label="Tiempo de vida máximo en cola"
              hint="Si una alerta lleva encolada más de este tiempo, ARIA la saltea en vez de procesarla."
            >
              <div className="flex items-center gap-2 max-w-xs">
                <Clock className="h-4 w-4 text-text-secondary shrink-0" />
                <input
                  type="number"
                  min={1}
                  value={draft.queueMaxLifetimeValue}
                  onChange={(e) => patch({ queueMaxLifetimeValue: Number(e.target.value) })}
                  className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                />
                <select
                  value={draft.queueMaxLifetimeUnit}
                  onChange={(e) =>
                    patch({
                      queueMaxLifetimeUnit: e.target.value as SamplingIntervalUnit,
                    })
                  }
                  className="h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background"
                >
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                  <option value="days">Días</option>
                </select>
              </div>
            </Field>
            <Field
              label="Descartar por monto"
              hint="Si el monto de la alerta es menor a este valor, ARIA la descarta en vez de encolarla."
            >
              <div className="flex items-center gap-2 max-w-xs">
                <DollarSign className="h-4 w-4 text-text-secondary shrink-0" />
                <input
                  type="number"
                  min={0}
                  value={draft.queueDiscardAmountThreshold}
                  onChange={(e) =>
                    patch({
                      queueDiscardAmountThreshold: Number(e.target.value),
                    })
                  }
                  className="w-32 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                />
                <span className="text-[12px] text-text-secondary">0 = sin descarte por monto</span>
              </div>
            </Field>
            <div className="md:col-span-2 flex items-center justify-between">
              <div>
                <label className="text-[13px] font-medium text-text-primary">
                  Restringir por regla disparada
                </label>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  {draft.queueRuleFilterMode === "not_belongs"
                    ? "Si está activo, se descartan las alertas cuya regla disparada pertenezca a la lista; el resto se encola."
                    : "Si está activo, solo se encolan alertas cuya regla disparada pertenezca a la lista; el resto se descarta."}
                </p>
              </div>
              <button
                onClick={() =>
                  patch({
                    queueRuleFilterEnabled: !draft.queueRuleFilterEnabled,
                  })
                }
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${draft.queueRuleFilterEnabled ? "bg-primary" : "bg-border"}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${draft.queueRuleFilterEnabled ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
            </div>
            {draft.queueRuleFilterEnabled && (
              <div className="md:col-span-2 space-y-4">
                <Field
                  label="Condición de la lista"
                  hint="Define si la lista de abajo es de reglas permitidas (pertenencia) o de reglas excluidas (no pertenencia)."
                >
                  <div className="inline-flex rounded-md border border-border p-0.5 bg-background">
                    <button
                      type="button"
                      onClick={() => patch({ queueRuleFilterMode: "belongs" })}
                      className={`h-8 px-3 rounded text-[13px] font-medium transition-colors ${draft.queueRuleFilterMode === "belongs" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
                    >
                      Pertenece a la lista
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ queueRuleFilterMode: "not_belongs" })}
                      className={`h-8 px-3 rounded text-[13px] font-medium transition-colors ${draft.queueRuleFilterMode === "not_belongs" ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"}`}
                    >
                      No pertenece a la lista
                    </button>
                  </div>
                </Field>
                <Field
                  label={
                    draft.queueRuleFilterMode === "not_belongs"
                      ? "Reglas disparadas excluidas de cola"
                      : "Reglas disparadas permitidas en cola"
                  }
                  hint={
                    draft.queueRuleFilterMode === "not_belongs"
                      ? "Alertas cuya regla disparada esté en esta lista se descartan en vez de encolarse."
                      : "Alertas cuya regla disparada no esté en esta lista se descartan en vez de encolarse."
                  }
                >
                  <TagMultiSelect
                    category="triggered_rule"
                    value={draft.queueAllowedTriggeredRules}
                    onChange={(v) => patch({ queueAllowedTriggeredRules: v })}
                  />
                </Field>
              </div>
            )}
            <div className="md:col-span-2">
              <Field
                label="Descarte de cola"
                hint="Qué debe hacer ARIA con una alerta en vez de encolarla normalmente, ya sea por tiempo de vida, monto mínimo o filtro de regla disparada."
              >
                <ResolutionMethodPicker
                  name="queue-discard"
                  resolutionMethods={resolutionMethods}
                  onManage={() => setShowCatalog(true)}
                  value={draft.queueDiscardBehavior}
                  onChange={(v) => patch({ queueDiscardBehavior: v })}
                />
              </Field>
            </div>
          </div>
        </section>

        <Section
          title="Rangos de monto"
          description="Rangos con los que se clasifica el monto de cada alerta al llegar. Alimentan el filtro de monto de Dashboard, Monitor e Histórico."
        >
          <div className="p-6">
            <AmountTierEditor
              value={draft.amountTiers}
              onChange={(amountTiers) => patch({ amountTiers })}
            />
          </div>
        </Section>

        <Section
          title="Evaluación de razonamiento"
          description="Porcentaje de alertas finalizadas que un evaluador LLM revisa para medir alucinaciones y uso correcto de datos (Monitor). 0 % lo desactiva."
        >
          <div className="p-6">
            <Field
              label="Muestra evaluada"
              hint="Entre 0 % y 100 %. Más muestra da indicadores más precisos a cambio de más llamadas al LLM."
            >
              <div className="flex items-center gap-2 max-w-xs">
                <input
                  type="number"
                  aria-label="Porcentaje de muestreo de evaluación"
                  min={0}
                  max={100}
                  step={0.5}
                  value={
                    Number.isFinite(draft.reasoningEvaluationSampleRate)
                      ? Math.round(draft.reasoningEvaluationSampleRate * 10000) / 100
                      : ""
                  }
                  onChange={(e) =>
                    patch({
                      reasoningEvaluationSampleRate:
                        e.target.value.trim() === "" ? Number.NaN : Number(e.target.value) / 100,
                    })
                  }
                  className="w-24 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
                />
                <span className="text-[12px] text-text-secondary">%</span>
              </div>
              {!sampleRateValid && (
                <p className="mt-1 text-[12px] text-danger">Debe ser un valor entre 0 y 100.</p>
              )}
            </Field>
          </div>
        </Section>

        <Section
          title="Historial de cambios"
          description="Últimos cambios guardados en esta pestaña."
        >
          <div className="p-6">
            {(historyQuery.data ?? []).length === 0 ? (
              <p className="text-[12px] text-text-secondary">Sin cambios registrados.</p>
            ) : (
              <ul className="space-y-2">
                {(historyQuery.data ?? []).map((change) => (
                  <li key={change.id} className="flex gap-3 text-[12px]">
                    <History className="h-3.5 w-3.5 mt-0.5 text-text-secondary shrink-0" />
                    <div>
                      <p className="text-text-secondary">
                        {new Date(change.changed_at).toLocaleString("es-CO")} ·{" "}
                        {change.changed_by ?? "sin usuario"}
                      </p>
                      <p className="text-text-primary">
                        {change.changes.length === 0
                          ? "Guardado sin cambios"
                          : change.changes
                              .map(
                                (c) =>
                                  `${settingLabel(c.path)}: ${formatValue(c.previous, c.path)} → ${formatValue(c.new, c.path)}`,
                              )
                              .filter((line, index, all) => all.indexOf(line) === index)
                              .join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>
      </div>
      <ResolutionMethodCatalogManager open={showCatalog} onOpenChange={setShowCatalog} />
    </fieldset>
  );
}
