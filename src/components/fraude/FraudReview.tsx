import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listFraudLabelReviews,
  reviewFraudLabel,
  type ApiAlertHistoryItem,
  type ApiFraudLabel,
  type ApiFraudReviewResponse,
} from "@/lib/api/alerts.functions";
import { MARK_LABELS } from "@/lib/fraudLabels";

/* Fraud-team review of an alert's real outcome (fraud_label), per
   decision D2: one alert at a time from the UI (bulk CSV lives in
   hooks/useFraudReviewImport.tsx). Every review is audited (append-only);
   a review with the same value is a confirmation. */

const NOTE_MAX = 2000;

export function FraudReviewDialog({
  item,
  onClose,
  onReviewed,
}: {
  item: ApiAlertHistoryItem | null;
  onClose: () => void;
  onReviewed: (alertId: string, result: ApiFraudReviewResponse) => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState<ApiFraudLabel | null>(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    setLabel(null);
    setNote("");
    setConfirming(false);
  }, [item?.alert_id]);

  const mutation = useMutation({
    mutationFn: (vars: { alertId: string; fraudLabel: ApiFraudLabel; note: string }) =>
      reviewFraudLabel({ data: vars }),
    onSuccess: (result, vars) => {
      onReviewed(vars.alertId, result);
      void queryClient.invalidateQueries({ queryKey: ["fraudLabelReviews", vars.alertId] });
      void queryClient.invalidateQueries({ queryKey: ["metrics"] });
      onClose();
    },
  });

  if (!item) return null;
  const isConfirmation = label !== null && label === item.fraud_label;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revisar fraude</DialogTitle>
          <DialogDescription>
            Alerta {item.event_id} · marca:{" "}
            <span className="font-medium">{MARK_LABELS[item.mark]}</span> · resultado actual:{" "}
            <span className="font-medium">{MARK_LABELS[item.fraud_label]}</span>
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">
                Resultado real
              </p>
              <div className="inline-flex rounded-md border border-border p-0.5 bg-background">
                {(["fraud", "no_fraud"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={label === value}
                    onClick={() => setLabel(value)}
                    className={`h-8 px-3 rounded text-[13px] font-medium transition-colors ${
                      label === value
                        ? value === "fraud"
                          ? "bg-danger text-white"
                          : "bg-success text-white"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {MARK_LABELS[value]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label
                htmlFor="fraud-review-note"
                className="text-[11px] uppercase tracking-wider text-text-secondary"
              >
                Nota <span className="normal-case tracking-normal">(qué ocurrió y por qué)</span>
              </label>
              <textarea
                id="fraud-review-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={4}
                placeholder="Describe qué ocurrió y en qué te basas para confirmar o corregir el resultado…"
                className="mt-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="mt-1 text-right text-[11px] text-text-secondary tabular-nums">
                {note.length} / {NOTE_MAX}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-[13px] text-text-primary space-y-1">
            {isConfirmation ? (
              <p>
                Vas a <span className="font-semibold">confirmar</span> el resultado{" "}
                <span className="font-semibold">{MARK_LABELS[label!]}</span>. Queda registrado en la
                auditoría y la alerta cuenta como revisada.
              </p>
            ) : (
              <p>
                Vas a cambiar el resultado de{" "}
                <span className="font-semibold">{MARK_LABELS[item.fraud_label]}</span> a{" "}
                <span className="font-semibold">{MARK_LABELS[label!]}</span>. Los indicadores de
                falsos positivos y fraude no detectado se recalculan con este valor.
              </p>
            )}
            {note.trim() && <p className="text-text-secondary">Nota: {note.trim()}</p>}
          </div>
        )}

        {mutation.isError && (
          <p className="text-[12px] text-danger">
            No se pudo guardar la revisión: {String(mutation.error)}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={confirming ? () => setConfirming(false) : onClose}
            className="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-text-primary hover:bg-surface"
          >
            {confirming ? "Volver" : "Cancelar"}
          </button>
          {!confirming ? (
            <button
              type="button"
              disabled={label === null}
              onClick={() => setConfirming(true)}
              className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({ alertId: item.alert_id, fraudLabel: label!, note: note.trim() })
              }
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-60 hover:opacity-90"
            >
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isConfirmation ? "Confirmar resultado" : "Confirmar cambio"}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FraudReviewTrailDialog({
  item,
  onClose,
}: {
  item: ApiAlertHistoryItem | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["fraudLabelReviews", item?.alert_id],
    queryFn: () => listFraudLabelReviews({ data: { alertId: item!.alert_id } }),
    enabled: Boolean(item),
  });
  if (!item) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Auditoría de revisiones</DialogTitle>
          <DialogDescription>
            Alerta {item.event_id} · {item.fraud_review_count} revisión
            {item.fraud_review_count === 1 ? "" : "es"} · de la más antigua a la más reciente
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : query.isError ? (
          <p className="text-[12px] text-danger">
            No se pudo cargar la auditoría: {String(query.error)}
          </p>
        ) : (query.data ?? []).length === 0 ? (
          <p className="text-[12px] text-text-secondary">Esta alerta aún no tiene revisiones.</p>
        ) : (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-text-secondary text-left">
                  <th className="font-normal py-2 pr-3">Fecha</th>
                  <th className="font-normal py-2 pr-3">Cambio</th>
                  <th className="font-normal py-2 pr-3">Revisó</th>
                  <th className="font-normal py-2 pr-3">Origen</th>
                  <th className="font-normal py-2">Nota</th>
                </tr>
              </thead>
              <tbody>
                {(query.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {new Date(r.reviewed_at).toLocaleString("es-CO")}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {MARK_LABELS[r.from_label]} →{" "}
                      <span className="font-medium">{MARK_LABELS[r.to_label]}</span>
                      {r.from_label === r.to_label && (
                        <span className="text-text-secondary"> (confirmación)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{r.reviewed_by}</td>
                    <td className="py-2 pr-3">{r.channel === "csv" ? "Carga CSV" : "UI"}</td>
                    <td className="py-2 text-text-secondary whitespace-pre-wrap">
                      {r.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
