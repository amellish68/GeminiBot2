import React, { useState } from 'react';
import { Copy, Check, RefreshCw, AlertTriangle, ShieldCheck, Ban, Cable, Send } from 'lucide-react';
import type {
  DataSourceMode,
  InstrumentSymbol,
  MarketSnapshot,
  SetupType,
  TradeDirection,
  TradeRecommendation,
} from '../types/trading';
import { getEffectiveSpec } from '../utils/strategyEngine';

interface RecommendationPanelProps {
  market: MarketSnapshot;
  dataSource: DataSourceMode;
  bridgeNote?: string | null;
  alpacaConfigured?: boolean;
  orderFeedback?: { ok: boolean; message: string } | null;
  loadingMarket: boolean;
  setup: SetupType;
  directionChoice: TradeDirection;
  customEntry: string;
  customStopPts: string;
  tradovateSync: {
    price: string;
    orbHigh: string;
    orbLow: string;
    vwap: string;
  };
  recommendation: TradeRecommendation;
  onChangeDataSource: (mode: DataSourceMode) => void;
  onOpenFeedModal: () => void;
  onRequestPaperOrder: () => void;
  onChangeSymbol: (symbol: InstrumentSymbol) => void;
  onChangeSetup: (setup: SetupType) => void;
  onChangeDirection: (dir: TradeDirection) => void;
  onChangeCustomEntry: (val: string) => void;
  onChangeCustomStopPts: (val: string) => void;
  onChangeTradovateSync: (patch: Partial<{ price: string; orbHigh: string; orbLow: string; vwap: string }>) => void;
  onRefreshMarket: () => void;
  onClearOverrides: () => void;
}

const SYMBOLS: InstrumentSymbol[] = ['MNQ', 'MES', 'MGC', 'MYM'];

const SETUPS: Array<{ id: SetupType; label: string }> = [
  { id: 'ORB_RETEST', label: 'ORB + Retest' },
  { id: 'LIQUIDITY_SWEEP', label: 'Liquidity Sweep' },
  { id: 'VWAP_PULLBACK', label: 'VWAP Pullback' },
];

const DATA_SOURCES: Array<{ id: DataSourceMode; label: string }> = [
  { id: 'proxy', label: 'Public Proxy' },
  { id: 'alpaca', label: 'Alpaca Paper' },
  { id: 'ibkr', label: 'IBKR Paper' },
  { id: 'tradovate', label: 'Tradovate Live' },
];

