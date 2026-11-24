import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { SectorFinancialComparison } from '../domain/finance';
import { SECTOR_LABELS } from '../domain/rbac';
import type { FinancialTransaction, Project, SectorId } from '../domain/types';
import { formatCompactCurrency, formatCurrency } from '../utils/format';

export type ChartMode = 'flow' | 'sectors' | 'projects';
export type TimeRange = '30D' | '90D' | '6M' | 'ALL';

interface AnalyticsChartProps {
  transactions: FinancialTransaction[];
  sectorFinancials: SectorFinancialComparison[];
  projects: Project[];
  timeRange: TimeRange;
  chartMode: ChartMode;
  onChangeChartMode: (mode: ChartMode) => void;
  onSelectSector?: (sectorId: SectorId) => void;
}

const REFERENCE_TODAY = new Date('2026-11-23T23:59:59Z').getTime();

function filterByTimeRange(
  transactions: FinancialTransaction[],
  range: TimeRange,
): FinancialTransaction[] {
  if (range === 'ALL') return transactions;
  const days = range === '30D' ? 30 : range === '90D' ? 90 : 180;
  const cutoff = REFERENCE_TODAY - days * 86400000;
  return transactions.filter((t) => {
    const time = new Date(`${t.date}T00:00:00Z`).getTime();
    return time >= cutoff;
  });
}

