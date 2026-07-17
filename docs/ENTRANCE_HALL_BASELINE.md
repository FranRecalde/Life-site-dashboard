# Entrance Hall Redesign: Baseline & Dependency Map

This document establishes a technical baseline and dependency map for the **Life Site Dashboard** before initiating the staged redesign into an "entrance hall" layout with a permanent sidebar.

---

## A. Current Architecture Summary

The Life Site Dashboard is a full-stack TypeScript application deployed inside a Cloud Run container. It is structured around an **Express + Vite (React 18)** architecture, configured as follows:

1. **Client Tier**: A React 18 Single Page Application (SPA) compiled via Vite into static assets under `dist/`. Styling is handled exclusively with **Tailwind CSS**, and UI icons are driven by `lucide-react`. Interactivity relies on native React hooks for localized/lifted states and custom interaction hooks (voice input, keyboard shortcuts).
2. **Server Tier**: A Node.js backend running `server.ts`. It acts as an API proxy for third-party services (Google Calendar, Todoist) and serves as a custom storage provider. It handles:
   - **Secure Secrets Management**: Transparently loads and redacts sensitive credentials (tokens, secrets) using GCP Secret Manager or local JSON fallback stores.
   - **Custom Cookie Authentication**: Implements cookie-based session verification with fallback bearer authorization for iframe environments.
   - **Unified API Routing**: Exposes endpoint prefixes (`/api/*`) for auth, settings, connections, todoist, and google calendar.
3. **Database & Storage Tier**: Delegated to a self-bootstrapping store strategy (`createStores.ts`) supporting either Local Filesystem (for rapid local dev) or **Google Cloud Firestore** (for production persistence) to persist user settings, habits, sessions, and historic activity.

---

## B. Current Working Features

1. **Authentication**: Secure username/password verification using a secure PBKDF2 SHA-256 hash schema (or development plaintext fallbacks in dev mode), backed by active session tracking and rate-limiting.
2. **Global Search**: Instantly queries Obsidian notes using Local REST API and filters results dynamically.
3. **Context Switcher (ContextTabs)**: Offers seamless toggling between `Combined`, `Personal`, and `Professional` productivity tabs, which filter calendar events, tasks, and notes accordingly.
4. **Google Calendar (CalendarPanel)**: Displays real-time calendar grids (Day, Week, Month views) with custom working-hours slots, multi-calendar selection, event creation, modification, and deletion.
5. **Habit Tracker (HabitPanel)**: Drives daily habits tracking, completion indicators, weekly targets, progress rates, and visual streak counts.
6. **Todoist Tasks Board & Lists**: Integrates Todoist inboxes, boards, overdue/today/upcoming columns, dragging-and-dropping task updates, project completion metrics, and localized task editing/moving.
7. **Notes Inbox (Obsidian Integration)**: Facilitates notes drafting, appending, recent note viewing, and markdown editing via local desktop Obsidian API or mobile deep-linking overlays.
8. **Thought Catcher**: Features a highly polished, kinetic, vertical vertical-scrolling cylinder/mill-wheel interface inside a glowing, pulsed neural network container, auto-rotating and pausing on keyboard focus, hover, or modal forms.
9. **Voice Input (useVoiceInput)**: Integrates speech-to-text input handlers for hand-free capturing of Todoist and Obsidian entries.
10. **System Settings**: Configures user preferences (themes, views, directories, labels, working hours) and manages external secrets/tokens securely on the server.

---

## C. Main State and Handlers Owned by `App.tsx`

`App.tsx` serves as the centralized orchestrator for the entire client layout. Key state families and handlers include:

### 1. Centralized State Variables
- **Authentication**: `authChecked`, `isAuthenticated`, `username`, `loginUsername`, `loginPassword`, `loginError`, `loginLoading`
- **Dashboard Core**: `dashboardData`, `loading`, `refreshing`, `refreshError`, `lastUpdated`, `activeTab` (Context)
- **Settings & Connections**: `settings`, `themeMode`, `showSettings`, `settingsSection`, `settingsEditState`, `saveSettingsSuccess`
- **Todoist Management**: `todoistProjects`, `loadingProjects`, `projectsError`, `collapsedSections`, `expandedProjectIds`, `projectTasks`, `addingTaskForSectionId`, `todoistInput`, `todoistContext`, `todoistLoading`, `todoistSuccess`, `todoistError`, `isAddingTodayTask`, `todayTaskTitle`, `todayTaskDesc`, `todayTaskPriority`
- **Obsidian Inbox**: `obsidianInput`, `obsidianTitle`, `obsidianMode`, `obsidianContext`, `obsidianLoading`, `obsidianSuccess`, `obsidianError`
- **Obsidian Editor & Connection**: `recentNotes`, `recentNotesErrorDetails`, `selectedRecentNote`, `editedNoteContent`, `appendNoteContent`, `isSavingEditedNote`, `saveNoteSuccess`, `recentNotesLoading`, `recentNotesError`, `obsidianUrl`, `obsidianApiKey`, `rememberObsidian`
- **Global Search**: `searchQuery`, `searchResults`, `isSearching`
- **Calendar Configuration**: `calendarView`, `currentCalendarDate`
- **Utility Status**: `isOffline`

