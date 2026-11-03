import { RESOLUTION_TAG_LABELS, type ResolutionTag, type ShortageBehavior } from "@/data/configs";
import type { ResolutionMethodResponse } from "@/lib/api/resolutionMethod.functions";

/* Picks one entry from the resolution-method catalog (see
   ResolutionMethodCatalogManager). The picked entry's tag is copied next to
   its id (backend's ShortageBehavior), so readers can branch on the tag
   without a catalog lookup. `allowedTags` narrows the catalog - e.g. a
   playbook's "if no voicebot" fallback can't route back to the voicebot. */
export function ResolutionMethodPicker({
  value,
  onChange,
  name,
  allowedTags,
  resolutionMethods,
  onManage,
  disabled,
}: {
  value: ShortageBehavior;
  onChange: (v: ShortageBehavior) => void;
  name: string;
  allowedTags?: ResolutionTag[];
  resolutionMethods: ResolutionMethodResponse[];
  onManage?: () => void;
  disabled?: boolean;
}) {
  const options = allowedTags
    ? resolutionMethods.filter((m) => allowedTags.includes(m.resolution_tag as ResolutionTag))
    : resolutionMethods;
  const selectedMissing =
    !!value.resolutionMethodId && !options.some((m) => m.id === value.resolutionMethodId);
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={name}
        disabled={disabled}
        value={value.resolutionMethodId ?? ""}
        onChange={(e) => {
          const method = options.find((m) => m.id === e.target.value);
          if (!method) return;
          onChange({
            resolutionMethodId: method.id,
            resolutionTag: method.resolution_tag as ResolutionTag,
          });
        }}
        className="h-9 min-w-0 flex-1 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary bg-background disabled:opacity-60"
      >
        {!value.resolutionMethodId && (
          <option value="" disabled>
            {`Selecciona un método (por defecto: ${RESOLUTION_TAG_LABELS[value.resolutionTag]})`}
          </option>
        )}
        {selectedMissing && (
          <option value={value.resolutionMethodId ?? ""} disabled>
            Método inactivo ({RESOLUTION_TAG_LABELS[value.resolutionTag]})
          </option>
        )}
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.value} ({RESOLUTION_TAG_LABELS[m.resolution_tag as ResolutionTag]})
          </option>
        ))}
      </select>
      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="text-[11px] font-medium text-primary hover:underline shrink-0"
        >
          Gestionar métodos
        </button>
      )}
    </div>
  );
}
