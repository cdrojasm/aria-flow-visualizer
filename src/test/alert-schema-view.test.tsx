import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertSchemaView, formatSchemaValue } from "@/components/alert/AlertSchemaView";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AlertSchemaVersion } from "@/lib/api/alertSchema.functions";

const schema: AlertSchemaVersion = {
  version: 4,
  status: "active",
  field_roles: { amount: "amount" },
  fields: [
    {
      id: "amount",
      field: "amount",
      field_name: "Monto",
      field_ds_loc: "amount",
      type: "number",
      is_alert: true,
      is_mandatory: true,
      is_core: true,
      is_label: false,
      is_history: false,
      is_sensible: false,
      sensitivity_strategy: null,
      group: "Transacción",
      description: "",
      use_locale: true,
      locale_type: "es-CO",
      data_source: "aric",
    },
    {
      id: "event_time",
      field: "event_time",
      field_name: "Fecha",
      field_ds_loc: "event_time",
      type: "datetime",
      is_alert: true,
      is_mandatory: false,
      is_core: false,
      is_label: false,
      is_history: false,
      is_sensible: false,
      sensitivity_strategy: null,
      group: "Transacción",
      description: "",
      use_locale: true,
      locale_type: "es-CO",
      data_source: "aric",
    },
  ],
  proposed_by: null,
  proposed_at: null,
  approved_by: null,
  approved_at: null,
  impact_acknowledged: false,
  based_on_version: null,
  comparison: {},
  impact: [],
};

function renderView(input: Record<string, unknown>) {
  return render(
    <TooltipProvider>
      <QueryClientProvider client={new QueryClient()}>
        <AlertSchemaView schema={schema} data={{ input }} />
      </QueryClientProvider>
    </TooltipProvider>,
  );
}

function renderHistory() {
  const historySchema = {
    ...schema,
    fields: [
      ...schema.fields,
      {
        id: "history-amount",
        field: "amount",
        field_name: "Monto histórico",
        field_ds_loc: "amount",
        type: "number" as const,
        is_alert: false,
        is_mandatory: false,
        is_core: false,
        is_label: false,
        is_history: true,
        is_sensible: false,
        sensitivity_strategy: null,
        group: "",
        description: "",
        use_locale: true,
        locale_type: "es-CO",
        data_source: "host" as const,
      },
      {
        id: "history-date",
        field: "event_time",
        field_name: "Fecha histórica",
        field_ds_loc: "event_time",
        type: "datetime" as const,
        is_alert: false,
        is_mandatory: false,
        is_core: false,
        is_label: false,
        is_history: true,
        is_sensible: false,
        sensitivity_strategy: null,
        group: "",
        description: "",
        use_locale: true,
        locale_type: "es-CO",
        data_source: "host" as const,
      },
    ],
  };
  return render(
    <TooltipProvider>
      <QueryClientProvider client={new QueryClient()}>
        <AlertSchemaView
          schema={historySchema}
          mode="history"
          data={{
            history_prev_alerta: [
              { amount: 63800, event_time: "2026-10-08T14:30:00Z", channel: "APP" },
            ],
          }}
        />
      </QueryClientProvider>
    </TooltipProvider>,
  );
}

describe("AlertSchemaView", () => {
  it("formats localized numeric and datetime values with the field locale", () => {
    expect(formatSchemaValue(5400000, schema.fields[0])).toBe("5.400.000");
    expect(formatSchemaValue("2026-10-09T12:00:00Z", schema.fields[1])).toMatch(/09\/10\/2026/);
  });

  it("shows unknown canonical keys in Otros campos by technical name", () => {
    renderView({ amount: 12, transaction_code: "X-7" });
    expect(screen.getByText("Otros campos")).toBeInTheDocument();
    expect(screen.getByText("transaction_code")).toBeInTheDocument();
  });

  it("shows a missing core field as a tooltip-bearing dash", () => {
    renderView({});
    expect(screen.getAllByTitle("No llegó en esta alerta")[0]).toHaveTextContent("—");
  });

  it("renders transaction history as schema columns with schema formatting", () => {
    renderHistory();
    expect(screen.getByRole("columnheader", { name: "Monto histórico" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Fecha histórica" })).toBeInTheDocument();
    expect(screen.getByText("63.800")).toBeInTheDocument();
    expect(screen.getByText(/08\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByText("channel")).not.toBeInTheDocument();
  });
});
