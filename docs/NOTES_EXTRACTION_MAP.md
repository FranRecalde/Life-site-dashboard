# Notes Extraction Map

This document details the architectural structure, state ownership, and callbacks of the Notes Inbox display and capture workspace, defining how it was extracted from `src/App.tsx` into `src/components/ObsidianNotesInbox.tsx`.

## Notes Inbox Architecture Overview

### 1. Beginning and End of Notes Inbox JSX in `App.tsx`
- **Start Line (originally):** Around line 3219 (`<section className="col-span-1 xl:col-span-7 bg-white dark:bg-[#131b2e] rounded-xl border border-[#eaedff] dark:border-[#283044] shadow-sm p-4 sm:p-6 text-left flex flex-col">`)
- **End Line (originally):** Around line 3701 (`</section>`)

### 2. State & Callbacks Ownership

#### A. Shared State (retained in `App.tsx`)
These states remain in `App.tsx` to preserve central reactivity and integration with Thought Catcher:
- `recentNotes` (`ObsidianNoteDetail[]`): List of notes loaded from the Obsidian vault.
- `recentNotesLoading` (`boolean`): Loading indicator for the recent notes.
- `recentNotesError` (`string | null`): User-facing error message for loading recent notes.
- `recentNotesErrorDetails` (`ObsidianApiError | null`): Technical diagnostic details.
- `selectedRecentNote` (`ObsidianNoteDetail | null`): The currently selected note for editing. (Also shared with `ThoughtCatcher`!)
- `selectedRecentNoteLoading` (`boolean`): Loading state for single note contents.
- `editedNoteContent` (`string`): The buffer text for the inline file content editor.
- `isSavingEditedNote` (`boolean`): Spinner state while writing the edited note back to the vault.
- `saveNoteSuccess` (`boolean`): Success toast trigger.
- `saveNoteError` (`string | null`): Editor save failure banner text.
- `saveNoteErrorDetails` (`any`): Diagnostic details for editor save.
- `appendNoteContent` (`string`): Text buffer for appending material.
- `isAppendingNote` (`boolean`): Spinner state while appending content.
- `appendNoteSuccess` (`boolean`): Success toast trigger for append.
- `appendNoteError` (`string | null`): Append failure banner text.
- `appendNoteErrorDetails` (`any`): Diagnostic details for append.
- `obsidianTitle` (`string`): Custom title input for a new note.
- `obsidianInput` (`string`): Main text body input for capturing notes.
- `obsidianLoading` (`boolean`): Sending/creating status spinner.
- `obsidianSuccess` (`boolean`): Capturing success status.
- `obsidianError` (`string | null`): Note capture error banner text.
- `obsidianErrorDetails` (`any`): Diagnostic details for note capture.
- `mobileHandoffStatus` (`'idle' | 'copied' | 'success' | 'failed'`): Handoff status for mobile workflow.
- `obsidianMode` (`'new_note' | 'append'`): Workspace selection for mobile capture action.
- `obsidianContext` (`'personal' | 'professional' | 'combined'`): Active workspace classification.
- `isOffline` (`boolean`): Global connection availability flag.
- `settings` (`LifeSiteSettings | null`): Central settings containing `obsidian` credentials (`vaultName`, `personalInboxFile`, `professionalInboxFile`, etc.).
- `activeTab` (`'combined' | 'personal' | 'professional'`): Overall context tab.

#### B. Callbacks & Integrations (retained in `App.tsx`)
To keep API, Local REST and Obsidian-specific network logic central, the following callbacks are kept in `App.tsx` and passed down as props:
- `handleOpenRecentNote`: Reads single note contents and opens the editor.
- `handleSaveChanges`: Calls `ObsidianClient.replaceFile` to save changes.
- `handleAppendToNote`: Calls `ObsidianClient.appendToFile` to append content.
- `submitObsidianNote`: Handles desktop file creation via Local REST API (`ObsidianClient.createFile`).
- `handleMobileSaveInObsidian`: Computes the custom `obsidian://` deep link URI and triggers a page open.
- `handleMobileCopyNote`: Writes note draft to clipboard fallback.
- `handleOpenObsidianAgain`: Re-triggers deep-link.
- `handleClearSavedDraft`: Resets `obsidianInput` and storage cache.
- `handleTitleKeyDown`: Listens for key events (e.g. Enter key to focus body textarea).
- `toggleVoiceObsidian`: Toggles speech recognition dictation.
- `setObsidianTitle`, `setObsidianInput`, `setObsidianMode`, `setObsidianContext`, `setSelectedRecentNote`, `setEditedNoteContent`, `setAppendNoteContent`

---

## Detailed Features & Behavior Map

### 1. New-Note Capture & Filename Handling
* **Desktop REST Capture**: Submits draft contents directly to local REST endpoint `/files/...` using the user's config.
* **Title & Filename Sanitization**:
  * Autogenerates title from current date/timestamp if empty.
  * Sanitizes invalid characters out of file names.
  * Prevents collisions by generating unique base names if files already exist.
* **Voice Input**: Leverages the browser Speech Recognition API. Standard dictation toggles, auto-appending transcriptions.
* **Context Selection & Folders**: Resolves the target directory/folder based on the context (`personal` vs `professional`) combined with the globally configured Obsidian Settings.

### 2. Desktop vs. Mobile Behaviors
* **Desktop Mode**: Uses standard Local REST API client requests to fetch, create, read, and write files directly over HTTPS.
* **Mobile Mode**: 
  * Integrates deep link protocols like `obsidian://new` and `obsidian://append` to launch and control the Obsidian App directly from the mobile browser.
  * Provides draft backup saving via `localStorage` (key: `life_site_mobile_draft_content`) so input isn't lost.
  * Implements fallback write-to-clipboard functionality when deep links can't auto-resolve.

### 3. Error Handling and Offline Support
* **Error Sanitization**: Maps various Local REST HTTP response codes to friendly diagnostic help strings (e.g., reminding users to enable Local REST in Obsidian or verify their security tokens).
* **Offline Detection**: Disables and visually grays out send/edit actions while the user is offline.

### 4. Shared Note Editor (with Thought Catcher)
* Thought Catcher fetches a distinct list of stream-of-consciousness thoughts from `DEFAULT_THOUGHT_CATCHER_FOLDER = 'Thought Catcher'`.
* When a note in Thought Catcher is selected, it triggers `handleOpenRecentNote` in `App.tsx` and uses the EXACT SAME inline editing/appending drawer structure as the Recent Notes Inbox. 
* To prevent visual or functional duplication, the editor and editing state (`selectedRecentNote`) remain single central instances in `App.tsx`.

---

## Refactoring/Extraction Plan

To extract this cleanly and with zero regression risk, the component `ObsidianNotesInbox.tsx` is defined with a comprehensive, type-safe prop interface. All local-only UI states (like `mobileObsidianSearchQuery`) are kept internally, while all database, network, and parent coordination values are received via props.

This preserves the classic route exactly, maintains the single-instance note editor logic, and prepares the workspace for future modular reuse.
