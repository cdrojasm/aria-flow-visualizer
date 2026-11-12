import { apiFetch } from "./client";

// Read-only LLM deployment catalog (backend: GET /api/v0/llm-catalog). The
// catalog comes from the LLM_CATALOG ConfigMap; there is no API to edit it.

export type LlmCatalogEntry = { name: string; deployment: string };
export type LlmElementInfo = {
  element: string;
  group: "workflow" | "support";
  default_deployment: string;
};
export type LlmCatalogResponse = {
  entries: LlmCatalogEntry[];
  elements: LlmElementInfo[];
};

// element -> catalog name; null/absent = the element's default deployment.
export type LlmSelection = Record<string, string | null>;

export function getLlmCatalog(): Promise<LlmCatalogResponse> {
  return apiFetch("/api/v0/llm-catalog");
}
