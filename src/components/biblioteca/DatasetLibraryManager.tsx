import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useState } from "react";

import { ActionButton, DataTable, TruncText } from "@/components/ui/DataTable";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  analyzeDatasetOnDemand,
  deleteDataset,
  downloadDatasetTemplate,
  getDatasets,
  type DatasetRecord,
} from "@/lib/api/datasets.functions";
import { CreateEmptyDatasetModal } from "@/components/datasets/CreateEmptyDatasetModal";
import { ExtractDatasetModal } from "@/components/datasets/ExtractDatasetModal";
import { UploadDatasetModal } from "@/components/datasets/UploadDatasetModal";
import { DatasetDetailDrawer } from "@/components/datasets/DatasetDetailDrawer";
import { AsyncOperationProgressCard } from "@/components/async/AsyncOperationProgressCard";

/* ─── Biblioteca → Datasets, the canonical dataset management surface ───
   Same "global catalog" footing as WatchlistManager.tsx: metadata-only
   table (name + row count, both already on DatasetRecord from GET
   /datasets - no per-row summary fetch, that N+1 is exactly what
   DATASETS_LIBRARY_DESIGN.md §8.1 warns against), row-action menu drills
   into DatasetDetailDrawer for anything heavier (distributions, rows,
   alert-field mapping). Modelos/Testing keep their own <select> pickers
   (see ModelFormModal.tsx / NewTestRunModal.tsx) and link back here
   instead of duplicating upload/delete. */

