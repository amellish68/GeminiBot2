import React from 'react';

export const RulebookView: React.FC = () => {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
        <h1 className="font-display text-lg font-semibold text-slate-100">
          LucidFlex 50K Official Guardrails
        </h1>
        <dl className="divide-y divide-slate-800 text-sm">
          <div className="flex justify-between py-2.5">
            <dt className="text-slate-400">Profit Target</dt>
            <dd className="font-mono font-medium text-slate-100 tabular-nums">$3,000 ($53,000)</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-slate-400">Max Loss Limit (Drawdown)</dt>
            <dd className="font-mono font-medium text-slate-100 tabular-nums">$2,000 EOD Trailing</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-slate-400">Drawdown Lock Point</dt>
            <dd className="font-mono font-medium text-emerald-400 tabular-nums">$50,100 (at $52,100 EOD)</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-slate-400">Max Position Size</dt>
            <dd className="font-mono font-medium text-slate-100 tabular-nums">4 Minis / 40 Micros</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-slate-400">Evaluation Consistency</dt>
            <dd className="font-mono font-medium text-slate-100 tabular-nums">40% ($1,200) or 50% ($1,500)</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-slate-400">Funded Consistency Rule</dt>
            <dd className="font-mono font-medium text-emerald-400">0% (Removed Once Funded)</dd>
          </div>
          <div className="flex justify-between py-2.5">
            <dt className="text-slate-400">Activation Fee</dt>
            <dd className="font-mono font-medium text-emerald-400 tabular-nums">$0</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
        <h2 className="font-display text-lg font-semibold text-slate-100">
          Daily Execution Discipline
        </h2>
        <ol className="space-y-3 text-sm text-slate-300">
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-sky-400 tabular-nums">01.</span>
            <span>
              <strong className="text-slate-100">Trade Micros Only:</strong> Stick to 2–5 micros (MNQ/MES/MGC) so your stop loss stays at $150–$200 per trade (10–13 full losses before failing).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-sky-400 tabular-nums">02.</span>
            <span>
              <strong className="text-slate-100">One Liquidity Window:</strong> Focus exclusively on 9:30–11:30 AM ET. Avoid afternoon chop and pre-open spreads.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-sky-400 tabular-nums">03.</span>
            <span>
              <strong className="text-slate-100">Respect the Consistency Lock:</strong> Never close a single day above $1,100 (40% rule) or $1,400 (50% rule) during the eval, or your $3,000 target inflates automatically.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-sky-400 tabular-nums">04.</span>
            <span>
              <strong className="text-slate-100">Two-Loss Daily Stop:</strong> If you hit -$400 on the day, close Tradovate/NinjaTrader immediately. Protect your EOD floor for tomorrow.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-sky-400 tabular-nums">05.</span>
            <span>
              <strong className="text-slate-100">Scale Out at TP1:</strong> Sell 60% of your micro contracts at 1.5R, move your stop to breakeven, and let the remaining runner target 2.5R.
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
};
