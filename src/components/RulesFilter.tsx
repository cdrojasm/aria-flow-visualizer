import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";

import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { REGLAS_GATILLADAS } from "@/data/rules";

// Filtro compacto multi-select para reglas disparadas por el motor de riesgo —
// lista vacía = sin filtro (todas las reglas).
export function RulesFilter({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);

  const toggle = (rule: string) =>
    onChange(value.includes(rule) ? value.filter((r) => r !== rule) : [...value, rule]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg border border-border bg-card text-[11px] text-text-primary hover:bg-surface"
        >
          Reglas
          {value.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold tabular-nums">
              {value.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-text-secondary" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandList>
            <CommandGroup>
              {REGLAS_GATILLADAS.map((rule) => {
                const checked = value.includes(rule);
                return (
                  <CommandItem key={rule} value={rule} onSelect={() => toggle(rule)} className="text-[12px] gap-2">
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${checked ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                      {checked && <Check className="h-2.5 w-2.5" />}
                    </span>
                    {rule}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
