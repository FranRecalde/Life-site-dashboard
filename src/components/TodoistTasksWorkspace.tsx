import React from 'react';
import {
  RefreshCw,
  CheckSquare,
  X,
  Plus,
  Loader2,
  CheckCircle2,
  ArrowRightLeft,
  MessageSquare,
  AlertTriangle,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { TodoistTask, TodoistSection, DashboardSnapshot } from '../types';

interface TodoistTasksWorkspaceProps {
  loading: boolean;
  isOffline: boolean;
  activeTab: 'combined' | 'personal' | 'professional';
  dashboardData: DashboardSnapshot | null;
  filteredData: { tasks: TodoistTask[] } | null;
  todayTasks: TodoistTask[];
  taskGroups: {
    overdue: TodoistTask[];
    today: TodoistTask[];
    upcoming: TodoistTask[];
    completed: TodoistTask[];
  };
  sectionsData: {
    columns: {
      id: string;
      name: string;
      order: number;
      tasks: TodoistTask[];
    }[];
    activeCount: number;
  };
  activeMobileSectionId: string | null;
  selectedMobileSectionId: string | null;
  setSelectedMobileSectionId: (id: string | null) => void;

  // Today task form state & actions
  isAddingTodayTask: boolean;
  setIsAddingTodayTask: (val: boolean) => void;
  todayTaskTitle: string;
  setTodayTaskTitle: (val: string) => void;
  todayTaskDesc: string;
  setTodayTaskDesc: (val: string) => void;
  todayTaskPriority: number;
  setTodayTaskPriority: (val: number) => void;
  todayTaskContext: 'personal' | 'professional';
  setTodayTaskContext: (val: 'personal' | 'professional') => void;
  todayTaskLoading: boolean;
  todayTaskError: string | null;
  submitTodayTask: (e: React.FormEvent) => void;

  // Board task form state & actions
  addingTaskForSectionId: string | null;
  setAddingTaskForSectionId: (id: string | null) => void;
  boardTaskTitle: string;
  setBoardTaskTitle: (val: string) => void;
  boardTaskDesc: string;
  setBoardTaskDesc: (val: string) => void;
  boardTaskPriority: number;
  setBoardTaskPriority: (val: number) => void;
  boardTaskContext: 'personal' | 'professional';
  setBoardTaskContext: (val: 'personal' | 'professional') => void;
  boardTaskLoading: boolean;
  boardTaskError: string | null;
  submitBoardTask: (e: React.FormEvent, sectionId: string) => void;
  toggleAddingTaskForSection: (sectionId: string) => void;

  // Interaction collections and status
  completingTaskIds: Set<string>;
  justCompletedTaskIds: Set<string>;
  taskErrors: Record<string, string>;
  activeCommentTaskId: string | null;
  setActiveCommentTaskId: (id: string | null) => void;
  taskComments: Record<string, string>;
  setTaskComments: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  commentSavingTaskIds: Set<string>;
  commentSuccessMessages: Record<string, string>;
  setConfirmingCompleteTask: (task: TodoistTask | null) => void;

  // Modals / Selection callbacks (keeping single instances in App.tsx)
  setSelectedTask: (task: TodoistTask | null) => void;
  setMovingTaskMenu: (task: TodoistTask | null) => void;

  // Drag and drop state/actions
  draggingTaskId: string | null;
  dragOverColumnId: string | null;
  movingTaskIds: Set<string>;
  canDrag: boolean;
  handleDragStart: (e: React.DragEvent, task: TodoistTask) => void;
  handleDragEnd: () => void;
  handleDragOver: (e: React.DragEvent, columnId: string) => void;
  handleDrop: (e: React.DragEvent, columnId: string) => void;

  // Completed tasks collapse state
  completedTasksExpanded: boolean;
  setCompletedTasksExpanded: (val: boolean) => void;

  // API operations (retained as callbacks from App.tsx)
  handleCompleteTask: (taskId: string) => Promise<void>;
  handleAddComment: (taskId: string) => Promise<void>;
}

export const TodoistTasksWorkspace: React.FC<TodoistTasksWorkspaceProps> = ({
  loading,
  isOffline,
  activeTab,
  dashboardData,
  filteredData,
  todayTasks,
  taskGroups,
  sectionsData,
  activeMobileSectionId,
  selectedMobileSectionId,
  setSelectedMobileSectionId,

  isAddingTodayTask,
  setIsAddingTodayTask,
  todayTaskTitle,
  setTodayTaskTitle,
  todayTaskDesc,
  setTodayTaskDesc,
  todayTaskPriority,
  setTodayTaskPriority,
  todayTaskContext,
  setTodayTaskContext,
  todayTaskLoading,
  todayTaskError,
  submitTodayTask,

  addingTaskForSectionId,
  setAddingTaskForSectionId,
  boardTaskTitle,
  setBoardTaskTitle,
  boardTaskDesc,
  setBoardTaskDesc,
  boardTaskPriority,
  setBoardTaskPriority,
  boardTaskContext,
  setBoardTaskContext,
  boardTaskLoading,
  boardTaskError,
  submitBoardTask,
  toggleAddingTaskForSection,

  completingTaskIds,
  justCompletedTaskIds,
  taskErrors,
  activeCommentTaskId,
  setActiveCommentTaskId,
  taskComments,
  setTaskComments,
  commentSavingTaskIds,
  commentSuccessMessages,
  setConfirmingCompleteTask,

  setSelectedTask,
  setMovingTaskMenu,

  draggingTaskId,
  dragOverColumnId,
  movingTaskIds,
  canDrag,
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDrop,

  completedTasksExpanded,
  setCompletedTasksExpanded,

  handleCompleteTask,
  handleAddComment
}) => {

  // Helper to recursively render subtask tree with depth and cycle checks
  const renderSubtaskTree = (parentId: string, depth: number = 0, visited: Set<string> = new Set()) => {
    if (depth > 5) return null; // Avoid excessive nesting
    if (visited.has(parentId)) return null; // Avoid cycle infinite recursion

    const directChildren = (filteredData?.tasks || [])
      .filter(t => t.parentId === parentId)
      .sort((a, b) => (a.childOrder ?? 0) - (b.childOrder ?? 0));

    if (directChildren.length === 0) {
      if (depth === 0) {
        return (
          <p className="text-xs text-[var(--color-secondary)] italic py-2">No active subtasks</p>
        );
      }
      return null;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(parentId);

    return (
      <div className={`space-y-2.5 ${depth > 0 ? 'ml-4 border-l border-[var(--color-divider)] border-[var(--color-divider)] pl-3 mt-2' : ''}`}>
        {directChildren.map(sub => {
          const isCompleting = completingTaskIds.has(sub.id);
          const isJustCompleted = justCompletedTaskIds.has(sub.id);

          return (
            <div key={sub.id} className="flex flex-col">
              <div className="flex items-center justify-between gap-2 py-1">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {/* Small circular completion checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCompleteTask(sub.id);
                    }}
                    disabled={isCompleting || isJustCompleted}
                    aria-label={`Complete subtask: ${sub.title}`}
                    className="w-4 h-4 rounded-full border border-[var(--color-divider)] border-[var(--color-divider)] flex items-center justify-center bg-[var(--color-card)] bg-[var(--color-card)] hover:border-[var(--color-control)] hover:border-[var(--color-secondary)] transition-all disabled:opacity-50 shrink-0"
                  >
                    {isCompleting ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin text-[var(--color-control)] text-[var(--color-secondary)]" />
                    ) : isJustCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
                    ) : null}
                  </button>

                  <span className={`text-xs break-words font-normal ${
                    isJustCompleted ? 'line-through text-[var(--color-success)] ' : 'text-[var(--color-ink)] text-[var(--color-ink)]'
                  }`}>
                    {sub.title}
                  </span>
                </div>

                {/* Due Date inside modal if available */}
                {sub.dueDate && (
                  <span className="text-[9px] font-semibold bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-secondary)] px-1.5 py-0.5 rounded shrink-0">
                    {sub.dueDate}
                  </span>
                )}
              </div>

              {/* Error specific to this task/subtask */}
              {taskErrors[sub.id] && (
                <div className="text-[9px] text-[var(--color-warning)] text-[var(--color-warning)] bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] px-2 py-1 rounded mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                  <span>{taskErrors[sub.id]}</span>
                </div>
              )}

              {/* Recursively render child subtasks */}
              {renderSubtaskTree(sub.id, depth + 1, nextVisited)}
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to render Todoist Task Cards (interactive completion & comments)
  const renderTodoistTaskCard = (task: TodoistTask, isOverdueStyle: boolean, isDraggable: boolean = false) => {
    const isCompleting = completingTaskIds.has(task.id);
    const isJustCompleted = justCompletedTaskIds.has(task.id);
    const isSavingComment = commentSavingTaskIds.has(task.id);
    const isCommentOpen = activeCommentTaskId === task.id;
    const isMoving = movingTaskIds.has(task.id);
    const isDragging = draggingTaskId === task.id;

    const activeSubtasksCount = (filteredData?.tasks || []).filter(
      sub => sub.parentId === task.id && !sub.completed
    ).length;

    const draggableEnabled = canDrag && isDraggable && !isMoving && !isJustCompleted && !isCompleting;

    return (
      <div
        key={task.id}
        draggable={draggableEnabled}
        onDragStart={draggableEnabled ? (e) => handleDragStart(e, task) : undefined}
        onDragEnd={draggableEnabled ? handleDragEnd : undefined}
        className={`p-3 rounded-lg border transition-all flex flex-col ${
          isOverdueStyle
            ? 'bg-[var(--color-warning-surface)]/20 border-[var(--color-warning-surface)]'
            : 'bg-[var(--color-card-raised)] bg-[var(--color-card)]/10 border-[var(--color-divider)] border-[var(--color-divider)]/60'
        } ${isJustCompleted ? ' scale-95' : 'hover:shadow-sm'} ${
          isDragging ? ' border-dashed border-[var(--color-control)]/40 border-[var(--color-secondary)]/40' : ''
        } ${isMoving ? ' pointer-events-none' : ''} ${
          draggableEnabled ? 'cursor-grab active:cursor-grabbing select-none' : ''
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 w-full">
          {/* Checkbox and Title Wrapper */}
          <div className="flex items-start gap-3 flex-1 min-w-[140px] sm:min-w-[180px]">
            {/* Circular Checkbox */}
            <button
              type="button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                if (activeSubtasksCount > 0) {
                  setConfirmingCompleteTask(task);
                } else {
                  handleCompleteTask(task.id);
                }
              }}
              disabled={isCompleting || isSavingComment || isJustCompleted || isMoving}
              aria-label={`Complete task: ${task.title}`}
              className="w-5 h-5 rounded-full border border-[var(--color-divider)] border-[var(--color-divider)] flex items-center justify-center bg-[var(--color-card)] bg-[var(--color-card)] hover:border-[var(--color-control)] hover:border-[var(--color-secondary)] transition-all disabled:opacity-50 shrink-0 mt-0.5"
            >
              {isCompleting ? (
                <Loader2 className="w-3 h-3 animate-spin text-[var(--color-control)] text-[var(--color-secondary)]" />
              ) : isJustCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
              ) : isMoving ? (
                <Loader2 className="w-3 h-3 animate-spin text-[var(--color-control)] text-[var(--color-secondary)]" />
              ) : null}
            </button>

            {/* Title Area (Click to open dialog) */}
            <div
              onClick={() => setSelectedTask(task)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedTask(task);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Edit task: ${task.title}`}
              title={`Click to edit task: ${task.title}`}
              className="flex-1 min-w-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-control)] focus:ring-[var(--color-secondary)] rounded px-1"
            >
              <p className={`text-xs font-semibold break-words transition-all ${
                isJustCompleted
                  ? 'line-through text-[var(--color-success)] '
                  : isOverdueStyle
                    ? 'text-[var(--color-warning)] font-semibold'
                    : 'text-[var(--color-ink)] text-[var(--color-ink)] font-normal'
              }`}>
                {task.title}
              </p>
              {task.projectName && (
                <span className={`text-[9px] font-semibold uppercase tracking-wide block mt-1 ${
                  isOverdueStyle ? ' text-[var(--color-warning)]' : 'text-[var(--color-secondary)]'
                }`}>
                  {task.projectName}
                </span>
              )}
              {activeSubtasksCount > 0 && (
                <span className={`text-[9px] font-semibold block mt-1 ${
                  isOverdueStyle ? 'text-[var(--color-warning)]' : 'text-[var(--color-secondary)]'
                }`}>
                  {activeSubtasksCount} {activeSubtasksCount === 1 ? 'subtask' : 'subtasks'} remaining
                </span>
              )}
            </div>
          </div>

          {/* Right badges & Comment Button */}
          <div className="flex items-center gap-2 shrink-0 ml-auto pl-8 sm:pl-0 mt-1 sm:mt-0">
            {isOverdueStyle && !isCommentOpen && (
              <span className="text-[9px] font-semibold bg-[var(--color-warning-surface)] text-[var(--color-warning)] px-2 py-0.5 rounded">
                Overdue
              </span>
            )}
            {/* Move to Button */}
            <button
              type="button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                setMovingTaskMenu(task);
              }}
              disabled={isCompleting || isSavingComment || isJustCompleted || isMoving}
              aria-label={`Move task: ${task.title}`}
              className="p-1.5 rounded-lg hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] text-[var(--color-secondary)] hover:text-[var(--color-control)] hover:text-[var(--color-secondary)] transition-colors shrink-0 flex items-center gap-1"
              title="Move Task"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold hidden sm:inline">Move</span>
            </button>

            <button
              type="button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                setActiveCommentTaskId(isCommentOpen ? null : task.id);
              }}
              disabled={isCompleting || isSavingComment || isMoving}
              aria-label={`Comment on task: ${task.title}`}
              className={`p-1.5 rounded-lg hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] transition-colors shrink-0 ${
                isCommentOpen
                  ? 'text-[var(--color-control)] text-[var(--color-secondary)] bg-[var(--color-card)] bg-[var(--color-card)]'
                  : 'text-[var(--color-secondary)]'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status messages (errors, success messages) */}
        {taskErrors[task.id] && (
          <div className="mt-2 text-[10px] text-[var(--color-warning)] text-[var(--color-warning)] bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] px-2 py-1 rounded border border-[var(--color-warning)] border-[var(--color-warning)] flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span>{taskErrors[task.id]}</span>
          </div>
        )}
        {commentSuccessMessages[task.id] && (
          <div className="mt-2 text-[10px] text-[var(--color-success)] text-[var(--color-success)] bg-[var(--color-success-surface)] bg-[var(--color-success-surface)] px-2 py-1 rounded border border-[var(--color-success)] border-[var(--color-success)] flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>{commentSuccessMessages[task.id]}</span>
          </div>
        )}

        {/* Comment Editor */}
        {isCommentOpen && (
          <div
            className="mt-3 pt-3 border-t border-[var(--color-divider)] border-[var(--color-divider)]/60 space-y-2 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <textarea
              rows={2}
              value={taskComments[task.id] || ''}
              onChange={(e) => setTaskComments(prev => ({ ...prev, [task.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setActiveCommentTaskId(null);
                }
              }}
              placeholder="Type a comment..."
              disabled={isSavingComment}
              autoFocus
              className="w-full text-base md:text-xs p-2 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)] bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] text-[var(--color-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--color-control)] focus:ring-[var(--color-secondary)] disabled:opacity-50 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTaskComments(prev => {
                    const copy = { ...prev };
                    delete copy[task.id];
                    return copy;
                  });
                  setActiveCommentTaskId(null);
                }}
                disabled={isSavingComment}
                className="px-2.5 py-1 text-[11px] font-semibold text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] rounded-md transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAddComment(task.id)}
                disabled={isSavingComment || !(taskComments[task.id] || '').trim()}
                className="px-3 py-1 text-[11px] font-semibold bg-[var(--color-card-raised)] text-[var(--color-ink)] hover:bg-[var(--color-card)] bg-[var(--color-card-raised)] text-[var(--color-ink)] hover:bg-[var(--color-card-raised)] rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {isSavingComment && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>Add comment</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="col-span-1 lg:col-span-12 bg-[var(--color-card)] bg-[var(--color-card)] rounded-xl border border-[var(--color-divider)] border-[var(--color-divider)] shadow-sm p-4 sm:p-6 flex flex-col min-h-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--color-control)] text-[var(--color-ink)] uppercase tracking-wider">TODOIST TASKS</h3>
          <p className="text-xs text-[var(--color-secondary)] mt-0.5">Today and Pull System</p>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-control)]" />
        </div>
      ) : (taskGroups.overdue.length === 0 && taskGroups.today.length === 0 && taskGroups.upcoming.length === 0 && taskGroups.completed.length === 0) ? (
        <div className="flex-1 flex flex-col justify-center items-center py-12">
          <CheckSquare className="w-8 h-8 text-[var(--color-divider)] mb-2" />
          <p className="text-xs text-[var(--color-secondary)]">No active tasks. Capture a new task below!</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch w-full min-h-[34rem]">
            {/* LEFT SIDE — TODAY'S TASKS (approx 5/12 width) */}
            <div className="col-span-1 md:col-span-5 flex flex-col min-h-0 md:border-r md:border-[var(--color-divider)] md:border-[var(--color-divider)]/60 md:pr-6 text-left">
              <div className="flex items-center justify-between gap-2 mb-4 w-full">
                <div className="flex items-center gap-2">
                  <h4 className="font-display text-xs font-semibold text-[var(--color-control)] text-[var(--color-secondary)] uppercase tracking-wider">
                    TODAY'S TASKS
                  </h4>
                  <span className="text-[10px] bg-[var(--color-divider)] bg-[var(--color-divider)]/60 text-[var(--color-control)] text-[var(--color-secondary)] font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                    {todayTasks.length}
                  </span>
                </div>
                <button
                  id="add-today-task-btn"
                  type="button"
                  onClick={() => setIsAddingTodayTask(!isAddingTodayTask)}
                  aria-label="Add task to today"
                  className="p-1 hover:bg-[var(--color-divider)] hover:bg-[var(--color-divider)]/60 rounded text-[var(--color-control)] text-[var(--color-secondary)] transition-colors flex items-center justify-center"
                >
                  {isAddingTodayTask ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              {isAddingTodayTask && (
                <form
                  id="add-today-task-form"
                  onSubmit={submitTodayTask}
                  className="bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)]/80 rounded-lg p-3 mb-4 space-y-3"
                >
                  <div className="space-y-1">
                    <label htmlFor="today-task-title" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                      Task Title *
                    </label>
                    <input
                      id="today-task-title"
                      type="text"
                      required
                      value={todayTaskTitle}
                      onChange={(e) => setTodayTaskTitle(e.target.value)}
                      placeholder="What needs to be done today?"
                      className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="today-task-desc" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                      Description
                    </label>
                    <textarea
                      id="today-task-desc"
                      value={todayTaskDesc}
                      onChange={(e) => setTodayTaskDesc(e.target.value)}
                      placeholder="Optional description"
                      rows={2}
                      className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="today-task-priority" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                        Priority
                      </label>
                      <select
                        id="today-task-priority"
                        value={todayTaskPriority}
                        onChange={(e) => setTodayTaskPriority(Number(e.target.value))}
                        className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)]"
                      >
                        <option value={1}>Priority 1 (Normal)</option>
                        <option value={2}>Priority 2 (Medium)</option>
                        <option value={3}>Priority 3 (High)</option>
                        <option value={4}>Priority 4 (Very High / Urgent)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <span className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                        Context
                      </span>
                      {activeTab === 'combined' ? (
                        <div className="flex bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-0.5 text-xs h-[34px] items-center">
                          <button
                            id="today-task-ctx-personal"
                            type="button"
                            onClick={() => setTodayTaskContext('personal')}
                            className={`flex-1 py-1 text-[11px] font-semibold rounded text-center ${todayTaskContext === 'personal' ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]' : 'text-[var(--color-secondary)]'}`}
                          >
                            Personal
                          </button>
                          <button
                            id="today-task-ctx-pro"
                            type="button"
                            onClick={() => setTodayTaskContext('professional')}
                            className={`flex-1 py-1 text-[11px] font-semibold rounded text-center ${todayTaskContext === 'professional' ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]' : 'text-[var(--color-secondary)]'}`}
                          >
                            Pro
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-secondary)] p-2 bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded h-[34px] flex items-center capitalize">
                          {activeTab}
                        </div>
                      )}
                    </div>
                  </div>

                  {todayTaskError && (
                    <div className="text-[10px] font-semibold text-[var(--color-warning)] text-[var(--color-warning)] p-1.5 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded">
                      {todayTaskError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      id="add-today-task-cancel"
                      type="button"
                      disabled={todayTaskLoading}
                      onClick={() => setIsAddingTodayTask(false)}
                      className="px-3 py-1.5 border border-[var(--color-divider)] border-[var(--color-divider)] rounded text-xs font-semibold text-[var(--color-secondary)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      id="add-today-task-submit"
                      type="submit"
                      disabled={todayTaskLoading || !todayTaskTitle.trim()}
                      className="px-3 py-1.5 bg-[var(--color-card-raised)] text-[var(--color-ink)] rounded text-xs font-semibold hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      {todayTaskLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save'
                      )}
                    </button>
                  </div>
                </form>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 max-h-[32rem]">
                {todayTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <CheckSquare className="w-8 h-8 text-[var(--color-divider)] mb-2" />
                    <p className="text-xs text-[var(--color-secondary)] text-center">No overdue or due-today tasks. Enjoy your day!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {todayTasks.map(task => renderTodoistTaskCard(task, task.isOverdue))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT SIDE — PULL SYSTEM BOARD (approx 7/12 width) */}
            <div className="col-span-1 md:col-span-7 flex flex-col min-h-0 text-left">
              <div className="flex items-center gap-2 mb-4">
                <h4 className="font-display text-xs font-semibold text-[var(--color-control)] text-[var(--color-secondary)] uppercase tracking-wider">
                  PULL SYSTEM BOARD
                </h4>
                <span className="text-[10px] bg-[var(--color-divider)] bg-[var(--color-divider)]/60 text-[var(--color-control)] text-[var(--color-secondary)] font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                  {sectionsData.activeCount}
                </span>
              </div>

              <div className="flex-1 min-h-0 flex flex-col">
                {/* Safe Diagnostic/Warning Alerts */}
                {!dashboardData?.todoistInboxProjectId && (
                  <div className="mb-4 p-4 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded-xl text-xs text-[var(--color-warning)] text-[var(--color-warning)] text-left">
                    The Todoist Inbox project could not be identified. Today view is still available.
                  </div>
                )}

                {dashboardData?.todoistInboxProjectId &&
                 (filteredData?.tasks || []).filter(t => !t.completed && !t.parentId && String(t.projectId) === String(dashboardData.todoistInboxProjectId)).some(t => t.sectionId) &&
                 sectionsData.columns.length <= 1 && (
                  <div className="mb-4 p-4 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded-xl text-xs text-[var(--color-warning)] text-[var(--color-warning)] text-left">
                    Todoist section data is temporarily unavailable. Tasks are shown under No Section.
                  </div>
                )}

                {sectionsData.columns.length === 0 ? (
                  <div className="flex-1 flex flex-col justify-center items-center py-12">
                    <CheckSquare className="w-8 h-8 text-[var(--color-divider)] mb-2" />
                    <p className="text-xs text-[var(--color-secondary)]">No active tasks in your Inbox Board.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop Board View (Visible on MD and above) */}
                    <div className="hidden md:flex gap-4 overflow-x-auto pb-4 pt-1 w-full min-w-0 pr-2 select-none h-full">
                      {sectionsData.columns.map(col => (
                        <div
                          key={col.id}
                          onDragOver={(e) => handleDragOver(e, col.id)}
                          onDrop={(e) => handleDrop(e, col.id)}
                          className={`w-[290px] shrink-0 flex flex-col min-h-0 p-4 rounded-xl max-h-[32rem] border transition-all ${
                            dragOverColumnId === col.id
                              ? 'border-[var(--color-control)] border-[var(--color-secondary)] bg-[var(--color-card-raised)]/5 bg-[var(--color-card-raised)]/5 ring-2 ring-[var(--color-control)]/20'
                              : 'bg-[var(--color-card-raised)] bg-[var(--color-card)]/5 border-[var(--color-divider)] border-[var(--color-divider)]/40'
                          }`}
                        >
                          {/* Column Header */}
                          <div className="flex flex-col mb-3 shrink-0">
                            <div className="flex items-center justify-between gap-1.5 min-w-0 w-full">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <h4 className="font-display font-semibold text-xs text-[var(--color-control)] text-[var(--color-secondary)] truncate uppercase tracking-wider">
                                  {col.name}
                                </h4>
                                <span className="text-[10px] bg-[var(--color-divider)] bg-[var(--color-divider)]/60 text-[var(--color-control)] text-[var(--color-secondary)] font-semibold px-2 py-0.5 rounded-full flex-shrink-0">
                                  {col.tasks.length}
                                </span>
                              </div>
                              <button
                                id={`board-add-btn-${col.id}`}
                                type="button"
                                onClick={() => toggleAddingTaskForSection(col.id)}
                                aria-label={`Add task to ${col.name}`}
                                className="p-1 hover:bg-[var(--color-divider)] hover:bg-[var(--color-divider)]/60 rounded text-[var(--color-control)] text-[var(--color-secondary)] transition-colors flex items-center justify-center cursor-pointer"
                              >
                                {addingTaskForSectionId === col.id ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {addingTaskForSectionId === col.id && (
                            <form
                              id={`board-task-form-${col.id}`}
                              onSubmit={(e) => submitBoardTask(e, col.id)}
                              className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)]/80 rounded-lg p-3 mb-3 space-y-3 text-left shrink-0"
                            >
                              <div className="space-y-1">
                                <label htmlFor={`board-task-title-${col.id}`} className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                  Task Title *
                                </label>
                                <input
                                  id={`board-task-title-${col.id}`}
                                  type="text"
                                  required
                                  value={boardTaskTitle}
                                  onChange={(e) => setBoardTaskTitle(e.target.value)}
                                  placeholder="Task title"
                                  className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)]"
                                />
                              </div>

                              <div className="space-y-1">
                                <label htmlFor={`board-task-desc-${col.id}`} className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                  Description
                                </label>
                                <textarea
                                  id={`board-task-desc-${col.id}`}
                                  value={boardTaskDesc}
                                  onChange={(e) => setBoardTaskDesc(e.target.value)}
                                  placeholder="Optional description"
                                  rows={2}
                                  className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] resize-none"
                                />
                              </div>

                              <div className="grid grid-cols-1 gap-2">
                                <div className="space-y-1">
                                  <label htmlFor={`board-task-priority-${col.id}`} className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                    Priority
                                  </label>
                                  <select
                                    id={`board-task-priority-${col.id}`}
                                    value={boardTaskPriority}
                                    onChange={(e) => setBoardTaskPriority(Number(e.target.value))}
                                    className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)]"
                                  >
                                    <option value={1}>Priority 1 (Normal)</option>
                                    <option value={2}>Priority 2 (Medium)</option>
                                    <option value={3}>Priority 3 (High)</option>
                                    <option value={4}>Priority 4 (Urgent)</option>
                                  </select>
                                </div>

                                {activeTab === 'combined' && (
                                  <div className="space-y-1">
                                    <span className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                      Context
                                    </span>
                                    <div className="flex bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-0.5 text-xs items-center h-[32px]">
                                      <button
                                        id={`board-task-ctx-personal-${col.id}`}
                                        type="button"
                                        onClick={() => setBoardTaskContext('personal')}
                                        className={`flex-1 py-1 text-[10px] font-semibold rounded text-center ${boardTaskContext === 'personal' ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]' : 'text-[var(--color-secondary)]'}`}
                                      >
                                        Personal
                                      </button>
                                      <button
                                        id={`board-task-ctx-pro-${col.id}`}
                                        type="button"
                                        onClick={() => setBoardTaskContext('professional')}
                                        className={`flex-1 py-1 text-[10px] font-semibold rounded text-center ${boardTaskContext === 'professional' ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]' : 'text-[var(--color-secondary)]'}`}
                                      >
                                        Pro
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {boardTaskError && (
                                <div className="text-[10px] font-semibold text-[var(--color-warning)] text-[var(--color-warning)] p-1.5 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded">
                                  {boardTaskError}
                                </div>
                              )}

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  id={`board-task-cancel-${col.id}`}
                                  type="button"
                                  disabled={boardTaskLoading}
                                  onClick={() => setAddingTaskForSectionId(null)}
                                  className="px-2.5 py-1 border border-[var(--color-divider)] border-[var(--color-divider)] rounded text-[11px] font-semibold text-[var(--color-secondary)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  id={`board-task-submit-${col.id}`}
                                  type="submit"
                                  disabled={boardTaskLoading || !boardTaskTitle.trim()}
                                  className="px-2.5 py-1 bg-[var(--color-card-raised)] text-[var(--color-ink)] rounded text-[11px] font-semibold hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors flex items-center gap-1 justify-center"
                                >
                                  {boardTaskLoading ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </form>
                          )}

                          {/* Column Tasks */}
                          <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
                            {col.tasks.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-8 text-center ">
                                <CheckSquare className="w-5 h-5 text-[var(--color-divider)] mb-1" />
                                <p className="text-[10px] text-[var(--color-secondary)]">Empty column</p>
                              </div>
                            ) : (
                              col.tasks.map(task => renderTodoistTaskCard(task, task.isOverdue, true))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mobile Board View (Visible below MD) */}
                    <div className="flex flex-col md:hidden w-full">
                      {/* Horizontally scrollable section tabs */}
                      <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 px-1 border-b border-[var(--color-divider)]/60 border-[var(--color-divider)]/30 w-full mb-3">
                        {sectionsData.columns.map(col => {
                          const isActive = col.id === activeMobileSectionId;
                          return (
                            <button
                              key={col.id}
                              onClick={() => setSelectedMobileSectionId(col.id)}
                              className={`px-3 py-1.5 text-xs font-semibold uppercase rounded-lg transition-colors shrink-0 whitespace-nowrap cursor-pointer min-h-[40px] flex items-center gap-1.5 ${
                                isActive
                                  ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)] bg-[var(--color-card-raised)] text-[var(--color-ink)]'
                                  : 'bg-[var(--color-card-raised)] bg-[var(--color-card)] text-[var(--color-secondary)] hover:text-[var(--color-control)] hover:text-[var(--color-ink)] border border-[var(--color-divider)] border-[var(--color-divider)]/60'
                              }`}
                            >
                              <span>{col.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${isActive ? 'bg-[var(--color-card)] text-[var(--color-control)]' : 'bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-secondary)]'}`}>
                                {col.tasks.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Active Column Tasks */}
                      {(() => {
                        const activeCol = sectionsData.columns.find(col => col.id === activeMobileSectionId);
                        if (!activeCol) return null;
                        return (
                          <div className="space-y-3 min-h-0 max-h-[30rem] overflow-y-auto pr-1">
                            {/* Mobile Add Task Control */}
                            <div className="flex items-center justify-between gap-1.5 p-2 bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)]/40 rounded-lg">
                              <span className="text-xs font-semibold text-[var(--color-secondary)]">Add task to {activeCol.name}</span>
                              <button
                                id={`mobile-add-btn-${activeCol.id}`}
                                type="button"
                                onClick={() => toggleAddingTaskForSection(activeCol.id)}
                                aria-label={`Add task to ${activeCol.name}`}
                                className="p-1.5 hover:bg-[var(--color-divider)] hover:bg-[var(--color-divider)]/60 rounded text-[var(--color-control)] text-[var(--color-secondary)] transition-colors flex items-center justify-center border border-[var(--color-divider)] border-[var(--color-divider)]/40 cursor-pointer"
                              >
                                {addingTaskForSectionId === activeCol.id ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              </button>
                            </div>

                            {addingTaskForSectionId === activeCol.id && (
                              <form
                                id={`board-task-form-mobile-${activeCol.id}`}
                                onSubmit={(e) => submitBoardTask(e, activeCol.id)}
                                className="bg-[var(--color-card-raised)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)]/80 rounded-lg p-3 space-y-3 text-left"
                              >
                                <div className="space-y-1">
                                  <label htmlFor={`board-task-title-mobile-${activeCol.id}`} className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                    Task Title *
                                  </label>
                                  <input
                                    id={`board-task-title-mobile-${activeCol.id}`}
                                    type="text"
                                    required
                                    value={boardTaskTitle}
                                    onChange={(e) => setBoardTaskTitle(e.target.value)}
                                    placeholder="Task title"
                                    className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)]"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label htmlFor={`board-task-desc-mobile-${activeCol.id}`} className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                    Description
                                  </label>
                                  <textarea
                                    id={`board-task-desc-mobile-${activeCol.id}`}
                                    value={boardTaskDesc}
                                    onChange={(e) => setBoardTaskDesc(e.target.value)}
                                    placeholder="Optional description"
                                    rows={2}
                                    className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] resize-none"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label htmlFor={`board-task-priority-mobile-${activeCol.id}`} className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                    Priority
                                  </label>
                                  <select
                                    id={`board-task-priority-mobile-${activeCol.id}`}
                                    value={boardTaskPriority}
                                    onChange={(e) => setBoardTaskPriority(Number(e.target.value))}
                                    className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)]"
                                  >
                                    <option value={1}>Priority 1 (Normal)</option>
                                    <option value={2}>Priority 2 (Medium)</option>
                                    <option value={3}>Priority 3 (High)</option>
                                    <option value={4}>Priority 4 (Urgent)</option>
                                  </select>
                                </div>

                                {activeTab === 'combined' && (
                                  <div className="space-y-1">
                                    <span className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                                      Context
                                    </span>
                                    <div className="flex bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-0.5 text-xs items-center h-[34px]">
                                      <button
                                        id={`board-task-ctx-personal-mobile-${activeCol.id}`}
                                        type="button"
                                        onClick={() => setBoardTaskContext('personal')}
                                        className={`flex-1 py-1 text-[11px] font-semibold rounded text-center ${boardTaskContext === 'personal' ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]' : 'text-[var(--color-secondary)]'}`}
                                      >
                                        Personal
                                      </button>
                                      <button
                                        id={`board-task-ctx-pro-mobile-${activeCol.id}`}
                                        type="button"
                                        onClick={() => setBoardTaskContext('professional')}
                                        className={`flex-1 py-1 text-[11px] font-semibold rounded text-center ${boardTaskContext === 'professional' ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]' : 'text-[var(--color-secondary)]'}`}
                                      >
                                        Pro
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {boardTaskError && (
                                  <div className="text-[10px] font-semibold text-[var(--color-warning)] text-[var(--color-warning)] p-1.5 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded">
                                    {boardTaskError}
                                  </div>
                                )}

                                <div className="flex justify-end gap-2 pt-1">
                                  <button
                                    id={`board-task-cancel-mobile-${activeCol.id}`}
                                    type="button"
                                    disabled={boardTaskLoading}
                                    onClick={() => setAddingTaskForSectionId(null)}
                                    className="px-3 py-1.5 border border-[var(--color-divider)] border-[var(--color-divider)] rounded text-xs font-semibold text-[var(--color-secondary)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    id={`board-task-submit-mobile-${activeCol.id}`}
                                    type="submit"
                                    disabled={boardTaskLoading || !boardTaskTitle.trim()}
                                    className="px-3 py-1.5 bg-[var(--color-card-raised)] text-[var(--color-ink)] rounded text-xs font-semibold hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors flex items-center gap-1 justify-center"
                                  >
                                    {boardTaskLoading ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </form>
                            )}

                            {activeCol.tasks.length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-12 text-center ">
                                <CheckSquare className="w-6 h-6 text-[var(--color-divider)] mb-1" />
                                <p className="text-xs text-[var(--color-secondary)]">This section is empty</p>
                              </div>
                            ) : (
                              activeCol.tasks.map(task => renderTodoistTaskCard(task, task.isOverdue))
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Completed Collapsible Section (Phase 8.5) */}
          {taskGroups.completed.length > 0 && (
            <div className="space-y-2 border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 pt-4 mt-4 text-left">
              <button
                onClick={() => setCompletedTasksExpanded(!completedTasksExpanded)}
                className="w-full flex justify-between items-center text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider font-display hover:text-[var(--color-control)]"
              >
                <span>Completed ({taskGroups.completed.length})</span>
                {completedTasksExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {completedTasksExpanded && taskGroups.completed.map(task => (
                <div
                  key={task.id}
                  className="p-3 bg-[var(--color-card-raised)] bg-[var(--color-card)]/40 border border-[var(--color-divider)]/60 border-[var(--color-divider)]/40 rounded-lg  flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-secondary)]" />
                  <p className="text-xs font-normal text-[var(--color-secondary)] line-through">{task.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
