import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CandleBar {
  time: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type SnapshotSource =
  | 'live'
  | 'fallback'
  | 'manual'
  | 'ibkr-delayed'
  | 'ibkr-live'
  | 'alpaca-paper'
  | 'tradovate-webhook'
  | 'waiting';

interface MarketSnapshot {
  symbol: string;
  yahooSymbol: string;
  source: SnapshotSource;
  feedDelayLabel?: string;
  waitingForFeed?: boolean;
  fetchedAt: string;
  currentPrice: number;
  previousClose: number;
  change: number;
  changePct: number;
  vwap: number;
  orbHigh: number;
  orbLow: number;
  sessionHigh: number;
  sessionLow: number;
  overnightHigh: number;
  overnightLow: number;
  atrPoints: number;
  candles: CandleBar[];
}

interface ChannelRecord {
  channelId: string;
  ingestSecret: string;
  createdAt: number;
  feeds: Map<string, MarketSnapshot>;
}

const SYMBOL_MAP: Record<string, { yahoo: string; fallbackBase: number; step: number; atr: number }> = {
  MNQ: { yahoo: 'NQ=F', fallbackBase: 26875, step: 16, atr: 22 },
  MES: { yahoo: 'ES=F', fallbackBase: 6180, step: 4.5, atr: 6 },
  MGC: { yahoo: 'GC=F', fallbackBase: 2740, step: 3.2, atr: 4.5 },
  MYM: { yahoo: 'YM=F', fallbackBase: 45100, step: 35, atr: 45 },
};

const cache = new Map<string, { expiresAt: number; data: MarketSnapshot }>();
const channels = new Map<string, ChannelRecord>();

function formatEtTime(unixSeconds: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(unixSeconds * 1000));
  } catch {
    return '--:--';
  }
}