export function AnalyticsChart({
  transactions,
  sectorFinancials,
  projects,
  timeRange,
  chartMode,
  onChangeChartMode,
  onSelectSector,
}: AnalyticsChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const flowSeries = useMemo(() => {
    const filtered = filterByTimeRange(transactions, timeRange).filter(
      (t) => t.approvalStatus === 'Approved',
    );
    const buckets = new Map<
      string,
      { label: string; inflows: number; outflows: number; net: number }
    >();

    // Ensure chronological buckets
    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
    for (const tx of sorted) {
      const ym = tx.date.slice(0, 7); // YYYY-MM
      const d = new Date(`${ym}-01T00:00:00Z`);
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }).format(d);

      if (!buckets.has(ym)) {
        buckets.set(ym, { label, inflows: 0, outflows: 0, net: 0 });
      }
      const b = buckets.get(ym)!;
      if (
        tx.type === 'External funding' ||
        tx.type === 'Donation & grant' ||
        tx.type === 'Membership contribution' ||
        tx.type === 'Revenue generated'
      ) {
        b.inflows += tx.amount;
      } else if (
        tx.type === 'Operational expenditure' ||
        tx.type === 'Project investment'
      ) {
        b.outflows += tx.amount;
      }
      b.net = b.inflows - b.outflows;
    }

    const items = Array.from(buckets.values());
    if (items.length === 1) {
      // Provide an anchor baseline point so SVG path renders gracefully
      return [{ label: 'Start', inflows: 0, outflows: 0, net: 0 }, ...items];
    }
    return items;
  }, [transactions, timeRange]);

  const niceCeil = (raw: number) => {
    const safe = Math.max(100_000, raw);
    const magnitude = Math.pow(10, Math.floor(Math.log10(safe)));
    const step = magnitude / 2;
    return Math.ceil(safe / step) * step;
  };

  const maxFlowVal = useMemo(() => {
    const m = Math.max(
      100_000,
      ...flowSeries.flatMap((d) => [d.inflows, d.outflows]),
    );
    return niceCeil(m);
  }, [flowSeries]);

  const maxSectorVal = useMemo(() => {
    const m = Math.max(
      100_000,
      ...sectorFinancials.flatMap((s) => [
        s.allocated,
        s.expenditure + s.projectInvestment,
        s.revenue,
      ]),
    );
    return niceCeil(m);
  }, [sectorFinancials]);

  const maxProjectVal = useMemo(() => {
    const m = Math.max(
      100_000,
      ...projects.flatMap((p) => [p.budget, p.expenditure, p.revenue]),
    );
    return niceCeil(m);
  }, [projects]);

  const width = 760;
  const height = 250;
  const padL = 72;
  const padR = 24;
  const padT = 20;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const buildPath = (values: number[], maxVal: number) => {
    if (values.length === 0) return '';
    return values
      .map((v, i) => {
        const x =
          values.length === 1
            ? padL + plotW / 2
            : padL + (i / (values.length - 1)) * plotW;
        const y = padT + plotH - (v / maxVal) * plotH;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const buildAreaPath = (values: number[], maxVal: number) => {
    if (values.length === 0) return '';
    const line = buildPath(values, maxVal);
    const lastX =
      values.length === 1 ? padL + plotW / 2 : padL + plotW;
    const baseY = padT + plotH;
    return `${line} L ${lastX.toFixed(1)} ${baseY} L ${padL} ${baseY} Z`;
  };

  return (
    <section
      aria-label="Organisational analytics visualization"
      className="rounded-xl border border-[#E4E7E2] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,18,0.04)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[#ECEEE9] pb-4">
        <div>
          <h2 className="text-base font-semibold text-[#141815]">
            {chartMode === 'flow'
              ? 'Treasury Inflows vs. Actual Expenditure'
              : chartMode === 'sectors'
                ? 'Sector Allocation, Spend & Revenue Comparison'
                : 'Project Budget Utilization & Revenue'}
          </h2>
          <p className="mt-0.5 text-xs text-[#5F6660]">
            {chartMode === 'flow'
              ? 'Approved cash inflows compared against actual operational and project spending'
              : chartMode === 'sectors'
                ? 'Click any sector column group to open its dedicated workspace'
                : 'Comparing allocated project budgets against recorded expenditure and revenue'}
          </p>
        </div>

        {/* Chart style segmented switch */}
        <div
          role="tablist"
          aria-label="Analytics visualization mode"
          className="inline-flex items-center gap-1 self-start rounded-lg bg-[#F3F5F1] p-1"
        >
          {(
            [
              { id: 'flow', label: 'Financial Flow' },
              { id: 'sectors', label: 'Sector Comparison' },
              { id: 'projects', label: 'Project ROI' },
            ] as const
          ).map((tab) => {
            const active = chartMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setHoveredIdx(null);
                  onChangeChartMode(tab.id);
                }}
                className={`whitespace-nowrap shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-[#65A30D] ${
                  active
                    ? 'bg-white text-[#141815] shadow-xs'
                    : 'text-[#5F6660] hover:text-[#141815]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-5 text-xs text-[#4A524C]">
        {chartMode === 'flow' && (
          <>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#65A30D]" />
              <span>Approved Inflows</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#141815]" />
              <span>Actual Expenditure</span>
            </span>
          </>
        )}
        {chartMode === 'sectors' && (
          <>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#141815]" />
              <span>Allocated Funds</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#94A3B8]" />
              <span>Actual Spend</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#84CC16]" />
              <span>Revenue Generated</span>
            </span>
          </>
        )}
        {chartMode === 'projects' && (
          <>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#E4E7E2]" />
              <span>Budget</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#141815]" />
              <span>Expenditure</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-xs bg-[#84CC16]" />
              <span>Revenue</span>
            </span>
          </>
        )}
      </div>

      {/* Chart SVG Viewport */}
      <div className="relative mt-2 w-full overflow-hidden">
        <AnimatePresence mode="wait">
          {chartMode === 'flow' && (
            <motion.div
              key={`flow-${timeRange}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {flowSeries.length === 0 ? (
                <div className="flex h-[250px] items-center justify-center text-sm text-[#717972]">
                  No approved transactions recorded in this time window.
                </div>
              ) : (
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  className="h-[250px] w-full overflow-visible"
                  role="img"
                  aria-label="Treasury inflows and expenditure chart"
                >
                  <defs>
                    <linearGradient id="limeArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#84CC16" stopOpacity="0.26" />
                      <stop offset="100%" stopColor="#84CC16" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>

                  {/* Y-Axis gridlines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                    const y = padT + plotH * (1 - t);
                    const val = Math.round(maxFlowVal * t);
                    return (
                      <g key={t}>
                        <line
                          x1={padL}
                          x2={width - padR}
                          y1={y}
                          y2={y}
                          stroke="#ECEEE9"
                          strokeWidth="1"
                        />
                        <text
                          x={padL - 8}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-[#717972] font-mono text-[10px]"
                        >
                          {formatCompactCurrency(val)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Area + Lines */}
                  <motion.path
                    d={buildAreaPath(
                      flowSeries.map((d) => d.inflows),
                      maxFlowVal,
                    )}
                    fill="url(#limeArea)"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35 }}
                  />
                  <motion.path
                    d={buildPath(
                      flowSeries.map((d) => d.inflows),
                      maxFlowVal,
                    )}
                    fill="none"
                    stroke="#65A30D"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <motion.path
                    d={buildPath(
                      flowSeries.map((d) => d.outflows),
                      maxFlowVal,
                    )}
                    fill="none"
                    stroke="#141815"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  />

                  {/* Interactive points & X labels */}
                  {flowSeries.map((pt, i) => {
                    const x =
                      flowSeries.length === 1
                        ? padL + plotW / 2
                        : padL + (i / (flowSeries.length - 1)) * plotW;
                    const yIn =
                      padT + plotH - (pt.inflows / maxFlowVal) * plotH;
                    const yOut =
                      padT + plotH - (pt.outflows / maxFlowVal) * plotH;
                    const isHovered = hoveredIdx === i;

                    return (
                      <g
                        key={pt.label}
                        onMouseEnter={() => setHoveredIdx(i)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className="cursor-pointer"
                      >
                        {isHovered && (
                          <line
                            x1={x}
                            x2={x}
                            y1={padT}
                            y2={padT + plotH}
                            stroke="#D4D8D0"
                            strokeWidth="1"
                          />
                        )}
                        <circle
                          cx={x}
                          cy={yIn}
                          r={isHovered ? 5 : 3.5}
                          fill="#65A30D"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <circle
                          cx={x}
                          cy={yOut}
                          r={isHovered ? 4.5 : 3}
                          fill="#141815"
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                        />
                        <rect
                          x={x - 24}
                          y={padT}
                          width={48}
                          height={plotH + 24}
                          fill="transparent"
                        />
                        <text
                          x={x}
                          y={height - 8}
                          textAnchor="middle"
                          className="fill-[#5F6660] text-[11px]"
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}

              {hoveredIdx !== null && flowSeries[hoveredIdx] && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] px-3.5 py-2 text-xs">
                  <span className="font-semibold text-[#141815]">
                    {flowSeries[hoveredIdx].label}
                  </span>
                  <div className="flex flex-wrap items-center gap-4 tabular-nums">
                    <span className="text-[#3F6212]">
                      Inflows: {formatCurrency(flowSeries[hoveredIdx].inflows)}
                    </span>
                    <span className="text-[#141815]">
                      Actual Spend:{' '}
                      {formatCurrency(flowSeries[hoveredIdx].outflows)}
                    </span>
                    <span className="font-medium text-[#4A524C]">
                      Net: {formatCurrency(flowSeries[hoveredIdx].net)}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {chartMode === 'sectors' && (
            <motion.div
              key="sectors"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-[250px] w-full overflow-visible"
                role="img"
                aria-label="Sector financial comparison bar chart"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = padT + plotH * (1 - t);
                  const val = Math.round(maxSectorVal * t);
                  return (
                    <g key={t}>
                      <line
                        x1={padL}
                        x2={width - padR}
                        y1={y}
                        y2={y}
                        stroke="#ECEEE9"
                        strokeWidth="1"
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-[#717972] font-mono text-[10px]"
                      >
                        {formatCompactCurrency(val)}
                      </text>
                    </g>
                  );
                })}

                {sectorFinancials.map((sec, idx) => {
                  const groupW = plotW / sectorFinancials.length;
                  const centerX = padL + groupW * idx + groupW / 2;
                  const barW = 24;
                  const gap = 6;

                  const spent = sec.expenditure + sec.projectInvestment;
                  const bars = [
                    { val: sec.allocated, color: '#141815', offset: -(barW + gap) },
                    { val: spent, color: '#94A3B8', offset: 0 },
                    { val: sec.revenue, color: '#84CC16', offset: barW + gap },
                  ];

                  return (
                    <g
                      key={sec.sectorId}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => onSelectSector?.(sec.sectorId)}
                      className="cursor-pointer"
                    >
                      {hoveredIdx === idx && (
                        <rect
                          x={padL + groupW * idx + 12}
                          y={padT - 4}
                          width={groupW - 24}
                          height={plotH + 8}
                          rx="8"
                          fill="#F6F7F5"
                        />
                      )}
                      {bars.map((b, bi) => {
                        const h = Math.max(2, (b.val / maxSectorVal) * plotH);
                        const y = padT + plotH - h;
                        return (
                          <motion.rect
                            key={bi}
                            x={centerX + b.offset - barW / 2}
                            width={barW}
                            rx="4"
                            fill={b.color}
                            initial={{ y: padT + plotH, height: 0 }}
                            animate={{ y, height: h }}
                            transition={{
                              duration: 0.35,
                              delay: idx * 0.04,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                          />
                        );
                      })}
                      <text
                        x={centerX}
                        y={height - 8}
                        textAnchor="middle"
                        className="fill-[#141815] text-xs font-medium"
                      >
                        {SECTOR_LABELS[sec.sectorId]}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {hoveredIdx !== null && sectorFinancials[hoveredIdx] && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] px-3.5 py-2 text-xs">
                  <span className="font-semibold text-[#141815]">
                    {SECTOR_LABELS[sectorFinancials[hoveredIdx].sectorId]}
                  </span>
                  <div className="flex flex-wrap items-center gap-4 tabular-nums">
                    <span>
                      Allocated:{' '}
                      {formatCurrency(sectorFinancials[hoveredIdx].allocated)}
                    </span>
                    <span>
                      Spent:{' '}
                      {formatCurrency(
                        sectorFinancials[hoveredIdx].expenditure +
                          sectorFinancials[hoveredIdx].projectInvestment,
                      )}
                    </span>
                    <span className="text-[#3F6212] font-medium">
                      Revenue:{' '}
                      {formatCurrency(sectorFinancials[hoveredIdx].revenue)}
                    </span>
                    <span>
                      Remaining Alloc:{' '}
                      {formatCurrency(
                        sectorFinancials[hoveredIdx].remainingAllocation,
                      )}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {chartMode === 'projects' && (
            <motion.div
              key="projects"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-[250px] w-full overflow-visible"
                role="img"
                aria-label="Project budget vs expenditure vs revenue comparison"
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = padT + plotH * (1 - t);
                  const val = Math.round(maxProjectVal * t);
                  return (
                    <g key={t}>
                      <line
                        x1={padL}
                        x2={width - padR}
                        y1={y}
                        y2={y}
                        stroke="#ECEEE9"
                        strokeWidth="1"
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        className="fill-[#717972] font-mono text-[10px]"
                      >
                        {formatCompactCurrency(val)}
                      </text>
                    </g>
                  );
                })}

                {projects.slice(0, 5).map((prj, idx) => {
                  const count = Math.min(5, projects.length);
                  const groupW = plotW / Math.max(1, count);
                  const centerX = padL + groupW * idx + groupW / 2;
                  const barW = 20;
                  const gap = 5;

                  const bars = [
                    { val: prj.budget, color: '#E4E7E2', offset: -(barW + gap) },
                    { val: prj.expenditure, color: '#141815', offset: 0 },
                    { val: prj.revenue, color: '#84CC16', offset: barW + gap },
                  ];

                  const shortTitle =
                    prj.name.length > 16
                      ? `${prj.name.slice(0, 15)}…`
                      : prj.name;

                  return (
                    <g
                      key={prj.id}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      {bars.map((b, bi) => {
                        const h = Math.max(2, (b.val / maxProjectVal) * plotH);
                        const y = padT + plotH - h;
                        return (
                          <motion.rect
                            key={bi}
                            x={centerX + b.offset - barW / 2}
                            width={barW}
                            rx="4"
                            fill={b.color}
                            initial={{ y: padT + plotH, height: 0 }}
                            animate={{ y, height: h }}
                            transition={{
                              duration: 0.35,
                              delay: idx * 0.04,
                              ease: [0.16, 1, 0.3, 1],
                            }}
                          />
                        );
                      })}
                      <text
                        x={centerX}
                        y={height - 8}
                        textAnchor="middle"
                        className="fill-[#4A524C] text-[11px]"
                      >
                        {shortTitle}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {hoveredIdx !== null && projects[hoveredIdx] && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#E4E7E2] bg-[#FAFBF9] px-3.5 py-2 text-xs">
                  <span className="font-semibold text-[#141815]">
                    {projects[hoveredIdx].name}
                  </span>
                  <div className="flex flex-wrap items-center gap-4 tabular-nums">
                    <span>
                      Budget: {formatCurrency(projects[hoveredIdx].budget)}
                    </span>
                    <span>
                      Spent: {formatCurrency(projects[hoveredIdx].expenditure)}
                    </span>
                    <span className="font-medium text-[#3F6212]">
                      Revenue: {formatCurrency(projects[hoveredIdx].revenue)}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
