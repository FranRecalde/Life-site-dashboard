import React, { useState } from 'react';
import { 
  Folder, 
  ExternalLink, 
  Search, 
  FileText, 
  X, 
  CheckCircle2, 
  Mic, 
  MicOff, 
  Info, 
  AlertTriangle, 
  Loader2 
} from 'lucide-react';
import { ObsidianClient, ObsidianNoteDetail, ObsidianApiError } from '../services/obsidianClient';
import { UserSettings } from '../types';
import { ObsidianErrorBox } from './feedback/ObsidianErrorBox';

export interface ObsidianNotesInboxProps {
  // Connection and settings
  settings: UserSettings | null;
  obsidianUrl: string;
  obsidianApiKey: string;
  isOffline: boolean;
  activeTab: 'combined' | 'personal' | 'professional';
  
  // Recent notes state
  recentNotes: ObsidianNoteDetail[];
  recentNotesLoading: boolean;
  recentNotesError: string | null;
  recentNotesErrorDetails: ObsidianApiError | null;
  
  // Selected note / Inline editor state
  selectedRecentNote: ObsidianNoteDetail | null;
  setSelectedRecentNote: (note: ObsidianNoteDetail | null) => void;
  editedNoteContent: string;
  setEditedNoteContent: (content: string) => void;
  isSavingEditedNote: boolean;
  saveNoteSuccess: boolean | null;
  saveNoteError: string | null;
  saveNoteErrorDetails: ObsidianApiError | null;
  
  // Append functionality state
  appendNoteContent: string;
  setAppendNoteContent: (content: string) => void;
  isAppendingNote: boolean;
  appendNoteSuccess: boolean | null;
  appendNoteError: string | null;
  appendNoteErrorDetails: ObsidianApiError | null;
  
  // New note capture inputs & controls
  obsidianTitle: string;
  setObsidianTitle: (title: string) => void;
  obsidianInput: string;
  setObsidianInput: (input: string) => void;
  obsidianLoading: boolean;
  obsidianSuccess: boolean;
  obsidianError: string | null;
  obsidianErrorDetails: ObsidianApiError | null;
  mobileHandoffStatus: 'idle' | 'copied' | 'success' | 'failed';
  obsidianMode: 'new_note' | 'append';
  setObsidianMode: (mode: 'new_note' | 'append') => void;
  obsidianContext: 'personal' | 'professional' | 'combined';
  setObsidianContext: (ctx: 'personal' | 'professional' | 'combined') => void;
  
  // Voice controls
  isVoiceSupported: boolean;
  isListeningObsidian: boolean;
  toggleVoiceObsidian: () => void;
  
  // DOM references
  obsidianTitleRef: React.RefObject<HTMLInputElement | null>;
  notesInputRef: React.RefObject<HTMLTextAreaElement | null>;
  
  // Callback functions
  handleOpenRecentNote: (note: ObsidianNoteDetail) => void;
  handleSaveChanges: () => void;
  handleAppendToNote: () => void;
  submitObsidianNote: (e: React.FormEvent) => void;
  handleMobileSaveInObsidian: () => void;
  handleMobileCopyNote: () => void;
  handleOpenObsidianAgain: () => void;
  handleClearSavedDraft: () => void;
  handleTitleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  getActiveObsidianMode: () => 'desktop' | 'mobile';
  getAppendTargetFile: () => string;
  getSelectedContext: () => 'personal' | 'professional';
}

