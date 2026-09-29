import type { Json } from "@/lib/api/testing.functions";

import { asObject } from "./caseExecutions";

type Row = [string, string];

// Etiquetas de los campos que devuelve pre_process_alert.py; los desconocidos se muestran con su nombre técnico.
const FIELD_LABELS: Record<string, string> = {
  event_type: "Tipo de evento",
  channel: "Canal",
  amount: "Monto",
  event_time: "Fecha del evento",
  integration_point: "Punto de integración",
  transaction_id: "ID de transacción",
  event_id: "ID de evento",
  ip_channel: "IP del canal (cifrada)",
  device_id: "Dispositivo",
  counterparty: "Contraparte (cifrada)",
  customer_id: "Cliente",
  client_code: "Documento",
  customer_name: "Nombre",
  document_number: "Documento (perfil)",
  date_of_birth: "Fecha de nacimiento",
  mobile_number: "Celular",
  address: "Dirección",
  account_balance: "Saldo de la cuenta",
  available_balance: "Saldo disponible",
  biocatch_score: "BioCatch score",
  model_score: "Score del modelo",
  rules: "Reglas disparadas",
  is_rat: "Acceso remoto (RAT)",
  is_mobile_rat: "RAT móvil",
  is_emulator_rat: "Emulador",
  is_bot: "Bot",
  is_on_call_active: "Llamada activa",
  is_voip_on_call: "Llamada VoIP activa",
  screen_broadcast: "Transmisión de pantalla",
  ind_robo1: "Indicador de robo",
  max_amount_breb: "BreB",
  max_amount_pse: "PSE",
  max_amount_glomo: "GloMo",
  max_amount_net: "Net",
  max_amount_bills: "Facturas",
  max_amount_card_withdrawals: "Retiros tarjeta",
  max_amount_payment_gateway: "Pasarela de pago",
  max_amount_loan: "Préstamo",
};

const TRANSACTION_KEYS = [
  "event_type",
  "channel",
  "amount",
  "event_time",
  "integration_point",
  "transaction_id",
  "event_id",
  "ip_channel",
  "device_id",
  "counterparty",
];
const CUSTOMER_KEYS = ["customer_id", "client_code"];
const RISK_KEYS = ["biocatch_score", "model_score", "rules"];
const MONEY_KEYS = new Set(["amount", "account_balance", "available_balance"]);

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "" || value === "None") return "—";
  if (value === true || value === "True") return "Sí";
  if (value === false || value === "False") return "No";
  const amount = Number(value);
  if ((MONEY_KEYS.has(key) || key.startsWith("max_amount_")) && Number.isFinite(amount)) {
    return `$ ${amount.toLocaleString()}`;
  }
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function rowsFor(source: Record<string, unknown>, keys: string[]): Row[] {
  return keys
    .filter((key) => key in source)
    .map((key) => [FIELD_LABELS[key] ?? key, formatValue(key, source[key])]);
}

function remainingRows(source: Record<string, unknown>, used: Set<string>): Row[] {
  return Object.keys(source)
    .filter((key) => !used.has(key))
    .map((key) => [FIELD_LABELS[key] ?? key, formatValue(key, source[key])]);
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h5 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">{title}</h5>
      <dl className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] text-[12px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="py-1 pr-3 text-text-secondary border-t border-border">{label}</dt>
            <dd className="py-1 font-medium text-text-primary break-all border-t border-border">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function HistoryTable({ history }: { history: Record<string, unknown>[] }) {
  return (
    <section>
      <h5 className="text-[11px] font-bold uppercase tracking-wider text-primary mb-1">
        Historial de transacciones ({history.length})
      </h5>
      {history.length === 0 ? (
        <p className="text-[12px] text-text-secondary">Sin transacciones.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabular-nums">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-secondary">
                {["Fecha", "Tipo", "Canal", "Monto", "Estado", "Punto de integración"].map((h) => (
                  <th key={h} className="font-semibold py-1 pr-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((item, index) => (
                <tr key={index} className="border-t border-border whitespace-nowrap">
                  <td className="py-1 pr-3">{formatValue("event_time", item.event_time)}</td>
                  <td className="py-1 pr-3">{formatValue("event_type", item.event_type)}</td>
                  <td className="py-1 pr-3">{formatValue("channel", item.channel)}</td>
                  <td className="py-1 pr-3">{formatValue("amount", item.amount)}</td>
                  <td className="py-1 pr-3">{formatValue("status", item.status)}</td>
                  <td className="py-1 pr-3">
                    {formatValue("integration_point", item.integration_point)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AlertFullData({ preProcess }: { preProcess: Record<string, Json> | null }) {
  if (!preProcess) {
    return (
      <p className="text-[12px] text-text-secondary">
        No hay datos de la alerta: el pre-proceso falló antes de extraer los campos.
      </p>
    );
  }
  const fields: Record<string, unknown> = {
    ...asObject(preProcess.mandatory_fields),
    ...asObject(preProcess.optional_fields),
  };
  const enrichment = asObject(preProcess.enrichment) ?? {};
  const profile = asObject(enrichment.customer_profile) ?? {};
  const signals = asObject(enrichment.aric_signals) ?? {};
  const history = Array.isArray(enrichment.transaction_history)
    ? (enrichment.transaction_history.map((item) => asObject(item) ?? {}) as Record<
        string,
        unknown
      >[])
    : [];
  const changes = Array.isArray(enrichment.personal_data_changes)
    ? enrichment.personal_data_changes
    : [];
  const maxKeys = Object.keys(fields).filter((key) => key.startsWith("max_amount_"));
  const used = new Set([...TRANSACTION_KEYS, ...CUSTOMER_KEYS, ...RISK_KEYS, ...maxKeys]);

  return (
    <div className="space-y-4">
      <Section title="Transacción" rows={rowsFor(fields, TRANSACTION_KEYS)} />
      <Section
        title="Cliente"
        rows={[...rowsFor(fields, CUSTOMER_KEYS), ...remainingRows(profile, new Set())]}
      />
      <Section
        title="Señales de riesgo"
        rows={[...rowsFor(fields, RISK_KEYS), ...remainingRows(signals, new Set())]}
      />
      <Section title="Montos máximos históricos" rows={rowsFor(fields, maxKeys)} />
      <Section title="Otros campos" rows={remainingRows(fields, used)} />
      <HistoryTable history={history} />
      <Section
        title={`Cambios de datos personales (${changes.length})`}
        rows={
          changes.length === 0
            ? [["Cambios", "Sin cambios"]]
            : changes.map((change, index) => [`Cambio ${index + 1}`, JSON.stringify(change)])
        }
      />
    </div>
  );
}
