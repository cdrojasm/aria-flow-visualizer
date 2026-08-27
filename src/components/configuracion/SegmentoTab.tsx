import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import {
  SEGMENT_LABELS,
  TAG_CATEGORY_LABELS,
  type SegmentCode,
  type SegmentSettings,
  type TagCategory,
} from "@/data/configs";
import { FilterGroupBuilder } from "./FilterGroupBuilder";
import { TagCatalogManager } from "./TagCatalogManager";

const SEGMENT_CODES: SegmentCode[] = ["canales_digitales", "tarjetas"];
const CATEGORY_OPTIONS: TagCategory[] = ["integration_point", "triggered_rule", "event_type"];

export function SegmentoTab({
  value,
  onChange,
  disabled,
}: {
  value: Record<SegmentCode, SegmentSettings>;
  onChange: (segments: Record<SegmentCode, SegmentSettings>) => void;
  disabled?: boolean;
}) {
  const [managingCategory, setManagingCategory] = useState<TagCategory | null>(null);

  const updateSegment = (code: SegmentCode, patch: Partial<SegmentSettings>) =>
    onChange({ ...value, [code]: { ...value[code], ...patch } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 bg-card rounded-xl border border-border p-4">
        <span className="text-[11px] font-medium text-text-secondary">Catálogo de tags de filtro:</span>
        {CATEGORY_OPTIONS.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setManagingCategory(category)}
            className="text-[11px] font-medium text-primary border border-primary/30 rounded-md px-2.5 py-1 hover:bg-primary/10"
          >
            Gestionar {TAG_CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {SEGMENT_CODES.map((code) => (
        <section key={code} className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">{SEGMENT_LABELS[code]}</h2>
              <p className="text-[12px] text-text-secondary mt-0.5">
                Enciende el procesamiento de este segmento y define, con condiciones AND/OR, qué eventos maneja.
              </p>
            </div>
            <Switch
              checked={value[code].enabled}
              onCheckedChange={(enabled) => updateSegment(code, { enabled })}
              disabled={disabled}
            />
          </div>
          <div className="p-6">
            <FilterGroupBuilder
              value={value[code].filter}
              onChange={(filter) => updateSegment(code, { filter })}
              disabled={disabled}
            />
          </div>
        </section>
      ))}

      {managingCategory && (
        <TagCatalogManager
          category={managingCategory}
          open={managingCategory !== null}
          onOpenChange={(open) => !open && setManagingCategory(null)}
        />
      )}
    </div>
  );
}