export const ObsidianNotesInbox: React.FC<ObsidianNotesInboxProps> = ({
  settings,
  obsidianUrl,
  obsidianApiKey,
  isOffline,
  activeTab,
  recentNotes,
  recentNotesLoading,
  recentNotesError,
  recentNotesErrorDetails,
  selectedRecentNote,
  setSelectedRecentNote,
  editedNoteContent,
  setEditedNoteContent,
  isSavingEditedNote,
  saveNoteSuccess,
  saveNoteError,
  saveNoteErrorDetails,
  appendNoteContent,
  setAppendNoteContent,
  isAppendingNote,
  appendNoteSuccess,
  appendNoteError,
  appendNoteErrorDetails,
  obsidianTitle,
  setObsidianTitle,
  obsidianInput,
  setObsidianInput,
  obsidianLoading,
  obsidianSuccess,
  obsidianError,
  obsidianErrorDetails,
  mobileHandoffStatus,
  obsidianMode,
  setObsidianMode,
  obsidianContext,
  setObsidianContext,
  isVoiceSupported,
  isListeningObsidian,
  toggleVoiceObsidian,
  obsidianTitleRef,
  notesInputRef,
  handleOpenRecentNote,
  handleSaveChanges,
  handleAppendToNote,
  submitObsidianNote,
  handleMobileSaveInObsidian,
  handleMobileCopyNote,
  handleOpenObsidianAgain,
  handleClearSavedDraft,
  handleTitleKeyDown,
  getActiveObsidianMode,
  getAppendTargetFile,
  getSelectedContext,
}) => {
  const [mobileObsidianSearchQuery, setMobileObsidianSearchQuery] = useState('');

  return (
    <section className="col-span-1 xl:col-span-7 bg-white dark:bg-[#131b2e] rounded-xl border border-[#eaedff] dark:border-[#283044] shadow-sm p-4 sm:p-6 text-left flex flex-col">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-[#00288e] dark:text-white uppercase">NOTES INBOX</h3>
          <p className="text-xs text-[#757684] mt-0.5">Capture Thoughts (N)</p>
        </div>
      </div>

      {/* Recent Notes Section or Mobile Obsidian shortcuts */}
      {getActiveObsidianMode() === 'mobile' ? (
        <div className="mb-6 space-y-4">
          <div className="bg-[#faf8ff] dark:bg-[#0c1322]/40 border border-[#eaedff] dark:border-[#283044] rounded-xl p-4">
            <h4 className="text-xs font-bold text-[#00288e] dark:text-[#a8b8ff] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Folder className="w-4 h-4" />
              Mobile Obsidian Shortcuts
            </h4>
            <p className="text-[11px] leading-relaxed text-[#757684] dark:text-[#a3a3b3] mb-4">
              Obsidian Sync keeps the same vault on your phone and computer. On Android, Life Site can create, append, open and search through the Obsidian app. Reading and editing the vault directly inside Life Site still requires the desktop Local REST connection.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
              <a
                href={ObsidianClient.buildObsidianOpenVaultUri(settings?.obsidian?.vaultName || 'LifeVault')}
                className="flex items-center gap-2 p-2.5 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-white dark:bg-[#131b2e] hover:bg-[#eaedff]/40 dark:hover:bg-[#1e293b]/50 text-xs font-medium text-[#131b2e] dark:text-white transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#00288e] dark:text-[#a8b8ff]" />
                <span>Open Obsidian vault</span>
              </a>

              <a
                href={ObsidianClient.buildObsidianSearchUri(settings?.obsidian?.vaultName || 'LifeVault', `path:"${settings?.obsidian?.inboxFolder || 'Fleeting Notes'}"`)}
                className="flex items-center gap-2 p-2.5 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-white dark:bg-[#131b2e] hover:bg-[#eaedff]/40 dark:hover:bg-[#1e293b]/50 text-xs font-medium text-[#131b2e] dark:text-white transition-all cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-[#00288e] dark:text-[#a8b8ff]" />
                <span>Search Fleeting Notes</span>
              </a>

              {settings?.obsidian?.personalInboxFile ? (
                <a
                  href={ObsidianClient.buildObsidianUri(settings?.obsidian?.vaultName || 'LifeVault', settings.obsidian.personalInboxFile)}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-white dark:bg-[#131b2e] hover:bg-[#eaedff]/40 dark:hover:bg-[#1e293b]/50 text-xs font-medium text-[#131b2e] dark:text-white transition-all cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span>Open Personal Inbox</span>
                </a>
              ) : null}

              {settings?.obsidian?.professionalInboxFile ? (
                <a
                  href={ObsidianClient.buildObsidianUri(settings?.obsidian?.vaultName || 'LifeVault', settings.obsidian.professionalInboxFile)}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-white dark:bg-[#131b2e] hover:bg-[#eaedff]/40 dark:hover:bg-[#1e293b]/50 text-xs font-medium text-[#131b2e] dark:text-white transition-all cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-purple-500" />
                  <span>Open Professional Inbox</span>
                </a>
              ) : null}
            </div>

            {/* Custom search box */}
            <div className="pt-3 border-t border-[#eaedff] dark:border-[#283044] flex items-center gap-2">
              <input
                type="text"
                placeholder="Search vault in Obsidian..."
                value={mobileObsidianSearchQuery}
                onChange={(e) => setMobileObsidianSearchQuery(e.target.value)}
                className="flex-1 p-2 border border-[#c4c5d5] dark:border-[#444653] rounded-lg bg-white dark:bg-[#131b2e] text-xs focus:outline-none focus:border-[#00288e] text-[#131b2e] dark:text-white"
              />
              <a
                href={ObsidianClient.buildObsidianSearchUri(settings?.obsidian?.vaultName || 'LifeVault', mobileObsidianSearchQuery)}
                className="bg-[#00288e] hover:bg-[#1e40af] text-white text-[10px] font-bold uppercase tracking-wider py-2 px-3 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Search className="w-3 h-3" />
                Search
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <h4 className="text-xs font-bold text-[#00288e] dark:text-[#a8b8ff] uppercase tracking-wider mb-2.5">
            Recent Notes
          </h4>
          
          {recentNotesLoading && (
            <div className="flex items-center justify-center py-6 gap-2 text-xs text-[#757684]">
              <Loader2 className="w-4 h-4 animate-spin text-[#00288e]" />
              <span>Loading recent notes...</span>
            </div>
          )}
          
          {recentNotesError && (
            <ObsidianErrorBox 
              errorText={recentNotesError} 
              techDetails={recentNotesErrorDetails}
            />
          )}
          
          {!recentNotesLoading && !recentNotesError && recentNotes.length === 0 && (
            <p className="text-xs text-[#757684] italic py-3">No notes in {settings?.obsidian?.inboxFolder || 'Fleeting Notes'} yet.</p>
          )}
          
          {!recentNotesLoading && !recentNotesError && recentNotes.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {recentNotes.slice(0, 3).map((note) => (
                <button
                  key={note.path}
                  type="button"
                  onClick={() => handleOpenRecentNote(note)}
                  className="group flex flex-col text-left p-3 rounded-lg border border-[#eaedff] dark:border-[#283044] bg-[#faf8ff] dark:bg-[#0c1322]/30 hover:bg-[#eae6ff] dark:hover:bg-[#1a233a] transition-all focus:outline-none focus:ring-1 focus:ring-[#00288e] h-full"
                >
                  <div className="flex justify-between items-start gap-1 w-full mb-1">
                    <span className="font-display font-bold text-xs text-[#131b2e] dark:text-white line-clamp-1 group-hover:text-[#00288e] dark:group-hover:text-[#a8b8ff] transition-colors">
                      {note.title}
                    </span>
                    <ExternalLink className="w-3 h-3 shrink-0 text-[#757684] opacity-40 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-[11px] text-[#757684] dark:text-[#a3a3b3] line-clamp-2 leading-relaxed flex-1 mb-2">
                    {note.preview || <span className="italic opacity-60">Empty note</span>}
                  </p>
                  <span className="text-[9px] font-mono text-[#757684]/80 uppercase mt-auto">
                    {new Date(note.modifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                    {new Date(note.modifiedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline Editor for Recent Note */}
      {selectedRecentNote && (
        <div className="mb-6 p-4 rounded-xl border border-[#00288e]/30 dark:border-[#a8b8ff]/30 bg-[#eaedff]/30 dark:bg-[#0c1322]/70 space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center pb-2 border-b border-[#eaedff] dark:border-[#283044]">
            <div className="flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#00288e] dark:text-[#a8b8ff]" />
              <span className="font-display font-bold text-xs uppercase tracking-wider text-[#00288e] dark:text-[#a8b8ff] truncate max-w-[200px] md:max-w-[400px]">
                Editing: {selectedRecentNote.title}
              </span>
            </div>
            <button 
              type="button"
              onClick={() => setSelectedRecentNote(null)}
              className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-[#757684]"
              title="Close editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="note-content-editor" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
              File Contents (Markdown)
            </label>
            <textarea
              id="note-content-editor"
              value={editedNoteContent}
              onChange={(e) => setEditedNoteContent(e.target.value)}
              disabled={isSavingEditedNote}
              className="w-full p-3 font-mono text-base md:text-xs border border-[#c4c5d5] dark:border-[#444653] rounded-lg bg-white dark:bg-[#0c1322] focus:outline-none focus:border-[#00288e] text-[#131b2e] dark:text-white leading-relaxed min-h-[8rem]"
            />
            
            {saveNoteSuccess && (
              <div className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 py-0.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Changes saved successfully to Obsidian vault!</span>
              </div>
            )}
            {saveNoteError && (
              <ObsidianErrorBox 
                errorText={saveNoteError} 
                techDetails={saveNoteErrorDetails}
              />
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isSavingEditedNote || isAppendingNote}
                className="bg-[#00288e] hover:bg-[#1e40af] disabled:opacity-50 text-white font-display text-[10px] font-bold uppercase tracking-wider py-2 px-4 rounded transition-colors"
              >
                {isSavingEditedNote ? 'Saving...' : 'Save Changes'}
              </button>
              
              <a
                href={ObsidianClient.buildObsidianUri(settings?.obsidian?.vaultName || 'LifeVault', selectedRecentNote.path)}
                className="inline-flex items-center gap-1 bg-[#faf8ff] hover:bg-[#eaedff] dark:bg-[#131b2e] dark:hover:bg-[#1a233a] text-[#131b2e] dark:text-white border border-[#eaedff] dark:border-[#283044] font-display text-[10px] font-bold uppercase tracking-wider py-2 px-4 rounded transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Obsidian</span>
              </a>

              <button
                type="button"
                onClick={() => setSelectedRecentNote(null)}
                disabled={isSavingEditedNote}
                className="text-[#757684] hover:text-[#131b2e] dark:hover:text-white font-display text-[10px] font-bold uppercase tracking-wider py-2 px-3"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-[#eaedff] dark:border-[#283044] space-y-2">
            <label htmlFor="note-append-editor" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
              Append to Note
            </label>
            <textarea
              id="note-append-editor"
              value={appendNoteContent}
              onChange={(e) => setAppendNoteContent(e.target.value)}
              disabled={isAppendingNote}
              placeholder="Type material to append (will be separated by a blank line)..."
              className="w-full p-3 text-base md:text-xs border border-[#c4c5d5] dark:border-[#444653] rounded-lg bg-white dark:bg-[#0c1322] focus:outline-none focus:border-[#00288e] text-[#131b2e] dark:text-white leading-relaxed min-h-[4rem]"
            />

            {appendNoteSuccess && (
              <div className="text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-1.5 py-0.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Appended successfully to the note!</span>
              </div>
            )}
            {appendNoteError && (
              <ObsidianErrorBox 
                errorText={appendNoteError} 
                techDetails={appendNoteErrorDetails}
              />
            )}

            <div>
              <button
                type="button"
                onClick={handleAppendToNote}
                disabled={isAppendingNote || isSavingEditedNote || !appendNoteContent.trim()}
                className="bg-[#00288e] hover:bg-[#1e40af] disabled:opacity-40 text-white font-display text-[10px] font-bold uppercase tracking-wider py-2 px-4 rounded transition-colors"
              >
                {isAppendingNote ? 'Appending...' : 'Append to Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Capture Form */}
      <form onSubmit={submitObsidianNote} className="space-y-4 flex-1 flex flex-col">
        {getActiveObsidianMode() !== 'mobile' && obsidianSuccess && (
          <div className="bg-[#eaedff] dark:bg-[#273545]/60 text-[#00288e] dark:text-[#a8b8ff] p-2.5 rounded text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Note successfully captured into Obsidian vault!</span>
          </div>
        )}
        {getActiveObsidianMode() !== 'mobile' && obsidianError && (
          <ObsidianErrorBox 
            errorText={obsidianError} 
            techDetails={obsidianErrorDetails}
          />
        )}

        {getActiveObsidianMode() === 'mobile' && mobileHandoffStatus === 'copied' && (
          <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 p-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-800/30 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Note content copied to clipboard! (Your draft remains saved)</span>
          </div>
        )}
        {getActiveObsidianMode() === 'mobile' && mobileHandoffStatus === 'failed' && (
          <div className="bg-[#ffdad6] text-[#ba1a1a] p-2.5 rounded text-xs font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-[#ba1a1a]" />
            <span>Failed to copy note content to clipboard.</span>
          </div>
        )}

        {getActiveObsidianMode() === 'mobile' && mobileHandoffStatus === 'success' && (
          <div className="bg-[#eaedff] dark:bg-[#273545]/60 text-[#00288e] dark:text-[#a8b8ff] p-4 rounded-xl text-xs leading-relaxed font-medium space-y-3 border border-[#00288e]/20 dark:border-[#a8b8ff]/20 animate-fadeIn">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span>Obsidian was asked to open.</span>
            </div>
            <p className="text-[#757684] dark:text-[#a3a3b3] pl-6">
              Your draft remains saved in Life Site until you clear it.
            </p>
            <div className="flex flex-wrap gap-2 pl-6 pt-1">
              <button
                type="button"
                onClick={handleOpenObsidianAgain}
                className="bg-[#00288e] hover:bg-[#1e40af] text-white font-display text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded cursor-pointer animate-none"
              >
                Open Obsidian again
              </button>
              <button
                type="button"
                onClick={handleMobileCopyNote}
                className="bg-[#faf8ff] hover:bg-[#eaedff] dark:bg-[#131b2e] dark:hover:bg-[#1a233a] text-[#131b2e] dark:text-white border border-[#eaedff] dark:border-[#283044] font-display text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded cursor-pointer"
              >
                Copy note
              </button>
              <button
                type="button"
                onClick={handleClearSavedDraft}
                className="bg-[#ffdad6] hover:bg-[#ffb4ab] text-[#ba1a1a] font-display text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded cursor-pointer"
              >
                Clear saved draft
              </button>
            </div>
          </div>
        )}

        {/* Mobile Obsidian Mode Selectors */}
        {getActiveObsidianMode() === 'mobile' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-2">
            <div className="space-y-1.5">
              <span className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                CAPTURE MODE
              </span>
              <div className="flex bg-[#faf8ff] dark:bg-[#0c1322] border border-[#eaedff] dark:border-[#283044]/80 rounded-lg p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setObsidianMode('new_note')}
                  className={`flex-1 py-1.5 px-3 font-semibold rounded-md transition-colors cursor-pointer ${
                    obsidianMode === 'new_note'
                      ? 'bg-[#00288e] text-white shadow-sm'
                      : 'text-[#757684] hover:text-[#131b2e] dark:hover:text-white'
                  }`}
                >
                  Create new note
                </button>
                <button
                  type="button"
                  onClick={() => setObsidianMode('append')}
                  className={`flex-1 py-1.5 px-3 font-semibold rounded-md transition-colors cursor-pointer ${
                    obsidianMode === 'append'
                      ? 'bg-[#00288e] text-white shadow-sm'
                      : 'text-[#757684] hover:text-[#131b2e] dark:hover:text-white'
                  }`}
                >
                  Append to inbox
                </button>
              </div>
            </div>

            {activeTab === 'combined' && (
              <div className="space-y-1.5">
                <span className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
                  VAULT CONTEXT
                </span>
                <div className="flex bg-[#faf8ff] dark:bg-[#0c1322] border border-[#eaedff] dark:border-[#283044]/80 rounded-lg p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setObsidianContext('personal')}
                    className={`flex-1 py-1.5 px-3 font-semibold rounded-md transition-colors cursor-pointer ${
                      getSelectedContext() === 'personal'
                        ? 'bg-[#00288e] text-white shadow-sm'
                        : 'text-[#757684] hover:text-[#131b2e] dark:hover:text-white'
                    }`}
                  >
                    Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setObsidianContext('professional')}
                    className={`flex-1 py-1.5 px-3 font-semibold rounded-md transition-colors cursor-pointer ${
                      getSelectedContext() === 'professional'
                        ? 'bg-[#00288e] text-white shadow-sm'
                        : 'text-[#757684] hover:text-[#131b2e] dark:hover:text-white'
                    }`}
                  >
                    Professional
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Append Mode Target Warning */}
        {getActiveObsidianMode() === 'mobile' && obsidianMode === 'append' && !getAppendTargetFile() && (
          <div className="bg-[#ffdad6] text-[#ba1a1a] p-3 rounded-lg text-xs font-semibold leading-relaxed border border-[#ffb4ab] animate-fadeIn">
            Append mode is currently disabled because no Inbox File is configured for the{' '}
            <strong>{getSelectedContext() === 'personal' ? 'Personal' : 'Professional'}</strong> context.
            Please open the Settings panel and select "Obsidian Folders" to configure your Inbox File path.
          </div>
        )}

        {/* NOTE TITLE (Show always on desktop, and on mobile only if in new_note mode) */}
        {(getActiveObsidianMode() !== 'mobile' || obsidianMode === 'new_note') && (
          <div className="space-y-1.5">
            <label htmlFor="obsidian-title-input" className="block text-[10px] font-extrabold text-[#757684] uppercase tracking-wider">
              NOTE TITLE {getActiveObsidianMode() === 'mobile' && <span className="text-[10px] text-[#757684]/60 font-normal lowercase italic">(optional)</span>}
            </label>
            <input
              id="obsidian-title-input"
              type="text"
              ref={obsidianTitleRef}
              value={obsidianTitle}
              onChange={(e) => setObsidianTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              disabled={obsidianLoading || isOffline}
              placeholder="Enter a title, or leave blank to create one automatically..."
              className="w-full p-4 border border-[#c4c5d5] dark:border-[#444653] rounded-lg focus:outline-none focus:border-[#00288e] bg-[#faf8ff] dark:bg-[#0c1322]/40 text-[#131b2e] dark:text-white text-base md:text-xs leading-relaxed"
            />
          </div>
        )}

        <div className="relative flex-1">
          <textarea
            ref={notesInputRef}
            value={obsidianInput}
            onChange={(e) => setObsidianInput(e.target.value)}
            disabled={obsidianLoading || isOffline}
            className="w-full p-4 border border-[#c4c5d5] dark:border-[#444653] rounded-lg focus:outline-none focus:border-[#00288e] bg-[#faf8ff] dark:bg-[#0c1322]/40 text-[#131b2e] dark:text-white text-base md:text-xs leading-relaxed min-h-[10rem] h-full"
            placeholder={
              getActiveObsidianMode() === 'mobile' && obsidianMode === 'append'
                ? "Type material to append to inbox..."
                : "Type a note (Enter adds newline, press Send to submit)..."
            }
            required
          />
          
          {/* Voice Record Toggle Mic */}
          <button
            type="button"
            onClick={toggleVoiceObsidian}
            disabled={obsidianLoading || isOffline || !isVoiceSupported}
            className={`absolute right-4 bottom-4 p-2.5 rounded-full transition-colors ${
              isListeningObsidian 
                ? 'bg-[#ba1a1a] text-white animate-pulse' 
                : 'bg-[#00288e] text-white hover:bg-[#1e40af]'
            } disabled:opacity-30`}
            title="Voice dictation input"
          >
            {isListeningObsidian ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </div>

        {/* Action and non-interactive destination label */}
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-[#757684] text-xs">
            <Info className="w-4 h-4 text-[#00288e] dark:text-[#a8b8ff]" />
            <span className="font-medium">
              {getActiveObsidianMode() === 'mobile' ? (
                obsidianMode === 'append' ? (
                  <span>Appending to: <span className="font-mono bg-[#faf8ff] dark:bg-[#0c1322] px-1.5 py-0.5 rounded text-[11px] font-bold text-[#00288e] dark:text-[#a8b8ff]">{getAppendTargetFile() || 'No target configured'}</span></span>
                ) : (
                  <span>Handoff to folder: <span className="font-mono bg-[#faf8ff] dark:bg-[#0c1322] px-1.5 py-0.5 rounded text-[11px] font-bold text-[#00288e] dark:text-[#a8b8ff]">{settings?.obsidian?.inboxFolder || 'Fleeting Notes'}</span></span>
                )
              ) : (
                <span>Saves to: <span className="font-mono bg-[#faf8ff] dark:bg-[#0c1322] px-1.5 py-0.5 rounded text-[11px] font-bold text-[#00288e] dark:text-[#a8b8ff]">{settings?.obsidian?.inboxFolder || 'Fleeting Notes'}</span></span>
              )}
            </span>
          </div>

          {getActiveObsidianMode() === 'mobile' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMobileCopyNote}
                disabled={isOffline || !obsidianInput.trim()}
                className="bg-[#faf8ff] hover:bg-[#eaedff] dark:bg-[#131b2e] dark:hover:bg-[#1a233a] text-[#00288e] dark:text-[#a8b8ff] border border-[#eaedff] dark:border-[#283044] font-display text-[10px] font-bold tracking-wider uppercase py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>Copy note</span>
              </button>
              
              <button
                type="button"
                onClick={handleMobileSaveInObsidian}
                disabled={isOffline || !obsidianInput.trim() || (obsidianMode === 'append' && !getAppendTargetFile())}
                className="bg-[#00288e] hover:bg-[#1e40af] disabled:bg-opacity-50 text-white font-display text-[10px] font-bold tracking-wider uppercase py-2 px-4 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Save in Obsidian</span>
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={obsidianLoading || isOffline || !obsidianInput.trim()}
              className="bg-[#00288e] hover:bg-[#1e40af] disabled:bg-opacity-50 text-white font-display text-xs font-semibold tracking-wider uppercase py-2.5 px-6 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {obsidianLoading ? 'Sending...' : 'Send'}
            </button>
          )}
        </div>
      </form>
    </section>
  );
};
