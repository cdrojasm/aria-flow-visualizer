import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import {
  downloadConfiguration,
  listBackups,
  uploadModelBundle,
  requestBackup,
  type BackupResponse,
  type BackupStatus,
} from "@/lib/api/backups.functions";

export const Route = createFileRoute("/backups")({
  head: () => ({ meta: [{ title: "Respaldos - ARIA" }] }),
  component: BackupsPage,
});

const STATUS: Record<BackupStatus, { label: string; className: string }> = {
  queued: { label: "En cola", className: "bg-warning/10 text-warning" },
  running: { label: "En curso", className: "bg-primary/10 text-primary" },
  succeeded: { label: "Completado", className: "bg-success/10 text-success" },
  failed: { label: "Fallido", className: "bg-danger/10 text-danger" },
};

function dateLabel(value: string) {
  return new Date(value).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function BackupRow({ backup }: { backup: BackupResponse }) {
  const status = STATUS[backup.status];
  const active = backup.status === "queued" || backup.status === "running";
  const Icon =
    backup.status === "succeeded" ? CheckCircle2 : backup.status === "failed" ? XCircle : Clock3;

  return (
    <article className="grid gap-3 border-b border-border px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[13px] text-text-primary">
            {dateLabel(backup.created_at)}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}
          >
            {active ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
            {status.label}
          </span>
        </div>
        <p
          className="mt-1 truncate font-mono text-[11px] text-text-secondary"
          title={backup.directory}
        >
          {backup.directory}
        </p>
        {backup.error && <p className="mt-1 text-[12px] text-danger">{backup.error}</p>}
      </div>
      {backup.status === "succeeded" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-secondary md:justify-end">
          <span>DynamoDB: {backup.dynamodb_items ?? 0} registros</span>
          <span>OpenSearch: {backup.opensearch_documents ?? 0} documentos</span>
          <span>Objetos: {backup.object_storage_objects ?? 0}</span>
        </div>
      )}
    </article>
  );
}

const FIELD =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-text-primary";

function ModelUploadForm() {
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

function ConfigurationDownload() {
  const download = useMutation({ mutationFn: downloadConfiguration });
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div>
        <h2 className="text-[14px] font-semibold text-text-primary">Descargar configuración</h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          Exporta la configuración activa en JSON como copia de seguridad.
        </p>
        {download.isError && (
          <p role="alert" className="mt-1 text-[12px] text-danger">
            {download.error.message}
          </p>
        )}
        {download.isSuccess && (
          <p role="status" className="mt-1 text-[12px] text-success">
            Descargado: {download.data}
          </p>
        )}
      </div>
      <Button variant="outline" onClick={() => download.mutate({})} disabled={download.isPending}>
        {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
        Descargar JSON
      </Button>
    </section>
  );
}

function BackupsPage() {
  const queryClient = useQueryClient();
  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: listBackups,
    refetchInterval: (query) =>
      query.state.data?.some((item) => item.status === "queued" || item.status === "running")
        ? 2_000
        : 15_000,
  });
  const requestMutation = useMutation({
    mutationFn: requestBackup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["backups"] }),
  });
  const backups = backupsQuery.data ?? [];
  const busy =
    requestMutation.isPending ||
    backups.some((item) => item.status === "queued" || item.status === "running");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1100px] space-y-6 px-8 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold text-text-primary">Respaldos</h1>
            <p className="mt-1 text-[13px] text-text-secondary">
              Crea y consulta copias de DynamoDB, OpenSearch y almacenamiento de objetos.
            </p>
          </div>
          <Button onClick={() => requestMutation.mutate()} disabled={busy}>
            {requestMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Crear respaldo
          </Button>
        </header>

        {requestMutation.isError && (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger"
          >
            No se pudo solicitar el respaldo. {requestMutation.error.message}
          </div>
        )}
        {backupsQuery.isError && (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger"
          >
            No se pudo cargar el historial de respaldos.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <ModelUploadForm />
          <ConfigurationDownload />
        </div>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-[14px] font-semibold text-text-primary">Historial</h2>
              <p className="mt-0.5 text-[12px] text-text-secondary">
                Las solicitudes y resultados quedan registrados aquí.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => backupsQuery.refetch()}
              disabled={backupsQuery.isFetching}
              aria-label="Actualizar lista"
            >
              {backupsQuery.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Actualizar
            </Button>
          </div>
          {backupsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-[13px] text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando respaldos…
            </div>
          ) : backups.length ? (
            backups.map((backup) => <BackupRow key={backup.backup_id} backup={backup} />)
          ) : (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <Archive className="h-8 w-8 text-text-secondary/60" />
              <p className="mt-3 text-[13px] font-medium text-text-primary">
                Todavía no hay respaldos
              </p>
              <p className="mt-1 text-[12px] text-text-secondary">
                Al crear uno aparecerá aquí su estado y el detalle de los datos copiados.
              </p>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
