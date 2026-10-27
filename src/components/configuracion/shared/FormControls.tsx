import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Plus, Settings, Trash2, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Switch } from "@/components/ui/switch";
import {
  type DistributionValue,
  type SamplingCriterion,
  type ToolPickerFields,
} from "@/data/configs";
import { useVariableCatalog } from "@/hooks/useVariableCatalog";
import { useVectorStoreVersions, useVectorStoreGenerations } from "@/hooks/useVectorStoreVersions";
import { listWatchlists, type WatchlistType } from "@/lib/api/watchlist.functions";
import { VariableCatalogManager } from "../VariableCatalogManager";

/* ─── Shared form controls, extracted verbatim from configuracion.tsx ──
   (Phase 2) so the new per-segment components (SegmentMonitoringSection,
   SegmentAgentSection) can reuse them without duplicating logic.
   configuracion.tsx imports Field/LimitField back for its own remaining
   general/infra/ops/test usages. */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-text-primary mb-1">{label}</label>
      {hint && <p className="text-[11px] text-text-secondary mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

// A label + description + Switch row - the enable/disable pattern used by
// every agent tool toggle (vector store, watchlist, calculator, XGBoost
// model, pandas history, ...). Extracted so new tool switches don't
// re-hand-roll this markup each time.
export function SwitchField({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="pr-4">
        <p className="text-[13px] font-medium text-text-primary">{label}</p>
        <p className="text-[12px] text-text-secondary mt-0.5">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

export function LimitField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-text-primary">{label}</label>
      <p className="text-[12px] text-text-secondary mt-0.5 mb-2">{hint}</p>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return;
            const next = Number(raw);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="w-32 h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
        />
        {suffix && <span className="text-[12px] text-text-secondary">{suffix}</span>}
        <span className="text-[11px] text-text-secondary ml-auto">
          rango {min}–{max}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-primary"
      />
    </div>
  );
}

export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = input.trim().replace(/,$/, "");
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput("");
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    }
    if (e.key === "Backspace" && !input && value.length > 0) onChange(value.slice(0, -1));
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="min-h-[40px] flex flex-wrap gap-1.5 items-center rounded-md border border-border px-3 py-2 cursor-text focus-within:border-primary"
    >
      {value.map((f) => (
        <span
          key={f}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[12px]"
        >
          {f}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== f))}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        placeholder={value.length === 0 ? (placeholder ?? "") : ""}
        className="flex-1 min-w-[120px] text-[13px] outline-none bg-transparent"
      />
    </div>
  );
}

// Standard inline warning banner - same border/bg/icon treatment everywhere
// a form needs to flag something without blocking the user (as opposed to
// a hard validation error). Use this instead of ad-hoc `text-warning` text.
export function WarningAlert({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-text-primary">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <div>{children}</div>
    </div>
  );
}

const LARGE_CONTENT_VARIABLES = new Set(["transacciones_json"]);

export function VariableContentSizeWarning({ variables }: { variables: string[] }) {
  const selected = variables.filter((variable) => LARGE_CONTENT_VARIABLES.has(variable));
  if (selected.length === 0) return null;

  return (
    <WarningAlert>
      <span className="font-medium">Contenido potencialmente grande:</span>{" "}
      <code>{selected.join(", ")}</code> incluye el historial completo de transacciones. Usarlo sin
      resumir puede aumentar considerablemente los tokens y la latencia; el payload completo de una
      alerta tiene un límite de 380 KB.
    </WarningAlert>
  );
}

