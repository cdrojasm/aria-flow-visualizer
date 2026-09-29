import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Plus, Trash2 } from "lucide-react";
import { PROFILE_COLORS, type AnalystCapacity, type DayProfile } from "@/data/configs";
import {
  getAnalystCapacityImport,
  uploadAnalystCapacityImport,
} from "@/lib/api/analystCapacity.functions";

/* ─── Analyst capacity editor ────────────────────────── */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function AnalystCapacityEditor({
  value,
  onChange,
}: {
  value: AnalystCapacity;
  onChange: (v: AnalystCapacity) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [importInfo, setImportInfo] = useState<{ file: string; count: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingFileName, setPendingFileName] = useState<string | null>(null);
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadAnalystCapacityImport({ data: formData });
    },
  });

  const importQuery = useQuery({
    queryKey: ["analystCapacityImport", pollingTaskId],
    queryFn: () => getAnalystCapacityImport({ data: { taskId: pollingTaskId! } }),
    enabled: !!pollingTaskId,
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 1200 : false),
  });

  useEffect(() => {
    const result = importQuery.data;
    if (!result || result.status === "PENDING") return;
    if (result.status === "READY") {
      const importedProfiles: DayProfile[] = result.profiles.map((p) => ({ ...p }));
      const dayOverrides = { ...value.dayOverrides };
      for (const [day, profileId] of Object.entries(result.day_overrides))
        dayOverrides[Number(day)] = profileId;
      onChange({ ...value, profiles: [...value.profiles, ...importedProfiles], dayOverrides });
      setImportState("done");
      setImportInfo({ file: pendingFileName ?? "", count: importedProfiles.length });
      setTimeout(() => setImportState("idle"), 4000);
    } else {
      setImportState("error");
      setImportError(result.error ?? "No se pudo importar el archivo.");
    }
    setPollingTaskId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importQuery.data]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportState("loading");
    setImportError(null);
    setPendingFileName(file.name);
    uploadMutation.mutate(file, {
      onSuccess: (res) => setPollingTaskId(res.task_id),
      onError: (err) => {
        setImportState("error");
        setImportError(err instanceof Error ? err.message : String(err));
      },
    });
  };

  const colorFor = (profileId: string) => {
    const idx = value.profiles.findIndex((p) => p.id === profileId);
    return (
      PROFILE_COLORS[idx % PROFILE_COLORS.length] ??
      "bg-text-secondary/10 text-text-secondary border-border"
    );
  };

  const updateProfile = (id: string, patch: Partial<DayProfile>) =>
    onChange({
      ...value,
      profiles: value.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });

  const updateHour = (id: string, hour: number, hourly: number) =>
    updateProfile(id, {
      hourly: value.profiles
        .find((p) => p.id === id)!
        .hourly.map((h, i) => (i === hour ? hourly : h)),
    });

  const addProfile = () => {
    const id = `profile-${Date.now()}`;
    onChange({
      ...value,
      profiles: [
        ...value.profiles,
        { id, name: "Nuevo perfil", description: "", hourly: Array(24).fill(4) },
      ],
    });
  };

  const removeProfile = (id: string) => {
    if (value.profiles.length <= 1) return;
    const remainingProfiles = value.profiles.filter((p) => p.id !== id);
    const defaultProfileId =
      value.defaultProfileId === id ? remainingProfiles[0].id : value.defaultProfileId;
    const dayOverrides = Object.fromEntries(
      Object.entries(value.dayOverrides).filter(([, pid]) => pid !== id),
    );
    onChange({ profiles: remainingProfiles, defaultProfileId, dayOverrides });
  };

  const cycleDay = (day: number) => {
    const current = value.dayOverrides[day] ?? value.defaultProfileId;
    const idx = value.profiles.findIndex((p) => p.id === current);
    const next = value.profiles[(idx + 1) % value.profiles.length];
    const dayOverrides = { ...value.dayOverrides };
    if (next.id === value.defaultProfileId) delete dayOverrides[day];
    else dayOverrides[day] = next.id;
    onChange({ ...value, dayOverrides });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[12px] font-medium text-text-secondary">
            Perfiles de disponibilidad (analistas por hora)
          </p>
          <div className="flex items-center gap-3">
            <a
              href="/templates/plantilla-disponibilidad-analistas.xlsx"
              download
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-secondary hover:text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Descargar plantilla
            </a>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importState === "loading"}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importState === "loading" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              {importState === "loading" ? "Importando…" : "Cargar desde Excel"}
            </button>
            <button
              onClick={addProfile}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo perfil
            </button>
          </div>
        </div>
        {importState === "done" && importInfo && (
          <p className="text-[11px] text-success mb-2">
            Se importaron {importInfo.count} perfiles desde "{importInfo.file}".
          </p>
        )}
        {importState === "error" && importError && (
          <p className="text-[11px] text-danger mb-2">{importError}</p>
        )}
        <div className="space-y-4 mt-3">
          {value.profiles.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-2 mb-2">
                <span
                  title={p.name}
                  className={`h-3 w-3 rounded-full border shrink-0 ${colorFor(p.id)}`}
                />
                <input
                  value={p.name}
                  onChange={(e) => updateProfile(p.id, { name: e.target.value })}
                  className="h-8 rounded-md border border-border px-2 text-[13px] font-medium bg-card focus:outline-none focus:border-primary"
                />
                <label className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary ml-2">
                  <input
                    type="radio"
                    name="defaultProfile"
                    checked={value.defaultProfileId === p.id}
                    onChange={() => onChange({ ...value, defaultProfileId: p.id })}
                  />
                  Perfil por defecto
                </label>
                <button
                  onClick={() => removeProfile(p.id)}
                  disabled={value.profiles.length <= 1}
                  className="ml-auto p-1.5 rounded hover:bg-danger/10 text-text-secondary hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                value={p.description}
                onChange={(e) => updateProfile(p.id, { description: e.target.value })}
                placeholder="Descripción del perfil (ej. cuándo aplica, qué lo distingue)"
                className="w-full h-8 rounded-md border border-border px-2 text-[12px] bg-card focus:outline-none focus:border-primary mb-2"
              />
              <div className="flex gap-1 overflow-x-auto pb-1">
                {HOURS.map((h) => (
                  <div key={h} className="flex flex-col items-center shrink-0">
                    <span className="text-[9px] text-text-secondary font-mono mb-0.5">{h}</span>
                    <input
                      type="number"
                      min={0}
                      value={p.hourly[h]}
                      onChange={(e) => updateHour(p.id, h, Number(e.target.value))}
                      className="w-9 h-8 rounded border border-border px-1 text-[11px] text-center bg-card focus:outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium text-text-secondary mb-2">
          Asignación por día del mes
        </p>
        <p className="text-[11px] text-text-secondary mb-3">
          Clic sobre un día para rotar entre perfiles. Patrón recurrente: aplica todos los meses
          (ej. días de pago 15, 20, 30).
        </p>
        <div className="grid grid-cols-7 gap-1.5 max-w-lg">
          {DAYS.map((d) => {
            const profileId = value.dayOverrides[d] ?? value.defaultProfileId;
            const profile = value.profiles.find((p) => p.id === profileId);
            return (
              <button
                key={d}
                onClick={() => cycleDay(d)}
                title={profile?.name}
                className={`h-9 rounded-md border text-[12px] font-mono transition-colors ${colorFor(profileId)}`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {value.profiles.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-secondary"
            >
              <span className={`h-2.5 w-2.5 rounded-full border ${colorFor(p.id)}`} /> {p.name}
              {p.id === value.defaultProfileId && " (defecto)"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
