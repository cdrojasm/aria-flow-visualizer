import { useState } from "react";

import { type SegmentCode, type SegmentSettings } from "@/data/configs";
import { SegmentAgentSection } from "./SegmentAgentSection";

/* ─── "Agente" tab ───────────────────────────────────────
   Own independent segment picker (not shared with Muestreo/Evaluación -
   see SegmentSamplingTab.tsx/SegmentEvaluationTab.tsx, split out of what
   used to be one combined "Config. por segmento" tab). Segment keys come
   from the channel catalog (see SegmentoTab.tsx), not a fixed enum. */

export function SegmentAgentTab({
  value,
  onChange,
  channelLabels,
  disabled,
}: {
  value: Record<SegmentCode, SegmentSettings>;
  onChange: (code: SegmentCode, patch: Partial<SegmentSettings>) => void;
  channelLabels: Record<string, string>;
  disabled?: boolean;
}) {
  const orderedCodes = Object.keys(value).sort((a, b) => value[a].order - value[b].order);
  const [selected, setSelected] = useState<SegmentCode>(orderedCodes[0] ?? "");
  const segment = value[selected];

  if (!segment) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 bg-card rounded-xl border border-border p-1.5 w-fit">
        {orderedCodes.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setSelected(code)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
              selected === code ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {channelLabels[code] ?? code}
          </button>
        ))}
      </div>

      <SegmentAgentSection
        value={segment.agent}
        onChange={(patch) => onChange(selected, { agent: { ...segment.agent, ...patch } })}
        disabled={disabled}
      />
    </div>
  );
}