export function VariablePicker({
  value,
  onChange,
  pool,
  onInsert,
  prompt,
}: {
  value: string[];
  // Adds/removes from the selected list. When onInsert is given, adding a
  // variable goes through onInsert instead (it's expected to update this
  // list itself, alongside splicing `{variable}` into the paired
  // prompt/template field, in one combined call) - removal (the X button)
  // always goes through onChange directly.
  onChange: (v: string[]) => void;
  pool?: string[];
  onInsert?: (variable: string) => void;
  prompt?: string;
}) {
  const [search, setSearch] = useState("");
  const [showManager, setShowManager] = useState(false);
  const { variables } = useVariableCatalog();
  const effectivePool = pool ?? variables;
  const searching = search.trim().length > 0;
  const MAX_MATCHES = 8;
  const matches = effectivePool.filter(
    (v) => !value.includes(v) && v.toLowerCase().includes(search.toLowerCase()),
  );
  const visibleMatches = matches.slice(0, MAX_MATCHES);
  const promptBound = prompt !== undefined;
  const visible = promptBound ? value.filter((v) => prompt.includes(`{${v}}`)) : value;

  const select = (v: string) => {
    if (onInsert) onInsert(v);
    else onChange([...value, v]);
    setSearch("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {visible.length === 0 && (
          <span className="text-[11px] text-text-secondary">
            {promptBound ? "No hay variables de este prompt." : "Sin variables seleccionadas."}
          </span>
        )}
        {visible.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-medium"
          >
            {v}
            {!promptBound && (
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x !== v))}
                className="hover:text-danger transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>
      <VariableContentSizeWarning variables={value} />
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar variable…"
            className="flex-1 h-8 rounded-md border border-border px-3 text-[12px] focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShowManager(true)}
            title="Gestionar variables de origen"
            className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-border text-text-secondary hover:border-primary hover:text-primary transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
        {searching && (
          <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-lg py-1">
            {matches.length === 0 && (
              <p className="px-3 py-2 text-[11px] text-text-secondary">Sin coincidencias.</p>
            )}
            {visibleMatches.map((v) => (
              <button
                key={v}
                type="button"
                onMouseDown={() => select(v)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[12px] text-text-primary hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <Plus className="h-3 w-3 shrink-0" /> {v}
              </button>
            ))}
            {matches.length > MAX_MATCHES && (
              <p className="px-3 py-1.5 text-[11px] text-text-secondary">
                y {matches.length - MAX_MATCHES} más — sigue escribiendo para filtrar.
              </p>
            )}
          </div>
        )}
      </div>
      <VariableCatalogManager open={showManager} onOpenChange={setShowManager} />
    </div>
  );
}

export function SamplingDistributionEditor({
  value,
  onChange,
}: {
  value: SamplingCriterion[];
  onChange: (v: SamplingCriterion[]) => void;
}) {
  const updateCriterion = (id: string, patch: Partial<SamplingCriterion>) =>
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addCriterion = () =>
    onChange([
      ...value,
      {
        id: `crit-${Date.now()}`,
        name: "Nuevo criterio",
        values: [{ id: `v-${Date.now()}`, label: "Valor", pct: 100 }],
      },
    ]);

  const removeCriterion = (id: string) => onChange(value.filter((c) => c.id !== id));

  const updateValue = (critId: string, valId: string, patch: Partial<DistributionValue>) =>
    updateCriterion(critId, {
      values: value
        .find((c) => c.id === critId)!
        .values.map((v) => (v.id === valId ? { ...v, ...patch } : v)),
    });

  const addValue = (critId: string) =>
    updateCriterion(critId, {
      values: [
        ...value.find((c) => c.id === critId)!.values,
        { id: `v-${Date.now()}`, label: "Nuevo valor", pct: 0 },
      ],
    });

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
              <input
                value={c.name}
                onChange={(e) => updateCriterion(c.id, { name: e.target.value })}
                className="h-8 rounded-md border border-border px-2 text-[13px] font-medium focus:outline-none focus:border-primary"
              />
              <span
                className={`text-[11px] font-mono ml-1 ${total === 100 ? "text-success" : "text-warning"}`}
              >
                {total}% {total === 100 ? "" : "(debería sumar 100%)"}
              </span>
              <button
                onClick={() => removeCriterion(c.id)}
                className="ml-auto p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1.5">
              {c.values.map((v) => (
                <div key={v.id} className="flex items-center gap-2">
                  <input
                    value={v.label}
                    onChange={(e) => updateValue(c.id, v.id, { label: e.target.value })}
                    className="flex-1 h-8 rounded-md border border-border px-2 text-[12px] focus:outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={v.pct}
                    onChange={(e) => updateValue(c.id, v.id, { pct: Number(e.target.value) })}
                    className="w-16 h-8 rounded-md border border-border px-2 text-[12px] text-right focus:outline-none focus:border-primary"
                  />
                  <span className="text-[11px] text-text-secondary">%</span>
                  <button
                    onClick={() => removeValue(c.id, v.id)}
                    disabled={c.values.length <= 1}
                    className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => addValue(c.id)}
              className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Agregar valor
            </button>
          </div>
        );
      })}
      <button
        onClick={addCriterion}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" /> Nuevo criterio de filtrado
      </button>
    </div>
  );
}

