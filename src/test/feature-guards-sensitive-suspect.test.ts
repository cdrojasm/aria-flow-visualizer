import { describe, expect, it } from "vitest";
import { buildSchemaIndex, recipeGuards } from "@/components/modelos/feature/schemaFields";
import type { AlertSchemaField, AlertSchemaVersion } from "@/lib/api/alertSchema.functions";
import type { Recipe } from "@/lib/api/feature-recipes.functions";

const customer = {
  id: "c", data_source: "aric", field: "customer_id", field_name: "customer_id",
  field_ds_loc: "customerid", type: "string", is_alert: true, is_mandatory: true,
  is_history: false, is_core: false, is_label: false, is_sensible: true,
  sensitivity_strategy: "obfuscate", group: "", description: "", use_locale: false, locale_type: null,
} as AlertSchemaField;
const schema = { version: 78, status: "active", fields: [customer], field_roles: {} } as unknown as AlertSchemaVersion;

describe("recipeGuards", () => {
  it("a sensitive identifier shows BOTH the suspect and the privacy notice", () => {
    const recipe = { source: "current", path: "customerid", steps: [] } as unknown as Recipe;
    const g = recipeGuards(recipe, buildSchemaIndex(schema));
    expect(g.suspect).toHaveLength(1);
    expect(g.sensitive).toHaveLength(1);
    expect(g.sensitive[0].reason).toMatch(/sensible/i);
    expect(g.excluded).toHaveLength(0);
  });
});
