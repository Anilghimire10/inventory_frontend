'use client';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { formatMoney, formatNumber } from '@/lib/format';

// Everything that imports recharts lives here, so it downloads only when a
// chart is about to show (see ./index.tsx). Import from '@/components/charts'.

const PRIMARY = 'hsl(var(--primary))';
const TICK = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const MARGIN = { top: 8, right: 8, left: -8, bottom: 0 };

type Row = Record<string, string | number>;

/** Themed tooltip: money fields as money, everything else as a plain number. */
function ChartTooltip({
  active,
  payload,
  label,
  money,
}: Pick<TooltipContentProps, 'active' | 'payload' | 'label'> & { money: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label != null && label !== '' && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p, i) => {
        const n = Number(Array.isArray(p.value) ? p.value[0] : p.value);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="capitalize text-muted-foreground">{p.name}:</span>
            <span className="font-medium">{money ? formatMoney(n) : formatNumber(n)}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface TrendChartProps {
  data: Row[];
  xKey: string;
  yKey: string;
  /** Shown in the tooltip; defaults to `yKey`. */
  name?: string;
  money?: boolean;
  height: number;
}

/** A filled line over time: the sales trend. */
export function TrendChart({ data, xKey, yKey, name, money = false, height }: TrendChartProps) {
  // Two trend charts can share a page; each needs its own gradient id.
  const fillId = `trend-${yKey}-${height}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={MARGIN}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.4} />
            <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey={xKey} tick={TICK} />
        <YAxis tick={TICK} width={48} />
        <Tooltip content={(p) => <ChartTooltip {...p} money={money} />} />
        <Area type="monotone" dataKey={yKey} name={name ?? yKey} stroke={PRIMARY} strokeWidth={2} fill={`url(#${fillId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface BarsChartProps {
  data: Row[];
  xKey: string;
  yKey: string;
  name?: string;
  money?: boolean;
  height: number;
  barSize?: number;
  maxBarSize?: number;
}

/** One bar per label: sales by hour. */
export function BarsChart({ data, xKey, yKey, name, money = false, height, barSize, maxBarSize }: BarsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={MARGIN} maxBarSize={maxBarSize}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey={xKey} tick={TICK} />
        <YAxis tick={TICK} width={48} />
        <Tooltip content={(p) => <ChartTooltip {...p} money={money} />} cursor={{ fill: 'hsl(var(--accent))' }} />
        <Bar dataKey={yKey} name={name ?? yKey} fill={PRIMARY} radius={[4, 4, 0, 0]} barSize={barSize} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DonutChartProps {
  data: { name: string; value: number }[];
  /** One per slice, in the same order. */
  colors: string[];
  /** The highlighted slice; the others fade. Null: none. */
  active: number | null;
  onActive: (i: number | null) => void;
  money?: boolean;
  height: number;
}

/** Shares of a whole, with the slice under the pointer (or its legend row) highlighted. */
export function DonutChart({ data, colors, active, onActive, money = false, height }: DonutChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={50}
          outerRadius={75}
          paddingAngle={2}
          stroke="hsl(var(--background))"
          onMouseEnter={(_, i) => onActive(i)}
          onMouseLeave={() => onActive(null)}
          shape={(props) => (
            <Sector
              {...props}
              fill={colors[props.index]}
              opacity={active == null || active === props.index ? 1 : 0.35}
            />
          )}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} money={money} />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
