# Todoist Tasks Workspace Extraction & Dependency Map

This document establishes the architecture, state ownership, and interaction pathways of the **Todoist Tasks display workspace** in the Life Site OS application before extracting it from `App.tsx` into a reusable component.

---

## 1. Current Architecture & Boundaries

### A. Todoist Tasks Display Workspace JSX Boundary
- **Start**: Line ~3181 (`{/* DESIRED DESKTOP LAYOUT - Todoist Tasks ... */}`)
- **End**: Line ~3743 (`</section>`)
- **Classic Context position**: Spans the full viewport width (`col-span-1 lg:col-span-12`) directly below the Habit Tracker and above the dual-column grid containing the separate Task Inbox capture panel and the Projects panel.

### B. Core Task Groupings & Filtering
- **Today View**: Includes overdue tasks (before today's tasks) and today's tasks, while future tasks are excluded.
  - Derived from `taskGroups.overdue` and `taskGroups.today` via `todayTasks = useMemo(() => [...taskGroups.overdue, ...taskGroups.today], ...)`.
- **Inbox Board (Pull System Board)**: Filters active, non-completed, top-level tasks (`parentId` is null/undefined) belonging to the specific Todoist Inbox Project ID (`dashboardData.todoistInboxProjectId`).
- **Section Handling**:
  - **No Section**: Group for tasks with `sectionId` as null, undefined, or representing an invalid section.
  - **Real Sections**: Standard Todoist sections (`dashboardData.todoistSections`) matched by project ID, sorted by their order and displaying all columns even if empty.
- **Completed Tasks (Phase 8.5)**: Rendered as a collapsible list under the main board using `completedTasksExpanded` state.

### C. Device-Specific & Responsive Layouts
- **Desktop Grid**: Horizontal scrollable bento-style column list of columns (No Section + Real Sections) on screen sizes `md` and up. Supports drag-and-drop.
- **Mobile List**: Vertical layout below `md` width, with horizontally scrollable tabs to switch the active column viewport. Drag-and-drop is safely disabled using coarser pointer checks.

---

## 2. Detailed Dependency Matrix

The table below catalogs every variable, handler, and state currently utilized in the Todoist Tasks Workspace, declaring where they will reside post-extraction.

| Name / Handle | Type | Source / Owner | Action during Extraction | Purpose / Target |
|---|---|---|---|---|
| `loading` | Boolean | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Global dashboard loading indicator |
| `isOffline` | Boolean | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Block network requests & show offline warning |
| `activeTab` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Filter task lists (Combined, Personal, Pro) |
| `dashboardData` | Snapshot | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Source for project/section configurations |
| `filteredData` | Filtered | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Pre-filtered task lists according to active tab |
| `todayTasks` | Array | `App.tsx` Memo | Retain in `App.tsx` / Pass as Prop | Task card arrays rendered under Today |
| `taskGroups` | Object | `App.tsx` Memo | Retain in `App.tsx` / Pass as Prop | Grouped categories (overdue, today, upcoming, completed) |
| `sectionsData` | Object | `App.tsx` Memo | Retain in `App.tsx` / Pass as Prop | Columns & tasks mapped for board columns |
| `activeMobileSectionId` | String | `App.tsx` Memo | Retain in `App.tsx` / Pass as Prop | Derived ID representing current active mobile view |
| `selectedMobileSectionId`| String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | User-selected tab index for mobile navigation |
| `setSelectedMobileSectionId`| Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Toggle active tab on mobile screen sizes |
| `isAddingTodayTask` | Boolean | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Control today task form drawer toggle |
| `setIsAddingTodayTask` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Toggle today form drawer |
| `todayTaskTitle` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Field state for Today task creation |
| `setTodayTaskTitle` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Input change handler |
| `todayTaskDesc` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Field state for Today task description |
| `setTodayTaskDesc` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Description text change |
| `todayTaskPriority` | Number | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Selected priority for today's new task |
| `setTodayTaskPriority` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Select dropdown updater |
| `todayTaskContext` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Personal/professional scope for Today task |
| `setTodayTaskContext` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Scope switch callbacks |
| `todayTaskLoading` | Boolean | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Save button loading indicator |
| `todayTaskError` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Capture validation errors |
| `submitTodayTask` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Submission pipeline (involves API calls) |
| `addingTaskForSectionId` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Track which board section is currently editing |
| `setAddingTaskForSectionId`| Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Open/close board item creation forms |
| `boardTaskTitle` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Board form title input state |
| `setBoardTaskTitle` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Update board title |
| `boardTaskDesc` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Board form description input state |
| `setBoardTaskDesc` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Update board description |
| `boardTaskPriority` | Number | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Board priority selection dropdown state |
| `setBoardTaskPriority` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Update board priority |
| `boardTaskContext` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Board scope (Personal/Professional) |
| `setBoardTaskContext` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Update board context |
| `boardTaskLoading` | Boolean | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Loading state for column task submission |
| `boardTaskError` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Column-specific form submission errors |
| `submitBoardTask` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | API-facing submission callback for boards |
| `toggleAddingTaskForSection`| Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Toggles the active section form block |
| `completingTaskIds` | Set | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Set of task IDs in active completion phase |
| `justCompletedTaskIds` | Set | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Set of task IDs rendering a success animation |
| `taskErrors` | Record | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Specific validation or transaction error labels |
| `activeCommentTaskId` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | ID of task currently displaying comment textarea |
| `setActiveCommentTaskId` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Toggle inline comment panels |
| `taskComments` | Record | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Value map holding unsubmitted comments |
| `setTaskComments` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Inline comment buffer updaters |
| `commentSavingTaskIds` | Set | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Set of task IDs in comment post phase |
| `commentSuccessMessages` | Record | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Success message confirmations per-task |
| `confirmingCompleteTask` | Task | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Task with subtasks prompting confirm modal |
| `setConfirmingCompleteTask`| Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Open subtask parent warning alert |
| `selectedTask` | Task | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Active task passed to shared detailed editor |
| `setSelectedTask` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Set target task for standard detail overlay |
| `movingTaskMenu` | Task | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Task passed to standard Move Menu dropdown |
| `setMovingTaskMenu` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Trigger move picker modal |
| `draggingTaskId` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | ID of the task currently being dragged |
| `dragOverColumnId` | String | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Destination column currently hovered during drag |
| `movingTaskIds` | Set | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Active task IDs being moved on server |
| `canDrag` | Boolean | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Flag indicating pointer compatibility for drag |
| `handleDragStart` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Initiates HTML5 drag-and-drop transfers |
| `handleDragEnd` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Resets hover and drag indices |
| `handleDragOver` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Detects and colors valid drop columns |
| `handleDrop` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Initiates project/section migration request |
| `completedTasksExpanded` | Boolean | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Toggle completed items visibility |
| `setCompletedTasksExpanded` | Setter | `App.tsx` State | Retain in `App.tsx` / Pass as Prop | Setter for completed collapse |
| `handleCompleteTask` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Triggers completion network operation |
| `handleAddComment` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Triggers comment network operation |
| `onRefresh` | Handler | `App.tsx` Method | Retain in `App.tsx` / Pass as Prop | Trigger lightweight full dashboard sync |

---

## 3. Post-Extraction Architectural Rules

### A. Strict Local Rendering Helpers
The following helpers exist **solely** within the display loop of the workspace and will be fully moved to `TodoistTasksWorkspace.tsx`:
1. `renderTodoistTaskCard`: Evaluates task card styles, checkbox actions, priorities, subtask remaining labels, inline comment textareas, and active errors.
2. `renderSubtaskTree`: Performs recursive nesting of complex child tasks, including safety depth caps and visited set cycle prevention.

### B. Post-Extraction App.tsx State Ownership
No state will be duplicated. All reactive variables (e.g., `isAddingTodayTask`, `boardTaskTitle`, `activeCommentTaskId`) and server connections remain single instances inside `App.tsx`. They are bound to `TodoistTasksWorkspace` through reactive props.

### C. Overlays & Dialogs Isolation
To prevent redundant rendering trees and duplicate events:
- **`TodoistTaskEditor`** (classic position overlay)
- **`TodoistMoveMenu`** (classic position overlay)
- **`confirmingCompleteTask` modal** (parent completion confirmation warning)
All of these will **remain rendered in `App.tsx`**. `TodoistTasksWorkspace` triggers them by invoking the setter callbacks (`setSelectedTask`, `setMovingTaskMenu`, `setConfirmingCompleteTask`) passed down through typed props.

---

## 4. Extraction Verification Checkpoints

The following checkpoints must align with zero variance:
1. No direct references to `ApiClient` inside `TodoistTasksWorkspace.tsx`.
2. Classic grid dashboard position remains exactly matching the pre-refactor layout.
3. No impact on the surrounding panels (Task Inbox, Projects Panel, Habits, Notes, Thought Catcher, Calendar).
4. No modification of persistent storage variables (`localStorage`, `sessionStorage`).
5. Complete visual parity under light and dark themes.
