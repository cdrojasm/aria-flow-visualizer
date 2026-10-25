import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";

import { SideDrawer } from "@/components/ui/side-drawer";
import { Field } from "@/components/configuracion/shared/FormControls";
import { getDatasets, uploadDataset } from "@/lib/api/datasets.functions";

export function UploadDatasetModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded?: (operationId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: getDatasets, enabled: open });
  const datasetName = file?.name.replace(/\.csv$/i, "") ?? "";
  const duplicateName =
    !!datasetName &&
    (datasetsQuery.data ?? []).some(
      (dataset) =>
        dataset.name.localeCompare(datasetName, undefined, { sensitivity: "accent" }) === 0,
    );

  const uploadMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file!);
      return uploadDataset({
        data: form,
        onProgress: (loaded, total) => setUploadPercent(Math.round((loaded / total) * 100)),
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      onUploaded?.(response.async_operation_id);
      reset();
      setUploadPercent(null);
      onClose();
    },
  });

  const reset = () => {
    setFile(null);
    setUploadPercent(null);
  };

  return (
    <SideDrawer
      open={open}
      dirty={file !== null && !uploadMutation.isPending}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      size="md"
      title="Subir dataset (CSV)"
      description={
        <>
          El nombre del dataset se toma del nombre del archivo. Falla si ya existe uno con ese
          nombre — bórralo primero o sube con otro nombre de archivo.
        </>
      }
      footer={
        <>
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
            disabled={!file || duplicateName || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
            className="px-3 py-2 rounded-md text-[13px] font-medium bg-primary text-white disabled:opacity-50"
          >
            {uploadMutation.isPending
              ? uploadPercent === 100
                ? "Iniciando procesamiento…"
                : "Subiendo…"
              : "Subir dataset"}
          </button>
        </>
      }
    >
      <Field label="Archivo CSV" hint="Solo archivos .csv.">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            uploadMutation.reset();
            setFile(e.target.files?.[0] ?? null);
          }}
          className="w-full text-[13px] file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-border file:text-[12px] file:bg-surface"
        />
      </Field>

      {duplicateName && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[12px] text-warning">
          Ya existe un dataset llamado <strong>{datasetName}</strong>. Cambia el nombre del archivo
          antes de subirlo.
        </div>
      )}

      {uploadMutation.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          {(uploadMutation.error as Error).message.includes("409")
            ? "Ese nombre de dataset ya está en uso. Renombra el archivo e inténtalo de nuevo."
            : "No se pudo subir el dataset. Verifica el archivo e inténtalo nuevamente."}
        </div>
      )}
      {uploadMutation.isPending && uploadPercent !== null && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-[12px] text-text-secondary">
            <span>Subiendo archivo…</span>
            <span>{uploadPercent}%</span>
          </div>
          <Progress value={uploadPercent} />
        </div>
      )}
    </SideDrawer>
  );
}
