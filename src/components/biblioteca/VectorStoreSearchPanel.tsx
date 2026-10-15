import { useMutation } from "@tanstack/react-query";
import { Search, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";

import {
  queryVectorStoreInstance,
  type VectorStoreSearchDocumentType,
  type VectorStoreSearchPipeline,
} from "@/lib/api/vectorStoreInstances.functions";

type Props = {
  instanceId: string;
  instanceName: string;
  promotedVersion: number | null;
};

const DOCUMENT_TYPES: Array<{
  value: VectorStoreSearchDocumentType;
  label: string;
}> = [
  { value: "modus_operandi", label: "Modus operandi" },
  { value: "taxonomia", label: "Taxonomía" },
  { value: "similar_case", label: "Caso similar" },
  { value: "red_flag", label: "Red flag" },
  { value: "yellow_flag", label: "Yellow flag" },
];

const PIPELINES: Array<{
  value: VectorStoreSearchPipeline;
  label: string;
}> = [
  { value: "balanced", label: "Balanceado" },
  { value: "embedding_heavy", label: "Semántico" },
  { value: "keyword_heavy", label: "Palabras clave" },
];

const DOCUMENT_LABELS = Object.fromEntries(
  DOCUMENT_TYPES.map(({ value, label }) => [value, label]),
) as Record<VectorStoreSearchDocumentType, string>;

function errorMessage(error: Error) {
  return error.message || "No fue posible consultar esta instancia.";
}

export function VectorStoreSearchPanel({ instanceId, instanceName, promotedVersion }: Props) {
  const [query, setQuery] = useState("");
  const [documentType, setDocumentType] = useState<VectorStoreSearchDocumentType>("modus_operandi");
  const [pipeline, setPipeline] = useState<VectorStoreSearchPipeline>("balanced");
  const [resultScope, setResultScope] = useState<{
    instanceId: string;
    promotedVersion: number;
  } | null>(null);
  const search = useMutation({ mutationFn: queryVectorStoreInstance });
  const isCurrentResult =
    resultScope?.instanceId === instanceId && resultScope.promotedVersion === promotedVersion;
  const results = isCurrentResult ? search.data : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (!normalizedQuery || promotedVersion == null) return;
    setResultScope({ instanceId, promotedVersion });
    search.mutate({
      instanceId,
      query: normalizedQuery,
      documentType,
      pipeline,
      topK: 5,
    });
  }

  return (
    <section
      aria-labelledby="vector-store-search-title"
      className="rounded-lg border border-border p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id="vector-store-search-title" className="text-[13px] font-medium text-text-primary">
            Probar búsqueda
          </h4>
          <p className="mt-0.5 text-[11px] text-text-secondary">
            Consulta la generación activa de {instanceName}.
          </p>
        </div>
        {promotedVersion != null && (
          <span className="shrink-0 rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[10px] text-success">
            Generación v{promotedVersion}
          </span>
        )}
      </div>

      {promotedVersion == null ? (
        <p className="rounded-md bg-surface px-3 py-2 text-[11px] text-text-secondary">
          Promueve esta instancia para probar consultas sobre sus documentos.
        </p>
      ) : (
        <>
          <form onSubmit={submit} className="space-y-2">
            <label className="sr-only" htmlFor="vector-store-search-query">
              Consulta
            </label>
            <input
              id="vector-store-search-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Describe qué conocimiento quieres recuperar"
              maxLength={2000}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-[12px] text-text-primary placeholder:text-text-secondary/70"
            />
            <div className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="vector-store-search-type">
                Tipo de documento
              </label>
              <select
                id="vector-store-search-type"
                value={documentType}
                onChange={(event) =>
                  setDocumentType(event.target.value as VectorStoreSearchDocumentType)
                }
                className="h-9 min-w-36 rounded-md border border-border bg-background px-2 text-[12px] text-text-primary"
              >
                {DOCUMENT_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="vector-store-search-pipeline">
                Perfil de búsqueda
              </label>
              <select
                id="vector-store-search-pipeline"
                value={pipeline}
                onChange={(event) => setPipeline(event.target.value as VectorStoreSearchPipeline)}
                className="h-9 min-w-36 rounded-md border border-border bg-background px-2 text-[12px] text-text-primary"
              >
                {PIPELINES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!query.trim() || search.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {search.isPending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Buscar
              </button>
            </div>
          </form>

          {search.isError && isCurrentResult && (
            <p role="alert" className="text-[11px] text-danger">
              {errorMessage(search.error)}
            </p>
          )}

          {results && (
            <div aria-live="polite" className="space-y-2">
              <p className="text-[11px] text-text-secondary">
                {results.length === 0
                  ? "Sin resultados para esta consulta."
                  : `${results.length} resultado${results.length === 1 ? "" : "s"} · ${DOCUMENT_LABELS[search.variables?.documentType ?? documentType]} · ${PIPELINES.find((item) => item.value === (search.variables?.pipeline ?? pipeline))?.label}`}
              </p>
              {results.map((result) => (
                <article
                  key={result.id}
                  className="rounded-md border border-border bg-surface/50 p-3"
                >
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      {DOCUMENT_LABELS[result.type]}
                    </span>
                    <span
                      className="font-mono text-[10px] text-text-secondary"
                      title="Score de relevancia de OpenSearch"
                    >
                      score {result.score.toFixed(3)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-text-primary">
                    {result.text}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
