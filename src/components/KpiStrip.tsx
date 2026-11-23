import React from 'react';
import type { AccountMetrics, AccountSettings } from '../types/trading';

interface KpiStripProps {
  metrics: AccountMetrics;
  settings: AccountSettings;
}

function formatMoney(val: number, showSign = false): string {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  if (val < 0) return `-$${abs}`;
  if (showSign && val > 0) return `+$${abs}`;
  return `$${abs}`;
}

export const KpiStrip: React.FC<KpiStripProps> = ({ metrics, settings }) => {
  const consistencyUsedPct = Math.min(
    100,
    Math.max(0, (metrics.todayNetPnl / metrics.maxSingleDayAllowed) * 100)
  );
  const dailyLossUsedPct = Math.min(
    100,
    Math.max(0, (Math.abs(Math.min(0, metrics.todayNetPnl)) / settings.personalDailyLossCap) * 100)
  );

  return (
    <section className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
      {/* 1. Balance & Progress */}
      <div className="bg-[#111827] p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Account Balance</span>
          <span className="font-mono text-slate-400 tabular-nums">
            Target {formatMoney(metrics.effectiveTargetBalance)}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {formatMoney(metrics.currentBalance)}
          </span>
          <span
            className={`font-mono text-xs font-medium tabular-nums ${
              metrics.totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatMoney(metrics.totalNetPnl, true)} ({metrics.progressToTargetPct}%)
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${metrics.progressToTargetPct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-400">{metrics.phase}</div>
      </div>

      {/* 2. EOD Trailing Drawdown Floor */}
      <div className="bg-[#111827] p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>EOD Drawdown Floor</span>
          <span
            className={`font-medium ${
              metrics.isDrawdownLocked ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {metrics.isDrawdownLocked ? 'Locked at $50,100' : 'Trailing at EOD'}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {formatMoney(metrics.currentEodFloor)}
          </span>
          <span className="font-mono text-xs font-medium text-sky-400 tabular-nums">
            {formatMoney(metrics.drawdownBufferRemaining)} buffer
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-sky-500 transition-all duration-300"
            style={{
              width: `${Math.min(100, (metrics.drawdownBufferRemaining / 2900) * 100)}%`,
            }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {metrics.isDrawdownLocked
            ? 'Permanent floor reached (EOD >= $52,100)'
            : 'Locks permanently once EOD reaches $52,100'}
        </div>
      </div>

      {/* 3. Today's Consistency Headroom */}
      <div className="bg-[#111827] p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Today&apos;s Consistency Cap ({settings.consistencyCapPct}%)</span>
          <span
            className={`font-medium ${
              metrics.consistencyStatus === 'EXCEEDED'
                ? 'text-rose-400'
                : metrics.consistencyStatus === 'WARNING'
                  ? 'text-amber-400'
                  : 'text-emerald-400'
            }`}
          >
            {metrics.consistencyStatus === 'EXCEEDED'
              ? 'Target Inflated'
              : metrics.consistencyStatus === 'WARNING'
                ? 'At Safe Lock'
                : 'Within Safe Zone'}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {formatMoney(metrics.todayNetPnl, true)}
          </span>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            {formatMoney(metrics.remainingConsistencySafe)} left to lock
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              metrics.consistencyStatus === 'EXCEEDED'
                ? 'bg-rose-500'
                : metrics.consistencyStatus === 'WARNING'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${consistencyUsedPct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Safe lock ${metrics.safeDailyProfitLock} · Hard cap ${metrics.maxSingleDayAllowed}
        </div>
      </div>

      {/* 4. Daily Loss & Trade Count Budget */}
      <div className="bg-[#111827] p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Daily Risk Budget</span>
          <span className="font-mono text-slate-300 tabular-nums">
            {metrics.todayTradesCount}/{settings.maxTradesPerDay === 0 ? '∞' : settings.maxTradesPerDay} trades today
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-semibold text-slate-100 tabular-nums">
            {formatMoney(metrics.remainingPersonalLoss)}
          </span>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            of ${settings.personalDailyLossCap} stop
          </span>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              dailyLossUsedPct >= 80 ? 'bg-rose-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.max(4, 100 - dailyLossUsedPct)}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-400">
          {settings.dllEnabled
            ? `Account DLL remaining: ${formatMoney(metrics.remainingDll)}`
            : 'Account DLL disabled · Using personal -$400 cap'}
        </div>
      </div>
    </section>
  );
};