function getEtHourMinute(unixSeconds: number): { hour: number; minute: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(unixSeconds * 1000));

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return {
    hour: Number(map.hour ?? 0),
    minute: Number(map.minute ?? 0),
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

function buildFallbackSnapshot(symbol: string, waitingForFeed = false, feedMode?: 'ibkr' | 'tradovate'): MarketSnapshot {
  const cfg = SYMBOL_MAP[symbol] ?? SYMBOL_MAP.MNQ;
  const nowSec = Math.floor(Date.now() / 1000);
  const candles: CandleBar[] = [];
  let price = cfg.fallbackBase - cfg.step * 1.4;

  const wave = [
    -0.3, 0.4, -0.5, 0.2, 0.6, -0.4, 0.3, 0.7, -0.2, -0.6,
    -0.8, 0.5, 0.9, 0.4, -0.2, 0.6, 0.8, -0.3, 0.4, 0.5,
    -0.4, -0.2, 0.7, 0.6, 0.3, -0.2, 0.4, 0.5, -0.1, 0.3,
    0.4, -0.3, 0.2, 0.5, -0.2, 0.3,
  ];

  for (let i = 0; i < wave.length; i++) {
    const t = nowSec - (wave.length - 1 - i) * 300;
    const delta = wave[i] * cfg.step;
    const open = Number(price.toFixed(2));
    const close = Number((price + delta).toFixed(2));
    const wickUp = Math.abs(delta) * 0.45 + cfg.step * 0.22;
    const wickDown = Math.abs(delta) * 0.45 + cfg.step * 0.22;
    const high = Number((Math.max(open, close) + wickUp).toFixed(2));
    const low = Number((Math.min(open, close) - wickDown).toFixed(2));
    candles.push({
      time: t,
      label: formatEtTime(t),
      open,
      high,
      low,
      close,
      volume: 1400 + Math.round(Math.abs(wave[i]) * 1800),
    });
    price = close;
  }

  const currentPrice = candles[candles.length - 1].close;
  const previousClose = cfg.fallbackBase - cfg.step * 1.6;
  const sessionHigh = Math.max(...candles.map((c) => c.high));
  const sessionLow = Math.min(...candles.map((c) => c.low));
  const orbSlice = candles.slice(10, 14);
  const orbHigh = Math.max(...orbSlice.map((c) => c.high));
  const orbLow = Math.min(...orbSlice.map((c) => c.low));
  const overnightSlice = candles.slice(0, 10);
  const overnightHigh = Math.max(...overnightSlice.map((c) => c.high));
  const overnightLow = Math.min(...overnightSlice.map((c) => c.low));
  const vwap = Number(
    (candles.reduce((acc, c) => acc + ((c.high + c.low + c.close) / 3) * c.volume, 0) /
      candles.reduce((acc, c) => acc + c.volume, 0)).toFixed(2)
  );

  return {
    symbol,
    yahooSymbol: cfg.yahoo,
    source: waitingForFeed ? 'waiting' : 'fallback',
    waitingForFeed,
    feedDelayLabel: waitingForFeed
      ? feedMode === 'ibkr'
        ? 'Waiting for IBKR bridge push'
        : 'Waiting for Tradovate screen sync or webhook'
      : undefined,
    fetchedAt: new Date().toISOString(),
    currentPrice,
    previousClose,
    change: Number((currentPrice - previousClose).toFixed(2)),
    changePct: Number((((currentPrice - previousClose) / previousClose) * 100).toFixed(2)),
    vwap,
    orbHigh,
    orbLow,
    sessionHigh,
    sessionLow,
    overnightHigh,
    overnightLow,
    atrPoints: cfg.atr,
    candles,
  };
}

function computeSnapshotFromBars(
  symbol: string,
  bars: CandleBar[],
  source: SnapshotSource,
  feedDelayLabel?: string,
  overrides?: {
    currentPrice?: number;
    previousClose?: number;
    vwap?: number;
    orbHigh?: number;
    orbLow?: number;
    overnightHigh?: number;
    overnightLow?: number;
  }
): MarketSnapshot {
  const cfg = SYMBOL_MAP[symbol] ?? SYMBOL_MAP.MNQ;
  const recentCandles = bars.slice(-48);
  const lastBar = recentCandles[recentCandles.length - 1];
  const currentPrice = Number((overrides?.currentPrice ?? lastBar.close).toFixed(2));
  const previousClose = Number((overrides?.previousClose ?? recentCandles[0].open).toFixed(2));

  const latestEt = getEtHourMinute(lastBar.time);
  const todayBars = bars.filter((b) => getEtHourMinute(b.time).dateKey === latestEt.dateKey);
  const activeDayBars = todayBars.length >= 4 ? todayBars : recentCandles;

  const orbBars = activeDayBars.filter((b) => {
    const et = getEtHourMinute(b.time);
    const mins = et.hour * 60 + et.minute;
    return mins >= 9 * 60 + 30 && mins < 9 * 60 + 45;
  });
  const orbRefBars = orbBars.length > 0 ? orbBars : activeDayBars.slice(0, Math.min(3, activeDayBars.length));
  const orbHigh = overrides?.orbHigh ?? Math.max(...orbRefBars.map((b) => b.high));
  const orbLow = overrides?.orbLow ?? Math.min(...orbRefBars.map((b) => b.low));

  const preNyBars = activeDayBars.filter((b) => {
    const et = getEtHourMinute(b.time);
    return et.hour * 60 + et.minute < 9 * 60 + 30;
  });
  const overnightRef = preNyBars.length > 0 ? preNyBars : recentCandles.slice(0, Math.min(12, recentCandles.length));
  const overnightHigh = overrides?.overnightHigh ?? Math.max(...overnightRef.map((b) => b.high));
  const overnightLow = overrides?.overnightLow ?? Math.min(...overnightRef.map((b) => b.low));

  const sessionHigh = Math.max(...activeDayBars.map((b) => b.high));
  const sessionLow = Math.min(...activeDayBars.map((b) => b.low));

  let pv = 0;
  let vol = 0;
  for (const b of activeDayBars) {
    const typical = (b.high + b.low + b.close) / 3;
    const w = b.volume > 0 ? b.volume : 1;
    pv += typical * w;
    vol += w;
  }
  const vwap = Number((overrides?.vwap ?? pv / (vol || 1)).toFixed(2));

  const atrSlice = recentCandles.slice(-15);
  let trSum = 0;
  let trCount = 0;
  for (let i = 1; i < atrSlice.length; i++) {
    const cur = atrSlice[i];
    const prev = atrSlice[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trSum += tr;
    trCount++;
  }
  const atrPoints = Number(Math.max(cfg.atr * 0.35, trCount > 0 ? trSum / trCount : cfg.atr).toFixed(2));

  return {
    symbol,
    yahooSymbol: cfg.yahoo,
    source,
    feedDelayLabel,
    waitingForFeed: false,
    fetchedAt: new Date().toISOString(),
    currentPrice,
    previousClose,
    change: Number((currentPrice - previousClose).toFixed(2)),
    changePct: Number((((currentPrice - previousClose) / (previousClose || 1)) * 100).toFixed(2)),
    vwap,
    orbHigh,
    orbLow,
    sessionHigh,
    sessionLow,
    overnightHigh,
    overnightLow,
    atrPoints,
    candles: recentCandles,
  };
}

async function fetchYahooSnapshot(symbol: string): Promise<MarketSnapshot> {
  const cfg = SYMBOL_MAP[symbol] ?? SYMBOL_MAP.MNQ;
  const cached = cache.get(symbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cfg.yahoo)}?interval=5m&range=2d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            chartPreviousClose?: number;
            previousClose?: number;
          };
          timestamp?: number[];
          indicators?: {
            quote?: Array<{
              open?: Array<number | null>;
              high?: Array<number | null>;
              low?: Array<number | null>;
              close?: Array<number | null>;
              volume?: Array<number | null>;
            }>;
          };
        }>;
      };
    };

    const result = json.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const quote = result?.indicators?.quote?.[0];
    if (!result || !quote || timestamps.length === 0) {
      throw new Error('Empty chart payload');
    }

    const parsed: CandleBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      const v = quote.volume?.[i] ?? 0;
      if (o == null || h == null || l == null || c == null) continue;
      parsed.push({
        time: timestamps[i],
        label: formatEtTime(timestamps[i]),
        open: Number(o.toFixed(2)),
        high: Number(h.toFixed(2)),
        low: Number(l.toFixed(2)),
        close: Number(c.toFixed(2)),
        volume: Number(v) || 1,
      });
    }

    if (parsed.length < 12) {
      throw new Error('Insufficient bars');
    }

    const snapshot = computeSnapshotFromBars(symbol, parsed, 'live', 'Public CME Proxy (Delayed/Near-RT)', {
      currentPrice: result.meta?.regularMarketPrice,
      previousClose: result.meta?.chartPreviousClose ?? result.meta?.previousClose,
    });

    cache.set(symbol, { expiresAt: Date.now() + 45_000, data: snapshot });
    return snapshot;
  } catch {
    return buildFallbackSnapshot(symbol);
  } finally {
    clearTimeout(timer);
  }
}

