import type { CandleBar, InstrumentSymbol, MarketSnapshot } from '../types/trading';
import { INSTRUMENT_SPECS } from './strategyEngine';

export function formatEtBarTime(unixSeconds: number): string {
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

function getEtParts(unixSeconds: number): { hour: number; minute: number; dateKey: string } {
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
  for (const p of parts) map[p.type] = p.value;
  return {
    hour: Number(map.hour ?? 0),
    minute: Number(map.minute ?? 0),
    dateKey: `${map.year}-${map.month}-${map.day}`,
  };
}

export interface LocalBridgePayload {
  symbol: InstrumentSymbol;
  delayed?: boolean;
  price?: number;
  candles?: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
}

export function buildSnapshotFromLocalBridge(
  payload: LocalBridgePayload,
  prevSnapshot?: MarketSnapshot
): MarketSnapshot {
  const symbol = payload.symbol;
  const spec = INSTRUMENT_SPECS[symbol];
  const rawBars = Array.isArray(payload.candles) ? payload.candles : [];

  let bars: CandleBar[] = rawBars
    .filter(
      (c) =>
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    )
    .slice(-48)
    .map((c) => ({
      time: c.time,
      label: formatEtBarTime(c.time),
      open: Number(c.open.toFixed(spec.decimals)),
      high: Number(c.high.toFixed(spec.decimals)),
      low: Number(c.low.toFixed(spec.decimals)),
      close: Number(c.close.toFixed(spec.decimals)),
      volume: Math.max(1, Number(c.volume) || 100),
    }));

  const tickPrice =
    payload.price && Number.isFinite(payload.price) && payload.price > 0
      ? Number(payload.price.toFixed(spec.decimals))
      : undefined;

  if (bars.length < 2 && tickPrice) {
    // Build or update rolling intraday bars anchored to the live/delayed IBKR price
    const nowSec = Math.floor(Date.now() / 1000);
    if (prevSnapshot && prevSnapshot.symbol === symbol && Math.abs(prevSnapshot.currentPrice - tickPrice) < tickPrice * 0.1) {
      bars = [...prevSnapshot.candles];
      const last = bars[bars.length - 1];
      if (last && nowSec - last.time < 300) {
        bars[bars.length - 1] = {
          ...last,
          high: Math.max(last.high, tickPrice),
          low: Math.min(last.low, tickPrice),
          close: tickPrice,
          volume: last.volume + 120,
        };
      } else {
        bars.push({
          time: nowSec,
          label: formatEtBarTime(nowSec),
          open: last ? last.close : tickPrice,
          high: tickPrice,
          low: tickPrice,
          close: tickPrice,
          volume: 400,
        });
      }
    } else {
      const step = spec.defaultStopPts * 0.4;
      const wave = [-0.4, 0.3, -0.2, 0.5, -0.3, 0.2, 0.4, -0.2, 0.3, 0.2, -0.1, 0.2];
      let p = tickPrice - wave.reduce((a, b) => a + b, 0) * step;
      bars = wave.map((w, idx) => {
        const t = nowSec - (wave.length - 1 - idx) * 300;
        const open = Number(p.toFixed(spec.decimals));
        const close = idx === wave.length - 1 ? tickPrice : Number((p + w * step).toFixed(spec.decimals));
        const high = Number((Math.max(open, close) + step * 0.25).toFixed(spec.decimals));
        const low = Number((Math.min(open, close) - step * 0.25).toFixed(spec.decimals));
        p = close;
        return {
          time: t,
          label: formatEtBarTime(t),
          open,
          high,
          low,
          close,
          volume: 1200,
        };
      });
    }
  }

  const lastBar = bars[bars.length - 1];
  const currentPrice = tickPrice ?? lastBar.close;
  const previousClose = bars[0]?.open ?? currentPrice;

  const latestEt = getEtParts(lastBar.time);
  const todayBars = bars.filter((b) => getEtParts(b.time).dateKey === latestEt.dateKey);
  const activeDayBars = todayBars.length >= 4 ? todayBars : bars;

  const orbBars = activeDayBars.filter((b) => {
    const et = getEtParts(b.time);
    const mins = et.hour * 60 + et.minute;
    return mins >= 9 * 60 + 30 && mins < 9 * 60 + 45;
  });
  const orbRef = orbBars.length > 0 ? orbBars : activeDayBars.slice(0, Math.min(3, activeDayBars.length));
  const orbHigh = Math.max(...orbRef.map((b) => b.high));
  const orbLow = Math.min(...orbRef.map((b) => b.low));

  const preNyBars = activeDayBars.filter((b) => {
    const et = getEtParts(b.time);
    return et.hour * 60 + et.minute < 9 * 60 + 30;
  });
  const overnightRef = preNyBars.length > 0 ? preNyBars : bars.slice(0, Math.min(12, bars.length));
  const overnightHigh = Math.max(...overnightRef.map((b) => b.high));
  const overnightLow = Math.min(...overnightRef.map((b) => b.low));

  const sessionHigh = Math.max(...activeDayBars.map((b) => b.high));
  const sessionLow = Math.min(...activeDayBars.map((b) => b.low));

  let pv = 0;
  let vol = 0;
  for (const b of activeDayBars) {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vol += b.volume;
  }
  const vwap = Number((pv / (vol || 1)).toFixed(spec.decimals));

  const atrSlice = bars.slice(-15);
  let trSum = 0;
  let trCount = 0;
  for (let i = 1; i < atrSlice.length; i++) {
    const cur = atrSlice[i];
    const prev = atrSlice[i - 1];
    trSum += Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trCount++;
  }
  const atrPoints = Number(
    Math.max(spec.defaultStopPts * 0.35, trCount > 0 ? trSum / trCount : spec.defaultStopPts * 0.75).toFixed(
      spec.decimals
    )
  );

  const isDelayed = payload.delayed !== false;

  return {
    symbol,
    yahooSymbol: spec.yahooSymbol,
    source: isDelayed ? 'ibkr-delayed' : 'ibkr-live',
    feedDelayLabel: isDelayed
      ? 'IB Gateway Local (10m Delayed)'
      : 'IB Gateway Local (Live CME)',
    waitingForFeed: false,
    fetchedAt: new Date().toISOString(),
    currentPrice,
    previousClose,
    change: Number((currentPrice - previousClose).toFixed(spec.decimals)),
    changePct: Number((((currentPrice - previousClose) / (previousClose || 1)) * 100).toFixed(2)),
    vwap,
    orbHigh,
    orbLow,
    sessionHigh,
    sessionLow,
    overnightHigh,
    overnightLow,
    atrPoints,
    candles: bars,
  };
}
