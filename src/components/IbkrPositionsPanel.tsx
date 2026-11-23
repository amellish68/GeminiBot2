import React from 'react';
import { Activity, CheckCircle2, Clock, PlusCircle, X } from 'lucide-react';
import type { IbkrClosedFill, IbkrPortfolioSnapshot, InstrumentSymbol } from '../types/trading';
import { getEffectiveSpec } from '../utils/strategyEngine';

interface IbkrPositionsPanelProps {
  provider: 'ibkr' | 'alpaca';
  portfolio: IbkrPortfolioSnapshot | null;
  portfolioNeedsUpgrade: boolean;
  currentSymbol: InstrumentSymbol;
  currentPrice: number;
  autoLogCloses: boolean;
  loggedExecIds: string[];
  onToggleAutoLog: (enabled: boolean) => void;
  onManualLogFill: (fill: IbkrClosedFill) => void;
  onOpenFeedModal: () => void;
  onCancelOrder?: (orderId: string) => void;
  onClosePosition?: (symbol: string) => void;
}

function formatSignedUsd(val: number): string {
  const abs = Math.abs(val).toFixed(2);
  return val >= 0 ? `+$${abs}` : `-$${abs}`;
}

function formatOrderId(id: string | number): string {
  const s = String(id);
  return s.length > 10 ? `#${s.slice(0, 6)}` : `#${s}`;
}

