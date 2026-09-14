import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, TagInput } from "@/components/configuracion/shared/FormControls";
import { createEmptyDataset } from "@/lib/api/datasets.functions";

export function CreateEmptyDatasetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [fields, setFields] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: () => createEmptyDataset({ data: { name, fields } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      reset();
      onClose();
    },
  });

  const reset = () => {
    setName("");
    setFields([]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear dataset vacío</DialogTitle>
          <DialogDescription>
            Define el nombre y las columnas. Queda listo con 0 filas — agrégalas después desde
            "Filas" en el detalle del dataset.
          </DialogDescription>
        </DialogHeader>

        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: casos_revision_manual"
            className="w-full h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:border-primary"
          />
        </Field>

        <Field label="Columnas" hint="Escribe un nombre de columna y presiona Enter o coma.">
          <TagInput value={fields} onChange={setFields} placeholder="Ej: id_transaccion" />
        </Field>

        {createMutation.isError && (
          <p className="text-[12px] text-danger">{(createMutation.error as Error).message}</p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="px-3 py-2 rounded-md text-[13px] text-text-secondary hover:text-text-primary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!name.trim() || fields.length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {createMutation.isPending ? "Creando…" : "Crear dataset"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
