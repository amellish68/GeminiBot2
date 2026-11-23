import React from 'react';
import type { NavTab } from '../types/trading';

interface TopNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onResetAccount: () => void;
}

const NAV_ITEMS: Array<{ id: NavTab; label: string }> = [
  { id: 'planner', label: 'Daily Planner' },
  { id: 'equity', label: 'Equity & EOD' },
  { id: 'log', label: 'Trade Log' },
  { id: 'rulebook', label: 'Rulebook' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  onResetAccount,
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-8 border-b border-slate-800 bg-[#0B111E]/95 px-6 py-3.5 backdrop-blur-sm">
      <a
        href="#planner"
        onClick={(e) => {
          e.preventDefault();
          onSelectTab('planner');
        }}
        className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
      >
        LucidPlan 50K
      </a>

      <nav className="flex items-center gap-6 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-sm ${
                isActive
                  ? 'text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-sky-400" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onResetAccount}
          className="rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          Reset Account
        </button>
      </div>
    </header>
  );
};
