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

  // Startup Summary Overlay
  showStartupSummary: boolean;
  onCloseStartupSummary: () => void;
  startupStats: {
    eventsToday: number;
    tasksDue: number;
    overdueTasks: number;
    favModifiedSince: number;
  } | null;
  username: string;

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

  showStartupSummary,
  onCloseStartupSummary,
  startupStats,
  username,

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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#131b2e] border border-red-200 dark:border-red-950/40 rounded-xl w-[calc(100vw-16px)] max-w-sm shadow-2xl p-4 sm:p-6 relative text-left space-y-4 overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)]">
            <div>
              <h3 className="text-sm font-bold text-[#ba1a1a] font-display flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Confirm Task Completion</span>
              </h3>
              <p className="text-xs text-[#757684] mt-2 leading-relaxed">
                Completing this task will also complete its remaining subtasks. Continue?
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onCloseConfirmingCompleteTask}
                className="px-3.5 py-1.5 text-xs font-bold text-[#757684] hover:text-[#131b2e] dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
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
                className="px-3.5 py-1.5 text-xs font-bold bg-[#ba1a1a] text-white hover:bg-[#961414] rounded-md transition-colors shadow-sm"
              >
                Complete task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Obsidian Note Preview Dialog */}
      {selectedNote && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-xl w-[calc(100vw-16px)] max-w-lg shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)]">
            <button 
              onClick={onCloseSelectedNote}
              className="absolute right-4 top-4 text-[#757684] hover:text-[#ba1a1a] p-1.5"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-left space-y-4">
              <span className="text-[10px] font-extrabold uppercase bg-[#f2f3ff] text-[#00288e] dark:bg-[#1a2c4d] dark:text-[#a8b8ff] px-2.5 py-1 rounded">
                Obsidian note preview
              </span>
              <h3 className="text-lg font-bold font-display text-[#131b2e] dark:text-white leading-tight">
                {selectedNote.title}
              </h3>
              
              <div className="border-t border-[#eaedff] dark:border-[#283044]/40 pt-4 text-xs space-y-4">
                <p className="text-[#757684] font-semibold">Note snippet preview</p>
                <div className="bg-[#faf8ff] dark:bg-[#0c1322]/40 p-4 rounded-lg border border-[#eaedff] dark:border-[#283044]/40 text-[#131b2e] dark:text-white whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto">
                  {selectedNote.preview}
                </div>
                
                <div className="flex justify-between items-center text-[10px] text-[#757684]">
                  <span>Last Modified: {new Date(selectedNote.modifiedAt).toLocaleString('en-GB')}</span>
                </div>
              </div>

              <div className="border-t border-[#eaedff]/40 pt-4 flex justify-between items-center">
                {selectedNote.obsidianUri ? (
                  <a
                    href={selectedNote.obsidianUri}
                    className="bg-[#00288e] hover:bg-[#1e40af] text-white text-xs font-display font-semibold uppercase tracking-wider py-2 px-4 rounded flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in Obsidian</span>
                  </a>
                ) : (
                  <span></span>
                )}
                <span className="text-[9px] text-[#757684] italic">Editing is disabled inside dashboard.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Startup Summary Overlay */}
      {showStartupSummary && startupStats && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-xl w-[calc(100vw-16px)] max-w-md shadow-2xl p-4 sm:p-6 relative overflow-y-auto max-h-[calc(100vh-16px)] max-h-[calc(100dvh-16px)]">
            <button 
               onClick={onCloseStartupSummary}
               className="absolute right-4 top-4 text-[#757684] hover:text-[#ba1a1a] p-1.5"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center space-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-extrabold text-[#00288e] dark:text-[#a8b8ff] tracking-widest uppercase">Overview Summary</p>
                <h3 className="font-display text-2xl font-black tracking-tight text-[#131b2e] dark:text-white">WELCOME BACK, {username.toUpperCase()}!</h3>
                <p className="text-xs text-[#757684]">Here is a snapshot of your dashboard state</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-[#faf8ff] dark:bg-[#0c1322]/40 p-3 sm:p-4 rounded-lg border border-[#eaedff] dark:border-[#283044]/60 text-center">
                  <p className="text-2xl font-bold font-mono text-[#00288e] dark:text-[#a8b8ff]">{startupStats.eventsToday}</p>
                  <p className="text-[10px] font-semibold text-[#757684] uppercase tracking-wide mt-1">Events Today</p>
                </div>
                <div className="bg-[#faf8ff] dark:bg-[#0c1322]/40 p-3 sm:p-4 rounded-lg border border-[#eaedff] dark:border-[#283044]/60 text-center">
                  <p className="text-2xl font-bold font-mono text-[#00288e] dark:text-[#a8b8ff]">{startupStats.tasksDue}</p>
                  <p className="text-[10px] font-semibold text-[#757684] uppercase tracking-wide mt-1">Tasks Due Today</p>
                </div>
                <div className="bg-[#faf8ff] dark:bg-[#0c1322]/40 p-3 sm:p-4 rounded-lg border border-[#eaedff] dark:border-[#283044]/60 text-center">
                  <p className="text-2xl font-bold font-mono text-[#ba1a1a]">{startupStats.overdueTasks}</p>
                  <p className="text-[10px] font-semibold text-[#ba1a1a] uppercase tracking-wide mt-1">Overdue Tasks</p>
                </div>
                <div className="bg-[#faf8ff] dark:bg-[#0c1322]/40 p-3 sm:p-4 rounded-lg border border-[#eaedff] dark:border-[#283044]/60 text-center">
                  <p className="text-2xl font-bold font-mono text-[#00288e] dark:text-[#a8b8ff]">{startupStats.favModifiedSince}</p>
                  <p className="text-[10px] font-semibold text-[#757684] uppercase tracking-wide mt-1">Favs Updated</p>
                </div>
              </div>

              <button
                onClick={onCloseStartupSummary}
                className="w-full bg-[#00288e] hover:bg-[#1e40af] text-white font-display text-xs font-semibold tracking-wider uppercase py-3 rounded-lg transition-colors"
              >
                Go To Dashboard (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && settingsEditState && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-xl w-[calc(100vw-16px)] max-w-full md:max-w-3xl shadow-2xl overflow-hidden relative flex flex-col md:flex-row h-[calc(100dvh-16px)] md:h-[32rem] max-h-[calc(100dvh-16px)] md:max-h-none min-w-0">
            
            <button 
              onClick={onCloseSettings}
              className="absolute right-3 top-3 md:right-4 md:top-4 text-[#757684] hover:text-[#ba1a1a] p-1.5 z-50 bg-white/80 dark:bg-[#131b2e]/80 rounded-full"
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