### 2. Core Handlers
- **Lifecycle & Sync**: `triggerRefresh()`, `handleSyncData()`
- **Authentication Handlers**: `handleLogin()`, `handleLogout()`, `checkAuthStatus()`
- **Settings Handlers**: `openSettings()`, `handleSaveSettings()`, `handleConnectionsSave()`
- **Todoist Tasks Handlers**: `handleCompleteTask()`, `handleCreateTask()`, `handleMoveTask()`, `handleUpdateTask()`, `onDragEnd()`
- **Obsidian Notes Handlers**: `handleCreateObsidianNote()`, `handleOpenRecentNote()`, `handleSaveRecentNote()`, `handleAppendToRecentNote()`
- **Calendar Handlers**: `handleCreateCalendarEvent()`, `handleUpdateCalendarEvent()`, `handleDeleteCalendarEvent()`, `handleToggleCalendar()`

---

## D. Existing Components That Can Safely Be Reused

The following self-contained components in `src/components/` operate independently on structured props and are clean targets for layout repositioning or route-based loading:

1. **`GlobalHeader`**: Custom header holding user brand, search bars, offline icons, current clocks, settings actions, and logout.
2. **`ContextTabs`**: Simple context switcher (`combined` / `personal` / `professional`) and timestamp tracker.
3. **`CalendarPanel`**: Encapsulates calendar views, grids, Working Hours logic, calendar selector checklists, and event add/slot actions.
4. **`HabitPanel`**: Renders habits tracking lists, completion charts, and weekly completion rate progress summaries.
5. **`ThoughtCatcher`**: Houses the custom kinetic cylinder loop note wheel, auto-rotation timers, drag/wheel overrides, and mobile fallback deep link sheets.
6. **`TodoistMoveMenu`**: Small context menu facilitating swift moving of Todoist tasks.
7. **`TodoistTaskEditor`**: Overlay editor for task priorities, schedules, and details.
8. **`CalendarEventForm`** & **`CalendarEventEditor`**: Form overlays managing Google Calendar events.

---

## E. Features Whose JSX is Embedded Directly Inside `App.tsx`

To avoid breaking interfaces, note that the following functional UI layers are **not** separate components, but are coded directly as inline JSX blocks inside `App.tsx`:

