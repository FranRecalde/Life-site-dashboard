import React from 'react';
import {
  WifiOff, Clock, CloudSun, RefreshCw, Settings, LogOut, LayoutGrid, BookOpen
} from 'lucide-react';
import { DashboardSnapshot, ObsidianNote } from '../types';
import { GlobalSearchControl, type GlobalSearchHandler } from './GlobalSearchControl';

export interface GlobalHeaderProps {
  isOffline: boolean;
  currentTime: Date;
  formattedBritishDate: string;
  dashboardData: DashboardSnapshot | null;
  refreshing: boolean;
  triggerRefresh: () => void;
  openSettings: () => void;
  handleLogout: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  handleSearch: GlobalSearchHandler;
  searchResults: { notes: ObsidianNote[] } | null;
  setSearchResults: (val: { notes: ObsidianNote[] } | null) => void;
  setSelectedNote: (note: ObsidianNote | null) => void;
  onReturnToEntranceHall: () => void;
  onOpenReadingCapture: () => void;
  onClearSearch?: () => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({
  isOffline,
  currentTime,
  formattedBritishDate,
  dashboardData,
  refreshing,
  triggerRefresh,
  openSettings,
  handleLogout,
  searchInputRef,
  searchQuery,
  setSearchQuery,
  handleSearch,
  searchResults,
  setSearchResults,
  setSelectedNote,
  onReturnToEntranceHall,
  onOpenReadingCapture,
  onClearSearch,
}) => {
  return (
    <>
      {isOffline && (
        <div className="bg-[var(--color-warning-surface)] text-[var(--color-warning)] p-3 text-sm text-center font-semibold flex items-center justify-center gap-2 border-b border-[var(--color-warning)] sticky top-0 z-50 animate-bounce">
          <WifiOff className="w-4 h-4" />
          <span>Offline Mode. New tasks and notes cannot be submitted until your connection returns. Displaying cached snapshot.</span>
        </div>
      )}

      {/* Global Header */}
      <header className="glass-nav border-b border-[var(--color-divider)] border-[var(--color-divider)]/40 sticky top-0 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:px-6 sm:py-4 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-4">

          {/* Top row container on mobile: contains logo/clock and control buttons */}
          <div className="flex w-full md:w-auto justify-between items-center gap-4">
            {/* Logo & Clock widget */}
            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
              <h1 className="font-display text-xl sm:text-2xl font-semibold text-[var(--color-control)] text-[var(--color-ink)] tracking-tighter select-none shrink-0">dp</h1>
              <div className="h-6 w-px bg-[var(--color-divider)] bg-[var(--color-card-raised)] hidden md:block"></div>
              <div className="flex items-center gap-1.5 sm:gap-2 select-none min-w-0">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--color-control)] text-[var(--color-secondary)] animate-pulse shrink-0" />
                <div className="text-left leading-none min-w-0">
                  <p className="text-[11px] sm:text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] font-mono truncate">
                    {currentTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                  <p className="text-[9px] sm:text-[10px] font-semibold text-[var(--color-secondary)] mt-0.5 truncate">{formattedBritishDate}</p>
                </div>
              </div>
            </div>

            {/* Weather & Action Controls (Only visible in this container on mobile, hidden on md) */}
            <div className="flex items-center gap-1.5 sm:gap-3 md:hidden shrink-0">
              {dashboardData?.weather && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-normal bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)]">
                  <CloudSun className="w-3.5 h-3.5 text-[var(--color-control)] text-[var(--color-secondary)]" />
                  <p className="font-semibold">{dashboardData.weather.temperature}°{dashboardData.weather.units}</p>
                </div>
              )}
              <button
                onClick={onOpenReadingCapture}
                className="p-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] transition-colors cursor-pointer text-[var(--color-control)] text-[var(--color-secondary)]"
                title="Open Reading Capture"
                aria-label="Open Reading Capture"
              >
                <BookOpen className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onReturnToEntranceHall}
                className="p-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-semibold text-[var(--color-control)] text-[var(--color-secondary)]"
                title="Return to Entrance Hall"
                aria-label="Return to Entrance Hall"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-[var(--color-control)] text-[var(--color-secondary)]" />
                <span className="xs:inline hidden">Entrance Hall</span>
              </button>
              <button
                onClick={triggerRefresh}
                disabled={refreshing || isOffline}
                className="p-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors cursor-pointer"
                title="Manual Refresh (R)"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[var(--color-control)] text-[var(--color-ink)] ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={openSettings}
                className="p-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] transition-colors cursor-pointer"
                title="Settings"
              >
                <Settings className="w-3.5 h-3.5 text-[var(--color-control)] text-[var(--color-ink)]" />
              </button>
              <button
                onClick={handleLogout}
                className="p-2 rounded-lg border border-[var(--color-warning-surface)] hover:bg-[var(--color-warning-surface)] text-[var(--color-warning)] transition-colors cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Search bar widget - Full width on mobile, md:w-80 */}
          <GlobalSearchControl
            searchInputRef={searchInputRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            handleSearch={handleSearch}
            searchResults={searchResults}
            setSearchResults={setSearchResults}
            setSelectedNote={setSelectedNote}
            onClearSearch={onClearSearch}
          />

          {/* Context Tab Navigation bar & Diagnostics (Only visible on md and larger) */}
          <div className="hidden md:flex items-center gap-3">

            {/* Weather widget */}
            {dashboardData?.weather && (
              <div className="flex items-center gap-2 bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] px-3 py-1.5 rounded-lg text-xs font-normal">
                <CloudSun className="w-4 h-4 text-[var(--color-control)] text-[var(--color-secondary)]" />
                <div className="text-left leading-tight">
                  <p className="font-semibold">{dashboardData.weather.temperature}°{dashboardData.weather.units}</p>
                  <p className="text-[10px] text-[var(--color-secondary)]">{dashboardData.weather.location}</p>
                </div>
              </div>
            )}

            <button
              onClick={onOpenReadingCapture}
              className="px-3 py-1.5 sm:py-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] bg-[var(--color-card)] bg-[var(--color-card)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] text-xs font-semibold text-[var(--color-control)] text-[var(--color-secondary)] transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-control)]"
              title="Open Reading Capture"
              aria-label="Open Reading Capture"
            >
              <BookOpen className="w-4 h-4" />
              <span>Reading Capture</span>
            </button>

            <button
              onClick={onReturnToEntranceHall}
              className="px-3 py-1.5 sm:py-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] bg-[var(--color-card)] bg-[var(--color-card)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] text-xs font-semibold text-[var(--color-control)] text-[var(--color-secondary)] transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-control)]"
              title="Return to Entrance Hall"
              aria-label="Return to Entrance Hall"
            >
              <LayoutGrid className="w-4 h-4 text-[var(--color-control)] text-[var(--color-secondary)]" />
              <span>Entrance Hall</span>
            </button>

            <button
              onClick={triggerRefresh}
              disabled={refreshing || isOffline}
              className="p-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors cursor-pointer"
              title="Manual Refresh (R)"
            >
              <RefreshCw className={`w-4 h-4 text-[var(--color-control)] text-[var(--color-ink)] ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={openSettings}
              className="p-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] transition-colors cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-[var(--color-control)] text-[var(--color-ink)]" />
            </button>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg border border-[var(--color-warning-surface)] hover:bg-[var(--color-warning-surface)] text-[var(--color-warning)] transition-colors cursor-pointer"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>
    </>
  );
};
