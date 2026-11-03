/* An administrable manifest has immutable searchable generations. Building
   does not publish: production searches what its approved configuration pins. */

export type VectorStoreVersion = {
  id: string;
  /** Human-readable name; `id` is the immutable internal identifier. */
  name: string;
  description: string;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string | null;
  updatedBy: string | null;
  latestGeneration: number | null;
  productionGenerations: number[];
  /** Only relations live here. The source document is never copied/deleted. */
  documentKeys: string[];
  /** Compatibility data for agent configuration prompts; relationships remain
   * the source of truth for the vector-store document index. */
  taxonomies?: TaxonomyLibraryEntry[];
};

const SEED_TIMESTAMP = "2026-01-01T00:00:00.000Z";

export const INITIAL_VECTOR_STORE_VERSIONS: VectorStoreVersion[] = [
  {
    id: "vsv-1",
    name: "Versión inicial",
    description: "Instancia inicial de la base de conocimiento.",
    version: 1,
    createdAt: SEED_TIMESTAMP,
    createdBy: "Sistema",
    updatedAt: null,
    updatedBy: null,
    latestGeneration: null,
    productionGenerations: [],
    documentKeys: [],
    taxonomies: initialTaxonomies.map((taxonomy) => ({
      ...taxonomy,
      created_at: SEED_TIMESTAMP,
      updated_at: SEED_TIMESTAMP,
    })),
  },
];
import type { TaxonomyLibraryEntry } from "@/lib/api/knowledgeLibrary.functions";
import { initialTaxonomies } from "./configs";
