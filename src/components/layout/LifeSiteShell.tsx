import React, { useState, useEffect } from 'react';
import { LifeSiteSidebar } from './LifeSiteSidebar';
import { LifeSiteMobileNavigation } from './LifeSiteMobileNavigation';
import { EntranceHallView } from './entranceHallTypes';
import { 
  Sparkles, Compass, Clock, ArrowRightLeft, WifiOff, RefreshCw, Settings, LogOut, CloudSun 
} from 'lucide-react';
import { GlobalSearchControl } from '../GlobalSearchControl';
import { ObsidianNote } from '../../types';

interface LifeSiteShellProps {
  activeView: EntranceHallView;
  onViewChange: (view: EntranceHallView) => void;
  children: React.ReactNode;
  username?: string;
  onReturnToClassic?: () => void;
  isOffline: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  weather?: {
    temperature: number;
    units: string;
    location: string;
  } | null;
  // Search props
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  handleSearch: (val: string) => void;
  searchResults: { notes: ObsidianNote[] } | null;
  setSearchResults: (val: { notes: ObsidianNote[] } | null) => void;
  setSelectedNote: (note: ObsidianNote | null) => void;
  onClearSearch?: () => void;
}

export const LifeSiteShell: React.FC<LifeSiteShellProps> = ({
  activeView,
  onViewChange,
  children,
  username,
  onReturnToClassic,
  isOffline,
  refreshing,
  onRefresh,
  onLogout,
  weather,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  handleSearch,
  searchResults,
  setSearchResults,
  setSelectedNote,
  onClearSearch,
}) => {
  const [timeStr, setTimeStr] = useState('');

  // Clean real-time clock indicator in the layout
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Formatted view header title helper
  const getViewTitle = (view: EntranceHallView): string => {
    switch (view) {
      case 'dashboard': return 'Entrance Hall Dashboard';
      case 'calendar': return 'Integrated Agenda Calendar';
      case 'tasks': return 'Mission Tasks Board';
      case 'projects': return 'Project Hub Directory';
      case 'notes': return 'Notes Inbox Repository';
      case 'thought-catcher': return 'Thought Catcher Stream';
      case 'habits': return 'Habit Integration Hub';
      case 'settings': return 'System Settings Panel';
      default: return 'Life Site';
    }
  };

  return (
    <div className="life-site-entrance-hall min-h-screen bg-[#070b13] flex flex-col md:flex-row text-slate-100 overflow-x-hidden antialiased">
      {/* 1. Desktop Navigation Sidebar */}
      <div className="hidden md:block h-screen sticky top-0 z-40 shrink-0">
        <LifeSiteSidebar activeView={activeView} onViewChange={onViewChange} />
      </div>

      {/* 2. Mobile Navigation Bar & Drawer */}
      <div className="block md:hidden">
        <LifeSiteMobileNavigation activeView={activeView} onViewChange={onViewChange} />
      </div>

      {/* 3. Main Content Wrapper */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#070b13]">
        {/* Offline Warning */}
        {isOffline && (
          <div className="bg-[#ba1a1a]/20 border-b border-[#ba1a1a]/40 text-red-200 p-3 text-xs text-center font-mono flex items-center justify-center gap-2 sticky top-0 z-50">
            <WifiOff className="w-4 h-4 text-[#ba1a1a]" />
            <span>Offline Mode. New tasks and notes cannot be submitted until your connection returns. Displaying cached snapshot.</span>
          </div>
        )}

        {/* Dynamic Hall Header / Greeting bar */}
        <header className="px-6 py-4 border-b border-[#1e293b]/40 bg-[#0a0f1d]/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none">
          {/* Left portion: Title and greeting */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">
              <Compass className="w-3.5 h-3.5" />
              <span>Location: {activeView}</span>
            </div>
            
            <h2 className="text-xl font-display font-black tracking-tight text-white uppercase mt-1">
              {getViewTitle(activeView)}
            </h2>
            
            {username && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 font-sans truncate">
                <Sparkles className="w-3.5 h-3.5 text-[#c5a86a] shrink-0" />
                <span>Greetings, <strong className="text-white font-semibold">{username}</strong>. Welcome back to the main lobby.</span>
              </p>
            )}
          </div>

          {/* Center portion: Global search */}
          <div className="w-full lg:max-w-md xl:max-w-lg">
            <GlobalSearchControl
              searchInputRef={searchInputRef}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              handleSearch={handleSearch}
              searchResults={searchResults}
              setSearchResults={setSearchResults}
              setSelectedNote={setSelectedNote}
              className="w-full"
              isEntranceHall={true}
              onClearSearch={onClearSearch}
            />
          </div>

          {/* Right portion: Controls and Clock */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 self-end lg:self-auto shrink-0">
            {weather && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c5a86a]/20 bg-[#0a0f1d] text-xs font-mono text-slate-300">
                <CloudSun className="w-3.5 h-3.5 text-[#c5a86a]" />
                <div className="text-left leading-none">
                  <p className="font-bold text-white">{weather.temperature}°{weather.units}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[80px]">{weather.location}</p>
                </div>
              </div>
            )}

            {/* Clock Indicator */}
            <div className="px-3 py-1.5 rounded-lg border border-[#1e293b] bg-[#0a0f1d] font-mono text-xs text-[#c5a86a] tracking-widest flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>{timeStr || '--:--:--'}</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onRefresh}
                disabled={refreshing || isOffline}
                className="p-2 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] disabled:opacity-30 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                title="Manual Refresh (R)"
                aria-label="Manual Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#c5a86a] ${refreshing ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => onViewChange('settings')}
                className="p-2 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] hover:border-[#e4cb93] transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a]"
                title="Settings Console"
                aria-label="Settings Console"
              >
                <Settings className="w-3.5 h-3.5 text-[#c5a86a]" />
              </button>

              <button
                onClick={onLogout}
                className="p-2 rounded-lg border border-red-900/30 bg-[#0a0f1d] hover:border-red-500/50 hover:bg-red-950/20 text-red-400 hover:text-red-300 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                title="Logout from Life Site"
                aria-label="Logout from Life Site"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Classic View Return Switcher */}
            {onReturnToClassic && (
              <button
                onClick={onReturnToClassic}
                className="px-3.5 py-1.5 rounded-lg border border-[#c5a86a]/30 bg-gradient-to-r from-[#131b2e] to-[#0a0f1d] hover:border-[#e4cb93] text-slate-300 hover:text-white text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[#c5a86a] shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
                title="Return to Classic Bento Layout"
                aria-label="Return to Classic Bento Layout"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-[#c5a86a]" />
                <span className="hidden sm:inline">Classic Bento</span>
              </button>
            )}
          </div>
        </header>

        {/* Outer view dynamic panel wrapper with elegant ambient atmosphere */}
        <div className="flex-1 p-5 md:p-8 relative">
          {/* Subtle warm gold ambient light dot in the top corner */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-[#c5a86a]/5 to-transparent blur-[120px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-indigo-500/[0.03] to-transparent blur-[120px] pointer-events-none" />

          {/* Actual Active View Content rendered via React children */}
          <div className="relative z-10 h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};
