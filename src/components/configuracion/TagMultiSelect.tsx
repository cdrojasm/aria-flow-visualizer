import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TagCategory } from "@/data/configs";
import { listTags, type TagEntryResponse } from "@/lib/api/configuration.functions";

/* ─── Server-backed tag combobox ────────────────────────
   Unlike VariablePicker (a static local pool) this fetches its options
   live from the managed tag catalog per category, since those values are
   admin-editable reference data, not baked into the frontend. */

export function TagMultiSelect({
  category,
  value,
  onChange,
  disabled,
}: {
  category: TagCategory;
  value: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<TagEntryResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    listTags({ data: { category, activeOnly: true } })
      .then((res) => {
        if (!cancelled) setTags(res);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category]);

  const toggleValue = (tagValue: string) =>
    onChange(value.includes(tagValue) ? value.filter((v) => v !== tagValue) : [...value, tagValue]);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 min-h-[20px]">
        {value.length === 0 && <span className="text-[11px] text-text-secondary">Sin valores seleccionados.</span>}
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px]">
            {v}
            <button type="button" disabled={disabled} onClick={() => toggleValue(v)} className="hover:text-danger transition-colors">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border text-text-secondary text-[11px] hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Agregar valor
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar tag…" />
            <CommandList>
              <CommandEmpty className="px-3 py-4 text-[12px] text-text-secondary">
                {loading ? "Cargando…" : error ? "No se pudo cargar el catálogo." : "Sin coincidencias."}
              </CommandEmpty>
              <CommandGroup>
                {tags
                  .filter((t) => !value.includes(t.value))
                  .map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.value}
                      onSelect={() => {
                        toggleValue(t.value);
                        setOpen(false);
                      }}
                      className="text-[12px]"
                    >
                      {t.value}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
