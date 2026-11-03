import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import {
  getFraudReviewImport,
  uploadFraudReviewImport,
  type ApiFraudReviewImportRow,
} from "@/lib/api/alerts.functions";

// Bulk fraud_label review (decision D2): CSV alert_id,fraud_label,note ->
// POST /alerts/fraud-review-imports, then poll the task until it is READY
// or FAILED and show the per-row report. Returns the pieces the page lays
// out (hidden input, buttons, result panel).

const ROW_STATUS: Record<ApiFraudReviewImportRow["status"], { label: string; className: string }> =
  {
    applied: { label: "Aplicada", className: "bg-[#dcfce7] text-[#166534]" },
    invalid: { label: "Inválida", className: "bg-[#fef3c7] text-[#92400e]" },
    not_found: { label: "No encontrada", className: "bg-[#f3f4f6] text-[#374151]" },
    error: { label: "Error", className: "bg-[#fee2e2] text-[#991b1b]" },
  };

const IMPORT_POLL_MS = 2_000;

export function downloadFraudReviewTemplate() {
  const content =
    "alert_id,fraud_label,note\n00000000-0000-0000-0000-000000000000,fraud,Cliente confirmó que no reconoce la transacción\n";
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla-revision-fraude.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** CSV upload button + the polled per-row report panel. */
export function useFraudReviewImport(onFinished: () => void) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadFraudReviewImport({ data: { file } }),
    onSuccess: (res) => setTaskId(res.task_id),
  });
  const poll = useQuery({
    queryKey: ["fraudReviewImport", taskId],
    queryFn: () => getFraudReviewImport({ data: { taskId: taskId! } }),
    enabled: Boolean(taskId),
    refetchInterval: (q) =>
      q.state.data && q.state.data.status !== "PENDING" ? false : IMPORT_POLL_MS,
  });
  const finished = poll.data && poll.data.status !== "PENDING";
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (finished && taskId && notified.current !== taskId) {
      notified.current = taskId;
      onFinished();
    }
  }, [finished, taskId, onFinished]);

  const start = (file: File) => {
    setFileName(file.name);
    setTaskId(null);
    upload.mutate(file);
  };
  const close = () => {
    setFileName("");
    setTaskId(null);
    upload.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const busy = upload.isPending || (Boolean(taskId) && !finished);

  const input = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".csv,text/csv"
      className="hidden"
      data-testid="fraud-review-csv-input"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) start(file);
      }}
    />
  );
  const trigger = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={busy}
      className="inline-flex items-center gap-2 h-[30px] px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-medium hover:opacity-90 disabled:opacity-60"
    >
      <Upload className="h-3.5 w-3.5" />
      Cargar CSV de revisiones
    </button>
  );
  const templateButton = (
    <button
      type="button"
      onClick={downloadFraudReviewTemplate}
      className="inline-flex items-center gap-2 h-[30px] px-3 rounded-lg border border-border text-text-primary text-[11px] font-medium hover:bg-surface"
    >
      <Download className="h-3.5 w-3.5" />
      Descargar plantilla
    </button>
  );

  const result = poll.data;
  const panel = fileName ? (
    <section className="bg-card rounded-xl border border-border shadow-[0_1px_4px_rgba(0,0,0,0.06)] mb-6">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
          <FileSpreadsheet className="h-4 w-4 text-text-secondary" />
          {fileName}
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={close}
          className="p-1 rounded-md hover:bg-surface text-text-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {upload.isError ? (
        <p className="px-5 py-4 text-[12px] text-danger">
          No se pudo cargar el archivo: {String(upload.error)}
        </p>
      ) : poll.isError ? (
        <p className="px-5 py-4 text-[12px] text-danger">
          No se pudo consultar el avance: {String(poll.error)}
        </p>
      ) : !result || result.status === "PENDING" ? (
        <div className="px-5 py-8 flex items-center justify-center gap-2 text-[13px] text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {upload.isPending ? "Subiendo archivo…" : "Aplicando revisiones…"}
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          {result.status === "FAILED" ? (
            <p className="text-[13px] text-danger">
              La carga falló: {result.error ?? "error desconocido"}
            </p>
          ) : (
            <p className="text-[13px] text-text-primary">
              <span className="font-semibold">{result.applied}</span> de {result.total} filas
              aplicadas
              {result.failed > 0 && (
                <>
                  {" "}
                  · <span className="font-semibold text-danger">{result.failed}</span> con problemas
                </>
              )}
            </p>
          )}
          {result.rows.length > 0 && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-[11px] uppercase tracking-wider text-text-secondary text-left">
                    <th className="font-normal py-2 px-3">Fila</th>
                    <th className="font-normal py-2 px-3">Alerta</th>
                    <th className="font-normal py-2 px-3">Resultado</th>
                    <th className="font-normal py-2 px-3">Estado</th>
                    <th className="font-normal py-2 px-3">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.row} className="border-t border-border">
                      <td className="py-1.5 px-3 tabular-nums">{row.row}</td>
                      <td className="py-1.5 px-3 tabular-nums">{row.alert_id || "—"}</td>
                      <td className="py-1.5 px-3">{row.fraud_label || "—"}</td>
                      <td className="py-1.5 px-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${ROW_STATUS[row.status].className}`}
                        >
                          {ROW_STATUS[row.status].label}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-text-secondary">{row.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  ) : null;

  return { input, trigger, templateButton, panel };
}
