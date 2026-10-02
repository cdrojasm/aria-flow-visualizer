import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { historicalTierCodes, UNKNOWN_AMOUNT_TIER } from "@/lib/amountTiers";
import { listChannelLibraryEntries } from "@/lib/api/channelLibrary.functions";
import { listConfigurations } from "@/lib/api/configurations.functions";
import { getMetricsOverview } from "@/lib/api/metrics.functions";
import {
  RESOLUTION_METHOD_LABELS,
  STATUS_LABELS,
  type FilterSelection,
} from "@/lib/api/metricsMapping";
import {
  getOperationalSettings,
  listOperationalSettingsHistory,
} from "@/lib/api/operations.functions";

/* Filters shared by /dashboard, /monitor and /historico-fraude. Every
   option comes from a real source, never a fixed list:
   - segment: Biblioteca → Canales catalog (channel_library; its code is the
     segment key a configuration resolves alerts into);
   - channel / subchannel: there is no Biblioteca catalog for the raw event
     `channel`/`integrationPoint` values, so the options are the values
     actually observed in the range (GET /metrics/overview distributions,
     needs the `dashboard` permission - otherwise the selects stay off);
   - amount tier: the current tiers (Operación → Rangos de monto) plus every
     code that appears in the settings history, so alerts classified with
     an older tier set stay filterable;
   - status / resolution method: the backend enums;
   - configuration: the configurations list.
   "unknown" is a real filter value on the backend (alerts with no value for
   that dimension). */

export type FilterDimension =
  | "segment"
  | "channel"
  | "subchannel"
  | "amount_tier"
  | "status"
  | "resolution_method"
  | "configuration_id";

type Option = { value: string; label: string };

const ALL = "__all__";

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
  width = "w-[150px]",
  disabledReason,
}: {
  label: string;
  allLabel: string;
  value: string | undefined;
  options: Option[];
  onChange: (value: string | undefined) => void;
  width?: string;
  disabledReason?: string;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? undefined : v)}
      disabled={Boolean(disabledReason)}
    >
      <SelectTrigger
        className={`h-[30px] ${width} text-[11px]`}
        aria-label={label}
        title={disabledReason}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function useAmountTierOptions(): Option[] {
  const settingsQuery = useQuery({
    queryKey: ["operationalSettings"],
    queryFn: () => getOperationalSettings(),
  });
  const historyQuery = useQuery({
    queryKey: ["operationalSettingsHistory", "all"],
    queryFn: () => listOperationalSettingsHistory({ data: { limit: 500 } }),
    staleTime: 60_000,
  });
  const current = settingsQuery.data?.amountTiers ?? [];
  const currentCodes = new Set(current.map((t) => t.code));
  const historical = historicalTierCodes(historyQuery.data ?? [], currentCodes);
  return [
    ...current.map((t) => ({ value: t.code, label: t.label || t.code })),
    ...[...historical].map(([code, label]) => ({ value: code, label: `${label} (histórico)` })),
    { value: UNKNOWN_AMOUNT_TIER, label: "Sin rango" },
  ];
}

/** Raw channel/subchannel values observed in the range (unfiltered). */
function useObservedChannels(range: { from: string; to: string }, enabled: boolean) {
  const query = useQuery({
    queryKey: ["metrics", "overview", range, {}],
    queryFn: () => getMetricsOverview({ data: { ...range, filters: {} } }),
    enabled,
    staleTime: 60_000,
  });
  const values = (name: string) =>
    (query.data?.distributions[name] ?? []).map((b) => b.value).filter((v) => v !== "unknown");
  return { channel: values("channel"), subchannel: values("subchannel") };
}

export function MetricsFilterBar({
  value,
  onChange,
  dimensions,
  range,
  canReadObservedValues,
}: {
  value: FilterSelection;
  onChange: (value: FilterSelection) => void;
  dimensions: FilterDimension[];
  range: { from: string; to: string };
  // True when the user has the `dashboard` permission (overview is what
  // lists observed channel values).
  canReadObservedValues: boolean;
}) {
  const has = (d: FilterDimension) => dimensions.includes(d);
  const segmentsQuery = useQuery({
    queryKey: ["channelLibrary"],
    queryFn: () => listChannelLibraryEntries({ data: { activeOnly: true } }),
    enabled: has("segment"),
  });
  const configurationsQuery = useQuery({
    queryKey: ["configurations"],
    queryFn: () => listConfigurations(),
    enabled: has("configuration_id"),
  });
  const tierOptions = useAmountTierOptions();
  const observed = useObservedChannels(
    range,
    canReadObservedValues && (has("channel") || has("subchannel")),
  );
  const set = (name: FilterDimension) => (v: string | undefined) =>
    onChange({ ...value, [name]: v });

  const withSelected = (options: Option[], selected: string | undefined) =>
    selected && !options.some((o) => o.value === selected)
      ? [...options, { value: selected, label: selected }]
      : options;

  const segmentOptions: Option[] = [
    ...(segmentsQuery.data ?? []).map((c) => ({ value: c.code, label: c.name })),
    { value: "unknown", label: "Sin segmento" },
  ];
  const configurationOptions: Option[] = [
    ...new Map((configurationsQuery.data ?? []).map((c) => [c.configuration_id, c.name])).entries(),
  ].map(([id, name]) => ({ value: id, label: name }));
  const observedReason = canReadObservedValues
    ? undefined
    : "Requiere permiso de dashboard para listar los valores observados";

  return (
    <>
      {has("segment") && (
        <FilterSelect
          label="Segmento"
          allLabel="Todos los segmentos"
          value={value.segment}
          options={withSelected(segmentOptions, value.segment)}
          onChange={set("segment")}
        />
      )}
      {has("channel") && (
        <FilterSelect
          label="Canal"
          allLabel="Todos los canales"
          value={value.channel}
          width="w-[140px]"
          options={withSelected(
            observed.channel.map((v) => ({ value: v, label: v })),
            value.channel,
          )}
          onChange={set("channel")}
          disabledReason={observedReason}
        />
      )}
      {has("subchannel") && (
        <FilterSelect
          label="Subcanal"
          allLabel="Todos los subcanales"
          value={value.subchannel}
          options={withSelected(
            observed.subchannel.map((v) => ({ value: v, label: v })),
            value.subchannel,
          )}
          onChange={set("subchannel")}
          disabledReason={observedReason}
        />
      )}
      {has("amount_tier") && (
        <FilterSelect
          label="Monto"
          allLabel="Todos los montos"
          value={value.amount_tier}
          options={withSelected(tierOptions, value.amount_tier)}
          onChange={set("amount_tier")}
        />
      )}
      {has("status") && (
        <FilterSelect
          label="Estado"
          allLabel="Todos los estados"
          value={value.status}
          options={Object.entries(STATUS_LABELS).map(([v, label]) => ({ value: v, label }))}
          onChange={set("status")}
        />
      )}
      {has("resolution_method") && (
        <FilterSelect
          label="Método de resolución"
          allLabel="Todos los métodos"
          value={value.resolution_method}
          width="w-[160px]"
          options={Object.entries(RESOLUTION_METHOD_LABELS).map(([v, label]) => ({
            value: v,
            label,
          }))}
          onChange={set("resolution_method")}
        />
      )}
      {has("configuration_id") && (
        <FilterSelect
          label="Configuración"
          allLabel="Todas las configuraciones"
          value={value.configuration_id}
          width="w-[180px]"
          options={withSelected(configurationOptions, value.configuration_id)}
          onChange={set("configuration_id")}
        />
      )}
    </>
  );
}
