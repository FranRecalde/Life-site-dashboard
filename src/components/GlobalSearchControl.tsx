import React from 'react';
import { Search, X } from 'lucide-react';
import { ObsidianNote } from '../types';

export type GlobalSearchOutcome =
  | { kind: 'complete' }
  | { kind: 'mobile-handoff'; uri: string };

export type GlobalSearchHandler = (
  value: string,
  options?: { openMobileSearch?: boolean }
) => Promise<GlobalSearchOutcome>;

interface MobileHandoffEventSource {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface MobileHandoffMonitorOptions {
  pageTarget: MobileHandoffEventSource;
  visibilityTarget: MobileHandoffEventSource;
  isPageHidden: () => boolean;
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancelScheduled: (handle: unknown) => void;
  onFallback: () => void;
  delayMs?: number;
}

export const MOBILE_HANDOFF_FALLBACK_DELAY_MS = 1500;

export function startMobileHandoffFallbackMonitor({
  pageTarget,
  visibilityTarget,
  isPageHidden,
  schedule,
  cancelScheduled,
  onFallback,
  delayMs = MOBILE_HANDOFF_FALLBACK_DELAY_MS,
}: MobileHandoffMonitorOptions): () => void {
  let active = true;
  let scheduledHandle: unknown;

  const cleanup = () => {
    if (!active) return;
    active = false;
    pageTarget.removeEventListener('pagehide', handlePageHide);
    visibilityTarget.removeEventListener('visibilitychange', handleVisibilityChange);
    if (scheduledHandle !== undefined) {
      cancelScheduled(scheduledHandle);
    }
  };

  const handlePageHide: EventListener = () => {
    cleanup();
  };
  const handleVisibilityChange: EventListener = () => {
    if (isPageHidden()) {
      cleanup();
    }
  };

  pageTarget.addEventListener('pagehide', handlePageHide);
  visibilityTarget.addEventListener('visibilitychange', handleVisibilityChange);
  scheduledHandle = schedule(() => {
    if (!active) return;
    if (isPageHidden()) {
      cleanup();
      return;
    }
    cleanup();
    onFallback();
  }, delayMs);

  return cleanup;
}

export async function copyGlobalSearchQuery(
  query: string,
  clipboard: { writeText(value: string): Promise<void> } | undefined
): Promise<void> {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    throw new Error('There is no search query to copy.');
  }
  if (!clipboard?.writeText) {
    throw new Error('Clipboard access is unavailable in this browser.');
  }
  await clipboard.writeText(cleanQuery);
}

export interface GlobalSearchControlProps {
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  handleSearch: GlobalSearchHandler;
  searchResults: { notes: ObsidianNote[] } | null;
  setSearchResults: (val: { notes: ObsidianNote[] } | null) => void;
  setSelectedNote: (note: ObsidianNote | null) => void;
  className?: string;
  isEntranceHall?: boolean;
  onClearSearch?: () => void;
}