export const IbkrPositionsPanel: React.FC<IbkrPositionsPanelProps> = ({
  provider,
  portfolio,
  portfolioNeedsUpgrade,
  currentSymbol,
  currentPrice,
  autoLogCloses,
  loggedExecIds,
  onToggleAutoLog,
  onManualLogFill,
  onOpenFeedModal,
  onCancelOrder,
  onClosePosition,
}) => {
  if (provider === 'ibkr' && portfolioNeedsUpgrade) {
    return (
      <section className="rounded-lg border border-amber-500/35 bg-[#111827] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-amber-200">
          Live positions, unrealized P&amp;L, and automatic TP/SL close detection require the updated local bridge script (<code className="font-mono">/portfolio</code> endpoint).
        </div>
        <button
          type="button"
          onClick={onOpenFeedModal}
          className="rounded border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-500/25 whitespace-nowrap"
        >
          Update IBKR Bridge Script
        </button>
      </section>
    );
  }

  if (!portfolio) return null;
  if (provider === 'alpaca' && portfolio.configured === false) return null;

  const isAlpaca = provider === 'alpaca';
  const unitLabel = isAlpaca ? 'shares' : 'micros';

  const totalUnrealized = portfolio.positions.reduce((acc, p) => {
    if (p.unrealizedPnl !== null) return acc + p.unrealizedPnl;
    const spec = getEffectiveSpec(p.symbol as InstrumentSymbol, unitLabel);
    if (spec && p.symbol === currentSymbol) {
      return acc + (currentPrice - p.avgEntryPrice) * p.position * spec.pointValue;
    }
    return acc;
  }, 0);

  return (
    <section className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Activity className="h-4 w-4 text-sky-400 shrink-0" />
          <h2 className="font-display text-sm font-semibold text-slate-100">
            {isAlpaca
              ? 'Alpaca Paper Live Positions & Open Brackets'
              : 'IBKR Paper Live Positions & Open Brackets'}
          </h2>
          {portfolio.account && (
            <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-300">
              {portfolio.account}
            </span>
          )}
          {isAlpaca && portfolio.equity !== null && portfolio.equity !== undefined && (
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              Equity ${portfolio.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {portfolio.positions.length > 0 && (
            <div className="text-xs text-slate-400">
              Open P&amp;L:{' '}
              <span
                className={`font-mono font-semibold tabular-nums ${
                  totalUnrealized >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatSignedUsd(totalUnrealized)}
              </span>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoLogCloses}
              onChange={(e) => onToggleAutoLog(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
            />
            <span>Auto-log TP / SL closes</span>
          </label>
        </div>
      </div>

      {/* Open Positions */}
      <div className="space-y-2">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Open Positions ({portfolio.positions.length})
        </div>
        {portfolio.positions.length === 0 ? (
          <div className="rounded-md border border-slate-800 bg-[#0B111E] px-3.5 py-2.5 text-xs text-slate-400">
            Flat — no open paper positions right now.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-slate-800 bg-[#0B111E]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] text-slate-400">
                <tr>
                  <th className="px-3.5 py-2 font-medium">{isAlpaca ? 'Ticker' : 'Contract'}</th>
                  <th className="px-3.5 py-2 font-medium">Side / Qty</th>
                  <th className="px-3.5 py-2 font-medium text-right">Avg Entry</th>
                  <th className="px-3.5 py-2 font-medium text-right">Mark</th>
                  <th className="px-3.5 py-2 font-medium text-right">Target (TP)</th>
                  <th className="px-3.5 py-2 font-medium text-right">Stop (SL)</th>
                  <th className="px-3.5 py-2 font-medium text-right">Unrealized P&amp;L</th>
                  {!isAlpaca && (
                    <th className="px-3.5 py-2 font-medium text-right">Session Realized</th>
                  )}
                  {isAlpaca && onClosePosition && (
                    <th className="px-3.5 py-2 font-medium text-right">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono tabular-nums">
                {portfolio.positions.map((p) => {
                  const isLong = p.position > 0;
                  const spec = getEffectiveSpec(
                    (['MNQ', 'MES', 'MGC', 'MYM'].includes(p.symbol)
                      ? p.symbol
                      : currentSymbol) as InstrumentSymbol,
                    unitLabel
                  );
                  const decimals = isAlpaca ? 2 : spec.decimals;
                  const fallbackPnl =
                    spec && p.symbol === currentSymbol
                      ? (currentPrice - p.avgEntryPrice) * p.position * spec.pointValue
                      : null;
                  const displayUnrealized = p.unrealizedPnl ?? fallbackPnl;
                  const isEstimated = p.unrealizedPnl === null && fallbackPnl !== null;

                  const contractOrders = portfolio.openOrders.filter(
                    (o) => o.localSymbol === p.localSymbol || o.symbol === p.symbol
                  );
                  const tpPrices = contractOrders
                    .filter((o) => o.role === 'TP1' || o.role === 'TP2')
                    .map((o) => o.lmtPrice ?? o.auxPrice)
                    .filter((v): v is number => v !== null);
                  const slPrices = contractOrders
                    .filter((o) => o.role === 'SL')
                    .map((o) => o.auxPrice ?? o.lmtPrice)
                    .filter((v): v is number => v !== null);
                  const uniqueTps = Array.from(new Set(tpPrices));
                  const uniqueSls = Array.from(new Set(slPrices));

                  return (
                    <tr key={p.localSymbol}>
                      <td className="px-3.5 py-2.5 font-semibold text-slate-100">
                        {p.localSymbol}
                      </td>
                      <td
                        className={`px-3.5 py-2.5 font-semibold ${
                          isLong ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isLong ? `LONG ${Math.abs(p.position)}` : `SHORT ${Math.abs(p.position)}`}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-slate-200">
                        {p.avgEntryPrice.toFixed(decimals)}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-slate-300">
                        {p.marketPrice !== null ? p.marketPrice.toFixed(decimals) : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-emerald-400">
                        {uniqueTps.length > 0
                          ? uniqueTps.map((v) => v.toFixed(decimals)).join(' / ')
                          : '—'}
                      </td>
                      <td className="px-3.5 py-2.5 text-right text-rose-400">
                        {uniqueSls.length > 0
                          ? uniqueSls.map((v) => v.toFixed(decimals)).join(' / ')
                          : '—'}
                      </td>
                      <td
                        className={`px-3.5 py-2.5 text-right font-semibold ${
                          displayUnrealized === null
                            ? 'text-slate-400'
                            : displayUnrealized >= 0
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                        }`}
                      >
                        {displayUnrealized !== null
                          ? `${formatSignedUsd(displayUnrealized)}${isEstimated ? ' (est)' : ''}`
                          : '—'}
                      </td>
                      {!isAlpaca && (
                        <td
                          className={`px-3.5 py-2.5 text-right ${
                            p.realizedPnl === null
                              ? 'text-slate-400'
                              : p.realizedPnl >= 0
                                ? 'text-emerald-300'
                                : 'text-rose-300'
                          }`}
                        >
                          {p.realizedPnl !== null ? formatSignedUsd(p.realizedPnl) : '—'}
                        </td>
                      )}
                      {isAlpaca && onClosePosition && (
                        <td className="px-3.5 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => onClosePosition(p.localSymbol)}
                            className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-sans text-[11px] font-medium text-rose-200 hover:bg-rose-500/20"
                          >
                            Close
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Working Open Orders & Closed Fills side-by-side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Working Orders ({portfolio.openOrders.length})
          </div>
          {portfolio.openOrders.length === 0 ? (
            <div className="rounded-md border border-slate-800 bg-[#0B111E] px-3.5 py-2.5 text-xs text-slate-400">
              No working orders in {isAlpaca ? 'Alpaca Paper' : 'IB Gateway'}.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 rounded-md border border-slate-800 bg-[#0B111E]">
              {portfolio.openOrders.map((o) => {
                const px = o.lmtPrice ?? o.auxPrice;
                const roleBadgeClass =
                  o.role === 'TP1' || o.role === 'TP2'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : o.role === 'SL'
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                      : 'border-sky-500/40 bg-sky-500/10 text-sky-300';

                return (
                  <div
                    key={o.orderId}
                    className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-slate-400">{formatOrderId(o.orderId)}</span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${roleBadgeClass}`}
                      >
                        {o.role}
                      </span>
                      <span className="font-mono font-medium text-slate-100 truncate">
                        {o.action} {o.remaining || o.totalQuantity} {o.localSymbol} {o.orderType}{' '}
                        {px !== null ? `@ ${px}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {o.status}
                      </span>
                      {isAlpaca && onCancelOrder && (
                        <button
                          type="button"
                          onClick={() => onCancelOrder(String(o.orderId))}
                          title="Cancel working order"
                          className="rounded border border-slate-700 bg-slate-900 p-0.5 text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
            Session Closed Fills — TP / SL Detection ({portfolio.closedFills.length})
          </div>
          {portfolio.closedFills.length === 0 ? (
            <div className="rounded-md border border-slate-800 bg-[#0B111E] px-3.5 py-2.5 text-xs text-slate-400">
              No closed fills detected yet. When a TP or SL leg fills, its realized P&amp;L and outcome appear here.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 rounded-md border border-slate-800 bg-[#0B111E]">
              {portfolio.closedFills.map((f) => {
                const isLogged = loggedExecIds.includes(f.execId);
                const outcomeClass =
                  f.outcome === 'TP1' || f.outcome === 'TP2'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : f.outcome === 'SL'
                      ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300';

                return (
                  <div
                    key={f.execId}
                    className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${outcomeClass}`}
                      >
                        {f.outcome}
                      </span>
                      <span className="font-mono text-slate-200 truncate">
                        {f.localSymbol} · {f.direction} {f.contracts} @ {f.exitPrice}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          f.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatSignedUsd(f.realizedPnl)}
                      </span>
                      {isLogged ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Logged
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onManualLogFill(f)}
                          className="flex items-center gap-1 rounded border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20"
                        >
                          <PlusCircle className="h-3 w-3" />
                          Log
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
