import React, { useMemo, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type { InstrumentSymbol, LoggedTrade } from '../types/trading';

interface TradeLogViewProps {
  trades: LoggedTrade[];
  onDeleteTrade: (id: string) => void;
}

export const TradeLogView: React.FC<TradeLogViewProps> = ({ trades, onDeleteTrade }) => {
  const [symbolFilter, setSymbolFilter] = useState<'ALL' | InstrumentSymbol>('ALL');

  const filtered = useMemo(() => {
    return trades
      .filter((t) => (symbolFilter === 'ALL' ? true : t.symbol === symbolFilter))
      .slice()
      .reverse();
  }, [trades, symbolFilter]);

  const handleExportCsv = () => {
    const header = [
      'Date',
      'Symbol',
      'Setup',
      'Direction',
      'Contracts',
      'Entry',
      'StopLoss',
      'Exit',
      'NetPnL',
      'RMultiple',
      'Outcome',
    ].join(',');
    const rows = trades.map((t) =>
      [
        t.date,
        t.symbol,
        t.setup,
        t.direction,
        t.contracts,
        t.entryPrice,
        t.stopLossPrice,
        t.exitPrice,
        t.netPnl,
        t.rMultiple,
        t.outcome,
      ].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lucidflex-50k-trades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-lg border border-slate-800 bg-[#111827] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold text-slate-100">
            Manual Trade Ledger
          </h1>
          <p className="text-xs text-slate-400">
            Every logged trade updates your EOD drawdown floor, consistency headroom, and recommended sizing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            {(['ALL', 'MNQ', 'MES', 'MGC', 'MYM'] as const).map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setSymbolFilter(sym)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  symbolFilter === sym
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={trades.length === 0}
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-800 bg-[#0B111E] py-12 text-center">
          <div className="text-sm font-medium text-slate-300">No trades logged yet</div>
          <p className="mt-1 text-xs text-slate-500">
            Use the Quick Outcome buttons (+TP1, +TP2, -Stop, or Custom P&amp;L) in the sidebar after executing manually.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Date</th>
                <th className="py-2.5 pr-4 font-medium">Contract</th>
                <th className="py-2.5 pr-4 font-medium">Side</th>
                <th className="py-2.5 pr-4 text-right font-medium">Size</th>
                <th className="py-2.5 pr-4 text-right font-medium">Entry</th>
                <th className="py-2.5 pr-4 text-right font-medium">Exit</th>
                <th className="py-2.5 pr-4 text-right font-medium">Outcome</th>
                <th className="py-2.5 pr-4 text-right font-medium">R</th>
                <th className="py-2.5 pr-4 text-right font-medium">Net P&amp;L</th>
                <th className="py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4 font-mono text-slate-300 tabular-nums">{t.date}</td>
                  <td className="py-2.5 pr-4 font-mono font-medium text-slate-100">{t.symbol}</td>
                  <td
                    className={`py-2.5 pr-4 font-medium ${
                      t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {t.direction}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-slate-300 tabular-nums">
                    {t.contracts}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-slate-300 tabular-nums">
                    {t.entryPrice}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-slate-300 tabular-nums">
                    {t.exitPrice}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-slate-400">{t.outcome}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-slate-300 tabular-nums">
                    {t.rMultiple >= 0 ? `+${t.rMultiple}` : t.rMultiple}R
                  </td>
                  <td
                    className={`py-2.5 pr-4 text-right font-mono font-semibold tabular-nums ${
                      t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {t.netPnl >= 0 ? `+$${t.netPnl.toFixed(0)}` : `-$${Math.abs(t.netPnl).toFixed(0)}`}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onDeleteTrade(t.id)}
                      aria-label="Delete trade"
                      className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
