import React, { useState } from 'react';
import { Check, Copy, Play, X } from 'lucide-react';
import type { DataSourceMode, FeedChannelCredentials, InstrumentSymbol } from '../types/trading';

interface DataSourceModalProps {
  isOpen: boolean;
  dataSource: DataSourceMode;
  symbol: InstrumentSymbol;
  channel: FeedChannelCredentials | null;
  lastSourceLabel?: string;
  onClose: () => void;
  onTestPush: () => Promise<void>;
}

export const DataSourceModal: React.FC<DataSourceModalProps> = ({
  isOpen,
  dataSource,
  symbol,
  channel,
  lastSourceLabel,
  onClose,
  onTestPush,
}) => {
  const [copiedId, setCopiedId] = useState<'python' | 'webhook' | null>(null);
  const [testing, setTesting] = useState(false);

  if (!isOpen) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-app-url';
  const ingestUrl = `${origin}/api/market/ingest`;
  const chId = channel?.channelId ?? 'initializing...';
  const chSecret = channel?.ingestSecret ?? 'initializing...';

  const pythonScript = `import json, math, queue, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from ib_async import IB, ContFuture, Future

# 1. pip install ib_async
# 2. In IB Gateway (Paper port 4002): Configure -> Settings -> API -> Settings:
#    - Enable ActiveX and Socket Clients: ON
#    - Uncheck "Read-Only API" ONLY if you want to submit Paper bracket orders from the app
# 3. Run: python ibkr_bridge.py
USE_DELAYED = True  # True = Free 10m delayed testing | False = Live CME ($1.55/mo)
IB_PORT = 4002
BRIDGE_PORT = 8765

latest_data = {}
latest_portfolio = {'account': None, 'updatedAt': 0, 'positions': [], 'openOrders': [], 'closedFills': []}
data_lock = threading.Lock()
order_queue = queue.Queue()
order_roles = {}
order_entry_prices = {}

def clean_num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except Exception:
        return None
    if not math.isfinite(f) or abs(f) > 1e12:
        return None
    return f

class BridgeHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Connection', 'close')

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self._send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        path_only = self.path.split('?')[0]
        if path_only == '/portfolio':
            with data_lock:
                payload = dict(latest_portfolio)
            self._send_json(200, payload)
            return
        sym = path_only.split('/')[-1].upper()
        with data_lock:
            payload = latest_data.get(sym)
        if not payload:
            self._send_json(404, {'error': f'Waiting for {sym} from IB Gateway'})
            return
        self._send_json(200, payload)

    def do_POST(self):
        if not self.path.startswith('/order'):
            self._send_json(404, {'error': 'Unknown endpoint'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length).decode('utf-8')
            req_data = json.loads(raw)
        except Exception as e:
            self._send_json(400, {'error': f'Invalid JSON: {e}'})
            return

        done = threading.Event()
        result_box = {}
        order_queue.put((req_data, done, result_box))
        if not done.wait(8.0):
            self._send_json(504, {'error': 'Timed out waiting for IB Gateway order placement'})
            return
        self._send_json(result_box.get('status', 500), result_box.get('body', {'error': 'Unknown error'}))

    def log_message(self, format, *args):
        print('[HTTP]', format % args)

threading.Thread(
    target=lambda: ThreadingHTTPServer(('127.0.0.1', BRIDGE_PORT), BridgeHandler).serve_forever(),
    daemon=True
).start()
print(f'Local bridge listening on http://127.0.0.1:{BRIDGE_PORT}')

ib = IB()
ib.connect('127.0.0.1', IB_PORT, clientId=12)
ib.reqMarketDataType(3 if USE_DELAYED else 1)
paper_accts = [a for a in ib.managedAccounts() if a.startswith('DU')]
if paper_accts:
    try:
        ib.reqAccountUpdates(True, paper_accts[0])
    except Exception:
        pass
try:
    ib.reqAllOpenOrders()
    ib.reqExecutions()
except Exception:
    pass
print(f'Connected to IB Gateway on port {IB_PORT} (delayed={USE_DELAYED}) | Accounts: {ib.managedAccounts()}')

QUOTE_MAP = {'MNQ': ('NQ', 'CME'), 'MES': ('ES', 'CME'), 'MGC': ('GC', 'COMEX'), 'MYM': ('YM', 'CBOT')}
MICRO_EXCHANGE = {'MNQ': 'CME', 'MES': 'CME', 'MGC': 'COMEX', 'MYM': 'CBOT'}
MICRO_TICK = {'MNQ': 0.25, 'MES': 0.25, 'MGC': 0.1, 'MYM': 1.0}

def snap_tick(px, tick):
    return round(round(float(px) / tick) * tick, 4)

def resolve_front_future(sym, exch):
    details = ib.reqContractDetails(Future(sym, exchange=exch, currency='USD'))
    if not details:
        return ContFuture(sym, exch)
    details.sort(key=lambda d: d.contract.lastTradeDateOrContractMonth)
    return details[0].contract

quote_contracts = {k: resolve_front_future(*v) for k, v in QUOTE_MAP.items()}
order_contracts = {k: resolve_front_future(k, exch) for k, exch in MICRO_EXCHANGE.items()}
tickers = {k: ib.reqMktData(c, '', False, False) for k, c in quote_contracts.items()}
hist_warned = set()

def infer_order_role(order_obj):
    oid = getattr(order_obj, 'orderId', 0)
    if oid in order_roles:
        return order_roles[oid]
    pid = getattr(order_obj, 'parentId', 0) or 0
    otype = getattr(order_obj, 'orderType', '')
    if pid == 0:
        return 'ENTRY'
    if otype == 'LMT':
        return 'TP1'
    if otype in ('STP', 'STP LMT', 'TRAIL'):
        return 'SL'
    return 'ORDER'

def refresh_portfolio_snapshot():
    acct = paper_accts[0] if paper_accts else (ib.managedAccounts()[0] if ib.managedAccounts() else None)
    positions_out = []
    for p in ib.portfolio():
        pos_qty = clean_num(p.position) or 0.0
        if pos_qty == 0:
            continue
        mult = clean_num(getattr(p.contract, 'multiplier', None)) or 1.0
        avg_cost = clean_num(p.averageCost) or 0.0
        avg_entry = round(avg_cost / mult, 4) if mult else avg_cost
        positions_out.append({
            'symbol': p.contract.symbol,
            'localSymbol': p.contract.localSymbol or p.contract.symbol,
            'position': pos_qty,
            'avgEntryPrice': avg_entry,
            'marketPrice': clean_num(p.marketPrice),
            'unrealizedPnl': clean_num(p.unrealizedPNL),
            'realizedPnl': clean_num(p.realizedPNL),
        })

    trades_by_id = {}
    for tr in ib.trades():
        trades_by_id[tr.order.orderId] = tr

    open_orders_out = []
    for tr in ib.openTrades():
        o = tr.order
        st = tr.orderStatus
        open_orders_out.append({
            'orderId': o.orderId,
            'parentId': getattr(o, 'parentId', 0) or 0,
            'symbol': tr.contract.symbol,
            'localSymbol': tr.contract.localSymbol or tr.contract.symbol,
            'action': o.action,
            'orderType': o.orderType,
            'role': infer_order_role(o),
            'totalQuantity': clean_num(o.totalQuantity) or 0,
            'filled': clean_num(st.filled) or 0,
            'remaining': clean_num(st.remaining) or 0,
            'lmtPrice': clean_num(getattr(o, 'lmtPrice', None)),
            'auxPrice': clean_num(getattr(o, 'auxPrice', None)),
            'status': st.status,
            'ocaGroup': getattr(o, 'ocaGroup', '') or '',
        })

    closed_fills_out = []
    for f in ib.fills():
        cr = f.commissionReport
        rpnl = clean_num(cr.realizedPNL) if cr else None
        if rpnl is None:
            continue
        oid = f.execution.orderId
        tr = trades_by_id.get(oid)
        role = infer_order_role(tr.order) if tr else order_roles.get(oid, 'CUSTOM')
        outcome = role if role in ('TP1', 'TP2', 'SL') else 'CUSTOM'
        direction = 'LONG' if f.execution.side == 'SLD' else 'SHORT'
        closed_fills_out.append({
            'execId': f.execution.execId,
            'orderId': oid,
            'symbol': f.contract.symbol,
            'localSymbol': f.contract.localSymbol or f.contract.symbol,
            'direction': direction,
            'contracts': int(round(clean_num(f.execution.shares) or 1)),
            'entryPrice': order_entry_prices.get(oid),
            'exitPrice': clean_num(f.execution.price) or 0,
            'realizedPnl': round(rpnl, 2),
            'commission': clean_num(cr.commission) if cr else None,
            'outcome': outcome,
            'timestamp': f.time.isoformat() if hasattr(f.time, 'isoformat') else time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        })

    with data_lock:
        latest_portfolio.update({
            'account': acct,
            'updatedAt': int(time.time()),
            'positions': positions_out,
            'openOrders': open_orders_out,
            'closedFills': closed_fills_out,
        })

def handle_paper_order(req):
    paper_accounts = [a for a in ib.managedAccounts() if a.startswith('DU')]
    if IB_PORT != 4002 or not paper_accounts:
        return 403, {'error': 'Refused: Order placement is restricted to Paper accounts (port 4002, DU*).'}

    sym = str(req.get('symbol', '')).upper()
    if sym not in order_contracts:
        return 400, {'error': f'Unsupported micro symbol: {sym}'}

    direction = str(req.get('direction', '')).upper()
    if direction not in ('LONG', 'SHORT'):
        return 400, {'error': 'Direction must be LONG or SHORT'}

    tp1_qty = int(req.get('tp1Contracts', 0))
    runner_qty = int(req.get('runnerContracts', 0))
    total_qty = tp1_qty + runner_qty
    if total_qty <= 0 or total_qty > 10:
        return 400, {'error': f'Invalid total contract size ({total_qty}). Max 10 micros allowed.'}

    tick = MICRO_TICK[sym]
    entry_px = snap_tick(req['entryPrice'], tick)
    sl_px = snap_tick(req['stopLossPrice'], tick)
    tp1_px = snap_tick(req['tp1Price'], tick)
    tp2_px = snap_tick(req.get('tp2Price', tp1_px), tick)

    contract = order_contracts[sym]
    ib.qualifyContracts(contract)
    action = 'BUY' if direction == 'LONG' else 'SELL'
    acct = paper_accounts[0]

    api_errors = []
    def on_err(reqId, errorCode, errorString, _contract):
        if errorCode in (201, 202, 110, 161, 200, 10147, 10148, 10349):
            api_errors.append(f'reqId {reqId} ({errorCode}): {errorString or "Order canceled/rejected"}')

    ib.errorEvent += on_err
    trades = []
    try:
        if tp1_qty > 0:
            b1 = ib.bracketOrder(action, tp1_qty, limitPrice=entry_px, takeProfitPrice=tp1_px, stopLossPrice=sl_px)
            order_roles[b1.parent.orderId] = 'ENTRY'
            order_roles[b1.takeProfit.orderId] = 'TP1'
            order_roles[b1.stopLoss.orderId] = 'SL'
            for o in b1:
                order_entry_prices[o.orderId] = entry_px
                o.account = acct
                o.tif = 'DAY'
                o.outsideRth = True
                trades.append(ib.placeOrder(contract, o))

        if runner_qty > 0:
            b2 = ib.bracketOrder(action, runner_qty, limitPrice=entry_px, takeProfitPrice=tp2_px, stopLossPrice=sl_px)
            order_roles[b2.parent.orderId] = 'ENTRY'
            order_roles[b2.takeProfit.orderId] = 'TP2'
            order_roles[b2.stopLoss.orderId] = 'SL'
            for o in b2:
                order_entry_prices[o.orderId] = entry_px
                o.account = acct
                o.tif = 'DAY'
                o.outsideRth = True
                trades.append(ib.placeOrder(contract, o))

        ib.sleep(1.0)
    finally:
        ib.errorEvent -= on_err

    refresh_portfolio_snapshot()
    placed_ids = [tr.order.orderId for tr in trades]
    leg_summaries = []
    canceled_legs = []
    for tr in trades:
        st = tr.orderStatus.status
        msg = tr.log[-1].message if tr.log else ''
        summary = f"#{tr.order.orderId} {tr.order.action} {tr.order.orderType} ({st}, filled={tr.orderStatus.filled})"
        if msg:
            summary += f" [{msg}]"
        leg_summaries.append(summary)
        print(f'[ORDER LEG] {summary}')
        if st in ('Cancelled', 'Inactive', 'ApiCancelled'):
            canceled_legs.append(summary)

    print(f'[ORDER] Submitted {action} {total_qty} {contract.localSymbol} @ {entry_px} (SL {sl_px}, TP1 {tp1_px}, TP2 {tp2_px}) -> {placed_ids}')
    warning = None
    if canceled_legs or api_errors:
        warning = ' | '.join(canceled_legs + api_errors)

    return 200, {
        'ok': True,
        'account': acct,
        'contract': contract.localSymbol or sym,
        'orderIds': placed_ids,
        'legs': leg_summaries,
        'warning': warning,
    }

last_poll = 0.0
last_port_poll = 0.0
while True:
    # Drain any pending paper orders from the UI immediately
    while not order_queue.empty():
        req_data, done, result_box = order_queue.get_nowait()
        try:
            st, body = handle_paper_order(req_data)
            result_box['status'] = st
            result_box['body'] = body
        except Exception as e:
            print('[ORDER ERROR]', e)
            result_box['status'] = 500
            result_box['body'] = {'error': str(e)}
        finally:
            done.set()

    now = time.time()
    if now - last_port_poll >= 2.0:
        last_port_poll = now
        try:
            refresh_portfolio_snapshot()
        except Exception:
            pass

    if now - last_poll >= 6.0:
        last_poll = now
        for app_sym, contract in quote_contracts.items():
            candles = []
            px = None
            try:
                bars = ib.reqHistoricalData(
                    contract, endDateTime='', durationStr='1 D',
                    barSizeSetting='5 mins', whatToShow='TRADES', useRTH=False, formatDate=2
                )
                if len(bars) >= 2:
                    px = float(bars[-1].close)
                    candles = [
                        {
                            'time': int(b.date.timestamp()),
                            'open': float(b.open),
                            'high': float(b.high),
                            'low': float(b.low),
                            'close': float(b.close),
                            'volume': int(b.volume),
                        }
                        for b in bars[-48:]
                    ]
            except Exception as e:
                if app_sym not in hist_warned:
                    print(f'[{app_sym}] Historical bars unavailable ({e}); using delayed quote ticks')
                    hist_warned.add(app_sym)

            t = tickers[app_sym]
            for candidate in (t.last, t.marketPrice(), t.close, t.bid, t.ask):
                if candidate is not None and not math.isnan(candidate) and candidate > 0:
                    px = float(candidate) if px is None else px
                    break

            if px is not None:
                with data_lock:
                    latest_data[app_sym] = {
                        'symbol': app_sym,
                        'delayed': USE_DELAYED,
                        'price': px,
                        'candles': candles,
                    }
                print(f'[{app_sym}] {px} ({len(candles)} bars)')
    ib.sleep(0.2)`;

  const tvWebhookPayload = JSON.stringify(
    {
      channelId: chId,
      secret: chSecret,
      symbol,
      source: 'tradovate-webhook',
      price: '{{close}}',
    },
    null,
    2
  );

  const handleCopy = async (kind: 'python' | 'webhook', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(kind);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTestPush();
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-700 bg-[#111827] p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 id="feed-modal-title" className="font-display text-lg font-semibold text-slate-100">
              Market Data &amp; Paper Order Bridge ({dataSource === 'ibkr' ? 'IBKR Paper' : 'Tradovate / Webhook'})
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Current feed status: <span className="text-slate-200">{lastSourceLabel ?? 'Ready'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* IBKR Bridge Instructions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Option 1: IB Gateway Local Bridge (Quotes + Paper Bracket Orders)
            </h3>
            <button
              type="button"
              onClick={() => handleCopy('python', pythonScript)}
              className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              {copiedId === 'python' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedId === 'python' ? 'Copied' : 'Copy Python Script'}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Serves quotes on <code className="font-mono text-sky-300">127.0.0.1:8765</code> and accepts <strong className="text-slate-200">Paper-only (`DU*`) Micro bracket orders</strong> (`MNQ`/`MES`/`MGC`/`MYM`). Remember to uncheck <strong className="text-slate-200">Read-Only API</strong> in IB Gateway API Settings before clicking Send Paper Bracket.
          </p>
          <pre className="max-h-56 overflow-auto rounded-md border border-slate-800 bg-[#0B111E] p-3 font-mono text-[11px] leading-relaxed text-slate-300">
            {pythonScript}
          </pre>
        </div>

        {/* Tradovate / TradingView Webhook Instructions */}
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Option 2: LucidFlex / Tradovate Live (Screen Sync or Webhook)
            </h3>
            <button
              type="button"
              onClick={() => handleCopy('webhook', tvWebhookPayload)}
              className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              {copiedId === 'webhook' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedId === 'webhook' ? 'Copied' : 'Copy Webhook JSON'}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Use the inline <strong className="text-slate-200">Tradovate Screen Sync</strong> inputs on the planner when trading live on LucidFlex, or point an external webhook to <code className="font-mono text-sky-300">{ingestUrl}</code>:
          </p>
          <pre className="overflow-auto rounded-md border border-slate-800 bg-[#0B111E] p-3 font-mono text-[11px] text-slate-300">
            {tvWebhookPayload}
          </pre>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !channel}
            className="flex items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {testing ? 'Sending Test Push...' : `Send Test ${symbol} Push`}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-slate-800 px-4 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
