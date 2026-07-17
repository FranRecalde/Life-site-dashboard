import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Brain, 
  Loader2, 
  AlertTriangle, 
  Plus, 
  X, 
  ExternalLink, 
  RefreshCw, 
  Folder, 
  Search, 
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { ObsidianClient, ObsidianNoteDetail, ObsidianApiError } from '../services/obsidianClient';

interface ThoughtCatcherProps {
  mode: 'desktop' | 'mobile';
  baseUrl: string;
  apiKey: string;
  vaultName: string;
  folderName: string; // Will be "Thought Catcher"
  onOpenNote: (note: ObsidianNoteDetail) => void;
  isEditorOpen?: boolean; // to pause auto refresh or animations
}

export const ThoughtCatcher: React.FC<ThoughtCatcherProps> = ({
  mode,
  baseUrl,
  apiKey,
  vaultName,
  folderName,
  onOpenNote,
  isEditorOpen = false
}) => {
  const [notes, setNotes] = useState<ObsidianNoteDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Interaction & Looping State
  const [scrollProgress, setScrollProgress] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Refs for animation frame loop
  const progressRef = useRef(0);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const targetIndexRef = useRef(0);

  // Interaction refs
  const touchStartRef = useRef<number | null>(null);
  const wheelAccumulatorRef = useRef(0);

  const fetchNotes = useCallback(async () => {
    if (mode === 'mobile') {
      setNotes([]);
      setLoading(false);
      setError(null);
      setErrorDetails(null);
      return;
    }

    if (!baseUrl || !apiKey) {
      setError('Obsidian connection not configured. Please enter your API Key and URL in the settings panel.');
      setNotes([]);
      return;
    }

    setLoading(true);
    setError(null);
    setErrorDetails(null);

    try {
      const entries = await ObsidianClient.listFilesInFolder(baseUrl, apiKey, folderName);
      if (entries.length === 0) {
        setNotes([]);
        return;
      }

      // Fetch file contents and metadata in parallel to get modification dates
      const filesWithDates = await Promise.all(
        entries.map(async (item) => {
          try {
            const fileData = await ObsidianClient.readFile(baseUrl, apiKey, item.fullVaultPath);
            const modifiedAt = fileData.lastModified;
            const content = fileData.content;
            const title = ObsidianClient.getTitleFromPath(item.fullVaultPath);
            const preview = ObsidianClient.cleanPreviewText(content);
            return {
              path: item.fullVaultPath,
              title,
              content,
              modifiedAt,
              preview
            };
          } catch (e) {
            console.error('Failed to read file:', item.fullVaultPath, e);
            return null;
          }
        })
      );

      // Filter out failed, sort newest first, limit to 12
      const validNotes = filesWithDates
        .filter((n): n is ObsidianNoteDetail => n !== null)
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
        .slice(0, 12);

      setNotes(validNotes);
      // Reset targets safely
      progressRef.current = 0;
      setScrollProgress(0);
      setTargetIndex(0);
      targetIndexRef.current = 0;
    } catch (err: any) {
      console.error('Error fetching Thought Catcher notes:', err);
      setError(err.message || 'Failed to connect to Obsidian local API.');
      if (err instanceof ObsidianApiError) {
        setErrorDetails({
          method: err.method,
          url: err.url,
          status: err.status,
          responseBody: err.responseBody,
          location: 'browser'
        });
      }
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [mode, baseUrl, apiKey, folderName]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Auto refresh interval (when editor is not open)
  useEffect(() => {
    if (mode === 'mobile' || isEditorOpen || !baseUrl || !apiKey) return;
    const interval = setInterval(() => {
      fetchNotes();
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, [mode, isEditorOpen, baseUrl, apiKey, fetchNotes]);

  // Sync state to ref for animation thread stability
  useEffect(() => {
    targetIndexRef.current = targetIndex;
  }, [targetIndex]);

  // Unified animation loop handling both continuous slow auto-rotation and precise snap lerps
  useEffect(() => {
    if (mode === 'mobile' || notes.length === 0) {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isReducedMotion = mediaQuery.matches;

    const shouldContinuousSpin = !isHovered && !isFocused && !isFormOpen && !isEditorOpen && notes.length > 1 && !isReducedMotion;

    const animate = (time: number) => {
      if (lastTimeRef.current !== null) {
        const delta = Math.min(time - lastTimeRef.current, 100); // Caps delta to prevent huge jumps
        const total = notes.length;
        const step = (2 * Math.PI) / total;

        if (shouldContinuousSpin) {
          // Continuous smooth vertical auto-rotation (approximately 60s per full rotation)
          const speed = (2 * Math.PI) / 60000; 
          progressRef.current = progressRef.current - speed * delta;

          // Align the highlighted targetIndex with the actual front-most card
          const currentSteps = progressRef.current / step;
          const rawIndex = Math.round(-currentSteps);
          const nearestIdx = ((rawIndex % total) + total) % total;
          if (nearestIdx !== targetIndexRef.current) {
            setTargetIndex(nearestIdx);
          }
          setScrollProgress(progressRef.current);
        } else {
          // Snapping/lerping mode (on hover, focus, form open, editor open or reduced motion)
          const currentSteps = progressRef.current / step;
          const currentTargetIdx = targetIndexRef.current;
          
          // Math helper to calculate the absolute closest step matching our index (preventing reverse spinning)
          const m = Math.round((currentSteps + currentTargetIdx) / total);
          const targetSteps = -currentTargetIdx + m * total;
          const targetProgress = targetSteps * step;

          const diff = targetProgress - progressRef.current;
          if (isReducedMotion) {
            // Instant snap for accessibility
            progressRef.current = targetProgress;
            setScrollProgress(targetProgress);
          } else if (Math.abs(diff) > 0.0005) {
            // High-fidelity easing interpolation (framerate independent)
            const lerpFactor = 1 - Math.exp(-0.012 * delta);
            progressRef.current = progressRef.current + diff * lerpFactor;
            setScrollProgress(progressRef.current);
          } else if (progressRef.current !== targetProgress) {
            progressRef.current = targetProgress;
            setScrollProgress(targetProgress);
          }
        }
      }
      lastTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = null;
    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [mode, notes.length, isHovered, isFocused, isFormOpen, isEditorOpen]);

  // Manual navigation handlers
  const handleNext = useCallback(() => {
    if (notes.length === 0) return;
    setTargetIndex((prev) => (prev + 1) % notes.length);
  }, [notes.length]);

  const handlePrev = useCallback(() => {
    if (notes.length === 0) return;
    setTargetIndex((prev) => (prev - 1 + notes.length) % notes.length);
  }, [notes.length]);

  // Touch Swipe Handlers for intuitive mobile/tablet swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null) return;
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStartRef.current - touchEnd;
    if (diff > 45) {
      handleNext(); // Swiped up (brings next note)
    } else if (diff < -45) {
      handlePrev(); // Swiped down (brings previous note)
    }
    touchStartRef.current = null;
  };

  // Throttle Scroll Wheel navigation on Desktop
  const handleWheel = (e: React.WheelEvent) => {
    wheelAccumulatorRef.current += e.deltaY;
    if (wheelAccumulatorRef.current >= 120) {
      handleNext();
      wheelAccumulatorRef.current = 0;
    } else if (wheelAccumulatorRef.current <= -120) {
      handlePrev();
      wheelAccumulatorRef.current = 0;
    }
  };

  // Keyboard navigation support
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleNext();
    }
  };

  const handleCreateThought = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    // Determine safe base filename
    const baseName = noteTitle.trim() 
      ? ObsidianClient.cleanFileName(noteTitle) 
      : ObsidianClient.generateUniqueBaseName(noteContent);

    const ext = baseName.toLowerCase().endsWith('.md') ? '' : '.md';
    const finalBaseName = `${baseName}${ext}`;

    if (mode === 'desktop') {
      try {
        let uniquePath = `${folderName}/${finalBaseName}`;
        let exists = await ObsidianClient.checkFileExists(baseUrl, apiKey, uniquePath);
        let counter = 1;
        while (exists) {
          const nameWithoutExt = finalBaseName.substring(0, finalBaseName.length - 3);
          uniquePath = `${folderName}/${nameWithoutExt} ${counter}.md`;
          exists = await ObsidianClient.checkFileExists(baseUrl, apiKey, uniquePath);
          counter++;
        }

        await ObsidianClient.createFile(baseUrl, apiKey, uniquePath, noteContent);
        setSaveSuccess('Thought successfully captured into your local Obsidian vault!');
        setNoteTitle('');
        setNoteContent('');
        setIsFormOpen(false);
        fetchNotes();
      } catch (err: any) {
        console.error('Error saving thought:', err);
        setSaveError(err.message || 'Failed to save note to local Obsidian.');
      } finally {
        setSaving(false);
      }
    } else {
      // Mobile Mode Save Behavior (Uri handoff)
      try {
        const uri = ObsidianClient.buildObsidianNewNoteUri(vaultName, folderName, finalBaseName, noteContent);
        window.location.href = uri;
        setSaveSuccess('Asked Obsidian to create your new note!');
      } catch (err: any) {
        console.error('Mobile handoff failed:', err);
        setSaveError('Failed to initiate handoff to Obsidian.');
      } finally {
        setSaving(false);
      }
    }
  };

  const handleClearDraft = () => {
    setNoteTitle('');
    setNoteContent('');
    setSaveSuccess(null);
    setSaveError(null);
    setIsFormOpen(false);
  };

  return (
    <section 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        wheelAccumulatorRef.current = 0;
      }}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className="bg-white dark:bg-[#131b2e] rounded-xl border border-[#eaedff] dark:border-[#283044] shadow-sm p-4 sm:p-6 text-left flex flex-col h-full focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      aria-label="Thought Catcher Interactive Note Wheel"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-[#00288e] dark:text-white uppercase flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600 dark:text-[#a8b8ff]" />
            THOUGHT CATCHER
          </h3>
          <p className="text-xs text-[#757684] mt-0.5">Capture ideas in motion</p>
        </div>
        <div className="flex items-center gap-1.5">
          {mode === 'desktop' && (
            <button
              onClick={fetchNotes}
              disabled={loading}
              className="p-1.5 rounded-lg border border-[#eaedff] dark:border-[#283044] hover:bg-gray-100 dark:hover:bg-gray-800 text-[#757684] transition-colors cursor-pointer"
              title="Refresh Thought Catcher"
              aria-label="Refresh Thought Catcher"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={() => {
              setIsFormOpen(!isFormOpen);
              setSaveError(null);
              setSaveSuccess(null);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00288e] hover:bg-[#1e40af] text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
            title="Catch a new thought"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Note</span>
          </button>
        </div>
      </div>

      {/* Form: Catch a thought */}
      {isFormOpen && (
        <form 
          onSubmit={handleCreateThought} 
          className="mb-4 p-4 rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-indigo-50/20 dark:bg-indigo-950/10 space-y-3 animate-fadeIn"
        >
          <div className="flex justify-between items-center pb-2 border-b border-[#eaedff] dark:border-[#283044]">
            <span className="text-xs font-bold text-indigo-600 dark:text-[#a8b8ff] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              Catch a stream thought
            </span>
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#757684]"
              title="Close form"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            <label htmlFor="thought-title" className="block text-[9px] font-extrabold text-[#757684] uppercase tracking-wider">
              Thought Title (Optional)
            </label>
            <input
              id="thought-title"
              type="text"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              disabled={saving}
              placeholder="E.g. Brainstorming session, flash idea..."
              className="w-full p-2 border border-[#eaedff] dark:border-[#283044] rounded-lg bg-white dark:bg-[#131b2e] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs text-[#131b2e] dark:text-white"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="thought-content" className="block text-[9px] font-extrabold text-[#757684] uppercase tracking-wider">
              Note Text (Required)
            </label>
            <textarea
              id="thought-content"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              disabled={saving}
              required
              placeholder="Start typing your thought flow..."
              className="w-full p-2 border border-[#eaedff] dark:border-[#283044] rounded-lg bg-white dark:bg-[#131b2e] focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs text-[#131b2e] dark:text-white min-h-[4rem] resize-none"
            />
          </div>

          {saveSuccess && (
            <div className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold flex items-start gap-1.5 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {saveError && (
            <div className="text-[#ba1a1a] dark:text-red-400 text-[10px] font-semibold flex items-start gap-1.5 py-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            {noteContent && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="px-2.5 py-1 rounded text-[10px] font-bold uppercase text-[#ba1a1a] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase text-[#757684] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !noteContent.trim()}
              className="px-3 py-1 rounded bg-[#00288e] hover:bg-[#1e40af] disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              {saving ? 'Saving...' : 'Save Thought'}
            </button>
          </div>
        </form>
      )}

      {/* Main Body content */}
      {mode === 'mobile' ? (
        <div className="flex-1 flex flex-col justify-between">
          <div className="bg-[#faf8ff] dark:bg-[#0c1322]/40 border border-[#eaedff] dark:border-[#283044] rounded-xl p-4 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-indigo-600 dark:text-[#a8b8ff] uppercase tracking-wider flex items-center gap-1.5">
                <Folder className="w-4 h-4" />
                Mobile Brain Stream
              </h4>
              <p className="text-[11px] leading-relaxed text-[#757684] dark:text-[#a3a3b3]">
                Capture streams of consciousness straight into your mobile Obsidian app. Saved thoughts are synced to your computer using your vault sync provider.
              </p>
            </div>

            <div className="space-y-2 mt-4">
              <a
                href={ObsidianClient.buildObsidianOpenVaultUri(vaultName)}
                className="flex items-center justify-between p-2.5 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-white dark:bg-[#131b2e] hover:bg-[#eaedff]/40 dark:hover:bg-[#1e293b]/50 text-xs font-medium text-[#131b2e] dark:text-white transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Open {vaultName} Vault</span>
                </span>
                <ChevronUp className="w-3.5 h-3.5 opacity-50 rotate-90" />
              </a>

              <a
                href={ObsidianClient.buildObsidianSearchUri(vaultName, `path:"Thought Catcher"`)}
                className="flex items-center justify-between p-2.5 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-white dark:bg-[#131b2e] hover:bg-[#eaedff]/40 dark:hover:bg-[#1e293b]/50 text-xs font-medium text-[#131b2e] dark:text-white transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-purple-500" />
                  <span>Browse Folder</span>
                </span>
                <ChevronUp className="w-3.5 h-3.5 opacity-50 rotate-90" />
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center min-h-[300px]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-xs text-[#757684]">
              <Loader2 className="w-6 h-6 animate-spin text-[#00288e]" />
              <span>Listening to your thought stream...</span>
            </div>
          )}

          {error && !loading && (
            <div className="bg-[#ffdad6] text-[#ba1a1a] dark:bg-[#ef4444]/10 dark:text-[#f87171] p-4 rounded-xl text-xs leading-relaxed space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
              </div>
              {errorDetails && (
                <div className="pt-2 border-t border-[#ba1a1a]/20 dark:border-[#f87171]/20 text-[10px] font-mono break-all opacity-80">
                  {errorDetails.method} {errorDetails.url} {errorDetails.status && `[${errorDetails.status}]`}
                </div>
              )}
            </div>
          )}

          {!loading && !error && notes.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#faf8ff] dark:bg-[#0c1322]/20 border border-dashed border-[#eaedff] dark:border-[#283044] rounded-xl">
              <Brain className="w-10 h-10 text-indigo-400 opacity-40 mb-2" />
              <p className="text-xs font-medium text-[#757684] dark:text-[#a3a3b3]">No thoughts caught yet.</p>
              <p className="text-[10px] text-[#757684]/80 mt-1 max-w-[200px]">Create files in your "Thought Catcher" folder to see them stream here.</p>
            </div>
          )}

          {/* Glowing Neural Brain Loop Interface */}
          {!loading && !error && notes.length > 0 && (
            <div 
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              className="relative w-full flex-1 flex flex-col items-center justify-center p-4 select-none outline-none"
            >
              {/* Brain connection background network */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-72 h-72 flex items-center justify-center">
                  <Brain className="absolute w-64 h-64 text-indigo-500/[0.04] dark:text-indigo-400/[0.06] blur-[2px]" />
                  <svg className="absolute inset-0 w-full h-full text-indigo-500/10 dark:text-indigo-400/5 animate-pulse" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M15,50 Q30,25 50,50 T85,50" fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="2,3" />
                    <path d="M25,35 Q50,65 75,35" fill="none" stroke="currentColor" strokeWidth="0.4" strokeDasharray="3,2" />
                    <circle cx="50" cy="50" r="1.5" className="fill-indigo-500/30 animate-ping" />
                    <circle cx="35" cy="42" r="1" className="fill-purple-500/40" />
                    <circle cx="65" cy="58" r="1" className="fill-indigo-500/40" />
                  </svg>
                </div>
              </div>

              {/* Kinetic container - Organic brain blob shape with neon indigo aura */}
              <div 
                className="w-full max-w-sm aspect-[4/3] relative flex items-center justify-center rounded-[40%_50%_35%_45%_/_45%_35%_55%_40%] bg-indigo-50/5 dark:bg-indigo-950/[0.08] border border-indigo-200/30 dark:border-indigo-500/10 shadow-[0_0_30px_-5px_rgba(99,102,241,0.06)] dark:shadow-[0_0_40px_-5px_rgba(99,102,241,0.12)] p-6 min-h-[280px]"
              >
                {/* Manual rotation overlays (Subtle Up/Down controls) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  className="absolute top-2 left-1/2 -translate-x-1/2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-600 dark:hover:text-[#a8b8ff] transition-all cursor-pointer z-[250]"
                  title="Previous Note (ArrowUp)"
                  aria-label="Previous Note"
                >
                  <ChevronUp className="w-5 h-5 animate-bounce" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-indigo-600 dark:hover:text-[#a8b8ff] transition-all cursor-pointer z-[250]"
                  title="Next Note (ArrowDown)"
                  aria-label="Next Note"
                >
                  <ChevronDown className="w-5 h-5 animate-bounce" />
                </button>

                {/* Looping kinetic wheel list items */}
                {notes.map((note, index) => {
                  const total = notes.length;
                  const step = (2 * Math.PI) / total;
                  
                  // Compute dynamic angle of this note around the 3D looping cylinder
                  const theta = (index * step) + scrollProgress;
                  const cosTheta = Math.cos(theta); // Depth coordinate (-1 to 1)
                  const sinTheta = Math.sin(theta); // Vertical layout position coordinate (-1 to 1)

                  // Render physics calculations (scale, blur, opacity, zIndex, translateY)
                  const scale = 0.65 + 0.35 * ((cosTheta + 1) / 2); // Scales down as it recedes
                  const translateY = sinTheta * 85; // Moves up/down on cylinder loop
                  
                  // Card opacity fades fully to 0 as it crosses to the back half to maintain clean visuals
                  const opacity = cosTheta >= -0.4 ? ((cosTheta + 0.4) / 1.4) : 0;
                  const blurAmount = Math.max(0, (1 - cosTheta) * 3); // blur increases as it moves to the back
                  const zIndex = Math.round((cosTheta + 1) * 100); // Front-most card always on top

                  const isActive = index === targetIndex;

                  return (
                    <button
                      key={note.path}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenNote(note);
                      }}
                      style={{ 
                        transform: `translateY(${translateY}px) scale(${scale})`,
                        opacity: opacity,
                        filter: `blur(${blurAmount}px)`,
                        zIndex: zIndex,
                        pointerEvents: opacity > 0.15 ? 'auto' : 'none' // disable click for receding cards
                      }}
                      className={`absolute w-[92%] max-w-[290px] p-4 text-left rounded-xl transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/80 group ${
                        isActive 
                          ? 'border-2 border-indigo-500 dark:border-indigo-400 bg-white dark:bg-[#131b2e] shadow-[0_8px_30px_rgb(99,102,241,0.12)] dark:shadow-[0_8px_30px_rgba(168,184,255,0.14)] scale-[1.03]' 
                          : 'border border-gray-100 dark:border-gray-800 bg-white/90 dark:bg-[#131b2e]/90 shadow-[0_4px_12px_rgba(0,0,0,0.03)]'
                      }`}
                      aria-label={`Open thought: ${note.title}. ${isActive ? 'Currently focused.' : ''}`}
                      title={`Open thought: ${note.title}`}
                    >
                      <div className="flex justify-between items-start gap-1 w-full mb-1">
                        <span className={`font-display font-bold text-xs line-clamp-1 transition-colors ${
                          isActive 
                            ? 'text-[#131b2e] dark:text-white text-sm font-extrabold' 
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {note.title}
                        </span>
                        {isActive && (
                          <ExternalLink className="w-3.5 h-3.5 shrink-0 text-indigo-500 animate-pulse" />
                        )}
                      </div>
                      
                      <p className={`text-[11px] line-clamp-2 leading-relaxed transition-all ${
                        isActive 
                          ? 'text-[#757684] dark:text-gray-300' 
                          : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {note.preview || <span className="italic opacity-60">Empty thought note</span>}
                      </p>

                      {isActive && (
                        <div className="flex justify-between items-center text-[9px] font-mono text-[#757684]/80 mt-2.5 uppercase pt-2 border-t border-gray-100 dark:border-gray-800">
                          <span>
                            {new Date(note.modifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span>
                            {new Date(note.modifiedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Source guide footer */}
              <div className="mt-4 text-[10px] text-gray-400 dark:text-gray-500 font-mono flex items-center gap-1 uppercase tracking-wider">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>Scroll wheel or touch swipe to rotate</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
