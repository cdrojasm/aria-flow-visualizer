import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  TAG_CATEGORY_LABELS,
  emptyFilterGroup,
  type FilterCondition,
  type FilterGroup,
  type LogicalOperator,
  type TagCategory,
} from "@/data/configs";
import { TagMultiSelect } from "./TagMultiSelect";

const CATEGORY_OPTIONS: TagCategory[] = ["integration_point", "triggered_rule", "event_type"];

/* ─── AND/OR condition tree editor ──────────────────────
   Recursive: a FilterGroup holds a flat list of conditions plus nested
   sub-groups, each with its own AND/OR operator. Mirrors backend
   application/ports/configuration_port.py's FilterGroup/FilterCondition. */

export function FilterGroupBuilder({
  value,
  onChange,
  disabled,
  depth = 0,
}: {
  value: FilterGroup;
  onChange: (group: FilterGroup) => void;
  disabled?: boolean;
  depth?: number;
}) {
  const setOperator = (operator: LogicalOperator) => onChange({ ...value, operator });

  const addCondition = () =>
    onChange({
      ...value,
      conditions: [
        ...value.conditions,
        { id: crypto.randomUUID(), category: "event_type", operator: "in", values: [] },
      ],
    });

  const updateCondition = (id: string, patch: Partial<FilterCondition>) =>
    onChange({
      ...value,
      conditions: value.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });

  const removeCondition = (id: string) =>
    onChange({ ...value, conditions: value.conditions.filter((c) => c.id !== id) });

  const addGroup = () => onChange({ ...value, groups: [...value.groups, emptyFilterGroup()] });

  const updateGroup = (id: string, group: FilterGroup) =>
    onChange({ ...value, groups: value.groups.map((g) => (g.id === id ? group : g)) });

  const removeGroup = (id: string) =>
    onChange({ ...value, groups: value.groups.filter((g) => g.id !== id) });

  const isEmpty = value.conditions.length === 0 && value.groups.length === 0;

  return (
    <div className={depth > 0 ? "rounded-lg border border-border p-3 bg-surface/60" : "space-y-3"}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-text-secondary">Combinar con</span>
        <ToggleGroup
          type="single"
          value={value.operator}
          onValueChange={(v) => v && setOperator(v as LogicalOperator)}
          disabled={disabled}
        >
          <ToggleGroupItem value="and" className="h-7 px-2.5 text-[11px]">
            Y (AND)
          </ToggleGroupItem>
          <ToggleGroupItem value="or" className="h-7 px-2.5 text-[11px]">
            O (OR)
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {isEmpty && (
        <p className="text-[11px] text-text-secondary">
          Sin condiciones — el segmento no filtrará ningún evento.
        </p>
      )}

      <div className="space-y-2">
        {value.conditions.map((condition) => (
          <FilterConditionRow
            key={condition.id}
            value={condition}
            onChange={(patch) => updateCondition(condition.id, patch)}
            onRemove={() => removeCondition(condition.id)}
            disabled={disabled}
          />
        ))}
      </div>

      {value.groups.length > 0 && (
        <div className="space-y-2">
          {value.groups.map((group) => (
            <NestedGroup
              key={group.id}
              value={group}
              onChange={(g) => updateGroup(group.id, g)}
              onRemove={() => removeGroup(group.id)}
              disabled={disabled}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addCondition}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Agregar condición
        </button>
        <button
          type="button"
          onClick={addGroup}
          disabled={disabled}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Agregar grupo anidado
        </button>
      </div>
    </div>
  );
}

function NestedGroup({
  value,
  onChange,
  onRemove,
  disabled,
  depth,
}: {
  value: FilterGroup;
  onChange: (group: FilterGroup) => void;
  onRemove: () => void;
  disabled?: boolean;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger asChild>
          <button type="button" className="inline-flex items-center gap-1 text-[11px] font-medium text-text-secondary hover:text-text-primary">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Grupo anidado
          </button>
        </CollapsibleTrigger>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <CollapsibleContent className="mt-2">
        <FilterGroupBuilder value={value} onChange={onChange} disabled={disabled} depth={depth} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function FilterConditionRow({
  value,
  onChange,
  onRemove,
  disabled,
}: {
  value: FilterCondition;
  onChange: (patch: Partial<FilterCondition>) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={value.category}
          disabled={disabled}
          onChange={(e) => onChange({ category: e.target.value as TagCategory, values: [] })}
          className="h-8 rounded-md border border-border px-2 text-[12px] bg-background focus:outline-none focus:border-primary"
        >
          {CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {TAG_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-text-secondary">está en uno de</span>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="ml-auto p-1 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <TagMultiSelect
        category={value.category}
        value={value.values}
        onChange={(values) => onChange({ values })}
        disabled={disabled}
      />
    </div>
  );
}
