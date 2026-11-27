import { describe, expect, it } from "vitest";
import type { AlertSchemaField, AlertSchemaVersion } from "@/lib/api/alertSchema.functions";
import type { Recipe } from "@/lib/api/feature-recipes.functions";
import {
  leakTitle,
  assessTarget,
  buildTrainingContract,
  draftSchemaVersion,
  findSchemaField,
  leakBlocker,
  suggestedTargets,
} from "@/components/modelos/wizard/trainingContract";

const field = (over: Partial<AlertSchemaField>): AlertSchemaField => ({
  id: over.field ?? "f",
  data_source: "aric",
  field: "f",
  field_name: "f",
  field_ds_loc: "",
  type: "string",
  is_alert: true,
  is_mandatory: false,
  is_history: false,
  is_core: false,
  is_label: false,
  is_sensible: false,
  sensitivity_strategy: null,
  group: "",
  description: "",
  use_locale: false,
  locale_type: null,
  ...over,
});
const schema: AlertSchemaVersion = {
  version: 4,
  status: "active",
  field_roles: {},
  proposed_by: null,
  proposed_at: null,
  approved_by: null,
  approved_at: null,
  impact_acknowledged: false,
  based_on_version: null,
  comparison: {},
  impact: [],
  fields: [
    field({ field: "marcacion_final", field_name: "marcacion_final", is_label: true }),
    field({ field: "amount_value", field_name: "amount_value", type: "number" }),
    field({ field: "score_aria", field_name: "score_aria", data_source: "aria" }),
    field({ field: "documento", field_name: "documento", is_sensible: true }),
  ],
};
const recipe = (id: string, path: string, over: Partial<Recipe> = {}): Recipe => ({
  id,
  name: id,
  description: "",
  enabled: true,
  source: "current",
  missing: { policy: "missing" },
  steps: [
    { id: "s1", operation: "select", path },
    { id: "s2", operation: "categorize" },
  ],
  ...over,
});

describe("objetivo sugerido por el esquema", () => {
  it("sugiere primero las columnas con rol etiqueta, también por alias", () => {
    expect(suggestedTargets(["channel", "marcacion_final", "amount_value"], schema)).toEqual([
      "marcacion_final",
    ]);
    expect(suggestedTargets(["etiqueta_ds"], schema, { etiqueta_ds: ["marcacion_final"] })).toEqual(
      ["etiqueta_ds"],
    );
  });
  it("avisa cuando el objetivo no es etiqueta y no avisa sin esquema", () => {
    expect(assessTarget("channel", schema)).toBe("not_label");
    expect(assessTarget("marcacion_final", schema)).toBe("label");
    expect(assessTarget("channel", null)).toBe("unknown");
    expect(assessTarget("", schema)).toBe("unknown");
  });
});

describe("contrato de entrada del entrenamiento", () => {
  it("resume variables activas, pasos y versión del esquema", () => {
    const c = buildTrainingContract(
      [recipe("a", "amount_value"), recipe("b", "amount_value", { enabled: false })],
      schema,
    );
    expect(c.schemaVersion).toBe(4);
    expect(c.activeCount).toBe(1);
    expect(c.variables[0].steps).toEqual(["select", "categorize"]);
    expect(c.leaks).toEqual([]);
  });
  it("detecta fuga por etiqueta o resultado de ARIA y bloquea con mensaje", () => {
    const c = buildTrainingContract(
      [recipe("fuga1", "$.marcacion_final"), recipe("fuga2", "score_aria")],
      schema,
    );
    expect(c.leaks.map((l) => l.field)).toEqual(["marcacion_final", "score_aria"]);
    expect(leakBlocker(c.leaks[0])).toContain("Fuga de datos");
  });
  it("ignora recetas desactivadas y recetas de historial; marca sensibles", () => {
    const c = buildTrainingContract(
      [
        recipe("off", "marcacion_final", { enabled: false }),
        recipe("hist", "marcacion_final", { source: "history" }),
        recipe("sens", "documento"),
      ],
      schema,
    );
    expect(c.leaks).toEqual([]);
    expect(c.sensitive.map((s) => s.field)).toEqual(["documento"]);
  });
  it("resuelve alias de columnas del dataset", () => {
    expect(findSchemaField("col_ds", schema.fields, { col_ds: ["score_aria"] })?.field).toBe(
      "score_aria",
    );
  });
});

describe("borrador", () => {
  it("un borrador antiguo sin versión de esquema es compatible", () => {
    expect(draftSchemaVersion({ version: 1 })).toBeNull();
    expect(draftSchemaVersion({ version: 1, schemaVersion: 3 })).toBe(3);
    expect(draftSchemaVersion({ schemaVersion: "3" })).toBeNull();
  });
});

describe("variables sospechosas y reglas del esquema", () => {
  const withFlags = (extra: AlertSchemaField[]): AlertSchemaVersion => ({
    ...schema,
    fields: [...schema.fields, ...extra],
  });
  it("separa sospechosas (por nombre) de las exclusiones duras", () => {
    const c = buildTrainingContract(
      [
        recipe("ev", "eventid"),
        recipe("rev", "reviewstatus_first"),
        recipe("fuga", "marcacion_final"),
        recipe("monto", "amount_value"),
      ],
      schema,
    );
    expect(c.suspects.map((s) => [s.variable, s.kind])).toEqual([
      ["ev", "identifier"],
      ["rev", "post_decision"],
    ]);
    expect(c.leaks.map((l) => l.variable)).toEqual(["fuga"]);
  });
  it("sin esquema aplica la heurística por nombre", () => {
    const c = buildTrainingContract(
      [recipe("ev", "session_sessionId"), recipe("a", "amount")],
      null,
    );
    expect(c.suspects.map((s) => s.field)).toEqual(["session_sessionId"]);
    expect(c.leaks).toEqual([]);
  });
  it("identificador o posterior a la decisión marcados en el esquema bloquean con su motivo", () => {
    const c = buildTrainingContract(
      [recipe("a", "llave"), recipe("b", "cierre")],
      withFlags([
        field({ field: "llave", field_name: "llave", is_identifier: true }),
        field({ field: "cierre", field_name: "cierre", available_at_decision: false }),
      ]),
    );
    expect(c.suspects).toEqual([]);
    expect(c.leaks.map((l) => l.kind)).toEqual(["identifier", "post_decision"]);
    expect(leakBlocker(c.leaks[0])).toContain("Identificador:");
    expect(leakBlocker(c.leaks[1])).toContain("Dato posterior a la decisión:");
    expect(leakTitle({ kind: "label" })).toBe("Fuga de datos");
  });
});
