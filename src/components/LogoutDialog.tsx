import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/lib/api/auth.functions";
import { listAnalystQueue, releaseAlert } from "@/lib/api/operations.functions";

// Confirms "Cerrar sesión". A fraud analyst holding an alert is offered to
// hand it back to the queue first - otherwise it stays reserved for them
// until the 30 min reservation expires and nobody else can take it.
export function LogoutDialog({
  open,
  onOpenChange,
  user,
  onLogout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser | null | undefined;
  onLogout: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAnalyst = user?.role === "fraud_analyst";
  const queueQuery = useQuery({
    queryKey: ["analystQueue"],
    queryFn: listAnalystQueue,
    enabled: open && isAnalyst,
  });
  const heldAlert = (queueQuery.data ?? []).find(
    (alert) => alert.reservation?.status === "ACTIVE" && alert.reservation.holder === user?.id,
  );

  async function run(release: boolean) {
    setPending(true);
    setError(null);
    try {
      if (release && heldAlert) await releaseAlert({ data: { alertId: heldAlert.alert_id } });
    } catch {
      setPending(false);
      setError("No se pudo liberar la alerta. Puedes reintentar o salir sin liberarla.");
      return;
    }
    await onLogout();
    setPending(false);
    onOpenChange(false);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setError(null);
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cerrar sesión</AlertDialogTitle>
          <AlertDialogDescription>
            Tu sesión se cerrará en este navegador y el token dejará de ser válido. Los borradores
            sin guardar (configuración, entrenamiento de modelos, nueva prueba) se descartan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isAnalyst && queueQuery.isLoading && (
          <p className="text-[12px] text-text-secondary">Revisando si tienes una alerta tomada…</p>
        )}
        {heldAlert && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-text-primary">
            Tienes tomada la alerta <span className="font-mono">{heldAlert.event_id}</span>. Si no
            la liberas, nadie más podrá atenderla hasta que venza la reserva (
            {new Date(heldAlert.reservation!.expires_at).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            ).
          </p>
        )}
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          {heldAlert ? (
            <>
              <Button variant="outline" disabled={pending} onClick={() => run(false)}>
                Salir sin liberar
              </Button>
              <Button disabled={pending} onClick={() => run(true)}>
                {pending ? "Cerrando…" : "Liberar y cerrar sesión"}
              </Button>
            </>
          ) : (
            <Button
              disabled={pending || (isAnalyst && queueQuery.isLoading)}
              onClick={() => run(false)}
            >
              {pending ? "Cerrando…" : "Cerrar sesión"}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
