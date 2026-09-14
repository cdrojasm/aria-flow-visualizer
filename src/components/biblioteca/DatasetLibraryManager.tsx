import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useState } from "react";

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

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteDataset({ data: { name } }),
    onSuccess: () => {
      invalidate();
      setDeletingDataset(null);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: (name: string) => analyzeDatasetOnDemand({ data: { name } }),
    onSuccess: (_res, name) => {
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
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border gap-3 flex-wrap">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">Datasets</h2>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Sube CSVs, deriva subconjuntos, o crea datasets vacíos para llenarlos progresivamente
            (filas manuales, extracción, o curación desde alertas). Modelos y Testing solo eligen un
            dataset — la gestión vive aquí.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 border border-border text-text-primary px-3 py-2 rounded-md text-[13px] font-medium hover:bg-surface"
          >
            <Upload className="h-4 w-4" /> Subir CSV
          </button>
          <button
            onClick={() => setShowExtract(true)}
            className="inline-flex items-center gap-1.5 border border-border text-text-primary px-3 py-2 rounded-md text-[13px] font-medium hover:bg-surface"
          >
            Extraer / derivar
          </button>
          <button
            onClick={() => setShowCreateEmpty(true)}
            className="inline-flex items-center gap-2 bg-primary text-white px-3 py-2 rounded-md text-[13px] font-medium hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Dataset vacío
          </button>
        </div>
      </div>

      {downloadError && <p className="px-6 pt-3 text-[12px] text-danger">{downloadError}</p>}

      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-secondary text-left border-b border-border">
            <th className="px-6 py-2 font-medium">Nombre</th>
            <th className="px-3 py-2 font-medium">Filas</th>
            <th className="px-3 py-2 font-medium w-56"></th>
          </tr>
        </thead>
        <tbody>
          {datasetsQuery.isLoading && (
            <tr>
              <td colSpan={3} className="px-6 py-8 text-center text-text-secondary">
                Cargando datasets…
              </td>
            </tr>
          )}
          {datasetsQuery.isError && (
            <tr>
              <td colSpan={3} className="px-6 py-8 text-center text-danger">
                No se pudieron cargar los datasets.
              </td>
            </tr>
          )}
          {datasetsQuery.isSuccess &&
            datasets.map((d) => (
              <tr
                key={d.name}
                className="border-b border-border last:border-0 hover:bg-surface align-top"
              >
                <td className="px-6 py-3 font-medium text-text-primary">{d.name}</td>
                <td className="px-3 py-3 font-mono text-[12px] text-text-secondary">
                  {d.row_count.toLocaleString("es-CO")}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDetailDataset(d.name)}
                      title="Visualizar"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-primary border border-primary/30 hover:bg-primary/10"
                    >
                      <Eye className="h-3.5 w-3.5" /> Visualizar
                    </button>
                    <button
                      onClick={() => handleDownloadTemplate(d.name)}
                      disabled={downloadingName === d.name}
                      title="Descargar plantilla CSV (solo encabezados)"
                      className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-40"
                    >
                      {downloadingName === d.name ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setAnalyzingName(d.name);
                        analyzeMutation.mutate(d.name);
                      }}
                      disabled={analyzingName === d.name}
                      title="Lanzar análisis estadístico"
                      className="p-1.5 rounded hover:bg-primary-light text-text-secondary hover:text-primary disabled:opacity-40"
                    >
                      {analyzingName === d.name ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => setDeletingDataset(d)}
                      title="Eliminar"
                      className="p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          {datasetsQuery.isSuccess && datasets.length === 0 && (
            <tr>
              <td colSpan={3} className="px-6 py-8 text-center text-text-secondary">
                Sin datasets todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <UploadDatasetModal open={showUpload} onClose={() => setShowUpload(false)} />
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
        onConfirm={() => deletingDataset && deleteMutation.mutate(deletingDataset.name)}
      />
    </section>
  );
}
