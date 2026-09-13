import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Check, AlertTriangle, Folder, ChevronRight } from 'lucide-react';
import { TodoistTask, TodoistProjectSummary, TodoistSection } from '../types';

interface TodoistMoveMenuProps {
  task: TodoistTask;
  projects: TodoistProjectSummary[];
  sections: TodoistSection[];
  onClose: () => void;
  onMoveTask: (
    taskId: string,
    move: { projectId: string; sectionId?: string }
  ) => Promise<void>;
  inboxProjectId?: string | null;
  isOffline?: boolean;
}

export const TodoistMoveMenu: React.FC<TodoistMoveMenuProps> = ({
  task,
  projects,
  sections,
  onClose,
  onMoveTask,
  inboxProjectId,
  isOffline = false
}) => {
  // Store previous active element to restore focus on close
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the modal for screen reader context
    if (modalRef.current) {
      modalRef.current.focus();
    }
    return () => {
      document.body.style.overflow = originalOverflow;
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, []);

  // Close on Escape key
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

  // States
  const [isMoving, setIsMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  // For showing the "Leaving Inbox" confirmation inline before executing
  const [pendingDestination, setPendingDestination] = useState<{
    projectId: string;
    sectionId?: string;
    projectName: string;
    sectionName?: string;
  } | null>(null);

  // Check if a destination is current
  const isCurrentLocation = (projId: string, secId: string | undefined) => {
    const taskProjId = task.projectId || '';
    const taskSecId = task.sectionId || 'no-section';
    const compareSecId = secId || 'no-section';
    return taskProjId === projId && taskSecId === compareSecId;
  };

  // Perform the move action
  const executeMove = async (projId: string, secId?: string) => {
    if (isOffline) return;
    setIsMoving(true);
    setMoveError(null);

    try {
      await onMoveTask(task.id, {
        projectId: projId,
        sectionId: secId
      });
      // Close on success
      onClose();
    } catch (err: any) {
      let msg = err.message || 'Failed to move task.';
      if (msg.toLowerCase().includes('bearer') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('key') || msg.toLowerCase().includes('auth')) {
        msg = 'Authentication error. Please verify your connection configuration.';
      }
      setMoveError(msg);
      setPendingDestination(null); // Reset confirmation state
    } finally {
      setIsMoving(false);
    }
  };

  // Click handler for destination item
  const handleDestinationClick = (
    projId: string,
    secId: string | undefined,
    projName: string,
    secName?: string
  ) => {
    if (isCurrentLocation(projId, secId)) return;

    const isInbox = inboxProjectId && String(task.projectId) === String(inboxProjectId);
    const movingOutInbox = isInbox && inboxProjectId && String(projId) !== String(inboxProjectId);

    if (movingOutInbox) {
      // Trigger confirmation dialog inline
      setPendingDestination({
        projectId: projId,
        sectionId: secId,
        projectName: projName,
        sectionName: secName
      });
    } else {
      executeMove(projId, secId);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[var(--color-card)]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-menu-title"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] shadow-2xl p-5 relative overflow-y-auto max-h-[85vh] flex flex-col focus:outline-none max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-h-[85vh] max-sm:w-full sm:rounded-xl sm:max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 sm:right-4 sm:top-4 text-[var(--color-secondary)] hover:text-[var(--color-warning)] p-2.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-control)] flex items-center justify-center min-w-[44px] min-h-[44px]"
          aria-label="Close menu"
          title="Close menu"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="mb-3 pr-6">
          <span className="text-[9px] font-semibold uppercase bg-[var(--color-card-raised)] text-[var(--color-control)] bg-[var(--color-card)] text-[var(--color-secondary)] px-2 py-0.5 rounded">
            Move Destination
          </span>
          <h2 id="move-menu-title" className="text-sm font-semibold font-display text-[var(--color-ink)] text-[var(--color-ink)] leading-tight mt-1.5 break-words">
            Move: {task.title}
          </h2>
        </div>

        {/* Inline Dialog: Move out of Inbox Confirmation */}
        {pendingDestination ? (
          <div className="bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded-lg p-3.5 space-y-3.5 my-2 text-left animate-slide-up">
            <div className="flex gap-2 text-[var(--color-warning)] text-[var(--color-warning)]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold font-display uppercase tracking-wide">
                  Moving Out of Inbox
                </h4>
                <p className="text-[11px] leading-relaxed mt-1">
                  This task is moving out of your genuine <strong>Inbox project</strong> to <strong>{pendingDestination.projectName}</strong>
                  {pendingDestination.sectionName ? ` (${pendingDestination.sectionName})` : ''}.
                </p>
                <p className="text-[11px] leading-relaxed mt-1">
                  It will leave the <strong>Pull System Board</strong>, but it will remain in <strong>Today’s Tasks</strong> if it is due today.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isMoving}
                onClick={() => setPendingDestination(null)}
                className="px-2.5 py-1 text-[10px] font-semibold border border-[var(--color-warning)] border-[var(--color-warning)] text-[var(--color-warning)] text-[var(--color-warning)] rounded hover:bg-[var(--color-warning-surface)] hover:bg-[var(--color-warning-surface)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isMoving}
                onClick={() => executeMove(pendingDestination.projectId, pendingDestination.sectionId)}
                className="px-3 py-1 bg-[var(--color-warning-surface)] text-[var(--color-ink)] rounded text-[10px] font-semibold hover:bg-[var(--color-warning-surface)] disabled:opacity-50 flex items-center gap-1"
              >
                {isMoving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span>Proceed & Move</span>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Normal Destination List */
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4 my-2 text-left">
            {moveError && (
              <div className="text-[11px] font-semibold text-[var(--color-warning)] text-[var(--color-warning)] p-2.5 bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{moveError}</span>
              </div>
            )}

            {projects.length === 0 ? (
              <p className="text-xs text-[var(--color-secondary)] italic">No projects found in your catalog.</p>
            ) : (
              <div className="space-y-4">
                {projects.map((proj) => {
                  const projectSections = sections.filter(s => s.projectId === proj.id);
                  const isProjCurrentNoSec = isCurrentLocation(proj.id, 'no-section');

                  return (
                    <div key={proj.id} className="border border-[var(--color-divider)]/60 border-[var(--color-divider)]/30 rounded-lg p-2.5 bg-[var(--color-card-raised)]/30 bg-transparent">
                      {/* Project Header */}
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] mb-2 pb-1 border-b border-[var(--color-divider)]/40">
                        <Folder className="w-3.5 h-3.5 text-[var(--color-control)] text-[var(--color-secondary)] shrink-0" />
                        <span>{proj.name}</span>
                      </div>

                      {/* Options (No Section & Real Sections) */}
                      <div className="space-y-1 pl-1">
                        {/* No Section option */}
                        <button
                          type="button"
                          disabled={isMoving || isProjCurrentNoSec || isOffline}
                          onClick={() => handleDestinationClick(proj.id, undefined, proj.name, 'No Section')}
                          className={`w-full text-left text-[11px] px-3.5 py-2.5 rounded transition-all flex items-center justify-between ${
                            isProjCurrentNoSec
                              ? 'bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-secondary)] font-normal cursor-not-allowed border border-dashed border-[var(--color-divider)] border-[var(--color-divider)]'
                              : 'text-[var(--color-ink)] text-[var(--color-secondary)] hover:bg-[var(--color-card-raised)]/5 hover:text-[var(--color-control)] hover:bg-[var(--color-card-raised)]/10 hover:text-[var(--color-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-control)]'
                          }`}
                        >
                          <span className="flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 text-[var(--color-secondary)] " />
                            <span>No Section</span>
                          </span>
                          {isProjCurrentNoSec && (
                            <span className="text-[9px] font-semibold bg-[var(--color-divider)] bg-[var(--color-card)] text-[var(--color-control)] text-[var(--color-secondary)] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                              <Check className="w-2.5 h-2.5" />
                              <span>Current</span>
                            </span>
                          )}
                        </button>

                        {/* Real Sections */}
                        {projectSections.map((sec) => {
                          const isSecCurrent = isCurrentLocation(proj.id, sec.id);

                          return (
                            <button
                              key={sec.id}
                              type="button"
                              disabled={isMoving || isSecCurrent || isOffline}
                              onClick={() => handleDestinationClick(proj.id, sec.id, proj.name, sec.name)}
                              className={`w-full text-left text-[11px] px-3.5 py-2.5 rounded transition-all flex items-center justify-between ${
                                isSecCurrent
                                  ? 'bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-secondary)] font-normal cursor-not-allowed border border-dashed border-[var(--color-divider)] border-[var(--color-divider)]'
                                  : 'text-[var(--color-ink)] text-[var(--color-secondary)] hover:bg-[var(--color-card-raised)]/5 hover:text-[var(--color-control)] hover:bg-[var(--color-card-raised)]/10 hover:text-[var(--color-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-control)]'
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                <ChevronRight className="w-3 h-3 text-[var(--color-secondary)] " />
                                <span>{sec.name}</span>
                              </span>
                              {isSecCurrent && (
                                <span className="text-[9px] font-semibold bg-[var(--color-divider)] bg-[var(--color-card)] text-[var(--color-control)] text-[var(--color-secondary)] px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>Current</span>
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 pt-3 mt-3 flex justify-between items-center">
          <span className="text-[9px] text-[var(--color-secondary)]">
            {isOffline ? 'Offline mode.' : 'Select a destination to move.'}
          </span>
          <button
            type="button"
            disabled={isMoving}
            onClick={onClose}
            className="px-3 py-1 border border-[var(--color-divider)] border-[var(--color-divider)] rounded text-[10px] font-semibold text-[var(--color-secondary)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
