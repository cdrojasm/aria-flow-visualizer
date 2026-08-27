import { Columns3 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STORAGE_PREFIX = "aria.hiddenColumns.";

// Set de claves de columna ocultas — vacío = todas visibles. Persiste por tabla
// (storageKey) en localStorage para recordar la preferencia entre sesiones.
// El estado inicial siempre es "todas visibles" (igual en server y cliente) y
// la preferencia guardada se aplica en un efecto post-mount, para no romper
// la hidratación SSR con un valor que el servidor no puede conocer.
export function useHiddenColumns<K extends string>(storageKey: string) {
  const [hidden, setHidden] = useState<Set<K>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
      if (raw) setHidden(new Set(JSON.parse(raw) as K[]));
    } catch {
      // localStorage no disponible (modo privado, etc.) — se queda con todas visibles.
    }
  }, [storageKey]);

  const toggle = (key: K) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try {
        localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify([...next]));
      } catch {
        // localStorage no disponible — la preferencia solo dura la sesión actual.
      }
      return next;
    });

  return { hidden, toggle };
}

// Botón "Columnas" con checkboxes para activar/desactivar columnas — para tablas
// con muchas columnas (Histórico de fraude, Cola). No cubre columnas fijas
// (selección, acciones): esas nunca se pasan en `columns`.
export function ColumnVisibilityMenu<K extends string>({
  columns,
  hidden,
  onToggle,
}: {
  columns: { key: K; label: string }[];
  hidden: Set<K>;
  onToggle: (key: K) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg border border-border bg-card text-[11px] text-text-primary hover:bg-surface"
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columnas
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {columns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={!hidden.has(col.key)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(col.key)}
            className="text-[12px]"
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
