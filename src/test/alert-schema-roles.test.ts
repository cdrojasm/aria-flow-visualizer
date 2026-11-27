import { describe, expect, it } from "vitest";
import { suspectGuardForName } from "@/lib/alertSchemaRoles";

describe("suspectGuardForName", () => {
  it.each([
    "eventid",
    "customerid",
    "deviceid",
    "transactionid",
    "session_sessionId",
    "account_id",
    "uuid",
  ])("marks %s as identifier", (name) =>
    expect(suspectGuardForName(name)?.kind).toBe("identifier"),
  );
  it.each(["fecha_primer_marcacion_hora", "reviewstatus_first", "marcacion_final", "output_tags"])(
    "marks %s as post-decision",
    (name) => expect(suspectGuardForName(name)?.kind).toBe("post_decision"),
  );
  it.each([
    "amount_value",
    "channel",
    "biocatch_score",
    "isValid",
    "paid",
    "Model_score",
    "event_time",
  ])("leaves %s alone", (name) => expect(suspectGuardForName(name)).toBeNull());
  it("uses the leaf of a dotted path", () => {
    expect(suspectGuardForName("session.sessionId")?.kind).toBe("identifier");
  });
});

import { featureGuard } from "@/lib/alertSchemaRoles";
import type { AlertSchemaField } from "@/lib/api/alertSchema.functions";

const base = {
  id: "x",
  data_source: "aric",
  field: "customer_id",
  field_name: "customer_id",
  field_ds_loc: "customerid",
  type: "string",
  is_alert: true,
  is_mandatory: true,
  is_history: false,
  is_core: false,
  is_label: false,
  is_sensible: true,
  sensitivity_strategy: "obfuscate",
  group: "",
  description: "",
  use_locale: false,
  locale_type: null,
} as AlertSchemaField;

describe("featureGuard ordering", () => {
  it("a sensitive identifier is suspect (not merely a warning)", () => {
    const g = featureGuard(base);
    expect(g?.level).toBe("suspect");
    expect(g?.kind).toBe("identifier");
    expect(g?.reason).toMatch(/sensible/);
  });
  it("a sensitive non-identifier is still a warning", () => {
    expect(featureGuard({ ...base, field: "phone", field_ds_loc: "phone" })?.level).toBe("warn");
  });
  it("a flagged identifier is a hard exclude", () => {
    expect(featureGuard({ ...base, is_identifier: true })?.level).toBe("exclude");
  });
});
