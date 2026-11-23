import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataSourceModal } from './components/DataSourceModal';
import { EquityEodView } from './components/EquityEodView';
import { IbkrPositionsPanel } from './components/IbkrPositionsPanel';
import { KpiStrip } from './components/KpiStrip';
import { RecommendationPanel } from './components/RecommendationPanel';
import { RulebookView } from './components/RulebookView';
import { SetupChartSvg } from './components/SetupChartSvg';
import { Sidebar } from './components/Sidebar';
import { TopNav } from './components/TopNav';
import { TradeLogView } from './components/TradeLogView';
import type {
  AccountSettings,
  DataSourceMode,
  FeedChannelCredentials,
  IbkrClosedFill,
  IbkrPortfolioSnapshot,
  InstrumentSymbol,
  LoggedTrade,
  MarketSnapshot,
  NavTab,
  SetupType,
  TradeDirection,
} from './types/trading';
import {
  buildTradeRecommendation,
  computeAccountMetrics,
  getEtDateString,
  INSTRUMENT_SPECS,
} from './utils/strategyEngine';
import { buildSnapshotFromLocalBridge, type LocalBridgePayload } from './utils/marketMath';

const STORAGE_SETTINGS_KEY = 'lucidplan_50k_settings_v1';
const STORAGE_TRADES_KEY = 'lucidplan_50k_trades_v1';
const STORAGE_CHANNEL_KEY = 'lucidplan_50k_channel_v1';
const STORAGE_DATASOURCE_KEY = 'lucidplan_50k_datasource_v1';
const STORAGE_AUTOLOG_KEY = 'lucidplan_50k_ibkr_autolog_v1';
const STORAGE_SEEN_EXECS_KEY = 'lucidplan_50k_ibkr_seen_execs_v1';

function createInitialSettings(): AccountSettings {
  return {
    consistencyCapPct: 40,
    dllEnabled: true,
    dllAmount: 1200,
    personalDailyLossCap: 400,
    baseRiskPerTrade: 175,
    maxTradesPerDay: 3,
    activeDate: getEtDateString(),
  };
}

