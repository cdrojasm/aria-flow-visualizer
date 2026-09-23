import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RelatedDocument = {
  label: string;
  type: string;
  origin: string;
};

interface ConfirmVectorStoreDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: RelatedDocument[];
  onConfirm: () => void;
  pending?: boolean;
  error?: string;
}

const ORIGIN_LABELS: Record<string, string> = {
  selected: "Seleccionado",
  taxonomy: "Relacionado con la taxonomía",
  modus_operandi: "Relacionado con el modus operandi",
  similar_case: "Relacionado con el caso similar",
};

export function ConfirmVectorStoreDocumentsDialog({
  open,
  onOpenChange,
  documents,
  onConfirm,
  pending,
  error,
}: ConfirmVectorStoreDocumentsDialogProps) {
  const documentWord = documents.length === 1 ? "documento relacionado" : "documentos relacionados";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Agregar documentos a la instancia</AlertDialogTitle>
          <AlertDialogDescription>
            Se agregarán {documents.length} {documentWord}. Esta acción sólo crea relaciones con esta
            instancia; no genera embeddings ni modifica los documentos originales.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-52 space-y-2 overflow-y-auto rounded-md border border-border bg-surface p-3" aria-label="Documentos que se agregarán">
          {documents.map((document) => (
            <li key={`${document.type}:${document.label}`} className="flex flex-col gap-0.5 text-[12px]">
              <span className="font-medium text-text-primary">{document.label}</span>
              <span className="text-text-secondary">{document.type} · {ORIGIN_LABELS[document.origin] ?? "Relacionado"}</span>
            </li>
          ))}
        </ul>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            disabled={pending}
          >
            {pending ? "Agregando…" : "Agregar documentos"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
