import React from 'react';
import {
  Sliders,
  Folder,
  CheckSquare,
  CalendarDays,
  CloudSun,
  Database,
  Keyboard,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { UserSettings } from '../types';

export interface SettingsWorkspaceProps {
  settingsSection: 'general' | 'notes' | 'tasks' | 'calendar' | 'weather' | 'connections' | 'shortcuts';
  setSettingsSection: (section: 'general' | 'notes' | 'tasks' | 'calendar' | 'weather' | 'connections' | 'shortcuts') => void;
  settingsEditState: UserSettings;
  setSettingsEditState: React.Dispatch<React.SetStateAction<UserSettings | null>>;
  saveSettingsSuccess: boolean;
  handleSaveSettings: () => void;

  connectionsStatus: any;
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

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({
  settingsSection,
  setSettingsSection,
  settingsEditState,
  setSettingsEditState,
  saveSettingsSuccess,
  handleSaveSettings,
  connectionsStatus,
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
  handleTestObsidianConnection,
}) => {
  return (
    <>
      {/* Left Sidebar tabs - scrollable row on mobile, column on desktop */}
      <div className="w-full md:w-52 max-w-full min-w-0 bg-[var(--color-card-raised)] bg-[var(--color-card)]/60 border-b md:border-b-0 md:border-r border-[var(--color-divider)] border-[var(--color-divider)]/40 p-3 pr-12 md:pr-4 flex flex-row md:flex-col gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-secondary)] mb-0 md:mb-3 select-none hidden md:block">Settings Panel</p>
        {[
          { id: 'general', label: 'General Prefs', icon: Sliders },
          { id: 'notes', label: 'Obsidian Folders', icon: Folder },
          { id: 'tasks', label: 'Todoist Context', icon: CheckSquare },
          { id: 'calendar', label: 'Calendar Views', icon: CalendarDays },
          { id: 'weather', label: 'Weather City', icon: CloudSun },
          { id: 'connections', label: 'Connections API', icon: Database },
          { id: 'shortcuts', label: 'Shortcuts List', icon: Keyboard }
        ].map(sec => {
          const Icon = sec.icon;
          return (
            <button
              key={sec.id}
              onClick={() => setSettingsSection(sec.id as any)}
              className={`shrink-0 w-auto md:w-full p-2 text-xs font-semibold rounded text-left flex items-center gap-2 transition-colors whitespace-nowrap ${
                settingsSection === sec.id
                  ? 'bg-[var(--color-card-raised)] text-[var(--color-ink)]'
                  : 'text-[var(--color-secondary)] hover:bg-[var(--color-divider)] hover:text-[var(--color-control)] hover:bg-[var(--color-card)]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Pane Form */}
      <div className="flex-1 p-6 overflow-y-auto text-left flex flex-col justify-between">
        <div>

          {saveSettingsSuccess && (
            <div className="bg-[var(--color-divider)] text-[var(--color-control)] p-2.5 rounded text-xs font-semibold flex items-center gap-1.5 mb-4 animate-bounce">
              <CheckCircle2 className="w-4 h-4" />
              <span>Settings successfully saved and synchronized!</span>
            </div>
          )}

          {/* General Settings */}
          {settingsSection === 'general' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">General Preferences</h3>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">Theme Mode</label>
                <select
                  value={settingsEditState.theme}
                  onChange={(e) => setSettingsEditState(prev => ({ ...prev!, theme: e.target.value as any }))}
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                >
                  <option value="light">Light Theme</option>
                  <option value="dark">Dark Theme</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">Refresh Interval (Minutes)</label>
                <input
                  type="number"
                  value={settingsEditState.refreshIntervalMinutes}
                  onChange={(e) => setSettingsEditState(prev => ({ ...prev!, refreshIntervalMinutes: parseInt(e.target.value, 10) }))}
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                  min="1"
                  max="60"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">Date &amp; Time format</label>
                <input
                  type="text"
                  value="British Standard Date Formatting"
                  disabled
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)]/80 text-[var(--color-secondary)]"
                />
              </div>
            </div>
          )}

          {/* Obsidian Folders Configuration */}
          {settingsSection === 'notes' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">Obsidian Vault paths</h3>

              <div className="p-3 bg-[var(--color-divider)]/30 bg-[var(--color-card)]/40 rounded-lg text-xs space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">Active Mode:</span>
                  <span className="font-mono bg-[var(--color-divider)] bg-[var(--color-divider)] px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase text-[var(--color-control)] text-[var(--color-secondary)]">
                    {getActiveObsidianMode() === 'mobile' ? 'Mobile Obsidian App' : 'Desktop Local REST'}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--color-secondary)] leading-relaxed">
                  Determined by {settingsEditState?.obsidian?.connectionMode === 'auto' || !settingsEditState?.obsidian?.connectionMode ? 'Automatic Detection (viewport width + pointer precision)' : 'User Override'}.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Vault Name</label>
                  <input
                    type="text"
                    value={settingsEditState.obsidian.vaultName}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, vaultName: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Connection Mode</label>
                  <select
                    value={settingsEditState.obsidian.connectionMode || 'auto'}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, connectionMode: e.target.value as any } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                  >
                    <option value="auto">Automatic Detection</option>
                    <option value="desktop">Desktop Local REST</option>
                    <option value="mobile">Mobile Obsidian App</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Inbox Folder</label>
                  <input
                    type="text"
                    value={settingsEditState.obsidian.inboxFolder}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, inboxFolder: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Favorites Folder</label>
                  <input
                    type="text"
                    value={settingsEditState.obsidian.favoritesFolder}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, favoritesFolder: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Personal Folder</label>
                  <input
                    type="text"
                    value={settingsEditState.obsidian.personalFolder}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, personalFolder: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Pro Folder</label>
                  <input
                    type="text"
                    value={settingsEditState.obsidian.professionalFolder}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, professionalFolder: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Personal Inbox File</label>
                  <input
                    type="text"
                    value={settingsEditState.obsidian.personalInboxFile}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, personalInboxFile: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Pro Inbox File</label>
                  <input
                    type="text"
                    value={settingsEditState.obsidian.professionalInboxFile}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, obsidian: { ...prev!.obsidian, professionalInboxFile: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Todoist Settings */}
          {settingsSection === 'tasks' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">Todoist Context Labels</h3>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">Personal label</label>
                <input
                  type="text"
                  value={settingsEditState.todoist.personalLabel}
                  onChange={(e) => setSettingsEditState(prev => ({ ...prev!, todoist: { ...prev!.todoist, personalLabel: e.target.value } }))}
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">Professional label</label>
                <input
                  type="text"
                  value={settingsEditState.todoist.professionalLabel}
                  onChange={(e) => setSettingsEditState(prev => ({ ...prev!, todoist: { ...prev!.todoist, professionalLabel: e.target.value } }))}
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                />
              </div>
            </div>
          )}

          {/* Calendar Configuration */}
          {settingsSection === 'calendar' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">Calendar Views Config</h3>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">Default Calendar View</label>
                <select
                  value={settingsEditState.defaultCalendarView}
                  onChange={(e) => setSettingsEditState(prev => ({ ...prev!, defaultCalendarView: e.target.value as any }))}
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                >
                  <option value="day">Focused 12-Hour Day Grid</option>
                  <option value="week">7-Day Week Overview</option>
                  <option value="month">Grid Month View</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Working Hours Start</label>
                  <input
                    type="text"
                    value={settingsEditState.calendar.workingHoursStart}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, calendar: { ...prev!.calendar, workingHoursStart: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                    placeholder="e.g. 08:00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Working Hours End</label>
                  <input
                    type="text"
                    value={settingsEditState.calendar.workingHoursEnd}
                    onChange={(e) => setSettingsEditState(prev => ({ ...prev!, calendar: { ...prev!.calendar, workingHoursEnd: e.target.value } }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                    placeholder="e.g. 20:00"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Weather Location Settings */}
          {settingsSection === 'weather' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">Weather Widget City</h3>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">City Name</label>
                <input
                  type="text"
                  value={settingsEditState.weather.location}
                  onChange={(e) => setSettingsEditState(prev => ({ ...prev!, weather: { ...prev!.weather, location: e.target.value } }))}
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                  placeholder="e.g. Munich, New York, Tokyo"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[var(--color-secondary)]">Temperature Units</label>
                <select
                  value={settingsEditState.weather.units}
                  onChange={(e) => setSettingsEditState(prev => ({ ...prev!, weather: { ...prev!.weather, units: e.target.value as any } }))}
                  className="w-full p-2 border border-[var(--color-divider)] rounded text-base md:text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)]"
                >
                  <option value="C">Celsius (°C)</option>
                  <option value="F">Fahrenheit (°F)</option>
                </select>
              </div>
            </div>
          )}

          {/* Connections Diagnoses & Secure Secrets Form */}
          {settingsSection === 'connections' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">Connections Diagnosis &amp; Secure Configuration</h3>

              {/* Status Logs */}
              {connectionsStatus && (
                <div className="bg-[var(--color-card-raised)] bg-[var(--color-card)]/40 border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span>Google Calendar Status:</span>
                    <span className={`font-semibold font-mono uppercase ${connectionsStatus.googleConnected === 'connected' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                      {connectionsStatus.googleConnected === 'connected' ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  {connectionsStatus.googleConnected === 'connected' && !connectionsStatus.googleWriteAuthorized && (
                    <div className="mt-1 text-[11px] text-[var(--color-warning)] text-[var(--color-warning)] font-semibold bg-[var(--color-warning-surface)] bg-[var(--color-warning-surface)] p-2 rounded border border-[var(--color-warning)] border-[var(--color-warning)] leading-relaxed">
                      Reconnect Google Calendar to enable adding and editing events.
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span>Todoist Integration API Status:</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold font-mono uppercase ${connectionsStatus.todoistConfigured ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}`}>
                        {connectionsStatus.todoistConfigured ? 'Configured' : 'Missing Token'}
                      </span>
                      {connectionsStatus.todoistConfigured && (
                        <button
                          type="button"
                          onClick={handleRemoveTodoistToken}
                          className="text-[10px] text-[var(--color-warning)] hover:text-[var(--color-warning)] font-semibold underline cursor-pointer"
                        >
                          Disconnect
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSaveConnections} className="space-y-3 pt-2">
                <div>
                  <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Todoist API token</label>
                  <input
                    type="password"
                    value={secretsForm.todoistToken}
                    onChange={(e) => setSecretsForm(prev => ({ ...prev, todoistToken: e.target.value }))}
                    className="w-full p-2 border border-[var(--color-divider)] rounded text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                    placeholder={connectionsStatus?.todoistConfigured ? "Token is configured. Enter new token to overwrite..." : "Enter Todoist API Token..."}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Google Client ID</label>
                    <input
                      type="text"
                      value={secretsForm.googleClientId}
                      onChange={(e) => setSecretsForm(prev => ({ ...prev, googleClientId: e.target.value }))}
                      className="w-full p-2 border border-[var(--color-divider)] rounded text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                      placeholder={connectionsStatus?.googleClientId === 'configured' ? "Client ID is configured. Enter new Client ID..." : "Client ID..."}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Google Client Secret</label>
                    <input
                      type="password"
                      value={secretsForm.googleClientSecret}
                      onChange={(e) => setSecretsForm(prev => ({ ...prev, googleClientSecret: e.target.value }))}
                      className="w-full p-2 border border-[var(--color-divider)] rounded text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                      placeholder={connectionsStatus?.googleClientSecret === 'configured' ? "Secret configured. Enter new secret to update..." : "Secret..."}
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center gap-4 pt-2">
                  <button
                    type="button"
                    onClick={handleConnectGoogleCalendar}
                    className="bg-[var(--color-success-surface)] hover:bg-[var(--color-success-surface)] text-[var(--color-ink)] font-display text-[10px] font-semibold tracking-wider uppercase py-2 px-4 rounded"
                  >
                    Connect Google Calendar
                  </button>

                  <button
                    type="submit"
                    className="bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] text-[var(--color-ink)] font-display text-[10px] font-semibold tracking-wider uppercase py-2 px-4 rounded"
                  >
                    Save Credentials
                  </button>
                </div>
              </form>

              {/* Obsidian Local REST API Connection Section */}
              <div className="border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 pt-4 mt-4 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h4 className="font-display font-semibold text-xs uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">Obsidian Local REST API Connection</h4>
                  {(() => {
                    const status = getObsidianStatusInfo();
                    return (
                      <span className={`px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider rounded-full border ${status.color}`}>
                        {status.text}
                      </span>
                    );
                  })()}
                </div>

                {getActiveObsidianMode() === 'mobile' ? (
                  <div className="p-3 bg-[var(--color-card-raised)] bg-[var(--color-card-raised)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded text-xs text-[var(--color-secondary)] text-[var(--color-secondary)] space-y-2">
                    <p className="font-semibold">Active Mode: Mobile Obsidian App</p>
                    <p className="leading-relaxed">
                      In mobile mode, Local REST URL and API Key are not required. Life Site communicates directly with the native Obsidian application on your device using local URI schemes to capture notes.
                    </p>
                    <p className="text-[11px] ">
                      You can customize this behaviour by changing the "Connection Mode" setting under Settings → Notes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Obsidian API URL</label>
                      <input
                        type="text"
                        value={obsidianUrl}
                        onChange={(e) => handleObsidianUrlChange(e.target.value)}
                        className="w-full p-2 border border-[var(--color-divider)] rounded text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                        placeholder="e.g. https://127.0.0.1:27124"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-[var(--color-secondary)] uppercase">Obsidian API Key</label>
                      <input
                        type="password"
                        value={obsidianApiKeyInput}
                        onChange={(e) => handleObsidianApiKeyChange(e.target.value)}
                        className="w-full p-2 border border-[var(--color-divider)] rounded text-xs bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-ink)] font-mono"
                        placeholder={obsidianApiKey ? "🔑 Connection configured" : "Enter your Local REST API password/key..."}
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="remember-obsidian-checkbox"
                        checked={rememberObsidian}
                        onChange={(e) => handleRememberObsidianToggle(e.target.checked)}
                        className="w-4 h-4 rounded text-[var(--color-control)] border-[var(--color-divider)] focus:ring-[var(--color-control)] cursor-pointer"
                      />
                      <label htmlFor="remember-obsidian-checkbox" className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-secondary)] cursor-pointer select-none">
                        Remember Obsidian on this device
                      </label>
                    </div>

                    {rememberObsidian && (
                      <div className="p-2.5 bg-[var(--color-card-raised)] bg-[var(--color-card)]/30 border border-[var(--color-divider)] border-[var(--color-divider)] rounded text-[11px] text-[var(--color-secondary)] text-[var(--color-secondary)] space-y-0.5 leading-relaxed">
                        <p className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">💡 Remembered on this browser only</p>
                        <p>• It will not sync to another computer or phone.</p>
                        <p>• Clearing browser data will remove it.</p>
                      </div>
                    )}

                    {obsidianApiKey && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={handleForgetObsidian}
                          className="px-3 py-1.5 bg-[var(--color-warning-surface)] hover:bg-[var(--color-warning-surface)] text-[var(--color-warning)] bg-[var(--color-warning-surface)]/10 hover:bg-[var(--color-warning-surface)]/20 font-display text-[10px] font-semibold tracking-wider uppercase rounded transition-colors cursor-pointer"
                        >
                          Forget Obsidian on this device
                        </button>
                      </div>
                    )}

                    {obsidianTestStatus.message && (
                      <div className={`p-2.5 rounded text-xs font-semibold flex items-start gap-1.5 ${
                        obsidianTestStatus.success
                          ? 'bg-[var(--color-divider)] bg-[var(--color-card)]/60 text-[var(--color-control)] text-[var(--color-secondary)]'
                          : 'bg-[var(--color-warning-surface)] text-[var(--color-warning)]'
                      }`}>
                        {obsidianTestStatus.success ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-success)] text-[var(--color-success)]" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[var(--color-warning)]" />
                        )}
                        <span className="whitespace-pre-line leading-relaxed">{obsidianTestStatus.message}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleTestObsidianConnection}
                        disabled={obsidianTestStatus.loading}
                        className="bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] disabled:bg-opacity-50 text-[var(--color-ink)] font-display text-[10px] font-semibold tracking-wider uppercase py-2 px-4 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        {obsidianTestStatus.loading ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Testing...</span>
                          </>
                        ) : (
                          <span>Test Connection</span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => window.open(`${obsidianUrl.trim().replace(/\/$/, '')}/`, '_blank')}
                        className="bg-[var(--color-card-raised)] hover:bg-[var(--color-divider)] bg-[var(--color-card)] hover:bg-[var(--color-card)] text-[var(--color-control)] text-[var(--color-secondary)] border border-[var(--color-divider)] border-[var(--color-divider)] font-display text-[10px] font-semibold tracking-wider uppercase py-2 px-4 rounded transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Trust Obsidian Connection</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts List */}
          {settingsSection === 'shortcuts' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-sm uppercase text-[var(--color-control)] text-[var(--color-secondary)] tracking-wider">Keyboard Shortcuts List</h3>
              <div className="space-y-2 font-mono text-xs max-h-56 overflow-y-auto">
                <div className="flex justify-between p-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">/</span>
                  <span>Focus Global Search</span>
                </div>
                <div className="flex justify-between p-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">N</span>
                  <span>Focus Notes Inbox Input</span>
                </div>
                <div className="flex justify-between p-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">T</span>
                  <span>Focus Task Inbox Input</span>
                </div>
                <div className="flex justify-between p-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">R</span>
                  <span>Manual Dashboard Synchronize Refresh</span>
                </div>
                <div className="flex justify-between p-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">1</span>
                  <span>Select Combined Overview Tab</span>
                </div>
                <div className="flex justify-between p-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">2</span>
                  <span>Select Personal Overview Tab</span>
                </div>
                <div className="flex justify-between p-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]/40">
                  <span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">3</span>
                  <span>Select Professional Overview Tab</span>
                </div>
                <div className="flex justify-between p-2">
                  <span className="font-semibold text-[var(--color-warning)]">Esc</span>
                  <span>Close Open Modals or Results</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal footer action */}
        {settingsSection !== 'connections' && settingsSection !== 'shortcuts' && (
          <div className="flex justify-end pt-6 border-t border-[var(--color-divider)] border-[var(--color-divider)]/40 mt-6">
            <button
              onClick={handleSaveSettings}
              className="bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] text-[var(--color-ink)] font-display text-xs font-semibold tracking-wider uppercase py-2.5 px-6 rounded-lg transition-colors"
            >
              Save Preferences
            </button>
          </div>
        )}
      </div>
    </>
  );
};
