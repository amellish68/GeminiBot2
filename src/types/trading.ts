export type InstrumentSymbol = 'MNQ' | 'MES' | 'MGC' | 'MYM';

export type SetupType = 'ORB_RETEST' | 'LIQUIDITY_SWEEP' | 'VWAP_PULLBACK';

export type TradeDirection = 'AUTO' | 'LONG' | 'SHORT';

export type NavTab = 'planner' | 'equity' | 'log' | 'rulebook';

export type DataSourceMode = 'proxy' | 'ibkr' | 'alpaca' | 'tradovate';

export interface InstrumentSpec {
  symbol: InstrumentSymbol;
  name: string;
  yahooSymbol: string;
  pointValue: number; // $ per 1.00 point per 1 micro contract
  tickSize: number;
  tickValue: number;
  defaultStopPts: number;
  minStopPts: number;
  maxStopPts: number;
  decimals: number;
}

export interface CandleBar {
  time: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketSnapshot {
  symbol: InstrumentSymbol;
  displaySymbol?: string;
  unitLabel?: 'micros' | 'shares';
  yahooSymbol: string;
  source:
    | 'live'
    | 'fallback'
    | 'manual'
    | 'ibkr-delayed'
    | 'ibkr-live'
    | 'alpaca-paper'
    | 'tradovate-webhook'
    | 'waiting';
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

export interface FeedChannelCredentials {
  channelId: string;
  ingestSecret: string;
}

export interface LoggedTrade {
  id: string;
  externalExecId?: string;
  date: string; // YYYY-MM-DD in ET
  timestamp: string;
  symbol: InstrumentSymbol;
  setup: SetupType;
  direction: 'LONG' | 'SHORT';
  contracts: number;
  entryPrice: number;
  stopLossPrice: number;
  exitPrice: number;
  netPnl: number;
  rMultiple: number;
  outcome: 'TP1' | 'TP2' | 'SL' | 'CUSTOM';
  notes?: string;
}

export interface IbkrPosition {
  symbol: string;
  localSymbol: string;
  position: number;
  avgEntryPrice: number;
  marketPrice: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
}

export interface IbkrOpenOrder {
  orderId: number | string;
  parentId: number | string;
  symbol: string;
  localSymbol: string;
  action: 'BUY' | 'SELL' | string;
  orderType: string;
  role: 'ENTRY' | 'TP1' | 'TP2' | 'SL' | 'ORDER';
  totalQuantity: number;
  filled: number;
  remaining: number;
  lmtPrice: number | null;
  auxPrice: number | null;
  status: string;
  ocaGroup?: string;
}

export interface IbkrClosedFill {
  execId: string;
  orderId: number | string;
  symbol: string;
  localSymbol: string;
  direction: 'LONG' | 'SHORT';
  contracts: number;
  entryPrice: number | null;
  exitPrice: number;
  realizedPnl: number;
  commission: number | null;
  outcome: 'TP1' | 'TP2' | 'SL' | 'CUSTOM';
  timestamp: string;
}

export interface IbkrPortfolioSnapshot {
  configured?: boolean;
  provider?: 'ibkr' | 'alpaca';
  account: string | null;
  equity?: number | null;
  buyingPower?: number | null;
  updatedAt: number;
  positions: IbkrPosition[];
  openOrders: IbkrOpenOrder[];
  closedFills: IbkrClosedFill[];
}

export interface AccountSettings {
  consistencyCapPct: 40 | 50;
  dllEnabled: boolean;
  dllAmount: number;
  personalDailyLossCap: number;
  baseRiskPerTrade: number;
  maxTradesPerDay: number;
  activeDate: string; // YYYY-MM-DD
}

export interface DailyEquityPoint {
  date: string;
  dayNumber: number;
  dailyPnl: number;
  eodBalance: number;
  eodDrawdownFloor: number;
  isLocked: boolean;
  exceededConsistency: boolean;
}

export interface AccountMetrics {
  startingBalance: number;
  baseTargetBalance: number;
  effectiveTargetBalance: number;
  effectiveTargetProfit: number;
  currentBalance: number;
  totalNetPnl: number;
  highestEodBalance: number;
  currentEodFloor: number;
  isDrawdownLocked: boolean;
  drawdownBufferRemaining: number;
  progressToTargetPct: number;
  phase: 'Phase 1 (Build Cushion)' | 'Phase 2 (Cruise to Target)' | 'Target Reached';
  todayNetPnl: number;
  todayTradesCount: number;
  bestDayPnl: number;
  maxSingleDayAllowed: number;
  safeDailyProfitLock: number;
  remainingConsistencySafe: number;
  remainingConsistencyHard: number;
  remainingPersonalLoss: number;
  remainingDll: number;
  dailyHistory: DailyEquityPoint[];
  consistencyStatus: 'SAFE' | 'WARNING' | 'EXCEEDED';
}

export interface TradeRecommendation {
  status: 'READY' | 'CAUTION' | 'STAND_DOWN';
  standDownReason?: string;
  symbol: InstrumentSymbol;
  displaySymbol?: string;
  unitLabel?: 'micros' | 'shares';
  setup: SetupType;
  setupTitle: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLossPrice: number;
  tp1Price: number;
  tp2Price: number;
  stopPoints: number;
  totalContracts: number;
  tp1Contracts: number;
  runnerContracts: number;
  riskPerContractDollars: number;
  totalRiskDollars: number;
  projectedTp1Dollars: number;
  projectedTp2Dollars: number;
  totalProjectedDollars: number;
  rewardToRisk: number;
  consistencyCapped: boolean;
  projectedDayTotalIfWin: number;
  projectedShareOfTargetPct: number;
  rationale: string;
  executionSteps: string[];
}