/* ─── Vector store instance picker ───────────────────────
   The Búsqueda en Vector Store's instance selector (see AgentToolsSection),
   shown once the search is switched on. One vector store per step, not
   several; several steps may point at the same instance - that's
   sharing, not multi-selection. */

export function VectorStoreInstancePicker({
  instanceId,
  onInstanceIdChange,
  generation,
  onGenerationChange,
  disabled,
}: {
  instanceId: string | null;
  onInstanceIdChange: (id: string | null) => void;
  generation?: number | null;
  onGenerationChange?: (generation: number | null) => void;
  disabled?: boolean;
}) {
  const { versions: instances } = useVectorStoreVersions();
  const selected = instances.find((i) => i.id === instanceId);
  const generations = useVectorStoreGenerations(instanceId ?? undefined);

  return (
    <Field
      label="Vector store"
      hint="La configuración fija una generación concreta. Solo cambia producción cuando se aprueba su despliegue."
    >
      <select
        value={instanceId ?? ""}
        onChange={(e) => onInstanceIdChange(e.target.value || null)}
        disabled={disabled}
        className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background disabled:opacity-50"
      >
        <option value="">Sin instancia asignada</option>
        {instances.map((instance) => (
          <option key={instance.id} value={instance.id}>
            {`v${instance.version} · ${instance.name}`}
            {instance.latestGeneration == null ? " (sin construir)" : ""}
          </option>
        ))}
      </select>
      {!instanceId && (
        <p className="mt-1.5 text-[11px] text-danger">
          Selecciona un vector store para poder guardar la búsqueda activa.
        </p>
      )}
      {instances.length === 0 && (
        <p className="mt-1.5 text-[11px] text-text-secondary">
          Sin instancias disponibles - créalas en Biblioteca → Repositorio de Conocimiento.
        </p>
      )}
      {instanceId && onGenerationChange && (
        <label className="mt-2 block text-[11px] text-text-secondary">
          Generación de Vector Store
          <select aria-label="Generación de Vector Store" value={generation ?? ""}
            disabled={disabled} onChange={event => onGenerationChange(event.target.value ? Number(event.target.value) : null)}
            className="mt-1 w-full h-9 rounded-md border border-border px-3 text-[13px] bg-background">
            <option value="">Construir al guardar</option>
            {(generations.data ?? []).filter(g => g.status === "ready").map(g => (
              <option key={g.generation} value={g.generation}>Generación {g.generation}{g.in_production ? " · En producción" : ""}</option>
            ))}
            {generation != null && !(generations.data ?? []).some(g => g.generation === generation && g.status === "ready") && (
              <option value={generation}>Generación {generation} · no disponible</option>
            )}
          </select>
        </label>
      )}
      {selected && selected.latestGeneration == null && (
        <p className="mt-1.5 text-[11px] text-text-secondary">
          Al guardar se construirá una generación con los documentos de esta instancia. Producción mantiene su generación actual.
        </p>
      )}
    </Field>
  );
}

/* ─── Watchlist tool: enable switch + list picker + compare field ──
   Blacklist/whitelist, split out of the old flat "built-in tools" pill
   group into their own tool (item 2: "agrega un activador con switch, y
   luego de activar, permite agregar al usuario las listas disponibles").
   Selected lists show whether their nature makes them watch for
   membership (blacklist) or its absence (whitelist) - derived from each
   Watchlist's own list_type, not a separate field. */

const WATCHLIST_NATURE_LABEL: Record<WatchlistType, string> = {
  blacklist: "Vigila pertenencia",
  whitelist: "Vigila no pertenencia",
};
const WATCHLIST_NATURE_STYLE: Record<WatchlistType, string> = {
  blacklist: "bg-danger/10 text-danger border-danger/30",
  whitelist: "bg-success/10 text-success border-success/30",
};

