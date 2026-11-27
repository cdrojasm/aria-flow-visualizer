import { Check, Pencil, Save, Send, X } from "lucide-react";

export type PrimaryAction = "edit" | "save" | "propose" | "approve" | null;

const PRIMARY_LABELS: Record<Exclude<PrimaryAction, null>, string> = {
  edit: "Editar borrador",
  save: "Guardar borrador",
  propose: "Proponer",
  approve: "Aprobar propuesta",
};

type Tone = "ok" | "warn" | "bad" | "neutral";
const TONES: Record<Tone, string> = {
  ok: "border-success/40 bg-success/10 text-success",
  warn: "border-warning/40 bg-warning/10 text-warning",
  bad: "border-danger/40 bg-danger/10 text-danger",
  neutral: "border-border bg-surface text-text-secondary",
};

function Chip({
  tone,
  testId,
  children,
}: {
  tone: Tone;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function SchemaStatusBand({
  activeVersion,
  viewedText,
  requiredCovered,
  requiredTotal,
  optionalCovered,
  optionalTotal,
  toReview,
  sensitiveWithoutStrategy,
  primary,
  primaryDisabled,
  primaryHint,
  pending,
  onPrimary,
  canReject,
  onReject,
  canDiscard,
  onDiscard,
  loading = false,
}: {
  /** While the active schema loads, show a neutral placeholder instead of false alarms. */
  loading?: boolean;
  activeVersion: number | null;
  /** E.g. "Borrador con 3 cambios"; null when viewing the active version. */
  viewedText: string | null;
  requiredCovered: number;
  requiredTotal: number;
  optionalCovered: number;
  optionalTotal: number;
  toReview: number;
  sensitiveWithoutStrategy: number;
  primary: PrimaryAction;
  primaryDisabled: boolean;
  primaryHint: string | null;
  pending: boolean;
  onPrimary: () => void;
  canReject: boolean;
  onReject: () => void;
  canDiscard: boolean;
  onDiscard: () => void;
}) {
  const essentialsOk = requiredCovered >= requiredTotal;
  if (loading)
    return (
      <div
        data-testid="schema-status-band"
        aria-busy="true"
        className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
      >
        <div data-testid="schema-status-summary" className="flex items-center gap-2">
          <Chip tone="neutral" testId="schema-chip-loading">
            Cargando esquema…
          </Chip>
        </div>
      </div>
    );
  const Icon =
    primary === "edit" ? Pencil : primary === "save" ? Save : primary === "propose" ? Send : Check;
  return (
    <div
      data-testid="schema-status-band"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
    >
      <div data-testid="schema-status-summary" className="flex flex-wrap items-center gap-2">
        <Chip tone={activeVersion ? "ok" : "neutral"} testId="schema-chip-version">
          {activeVersion ? `Activa v${activeVersion}` : "Sin versión activa"}
        </Chip>{" "}
        {viewedText && (
          <Chip tone="warn" testId="schema-chip-viewed">
            {viewedText}
          </Chip>
        )}{" "}
        <Chip tone={essentialsOk ? "ok" : "bad"} testId="schema-chip-essentials">
          {`Esenciales: ${requiredCovered}/${requiredTotal} obligatorios${essentialsOk ? " ✓" : ""}`}
        </Chip>{" "}
        {optionalTotal > 0 && (
          <Chip tone="neutral" testId="schema-chip-optional">
            {`Opcionales: ${optionalCovered}/${optionalTotal}`}
          </Chip>
        )}{" "}
        <Chip tone="neutral" testId="schema-chip-review">
          {`Por revisar: ${toReview}`}
        </Chip>{" "}
        <Chip tone={sensitiveWithoutStrategy > 0 ? "bad" : "ok"} testId="schema-chip-sensitive">
          {`Sensibles sin estrategia: ${sensitiveWithoutStrategy}`}
        </Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {primaryHint && <span className="text-[11px] text-warning">{primaryHint}</span>}
        {canDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-md border border-border px-3 py-1.5 text-xs"
          >
            Descartar borrador
          </button>
        )}
        {canReject && (
          <button
            type="button"
            disabled={pending}
            onClick={onReject}
            className="inline-flex items-center gap-1 rounded-md border border-danger/50 px-3 py-1.5 text-xs text-danger disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" /> Rechazar
          </button>
        )}
        {primary && (
          <button
            type="button"
            data-testid="schema-primary-action"
            aria-label={PRIMARY_LABELS[primary]}
            disabled={primaryDisabled || pending}
            onClick={onPrimary}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            <Icon className="h-3.5 w-3.5" /> {PRIMARY_LABELS[primary]}
          </button>
        )}
      </div>
    </div>
  );
}