export const GlobalSearchControl: React.FC<GlobalSearchControlProps> = ({
  searchInputRef,
  searchQuery,
  setSearchQuery,
  handleSearch,
  searchResults,
  setSearchResults,
  setSelectedNote,
  className = "w-full md:w-80",
  isEntranceHall = false,
  onClearSearch,
}) => {
  const [searchMessage, setSearchMessage] = React.useState<string | null>(null);
  const [mobileCopyFallback, setMobileCopyFallback] = React.useState<{
    query: string;
    status: 'ready' | 'copied' | 'failed';
  } | null>(null);
  const searchRequestRef = React.useRef(0);
  const mobileHandoffCleanupRef = React.useRef<(() => void) | null>(null);

  const stopMobileHandoffMonitor = () => {
    mobileHandoffCleanupRef.current?.();
    mobileHandoffCleanupRef.current = null;
  };

  const clearMobileHandoffState = () => {
    stopMobileHandoffMonitor();
    setMobileCopyFallback(null);
  };

  React.useEffect(() => () => {
    mobileHandoffCleanupRef.current?.();
    mobileHandoffCleanupRef.current = null;
  }, []);

  const runSearch = async (value: string, openMobileSearch = false) => {
    const requestId = ++searchRequestRef.current;
    clearMobileHandoffState();
    setSearchMessage(null);
    try {
      const outcome = await handleSearch(value, { openMobileSearch });
      if (searchRequestRef.current !== requestId || outcome.kind !== 'mobile-handoff') {
        return;
      }

      const cleanQuery = value.trim();
      const offerCopyFallback = () => {
        if (searchRequestRef.current !== requestId) return;
        mobileHandoffCleanupRef.current = null;
        setMobileCopyFallback({ query: cleanQuery, status: 'ready' });
        setSearchMessage('Obsidian did not open. Copy the query and paste it into Obsidian search.');
      };

      mobileHandoffCleanupRef.current = startMobileHandoffFallbackMonitor({
        pageTarget: window,
        visibilityTarget: document,
        isPageHidden: () => document.visibilityState === 'hidden',
        schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
        cancelScheduled: handle => window.clearTimeout(handle as number),
        onFallback: offerCopyFallback,
      });

      try {
        window.location.href = outcome.uri;
      } catch {
        stopMobileHandoffMonitor();
        offerCopyFallback();
      }
    } catch (error) {
      if (searchRequestRef.current === requestId) {
        setSearchMessage(
          error instanceof Error
            ? error.message
            : 'Obsidian note search failed. Check the desktop connection and try again.'
        );
      }
    }
  };

  const clearLocalSearchState = () => {
    searchRequestRef.current += 1;
    clearMobileHandoffState();
    setSearchMessage(null);
  };

  const handleCopyMobileQuery = async () => {
    if (!mobileCopyFallback) return;
    const requestId = searchRequestRef.current;
    const fallbackQuery = mobileCopyFallback.query;
    try {
      await copyGlobalSearchQuery(fallbackQuery, navigator.clipboard);
      if (searchRequestRef.current !== requestId) return;
      setMobileCopyFallback({ query: fallbackQuery, status: 'copied' });
      setSearchMessage('Query copied. Paste it into Obsidian search.');
    } catch {
      if (searchRequestRef.current !== requestId) return;
      setMobileCopyFallback({ query: fallbackQuery, status: 'failed' });
      setSearchMessage('Clipboard access failed. Select and copy the query below.');
    }
  };

  return (
    <div className={`relative ${className}`}>
      <Search className={`w-4 h-4 absolute left-3 top-3 ${isEntranceHall ? 'text-[#c5a86a]' : 'text-[#757684]'}`} />
      <input
        type="text"
        ref={searchInputRef}
        value={searchQuery}
        onChange={(e) => {
          void runSearch(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && searchQuery.trim()) {
            e.preventDefault();
            void runSearch(searchQuery, true);
          }
        }}
        className={`w-full pl-9 pr-8 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-1 ${
          isEntranceHall
            ? 'border-[#c5a86a]/30 focus:border-[#e4cb93] focus:ring-[#e4cb93] bg-[#0c1322] text-white placeholder-slate-500'
            : 'border-[#c4c5d5] dark:border-[#444653] focus:border-[#00288e] dark:focus:border-white focus:ring-[#00288e] dark:focus:ring-white bg-[#faf8ff] dark:bg-[#131b2e] text-[#131b2e] dark:text-white'
        }`}
        placeholder="Search / (Calendar, tasks, notes)"
      />
      {searchQuery && (
        <button
          onClick={() => {
            clearLocalSearchState();
            if (onClearSearch) {
              onClearSearch();
            } else {
              setSearchQuery('');
              setSearchResults(null);
            }
          }}
          className={`absolute right-3 top-2.5 cursor-pointer ${
            isEntranceHall ? 'text-slate-400 hover:text-[#ba1a1a]' : 'text-[#757684] hover:text-[#ba1a1a]'
          }`}
          type="button"
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Global Search Results Overlay */}
      {(searchResults || searchMessage) && searchQuery && (
        <div className={`absolute top-11 left-0 right-0 border rounded-lg shadow-xl z-50 p-4 max-h-96 overflow-y-auto ${
          isEntranceHall
            ? 'bg-[#0d1527] border-[#c5a86a]/30 text-white shadow-black/80'
            : 'bg-white dark:bg-[#131b2e] border-[#eaedff] dark:border-[#283044] text-[#131b2e] dark:text-white shadow-xl'
        }`}>
          <div className={`flex justify-between items-center mb-2 pb-2 border-b ${
            isEntranceHall ? 'border-[#1e293b]' : 'border-[#eaedff] dark:border-[#283044]'
          }`}>
            <p className={`text-xs font-bold font-display uppercase tracking-wider ${
              isEntranceHall ? 'text-[#c5a86a]' : 'text-[#757684]'
            }`}>Search Results</p>
            <button
              onClick={() => {
                clearLocalSearchState();
                if (onClearSearch) {
                  onClearSearch();
                } else {
                  setSearchQuery('');
                  setSearchResults(null);
                }
              }}
              className="text-[#757684] hover:text-[#ba1a1a] cursor-pointer"
              type="button"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          
          {searchMessage ? (
            <div className="text-center py-4" role="status">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {searchMessage}
              </p>
              {mobileCopyFallback && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyMobileQuery();
                    }}
                    className="rounded-md border border-amber-500/50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30"
                  >
                    {mobileCopyFallback.status === 'copied' ? 'Query copied' : 'Copy query'}
                  </button>
                  {mobileCopyFallback.status === 'failed' && (
                    <code className="max-w-full select-all break-words rounded bg-black/5 px-2 py-1 text-xs text-[#131b2e] dark:bg-white/10 dark:text-white">
                      {mobileCopyFallback.query}
                    </code>
                  )}
                </div>
              )}
            </div>
          ) : searchResults && searchResults.notes.length === 0 ? (
            <p className="text-xs text-[#757684] text-center py-4">No matching Obsidian notes found.</p>
          ) : searchResults ? (
            <div className="space-y-2">
              <p className={`text-[10px] font-extrabold uppercase tracking-widest font-display ${
                isEntranceHall ? 'text-[#c5a86a]' : 'text-[#00288e] dark:text-[#a8b8ff]'
              }`}>Obsidian Notes ({searchResults.notes.length})</p>
              {searchResults.notes.map(n => (
                <div 
                  key={n.id} 
                  onClick={() => {
                    setSelectedNote(n);
                    if (onClearSearch) {
                      onClearSearch();
                    } else {
                      setSearchQuery('');
                      setSearchResults(null);
                    }
                  }}
                  className={`p-2 rounded cursor-pointer transition-colors text-left ${
                    isEntranceHall
                      ? 'hover:bg-[#1e293b]/50'
                      : 'hover:bg-[#f2f3ff] dark:hover:bg-[#273545]/50'
                  }`}
                >
                  <p className={`text-xs font-bold ${isEntranceHall ? 'text-white' : 'text-[#131b2e] dark:text-white'}`}>{n.title}</p>
                  <p className="text-[10px] text-[#757684] truncate mt-0.5">{n.preview}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
