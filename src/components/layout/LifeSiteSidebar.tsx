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
  BookOpen
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
      className="life-site-entrance-hall w-64 bg-[#0a0f1d] border-r border-[#1e293b] flex flex-col h-screen text-slate-200 shrink-0 select-none"
      aria-label="Main navigation sidebar"
    >
      {/* Branding Header */}
      <div className="p-6 border-b border-[#1e293b] flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#9a7d44] via-[#c5a86a] to-[#e4cb93] flex items-center justify-center shadow-[0_0_15px_rgba(197,168,106,0.2)]">
          <Flame className="w-5 h-5 text-[#0a0f1d]" />
        </div>
        <div>
          <h1 className="font-display font-black text-lg tracking-wider text-white uppercase">
            Life Site
          </h1>
          <p className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">
            Entrance Hall
          </p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        <span className="block px-3 mb-2 text-[9px] font-black tracking-widest text-[#757684] uppercase select-none">
          Navigation
        </span>
        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a] group ${
                isActive
                  ? 'bg-[#131b2e] text-[#e4cb93] border border-[#9a7d44]/30 shadow-[0_4px_12px_rgba(0,0,0,0.15)]'
                  : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-[#131b2e]/50'
              }`}
              aria-label={item.ariaLabel}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon 
                className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? 'text-[#e4cb93]' : 'text-slate-500 group-hover:text-slate-300'
                }`} 
              />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#e4cb93] shadow-[0_0_8px_#e4cb93]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Custom, clean brand footer */}
      <div className="p-4 border-t border-[#1e293b] text-center">
        <p className="text-[10px] font-mono text-[#757684] tracking-wider uppercase">
          Powered by Life Engine
        </p>
      </div>
    </aside>
  );
};
