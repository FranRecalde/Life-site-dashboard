import React from 'react';
import { DashboardContext } from '../types';

export interface ContextTabsProps {
  activeTab: DashboardContext;
  setActiveTab: (tab: DashboardContext) => void;
  lastUpdated: string;
}

export const ContextTabs: React.FC<ContextTabsProps> = ({
  activeTab,
  setActiveTab,
  lastUpdated,
}) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40 gap-3 md:gap-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-full shrink-0 pb-1 md:pb-0 w-full md:w-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {[
          { id: 'combined', label: 'Combined' },
          { id: 'personal', label: 'Personal' },
          { id: 'professional', label: 'Professional' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as DashboardContext)}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors duration-200 shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]'
                : 'text-[var(--color-secondary)] hover:text-[var(--color-control)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)]/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="text-left md:text-right text-xs text-[var(--color-secondary)] w-full md:w-auto px-1 md:px-0 mt-1 md:mt-0">
        <p>Last Sync: <span className="font-semibold text-[var(--color-ink)] text-[var(--color-ink)]">{lastUpdated || 'Offline'}</span></p>
      </div>
    </div>
  );
};