function getOrCreateChannel(requestedId?: string, requestedSecret?: string): ChannelRecord {
  if (requestedId && channels.has(requestedId)) {
    const existing = channels.get(requestedId)!;
    if (!requestedSecret || existing.ingestSecret === requestedSecret) {
      return existing;
    }
  }
  const channelId =
    requestedId && /^[a-zA-Z0-9_-]{8,40}$/.test(requestedId)
      ? requestedId
      : crypto.randomBytes(6).toString('hex');
  const ingestSecret =
    requestedSecret && /^[a-zA-Z0-9_-]{12,64}$/.test(requestedSecret)
      ? requestedSecret
      : crypto.randomBytes(16).toString('hex');

  const record: ChannelRecord = {
    channelId,
    ingestSecret,
    createdAt: Date.now(),
    feeds: new Map(),
  };
  channels.set(channelId, record);

  // Prevent unbounded channel memory growth
  if (channels.size > 500) {
    const oldestKey = channels.keys().next().value;
    if (oldestKey) channels.delete(oldestKey);
  }

  return record;
}

async function startServer() {
  const app = express();
  const port = 3000;

  app.use(express.json({ limit: '256kb' }));

  // Create or restore a private market feed channel for IBKR bridge or TradingView webhook
  app.post('/api/market/channel', (req, res) => {
    const body = (req.body ?? {}) as { channelId?: string; ingestSecret?: string };
    const record = getOrCreateChannel(body.channelId, body.ingestSecret);
    res.json({
      channelId: record.channelId,
      ingestSecret: record.ingestSecret,
    });
  });

  // Ingest live or delayed bars/ticks from local IBKR bridge or TradingView/Tradovate webhook
  app.post('/api/market/ingest', (req, res) => {
    const body = (req.body ?? {}) as {
      channelId?: string;
      secret?: string;
      symbol?: string;
      source?: 'ibkr-delayed' | 'ibkr-live' | 'tradovate-webhook';
      delayed?: boolean;
      price?: number;
      vwap?: number;
      orbHigh?: number;
      orbLow?: number;
      overnightHigh?: number;
      overnightLow?: number;
      candles?: Array<{
        time?: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volume?: number;
      }>;
    };

    const channelId = String(body.channelId ?? '');
    const headerSecret = String(req.headers['x-ingest-secret'] ?? body.secret ?? '');
    const channel = channels.get(channelId);

    if (!channel || !headerSecret || channel.ingestSecret !== headerSecret) {
      res.status(401).json({ error: 'Invalid or expired feed channel credentials' });
      return;
    }

    const rawSymbol = String(body.symbol ?? 'MNQ').toUpperCase();
    const symbol = SYMBOL_MAP[rawSymbol] ? rawSymbol : 'MNQ';
    const feedSource: SnapshotSource =
      body.source === 'tradovate-webhook'
        ? 'tradovate-webhook'
        : body.delayed === false || body.source === 'ibkr-live'
          ? 'ibkr-live'
          : 'ibkr-delayed';

    const feedDelayLabel =
      feedSource === 'ibkr-delayed'
        ? 'IBKR Paper Feed (10–15m Delayed)'
        : feedSource === 'ibkr-live'
          ? 'IBKR Real-Time CME Stream'
          : 'TradingView / Tradovate Webhook';

    const existing = channel.feeds.get(symbol);
    let bars: CandleBar[] = [];

    if (Array.isArray(body.candles) && body.candles.length >= 2) {
      bars = body.candles
        .slice(-60)
        .filter(
          (c) =>
            Number.isFinite(Number(c.open)) &&
            Number.isFinite(Number(c.high)) &&
            Number.isFinite(Number(c.low)) &&
            Number.isFinite(Number(c.close))
        )
        .map((c, idx) => {
          const t = Number.isFinite(Number(c.time))
            ? Number(c.time)
            : Math.floor(Date.now() / 1000) - (body.candles!.length - idx) * 300;
          return {
            time: t,
            label: formatEtTime(t),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Math.max(1, Number(c.volume) || 100),
          };
        });
    } else if (Number.isFinite(Number(body.price))) {
      // Single tick / TradingView alert push: append or update latest bar on top of existing bars
      const baseSnapshot = existing ?? buildFallbackSnapshot(symbol);
      const px = Number(body.price);
      bars = [...baseSnapshot.candles];
      const nowSec = Math.floor(Date.now() / 1000);
      const last = bars[bars.length - 1];
      if (last && nowSec - last.time < 300) {
        bars[bars.length - 1] = {
          ...last,
          high: Math.max(last.high, px),
          low: Math.min(last.low, px),
          close: px,
          volume: last.volume + 150,
        };
      } else {
        bars.push({
          time: nowSec,
          label: formatEtTime(nowSec),
          open: last ? last.close : px,
          high: px,
          low: px,
          close: px,
          volume: 500,
        });
      }
    }

    if (bars.length < 2) {
      res.status(400).json({ error: 'Provide either candles[] (>=2 bars) or a valid numeric price' });
      return;
    }

    const snapshot = computeSnapshotFromBars(symbol, bars, feedSource, feedDelayLabel, {
      currentPrice: Number.isFinite(Number(body.price)) ? Number(body.price) : undefined,
      vwap: Number.isFinite(Number(body.vwap)) ? Number(body.vwap) : undefined,
      orbHigh: Number.isFinite(Number(body.orbHigh)) ? Number(body.orbHigh) : undefined,
      orbLow: Number.isFinite(Number(body.orbLow)) ? Number(body.orbLow) : undefined,
      overnightHigh: Number.isFinite(Number(body.overnightHigh)) ? Number(body.overnightHigh) : undefined,
      overnightLow: Number.isFinite(Number(body.overnightLow)) ? Number(body.overnightLow) : undefined,
    });

    channel.feeds.set(symbol, snapshot);
    res.json({ ok: true, symbol, source: feedSource, currentPrice: snapshot.currentPrice });
  });

  app.get('/api/market/:symbol', async (req, res) => {
    const rawSymbol = String(req.params.symbol || 'MNQ').toUpperCase();
    const symbol = SYMBOL_MAP[rawSymbol] ? rawSymbol : 'MNQ';
    const sourceMode = String(req.query.source ?? 'proxy');
    const channelId = String(req.query.channelId ?? '');

    if (sourceMode === 'ibkr' || sourceMode === 'tradovate') {
      const channel = channelId ? channels.get(channelId) : undefined;
      const ingested = channel?.feeds.get(symbol);
      if (ingested) {
        res.json(ingested);
        return;
      }
      res.json(buildFallbackSnapshot(symbol, true, sourceMode));
      return;
    }

    const snapshot = await fetchYahooSnapshot(symbol);
    res.json(snapshot);
  });

  // --- Alpaca Paper Trading Cloud Integration (zero local software required) ---
  const ALPACA_PAPER_API = 'https://paper-api.alpaca.markets';
  const ALPACA_DATA_API = 'https://data.alpaca.markets';
  const ALPACA_ETF_MAP: Record<string, { etf: string; fallbackBase: number; step: number; atr: number }> = {
    MNQ: { etf: 'QQQ', fallbackBase: 515, step: 1.4, atr: 1.8 },
    MES: { etf: 'SPY', fallbackBase: 600, step: 1.1, atr: 1.4 },
    MGC: { etf: 'GLD', fallbackBase: 245, step: 0.8, atr: 1.0 },
    MYM: { etf: 'DIA', fallbackBase: 440, step: 1.0, atr: 1.2 },
  };
  const ETF_TO_FUTURES: Record<string, string> = {
    QQQ: 'MNQ',
    SPY: 'MES',
    GLD: 'MGC',
    DIA: 'MYM',
  };

  function getAlpacaHeaders(): Record<string, string> | null {
    const key = process.env.APCA_API_KEY_ID?.trim() ?? '';
    const secret = process.env.APCA_API_SECRET_KEY?.trim() ?? '';
    if (!key || !secret) return null;
    return {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  function buildEtfFallbackSnapshot(symbol: string, etfCfg: { etf: string; fallbackBase: number; step: number; atr: number }) {
    const nowSec = Math.floor(Date.now() / 1000);
    const candles: CandleBar[] = [];
    let price = etfCfg.fallbackBase - etfCfg.step * 1.2;
    const wave = [-0.3, 0.4, -0.5, 0.2, 0.6, -0.4, 0.3, 0.7, -0.2, -0.6, 0.5, 0.8, -0.3, 0.4, 0.5, -0.2, 0.4, 0.6];
    for (let i = 0; i < wave.length; i++) {
      const t = nowSec - (wave.length - 1 - i) * 300;
      const open = Number(price.toFixed(2));
      const close = Number((price + wave[i] * etfCfg.step).toFixed(2));
      const high = Number((Math.max(open, close) + etfCfg.step * 0.3).toFixed(2));
      const low = Number((Math.min(open, close) - etfCfg.step * 0.3).toFixed(2));
      candles.push({ time: t, label: formatEtTime(t), open, high, low, close, volume: 12000 });
      price = close;
    }
    const snap = computeSnapshotFromBars(symbol, candles, 'fallback', `ETF Proxy Reference (${etfCfg.etf})`);
    return { ...snap, displaySymbol: etfCfg.etf, unitLabel: 'shares' as const, yahooSymbol: etfCfg.etf };
  }

  app.get('/api/alpaca/market/:symbol', async (req, res) => {
    const rawSymbol = String(req.params.symbol || 'MNQ').toUpperCase();
    const symbol = ALPACA_ETF_MAP[rawSymbol] ? rawSymbol : 'MNQ';
    const etfCfg = ALPACA_ETF_MAP[symbol];
    const cacheKey = `alpaca_${etfCfg.etf}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const headers = getAlpacaHeaders();
    if (headers) {
      try {
        const [barsRes, tradeRes] = await Promise.all([
          fetch(`${ALPACA_DATA_API}/v2/stocks/${etfCfg.etf}/bars?timeframe=5Min&limit=48&feed=iex`, {
            headers,
            signal: AbortSignal.timeout(4000),
          }),
          fetch(`${ALPACA_DATA_API}/v2/stocks/${etfCfg.etf}/trades/latest?feed=iex`, {
            headers,
            signal: AbortSignal.timeout(4000),
          }),
        ]);
        if (barsRes.ok) {
          const barsJson = (await barsRes.json()) as {
            bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>;
          };
          const tradeJson = tradeRes.ok
            ? ((await tradeRes.json()) as { trade?: { p?: number } })
            : {};
          const rawBars = barsJson.bars ?? [];
          if (rawBars.length >= 2) {
            const parsed: CandleBar[] = rawBars.map((b) => {
              const t = Math.floor(new Date(b.t).getTime() / 1000);
              return {
                time: t,
                label: formatEtTime(t),
                open: Number(b.o.toFixed(2)),
                high: Number(b.h.toFixed(2)),
                low: Number(b.l.toFixed(2)),
                close: Number(b.c.toFixed(2)),
                volume: Math.max(1, Number(b.v) || 100),
              };
            });
            const latestPx = tradeJson.trade?.p;
            const snap = computeSnapshotFromBars(
              symbol,
              parsed,
              'alpaca-paper',
              `Alpaca IEX (${etfCfg.etf} ETF Proxy)`,
              latestPx && Number.isFinite(latestPx) ? { currentPrice: latestPx } : undefined
            );
            const enriched = { ...snap, displaySymbol: etfCfg.etf, unitLabel: 'shares' as const, yahooSymbol: etfCfg.etf };
            cache.set(cacheKey, { expiresAt: Date.now() + 15_000, data: enriched });
            res.json(enriched);
            return;
          }
        }
      } catch {
        // Fall through to Yahoo ETF feed
      }
    }

    // Fallback to Yahoo ETF quote (gives real QQQ/SPY/GLD/DIA bars even before Alpaca keys are set or outside IEX RTH)
    try {
      const yUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(etfCfg.etf)}?interval=5m&range=2d`;
      const yRes = await fetch(yUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (yRes.ok) {
        const yJson = (await yRes.json()) as {
          chart?: {
            result?: Array<{
              meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
              timestamp?: number[];
              indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> };
            }>;
          };
        };
        const result = yJson.chart?.result?.[0];
        const ts = result?.timestamp ?? [];
        const q = result?.indicators?.quote?.[0];
        if (result && q && ts.length > 0) {
          const parsed: CandleBar[] = [];
          for (let i = 0; i < ts.length; i++) {
            const o = q.open?.[i];
            const h = q.high?.[i];
            const l = q.low?.[i];
            const c = q.close?.[i];
            const v = q.volume?.[i] ?? 0;
            if (o == null || h == null || l == null || c == null) continue;
            parsed.push({
              time: ts[i],
              label: formatEtTime(ts[i]),
              open: Number(o.toFixed(2)),
              high: Number(h.toFixed(2)),
              low: Number(l.toFixed(2)),
              close: Number(c.toFixed(2)),
              volume: Number(v) || 1,
            });
          }
          if (parsed.length >= 4) {
            const snap = computeSnapshotFromBars(
              symbol,
              parsed,
              headers ? 'alpaca-paper' : 'live',
              headers ? `Alpaca Paper (${etfCfg.etf} ETF Proxy)` : `Public ${etfCfg.etf} ETF Feed`,
              {
                currentPrice: result.meta?.regularMarketPrice,
                previousClose: result.meta?.chartPreviousClose,
              }
            );
            const enriched = { ...snap, displaySymbol: etfCfg.etf, unitLabel: 'shares' as const, yahooSymbol: etfCfg.etf };
            cache.set(cacheKey, { expiresAt: Date.now() + 30_000, data: enriched });
            res.json(enriched);
            return;
          }
        }
      }
    } catch {
      // Fall through to baseline
    }

    res.json(buildEtfFallbackSnapshot(symbol, etfCfg));
  });

  app.get('/api/alpaca/portfolio', async (_req, res) => {
    const headers = getAlpacaHeaders();
    if (!headers) {
      res.json({
        configured: false,
        provider: 'alpaca',
        account: null,
        equity: null,
        buyingPower: null,
        updatedAt: Math.floor(Date.now() / 1000),
        positions: [],
        openOrders: [],
        closedFills: [],
      });
      return;
    }

    try {
      const [acctRes, posRes, openOrdRes, closedOrdRes] = await Promise.all([
        fetch(`${ALPACA_PAPER_API}/v2/account`, { headers, signal: AbortSignal.timeout(5000) }),
        fetch(`${ALPACA_PAPER_API}/v2/positions`, { headers, signal: AbortSignal.timeout(5000) }),
        fetch(`${ALPACA_PAPER_API}/v2/orders?status=open&nested=true&limit=50`, { headers, signal: AbortSignal.timeout(5000) }),
        fetch(`${ALPACA_PAPER_API}/v2/orders?status=closed&nested=true&limit=40&direction=desc`, { headers, signal: AbortSignal.timeout(5000) }),
      ]);

      if (!acctRes.ok) {
        const errText = await acctRes.text();
        res.status(acctRes.status).json({ configured: true, provider: 'alpaca', error: `Alpaca account error (${acctRes.status}): ${errText}` });
        return;
      }

      const acct = (await acctRes.json()) as { account_number?: string; equity?: string; buying_power?: string };
      const rawPositions = posRes.ok
        ? ((await posRes.json()) as Array<{
            symbol: string;
            qty: string;
            side: string;
            avg_entry_price: string;
            current_price: string;
            unrealized_pl: string;
          }>)
        : [];
      const rawOpen = openOrdRes.ok ? ((await openOrdRes.json()) as Array<Record<string, unknown>>) : [];
      const rawClosed = closedOrdRes.ok ? ((await closedOrdRes.json()) as Array<Record<string, unknown>>) : [];

      const posSideByEtf = new Map<string, 'long' | 'short'>();
      const positions = rawPositions.map((p) => {
        const qtyAbs = Math.abs(Number(p.qty) || 0);
        const signedQty = p.side === 'short' ? -qtyAbs : qtyAbs;
        posSideByEtf.set(p.symbol, p.side === 'short' ? 'short' : 'long');
        return {
          symbol: ETF_TO_FUTURES[p.symbol] ?? p.symbol,
          localSymbol: p.symbol,
          position: signedQty,
          avgEntryPrice: Number(Number(p.avg_entry_price).toFixed(2)),
          marketPrice: Number.isFinite(Number(p.current_price)) ? Number(Number(p.current_price).toFixed(2)) : null,
          unrealizedPnl: Number.isFinite(Number(p.unrealized_pl)) ? Number(Number(p.unrealized_pl).toFixed(2)) : null,
          realizedPnl: null,
        };
      });

      const openOrders: Array<Record<string, unknown>> = [];
      const seenOpenIds = new Set<string>();
      const pushOpenOrder = (ord: Record<string, unknown>, parentId: string, roleOverride?: 'ENTRY' | 'TP1' | 'SL') => {
        const id = String(ord.id ?? '');
        if (!id || seenOpenIds.has(id)) return;
        const st = String(ord.status ?? '');
        if (['filled', 'canceled', 'expired', 'replaced', 'done_for_day'].includes(st)) return;
        seenOpenIds.add(id);
        const sym = String(ord.symbol ?? '');
        const otype = String(ord.type ?? '').toLowerCase();
        const side = String(ord.side ?? '').toUpperCase();
        const posSide = posSideByEtf.get(sym);
        const inferredRole: 'ENTRY' | 'TP1' | 'SL' | 'ORDER' =
          roleOverride ??
          (otype.includes('stop')
            ? 'SL'
            : otype === 'limit' &&
                (String(ord.order_class ?? '') === 'oco' ||
                  String(ord.position_intent ?? '').includes('close') ||
                  (posSide === 'long' && side === 'SELL') ||
                  (posSide === 'short' && side === 'BUY'))
              ? 'TP1'
              : 'ENTRY');

        openOrders.push({
          orderId: id,
          parentId: parentId || '0',
          symbol: ETF_TO_FUTURES[sym] ?? sym,
          localSymbol: sym,
          action: side,
          orderType: otype.toUpperCase(),
          role: inferredRole,
          totalQuantity: Number(ord.qty) || 0,
          filled: Number(ord.filled_qty) || 0,
          remaining: Math.max(0, (Number(ord.qty) || 0) - (Number(ord.filled_qty) || 0)),
          lmtPrice: ord.limit_price != null ? Number(ord.limit_price) : null,
          auxPrice: ord.stop_price != null ? Number(ord.stop_price) : null,
          status: st,
        });
      };

      for (const o of rawOpen) {
        const oId = String(o.id ?? '');
        pushOpenOrder(o, '0', Array.isArray(o.legs) && o.legs.length > 0 ? 'ENTRY' : undefined);
        if (Array.isArray(o.legs)) {
          for (const leg of o.legs as Array<Record<string, unknown>>) {
            const ltype = String(leg.type ?? '').toLowerCase();
            pushOpenOrder(leg, oId, ltype.includes('stop') ? 'SL' : 'TP1');
          }
        }
      }

      const closedFills: Array<Record<string, unknown>> = [];
      const seenExecs = new Set<string>();
      for (const o of rawClosed) {
        const legs = Array.isArray(o.legs) ? (o.legs as Array<Record<string, unknown>>) : [];
        if (String(o.status ?? '') === 'filled' && legs.length > 0) {
          const entryAvg = Number(o.filled_avg_price);
          if (!Number.isFinite(entryAvg) || entryAvg <= 0) continue;
          const dir = String(o.side ?? '').toLowerCase() === 'buy' ? 'LONG' : 'SHORT';
          const sym = String(o.symbol ?? '');
          for (const leg of legs) {
            if (String(leg.status ?? '') !== 'filled') continue;
            const exitAvg = Number(leg.filled_avg_price);
            const qty = Math.round(Number(leg.filled_qty ?? o.filled_qty ?? 0));
            if (!Number.isFinite(exitAvg) || exitAvg <= 0 || qty <= 0) continue;
            const execId = `alpaca-${String(leg.id ?? '')}`;
            if (seenExecs.has(execId)) continue;
            seenExecs.add(execId);
            const ltype = String(leg.type ?? '').toLowerCase();
            const outcome = ltype.includes('stop') ? 'SL' : ltype === 'limit' ? 'TP1' : 'CUSTOM';
            const rpnl = dir === 'LONG' ? (exitAvg - entryAvg) * qty : (entryAvg - exitAvg) * qty;
            closedFills.push({
              execId,
              orderId: String(leg.id ?? ''),
              symbol: ETF_TO_FUTURES[sym] ?? sym,
              localSymbol: sym,
              direction: dir,
              contracts: qty,
              entryPrice: Number(entryAvg.toFixed(2)),
              exitPrice: Number(exitAvg.toFixed(2)),
              realizedPnl: Number(rpnl.toFixed(2)),
              commission: 0,
              outcome,
              timestamp: String(leg.filled_at ?? o.filled_at ?? new Date().toISOString()),
            });
          }
        }
      }

      res.json({
        configured: true,
        provider: 'alpaca',
        account: acct.account_number ?? 'Alpaca Paper',
        equity: acct.equity != null ? Number(Number(acct.equity).toFixed(2)) : null,
        buyingPower: acct.buying_power != null ? Number(Number(acct.buying_power).toFixed(2)) : null,
        updatedAt: Math.floor(Date.now() / 1000),
        positions,
        openOrders,
        closedFills,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Alpaca request failed';
      res.status(502).json({ configured: true, provider: 'alpaca', error: msg });
    }
  });

  app.post('/api/alpaca/order', async (req, res) => {
    const headers = getAlpacaHeaders();
    if (!headers) {
      res.status(400).json({ ok: false, error: 'Alpaca API keys not configured. Add APCA_API_KEY_ID and APCA_API_SECRET_KEY in Settings -> Secrets.' });
      return;
    }

    const body = (req.body ?? {}) as {
      symbol?: string;
      direction?: string;
      tp1Contracts?: number;
      runnerContracts?: number;
      entryPrice?: number;
      stopLossPrice?: number;
      tp1Price?: number;
      tp2Price?: number;
    };

    const sym = String(body.symbol ?? '').toUpperCase();
    const etfCfg = ALPACA_ETF_MAP[sym];
    if (!etfCfg) {
      res.status(400).json({ ok: false, error: `Unsupported symbol for Alpaca ETF mapping: ${sym}` });
      return;
    }

    const direction = String(body.direction ?? '').toUpperCase();
    if (direction !== 'LONG' && direction !== 'SHORT') {
      res.status(400).json({ ok: false, error: 'Direction must be LONG or SHORT' });
      return;
    }

    const tp1Qty = Math.round(Number(body.tp1Contracts ?? 0));
    const runnerQty = Math.round(Number(body.runnerContracts ?? 0));
    const totalQty = tp1Qty + runnerQty;
    if (totalQty <= 0 || totalQty > 1000) {
      res.status(400).json({ ok: false, error: `Invalid share quantity (${totalQty}). Must be 1–1000 shares.` });
      return;
    }

    const entryPx = Number(Number(body.entryPrice).toFixed(2));
    const slPx = Number(Number(body.stopLossPrice).toFixed(2));
    const tp1Px = Number(Number(body.tp1Price).toFixed(2));
    const tp2Px = Number(Number(body.tp2Price ?? body.tp1Price).toFixed(2));
    if (![entryPx, slPx, tp1Px, tp2Px].every((n) => Number.isFinite(n) && n > 0)) {
      res.status(400).json({ ok: false, error: 'Invalid price levels' });
      return;
    }

    const side = direction === 'LONG' ? 'buy' : 'sell';
    const orderIds: string[] = [];

    const submitLeg = async (qty: number, tpPx: number) => {
      const payload = {
        symbol: etfCfg.etf,
        qty: String(qty),
        side,
        type: 'limit',
        time_in_force: 'day',
        limit_price: entryPx.toFixed(2),
        order_class: 'bracket',
        take_profit: { limit_price: tpPx.toFixed(2) },
        stop_loss: { stop_price: slPx.toFixed(2) },
      };
      const apiRes = await fetch(`${ALPACA_PAPER_API}/v2/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000),
      });
      const json = (await apiRes.json()) as { id?: string; message?: string };
      if (!apiRes.ok || !json.id) {
        throw new Error(json.message ?? `Alpaca HTTP ${apiRes.status}`);
      }
      orderIds.push(json.id);
    };

    try {
      if (tp1Qty > 0) await submitLeg(tp1Qty, tp1Px);
      if (runnerQty > 0) await submitLeg(runnerQty, tp2Px);
      res.json({
        ok: true,
        account: 'Alpaca Paper',
        contract: etfCfg.etf,
        orderIds,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Alpaca order submission failed';
      res.status(400).json({ ok: false, error: msg });
    }
  });

  app.delete('/api/alpaca/orders/:orderId', async (req, res) => {
    const headers = getAlpacaHeaders();
    if (!headers) {
      res.status(400).json({ ok: false, error: 'Alpaca API keys not configured' });
      return;
    }
    const orderId = String(req.params.orderId ?? '');
    if (!/^[a-zA-Z0-9-]{6,64}$/.test(orderId)) {
      res.status(400).json({ ok: false, error: 'Invalid orderId' });
      return;
    }
    try {
      const apiRes = await fetch(`${ALPACA_PAPER_API}/v2/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!apiRes.ok && apiRes.status !== 204) {
        const text = await apiRes.text();
        res.status(apiRes.status).json({ ok: false, error: text || `HTTP ${apiRes.status}` });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Cancel failed' });
    }
  });

  app.delete('/api/alpaca/positions/:symbol', async (req, res) => {
    const headers = getAlpacaHeaders();
    if (!headers) {
      res.status(400).json({ ok: false, error: 'Alpaca API keys not configured' });
      return;
    }
    const raw = String(req.params.symbol ?? '').toUpperCase();
    const etf = ALPACA_ETF_MAP[raw]?.etf ?? (ETF_TO_FUTURES[raw] ? raw : '');
    if (!etf) {
      res.status(400).json({ ok: false, error: 'Unsupported position symbol' });
      return;
    }
    try {
      const apiRes = await fetch(`${ALPACA_PAPER_API}/v2/positions/${encodeURIComponent(etf)}`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!apiRes.ok) {
        const text = await apiRes.text();
        res.status(apiRes.status).json({ ok: false, error: text || `HTTP ${apiRes.status}` });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ ok: false, error: err instanceof Error ? err.message : 'Close position failed' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`LucidPlan 50K server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
