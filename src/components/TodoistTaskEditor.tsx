import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, AlertTriangle, Check } from 'lucide-react';
import { TodoistTask, TodoistProjectSummary, TodoistSection } from '../types';

interface TodoistTaskEditorProps {
  task: TodoistTask;
  projects: TodoistProjectSummary[];
  sections: TodoistSection[];
  onClose: () => void;
  onSaveDetails: (
    taskId: string,
    details: { content: string; description: string; dueDate: string | null; priority: number }
  ) => Promise<void>;
  onMoveTask: (
    taskId: string,
    move: { projectId: string; sectionId?: string }
  ) => Promise<void>;
  isOffline?: boolean;
}

export const TodoistTaskEditor: React.FC<TodoistTaskEditorProps> = ({
  task,
  projects,
  sections,
  onClose,
  onSaveDetails,
  onMoveTask,
  isOffline = false
}) => {
  // Store previous active element to restore focus on unmount
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, []);

  // Keyboard accessibility: Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Form State for Details
  const [content, setContent] = useState(task.title || '');
  const [description, setDescription] = useState(task.description || '');
  const [dueDate, setDueDate] = useState<string>(task.dueDate || '');
  const [priority, setPriority] = useState<number>(task.priority || 1);

  // Form State for Location
  const [selectedProjectId, setSelectedProjectId] = useState<string>(task.projectId || '');
  const [selectedSectionId, setSelectedSectionId] = useState<string>(task.sectionId || 'no-section');

  // Keep local state in sync if task prop updates (e.g., after successful refresh)
  useEffect(() => {
    setContent(task.title || '');
    setDescription(task.description || '');
    setDueDate(task.dueDate || '');
    setPriority(task.priority || 1);
    setSelectedProjectId(task.projectId || '');
    setSelectedSectionId(task.sectionId || 'no-section');
  }, [task]);

  // Request & Error States
  const [isDetailsSaving, setIsDetailsSaving] = useState(false);
  const [isMoveSaving, setIsMoveSaving] = useState(false);

  const [detailsSuccess, setDetailsSuccess] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [moveSuccess, setMoveSuccess] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  // Warning when due date of a recurring task is modified
  const isRecurring = !!task.recurring;
  const isDueDateModified = dueDate !== (task.dueDate || '');
  const showRecurringWarning = isRecurring && isDueDateModified;

  // Track if details have changed
  const hasDetailsChanged =
    content.trim() !== (task.title || '').trim() ||
    description.trim() !== (task.description || '').trim() ||
    dueDate !== (task.dueDate || '') ||
    priority !== (task.priority || 1);

  // Track if location has changed
  const initialSectionId = task.sectionId || 'no-section';
  const hasLocationChanged =
    selectedProjectId !== (task.projectId || '') ||
    selectedSectionId !== initialSectionId;

  // Filter sections belonging to the selected project
  const projectSections = sections.filter(s => s.projectId === selectedProjectId);

  // If selectedProjectId changes, check if current selectedSectionId is still valid under new project.
  // If not, default to "no-section".
  useEffect(() => {
    if (selectedProjectId !== (task.projectId || '')) {
      const isValid = projectSections.some(s => s.id === selectedSectionId);
      if (!isValid && selectedSectionId !== 'no-section') {
        setSelectedSectionId('no-section');
      }
    }
  }, [selectedProjectId, sections]);

  // Handle Save Details
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isOffline) return;

    setIsDetailsSaving(true);
    setDetailsError(null);
    setDetailsSuccess(null);

    try {
      const finalDueDate = dueDate === '' ? null : dueDate;
      await onSaveDetails(task.id, {
        content: content.trim(),
        description: description.trim(),
        dueDate: finalDueDate,
        priority
      });
      setDetailsSuccess('Task details updated successfully!');
    } catch (err: any) {
      let msg = err.message || 'Failed to update task details.';
      if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
        msg = 'Authentication error. Please verify your connection configuration.';
      }
      setDetailsError(msg);
    } finally {
      setIsDetailsSaving(false);
    }
  };

  // Handle Move Task
  const handleMoveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || isOffline) return;

    setIsMoveSaving(true);
    setMoveError(null);
    setMoveSuccess(null);

    try {
      const finalSectionId = selectedSectionId === 'no-section' ? undefined : selectedSectionId;
      await onMoveTask(task.id, {
        projectId: selectedProjectId,
        sectionId: finalSectionId
      });
      setMoveSuccess('Task location moved successfully!');
    } catch (err: any) {
      let msg = err.message || 'Failed to move task.';
      if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
        msg = 'Authentication error. Please verify your connection configuration.';
      }
      setMoveError(msg);
    } finally {
      setIsMoveSaving(false);
    }
  };

  // Handle Save All sequentially
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [allStatusMessage, setAllStatusMessage] = useState<string | null>(null);

  const handleSaveAll = async () => {
    if (isOffline) return;

    setIsSavingAll(true);
    setAllStatusMessage(null);
    setDetailsError(null);
    setDetailsSuccess(null);
    setMoveError(null);
    setMoveSuccess(null);

    let detailsSucceeded = false;
    let detailsFailed = false;
    let detailsErrorMsg = '';

    let moveSucceeded = false;
    let moveFailed = false;
    let moveErrorMsg = '';

    // Step 1: Save details if changed
    if (hasDetailsChanged) {
      setIsDetailsSaving(true);
      try {
        const finalDueDate = dueDate === '' ? null : dueDate;
        await onSaveDetails(task.id, {
          content: content.trim(),
          description: description.trim(),
          dueDate: finalDueDate,
          priority
        });
        detailsSucceeded = true;
        setDetailsSuccess('Task details updated successfully!');
      } catch (err: any) {
        detailsFailed = true;
        let msg = err.message || 'Failed to update task details.';
        if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
          msg = 'Authentication error. Please verify your connection configuration.';
        }
        detailsErrorMsg = msg;
        setDetailsError(msg);
      } finally {
        setIsDetailsSaving(false);
      }
    }

    // Step 2: Move task if changed
    if (hasLocationChanged) {
      setIsMoveSaving(true);
      try {
        const finalSectionId = selectedSectionId === 'no-section' ? undefined : selectedSectionId;
        await onMoveTask(task.id, {
          projectId: selectedProjectId,
          sectionId: finalSectionId
        });
        moveSucceeded = true;
        setMoveSuccess('Task location moved successfully!');
      } catch (err: any) {
        moveFailed = true;
        let msg = err.message || 'Failed to move task.';
        if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
          msg = 'Authentication error. Please verify your connection configuration.';
        }
        moveErrorMsg = msg;
        setMoveError(msg);
      } finally {
        setIsMoveSaving(false);
      }
    }

    // Compose final unified result status if user edited both areas
    if (hasDetailsChanged && hasLocationChanged) {
      if (detailsSucceeded && moveSucceeded) {
        setAllStatusMessage('Success: Both task details and location updated successfully.');
      } else if (detailsSucceeded && moveFailed) {
        setAllStatusMessage(`Partial Success: Details saved successfully, but moving task failed (${moveErrorMsg}).`);
      } else if (detailsFailed && moveSucceeded) {
        setAllStatusMessage(`Partial Success: Task moved successfully, but saving details failed (${detailsErrorMsg}).`);
      } else {
        setAllStatusMessage('Failed: Both operations failed.');
      }
    }

    setIsSavingAll(false);
  };

  return (
    <div
      className="fixed inset-0 bg-[var(--color-card)]/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-editor-title"
    >
      <div className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)] flex flex-col max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-h-[85vh] max-sm:w-full sm:rounded-xl sm:w-[calc(100vw-16px)] sm:max-w-lg">
        {/* Close Button */}
        <button
          id="editor-close-btn"
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 sm:right-4 sm:top-4 text-[var(--color-secondary)] hover:text-[var(--color-warning)] p-2.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-control)] flex items-center justify-center min-w-[44px] min-h-[44px]"
          aria-label="Close task editor"
          title="Close task editor"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-4">
          <span className="text-[10px] font-semibold uppercase bg-[var(--color-card-raised)] text-[var(--color-control)] bg-[var(--color-card)] text-[var(--color-secondary)] px-2.5 py-1 rounded">
            Todoist Task Editor
          </span>
          <h2 id="task-editor-title" className="text-lg font-semibold font-display text-[var(--color-ink)] text-[var(--color-ink)] leading-tight mt-2">
            Edit: {task.title}
          </h2>
        </div>

        {/* Two Forms (Details & Location) separated cleanly */}
        <div className="space-y-6 flex-1 min-h-0 overflow-y-auto pr-1">

          {/* Details Section Form */}
          <form id="editor-details-form" onSubmit={handleSaveDetails} className="space-y-4 border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 pt-4 text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-control)] text-[var(--color-secondary)] font-display">
              Task Details
            </h3>

            <div className="space-y-1">
              <label htmlFor="editor-task-title" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                Title *
              </label>
              <input
                id="editor-task-title"
                type="text"
                required
                disabled={isDetailsSaving || isSavingAll}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Task title"
                className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] disabled:opacity-60"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="editor-task-description" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                Description
              </label>
              <textarea
                id="editor-task-description"
                disabled={isDetailsSaving || isSavingAll}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description"
                rows={3}
                className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] resize-none disabled:opacity-60 leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="editor-task-due-date" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                  Due Date
                </label>
                <input
                  id="editor-task-due-date"
                  type="date"
                  disabled={isDetailsSaving || isSavingAll}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] disabled:opacity-60"
                />
                {showRecurringWarning && (
                  <div className="flex items-start gap-1 text-[10px] font-semibold text-[var(--color-warning)] text-[var(--color-warning)] mt-1 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] p-1.5 border border-[var(--color-warning)] border-[var(--color-warning)] rounded">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>Warning: This is a recurring task. Changing its due date may break or replace its recurrence pattern.</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="editor-task-priority" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                  Priority
                </label>
                <select
                  id="editor-task-priority"
                  disabled={isDetailsSaving || isSavingAll}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] disabled:opacity-60"
                >
                  <option value={1}>Priority 1 (Normal)</option>
                  <option value={2}>Priority 2 (Medium)</option>
                  <option value={3}>Priority 3 (High)</option>
                  <option value={4}>Priority 4 (Urgent)</option>
                </select>
              </div>
            </div>

            {detailsError && (
              <div className="text-[11px] font-semibold text-[var(--color-warning)] text-[var(--color-warning)] p-2 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded">
                Error saving details: {detailsError}
              </div>
            )}

            {detailsSuccess && (
              <div className="text-[11px] font-semibold text-[var(--color-success)] text-[var(--color-success)] p-2 bg-[var(--color-success-surface)] bg-[var(--color-success-surface)] border border-[var(--color-success)] border-[var(--color-success)] rounded flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{detailsSuccess}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                id="editor-save-details-btn"
                type="submit"
                disabled={isDetailsSaving || isSavingAll || !hasDetailsChanged || !content.trim() || isOffline}
                className="px-3 py-1.5 bg-[var(--color-card-raised)] text-[var(--color-ink)] rounded text-xs font-semibold hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                {isDetailsSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Details</span>
                )}
              </button>
            </div>
          </form>

          {/* Location / Move Section Form */}
          <form id="editor-location-form" onSubmit={handleMoveTask} className="space-y-4 border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 pt-4 text-left">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-control)] text-[var(--color-secondary)] font-display">
              Move Task
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="editor-task-project" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                  Project
                </label>
                <select
                  id="editor-task-project"
                  disabled={isMoveSaving || isSavingAll}
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] disabled:opacity-60"
                >
                  <option value="" disabled>Select Project</option>
                  {projects.map(proj => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="editor-task-section" className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase tracking-wider">
                  Section
                </label>
                <select
                  id="editor-task-section"
                  disabled={isMoveSaving || isSavingAll}
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="w-full text-xs bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded p-2 focus:outline-none focus:border-[var(--color-control)] text-[var(--color-ink)] text-[var(--color-ink)] disabled:opacity-60"
                >
                  <option value="no-section">No Section</option>
                  {projectSections.map(sec => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {moveError && (
              <div className="text-[11px] font-semibold text-[var(--color-warning)] text-[var(--color-warning)] p-2 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded">
                Error moving task: {moveError}
              </div>
            )}

            {moveSuccess && (
              <div className="text-[11px] font-semibold text-[var(--color-success)] text-[var(--color-success)] p-2 bg-[var(--color-success-surface)] bg-[var(--color-success-surface)] border border-[var(--color-success)] border-[var(--color-success)] rounded flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{moveSuccess}</span>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                id="editor-move-task-btn"
                type="submit"
                disabled={isMoveSaving || isSavingAll || !hasLocationChanged || !selectedProjectId || isOffline}
                className="px-3 py-1.5 bg-[var(--color-card-raised)] text-[var(--color-ink)] rounded text-xs font-semibold hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors flex items-center gap-1 cursor-pointer"
              >
                {isMoveSaving ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Moving...</span>
                  </>
                ) : (
                  <span>Move Task</span>
                )}
              </button>
            </div>
          </form>

        </div>

        {/* Unified Save All & Cancel Footer */}
        <div className="border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 pt-4 mt-6 space-y-3">
          {allStatusMessage && (
            <div className={`text-xs font-semibold p-2.5 rounded border ${
              allStatusMessage.includes('Success:')
                ? 'bg-[var(--color-success-surface)] bg-[var(--color-success-surface)] border-[var(--color-success)] border-[var(--color-success)] text-[var(--color-success)] text-[var(--color-success)]'
                : allStatusMessage.includes('Partial Success:')
                  ? 'bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border-[var(--color-warning)] border-[var(--color-warning)] text-[var(--color-warning)] text-[var(--color-warning)]'
                  : 'bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border-[var(--color-warning)] border-[var(--color-warning)] text-[var(--color-warning)] text-[var(--color-warning)]'
            }`}>
              {allStatusMessage}
            </div>
          )}

          <div className="flex justify-between items-center gap-2">
            <span className="text-[10px] text-[var(--color-secondary)]">
              {isOffline ? 'Offline mode. Changes are disabled.' : 'Save details or move separately, or use Save All.'}
            </span>
            <div className="flex gap-2">
              <button
                id="editor-cancel-btn"
                type="button"
                disabled={isDetailsSaving || isMoveSaving || isSavingAll}
                onClick={onClose}
                className="px-3 py-1.5 border border-[var(--color-divider)] border-[var(--color-divider)] rounded text-xs font-semibold text-[var(--color-secondary)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] transition-colors disabled:opacity-50"
              >
                Close
              </button>
              <button
                id="editor-save-all-btn"
                type="button"
                disabled={isDetailsSaving || isMoveSaving || isSavingAll || (!hasDetailsChanged && !hasLocationChanged) || (hasDetailsChanged && !content.trim()) || isOffline}
                onClick={handleSaveAll}
                className="px-4 py-1.5 bg-[var(--color-card-raised)] text-[var(--color-ink)] rounded text-xs font-semibold hover:bg-[var(--color-card)] disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving All...</span>
                  </>
                ) : (
                  <span>Save All Changes</span>
                )}
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
