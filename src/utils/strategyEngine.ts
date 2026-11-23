import type {
  AccountMetrics,
  AccountSettings,
  DailyEquityPoint,
  InstrumentSpec,
  InstrumentSymbol,
  LoggedTrade,
  MarketSnapshot,
  SetupType,
  TradeDirection,
  TradeRecommendation,
} from '../types/trading';

export const INSTRUMENT_SPECS: Record<InstrumentSymbol, InstrumentSpec> = {
  MNQ: {
    symbol: 'MNQ',
    name: 'Micro E-mini Nasdaq-100',
    yahooSymbol: 'NQ=F',
    pointValue: 2,
    tickSize: 0.25,
    tickValue: 0.5,
    defaultStopPts: 22,
    minStopPts: 10,
    maxStopPts: 45,
    decimals: 2,
  },
  MES: {
    symbol: 'MES',
    name: 'Micro E-mini S&P 500',
    yahooSymbol: 'ES=F',
    pointValue: 5,
    tickSize: 0.25,
    tickValue: 1.25,
    defaultStopPts: 10,
    minStopPts: 4,
    maxStopPts: 22,
    decimals: 2,
  },
  MGC: {
    symbol: 'MGC',
    name: 'Micro Gold',
    yahooSymbol: 'GC=F',
    pointValue: 10,
    tickSize: 0.1,
    tickValue: 1.0,
    defaultStopPts: 6,
    minStopPts: 2.5,
    maxStopPts: 15,
    decimals: 1,
  },
  MYM: {
    symbol: 'MYM',
    name: 'Micro E-mini Dow',
    yahooSymbol: 'YM=F',
    pointValue: 0.5,
    tickSize: 1.0,
    tickValue: 0.5,
    defaultStopPts: 60,
    minStopPts: 25,
    maxStopPts: 140,
    decimals: 0,
  },
};

export const ALPACA_ETF_SPECS: Record<InstrumentSymbol, InstrumentSpec> = {
  MNQ: {
    symbol: 'MNQ',
    name: 'QQQ Nasdaq-100 ETF (Alpaca Proxy)',
    yahooSymbol: 'QQQ',
    pointValue: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    defaultStopPts: 1.8,
    minStopPts: 0.5,
    maxStopPts: 8.0,
    decimals: 2,
  },
  MES: {
    symbol: 'MES',
    name: 'SPY S&P 500 ETF (Alpaca Proxy)',
    yahooSymbol: 'SPY',
    pointValue: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    defaultStopPts: 1.4,
    minStopPts: 0.4,
    maxStopPts: 6.0,
    decimals: 2,
  },
  MGC: {
    symbol: 'MGC',
    name: 'GLD Gold ETF (Alpaca Proxy)',
    yahooSymbol: 'GLD',
    pointValue: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    defaultStopPts: 1.0,
    minStopPts: 0.3,
    maxStopPts: 4.5,
    decimals: 2,
  },
  MYM: {
    symbol: 'MYM',
    name: 'DIA Dow ETF (Alpaca Proxy)',
    yahooSymbol: 'DIA',
    pointValue: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    defaultStopPts: 1.2,
    minStopPts: 0.4,
    maxStopPts: 5.0,
    decimals: 2,
  },
};

export function getEffectiveSpec(symbol: InstrumentSymbol, unitLabel?: 'micros' | 'shares'): InstrumentSpec {
  return unitLabel === 'shares' ? ALPACA_ETF_SPECS[symbol] : INSTRUMENT_SPECS[symbol];
}

export function roundToTick(price: number, tickSize: number, decimals: number): number {
  const rounded = Math.round(price / tickSize) * tickSize;
  return Number(rounded.toFixed(decimals));
}