function WatchlistToolField({
  enabled,
  onEnabledChange,
  watchlistIds,
  onWatchlistIdsChange,
  compareField,
  onCompareFieldChange,
  pool,
  disabled,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  watchlistIds: string[];
  onWatchlistIdsChange: (ids: string[]) => void;
  compareField: string | null;
  onCompareFieldChange: (field: string | null) => void;
  pool: string[];
  disabled?: boolean;
}) {
  const watchlistsQuery = useQuery({
    queryKey: ["watchlists", "active"],
    queryFn: () => listWatchlists({ data: { activeOnly: true } }),
  });
  const watchlists = watchlistsQuery.data ?? [];
  const selected = watchlists.filter((w) => watchlistIds.includes(w.id));
  const toggle = (id: string) =>
    onWatchlistIdsChange(
      watchlistIds.includes(id) ? watchlistIds.filter((i) => i !== id) : [...watchlistIds, id],
    );

  return (
    <div className="space-y-3">
      <SwitchField
        label="Listas negras y blancas"
        hint="Permite al agente consultar si un valor de la alerta pertenece a alguna lista."
        checked={enabled}
        onCheckedChange={(checked) => {
          onEnabledChange(checked);
          if (!checked) {
            onWatchlistIdsChange([]);
            onCompareFieldChange(null);
          }
        }}
        disabled={disabled}
      />
      {enabled && (
        <>
          <Field label="Listas" hint="Listas que el agente puede consultar.">
            <div className="flex flex-wrap gap-1.5">
              {watchlists.map((w) => {
                const active = watchlistIds.includes(w.id);
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(w.id)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors disabled:opacity-50 ${
                      active
                        ? "bg-primary text-white border-primary"
                        : "border-border text-text-secondary hover:border-primary hover:text-primary"
                    }`}
                  >
                    {w.name}
                  </button>
                );
              })}
              {watchlists.length === 0 && (
                <p className="text-[11px] text-text-secondary">
                  Sin listas disponibles - créalas en Biblioteca → Listas negras y blancas.
                </p>
              )}
            </div>
            {selected.length > 0 && (
              <div className="mt-2 space-y-1">
                {selected.map((w) => (
                  <div key={w.id} className="flex items-center gap-2 text-[11px]">
                    <span className="text-text-secondary">{w.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded border font-medium ${WATCHLIST_NATURE_STYLE[w.list_type]}`}
                    >
                      {WATCHLIST_NATURE_LABEL[w.list_type]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Field>
          <Field
            label="Campo de comparación"
            hint="Campo de la alerta cuyo valor se busca en las listas seleccionadas."
          >
            <select
              value={compareField ?? ""}
              onChange={(e) => onCompareFieldChange(e.target.value || null)}
              disabled={disabled}
              className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background disabled:opacity-50"
            >
              <option value="">Sin campo asignado</option>
              {pool.map((variable) => (
                <option key={variable} value={variable}>
                  {variable}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

/* ─── Agent tool picker ───────────────────────────────────
   The plain tool switches (watchlist, calculator) - rendered by the shared
   AgentToolsSection, which adds XGBoost and the delegated-research
   tools below them. */

export function AgentToolsFields({
  value,
  onChange,
  pool,
  disabled,
}: {
  value: ToolPickerFields;
  onChange: (patch: Partial<ToolPickerFields>) => void;
  pool: string[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <WatchlistToolField
          enabled={value.watchlistEnabled}
          onEnabledChange={(watchlistEnabled) => onChange({ watchlistEnabled })}
          watchlistIds={value.watchlistIds}
          onWatchlistIdsChange={(watchlistIds) => onChange({ watchlistIds })}
          compareField={value.watchlistCompareField}
          onCompareFieldChange={(watchlistCompareField) => onChange({ watchlistCompareField })}
          pool={pool}
          disabled={disabled}
        />
      </div>
      <div className="pt-2 border-t border-border">
        <SwitchField
          label="Calculadora"
          hint="Permite al agente hacer cálculos numéricos exactos en vez de estimarlos."
          checked={value.calculatorEnabled}
          onCheckedChange={(calculatorEnabled) => onChange({ calculatorEnabled })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