1. **Todoist Tasks Board & Lists Section** (approx. lines 2755 to 3608):
   - Left-column lists (Today's Tasks list, Overdue task notifications, Inline Task Form)
   - Middle/Right bento-style Board columns (custom column loops, task cards with priority badges, checklist inputs)
   - Project progress cards (collapsible sections, project completion bar graphs, lazy-loaded sub-lists)
2. **Notes Inbox - Capture Panel Section** (approx. lines 3615 to 4096):
   - Recent notes lists with modification dates
   - Note search forms and results preview lists
   - Markdown note editor (edit/preview panels, quick formatting headers, file content textareas)
   - Append drafts container
3. **Login View Screen** (approx. lines 2330 to 2600):
   - Entire sign-in form layout, branding placeholders, rate-limiting alert blocks, and developer credential guides.
4. **Settings Modal Overlay** (approx. lines 4314 to 4890):
   - Large tabbed overlay containing forms for General, Notes, Tasks, Calendar, Weather, Connections, and Shortcuts configuration.

---

## F. Protected Areas (Secrets, Core Integrations, & Deployment)

The following areas **must remain unmodified** during the visual and structural redesign to ensure site security, offline reliability, and platform operational integrity:

1. **Database & Sessions Client**: `/server/storage/` clients (`firestoreClient.ts`, `createStores.ts`, etc.).
2. **GCP Secret Manager Proxy**: `secretStore.ts` and `/api/settings/connections` endpoints which manage API keys securely on the server side (never exposing `TODOIST_API_TOKEN` or Google OAuth client secrets to the client browser).
3. **Google OAuth Callbacks**: `/api/auth/google/url` and `/api/auth/google/callback` which rely on precise server-side state parameters and callback redirection logic.
4. **Port Configuration**: The Express server must continue to bind exclusively to Host `0.0.0.0` and Port `3000`.
5. **Process Pipelines**: Deployment environment variables (`process.env.NODE_ENV`, `process.env.GEMINI_API_KEY`, etc.) and `.env.example` configurations.

---

## G. Desktop vs. Mobile Layout Structure

- **Desktop Layout**: 
  - Centered `max-w-7xl` container.
  - Context switcher sits above a bento-style multi-column grid layout.
  - High density visualization showing Today's agenda, Tasks Board, Notes Inbox, and Thought Catcher side-by-side or stacked cleanly.
- **Mobile Layout**:
  - Compact viewports transition into a narrow one-column layout.
  - Interactive widgets fall back to mobile-optimized deep links (e.g., Obsidian `obsidian://` links to search or open notes) because local desktop server ports are unreachable on mobile devices.
  - Responsive cards use larger touch targets (>= 44px) and collapsible details panels to optimize limited real estate.

---

## H. Existing Storage Keys (Must Be Preserved)

The application depends on the following storage keys to support sessions, offline loading, draft recoveries, and Obsidian credential memory:

### 1. `localStorage` Keys
- `life_site_snapshot`: Stores a local copy of the complete dashboard dataset to support immediate rendering on start or during offline gaps.
- `remember_obsidian`: Tracks whether local Obsidian API keys and URLs should be persisted across browser closures.
- `obsidian_api_url`: Persisted Local REST API path (usually `https://127.0.0.1:27124`).
- `obsidian_api_key`: Persisted Local REST API connection token.
- `last_session_timestamp`: Tracks active session checks and triggers system digests.
- `last_seen_summary_time`: Timestamps when the user last closed or viewed the dashboard summary modal.
- `life_site_mobile_draft_content`: Cached text content of unsubmitted notes inbox forms.
- `life_site_mobile_draft_title`: Cached title of unsubmitted notes inbox forms.
- `life_site_mobile_draft_mode`: Mode preferences for draft notes (`append` | `new_note`).
- `life_site_mobile_draft_context`: Active workspace focus for notes (`personal` | `professional`).

### 2. `sessionStorage` Keys
- `obsidian_api_url`: Active session REST API path (cleared when session ends if "Remember" is disabled).
- `obsidian_api_key`: Active session REST API key (cleared on logouts if "Remember" is disabled).

---

## I. Existing Keyboard Shortcuts

Keyboard shortcuts are managed by `useKeyboardShortcuts.ts` and must work across views whenever input elements are not focused:

| Key | Action | Callback Action |
|---|---|---|
| `/` | Focus search bar | `onFocusSearch` |
| `n` | Focus notes inbox | `onFocusNotes` |
| `t` | Focus Todoist tasks panel | `onFocusTasks` |
| `r` | Trigger full dashboard refresh | `onRefresh` |
| `1` | Switch workspace context to **Combined** | `onSwitchTab(0)` |
| `2` | Switch workspace context to **Personal** | `onSwitchTab(1)` |
| `3` | Switch workspace context to **Professional** | `onSwitchTab(2)` |
| `Escape` | Close active overlays / modals / forms | `onClosePanels` |

---

## J. Regression Checklist

This list must be verified completely before and after subsequent redesign iterations:

- [ ] **Login**: Test typing correct credentials and logging in smoothly. Validate that error messages appear correctly on invalid inputs.
- [ ] **Logout**: Confirm clicking logout clears cookies, resets authorization states, and redirects immediately to the sign-in screen.
- [ ] **Dashboard Loading**: Verify the dynamic loading animation displays while `authChecked` resolves.
- [ ] **Refresh**: Test manual refresh button and verify that data updates correctly.
- [ ] **Calendar Display**: Confirm the day, week, and month grids align correctly and show correct event lists based on selected calendars.
- [ ] **Calendar Event Creation/Editing**: Verify selecting a slot or using "Add Event" opens forms, and that changes persist correctly.
- [ ] **Todoist Task Completion**: Verify clicking a checkbox updates task progress, marks it complete, and refreshes the list.
- [ ] **Todoist Task Creation**: Confirm adding a task through inline inputs successfully adds items to Todoist.
- [ ] **Todoist Board Sections**: Check that overdue, today, upcoming, and completed task cards show under correct sections.
- [ ] **Todoist Drag & Drop**: Verify dragging a task between columns works smoothly and registers on the server.
- [ ] **Todoist Project Progress**: Confirm collapsible project trees display and update project percentage metrics accurately.
- [ ] **Obsidian Recent Notes**: Ensure recent notes are retrieved from the vault path and render inside the list.
- [ ] **Obsidian Note Creation**: Confirm "Save draft" / "Add Note" creates physical `.md` files in the correct vaults and folders.
- [ ] **Obsidian Inline Editing**: Verify selecting a recent note opens the editing surface, allows modifications, and saves changes back to the vault file.
- [ ] **Thought Catcher Wheel**: Ensure the 3D rotating wheel continues to move, pauses on hover, mouse-wheel scrolls notes, and clicks open items.
- [ ] **Habits Tracking**: Check checking a habit logs the completion, increases the streak count, and updates weekly calculations.
- [ ] **Settings Modal**: Test editing settings sections, saving settings, and exporting settings config files successfully.
- [ ] **Mobile Layout**: Verify responsive transition states. Confirm mobile-friendly fallbacks display instead of desktop connection warnings.
- [ ] **Offline Behaviour**: Test blocking network access. Confirm cached snapshots render immediately and offline alerts appear in the header.
