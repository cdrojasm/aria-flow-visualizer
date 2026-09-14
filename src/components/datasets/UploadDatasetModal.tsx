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
import { Field } from "@/components/configuracion/shared/FormControls";
import { uploadDataset } from "@/lib/api/datasets.functions";

export function UploadDatasetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!);
      return uploadDataset({ data: form });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      reset();
      onClose();
    },
  });

  const reset = () => setFile(null);

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
          <DialogTitle>Subir dataset (CSV)</DialogTitle>
          <DialogDescription>
            El nombre del dataset se toma del nombre del archivo. Falla si ya existe uno con ese
            nombre — bórralo primero o sube con otro nombre de archivo.
          </DialogDescription>
        </DialogHeader>

        <Field label="Archivo CSV" hint="Solo archivos .csv.">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-[13px] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:text-[12px] file:bg-surface"
          />
        </Field>

        {uploadMutation.isError && (
          <p className="text-[12px] text-danger">{(uploadMutation.error as Error).message}</p>
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
            disabled={!file || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
            className="px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {uploadMutation.isPending ? "Subiendo…" : "Subir dataset"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