function createInitialMarket(symbol: InstrumentSymbol): MarketSnapshot {
  const spec = INSTRUMENT_SPECS[symbol];
  const baseMap: Record<InstrumentSymbol, number> = {
    MNQ: 26875,
    MES: 6180,
    MGC: 2740,
    MYM: 45100,
  };
  const base = baseMap[symbol];
  const step = spec.defaultStopPts * 0.45;
  const nowSec = Math.floor(Date.now() / 1000);
  const wave = [-0.3, 0.4, -0.5, 0.2, 0.6, -0.4, 0.3, 0.7, -0.2, -0.6, 0.5, 0.8, -0.3, 0.4, 0.5, -0.2, 0.4, 0.6];
  let price = base - step;
  const candles = wave.map((w, i) => {
    const open = Number(price.toFixed(spec.decimals));
    const close = Number((price + w * step).toFixed(spec.decimals));
    const high = Number((Math.max(open, close) + step * 0.35).toFixed(spec.decimals));
    const low = Number((Math.min(open, close) - step * 0.35).toFixed(spec.decimals));
    price = close;
    return {
      time: nowSec - (wave.length - 1 - i) * 300,
      label: '--:--',
      open,
      high,
      low,
      close,
      volume: 1500,
    };
  });
  return {
    symbol,
    yahooSymbol: spec.yahooSymbol,
    source: 'fallback',
    fetchedAt: new Date().toISOString(),
    currentPrice: candles[candles.length - 1].close,
    previousClose: base - step,
    change: 0,
    changePct: 0,
    vwap: base,
    orbHigh: Number((base + step * 0.8).toFixed(spec.decimals)),
    orbLow: Number((base - step * 1.1).toFixed(spec.decimals)),
    sessionHigh: Number((base + step * 1.6).toFixed(spec.decimals)),
    sessionLow: Number((base - step * 1.5).toFixed(spec.decimals)),
    overnightHigh: Number((base + step * 1.2).toFixed(spec.decimals)),
    overnightLow: Number((base - step * 1.3).toFixed(spec.decimals)),
    atrPoints: Number((spec.defaultStopPts * 0.75).toFixed(spec.decimals)),
    candles,
  };
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('planner');
  const [symbol, setSymbol] = useState<InstrumentSymbol>('MNQ');
  const [dataSource, setDataSource] = useState<DataSourceMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_DATASOURCE_KEY);
      if (saved === 'proxy' || saved === 'ibkr' || saved === 'alpaca' || saved === 'tradovate') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'proxy';
  });

  const [setup, setSetup] = useState<SetupType>('ORB_RETEST');
  const [directionChoice, setDirectionChoice] = useState<TradeDirection>('AUTO');
  const [customEntry, setCustomEntry] = useState('');
  const [customStopPts, setCustomStopPts] = useState('');
  const [tradovateSync, setTradovateSync] = useState({
    price: '',
    orbHigh: '',
    orbLow: '',
    vwap: '',
  });
  const [showResetModal, setShowResetModal] = useState(false);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const [channel, setChannel] = useState<FeedChannelCredentials | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_CHANNEL_KEY);
      if (saved) return JSON.parse(saved) as FeedChannelCredentials;
    } catch {
      // ignore
    }
    return null;
  });

  const [settings, setSettings] = useState<AccountSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) return { ...createInitialSettings(), ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return createInitialSettings();
  });

  const [trades, setTrades] = useState<LoggedTrade[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TRADES_KEY);
      if (saved) return JSON.parse(saved) as LoggedTrade[];
    } catch {
      // ignore
    }
    return [];
  });

  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    window: true,
    hardStop: true,
    noAvgDown: true,
    capLocked: false,
  });

  const [market, setMarket] = useState<MarketSnapshot>(() => createInitialMarket('MNQ'));
  const [loadingMarket, setLoadingMarket] = useState(false);
  const [bridgeNote, setBridgeNote] = useState<string | null>(null);
  const [ibkrPortfolio, setIbkrPortfolio] = useState<IbkrPortfolioSnapshot | null>(null);
  const [portfolioNeedsUpgrade, setPortfolioNeedsUpgrade] = useState(false);
  const [autoLogIbkrCloses, setAutoLogIbkrCloses] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_AUTOLOG_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [seenIbkrExecIds, setSeenIbkrExecIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SEEN_EXECS_KEY);
      if (saved) return JSON.parse(saved) as string[];
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TRADES_KEY, JSON.stringify(trades));
    } catch {
      // ignore
    }
  }, [trades]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DATASOURCE_KEY, dataSource);
    } catch {
      // ignore
    }
  }, [dataSource]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_AUTOLOG_KEY, String(autoLogIbkrCloses));
    } catch {
      // ignore
    }
  }, [autoLogIbkrCloses]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SEEN_EXECS_KEY, JSON.stringify(seenIbkrExecIds));
    } catch {
      // ignore
    }
  }, [seenIbkrExecIds]);

  // Provision or verify feed channel on server for IBKR / TradingView bridges
  useEffect(() => {
    let cancelled = false;
    async function ensureChannel() {
      try {
        const res = await fetch('/api/market/channel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(channel ?? {}),
        });
        if (!res.ok) return;
        const next = (await res.json()) as FeedChannelCredentials;
        if (!cancelled) {
          setChannel(next);
          try {
            localStorage.setItem(STORAGE_CHANNEL_KEY, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore network issues
      }
    }
    ensureChannel();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchMarket = useCallback(
    async (targetSymbol: InstrumentSymbol, mode: DataSourceMode, channelId?: string) => {
      setLoadingMarket(true);
      try {
        // In IBKR Paper mode, read directly from the user's local Python bridge on 127.0.0.1:8765 first
        if (mode === 'ibkr') {
          try {
            const localRes = await fetch(`http://127.0.0.1:8765/market/${targetSymbol}`, {
              signal: AbortSignal.timeout(2000),
            });
            if (localRes.ok) {
              const payload = (await localRes.json()) as LocalBridgePayload;
              if (payload.price || (payload.candles && payload.candles.length >= 2)) {
                setBridgeNote(null);
                setMarket((prev) => buildSnapshotFromLocalBridge(payload, prev));
                return;
              }
            } else {
              setBridgeNote(`Bridge responded HTTP ${localRes.status} for ${targetSymbol} — waiting for IB Gateway quote.`);
            }
          } catch (err) {
            const inIframe = typeof window !== 'undefined' && window.self !== window.top;
            const msg = err instanceof Error ? err.message : 'Connection failed';
            setBridgeNote(
              inIframe
                ? `Browser blocked 127.0.0.1:8765 inside iframe (${msg}). Open this app in its own browser tab to connect to your local IBKR bridge.`
                : `Cannot reach http://127.0.0.1:8765 (${msg}). Confirm python ibkr_bridge.py is running.`
            );
          }
        } else {
          setBridgeNote(null);
        }

        if (mode === 'alpaca') {
          setBridgeNote(null);
          const res = await fetch(`/api/alpaca/market/${targetSymbol}`);
          if (!res.ok) throw new Error('Alpaca market fetch error');
          const data = (await res.json()) as MarketSnapshot;
          setMarket(data);
          return;
        }

        const params = new URLSearchParams({ source: mode });
        if (channelId) params.set('channelId', channelId);
        const res = await fetch(`/api/market/${targetSymbol}?${params.toString()}`);
        if (!res.ok) throw new Error('Market fetch error');
        const data = (await res.json()) as MarketSnapshot;
        setMarket(data);
      } catch {
        setMarket(createInitialMarket(targetSymbol));
      } finally {
        setLoadingMarket(false);
      }
    },
    []
  );

  const fetchBrokerPortfolio = useCallback(async (mode: DataSourceMode) => {
    try {
      if (mode === 'alpaca') {
        const res = await fetch('/api/alpaca/portfolio');
        if (!res.ok) return;
        const data = (await res.json()) as IbkrPortfolioSnapshot;
        setPortfolioNeedsUpgrade(false);
        setIbkrPortfolio(data);
        return;
      }

      if (mode === 'ibkr') {
        const res = await fetch('http://127.0.0.1:8765/portfolio', {
          signal: AbortSignal.timeout(2000),
        });
        if (res.status === 404) {
          setPortfolioNeedsUpgrade(true);
          setIbkrPortfolio(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as IbkrPortfolioSnapshot;
        setPortfolioNeedsUpgrade(false);
        setIbkrPortfolio(data);
      }
    } catch {
      // Keep prior state if bridge/API is briefly unreachable
    }
  }, []);

  useEffect(() => {
    fetchMarket(symbol, dataSource, channel?.channelId);
    if (dataSource === 'ibkr' || dataSource === 'alpaca') {
      fetchBrokerPortfolio(dataSource);
    } else {
      setIbkrPortfolio(null);
      setPortfolioNeedsUpgrade(false);
    }
  }, [symbol, dataSource, channel?.channelId, fetchMarket, fetchBrokerPortfolio]);

  // Poll every 5 seconds when Alpaca, IBKR, or Tradovate webhook mode is active
  useEffect(() => {
    if (dataSource !== 'ibkr' && dataSource !== 'alpaca' && dataSource !== 'tradovate') return;
    const id = window.setInterval(() => {
      fetchMarket(symbol, dataSource, channel?.channelId);
      if (dataSource === 'ibkr' || dataSource === 'alpaca') {
        fetchBrokerPortfolio(dataSource);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [symbol, dataSource, channel?.channelId, fetchMarket, fetchBrokerPortfolio]);

  // Merge manual Tradovate Screen Sync inputs when in Tradovate Live mode
  const effectiveMarket = useMemo<MarketSnapshot>(() => {
    if (dataSource !== 'tradovate') return market;

    const p = tradovateSync.price.trim() ? Number(tradovateSync.price) : null;
    const oh = tradovateSync.orbHigh.trim() ? Number(tradovateSync.orbHigh) : null;
    const ol = tradovateSync.orbLow.trim() ? Number(tradovateSync.orbLow) : null;
    const vw = tradovateSync.vwap.trim() ? Number(tradovateSync.vwap) : null;

    const hasManualOverride =
      (p && Number.isFinite(p)) ||
      (oh && Number.isFinite(oh)) ||
      (ol && Number.isFinite(ol)) ||
      (vw && Number.isFinite(vw));

    if (!hasManualOverride) return market;

    const currentPrice = p && Number.isFinite(p) ? p : market.currentPrice;
    const candles = [...market.candles];
    if (candles.length > 0 && p && Number.isFinite(p)) {
      const last = candles[candles.length - 1];
      candles[candles.length - 1] = {
        ...last,
        close: p,
        high: Math.max(last.high, p),
        low: Math.min(last.low, p),
      };
    }

    return {
      ...market,
      source: 'manual',
      feedDelayLabel: 'Tradovate Screen Sync (Manual)',
      currentPrice,
      orbHigh: oh && Number.isFinite(oh) ? oh : market.orbHigh,
      orbLow: ol && Number.isFinite(ol) ? ol : market.orbLow,
      vwap: vw && Number.isFinite(vw) ? vw : market.vwap,
      candles,
    };
  }, [market, dataSource, tradovateSync]);

  const metrics = useMemo(() => computeAccountMetrics(trades, settings), [trades, settings]);

  const recommendation = useMemo(() => {
    const parsedEntry = customEntry.trim() ? Number(customEntry) : null;
    const parsedStop = customStopPts.trim() ? Number(customStopPts) : null;
    return buildTradeRecommendation({
      market: effectiveMarket,
      setup,
      directionChoice,
      metrics,
      settings,
      customEntryPrice: parsedEntry,
      customStopPoints: parsedStop,
    });
  }, [effectiveMarket, setup, directionChoice, metrics, settings, customEntry, customStopPts]);

  const handleChangeSymbol = (nextSymbol: InstrumentSymbol) => {
    setSymbol(nextSymbol);
    setCustomEntry('');
    setCustomStopPts('');
    setTradovateSync({ price: '', orbHigh: '', orbLow: '', vwap: '' });
  };

  const handleChangeDataSource = (nextMode: DataSourceMode) => {
    setOrderFeedback(null);
    setDataSource(nextMode);
  };

  const handleTestPush = async () => {
    if (!channel) return;
    const spec = INSTRUMENT_SPECS[symbol];
    const basePx = effectiveMarket.currentPrice;
    const step = spec.defaultStopPts * 0.35;
    const px = Number((basePx + step * 0.4).toFixed(spec.decimals));
    await fetch('/api/market/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ingest-secret': channel.ingestSecret,
      },
      body: JSON.stringify({
        channelId: channel.channelId,
        symbol,
        source: dataSource === 'tradovate' ? 'tradovate-webhook' : 'ibkr-delayed',
        delayed: dataSource !== 'tradovate',
        price: px,
      }),
    });
    await fetchMarket(symbol, dataSource, channel.channelId);
  };

  const handleSubmitPaperOrder = async () => {
    if (recommendation.totalContracts <= 0) return;
    setSubmittingOrder(true);
    setOrderFeedback(null);
    const isAlpaca = dataSource === 'alpaca';
    const endpoint = isAlpaca ? '/api/alpaca/order' : 'http://127.0.0.1:8765/order';
    const brokerLabel = isAlpaca ? 'Alpaca' : 'IBKR';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: recommendation.symbol,
          direction: recommendation.direction,
          tp1Contracts: recommendation.tp1Contracts,
          runnerContracts: recommendation.runnerContracts,
          entryPrice: recommendation.entryPrice,
          stopLossPrice: recommendation.stopLossPrice,
          tp1Price: recommendation.tp1Price,
          tp2Price: recommendation.tp2Price,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        account?: string;
        contract?: string;
        orderIds?: Array<number | string>;
        legs?: string[];
        warning?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setOrderFeedback({
          ok: false,
          message: `${brokerLabel} rejected order: ${json.error ?? `HTTP ${res.status}`}`,
        });
      } else if (json.warning) {
        setOrderFeedback({
          ok: false,
          message: `Paper bracket sent on ${json.contract ?? recommendation.symbol} (${json.account ?? 'Paper'}), but ${brokerLabel} canceled/flagged a leg: ${json.warning}`,
        });
      } else {
        setOrderFeedback({
          ok: true,
          message: `Paper bracket submitted on ${json.contract ?? recommendation.symbol} (${json.account ?? 'Paper'}) — Order IDs: ${(json.orderIds ?? []).map((id) => String(id).slice(0, 8)).join(', ')}`,
        });
      }
      if (isAlpaca || dataSource === 'ibkr') {
        void fetchBrokerPortfolio(dataSource);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setOrderFeedback({
        ok: false,
        message: isAlpaca
          ? `Could not submit order to Alpaca (${msg}).`
          : `Could not submit order to 127.0.0.1:8765 (${msg}). Confirm the updated python ibkr_bridge.py is running.`,
      });
    } finally {
      setSubmittingOrder(false);
      setShowOrderModal(false);
    }
  };

  const handleCancelAlpacaOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/alpaca/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setOrderFeedback({ ok: false, message: `Cancel failed: ${json.error ?? `HTTP ${res.status}`}` });
      }
      void fetchBrokerPortfolio('alpaca');
    } catch (err) {
      setOrderFeedback({ ok: false, message: err instanceof Error ? err.message : 'Cancel failed' });
    }
  };

  const handleCloseAlpacaPosition = async (etfSymbol: string) => {
    try {
      const res = await fetch(`/api/alpaca/positions/${encodeURIComponent(etfSymbol)}`, { method: 'DELETE' });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setOrderFeedback({ ok: false, message: `Close failed: ${json.error ?? `HTTP ${res.status}`}` });
      } else {
        setOrderFeedback({ ok: true, message: `Submitted market close for ${etfSymbol} on Alpaca Paper.` });
      }
      void fetchBrokerPortfolio('alpaca');
    } catch (err) {
      setOrderFeedback({ ok: false, message: err instanceof Error ? err.message : 'Close failed' });
    }
  };

  const handleUpdateSettings = (patch: Partial<AccountSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleToggleChecklist = (key: string) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleQuickLog = (outcome: 'TP1' | 'TP2' | 'SL') => {
    if (recommendation.totalContracts === 0) return;

    const netPnl =
      outcome === 'TP1'
        ? recommendation.projectedTp1Dollars
        : outcome === 'TP2'
          ? recommendation.totalProjectedDollars
          : -recommendation.totalRiskDollars;

    const exitPrice =
      outcome === 'TP1'
        ? recommendation.tp1Price
        : outcome === 'TP2'
          ? recommendation.tp2Price
          : recommendation.stopLossPrice;

    const rMultiple =
      recommendation.totalRiskDollars > 0
        ? Number((netPnl / recommendation.totalRiskDollars).toFixed(2))
        : 0;

    const newTrade: LoggedTrade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: settings.activeDate,
      timestamp: new Date().toISOString(),
      symbol: recommendation.symbol,
      setup: recommendation.setup,
      direction: recommendation.direction,
      contracts: recommendation.totalContracts,
      entryPrice: recommendation.entryPrice,
      stopLossPrice: recommendation.stopLossPrice,
      exitPrice,
      netPnl: Number(netPnl.toFixed(2)),
      rMultiple,
      outcome,
    };

    setTrades((prev) => [...prev, newTrade]);
  };

  const handleLogCustomPnl = (pnl: number) => {
    const risk = recommendation.totalRiskDollars || settings.baseRiskPerTrade;
    const newTrade: LoggedTrade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: settings.activeDate,
      timestamp: new Date().toISOString(),
      symbol: recommendation.symbol,
      setup: recommendation.setup,
      direction: recommendation.direction,
      contracts: Math.max(1, recommendation.totalContracts),
      entryPrice: recommendation.entryPrice,
      stopLossPrice: recommendation.stopLossPrice,
      exitPrice: recommendation.entryPrice,
      netPnl: Number(pnl.toFixed(2)),
      rMultiple: Number((pnl / risk).toFixed(2)),
      outcome: 'CUSTOM',
    };
    setTrades((prev) => [...prev, newTrade]);
  };

  const handleAdvanceDay = () => {
    setSettings((prev) => ({
      ...prev,
      activeDate: addDaysToIsoDate(prev.activeDate, 1),
    }));
  };

  const handleDeleteTrade = (id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  };

  const buildLoggedTradeFromFill = useCallback(
    (fill: IbkrClosedFill): LoggedTrade => {
      const fillSym = (['MNQ', 'MES', 'MGC', 'MYM'].includes(fill.symbol)
        ? fill.symbol
        : symbol) as InstrumentSymbol;
      const risk = recommendation.totalRiskDollars || settings.baseRiskPerTrade || 175;
      const netPnl = Number(fill.realizedPnl.toFixed(2));
      return {
        id: `ibkr-${fill.execId}`,
        externalExecId: fill.execId,
        date: settings.activeDate,
        timestamp: fill.timestamp || new Date().toISOString(),
        symbol: fillSym,
        setup,
        direction: fill.direction,
        contracts: Math.max(1, fill.contracts),
        entryPrice: fill.entryPrice ?? fill.exitPrice,
        stopLossPrice: recommendation.stopLossPrice,
        exitPrice: fill.exitPrice,
        netPnl,
        rMultiple: Number((netPnl / risk).toFixed(2)),
        outcome: fill.outcome,
        notes: `IBKR ${fill.localSymbol} #${fill.orderId}`,
      };
    },
    [symbol, recommendation.totalRiskDollars, recommendation.stopLossPrice, settings.baseRiskPerTrade, settings.activeDate, setup]
  );

  const handleManualLogFill = useCallback(
    (fill: IbkrClosedFill) => {
      if (seenIbkrExecIds.includes(fill.execId)) return;
      const trade = buildLoggedTradeFromFill(fill);
      setTrades((prev) => (prev.some((t) => t.externalExecId === fill.execId) ? prev : [...prev, trade]));
      setSeenIbkrExecIds((prev) => (prev.includes(fill.execId) ? prev : [...prev, fill.execId]));
    },
    [seenIbkrExecIds, buildLoggedTradeFromFill]
  );

  // Auto-log closed TP/SL fills detected by IBKR or Alpaca
  useEffect(() => {
    if (
      (dataSource !== 'ibkr' && dataSource !== 'alpaca') ||
      !autoLogIbkrCloses ||
      !ibkrPortfolio?.closedFills.length
    ) {
      return;
    }
    const existingSet = new Set([
      ...seenIbkrExecIds,
      ...trades.map((t) => t.externalExecId).filter((x): x is string => Boolean(x)),
    ]);
    const freshFills = ibkrPortfolio.closedFills.filter((f) => !existingSet.has(f.execId));
    if (freshFills.length === 0) return;

    const newTrades = freshFills.map(buildLoggedTradeFromFill);
    const newIds = freshFills.map((f) => f.execId);
    setTrades((prev) => [...prev, ...newTrades]);
    setSeenIbkrExecIds((prev) => [...prev, ...newIds]);
  }, [dataSource, autoLogIbkrCloses, ibkrPortfolio, seenIbkrExecIds, trades, buildLoggedTradeFromFill]);

  const handleConfirmReset = () => {
    setTrades([]);
    setSeenIbkrExecIds([]);
    setSettings(createInitialSettings());
    setCustomEntry('');
    setCustomStopPts('');
    setTradovateSync({ price: '', orbHigh: '', orbLow: '', vwap: '' });
    setShowResetModal(false);
  };

  const todayTrades = useMemo(
    () => trades.filter((t) => t.date === settings.activeDate),
    [trades, settings.activeDate]
  );

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-100 flex flex-col">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onResetAccount={() => setShowResetModal(true)}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        <Sidebar
          settings={settings}
          metrics={metrics}
          recommendation={recommendation}
          checklist={checklist}
          onToggleChecklist={handleToggleChecklist}
          onUpdateSettings={handleUpdateSettings}
          onQuickLog={handleQuickLog}
          onLogCustomPnl={handleLogCustomPnl}
          onAdvanceDay={handleAdvanceDay}
        />

        <main className="flex-1 p-5 lg:p-6 space-y-6 overflow-x-hidden">
          <KpiStrip metrics={metrics} settings={settings} />

          {activeTab === 'planner' && (
            <div className="space-y-6">
              <RecommendationPanel
                market={effectiveMarket}
                dataSource={dataSource}
                bridgeNote={bridgeNote}
                alpacaConfigured={ibkrPortfolio?.configured}
                orderFeedback={orderFeedback}
                loadingMarket={loadingMarket}
                setup={setup}
                directionChoice={directionChoice}
                customEntry={customEntry}
                customStopPts={customStopPts}
                tradovateSync={tradovateSync}
                recommendation={recommendation}
                onChangeDataSource={handleChangeDataSource}
                onOpenFeedModal={() => setShowFeedModal(true)}
                onRequestPaperOrder={() => setShowOrderModal(true)}
                onChangeSymbol={handleChangeSymbol}
                onChangeSetup={setSetup}
                onChangeDirection={setDirectionChoice}
                onChangeCustomEntry={setCustomEntry}
                onChangeCustomStopPts={setCustomStopPts}
                onChangeTradovateSync={(patch) =>
                  setTradovateSync((prev) => ({ ...prev, ...patch }))
                }
                onRefreshMarket={() => {
                  void fetchMarket(symbol, dataSource, channel?.channelId);
                  if (dataSource === 'ibkr' || dataSource === 'alpaca') {
                    void fetchBrokerPortfolio(dataSource);
                  }
                }}
                onClearOverrides={() => {
                  setCustomEntry('');
                  setCustomStopPts('');
                }}
              />

              {(dataSource === 'ibkr' || dataSource === 'alpaca') && (
                <IbkrPositionsPanel
                  provider={dataSource}
                  portfolio={ibkrPortfolio}
                  portfolioNeedsUpgrade={portfolioNeedsUpgrade}
                  currentSymbol={symbol}
                  currentPrice={effectiveMarket.currentPrice}
                  autoLogCloses={autoLogIbkrCloses}
                  loggedExecIds={seenIbkrExecIds}
                  onToggleAutoLog={setAutoLogIbkrCloses}
                  onManualLogFill={handleManualLogFill}
                  onOpenFeedModal={() => setShowFeedModal(true)}
                  onCancelOrder={dataSource === 'alpaca' ? handleCancelAlpacaOrder : undefined}
                  onClosePosition={dataSource === 'alpaca' ? handleCloseAlpacaPosition : undefined}
                />
              )}

              <SetupChartSvg market={effectiveMarket} recommendation={recommendation} />

              <section className="rounded-lg border border-slate-800 bg-[#111827] p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-sm font-semibold text-slate-200">
                    Session Activity ({settings.activeDate})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('log')}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300"
                  >
                    Open Full Trade Log
                  </button>
                </div>

                {todayTrades.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No trades logged for this session yet. Execute manually on your broker platform using the levels above, then click +TP1, +TP2, or -Stop in the sidebar to update your EOD floor and sizing.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/80 text-xs">
                    {todayTrades.map((t) => (
                      <div key={t.id} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-semibold text-slate-100">{t.symbol}</span>
                          <span className={t.direction === 'LONG' ? 'text-emerald-400' : 'text-rose-400'}>
                            {t.direction}
                          </span>
                          <span className="font-mono text-slate-400 tabular-nums">
                            {t.contracts} micros · Entry {t.entryPrice}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 font-mono tabular-nums">
                          <span className="text-slate-400">{t.outcome}</span>
                          <span
                            className={`font-semibold ${
                              t.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {t.netPnl >= 0 ? `+$${t.netPnl.toFixed(0)}` : `-$${Math.abs(t.netPnl).toFixed(0)}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'equity' && <EquityEodView metrics={metrics} settings={settings} />}
          {activeTab === 'log' && (
            <TradeLogView trades={trades} onDeleteTrade={handleDeleteTrade} />
          )}
          {activeTab === 'rulebook' && <RulebookView />}
        </main>
      </div>

      <DataSourceModal
        isOpen={showFeedModal}
        dataSource={dataSource}
        symbol={symbol}
        channel={channel}
        lastSourceLabel={effectiveMarket.feedDelayLabel ?? effectiveMarket.source}
        onClose={() => setShowFeedModal(false)}
        onTestPush={handleTestPush}
      />

      {showOrderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paper-order-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#111827] p-6 space-y-4">
            <h2 id="paper-order-title" className="font-display text-lg font-semibold text-slate-100">
              {dataSource === 'alpaca'
                ? 'Send Paper Bracket to Alpaca?'
                : 'Send Paper Bracket to IBKR?'}
            </h2>
            <p className="text-xs text-slate-400">
              {dataSource === 'alpaca' ? (
                <>
                  Routes strictly to <code className="font-mono text-slate-200">paper-api.alpaca.markets</code> via your server-side API secrets using ETF proxy shares (<code className="font-mono text-slate-200">{recommendation.displaySymbol ?? recommendation.symbol}</code>).
                </>
              ) : (
                <>
                  Restricted strictly to IBKR Paper accounts (<code className="font-mono text-slate-200">DU*</code> on port <code className="font-mono text-slate-200">4002</code>). Make sure <strong className="text-slate-200">Read-Only API</strong> is unchecked in IB Gateway API Settings.
                </>
              )}
            </p>
            {dataSource === 'ibkr' && effectiveMarket.source === 'ibkr-delayed' && (
              <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                Delayed feed active (<code className="font-mono">USE_DELAYED = True</code>): IBKR Paper fills against live market prices, which may differ from your 10–15m delayed quote. If live price already crossed your entry and stop, a leg will fill or OCA-cancel immediately.
              </div>
            )}
            <dl className="divide-y divide-slate-800 rounded-md border border-slate-800 bg-[#0B111E] px-3.5 text-xs">
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">{dataSource === 'alpaca' ? 'ETF & Side' : 'Contract & Side'}</dt>
                <dd className="font-mono font-semibold text-slate-100">
                  {recommendation.direction === 'LONG' ? 'BUY' : 'SELL'} {recommendation.totalContracts}{' '}
                  {recommendation.displaySymbol ?? recommendation.symbol}{' '}
                  {dataSource === 'alpaca' ? '(Shares)' : '(Micro)'}
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">Limit Entry</dt>
                <dd className="font-mono text-slate-100 tabular-nums">{recommendation.entryPrice}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">Stop Loss</dt>
                <dd className="font-mono text-rose-400 tabular-nums">
                  {recommendation.stopLossPrice} (-${recommendation.totalRiskDollars.toFixed(0)})
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">
                  TP1 ({recommendation.tp1Contracts}{' '}
                  {dataSource === 'alpaca'
                    ? recommendation.tp1Contracts === 1
                      ? 'share'
                      : 'shares'
                    : recommendation.tp1Contracts === 1
                      ? 'micro'
                      : 'micros'})
                </dt>
                <dd className="font-mono text-emerald-400 tabular-nums">{recommendation.tp1Price}</dd>
              </div>
              {recommendation.runnerContracts > 0 && (
                <div className="flex justify-between py-2">
                  <dt className="text-slate-400">TP2 Runner ({recommendation.runnerContracts})</dt>
                  <dd className="font-mono text-emerald-300 tabular-nums">{recommendation.tp2Price}</dd>
                </div>
              )}
            </dl>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={submittingOrder}
                onClick={() => setShowOrderModal(false)}
                className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingOrder}
                onClick={handleSubmitPaperOrder}
                className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {submittingOrder ? 'Submitting...' : 'Confirm & Send Paper Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-dialog-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-[#111827] p-6 space-y-4">
            <h2 id="reset-dialog-title" className="font-display text-lg font-semibold text-slate-100">
              Reset LucidFlex 50K Account?
            </h2>
            <p className="text-sm text-slate-400">
              This will clear all logged trades and restore the starting $50,000 balance and $48,000 EOD drawdown floor.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="rounded-md bg-rose-600 px-4 py-2 text-xs font-medium text-white hover:bg-rose-500"
              >
                Reset to $50,000
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
