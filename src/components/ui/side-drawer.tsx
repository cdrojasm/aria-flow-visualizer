import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bot, X } from "lucide-react";
import { useState, type ReactNode } from "react";

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
import { cn } from "@/lib/utils";

/* ─── Single right-hand overlay drawer for every create/edit form ────────
   Same chrome as the ARIA assistant panel (fixed, right edge, close button)
   so "Nueva prueba", Biblioteca editors and "Nuevo modelo" all look and
   behave alike. Radix Dialog supplies Esc, click-outside and the focus trap;
   `dirty` adds the unsaved-changes prompt. `proposedByAria` is the hook for
   agent-prefilled drafts (PENDIENTES_MVC #18). Nested confirm dialogs keep
   working: they portal after the drawer at the same z-index. */

const SIZE_CLASS = {
  md: "max-w-[460px]",
  lg: "max-w-[640px]",
  xl: "max-w-[860px]",
  full: "max-w-[1152px]",
} as const;

export function SideDrawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  size = "md",
  dirty = false,
  proposedByAria = false,
  bare = false,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: keyof typeof SIZE_CLASS;
  /** Ask for confirmation before closing while there are unsaved changes. */
  dirty?: boolean;
  /** Mark the form as pre-filled by the ARIA agent for the user to review. */
  proposedByAria?: boolean;
  /** Children own their padding, scrolling and footer (multi-step wizards). */
  bare?: boolean;
  className?: string;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const requestClose = (next: boolean) => {
    if (next) {
      onOpenChange(true);
    } else if (dirty) {
      setConfirmDiscard(true);
    } else {
      onOpenChange(false);
    }
  };

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={requestClose}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            data-testid="side-drawer"
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-background shadow-2xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
              SIZE_CLASS[size],
              className,
            )}
          >
            <header className="flex items-start justify-between gap-3 border-b border-border bg-card px-4 py-3">
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-sm font-semibold text-text-primary">
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="mt-0.5 text-[12px] text-text-secondary">
                    {description}
                  </DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">
                    {typeof title === "string" ? title : "Formulario"}
                  </DialogPrimitive.Description>
                )}
                {proposedByAria && (
                  <span
                    data-testid="side-drawer-aria-proposal"
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                  >
                    <Bot className="h-3 w-3" /> Propuesto por ARIA: revísalo antes de guardar
                  </span>
                )}
              </div>
              <DialogPrimitive.Close
                aria-label="Cerrar panel"
                className="shrink-0 rounded p-1 text-text-secondary hover:bg-surface"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </header>
            {bare ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4">
                {children}
              </div>
            )}
            {footer && (
              <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-3">
                {footer}
              </footer>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Hay cambios sin guardar en este panel. Si lo cierras se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
