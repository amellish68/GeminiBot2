import React, { useMemo, useState } from 'react';
import type { AccountMetrics, AccountSettings } from '../types/trading';

interface EquityEodViewProps {
  metrics: AccountMetrics;
  settings: AccountSettings;
}

export const EquityEodView: React.FC<EquityEodViewProps> = ({ metrics, settings }) => {
  const [avgDailyWin, setAvgDailyWin] = useState(550);
  const [winDayRate, setWinDayRate] = useState(65);

  const width = 760;
  const height = 300;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const history = metrics.dailyHistory;
  const allVals = [
    48000,
    50100,
    metrics.effectiveTargetBalance,
    ...history.map((d) => d.eodBalance),
    ...history.map((d) => d.eodDrawdownFloor),
  ];
  const minVal = Math.min(...allVals) - 250;
  const maxVal = Math.max(...allVals) + 250;

  const yFor = (val: number) =>
    padTop + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;

  const xFor = (idx: number) =>
    history.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (idx / (history.length - 1)) * plotW;

  const balancePath = history
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(pt.eodBalance).toFixed(1)}`)
    .join(' ');

  const floorPath = history
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(pt.eodDrawdownFloor).toFixed(1)}`)
    .join(' ');

  const yTarget = yFor(metrics.effectiveTargetBalance);
  const yLock = yFor(52100);
  const yFloorLock = yFor(50100);

  const projection = useMemo(() => {
    const remainingProfit = Math.max(0, metrics.effectiveTargetProfit - metrics.totalNetPnl);
    const remainingToLock = Math.max(0, 2100 - metrics.totalNetPnl);
    const pWin = winDayRate / 100;
    const expectedDailyNet = pWin * avgDailyWin - (1 - pWin) * settings.personalDailyLossCap;
    const daysToLock =
      remainingToLock === 0
        ? 0
        : expectedDailyNet > 0
          ? Math.ceil(remainingToLock / expectedDailyNet)
          : null;
    const daysToPass =
      remainingProfit === 0
        ? 0
        : expectedDailyNet > 0
          ? Math.ceil(remainingProfit / expectedDailyNet)
          : null;

    return {
      expectedDailyNet: Math.round(expectedDailyNet),
      daysToLock,
      daysToPass,
      exceedsRule: avgDailyWin > metrics.maxSingleDayAllowed,
    };
  }, [
    avgDailyWin,
    winDayRate,
    metrics.effectiveTargetProfit,
    metrics.totalNetPnl,
    metrics.maxSingleDayAllowed,
    settings.personalDailyLossCap,
  ]);

  return (
    <div className="space-y-6">
      {/* Equity & EOD Lock SVG Chart */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-display text-lg font-semibold text-slate-100">
              Equity Curve &amp; EOD Trailing Drawdown Lock
            </h1>
            <p className="text-xs text-slate-400">
              Your drawdown floor updates only at session close and locks permanently at $50,100 once EOD reaches $52,100.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-emerald-400" />
              EOD Balance
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-rose-400" />
              EOD Drawdown Floor
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 border-t border-dashed border-sky-400" />
              Pass Target (${metrics.effectiveTargetBalance.toLocaleString()})
            </span>
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full select-none"
            role="img"
            aria-label="Equity curve vs EOD trailing drawdown floor chart"
          >
            <rect
              x={padLeft}
              y={padTop}
              width={plotW}
              height={plotH}
              fill="#0B111E"
              stroke="#1E293B"
              strokeWidth={1}
            />

            {[48000, 49000, 50100, 51000, 52100, 53000].map((level) => {
              const y = yFor(level);
              if (y < padTop || y > padTop + plotH) return null;
              return (
                <g key={level}>
                  <line
                    x1={padLeft}
                    x2={padLeft + plotW}
                    y1={y}
                    y2={y}
                    stroke="#1E293B"
                    strokeDasharray="2 4"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ${(level / 1000).toFixed(1)}k
                  </text>
                </g>
              );
            })}

            {/* Target & Lock Reference Lines */}
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={yTarget}
              y2={yTarget}
              stroke="#38BDF8"
              strokeWidth={1.2}
              strokeDasharray="5 4"
            />
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={yLock}
              y2={yLock}
              stroke="#F59E0B"
              strokeWidth={1}
              strokeDasharray="3 4"
              strokeOpacity={0.6}
            />
            <line
              x1={padLeft}
              x2={padLeft + plotW}
              y1={yFloorLock}
              y2={yFloorLock}
              stroke="#475569"
              strokeWidth={1}
              strokeDasharray="2 3"
            />

            {floorPath && (
              <path
                d={floorPath}
                fill="none"
                stroke="#F43F5E"
                strokeWidth={2}
              />
            )}
            {balancePath && (
              <path
                d={balancePath}
                fill="none"
                stroke="#10B981"
                strokeWidth={2.2}
              />
            )}

            {history.map((pt, idx) => (
              <g key={pt.date}>
                <circle
                  cx={xFor(idx)}
                  cy={yFor(pt.eodBalance)}
                  r={4}
                  fill="#10B981"
                  stroke="#0B111E"
                  strokeWidth={1.5}
                />
                <circle
                  cx={xFor(idx)}
                  cy={yFor(pt.eodDrawdownFloor)}
                  r={3.5}
                  fill="#F43F5E"
                  stroke="#0B111E"
                  strokeWidth={1.5}
                />
                <text
                  x={xFor(idx)}
                  y={height - 10}
                  textAnchor="middle"
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  Day {pt.dayNumber}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </section>

      {/* Pass Path Simulator */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] p-5">
        <div className="mb-4">
          <h2 className="font-display text-base font-semibold text-slate-100">
            Pass Path &amp; Consistency Simulator
          </h2>
          <p className="text-xs text-slate-400">
            Estimate how many sessions it takes to lock your $50,100 floor and clear $53,000 using your personal -$400 daily loss cap.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <label htmlFor="sim-win" className="text-slate-300">
                  Average Green Day Profit
                </label>
                <span className="font-mono font-medium text-emerald-400 tabular-nums">
                  +${avgDailyWin}/day
                </span>
              </div>
              <input
                id="sim-win"
                type="range"
                min={250}
                max={1400}
                step={50}
                value={avgDailyWin}
                onChange={(e) => setAvgDailyWin(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              {projection.exceedsRule && (
                <div className="mt-1 text-xs text-rose-400">
                  Warning: +${avgDailyWin} exceeds your ${metrics.maxSingleDayAllowed} consistency cap ({settings.consistencyCapPct}%). Keep green days at or below ${metrics.safeDailyProfitLock}.
                </div>
              )}
            </div>

            <div>
              <div className="mb-1 flex justify-between text-xs">
                <label htmlFor="sim-rate" className="text-slate-300">
                  Winning Session Rate
                </label>
                <span className="font-mono font-medium text-sky-400 tabular-nums">
                  {winDayRate}% green days
                </span>
              </div>
              <input
                id="sim-rate"
                type="range"
                min={40}
                max={80}
                step={5}
                value={winDayRate}
                onChange={(e) => setWinDayRate(Number(e.target.value))}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800">
            <div className="bg-[#0B111E] p-4">
              <div className="text-xs text-slate-400">Expected Daily Net</div>
              <div
                className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                  projection.expectedDailyNet > 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {projection.expectedDailyNet >= 0 ? '+' : '-'}$
                {Math.abs(projection.expectedDailyNet)}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">After -$400 red days</div>
            </div>

            <div className="bg-[#0B111E] p-4">
              <div className="text-xs text-slate-400">Sessions to $52.1k Lock</div>
              <div className="mt-1 font-mono text-xl font-semibold text-amber-400 tabular-nums">
                {projection.daysToLock === null ? 'N/A' : `${projection.daysToLock}d`}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Stops trailing floor</div>
            </div>

            <div className="bg-[#0B111E] p-4">
              <div className="text-xs text-slate-400">Sessions to Pass</div>
              <div className="mt-1 font-mono text-xl font-semibold text-sky-400 tabular-nums">
                {projection.daysToPass === null ? 'N/A' : `${projection.daysToPass}d`}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                To ${metrics.effectiveTargetBalance.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
