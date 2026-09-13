import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  X,
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

interface LifeSiteMobileNavigationProps {
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

export const LifeSiteMobileNavigation: React.FC<LifeSiteMobileNavigationProps> = ({
  activeView,
  onViewChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation support - Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Trap focus inside the drawer when open for accessibility
  useEffect(() => {
    if (!isOpen) return;
    const focusableElements = drawerRef.current?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements || focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleTabTrap);
    // Focus the first item initially
    firstElement.focus();

    return () => window.removeEventListener('keydown', handleTabTrap);
  }, [isOpen]);

  const handleSelectItem = (id: EntranceHallView) => {
    onViewChange(id);
    setIsOpen(false);
  };

  const activeItem = NAVIGATION_ITEMS.find(item => item.id === activeView);

  return (
    <div className="life-site-entrance-hall block md:hidden select-none">
      {/* Mini top bar containing the trigger */}
      <header className="flex items-center justify-between px-4 py-3 bg-[var(--color-page)] border-b border-[var(--color-divider)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-gradient-to-tr from-[var(--color-secondary)] via-[var(--color-secondary)] to-[var(--color-secondary)] flex items-center justify-center">
            <Flame className="w-4 h-4 text-[var(--color-ink)]" />
          </div>
          <span className="font-display font-semibold text-sm text-[var(--color-ink)] tracking-widest uppercase">
            LIFE SITE
          </span>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="p-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-card)]/60 text-[var(--color-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
          aria-label="Open navigation menu"
          aria-expanded={isOpen}
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Slide-out Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[var(--color-card)]/60 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <div
            ref={drawerRef}
            className="relative flex flex-col w-4/5 max-w-xs h-full bg-[var(--color-page)] border-r border-[var(--color-divider)] shadow-2xl p-6 transition-transform duration-300 ease-out transform translate-x-0"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Drawer"
          >
            {/* Header / Brand with Close Action */}
            <div className="flex items-center justify-between pb-6 border-b border-[var(--color-divider)] mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-gradient-to-tr from-[var(--color-secondary)] via-[var(--color-secondary)] to-[var(--color-secondary)] flex items-center justify-center">
                  <Flame className="w-4 h-4 text-[var(--color-ink)]" />
                </div>
                <div className="text-left">
                  <h2 className="font-display font-semibold text-sm text-[var(--color-ink)] tracking-wider uppercase">
                    Life Site
                  </h2>
                  <p className="text-[9px] font-mono tracking-wider text-[var(--color-secondary)] uppercase">
                    Mobile Hall
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-card)]/40 text-[var(--color-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
                aria-label="Close navigation menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Options List */}
            <nav className="flex-1 space-y-1 overflow-y-auto">
              <span className="block mb-2 text-[9px] font-semibold tracking-widest text-[var(--color-secondary)] uppercase">
                Categories
              </span>
              {NAVIGATION_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectItem(item.id)}
                    className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)] text-left ${
                      isActive
                        ? 'bg-[var(--color-card)] text-[var(--color-secondary)] border border-[var(--color-secondary)]/30 shadow-md'
                        : 'text-[var(--color-secondary)] border border-transparent hover:text-[var(--color-secondary)] hover:bg-[var(--color-card)]/30'
                    }`}
                    aria-label={item.ariaLabel}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[var(--color-secondary)]' : 'text-[var(--color-secondary)]'}`} />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-card-raised)]" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Footer */}
            <div className="pt-4 border-t border-[var(--color-divider)] text-center">
              <p className="text-[9px] font-mono text-[var(--color-secondary)] tracking-wider uppercase">
                Life Engine Mobile
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Floating Indicator of Current Selection */}
      <div className="px-4 py-2 bg-[var(--color-card)] border-b border-[var(--color-divider)]/50 text-[10px] font-mono tracking-wider text-[var(--color-secondary)] flex items-center gap-2 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-card-raised)] animate-pulse" />
        <span>Current View: </span>
        <strong className="text-[var(--color-secondary)]">{activeItem?.label}</strong>
      </div>
    </div>
  );
};
