import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const LINE = "#2563EB";

type ChartPoint = {
  dateKey: string;
  views: number;
  dateLabel: string;
  dowLabel: string;
  tooltipDate: string;
};

function mapDaily(source: Array<{ date: string; count: number }>): ChartPoint[] {
  return source.map((point) => {
    const d = parseISO(`${point.date}T12:00:00Z`);
    return {
      dateKey: point.date,
      views: point.count,
      dateLabel: Number.isNaN(d.getTime()) ? point.date : format(d, "MMM d"),
      dowLabel: Number.isNaN(d.getTime()) ? "" : format(d, "EEE"),
      tooltipDate: Number.isNaN(d.getTime()) ? point.date : format(d, "MMM d, yyyy")
    };
  });
}

/**
 * Indices for ~7 x-axis labels. Always includes peakIdx when provided so the peak aligns with a date label.
 * We render with interval={0} and hide ticks not in this set — avoids passing XAxis `ticks`, which misaligns
 * labels vs category bands in Recharts.
 */
function computeTickIndices(n: number, peakIdx: number | null): Set<number> {
  if (n === 0) return new Set();
  if (n <= 7) return new Set(Array.from({ length: n }, (_, i) => i));
  const set = new Set<number>();
  for (let i = 0; i < 7; i++) {
    set.add(Math.round((i * (n - 1)) / 6));
  }
  if (peakIdx !== null && peakIdx >= 0 && peakIdx < n) {
    set.add(peakIdx);
  }
  while (set.size > 7) {
    const sorted = [...set].sort((a, b) => a - b);
    let drop = sorted[1];
    let minGap = Infinity;
    for (let i = 1; i < sorted.length - 1; i++) {
      const idx = sorted[i];
      if (idx === peakIdx) continue;
      const gap = Math.min(idx - sorted[i - 1], sorted[i + 1] - sorted[i]);
      if (gap < minGap) {
        minGap = gap;
        drop = idx;
      }
    }
    set.delete(drop);
  }
  return set;
}

function fallbackWeek(): ChartPoint[] {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (6 - i)));
    const iso = d.toISOString().slice(0, 10);
    const parsed = parseISO(`${iso}T12:00:00Z`);
    return {
      dateKey: iso,
      views: 0,
      dateLabel: format(parsed, "MMM d"),
      dowLabel: format(parsed, "EEE"),
      tooltipDate: format(parsed, "MMM d, yyyy")
    };
  });
}

type Props = {
  daily: Array<{ date: string; count: number }>;
  /** Unique fragment for SVG gradient id (no spaces). */
  instanceId: string;
};

export function ProfileViewsAreaChart({ daily, instanceId }: Props) {
  const gradientId = `pvFill-${instanceId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const chartData = useMemo(() => {
    const built = mapDaily(daily);
    return built.length ? built : fallbackWeek();
  }, [daily]);

  const peak = useMemo(() => {
    if (!chartData.length) return null;
    let best = 0;
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].views > chartData[best].views) best = i;
    }
    return chartData[best].views > 0 ? { row: chartData[best], index: best } : null;
  }, [chartData]);

  const peakIndex = peak?.index ?? -1;

  const tickIndexSet = useMemo(
    () => computeTickIndices(chartData.length, peak?.index ?? null),
    [chartData, peak?.index]
  );

  const yAxis = useMemo(() => {
    const maxV = Math.max(0, ...chartData.map((d) => d.views));
    const ceiling = Math.max(30, Math.ceil(Math.max(maxV, 1) / 10) * 10);
    const ticks = Array.from({ length: ceiling / 10 + 1 }, (_, i) => i * 10);
    return { domain: [0, ceiling] as [number, number], ticks };
  }, [chartData]);

  return (
    <div className="relative h-[260px] overflow-visible">
      <div className="pointer-events-none absolute left-1 top-8 z-10 text-[11px] font-medium text-[#6b7280]">
        Views
      </div>
      <ResponsiveContainer width="100%" height="100%" className="overflow-visible [&_.recharts-surface]:overflow-visible">
        <AreaChart data={chartData} margin={{ top: 28, right: 14, bottom: 22, left: 18 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="dateKey"
            type="category"
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={(props: { x?: number; y?: number; payload?: { value?: string }; index?: number }) => {
              const { x = 0, y = 0, payload, index = -1 } = props;
              if (!tickIndexSet.has(index)) {
                return <g />;
              }
              const row = chartData[index];
              const dateLabel = row?.dateLabel ?? payload?.value ?? "";
              const dowLabel = row?.dowLabel ?? "";
              return (
                <g transform={`translate(${x},${y})`}>
                  <text textAnchor="middle" y={0} dy={12} fill="#6b7280" fontSize={11}>
                    {dateLabel}
                  </text>
                  <text textAnchor="middle" y={0} dy={26} fill="#9ca3af" fontSize={10}>
                    {dowLabel}
                  </text>
                </g>
              );
            }}
            height={48}
          />
          <YAxis
            domain={yAxis.domain}
            ticks={yAxis.ticks}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ stroke: "#dbeafe", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as ChartPoint;
              const v = payload[0].value;
              return (
                <div className="rounded-lg border border-[#eef1f4] bg-white px-3 py-2 shadow-lg">
                  <p className="text-sm text-[#374151]">{row.tooltipDate}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#2563EB]">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#2563EB]" aria-hidden />
                    {v} views
                  </p>
                </div>
              );
            }}
          />
          {peak ? (
            <ReferenceLine
              isFront
              segment={[
                { x: peak.row.dateKey, y: peak.row.views },
                { x: peak.row.dateKey, y: 0 }
              ]}
              stroke={LINE}
              strokeDasharray="4 4"
              strokeWidth={1}
              strokeOpacity={0.9}
              ifOverflow="visible"
            />
          ) : null}
          <Area
            type="natural"
            dataKey="views"
            stroke={LINE}
            strokeWidth={2.5}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            dot={{ r: 4, fill: LINE, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: LINE, stroke: "#fff", strokeWidth: 2 }}
          >
            {peak ? (
              <LabelList
                dataKey="views"
                position="top"
                content={(props: {
                  x?: number | string;
                  y?: number | string;
                  index?: number;
                  value?: number | string;
                }) => {
                  if (props.index !== peakIndex || props.value === undefined) return null;
                  const cx = Number(props.x);
                  const cy = Number(props.y);
                  if (Number.isNaN(cx) || Number.isNaN(cy)) return null;
                  return (
                    <text
                      x={cx}
                      y={cy - 12}
                      textAnchor="middle"
                      fill={LINE}
                      fontSize={14}
                      style={{ fontWeight: 800 }}
                    >
                      {props.value}
                    </text>
                  );
                }}
              />
            ) : null}
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
