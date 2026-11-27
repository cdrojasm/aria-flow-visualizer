import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadModelBundle } from "@/lib/api/backups.functions";

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-text-primary";

export function ModelUploadForm() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [targetField, setTargetField] = useState("fraud_label");
  const upload = useMutation({
    mutationFn: uploadModelBundle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["models"] });
      setFile(null);
      setTag("");
      setDescription("");
    },
  });
  const valid = !!file && tag.trim().length > 0 && datasetName.trim().length > 0;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file || !valid) return;
    upload.mutate({ data: { file, tag: tag.trim(), description, datasetName, targetField } });
  };
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <h2 className="text-[14px] font-semibold text-text-primary">Cargar modelo entrenado</h2>
      <p className="mt-0.5 text-[12px] text-text-secondary">
        Sube un bundle .joblib generado por el entrenamiento de ARIA. Queda registrado como listo
        pero inactivo; actívalo desde Modelos cuando lo valides. Solo carga archivos de origen
        confiable.
      </p>
      <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-[12px] text-text-secondary md:col-span-2">
          Archivo del modelo (.joblib)
          <input
            type="file"
            accept=".joblib"
            data-testid="model-bundle-file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className={FIELD}
          />
        </label>
        <label className="space-y-1 text-[12px] text-text-secondary">
          Etiqueta (única)
          <input value={tag} onChange={(e) => setTag(e.target.value)} className={FIELD} />
        </label>
        <label className="space-y-1 text-[12px] text-text-secondary">
          Dataset de origen
          <input
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="space-y-1 text-[12px] text-text-secondary">
          Campo objetivo
          <input
            value={targetField}
            onChange={(e) => setTargetField(e.target.value)}
            className={FIELD}
          />
        </label>
        <label className="space-y-1 text-[12px] text-text-secondary">
          Descripción (opcional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={FIELD}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={!valid || upload.isPending}>
            {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
            Cargar modelo
          </Button>
          {upload.isSuccess && (
            <span role="status" className="text-[12px] text-success">
              Modelo «{upload.data.tag}» cargado. Actívalo desde Modelos.
            </span>
          )}
          {upload.isError && (
            <span role="alert" className="text-[12px] text-danger">
              {upload.error.message}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
