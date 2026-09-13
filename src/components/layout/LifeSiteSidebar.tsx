import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  CheckSquare,
  Folder,
  FileText,
  Brain,
  Sparkles,
  Settings,
  Flame,
  BookOpen, Radio
} from 'lucide-react';
import { EntranceHallView } from './entranceHallTypes';

interface NavigationItem {
  id: EntranceHallView;
  label: string;
  icon: React.ComponentType<any>;
  ariaLabel: string;
}

interface LifeSiteSidebarProps {
  activeView: EntranceHallView;
  onViewChange: (view: EntranceHallView) => void;
}

const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    ariaLabel: 'Go to Dashboard overview',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: Calendar,
    ariaLabel: 'Go to Calendar panel',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: CheckSquare,
    ariaLabel: 'Go to Tasks manager',
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: Folder,
    ariaLabel: 'Go to Projects overview',
  },
  {
    id: 'notes',
    label: 'Notes Inbox',
    icon: FileText,
    ariaLabel: 'Go to Notes Inbox panel',
  },
  {
    id: 'reading-capture',
    label: 'Reading Capture',
    icon: BookOpen,
    ariaLabel: 'Go to Reading Capture workspace',
  },
  {
    id: 'signal',
    label: 'Signal',
    icon: Radio,
    ariaLabel: 'Go to Signal review queue',
  },
  {
    id: 'thought-catcher',
    label: 'Thought Catcher',
    icon: Brain,
    ariaLabel: 'Go to Thought Catcher interactive loop',
  },
  {
    id: 'habits',
    label: 'Habits',
    icon: Sparkles,
    ariaLabel: 'Go to Habits tracker',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    ariaLabel: 'Go to Settings configuration',
  },
];

export const LifeSiteSidebar: React.FC<LifeSiteSidebarProps> = ({
  activeView,
  onViewChange,
}) => {
  return (
    <aside
      className="life-site-entrance-hall w-64 bg-[var(--color-page)] border-r border-[var(--color-divider)] flex flex-col h-screen text-[var(--color-secondary)] shrink-0 select-none"
      aria-label="Main navigation sidebar"
    >
      {/* Branding Header */}
      <div className="p-6 border-b border-[var(--color-divider)] flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[var(--color-secondary)] via-[var(--color-secondary)] to-[var(--color-secondary)] flex items-center justify-center shadow-none">
          <Flame className="w-5 h-5 text-[var(--color-ink)]" />
        </div>
        <div>
          <h1 className="font-display font-semibold text-lg tracking-wider text-[var(--color-ink)] uppercase">
            Life Site
          </h1>
          <p className="text-[10px] font-mono tracking-widest text-[var(--color-secondary)] uppercase">
            Entrance Hall
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        <span className="block px-3 mb-2 text-[9px] font-semibold tracking-widest text-[var(--color-secondary)] uppercase select-none">
          Navigation
        </span>
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)] group ${
                isActive
                  ? 'bg-[var(--color-card)] text-[var(--color-secondary)] border border-[var(--color-secondary)]/30 shadow-none'
                  : 'text-[var(--color-secondary)] border border-transparent hover:text-[var(--color-secondary)] hover:bg-[var(--color-card)]/50'
              }`}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? 'text-[var(--color-secondary)]' : 'text-[var(--color-secondary)] group-hover:text-[var(--color-secondary)]'
                }`}
              />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-card-raised)] shadow-[0_0_8px_var(--color-secondary)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Custom, clean brand footer */}
      <div className="p-4 border-t border-[var(--color-divider)] text-center">
        <p className="text-[10px] font-mono text-[var(--color-secondary)] tracking-wider uppercase">
          Powered by Life Engine
        </p>
      </div>
    </aside>
  );
};
