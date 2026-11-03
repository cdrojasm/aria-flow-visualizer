import { useVectorStoreGenerations } from "@/hooks/useVectorStoreVersions";

const STATUS = { ready: "Lista", building: "Construyendo", failed: "Falló", retired: "Retirada" };

export function VectorStoreGenerationsPanel({ instanceId }: { instanceId: string }) {
  const query = useVectorStoreGenerations(instanceId);
  const generations = query.data ?? [];
  const latestReady = generations.find(g => g.status === "ready");
  return (
    <section aria-label="Generaciones de Vector Store" className="rounded-lg border border-border p-4 space-y-3">
      <h4 className="text-[13px] font-semibold text-text-primary">Generaciones</h4>
      <p className="text-[12px] text-text-secondary">
        Construir prepara documentos para consultar y probar. Producción cambia únicamente al aprobar el despliegue de una configuración que fija esa generación.
      </p>
      {latestReady?.matches_manifest === false && <p role="status" className="text-[12px] text-warning">Los documentos cambiaron desde la generación {latestReady.generation}. Construye otra generación para probar esos cambios.</p>}
      {query.isError && <p role="alert" className="text-[12px] text-danger">No se pudieron cargar las generaciones.</p>}
      {!query.isLoading && !generations.length && <p className="text-[12px] text-text-secondary">Todavía no hay generaciones construidas.</p>}
      <ul className="space-y-2">
        {generations.map(g => (
          <li key={g.generation} data-testid={`vector-generation-${g.generation}`} className="rounded-md border border-border px-3 py-2 text-[12px] text-text-primary">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <b>Generación {g.generation}</b><span>{STATUS[g.status]}</span>
              <span>{g.document_count} documentos</span>
              {g.in_production && <span className="font-semibold text-success">En producción</span>}
              <span>Fijada por {g.pinned_by.length} configuraciones</span>
            </div>
            <p className="mt-1 text-text-secondary">{g.built_by} · {new Date(g.ready_at ?? g.created_at).toLocaleString("es-CO")}</p>
            {g.error && <p className="text-danger">No se completó la construcción: {g.error}</p>}
            {g.pinned_by.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-text-secondary">Configuraciones que la fijan</summary><ul>{g.pinned_by.map(pin => <li key={pin}>{pin}</li>)}</ul></details>}
          </li>
        ))}
      </ul>
    </section>
  );
}
