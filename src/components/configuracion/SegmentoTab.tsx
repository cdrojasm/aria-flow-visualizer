import { GripVertical, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { Switch } from "@/components/ui/switch";
import {
  defaultSegmentAgent,
  defaultSegmentMonitoring,
  emptyFilterGroup,
  type SegmentCode,
  type SegmentSettings,
} from "@/data/configs";
import { FilterGroupBuilder } from "./FilterGroupBuilder";

/* ─── Segmento tab ────────────────────────────────────────
   Segment keys come from the channel_library_port.py catalog now (see
   biblioteca.tsx's "Canales" tab), not a fixed 2-value enum - this tab
   renders whatever keys the config's segments dict has. Order is the tie-
   break ResolveAlertSegmentUseCase uses when more than one enabled
   segment's filter matches the same alert - editable here via
   drag-and-drop (native HTML5 DnD, no library: a handful of channels at
   most), per configuration version, deliberately NOT in the channel
   catalog itself (catalog is global/config-independent, this ordering
   is per-draft). */

export function SegmentoTab({
  value,
  onChange,
  channels,
  disabled,
}: {
  value: Record<SegmentCode, SegmentSettings>;
  onChange: (segments: Record<SegmentCode, SegmentSettings>) => void;
  channels: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const [draggedCode, setDraggedCode] = useState<string | null>(null);
  const orderedCodes = Object.keys(value).sort((a, b) => value[a].order - value[b].order);
  const channelLabels = Object.fromEntries(channels.map((c) => [c.id, c.name]));
  const availableToAdd = channels.filter((c) => !(c.id in value));

  const updateSegment = (code: SegmentCode, patch: Partial<SegmentSettings>) =>
    onChange({ ...value, [code]: { ...value[code], ...patch } });

  const addChannel = (channelId: string) => {
    onChange({
      ...value,
      [channelId]: {
        enabled: false,
        filter: emptyFilterGroup(),
        monitoring: defaultSegmentMonitoring(),
        agent: defaultSegmentAgent(),
        order: orderedCodes.length,
      },
    });
  };

  const reorder = (targetCode: string) => {
    if (!draggedCode || draggedCode === targetCode) return;
    const next = orderedCodes.filter((c) => c !== draggedCode);
    next.splice(orderedCodes.indexOf(targetCode), 0, draggedCode);
    const patched = { ...value };
    next.forEach((code, index) => {
      patched[code] = { ...patched[code], order: index };
    });
    onChange(patched);
  };

  return (
    <div className="space-y-6">
      <p className="text-[12px] text-text-secondary">
        Los canales se gestionan en{" "}
        <Link to="/biblioteca" className="text-primary underline">
          Biblioteca → Canales
        </Link>
        . Los valores de punto de integración, regla disparada y tipo de evento en{" "}
        <Link to="/biblioteca" className="text-primary underline">
          Biblioteca → Catálogos de eventos
        </Link>
        .
      </p>

      {!disabled && availableToAdd.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-card rounded-xl border border-border p-4">
          <span className="text-[11px] font-medium text-text-secondary">Agregar canal a esta configuración:</span>
          {availableToAdd.map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => addChannel(channel.id)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary border border-primary/30 rounded-md px-2.5 py-1 hover:bg-primary/10"
            >
              <Plus className="h-3 w-3" /> {channel.name}
            </button>
          ))}
        </div>
      )}

      {orderedCodes.map((code) => (
        <section
          key={code}
          draggable={!disabled}
          onDragStart={() => setDraggedCode(code)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => reorder(code)}
          onDragEnd={() => setDraggedCode(null)}
          className={`bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${draggedCode === code ? "opacity-50" : ""}`}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              {!disabled && <GripVertical className="h-4 w-4 text-text-secondary cursor-grab shrink-0" />}
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">{channelLabels[code] ?? code}</h2>
                <p className="text-[12px] text-text-secondary mt-0.5">
                  Enciende el procesamiento de este segmento y define, con condiciones AND/OR, qué eventos maneja.
                </p>
              </div>
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
      {orderedCodes.length === 0 && (
        <p className="text-[13px] text-text-secondary text-center py-8">
          Sin canales activos en Biblioteca — agrega uno para configurar segmentos.
        </p>
      )}
    </div>
  );
}
