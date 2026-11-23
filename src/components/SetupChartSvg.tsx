import React, { useMemo, useState } from 'react';
import type { CandleBar, MarketSnapshot, TradeRecommendation } from '../types/trading';
import { getEffectiveSpec } from '../utils/strategyEngine';

interface SetupChartSvgProps {
  market: MarketSnapshot;
  recommendation: TradeRecommendation;
}

export const SetupChartSvg: React.FC<SetupChartSvgProps> = ({
  market,
  recommendation,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const spec = getEffectiveSpec(market.symbol, market.unitLabel);

  const width = 820;
  const height = 410;
  const padLeft = 18;
  const padRight = 94;
  const padTop = 22;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const candles: CandleBar[] = market.candles.slice(-40);

  const { minPrice, maxPrice, vwapSeries } = useMemo(() => {
    const prices: number[] = [
      recommendation.entryPrice,
      recommendation.stopLossPrice,
      recommendation.tp1Price,
      recommendation.tp2Price,
      market.orbHigh,
      market.orbLow,
      market.vwap,
    ];
    for (const c of candles) {
      prices.push(c.high, c.low);
    }
    const rawMin = Math.min(...prices);
    const rawMax = Math.max(...prices);
    const span = Math.max(spec.tickSize * 12, rawMax - rawMin);
    const padding = span * 0.1;

    // Running VWAP approximation across displayed bars anchored toward market.vwap
    let pv = 0;
    let vol = 0;
    const rawVwap: number[] = [];
    for (const c of candles) {
      const tp = (c.high + c.low + c.close) / 3;
      const w = c.volume > 0 ? c.volume : 1;
      pv += tp * w;
      vol += w;
      rawVwap.push(pv / vol);
    }
    const lastOffset = rawVwap.length > 0 ? market.vwap - rawVwap[rawVwap.length - 1] : 0;
    const adjustedVwap = rawVwap.map((v, i) => v + lastOffset * ((i + 1) / rawVwap.length));

    return {
      minPrice: rawMin - padding,
      maxPrice: rawMax + padding,
      vwapSeries: adjustedVwap,
    };
  }, [candles, market.orbHigh, market.orbLow, market.vwap, recommendation, spec.tickSize]);

  const yForPrice = (price: number): number => {
    const ratio = (price - minPrice) / (maxPrice - minPrice || 1);
    return padTop + plotH - ratio * plotH;
  };

  const xStep = candles.length > 0 ? plotW / candles.length : plotW;
  const candleWidth = Math.max(4, Math.min(11, xStep * 0.58));

  const yEntry = yForPrice(recommendation.entryPrice);
  const ySl = yForPrice(recommendation.stopLossPrice);
  const yTp1 = yForPrice(recommendation.tp1Price);
  const yTp2 = yForPrice(recommendation.tp2Price);
  const yOrbHigh = yForPrice(market.orbHigh);
  const yOrbLow = yForPrice(market.orbLow);

  const profitTop = Math.min(yEntry, yTp2);
  const profitHeight = Math.abs(yTp2 - yEntry);
  const riskTop = Math.min(yEntry, ySl);
  const riskHeight = Math.abs(ySl - yEntry);

  const vwapPath = vwapSeries
    .map((val, idx) => {
      const x = padLeft + idx * xStep + xStep / 2;
      const y = yForPrice(val);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const yTicks = Array.from({ length: 6 }, (_, i) => {
    const p = minPrice + ((maxPrice - minPrice) * i) / 5;
    return { price: p, y: yForPrice(p) };
  });

  const hoveredCandle = hoverIdx !== null ? candles[hoverIdx] : null;

  const axisTags: Array<{
    label: string;
    price: number;
    y: number;
    bg: string;
    text: string;
  }> = [
    {
      label: 'TP2',
      price: recommendation.tp2Price,
      y: yTp2,
      bg: '#059669',
      text: '#ECFDF5',
    },
    {
      label: 'TP1',
      price: recommendation.tp1Price,
      y: yTp1,
      bg: '#10B981',
      text: '#052E16',
    },
    {
      label: 'ENTRY',
      price: recommendation.entryPrice,
      y: yEntry,
      bg: '#0284C7',
      text: '#F0F9FF',
    },
    {
      label: 'SL',
      price: recommendation.stopLossPrice,
      y: ySl,
      bg: '#E11D48',
      text: '#FFF1F2',
    },
  ];

  // Prevent right-axis tags from overlapping vertically
  const sortedTags = [...axisTags].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sortedTags.length; i++) {
    if (sortedTags[i].y - sortedTags[i - 1].y < 20) {
      sortedTags[i].y = sortedTags[i - 1].y + 20;
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span className="font-display text-sm font-semibold text-slate-100">
            {market.displaySymbol ? `${market.displaySymbol} (${market.symbol} Proxy)` : market.symbol} 5m Trade Structure
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-slate-400">
            {market.feedDelayLabel
              ? market.feedDelayLabel
              : market.source === 'live'
                ? `Live CME Proxy (${market.yahooSymbol})`
                : 'Session Structure Reference'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-xs bg-emerald-500/35 border border-emerald-400" />
            Profit Zone
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-xs bg-rose-500/35 border border-rose-400" />
            Stop Risk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-amber-400" />
            Session VWAP
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 border-t border-dashed border-slate-400" />
            ORB Range
          </span>
        </div>
      </div>

      {/* Hover bar or latest bar readout */}
      <div className="mb-2 flex h-5 items-center justify-between font-mono text-[11px] text-slate-400 tabular-nums">
        {hoveredCandle ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-200">{hoveredCandle.label} ET</span>
            <span>O {hoveredCandle.open.toFixed(spec.decimals)}</span>
            <span>H {hoveredCandle.high.toFixed(spec.decimals)}</span>
            <span>L {hoveredCandle.low.toFixed(spec.decimals)}</span>
            <span className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400' : 'text-rose-400'}>
              C {hoveredCandle.close.toFixed(spec.decimals)}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span>Last {market.currentPrice.toFixed(spec.decimals)}</span>
            <span>ORB H {market.orbHigh.toFixed(spec.decimals)}</span>
            <span>ORB L {market.orbLow.toFixed(spec.decimals)}</span>
            <span>VWAP {market.vwap.toFixed(spec.decimals)}</span>
            <span>5m ATR {market.atrPoints.toFixed(spec.decimals)} pts</span>
          </div>
        )}
      </div>

      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full select-none"
          role="img"
          aria-label={`${market.symbol} trade setup candlestick chart showing entry, stop loss, and take profit projections`}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Background plot */}
          <rect
            x={padLeft}
            y={padTop}
            width={plotW}
            height={plotH}
            fill="#0B111E"
            stroke="#1E293B"
            strokeWidth={1}
          />

          {/* Horizontal price grid */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                x2={padLeft + plotW}
                y1={tick.y}
                y2={tick.y}
                stroke="#1E293B"
                strokeWidth={1}
                strokeDasharray="2 4"
              />
              <text
                x={padLeft + plotW + 6}
                y={tick.y + 3.5}
                fill="#64748B"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {tick.price.toFixed(spec.decimals)}
              </text>
            </g>
          ))}

          {/* Shaded Profit & Stop Zones */}
          <rect
            x={padLeft}
            y={profitTop}
            width={plotW}
            height={Math.max(2, profitHeight)}
            fill="#10B981"
            fillOpacity={0.11}
          />
          <rect
            x={padLeft}
            y={riskTop}
            width={plotW}
            height={Math.max(2, riskHeight)}
            fill="#F43F5E"
            fillOpacity={0.12}
          />

          {/* ORB High / Low reference lines */}
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={yOrbHigh}
            y2={yOrbHigh}
            stroke="#64748B"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={yOrbLow}
            y2={yOrbLow}
            stroke="#64748B"
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {/* Session VWAP curve */}
          {vwapPath && (
            <path
              d={vwapPath}
              fill="none"
              stroke="#F59E0B"
              strokeWidth={1.6}
              strokeOpacity={0.85}
            />
          )}

          {/* Candlesticks */}
          {candles.map((c, idx) => {
            const cx = padLeft + idx * xStep + xStep / 2;
            const yH = yForPrice(c.high);
            const yL = yForPrice(c.low);
            const yO = yForPrice(c.open);
            const yC = yForPrice(c.close);
            const isUp = c.close >= c.open;
            const color = isUp ? '#10B981' : '#F43F5E';
            const bodyTop = Math.min(yO, yC);
            const bodyH = Math.max(2, Math.abs(yO - yC));
            const isHovered = hoverIdx === idx;

            return (
              <g key={c.time + '-' + idx}>
                {isHovered && (
                  <line
                    x1={cx}
                    x2={cx}
                    y1={padTop}
                    y2={padTop + plotH}
                    stroke="#334155"
                    strokeWidth={1}
                  />
                )}
                <line
                  x1={cx}
                  x2={cx}
                  y1={yH}
                  y2={yL}
                  stroke={color}
                  strokeWidth={1.3}
                />
                <rect
                  x={cx - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyH}
                  fill={color}
                  fillOpacity={isUp ? 0.85 : 0.9}
                  rx={1}
                />
                {/* Invisible hit column for smooth hover */}
                <rect
                  x={padLeft + idx * xStep}
                  y={padTop}
                  width={xStep}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(idx)}
                />
              </g>
            );
          })}

          {/* Horizontal Strategy Level Lines */}
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={yTp2}
            y2={yTp2}
            stroke="#059669"
            strokeWidth={1.5}
          />
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={yTp1}
            y2={yTp1}
            stroke="#10B981"
            strokeWidth={1.25}
            strokeDasharray="6 3"
          />
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={yEntry}
            y2={yEntry}
            stroke="#38BDF8"
            strokeWidth={1.75}
          />
          <line
            x1={padLeft}
            x2={padLeft + plotW}
            y1={ySl}
            y2={ySl}
            stroke="#F43F5E"
            strokeWidth={1.5}
          />

          {/* Right Axis Callout Badges */}
          {sortedTags.map((tag) => (
            <g key={tag.label} transform={`translate(${padLeft + plotW + 3}, ${tag.y - 9})`}>
              <rect
                width={88}
                height={18}
                rx={3}
                fill={tag.bg}
              />
              <text
                x={5}
                y={12.5}
                fill={tag.text}
                fontSize="9.5"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                {tag.label} {tag.price.toFixed(spec.decimals)}
              </text>
            </g>
          ))}

          {/* X-Axis Timestamps */}
          {candles.map((c, idx) => {
            if (idx % 7 !== 0 && idx !== candles.length - 1) return null;
            const cx = padLeft + idx * xStep + xStep / 2;
            return (
              <text
                key={idx}
                x={cx}
                y={height - 10}
                textAnchor="middle"
                fill="#64748B"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {c.label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
