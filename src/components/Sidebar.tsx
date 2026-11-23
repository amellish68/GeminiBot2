import React, { useEffect, useState } from 'react';
import { CalendarPlus, CheckSquare, Square } from 'lucide-react';
import type { AccountMetrics, AccountSettings, TradeRecommendation } from '../types/trading';
import { getNySessionState } from '../utils/strategyEngine';

interface SidebarProps {
  settings: AccountSettings;
  metrics: AccountMetrics;
  recommendation: TradeRecommendation;
  checklist: Record<string, boolean>;
  onToggleChecklist: (key: string) => void;
  onUpdateSettings: (patch: Partial<AccountSettings>) => void;
  onQuickLog: (outcome: 'TP1' | 'TP2' | 'SL') => void;
  onLogCustomPnl: (pnl: number) => void;
  onAdvanceDay: () => void;
}

const CHECKLIST_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'window', label: 'Trading NY Open (9:30–11:30 AM ET)' },
  { key: 'hardStop', label: 'Hard bracket SL placed before entry' },
  { key: 'noAvgDown', label: 'Zero averaging down on losers' },
  { key: 'capLocked', label: 'Platform profit lock set below ceiling' },
];

export const Sidebar: React.FC<SidebarProps> = ({
  settings,
  metrics,
  recommendation,
  checklist,
  onToggleChecklist,
  onUpdateSettings,
  onQuickLog,
  onLogCustomPnl,
  onAdvanceDay,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [customPnl, setCustomPnl] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const session = getNySessionState(now);
  const canLogRecommended = recommendation.totalContracts > 0;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(customPnl);
    if (!Number.isFinite(val) || val === 0) return;
    onLogCustomPnl(val);
    setCustomPnl('');
  };

  return (
    <aside className="w-full shrink-0 border-b border-slate-800 bg-[#0F172A] p-5 lg:w-[272px] lg:border-b-0 lg:border-r">
      {/* Live NY Session Window */}
      <div className="pb-5 border-b border-slate-800/80">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>New York Clock</span>
          <span className="font-mono font-medium text-slate-200 tabular-nums">
            {session.etTimeFormatted}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-200">{session.windowLabel}</span>
        </div>
        <div className="mt-1.5 text-xs">
          {session.inOptimalWindow ? (
            <span className="font-medium text-emerald-400">Prime Window Active</span>
          ) : (
            <span className="font-medium text-amber-400">Outside 9:30–11:30 Prime</span>
          )}
        </div>
      </div>

      {/* LucidFlex 50K Parameters */}
      <div className="py-5 border-b border-slate-800/80 space-y-4">
        <h2 className="text-xs font-semibold tracking-wide text-slate-300">
          LucidFlex 50K Parameters
        </h2>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Consistency Rule</span>
            <span className="font-mono text-slate-200 tabular-nums">
              Max ${metrics.maxSingleDayAllowed}/day
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => onUpdateSettings({ consistencyCapPct: 40 })}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                settings.consistencyCapPct === 40
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              40% Standard
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ consistencyCapPct: 50 })}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                settings.consistencyCapPct === 50
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              50% Add-on
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Daily Loss Limit (DLL)</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {settings.dllEnabled ? '$1,200 Soft' : 'Off'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => onUpdateSettings({ dllEnabled: true })}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                settings.dllEnabled
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DLL On
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ dllEnabled: false })}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                !settings.dllEnabled
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DLL Off
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <label htmlFor="risk-slider">Base Risk Per Trade</label>
            <span className="font-mono font-medium text-sky-400 tabular-nums">
              ${settings.baseRiskPerTrade}
            </span>
          </div>
          <input
            id="risk-slider"
            type="range"
            min={100}
            max={250}
            step={25}
            value={settings.baseRiskPerTrade}
            onChange={(e) => onUpdateSettings({ baseRiskPerTrade: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
          <div className="mt-1 flex justify-between text-[11px] font-mono text-slate-500 tabular-nums">
            <span>$100</span>
            <span>$175 Ideal</span>
            <span>$250</span>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Max Trades / Day</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {settings.maxTradesPerDay === 0
                ? '∞ (Test Mode)'
                : `${settings.maxTradesPerDay} / day`}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            {[2, 3, 5, 10, 0].map((limit) => (
              <button
                key={limit}
                type="button"
                onClick={() => onUpdateSettings({ maxTradesPerDay: limit })}
                title={limit === 0 ? 'Unlimited trades (for testing)' : `Max ${limit} trades per day`}
                className={`rounded px-1.5 py-1.5 font-mono text-[11px] font-medium transition-colors whitespace-nowrap ${
                  settings.maxTradesPerDay === limit
                    ? limit === 0
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {limit === 0 ? '∞' : limit}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Discipline Checklist */}
      <div className="py-5 border-b border-slate-800/80">
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-300">
          Pre-Trade Discipline
        </h2>
        <div className="space-y-2.5">
          {CHECKLIST_ITEMS.map((item) => {
            const checked = Boolean(checklist[item.key]);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onToggleChecklist(item.key)}
                className="flex w-full items-start gap-2.5 text-left text-xs transition-colors hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
              >
                {checked ? (
                  <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : (
                  <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                )}
                <span className={checked ? 'text-slate-200' : 'text-slate-400'}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Execution Logger (Tracks manual trades) */}
      <div className="pt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-slate-300">
            Log Manual Outcome
          </h2>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
            {settings.activeDate}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            disabled={!canLogRecommended}
            onClick={() => onQuickLog('TP1')}
            className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            +TP1
          </button>
          <button
            type="button"
            disabled={!canLogRecommended}
            onClick={() => onQuickLog('TP2')}
            className="rounded border border-emerald-500/40 bg-emerald-500/20 px-2 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            +TP2
          </button>
          <button
            type="button"
            disabled={!canLogRecommended}
            onClick={() => onQuickLog('SL')}
            className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-2 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            -Stop
          </button>
        </div>

        <form onSubmit={handleCustomSubmit} className="flex gap-1.5">
          <input
            type="number"
            step="1"
            value={customPnl}
            onChange={(e) => setCustomPnl(e.target.value)}
            placeholder="Custom $ P&L"
            className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            Log
          </button>
        </form>

        <button
          type="button"
          onClick={onAdvanceDay}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 whitespace-nowrap"
        >
          <CalendarPlus className="h-3.5 w-3.5 text-sky-400" />
          Close Session &amp; Advance Day
        </button>
      </div>
    </aside>
  );
};
