import React from 'react';
import {
  X,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { CalendarEventEditor } from '../CalendarEventEditor';
import { TodoistTaskEditor } from '../TodoistTaskEditor';
import { TodoistMoveMenu } from '../TodoistMoveMenu';
import { CalendarEventForm } from '../CalendarEventForm';
import { SettingsWorkspace } from '../SettingsWorkspace';
import {
  CalendarEvent,
  TodoistTask,
  TodoistProjectSummary,
  TodoistSection,
  ObsidianNote,
  UserSettings
} from '../../types';

export interface AppOverlaysProps {
  // Calendar Event Editor / View Details
  selectedEvent: CalendarEvent | null;
  onCloseSelectedEvent: () => void;
  onSuccessSelectedEvent: () => Promise<void>;

  // Todoist Task Editor
  selectedTask: TodoistTask | null;
  onCloseSelectedTask: () => void;
  todoistProjects: TodoistProjectSummary[];
  todoistSections: TodoistSection[];
  onSaveTaskDetails: (taskId: string, details: { title: string; description: string; priority: number; dateString: string }) => Promise<void>;
  onMoveTask: (taskId: string, projectId: string, sectionId: string | null) => Promise<void>;
  isOffline: boolean;

  // Todoist Move Menu
  movingTaskMenu: TodoistTask | null;
  onCloseMovingTaskMenu: () => void;
  todoistInboxProjectId?: string;

  // Calendar Event Creator Form
  showAddEventForm: boolean;
  onCloseAddEventForm: () => void;
  googleCalendars: any[];
  connectionsStatus: any;
  addEventFormInitialDate: Date | undefined;
  addEventFormInitialStartHour: string | undefined;
  onSuccessAddEventForm: () => Promise<void>;

  // Todoist Parent Completion Warning Modal
  confirmingCompleteTask: TodoistTask | null;
  onCloseConfirmingCompleteTask: () => void;
  onCompleteTask: (taskId: string) => void;

  // Obsidian Note Preview Dialog
  selectedNote: ObsidianNote | null;
  onCloseSelectedNote: () => void;

  // Classic Settings Modal
  showSettings: boolean;
  onCloseSettings: () => void;
  settingsSection: 'general' | 'notes' | 'tasks' | 'calendar' | 'weather' | 'connections' | 'shortcuts';
  setSettingsSection: (section: 'general' | 'notes' | 'tasks' | 'calendar' | 'weather' | 'connections' | 'shortcuts') => void;
  settingsEditState: UserSettings | null;
  setSettingsEditState: React.Dispatch<React.SetStateAction<UserSettings | null>>;
  saveSettingsSuccess: boolean;
  handleSaveSettings: () => void;
  secretsForm: {
    todoistToken: string;
    googleClientId: string;
    googleClientSecret: string;
  };
  setSecretsForm: React.Dispatch<React.SetStateAction<{
    todoistToken: string;
    googleClientId: string;
    googleClientSecret: string;
  }>>;
  handleSaveConnections: (e: React.FormEvent) => void;
  handleRemoveTodoistToken: () => void;
  handleConnectGoogleCalendar: () => void;
  getActiveObsidianMode: () => 'desktop' | 'mobile';
  getObsidianStatusInfo: () => { text: string; color: string };
  obsidianUrl: string;
  handleObsidianUrlChange: (url: string) => void;
  obsidianApiKey: string;
  obsidianApiKeyInput: string;
  handleObsidianApiKeyChange: (key: string) => void;
  rememberObsidian: boolean;
  handleRememberObsidianToggle: (checked: boolean) => void;
  handleForgetObsidian: () => void;
  obsidianTestStatus: {
    loading?: boolean;
    success?: boolean;
    message?: string;
  };
  handleTestObsidianConnection: () => void;
}

export const AppOverlays: React.FC<AppOverlaysProps> = ({
  selectedEvent,
  onCloseSelectedEvent,
  onSuccessSelectedEvent,

  selectedTask,
  onCloseSelectedTask,
  todoistProjects,
  todoistSections,
  onSaveTaskDetails,
  onMoveTask,
  isOffline,

  movingTaskMenu,
  onCloseMovingTaskMenu,
  todoistInboxProjectId,

  showAddEventForm,
  onCloseAddEventForm,
  googleCalendars,
  connectionsStatus,
  addEventFormInitialDate,
  addEventFormInitialStartHour,
  onSuccessAddEventForm,

  confirmingCompleteTask,
  onCloseConfirmingCompleteTask,
  onCompleteTask,

  selectedNote,
  onCloseSelectedNote,

  showSettings,
  onCloseSettings,
  settingsSection,
  setSettingsSection,
  settingsEditState,
  setSettingsEditState,
  saveSettingsSuccess,
  handleSaveSettings,
  secretsForm,
  setSecretsForm,
  handleSaveConnections,
  handleRemoveTodoistToken,
  handleConnectGoogleCalendar,
  getActiveObsidianMode,
  getObsidianStatusInfo,
  obsidianUrl,
  handleObsidianUrlChange,
  obsidianApiKey,
  obsidianApiKeyInput,
  handleObsidianApiKeyChange,
  rememberObsidian,
  handleRememberObsidianToggle,
  handleForgetObsidian,
  obsidianTestStatus,
  handleTestObsidianConnection
}) => {
  return (
    <>
      {/* Calendar Event Editor / View Details Dialog */}
      {selectedEvent && (
        <CalendarEventEditor
          event={selectedEvent}
          onClose={onCloseSelectedEvent}
          onSuccess={onSuccessSelectedEvent}
        />
      )}

      {/* Todoist Task Editor */}
      {selectedTask && (
        <TodoistTaskEditor
          key={selectedTask.id}
          task={selectedTask}
          projects={todoistProjects}
          sections={todoistSections}
          onClose={onCloseSelectedTask}
          onSaveDetails={onSaveTaskDetails}
          onMoveTask={onMoveTask}
          isOffline={isOffline}
        />
      )}

      {/* Todoist Move Menu Popup Overlay */}
      {movingTaskMenu && (
        <TodoistMoveMenu
          key={movingTaskMenu.id}
          task={movingTaskMenu}
          projects={todoistProjects}
          sections={todoistSections}
          onClose={onCloseMovingTaskMenu}
          onMoveTask={onMoveTask}
          inboxProjectId={todoistInboxProjectId}
          isOffline={isOffline}
        />
      )}

      {/* Calendar Event Creator Form Modal Overlay */}
      {showAddEventForm && (
        <CalendarEventForm
          onClose={onCloseAddEventForm}
          googleCalendars={googleCalendars}
          connectionsStatus={connectionsStatus}
          initialDate={addEventFormInitialDate}
          initialStartHour={addEventFormInitialStartHour}
          onSuccess={onSuccessAddEventForm}
        />
      )}

      {/* Todoist Parent Completion Warning Modal */}
      {confirmingCompleteTask && (
        <div className="fixed inset-0 bg-[var(--color-card)]/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-warning)] border-[var(--color-warning)] rounded-xl w-[calc(100vw-16px)] max-w-sm shadow-2xl p-4 sm:p-6 relative text-left space-y-4 overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)]">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-warning)] font-display flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Confirm Task Completion</span>
              </h3>
              <p className="text-xs text-[var(--color-secondary)] mt-2 leading-relaxed">
                Completing this task will also complete its remaining subtasks. Continue?
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onCloseConfirmingCompleteTask}
                className="px-3.5 py-1.5 text-xs font-semibold text-[var(--color-secondary)] hover:text-[var(--color-ink)] hover:text-[var(--color-ink)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const taskId = confirmingCompleteTask.id;
                  onCloseConfirmingCompleteTask();
                  onCompleteTask(taskId);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[var(--color-warning-surface)] text-[var(--color-ink)] hover:bg-[var(--color-warning-surface)] rounded-md transition-colors shadow-sm"
              >
                Complete task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Obsidian Note Preview Dialog */}
      {selectedNote && (
        <div className="fixed inset-0 bg-[var(--color-card)]/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-xl w-[calc(100vw-16px)] max-w-lg shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)]">
            <button
              onClick={onCloseSelectedNote}
              className="absolute right-4 top-4 text-[var(--color-secondary)] hover:text-[var(--color-warning)] p-1.5"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-left space-y-4">
              <span className="text-[10px] font-semibold uppercase bg-[var(--color-card-raised)] text-[var(--color-control)] bg-[var(--color-card)] text-[var(--color-secondary)] px-2.5 py-1 rounded">
                Obsidian note preview
              </span>
              <h3 className="text-lg font-semibold font-display text-[var(--color-ink)] text-[var(--color-ink)] leading-tight">
                {selectedNote.title}
              </h3>

              <div className="border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 pt-4 text-xs space-y-4">
                <p className="text-[var(--color-secondary)] font-semibold">Note snippet preview</p>
                <div className="bg-[var(--color-card-raised)] bg-[var(--color-card)]/40 p-4 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)]/40 text-[var(--color-ink)] text-[var(--color-ink)] whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                  {selectedNote.preview}
                </div>

                <div className="flex justify-between items-center text-[10px] text-[var(--color-secondary)]">
                  <span>Last Modified: {new Date(selectedNote.modifiedAt).toLocaleString('en-GB')}</span>
                </div>
              </div>

              <div className="border-t border-[var(--color-divider)]/40 pt-4 flex justify-between items-center">
                {selectedNote.obsidianUri ? (
                  <a
                    href={selectedNote.obsidianUri}
                    className="bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] text-[var(--color-ink)] text-xs font-display font-semibold uppercase tracking-wider py-2 px-4 rounded flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Obsidian</span>
                  </a>
                ) : (
                  <span></span>
                )}
                <span className="text-[9px] text-[var(--color-secondary)] italic">Editing is disabled inside dashboard.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && settingsEditState && (
        <div className="fixed inset-0 bg-[var(--color-card)]/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-xl w-[calc(100vw-16px)] max-w-full md:max-w-3xl shadow-2xl overflow-hidden relative flex flex-col md:flex-row h-[calc(100dvh-16px)] md:h-[32rem] max-h-[calc(100dvh-16px)] md:max-h-none min-w-0">

            <button
              onClick={onCloseSettings}
              className="absolute right-3 top-3 md:right-4 md:top-4 text-[var(--color-secondary)] hover:text-[var(--color-warning)] p-1.5 z-50 bg-[var(--color-card)]/80 bg-[var(--color-card)]/80 rounded-full"
              title="Close settings"
            >
              <X className="w-5 h-5" />
            </button>

            <SettingsWorkspace
              settingsSection={settingsSection}
              setSettingsSection={setSettingsSection}
              settingsEditState={settingsEditState}
              setSettingsEditState={setSettingsEditState}
              saveSettingsSuccess={saveSettingsSuccess}
              handleSaveSettings={handleSaveSettings}
              connectionsStatus={connectionsStatus}
              secretsForm={secretsForm}
              setSecretsForm={setSecretsForm}
              handleSaveConnections={handleSaveConnections}
              handleRemoveTodoistToken={handleRemoveTodoistToken}
              handleConnectGoogleCalendar={handleConnectGoogleCalendar}
              getActiveObsidianMode={getActiveObsidianMode}
              getObsidianStatusInfo={getObsidianStatusInfo}
              obsidianUrl={obsidianUrl}
              handleObsidianUrlChange={handleObsidianUrlChange}
              obsidianApiKey={obsidianApiKey}
              obsidianApiKeyInput={obsidianApiKeyInput}
              handleObsidianApiKeyChange={handleObsidianApiKeyChange}
              rememberObsidian={rememberObsidian}
              handleRememberObsidianToggle={handleRememberObsidianToggle}
              handleForgetObsidian={handleForgetObsidian}
              obsidianTestStatus={obsidianTestStatus}
              handleTestObsidianConnection={handleTestObsidianConnection}
            />

          </div>
        </div>
      )}
    </>
  );
};
