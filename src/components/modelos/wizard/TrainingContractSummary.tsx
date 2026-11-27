import { ArrowRight } from "lucide-react";
import { leakTitle, operationLabel, type TrainingContract } from "./trainingContract";

export function TrainingContractSummary({
  contract,
  pinnedVersion,
  activeVersion,
  validated,
  onUseActive,
}: {
  contract: TrainingContract;
  pinnedVersion: number | null;
  activeVersion: number | null;
  validated: boolean;
  onUseActive?: () => void;
}) {
  const usedVersion = pinnedVersion ?? activeVersion;
  const outdated =
    pinnedVersion !== null && activeVersion !== null && pinnedVersion !== activeVersion;
  return (
    <div data-testid="training-contract" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span data-testid="contract-count" className="font-medium">
          {contract.activeCount}{" "}
          {contract.activeCount === 1
            ? "variable de entrada activa"
            : "variables de entrada activas"}
        </span>
        <span
          data-testid="contract-schema-version"
          className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium"
        >
          {usedVersion !== null ? `Esquema v${usedVersion}` : "Esquema no disponible"}
        </span>
        {!validated && contract.activeCount > 0 && (
          <span className="text-[11px] text-warning">Validación pendiente</span>
        )}
      </div>
      {outdated && (
        <p data-testid="contract-schema-outdated" className="text-[11px] text-warning">
          Este borrador se armó con el esquema v{pinnedVersion}; el esquema vigente es v
          {activeVersion}. Revisa las variables antes de entrenar.{" "}
          {onUseActive && (
            <button type="button" className="underline" onClick={onUseActive}>
              Usar el esquema vigente
            </button>
          )}
        </p>
      )}
      <ul className="space-y-2">
        {contract.variables.map((v) => (
          <li
            key={v.id}
            data-testid="contract-variable"
            className="rounded bg-primary/5 p-2 text-[11px]"
          >
            <span className="font-medium">{v.name}</span>
            <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
              {v.steps.length === 0 && <span className="text-text-secondary">Sin pasos</span>}
              {v.steps.map((op, i) => (
                <span key={`${op}-${i}`} className="inline-flex items-center gap-1">
                  {i > 0 && <ArrowRight size={10} aria-hidden="true" />}
                  <span className="rounded border border-border bg-card px-1.5 py-0.5">
                    {operationLabel(op)}
                  </span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {contract.leaks.length > 0 && (
        <div
          data-testid="contract-leaks"
          role="alert"
          className="rounded border border-danger/30 bg-danger/5 p-2 text-[11px] text-danger"
        >
          <p className="font-medium">Fuga de datos: no se puede entrenar</p>
          <ul className="list-disc pl-4">
            {contract.leaks.map((l) => (
              <li key={`${l.variable}-${l.field}`}>
                <span className="font-medium">{leakTitle(l)}:</span> “{l.variable}” depende de “
                {l.field}”. {l.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {contract.suspects.length > 0 && (
        <div
          data-testid="contract-suspects"
          className="rounded border border-warning/30 bg-warning/5 p-2 text-[11px]"
        >
          <p className="font-medium">Revisa estas variables</p>
          <p className="text-text-secondary">
            No bloquean el entrenamiento, pero por su nombre podrían memorizar un identificador o
            filtrar la respuesta.
          </p>
          <ul className="list-disc pl-4">
            {contract.suspects.map((l) => (
              <li key={`${l.variable}-${l.field}`}>
                “{l.variable}” usa “{l.field}”. {l.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {contract.sensitive.length > 0 && (
        <div
          data-testid="contract-sensitive"
          className="rounded border border-warning/30 bg-warning/5 p-2 text-[11px]"
        >
          <p className="font-medium">Datos sensibles en las variables</p>
          <ul className="list-disc pl-4">
            {contract.sensitive.map((l) => (
              <li key={`${l.variable}-${l.field}`}>
                “{l.variable}” usa “{l.field}”. {l.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
