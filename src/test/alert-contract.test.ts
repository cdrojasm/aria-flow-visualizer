import { describe, expect, it } from "vitest";
import type { AnalystQueueAlert } from "@/lib/api/operations.functions";
import type { AlertSchemaField, AlertSchemaVersion } from "@/lib/api/alertSchema.functions";

type DynamicAlert = Pick<
  AnalystQueueAlert,
  | "alert_id"
  | "event_id"
  | "event_type"
  | "status"
  | "customer_id"
  | "created_at"
  | "schema_version"
  | "input"
  | "labels"
>;
type DynamicSchema = Pick<AlertSchemaVersion, "version" | "status"> & {
  fields: Pick<AlertSchemaField, "id" | "field" | "type" | "is_alert">[];
};

function validateAlertAgainstSchema(alert: DynamicAlert, schema: DynamicSchema) {
  expect(alert.schema_version).toBe(schema.version);
  for (const field of schema.fields.filter((item) => item.is_alert)) {
    expect(
      Object.hasOwn(alert.input, field.field) || Object.hasOwn(alert.labels, field.field),
      `dynamic alert field ${field.field} is absent from input and labels`,
    ).toBe(true);
  }
}

describe("dynamic alert API contract", () => {
  it("keeps the stable alert envelope while accepting schema-defined fields", () => {
    const schema: DynamicSchema = {
      version: 7,
      status: "active",
      fields: [
        { id: "counterparty", field: "counterparty_name", type: "string", is_alert: true },
        { id: "risk", field: "risk_score", type: "number", is_alert: true },
      ],
    };
    const alert: DynamicAlert = {
      alert_id: "alert-1",
      event_id: "event-1",
      event_type: "payment",
      status: "closed",
      customer_id: null,
      created_at: "2026-10-25T12:00:00Z",
      schema_version: 7,
      input: { counterparty_name: "Merchant", risk_score: 0.82, new_field_added_later: true },
      labels: {},
    };

    expect(() => validateAlertAgainstSchema(alert, schema)).not.toThrow();
  });

  it("detects alerts that do not conform to their schema version", () => {
    const schema: DynamicSchema = {
      version: 8,
      status: "historical",
      fields: [{ id: "country", field: "country_code", type: "string", is_alert: true }],
    };
    const alert: DynamicAlert = {
      alert_id: "alert-2",
      event_id: "event-2",
      event_type: "transfer",
      status: "closed",
      customer_id: null,
      created_at: "2026-10-25T12:00:00Z",
      schema_version: 8,
      input: {},
      labels: {},
    };

    expect(() => validateAlertAgainstSchema(alert, schema)).toThrow(/country_code/);
  });
});
