import type { WorkflowStepResponse } from "@/lib/api/testing.functions";

import { asObject, latestOutput } from "./caseExecutions";
import { CopyButton } from "./CopyButton";
import { Hint, InfoHint } from "./Hint";

type Fields = Record<string, unknown>;

// Nombres de max_amount_* en _OPTIONAL_FIELD_PATHS de pre_process_alert.py.
const MAX_AMOUNT_LABELS: Record<string, string> = {
  max_amount_breb: "BreB",
  max_amount_pse: "PSE",
  max_amount_glomo: "Glomo",
  max_amount_net: "Net",
  max_amount_bills: "Facturas",
  max_amount_card_withdrawals: "Retiros tarjeta",
  max_amount_payment_gateway: "Pasarela de pago",
  max_amount_loan: "Préstamo",
};

const DETAIL_FIELDS: [string, string, boolean, string?][] = [
  [
    "event_type",
    "Tipo de evento",
    false,
    "Tipo de transacción que generó la alerta, según el dataset.",
  ],
  ["channel", "Canal", false, "Canal por el que se hizo la operación, según el dataset."],
  ["customer_id", "Cliente", false],
  ["client_code", "Documento", false],
  ["event_time", "Fecha del evento", false],
];

const BIOCATCH_SCALE = 1000;

function hasValue(value: unknown): boolean {
  return value != null && value !== "";
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$ ${amount.toLocaleString()}` : String(value);
}

function formatEventTime(value: unknown): string {
  const [date, time = ""] = String(value).split(" ");
  return time ? `${date} · ${time.slice(0, 5)}` : date;
}

function highestMaxAmount(fields: Fields): [string, number] | null {
  const amounts = Object.entries(MAX_AMOUNT_LABELS)
    .filter(([key]) => hasValue(fields[key]) && Number.isFinite(Number(fields[key])))
    .map(([key, label]) => [label, Number(fields[key])] as [string, number]);
  return amounts.sort((a, b) => b[1] - a[1])[0] ?? null;
}

function parseRules(rules: unknown): string[] {
  return String(rules ?? "")
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((rule) => rule.trim())
    .filter(Boolean);
}

export function CaseAlertData({
  steps,
  alertId,
}: {
  steps: WorkflowStepResponse[];
  alertId: string;
}) {
  const preProcess = latestOutput(steps, "pre_process");
  const fields: Fields | null = preProcess
    ? { ...asObject(preProcess.mandatory_fields), ...asObject(preProcess.optional_fields) }
    : null;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2.5">
        <h4 className="text-[13px] font-semibold text-text-primary">Datos de la alerta</h4>
      </div>
      {fields ? (
        <AlertFields fields={fields} alertId={alertId} />
      ) : (
        <p className="text-[12px] text-text-secondary">
          No se pudieron leer: el pre-proceso falló antes de extraer los campos.
        </p>
      )}
    </div>
  );
}

function AlertFields({ fields, alertId }: { fields: Fields; alertId: string }) {
  const topMax = highestMaxAmount(fields);
  const rules = parseRules(fields.rules);

  return (
    <div className="space-y-3">
      {hasValue(fields.amount) && (
        <div className="border-l-[3px] border-l-primary pl-3 py-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            Monto
          </p>
          <p className="text-[22px] font-bold text-primary tabular-nums leading-tight my-0.5">
            {formatMoney(fields.amount)}
          </p>
          {topMax && (
            <p className="text-[11px] text-text-secondary">
              <InfoHint content="Monto más alto que el cliente ha movido en ese canal, según el dataset." />{" "}
              Máximo histórico {topMax[0]}:{" "}
              <span className="whitespace-nowrap">{formatMoney(topMax[1])}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="min-w-0 col-span-2">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            ID de la alerta
            <InfoHint content="Identificador que ARIA asignó a la alerta creada a partir de esta fila del dataset." />
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <Hint content={alertId}>
              <p className="text-[12.5px] font-medium text-text-primary font-mono truncate">
                {alertId}
              </p>
            </Hint>
            <CopyButton text={alertId} label="Copiar ID de la alerta" />
          </div>
        </div>
        {DETAIL_FIELDS.filter(([key]) => hasValue(fields[key])).map(([key, label, mono, hint]) => (
          <div key={key} className={`min-w-0 ${mono ? "col-span-2" : ""}`}>
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
              {label}
              {hint && <InfoHint content={hint} />}
            </p>
            {mono ? (
              <Hint content={String(fields[key])}>
                <p className="text-[12.5px] font-medium text-text-primary font-mono truncate">
                  {String(fields[key])}
                </p>
              </Hint>
            ) : (
              <p className="text-[12.5px] font-medium text-text-primary tabular-nums break-words">
                {key === "event_time" ? formatEventTime(fields[key]) : String(fields[key])}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-x-4 gap-y-2 pt-2.5 border-t border-dashed border-border">
        <ScoreBar
          label="BioCatch"
          hint="Score de riesgo por comportamiento del usuario (BioCatch). La barra supone una escala de 0 a 1.000."
          value={fields.biocatch_score}
          scale={BIOCATCH_SCALE}
        />
        <ScoreBar
          label="Score modelo"
          hint="Score del modelo de riesgo previo a ARIA. La barra supone una escala de 0 a 1."
          value={fields.model_score}
          scale={1}
          decimals={2}
        />
      </div>

      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1">
          Reglas disparadas
          <InfoHint content="Reglas del motor de fraude (ARIC) que generaron la alerta." />
        </p>
        <div className="flex flex-wrap gap-1.5">
          {rules.length === 0 && <span className="text-[12px] text-text-secondary">Ninguna</span>}
          {rules.map((rule) => (
            <span
              key={rule}
              className="text-[11px] bg-surface border border-border rounded px-1.5 py-0.5"
            >
              {rule}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Escala supuesta por los valores observados; el backend no documenta el rango.
function ScoreBar({
  label,
  hint,
  value,
  scale,
  decimals = 0,
}: {
  label: string;
  hint: string;
  value: unknown;
  scale: number;
  decimals?: number;
}) {
  const score = Number(value);
  if (!hasValue(value) || !Number.isFinite(score)) return null;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-text-secondary truncate">
          {label}
          <InfoHint content={hint} />
        </span>
        <span className="text-[12.5px] font-bold tabular-nums text-text-primary">
          {score.toFixed(decimals)}
        </span>
      </div>
      <div className="h-1 mt-1 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, (score / scale) * 100)}%` }}
        />
      </div>
    </div>
  );
}