export function getEtDateString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getNySessionState(now = new Date()): {
  etTimeFormatted: string;
  windowLabel: string;
  inOptimalWindow: boolean;
  isMarketOpen: boolean;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekday = map.weekday ?? 'Mon';
  const hour = Number(map.hour ?? 0);
  const minute = Number(map.minute ?? 0);
  const mins = hour * 60 + minute;

  const etTimeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${map.second ?? '00'} ET`;
  const isWeekend = weekday === 'Sat' || (weekday === 'Sun' && hour < 18) || (weekday === 'Fri' && hour >= 17);
  const isMaintenance = hour === 17; // CME 5:00-6:00 PM ET break

  if (isWeekend) {
    return {
      etTimeFormatted,
      windowLabel: 'Weekend CME Closed',
      inOptimalWindow: false,
      isMarketOpen: false,
    };
  }
  if (isMaintenance) {
    return {
      etTimeFormatted,
      windowLabel: 'CME Daily Break (5–6 PM ET)',
      inOptimalWindow: false,
      isMarketOpen: false,
    };
  }
  if (mins >= 9 * 60 + 30 && mins <= 11 * 60 + 30) {
    return {
      etTimeFormatted,
      windowLabel: 'NY Open Prime Window (9:30–11:30 ET)',
      inOptimalWindow: true,
      isMarketOpen: true,
    };
  }
  if (mins >= 8 * 60 && mins < 9 * 60 + 30) {
    return {
      etTimeFormatted,
      windowLabel: 'Pre-Market Prep (Wait for 9:30 Open)',
      inOptimalWindow: false,
      isMarketOpen: true,
    };
  }
  if (mins > 11 * 60 + 30 && mins < 16 * 60) {
    return {
      etTimeFormatted,
      windowLabel: 'Afternoon / Lunch Session (Low Priority)',
      inOptimalWindow: false,
      isMarketOpen: true,
    };
  }
  return {
    etTimeFormatted,
    windowLabel: 'Overnight Globex Session',
    inOptimalWindow: false,
    isMarketOpen: true,
  };
}

export function computeAccountMetrics(
  trades: LoggedTrade[],
  settings: AccountSettings
): AccountMetrics {
  const startingBalance = 50000;
  const maxDrawdown = 2000;
  const lockTriggerEod = 52100;
  const lockedFloor = 50100;
  const baseTargetProfit = 3000;

  // Group trades by date sorted ascending
  const byDate = new Map<string, number>();
  for (const t of trades) {
    byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.netPnl);
  }
  if (!byDate.has(settings.activeDate)) {
    byDate.set(settings.activeDate, 0);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  const maxSingleDayAllowed = Math.round(baseTargetProfit * (settings.consistencyCapPct / 100));
  const safeDailyProfitLock = maxSingleDayAllowed - 100;

  let runningBalance = startingBalance;
  let highestEod = startingBalance;
  let currentFloor = startingBalance - maxDrawdown;
  let bestDayPnl = 0;
  let locked = false;

  const dailyHistory: DailyEquityPoint[] = sortedDates.map((date, idx) => {
    const dailyPnl = Number((byDate.get(date) ?? 0).toFixed(2));
    runningBalance = Number((runningBalance + dailyPnl).toFixed(2));
    if (dailyPnl > bestDayPnl) bestDayPnl = dailyPnl;
    if (runningBalance > highestEod) highestEod = runningBalance;

    if (locked || highestEod >= lockTriggerEod) {
      locked = true;
      currentFloor = lockedFloor;
    } else {
      currentFloor = Math.min(lockedFloor, Math.max(currentFloor, highestEod - maxDrawdown));
    }

    return {
      date,
      dayNumber: idx + 1,
      dailyPnl,
      eodBalance: runningBalance,
      eodDrawdownFloor: Number(currentFloor.toFixed(2)),
      isLocked: locked,
      exceededConsistency: dailyPnl > maxSingleDayAllowed,
    };
  });

  const totalNetPnl = Number((runningBalance - startingBalance).toFixed(2));
  const todayTrades = trades.filter((t) => t.date === settings.activeDate);
  const todayNetPnl = Number(todayTrades.reduce((acc, t) => acc + t.netPnl, 0).toFixed(2));

  // LucidFlex consistency adjustment if best single day exceeds threshold
  const effectiveTargetProfit =
    bestDayPnl > maxSingleDayAllowed
      ? Math.ceil(bestDayPnl / (settings.consistencyCapPct / 100))
      : baseTargetProfit;

  const effectiveTargetBalance = startingBalance + effectiveTargetProfit;
  const drawdownBufferRemaining = Number(Math.max(0, runningBalance - currentFloor).toFixed(2));
  const progressToTargetPct = Number(
    Math.max(0, Math.min(100, (totalNetPnl / effectiveTargetProfit) * 100)).toFixed(1)
  );

  const phase: AccountMetrics['phase'] =
    totalNetPnl >= effectiveTargetProfit
      ? 'Target Reached'
      : totalNetPnl >= 1200
        ? 'Phase 2 (Cruise to Target)'
        : 'Phase 1 (Build Cushion)';

  const remainingConsistencySafe = Number(Math.max(0, safeDailyProfitLock - todayNetPnl).toFixed(2));
  const remainingConsistencyHard = Number(Math.max(0, maxSingleDayAllowed - todayNetPnl).toFixed(2));

  // Personal daily loss remaining: $400 cap from day open
  const remainingPersonalLoss = Number(
    Math.max(0, Math.min(drawdownBufferRemaining, settings.personalDailyLossCap + Math.min(0, todayNetPnl))).toFixed(2)
  );
  const remainingDll = settings.dllEnabled
    ? Number(Math.max(0, settings.dllAmount + Math.min(0, todayNetPnl)).toFixed(2))
    : drawdownBufferRemaining;

  const consistencyStatus: AccountMetrics['consistencyStatus'] =
    todayNetPnl > maxSingleDayAllowed
      ? 'EXCEEDED'
      : todayNetPnl >= safeDailyProfitLock
        ? 'WARNING'
        : 'SAFE';

  return {
    startingBalance,
    baseTargetBalance: startingBalance + baseTargetProfit,
    effectiveTargetBalance,
    effectiveTargetProfit,
    currentBalance: runningBalance,
    totalNetPnl,
    highestEodBalance: highestEod,
    currentEodFloor: currentFloor,
    isDrawdownLocked: locked,
    drawdownBufferRemaining,
    progressToTargetPct,
    phase,
    todayNetPnl,
    todayTradesCount: todayTrades.length,
    bestDayPnl,
    maxSingleDayAllowed,
    safeDailyProfitLock,
    remainingConsistencySafe,
    remainingConsistencyHard,
    remainingPersonalLoss,
    remainingDll,
    dailyHistory,
    consistencyStatus,
  };
}

export interface StrategyPlanInputs {
  market: MarketSnapshot;
  setup: SetupType;
  directionChoice: TradeDirection;
  metrics: AccountMetrics;
  settings: AccountSettings;
  customEntryPrice?: number | null;
  customStopPoints?: number | null;
}

export function buildTradeRecommendation(inputs: StrategyPlanInputs): TradeRecommendation {
  const { market, setup, directionChoice, metrics, settings, customEntryPrice, customStopPoints } = inputs;
  const isShares = market.unitLabel === 'shares';
  const spec = getEffectiveSpec(market.symbol, market.unitLabel);
  const tickerLabel = market.displaySymbol ?? spec.symbol;
  const unitNoun = isShares ? 'shares' : 'micros';

  // 1. Determine directional bias
  let direction: 'LONG' | 'SHORT' = 'LONG';
  if (directionChoice === 'LONG' || directionChoice === 'SHORT') {
    direction = directionChoice;
  } else {
    if (setup === 'ORB_RETEST') {
      direction = market.currentPrice >= (market.orbHigh + market.orbLow) / 2 ? 'LONG' : 'SHORT';
    } else if (setup === 'LIQUIDITY_SWEEP') {
      const distToLow = Math.abs(market.currentPrice - market.overnightLow);
      const distToHigh = Math.abs(market.overnightHigh - market.currentPrice);
      direction = distToLow <= distToHigh ? 'LONG' : 'SHORT';
    } else {
      direction = market.currentPrice >= market.vwap ? 'LONG' : 'SHORT';
    }
  }

  // 2. Determine Entry & Stop Loss Distance
  let rawEntry = market.currentPrice;
  let suggestedStopPts = Math.min(
    spec.maxStopPts,
    Math.max(spec.minStopPts, Number((market.atrPoints * 1.25).toFixed(spec.decimals)))
  );

  let setupTitle = '';
  let rationale = '';

  if (setup === 'ORB_RETEST') {
    setupTitle = 'Opening Range Breakout + Retest';
    if (direction === 'LONG') {
      rawEntry = market.currentPrice > market.orbHigh
        ? Math.max(market.orbHigh, market.currentPrice - market.atrPoints * 0.35)
        : market.orbHigh;
      rationale = `Wait for a pullback into the ${roundToTick(rawEntry, spec.tickSize, spec.decimals)} ORB High retest zone. Stop rests safely below the Opening Range midpoint so normal wick noise doesn't tag you out.`;
    } else {
      rawEntry = market.currentPrice < market.orbLow
        ? Math.min(market.orbLow, market.currentPrice + market.atrPoints * 0.35)
        : market.orbLow;
      rationale = `Wait for a weak bounce into the ${roundToTick(rawEntry, spec.tickSize, spec.decimals)} ORB Low breakdown zone. Stop rests above range structure to avoid getting wicked by opening volatility.`;
    }
  } else if (setup === 'LIQUIDITY_SWEEP') {
    setupTitle = 'Liquidity Sweep + Market Structure Shift';
    if (direction === 'LONG') {
      rawEntry = Math.max(market.overnightLow + market.atrPoints * 0.2, market.currentPrice - market.atrPoints * 0.25);
      rationale = `Look for price to sweep below the ${market.overnightLow.toFixed(spec.decimals)} pre-market low and reclaim back inside on a 5m close. Enter on the first higher-low pullback.`;
    } else {
      rawEntry = Math.min(market.overnightHigh - market.atrPoints * 0.2, market.currentPrice + market.atrPoints * 0.25);
      rationale = `Look for price to spike above the ${market.overnightHigh.toFixed(spec.decimals)} pre-market high and snap back inside on a 5m close. Enter short on the lower-high retest.`;
    }
  } else {
    setupTitle = 'Session VWAP Pullback Continuation';
    rawEntry = market.vwap;
    rationale = direction === 'LONG'
      ? `Price is holding bullish bias above/near Session VWAP (${market.vwap.toFixed(spec.decimals)}). Place a limit buy at VWAP instead of chasing extended candles.`
      : `Price is holding bearish bias below/near Session VWAP (${market.vwap.toFixed(spec.decimals)}). Place a limit sell on a pullback into VWAP.`;
  }

  if (customEntryPrice && Number.isFinite(customEntryPrice) && customEntryPrice > 0) {
    rawEntry = customEntryPrice;
  }
  if (customStopPoints && Number.isFinite(customStopPoints) && customStopPoints > 0) {
    suggestedStopPts = Math.min(spec.maxStopPts * 1.5, Math.max(spec.tickSize * 4, customStopPoints));
  }

  const entryPrice = roundToTick(rawEntry, spec.tickSize, spec.decimals);
  const stopPoints = roundToTick(suggestedStopPts, spec.tickSize, spec.decimals);
  const stopLossPrice = roundToTick(
    direction === 'LONG' ? entryPrice - stopPoints : entryPrice + stopPoints,
    spec.tickSize,
    spec.decimals
  );

  const entryZoneHalf = roundToTick(Math.max(spec.tickSize * 2, stopPoints * 0.15), spec.tickSize, spec.decimals);
  const entryZoneLow = roundToTick(entryPrice - entryZoneHalf, spec.tickSize, spec.decimals);
  const entryZoneHigh = roundToTick(entryPrice + entryZoneHalf, spec.tickSize, spec.decimals);

  // 3. Guardrail / Stand-Down checks
  let status: TradeRecommendation['status'] = 'READY';
  let standDownReason: string | undefined;

  if (metrics.totalNetPnl >= metrics.effectiveTargetProfit) {
    status = 'STAND_DOWN';
    standDownReason = 'Profit target reached ($53,000+). Stop trading and submit for funded transition.';
  } else if (metrics.drawdownBufferRemaining < 150) {
    status = 'STAND_DOWN';
    standDownReason = 'EOD Drawdown buffer critically low (< $150). Stand down to prevent account breach.';
  } else if (metrics.remainingPersonalLoss < 75) {
    status = 'STAND_DOWN';
    standDownReason = `Personal daily loss cap (-$${settings.personalDailyLossCap}) reached. Close charts and return tomorrow.`;
  } else if (settings.maxTradesPerDay > 0 && metrics.todayTradesCount >= settings.maxTradesPerDay) {
    status = 'STAND_DOWN';
    standDownReason = `Max ${settings.maxTradesPerDay} trades taken today. Protecting discipline and preventing overtrading.`;
  } else if (metrics.remainingConsistencySafe < 100) {
    status = 'STAND_DOWN';
    standDownReason = `Today's profit (+$${metrics.todayNetPnl.toFixed(0)}) is at the $${metrics.safeDailyProfitLock} consistency lock. Stop now so you don't inflate your $3,000 target.`;
  }

  // 4. Contract / Share Sizing (scaled to Phase & remaining risk)
  const riskPerContractDollars = Number((stopPoints * spec.pointValue).toFixed(2));
  const phaseCapUnits = isShares
    ? 500
    : metrics.phase === 'Phase 1 (Build Cushion)'
      ? 5
      : 8;
  const maxAllowedRiskBudget = Math.min(
    settings.baseRiskPerTrade,
    metrics.remainingPersonalLoss,
    Math.max(0, metrics.drawdownBufferRemaining * 0.25)
  );

  let totalContracts =
    status === 'STAND_DOWN'
      ? 0
      : Math.max(1, Math.min(phaseCapUnits, Math.floor(maxAllowedRiskBudget / (riskPerContractDollars || 1))));

  // If 1 unit exceeds remaining personal loss, warn or reduce
  if (status !== 'STAND_DOWN' && totalContracts * riskPerContractDollars > metrics.remainingPersonalLoss) {
    totalContracts = Math.floor(metrics.remainingPersonalLoss / (riskPerContractDollars || 1));
    if (totalContracts <= 0) {
      status = 'STAND_DOWN';
      standDownReason = `Remaining daily loss budget ($${metrics.remainingPersonalLoss.toFixed(0)}) is smaller than 1 ${isShares ? 'share' : 'micro contract'} stop ($${riskPerContractDollars.toFixed(2)}). Tighten stop or stop for today.`;
    }
  }

  const totalRiskDollars = Number((totalContracts * riskPerContractDollars).toFixed(2));

  // 5. Target Projections & Consistency Ceiling Auto-Cap
  const tp1Contracts = totalContracts <= 1 ? totalContracts : Math.ceil(totalContracts * 0.6);
  const runnerContracts = Math.max(0, totalContracts - tp1Contracts);

  let tp1R = totalContracts <= 1 ? 2.0 : 1.5;
  let tp2R = totalContracts <= 1 ? 2.0 : 2.5;
  let consistencyCapped = false;

  const rawTp1Dollars = tp1Contracts * riskPerContractDollars * tp1R;
  const rawTp2Dollars = runnerContracts * riskPerContractDollars * tp2R;
  const rawTotalProfit = rawTp1Dollars + rawTp2Dollars;

  if (totalContracts > 0 && rawTotalProfit > metrics.remainingConsistencySafe) {
    consistencyCapped = true;
    status = 'CAUTION';
    // Scale R down proportionally so total projected profit stays inside safeDailyProfitLock
    const safeBudget = Math.max(50, metrics.remainingConsistencySafe);
    const scaleFactor = safeBudget / (rawTotalProfit || 1);
    tp1R = Math.max(0.8, Number((tp1R * scaleFactor).toFixed(2)));
    tp2R = Math.max(1.0, Number((tp2R * scaleFactor).toFixed(2)));
  }

  const tp1Points = roundToTick(stopPoints * tp1R, spec.tickSize, spec.decimals);
  const tp2Points = roundToTick(stopPoints * tp2R, spec.tickSize, spec.decimals);

  const tp1Price = roundToTick(
    direction === 'LONG' ? entryPrice + tp1Points : entryPrice - tp1Points,
    spec.tickSize,
    spec.decimals
  );
  const tp2Price = roundToTick(
    direction === 'LONG' ? entryPrice + tp2Points : entryPrice - tp2Points,
    spec.tickSize,
    spec.decimals
  );

  const projectedTp1Dollars = Number((tp1Contracts * tp1Points * spec.pointValue).toFixed(2));
  const projectedTp2Dollars = Number((runnerContracts * tp2Points * spec.pointValue).toFixed(2));
  const totalProjectedDollars = Number((projectedTp1Dollars + projectedTp2Dollars).toFixed(2));
  const rewardToRisk = totalRiskDollars > 0 ? Number((totalProjectedDollars / totalRiskDollars).toFixed(2)) : 0;

  const projectedDayTotalIfWin = Number((metrics.todayNetPnl + totalProjectedDollars).toFixed(2));
  const projectedShareOfTargetPct = Number(
    Math.max(0, (projectedDayTotalIfWin / metrics.effectiveTargetProfit) * 100).toFixed(1)
  );

  const executionSteps: string[] =
    totalContracts === 0
      ? [
          standDownReason ?? 'No trade recommended right now.',
          'Preserve your EOD trailing floor and wait for the next clean NY Open session.',
        ]
      : runnerContracts > 0
        ? [
            `Place Limit ${direction} for ${totalContracts} ${tickerLabel} ${unitNoun} at ${entryPrice.toFixed(spec.decimals)} (Bracket SL at ${stopLossPrice.toFixed(spec.decimals)}).`,
            `Scale out ${tp1Contracts} ${unitNoun} at TP1 (${tp1Price.toFixed(spec.decimals)}) for +$${projectedTp1Dollars.toFixed(0)} and move remaining stop to breakeven.`,
            `Trail final ${runnerContracts} runner ${isShares ? 'shares' : runnerContracts > 1 ? 'contracts' : 'contract'} to TP2 (${tp2Price.toFixed(spec.decimals)}) for +$${projectedTp2Dollars.toFixed(0)} more.`,
            consistencyCapped
              ? `Target auto-capped at $${metrics.safeDailyProfitLock} daily lock so you stay safely under the ${settings.consistencyCapPct}% consistency rule.`
              : `If TP2 hits, lock the platform and stop for the day (+$${projectedDayTotalIfWin.toFixed(0)} daily total).`,
          ]
        : [
            `Place Limit ${direction} for 1 ${tickerLabel} ${isShares ? 'share' : 'micro'} at ${entryPrice.toFixed(spec.decimals)} (Bracket SL at ${stopLossPrice.toFixed(spec.decimals)}).`,
            `Move stop to breakeven once price reaches +1.0R (${roundToTick(direction === 'LONG' ? entryPrice + stopPoints : entryPrice - stopPoints, spec.tickSize, spec.decimals).toFixed(spec.decimals)}).`,
            `Take full profit at ${tp2Price.toFixed(spec.decimals)} for +$${totalProjectedDollars.toFixed(0)}.`,
          ];

  return {
    status,
    standDownReason,
    symbol: market.symbol,
    displaySymbol: market.displaySymbol,
    unitLabel: market.unitLabel,
    setup,
    setupTitle,
    direction,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLossPrice,
    tp1Price,
    tp2Price,
    stopPoints,
    totalContracts,
    tp1Contracts,
    runnerContracts,
    riskPerContractDollars,
    totalRiskDollars,
    projectedTp1Dollars,
    projectedTp2Dollars,
    totalProjectedDollars,
    rewardToRisk,
    consistencyCapped,
    projectedDayTotalIfWin,
    projectedShareOfTargetPct,
    rationale,
    executionSteps,
  };
}