export function DatasetLibraryManager() {
  const queryClient = useQueryClient();
  const datasetsQuery = useQuery({ queryKey: ["datasets"], queryFn: () => getDatasets() });
  const datasets = datasetsQuery.data ?? [];
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["datasets"] });

  const [showUpload, setShowUpload] = useState(false);
  const [showCreateEmpty, setShowCreateEmpty] = useState(false);
  const [showExtract, setShowExtract] = useState(false);
  const [detailDataset, setDetailDataset] = useState<string | null>(null);
  const [deletingDataset, setDeletingDataset] = useState<DatasetRecord | null>(null);
  const [analyzingName, setAnalyzingName] = useState<string | null>(null);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingDeletionNames, setPendingDeletionNames] = useState<Set<string>>(new Set());
  const [trackedOperationIds, setTrackedOperationIds] = useState<string[]>([]);
  const visibleDatasets = datasets.filter((dataset) => !pendingDeletionNames.has(dataset.name));

  function trackOperation(operationId: string | null) {
    if (!operationId) return;
    setTrackedOperationIds((current) =>
      current.includes(operationId) ? current : [...current, operationId],
    );
  }

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteDataset({ data: { name } }),
    onSuccess: (response) => {
      if (response.async_operation_id) {
        trackOperation(response.async_operation_id);
        setPendingDeletionNames((current) => new Set(current).add(response.name));
      }
      invalidate();
      setDeletingDataset(null);
    },
    onError: () => {
      setDeleteError(
        "No se pudo iniciar la eliminación. El dataset no fue borrado; inténtalo de nuevo.",
      );
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (name: string) => analyzeDatasetOnDemand({ data: { name } }),
    onSuccess: (response, name) => {
      trackOperation(response.async_operation_id);
      queryClient.invalidateQueries({ queryKey: ["datasetSummary", name] });
      setAnalyzingName(null);
    },
    onError: () => setAnalyzingName(null),
  });

  async function handleDownloadTemplate(name: string) {
    setDownloadError(null);
    setDownloadingName(name);
    try {
      await downloadDatasetTemplate(name);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloadingName(null);
    }
  }

  return (
    <>
      <DataTable
        storageKey="biblioteca-datasets"
        title="Datasets"
        description="Sube CSVs, deriva subconjuntos, o crea datasets vacíos para llenarlos progresivamente (filas manuales, extracción, o curación desde alertas). Modelos y Testing solo eligen un dataset — la gestión vive aquí."
        itemLabel="dataset"
        rows={visibleDatasets}
        rowKey={(d) => d.name}
        isLoading={datasetsQuery.isLoading}
        loadingLabel="Cargando datasets…"
        emptyLabel="Sin datasets todavía."
        defaultSort={{ key: "name", dir: "asc" }}
        error={
          <>
            {datasetsQuery.isError && (
              <p className="px-5 py-3 text-[12px] text-danger">
                No se pudieron cargar los datasets.
              </p>
            )}
            {downloadError && <p className="px-5 py-3 text-[12px] text-danger">{downloadError}</p>}
            {deleteError && <p className="px-5 py-3 text-[12px] text-danger">{deleteError}</p>}
          </>
        }
        notice={
          trackedOperationIds.length > 0 && (
            <div className="px-5 py-3 border-b border-border space-y-2">
              <p className="text-[12px] font-medium text-text-primary">Procesos en segundo plano</p>
              {trackedOperationIds.map((id) => (
                <AsyncOperationProgressCard
                  key={id}
                  operationId={id}
                  title="Proceso de dataset"
                  onCompleted={() => {
                    setTrackedOperationIds((current) =>
                      current.filter((candidate) => candidate !== id),
                    );
                    invalidate();
                    queryClient.invalidateQueries({ queryKey: ["datasetSummary"] });
                  }}
                />
              ))}
            </div>
          )
        }
        columns={[
          {
            key: "name",
            label: "Nombre",
            minWidth: 220,
            sortValue: (d) => d.name,
            searchValue: (d) => d.name,
            render: (d) => (
              <TruncText maxWidth={360} className="font-medium text-text-primary">
                {d.name}
              </TruncText>
            ),
          },
          {
            key: "row_count",
            label: "Filas",
            minWidth: 90,
            align: "right",
            sortValue: (d) => d.row_count,
            render: (d) => (
              <span className="font-mono text-[12px] text-text-secondary">
                {d.row_count.toLocaleString("es-CO")}
              </span>
            ),
          },
        ]}
        actionsWidth={300}
        actions={(d) => (
          <>
            <ActionButton
              tone="primary"
              icon={<Eye className="h-3 w-3" />}
              aria-label="Visualizar"
              title="Visualizar"
              onClick={() => setDetailDataset(d.name)}
            >
              Ver
            </ActionButton>
            <ActionButton
              icon={
                downloadingName === d.name ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )
              }
              title="Descargar plantilla CSV (solo encabezados)"
              disabled={downloadingName === d.name}
              onClick={() => handleDownloadTemplate(d.name)}
            >
              Plantilla
            </ActionButton>
            <ActionButton
              icon={
                analyzingName === d.name ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )
              }
              title="Lanzar análisis estadístico"
              disabled={analyzingName === d.name}
              onClick={() => {
                setAnalyzingName(d.name);
                analyzeMutation.mutate(d.name);
              }}
            >
              Analizar
            </ActionButton>
            <ActionButton
              tone="danger"
              icon={<Trash2 className="h-3 w-3" />}
              title="Eliminar"
              onClick={() => setDeletingDataset(d)}
            >
              Borrar
            </ActionButton>
          </>
        )}
        tableActions={
          <>
            <ActionButton
              size="md"
              icon={<Upload className="h-3.5 w-3.5" />}
              onClick={() => setShowUpload(true)}
            >
              Subir CSV
            </ActionButton>
            <ActionButton size="md" onClick={() => setShowExtract(true)}>
              Extraer / derivar
            </ActionButton>
            <ActionButton
              tone="primary"
              size="md"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setShowCreateEmpty(true)}
            >
              Dataset vacío
            </ActionButton>
          </>
        }
      />

      <UploadDatasetModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={trackOperation}
      />
      <CreateEmptyDatasetModal open={showCreateEmpty} onClose={() => setShowCreateEmpty(false)} />
      <ExtractDatasetModal open={showExtract} onClose={() => setShowExtract(false)} />
      <DatasetDetailDrawer
        datasetName={detailDataset}
        open={!!detailDataset}
        onClose={() => setDetailDataset(null)}
      />

      <ConfirmDeleteDialog
        open={!!deletingDataset}
        onOpenChange={(open) => !open && setDeletingDataset(null)}
        itemName={`dataset "${deletingDataset?.name ?? ""}"`}
        consequence={`Se borran también sus datos de análisis y sus ${(deletingDataset?.row_count ?? 0).toLocaleString("es-CO")} filas. Esta acción no se puede deshacer.`}
        pending={deleteMutation.isPending}
        onConfirm={() => {
          setDeleteError(null);
          if (deletingDataset) deleteMutation.mutate(deletingDataset.name);
        }}
      />
    </>
  );
}