export const RecommendationPanel: React.FC<RecommendationPanelProps> = ({
  market,
  dataSource,
  bridgeNote,
  alpacaConfigured,
  orderFeedback,
  loadingMarket,
  setup,
  directionChoice,
  customEntry,
  customStopPts,
  tradovateSync,
  recommendation,
  onChangeDataSource,
  onOpenFeedModal,
  onRequestPaperOrder,
  onChangeSymbol,
  onChangeSetup,
  onChangeDirection,
  onChangeCustomEntry,
  onChangeCustomStopPts,
  onChangeTradovateSync,
  onRefreshMarket,
  onClearOverrides,
}) => {
  const [copied, setCopied] = useState(false);
  const spec = getEffectiveSpec(market.symbol, market.unitLabel);
  const isShares = market.unitLabel === 'shares';
  const tickerLabel = market.displaySymbol ?? recommendation.symbol;
  const unitLabel = isShares ? 'shares' : 'micros';
  const unitSingular = isShares ? 'share' : 'micro';

  const handleCopyLevels = async () => {
    const lines = [
      `LucidPlan 50K Order — ${tickerLabel} (${recommendation.direction})`,
      `Setup: ${recommendation.setupTitle}`,
      `Recommended Size: ${recommendation.totalContracts} ${unitLabel} (${recommendation.tp1Contracts} at TP1, ${recommendation.runnerContracts} runner)`,
      `Suggested Entry: ${recommendation.entryPrice.toFixed(spec.decimals)}`,
      `Stop Loss: ${recommendation.stopLossPrice.toFixed(spec.decimals)} (${recommendation.stopPoints} pts / -$${recommendation.totalRiskDollars})`,
      `TP1 Target: ${recommendation.tp1Price.toFixed(spec.decimals)} (+$${recommendation.projectedTp1Dollars})`,
      ...(recommendation.runnerContracts > 0
        ? [`TP2 Runner: ${recommendation.tp2Price.toFixed(spec.decimals)} (+$${recommendation.projectedTp2Dollars})`]
        : []),
      `Projected Total Profit: +$${recommendation.totalProjectedDollars} (${recommendation.rewardToRisk}R)`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const sourceSummary =
    market.source === 'alpaca-paper'
      ? `Alpaca Paper Cloud (${market.displaySymbol ?? 'ETF'} Proxy)`
      : market.source === 'ibkr-delayed'
        ? 'IBKR Paper (Delayed 10–15m)'
        : market.source === 'ibkr-live'
          ? 'IBKR Live CME Stream'
          : market.source === 'tradovate-webhook'
            ? 'TradingView / Tradovate Webhook'
            : market.source === 'manual'
              ? 'Tradovate Screen Sync (Manual)'
              : market.source === 'waiting'
                ? market.feedDelayLabel ?? 'Waiting for Bridge Feed'
                : market.source === 'live'
                  ? market.displaySymbol
                    ? `Public ${market.displaySymbol} ETF Feed`
                    : 'Public CME Proxy'
                  : 'Session Reference (Proxy Fallback)';

  const appStandaloneUrl = typeof window !== 'undefined' ? window.location.href : '#';
  const canSendIbkrOrder =
    dataSource === 'ibkr' &&
    !bridgeNote &&
    (market.source === 'ibkr-delayed' || market.source === 'ibkr-live') &&
    recommendation.totalContracts > 0;
  const canSendAlpacaOrder =
    dataSource === 'alpaca' &&
    Boolean(alpacaConfigured) &&
    recommendation.totalContracts > 0;

  return (
    <section className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-5">
      {/* Data Source Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-400">Market Feed:</span>
          <div className="flex items-center gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            {DATA_SOURCES.map((ds) => (
              <button
                key={ds.id}
                type="button"
                onClick={() => onChangeDataSource(ds.id)}
                className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  dataSource === ds.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {ds.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400">
            Status: <span className="text-slate-200">{sourceSummary}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {(dataSource === 'ibkr' || dataSource === 'tradovate') && (
            <button
              type="button"
              onClick={onOpenFeedModal}
              className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/20 whitespace-nowrap"
            >
              <Cable className="h-3.5 w-3.5" />
              {dataSource === 'ibkr' ? 'IBKR Bridge Script' : 'Webhook Setup'}
            </button>
          )}
          <button
            type="button"
            onClick={onRefreshMarket}
            disabled={loadingMarket}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingMarket ? 'animate-spin' : ''}`} />
            {loadingMarket ? 'Updating...' : 'Refresh Quote'}
          </button>
        </div>
      </div>

      {dataSource === 'ibkr' && bridgeNote && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
          <span>{bridgeNote}</span>
          <a
            href={appStandaloneUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 font-medium text-amber-100 hover:bg-amber-500/30 whitespace-nowrap shrink-0"
          >
            Open App in Standalone Tab
          </a>
        </div>
      )}

      {dataSource === 'alpaca' && alpacaConfigured === false && (
        <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200 space-y-1">
          <div className="font-medium text-amber-100">
            Alpaca Paper API secrets not configured yet
          </div>
          <div>
            In AI Studio, open <strong>Settings → Secrets</strong> and add <code className="font-mono text-amber-100">APCA_API_KEY_ID</code> and <code className="font-mono text-amber-100">APCA_API_SECRET_KEY</code> from your Alpaca Paper dashboard (keys stay strictly on the server; zero local software required). Futures map to ETF proxies: <code className="font-mono">MNQ→QQQ</code>, <code className="font-mono">MES→SPY</code>, <code className="font-mono">MGC→GLD</code>, <code className="font-mono">MYM→DIA</code>.
          </div>
        </div>
      )}

      {(dataSource === 'ibkr' || dataSource === 'alpaca') && orderFeedback && (
        <div
          className={`rounded-md border px-3.5 py-2.5 text-xs ${
            orderFeedback.ok
              ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
          }`}
        >
          {orderFeedback.message}
        </div>
      )}

      {/* Tradovate Live Screen Sync Strip */}
      {dataSource === 'tradovate' && (
        <div className="rounded-md border border-slate-800 bg-[#0B111E] p-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-200">
              Tradovate Live Screen Sync (Type levels from your LucidFlex Tradovate chart or use Webhook)
            </span>
            <span className="text-[11px] text-slate-400">
              Updates chart, Entry, SL, TP &amp; Micro sizing immediately
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="tv-price" className="block text-[11px] text-slate-400 mb-1">
                Live {market.symbol} Price
              </label>
              <input
                id="tv-price"
                type="number"
                step={spec.tickSize}
                value={tradovateSync.price}
                onChange={(e) => onChangeTradovateSync({ price: e.target.value })}
                placeholder={market.currentPrice.toFixed(spec.decimals)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="tv-orbh" className="block text-[11px] text-slate-400 mb-1">
                9:30–9:45 ORB High
              </label>
              <input
                id="tv-orbh"
                type="number"
                step={spec.tickSize}
                value={tradovateSync.orbHigh}
                onChange={(e) => onChangeTradovateSync({ orbHigh: e.target.value })}
                placeholder={market.orbHigh.toFixed(spec.decimals)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="tv-orbl" className="block text-[11px] text-slate-400 mb-1">
                9:30–9:45 ORB Low
              </label>
              <input
                id="tv-orbl"
                type="number"
                step={spec.tickSize}
                value={tradovateSync.orbLow}
                onChange={(e) => onChangeTradovateSync({ orbLow: e.target.value })}
                placeholder={market.orbLow.toFixed(spec.decimals)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="tv-vwap" className="block text-[11px] text-slate-400 mb-1">
                Session VWAP
              </label>
              <input
                id="tv-vwap"
                type="number"
                step={spec.tickSize}
                value={tradovateSync.vwap}
                onChange={(e) => onChangeTradovateSync({ vwap: e.target.value })}
                placeholder={market.vwap.toFixed(spec.decimals)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: Instrument, Setup, Direction */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            {SYMBOLS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => onChangeSymbol(sym)}
                className={`rounded px-2.5 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                  market.symbol === sym
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sym}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            {SETUPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChangeSetup(s.id)}
                className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  setup === s.id
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md bg-slate-900 p-1 border border-slate-800">
            {(['AUTO', 'LONG', 'SHORT'] as TradeDirection[]).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => onChangeDirection(dir)}
                className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  directionChoice === dir
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dir === 'AUTO' ? 'Auto Bias' : dir === 'LONG' ? 'Long' : 'Short'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Ticket Header + Recommended Sizing */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{dataSource === 'alpaca' ? 'Alpaca Paper Cloud Ticket' : 'Manual Execution Ticket'}</span>
            <span aria-hidden="true">·</span>
            <span>{spec.name}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-300 tabular-nums">
              ${spec.pointValue}/{isShares ? '$1 move per share' : 'pt per micro'}
            </span>
          </div>
          <h1 className="mt-1 font-display text-xl font-bold text-slate-100 text-balance">
            {recommendation.setupTitle} —{' '}
            <span
              className={
                recommendation.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'
              }
            >
              {recommendation.direction}
            </span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{recommendation.rationale}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {recommendation.status === 'STAND_DOWN' ? (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-200">
              <Ban className="h-4 w-4 text-rose-400 shrink-0" />
              <span>Stand Down — 0 {isShares ? 'Shares' : 'Contracts'}</span>
            </div>
          ) : recommendation.status === 'CAUTION' ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-medium text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>Target Capped for Consistency</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-medium text-emerald-200">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Cleared Within Rules</span>
            </div>
          )}

          {dataSource === 'alpaca' && (
            <button
              type="button"
              onClick={onRequestPaperOrder}
              disabled={!canSendAlpacaOrder}
              title={
                canSendAlpacaOrder
                  ? `Review and submit paper bracket on ${tickerLabel} to Alpaca Paper`
                  : recommendation.totalContracts <= 0
                    ? 'Cannot submit when recommended size is 0'
                    : 'Add APCA_API_KEY_ID and APCA_API_SECRET_KEY in AI Studio Settings -> Secrets first'
              }
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Send Paper Bracket to Alpaca
            </button>
          )}

          {dataSource === 'ibkr' && (
            <button
              type="button"
              onClick={onRequestPaperOrder}
              disabled={!canSendIbkrOrder}
              title={
                canSendIbkrOrder
                  ? 'Review and submit paper bracket order to IBKR Gateway (DU* paper account)'
                  : recommendation.totalContracts <= 0
                    ? 'Cannot submit when recommended size is 0 contracts'
                    : 'Connect to local IBKR bridge (127.0.0.1:8765) in standalone tab first'
              }
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              Send Paper Bracket to IBKR
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyLevels}
            className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-500 whitespace-nowrap shrink-0"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Levels Copied' : 'Copy Order Levels'}
          </button>
        </div>
      </div>

      {/* Stand-Down Notice if triggered */}
      {recommendation.status === 'STAND_DOWN' && recommendation.standDownReason && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3.5 text-sm text-rose-200">
          {recommendation.standDownReason}
        </div>
      )}

      {/* 5-Column Order Parameter Readout */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-[#0B111E] p-4">
          <div className="text-xs text-slate-400">Recommended Size</div>
          <div className="mt-1 font-mono text-2xl font-bold text-sky-400 tabular-nums">
            {recommendation.totalContracts} {tickerLabel}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {recommendation.totalContracts === 0
              ? 'No position allowed'
              : recommendation.runnerContracts > 0
                ? `Scale ${recommendation.tp1Contracts} @ TP1 · ${recommendation.runnerContracts} runner`
                : `Single target full exit (${unitLabel})`}
          </div>
        </div>

        <div className="bg-[#0B111E] p-4">
          <div className="text-xs text-slate-400">Suggested Entry (Limit)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {recommendation.entryPrice.toFixed(spec.decimals)}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-400 tabular-nums">
            Zone {recommendation.entryZoneLow.toFixed(spec.decimals)}–{recommendation.entryZoneHigh.toFixed(spec.decimals)}
          </div>
        </div>

        <div className="bg-[#0B111E] p-4">
          <div className="text-xs text-slate-400">Suggested Stop Loss</div>
          <div className="mt-1 font-mono text-2xl font-bold text-rose-400 tabular-nums">
            {recommendation.stopLossPrice.toFixed(spec.decimals)}
          </div>
          <div className="mt-1 font-mono text-xs text-rose-300/90 tabular-nums">
            {isShares ? `$${recommendation.stopPoints.toFixed(2)}/sh` : `${recommendation.stopPoints} pts`} · -${recommendation.totalRiskDollars.toFixed(0)} max risk
          </div>
        </div>

        <div className="bg-[#0B111E] p-4">
          <div className="text-xs text-slate-400">TP1 (Scale Out &amp; Move BE)</div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {recommendation.tp1Price.toFixed(spec.decimals)}
          </div>
          <div className="mt-1 font-mono text-xs text-emerald-300/90 tabular-nums">
            +${recommendation.projectedTp1Dollars.toFixed(0)} on {recommendation.tp1Contracts} {recommendation.tp1Contracts === 1 ? unitSingular : unitLabel}
          </div>
        </div>

        <div className="bg-[#0B111E] p-4">
          <div className="text-xs text-slate-400">
            {recommendation.runnerContracts > 0 ? 'TP2 Runner & Total Profit' : 'Projected Profit'}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold text-emerald-300 tabular-nums">
            +${recommendation.totalProjectedDollars.toFixed(0)}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-400 tabular-nums">
            {recommendation.runnerContracts > 0
              ? `TP2 @ ${recommendation.tp2Price.toFixed(spec.decimals)} · ${recommendation.rewardToRisk}R`
              : `${recommendation.rewardToRisk}R · ${recommendation.projectedShareOfTargetPct}% of target`}
          </div>
        </div>
      </div>

      {/* Optional Manual Level Fine-Tuning + Step-by-step Execution */}
      <div className="grid grid-cols-1 gap-5 pt-1 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-3 rounded-md border border-slate-800 bg-[#0B111E] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200">
              Fine-Tune Entry / Stop Distance
            </h2>
            {(customEntry || customStopPts) && (
              <button
                type="button"
                onClick={onClearOverrides}
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                Reset to Auto
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="custom-entry" className="block text-[11px] text-slate-400 mb-1">
                Override Entry Price
              </label>
              <input
                id="custom-entry"
                type="number"
                step={spec.tickSize}
                value={customEntry}
                onChange={(e) => onChangeCustomEntry(e.target.value)}
                placeholder={recommendation.entryPrice.toFixed(spec.decimals)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="custom-stop" className="block text-[11px] text-slate-400 mb-1">
                Stop Distance (Points)
              </label>
              <input
                id="custom-stop"
                type="number"
                step={spec.tickSize}
                value={customStopPts}
                onChange={(e) => onChangeCustomStopPts(e.target.value)}
                placeholder={String(recommendation.stopPoints)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            Contract sizing recalculates automatically so your total stop loss stays inside your daily risk budget.
          </div>
        </div>

        <div className="lg:col-span-7 rounded-md border border-slate-800 bg-[#0B111E] p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200">
              Manual Execution Steps
            </h2>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              If win: {recommendation.projectedShareOfTargetPct}% of target today
            </span>
          </div>
          <ol className="space-y-1.5 text-xs text-slate-300">
            {recommendation.executionSteps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono text-sky-400 tabular-nums">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};
