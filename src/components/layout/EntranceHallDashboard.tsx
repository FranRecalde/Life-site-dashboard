import React from 'react';
import {
  Calendar,
  CheckSquare,
  Folder,
  FileText,
  Brain,
  Sparkles,
  TrendingUp,
  Clock,
  RefreshCw,
  WifiOff,
  ChevronRight,
  AlertCircle,
  Check,
  AlertTriangle,
  Compass,
  ArrowRight
} from 'lucide-react';
import { EntranceHallView } from './entranceHallTypes';
import { EntranceHallCard } from './EntranceHallCard';
import { CalendarEvent, TodoistTask, TodoistProjectSummary, ServiceStatus, ObsidianNote } from '../../types';

interface EntranceHallDashboardProps {
  username?: string;
  activeContext: 'combined' | 'personal' | 'professional';
  onContextChange: (context: 'combined' | 'personal' | 'professional') => void;
  events: CalendarEvent[];
  tasks: TodoistTask[];
  projects: TodoistProjectSummary[];
  recentNotes: ObsidianNote[];
  serviceStatus: ServiceStatus[];
  lastUpdated: string;
  refreshing: boolean;
  isOffline: boolean;
  onRefresh: () => void;
  onNavigate: (view: EntranceHallView) => void;
  onOpenEvent?: (event: CalendarEvent) => void;
  onOpenTask?: (task: TodoistTask) => void;
  onOpenNote?: (note: ObsidianNote) => void;
}

export const EntranceHallDashboard: React.FC<EntranceHallDashboardProps> = ({
  username,
  activeContext,
  onContextChange,
  events = [],
  tasks = [],
  projects = [],
  recentNotes = [],
  serviceStatus = [],
  lastUpdated,
  refreshing,
  isOffline,
  onRefresh,
  onNavigate,
  onOpenEvent,
  onOpenTask,
  onOpenNote,
}) => {
  // Helpers for local date calculation
  const getLocalDateString = (dateObj: Date = new Date()): string => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isEventToday = (eventStartStr: string, todayLocalDateStr: string): boolean => {
    try {
      const eventDate = new Date(eventStartStr);
      const eventLocalDateStr = getLocalDateString(eventDate);
      return eventLocalDateStr === todayLocalDateStr;
    } catch {
      return false;
    }
  };

  const todayLocalDateStr = getLocalDateString();
  const nowTime = new Date().getTime();

  // Determine time-sensitive greeting
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Determine today's formatted date (British style, e.g. "Thursday, 16 July 2026")
  const getFormattedDate = (): string => {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // --- Today's Focus Selection Logic ---
  // 1st Priority: First incomplete overdue top-level task
  const overdueTaskFocus = tasks.find(t => !t.completed && t.isOverdue && !t.parentId);

  // 2nd Priority: First incomplete top-level task due today
  const todayTaskFocus = tasks.find(t => !t.completed && t.dueDate === todayLocalDateStr && !t.parentId);

  // 3rd Priority: Next upcoming calendar event occurring today
  const todayEvents = events
    .filter(e => isEventToday(e.start, todayLocalDateStr))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const upcomingEventFocus = todayEvents.find(e => new Date(e.start).getTime() > nowTime) || todayEvents[0];

  // Selected Focus object representation
  let focusElement: {
    type: 'overdue_task' | 'today_task' | 'event';
    title: string;
    subtext: string;
    original: any;
  } | null = null;

  if (overdueTaskFocus) {
    focusElement = {
      type: 'overdue_task',
      title: overdueTaskFocus.title,
      subtext: `Overdue Task (originally due ${overdueTaskFocus.dueDate})`,
      original: overdueTaskFocus,
    };
  } else if (todayTaskFocus) {
    focusElement = {
      type: 'today_task',
      title: todayTaskFocus.title,
      subtext: 'Task Due Today',
      original: todayTaskFocus,
    };
  } else if (upcomingEventFocus) {
    const formattedTime = upcomingEventFocus.allDay
      ? 'All Day'
      : new Date(upcomingEventFocus.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    focusElement = {
      type: 'event',
      title: upcomingEventFocus.title,
      subtext: `Upcoming Event at ${formattedTime}`,
      original: upcomingEventFocus,
    };
  }

  // Filter Agenda: Events occurring today, sorted chronologically, max 4
  const agendaEvents = todayEvents.slice(0, 4);

  // Filter Tasks: Incomplete, top-level tasks. Overdue first, then today, max 5
  const dashboardTasks = tasks
    .filter(t => !t.completed && !t.parentId)
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return 0;
    })
    .slice(0, 5);

  // Filter Projects: Prioritise favorite projects first, max 4
  const dashboardProjects = [...projects]
    .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0))
    .slice(0, 4);

  // Filter Recent Notes: Sort newest first based on modifiedAt, max 3
  const dashboardNotes = [...recentNotes]
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, 3);

  // Format single event time display helper
  const formatEventTime = (event: CalendarEvent) => {
    if (event.allDay) return 'All Day';
    try {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${startStr} - ${endStr}`;
    } catch {
      return '';
    }
  };

  // Human friendly provider name mapper
  const getProviderLabel = (provider: string): string => {
    switch (provider) {
      case 'google_calendar': return 'Google Calendar';
      case 'todoist': return 'Todoist';
      case 'obsidian': return 'Obsidian Notes';
      case 'weather': return 'Weather';
      default: return provider;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. GREETING & CONTEXT PANEL */}
      <section
        className="p-6 rounded-xl border border-[var(--color-divider)]/60 bg-gradient-to-r from-[var(--color-card)] to-[var(--color-page)] flex flex-col md:flex-row md:items-center md:justify-between gap-6"
        aria-label="Welcome banner"
      >
        <div className="select-none">
          <span className="font-display text-[56px] leading-none tracking-[-0.03em] font-semibold text-[var(--color-ink)]">
            {getFormattedDate()}
          </span>
          <h1 className="text-[20px] font-display font-semibold text-[var(--color-ink)] tracking-wide uppercase mt-1">
            {getGreeting()},{' '}
            <span className="text-[var(--color-secondary)]">
              {username || 'Explorer'}
            </span>
          </h1>
          <p className="text-xs text-[var(--color-secondary)] mt-1 max-w-lg leading-relaxed">
            Here is your unified workspace summary. Change contexts below to filter events, tasks, and recent actions.
          </p>
        </div>

        {/* Workspace Context Picker */}
        <div
          className="flex items-center gap-1.5 p-1 bg-[var(--color-page)] border border-[var(--color-divider)] rounded-lg self-start md:self-auto"
          role="radiogroup"
          aria-label="Filter workspace context"
        >
          {(['combined', 'personal', 'professional'] as const).map((context) => {
            const isActive = activeContext === context;
            return (
              <button
                key={context}
                onClick={() => onContextChange(context)}
                role="radio"
                aria-checked={isActive}
                className={`px-3 py-1.5 rounded text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-secondary)] ${
                  isActive
                    ? 'bg-[var(--color-card)] text-[var(--color-secondary)] border border-[var(--color-secondary)]/30'
                    : 'text-[var(--color-secondary)] border border-transparent hover:text-[var(--color-secondary)]'
                }`}
              >
                {context}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. TODAY'S DETERMINISTIC FOCUS */}
      <section aria-label="Today's Primary Focus">
        <div className="bg-gradient-to-r from-[var(--color-card)] via-[var(--color-card)] to-[var(--color-card)] border border-[var(--color-secondary)]/25 rounded-xl p-5 shadow-none select-none">
          <div className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-[var(--color-secondary)] uppercase">
            <Sparkles className="w-3.5 h-3.5 text-[var(--color-secondary)] animate-pulse" />
            <span>Today's Core Priority Focus</span>
          </div>
          {focusElement ? (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className={`text-xs font-mono uppercase ${focusElement.type === 'overdue_task' ? 'text-[var(--color-overdue)]' : 'text-[var(--color-secondary)]'}`}>
                  {focusElement.subtext}
                </p>
                <h4 className="text-base font-semibold text-[var(--color-ink)] mt-1 group-hover:text-[var(--color-secondary)] transition-colors leading-snug">
                  {focusElement.title}
                </h4>
              </div>
              <button
                onClick={() => {
                  if (focusElement?.type === 'event' && onOpenEvent) {
                    onOpenEvent(focusElement.original);
                  } else if ((focusElement?.type === 'overdue_task' || focusElement?.type === 'today_task') && onOpenTask) {
                    onOpenTask(focusElement.original);
                  } else {
                    onNavigate(focusElement?.type === 'event' ? 'calendar' : 'tasks');
                  }
                }}
                className="px-4 py-2.5 rounded-lg border border-[var(--color-secondary)]/30 bg-[var(--color-page)] hover:border-[var(--color-secondary)] text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer flex items-center gap-2 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-secondary)]"
              >
                <span>Attend to Focus</span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--color-secondary)]" />
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-secondary)] mt-2 italic">
              You have no critical focus items remaining for today. Enjoy the clear space!
            </p>
          )}
        </div>
      </section>

      {/* 3. BENTO GRID OF CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* AGENDA CARD */}
        <EntranceHallCard
          title="Today's Agenda"
          subtitle="Chronological calendar checklist"
          icon={Calendar}
          headerAction={
            <button
              onClick={() => onNavigate('calendar')}
              className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-secondary)] hover:text-[var(--color-secondary)] p-1.5 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-secondary)]"
              aria-label="View full calendar view"
            >
              Calendar Panel
            </button>
          }
        >
          {agendaEvents.length > 0 ? (
            <div className="space-y-3.5" role="list">
              {agendaEvents.map((event) => (
                <div
                  key={event.id}
                  onClick={() => onOpenEvent && onOpenEvent(event)}
                  className="flex items-start gap-3.5 p-2 rounded-lg border border-transparent hover:border-[var(--color-divider)] hover:bg-[var(--color-card)]/30 cursor-pointer transition-all"
                  role="listitem"
                >
                  <div className="text-[10px] font-mono text-[var(--color-secondary)] bg-[var(--color-card)] px-2 py-1 rounded tracking-wide shrink-0 whitespace-nowrap">
                    {formatEventTime(event)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--color-ink)] truncate">{event.title}</p>
                    {event.calendarName && (
                      <p className="text-[10px] text-[var(--color-secondary)] truncate mt-0.5">{event.calendarName}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--color-secondary)] italic">No scheduled events found for today</p>
            </div>
          )}
        </EntranceHallCard>

        {/* TASKS CARD */}
        <EntranceHallCard
          title="Top Priority Tasks"
          subtitle="Overdue and immediate targets"
          icon={CheckSquare}
          headerAction={
            <button
              onClick={() => onNavigate('tasks')}
              className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-secondary)] hover:text-[var(--color-secondary)] p-1.5 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-secondary)]"
              aria-label="View full tasks panel"
            >
              Tasks Panel
            </button>
          }
        >
          {dashboardTasks.length > 0 ? (
            <div className="space-y-3" role="list">
              {dashboardTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onOpenTask && onOpenTask(task)}
                  className="flex items-start gap-3 p-2 rounded-lg border border-transparent hover:border-[var(--color-divider)] hover:bg-[var(--color-card)]/30 cursor-pointer transition-all"
                  role="listitem"
                >
                  <div className="mt-0.5 shrink-0">
                    <div className={`w-3.5 h-3.5 rounded-full border ${
                      task.isOverdue
                        ? 'border-[var(--color-warning)] bg-[var(--color-warning-surface)]'
                        : 'border-[var(--color-secondary)]/60 bg-[var(--color-card-raised)]/10'
                    } flex items-center justify-center`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--color-secondary)] truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {task.isOverdue && (
                        <span className="text-[9px] font-mono font-semibold uppercase text-[var(--color-overdue)] bg-[var(--color-warning-surface)] px-1.5 py-0.5 rounded tracking-wider shrink-0">
                          Overdue
                        </span>
                      )}
                      {task.dueDate && (
                        <span className={`text-[9px] font-mono ${task.isOverdue ? 'text-[var(--color-overdue)]' : 'text-[var(--color-secondary)]'}`}>
                          Due: {task.dueDate}
                        </span>
                      )}
                      {task.projectName && (
                        <span className="text-[9px] text-[var(--color-secondary)] truncate">
                          • {task.projectName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--color-secondary)] italic">No incomplete tasks in today's view</p>
            </div>
          )}
        </EntranceHallCard>

        {/* PROJECTS CARD */}
        <EntranceHallCard
          title="Active Projects"
          subtitle="Project completion metrics"
          icon={Folder}
          headerAction={
            <button
              onClick={() => onNavigate('projects')}
              className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-secondary)] hover:text-[var(--color-secondary)] p-1.5 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-secondary)]"
              aria-label="View full projects panel"
            >
              Projects Panel
            </button>
          }
        >
          {dashboardProjects.length > 0 ? (
            <div className="space-y-3.5" role="list">
              {dashboardProjects.map((project) => (
                <div
                  key={project.id}
                  className="p-2 rounded-lg border border-transparent hover:border-[var(--color-divider)]/50 transition-all select-none"
                  role="listitem"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: project.color || 'var(--color-secondary)' }} />
                      <span className="text-xs font-semibold text-[var(--color-ink)] truncate">{project.name}</span>
                      {project.isFavorite && (
                        <span className="text-[8px] font-mono font-semibold tracking-wider text-[var(--color-secondary)] bg-[var(--color-card-raised)]/20 border border-[var(--color-secondary)]/30 px-1 py-0.2 rounded uppercase">
                          FAV
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-[var(--color-secondary)]">
                      {project.percentageCompleted}%
                    </span>
                  </div>

                  {/* Restrained progress bar */}
                  <div className="w-full bg-[var(--color-page)] rounded-full h-1.5 mt-2 overflow-hidden border border-[var(--color-divider)]/50">
                    <div
                      className="bg-gradient-to-r from-[var(--color-secondary)] to-[var(--color-secondary)] h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${project.percentageCompleted}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[9px] text-[var(--color-secondary)] font-mono mt-1">
                    <span>Active: {project.activeTaskCount}</span>
                    <span>Done: {project.completedTaskCount}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--color-secondary)] italic">No active projects loaded</p>
            </div>
          )}
        </EntranceHallCard>

        {/* NOTES CARD */}
        <EntranceHallCard
          title="Recent Notes"
          subtitle="Obsidian vault modified files"
          icon={FileText}
          headerAction={
            <button
              onClick={() => onNavigate('notes')}
              className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-secondary)] hover:text-[var(--color-secondary)] p-1.5 transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-secondary)]"
              aria-label="View full notes inbox"
            >
              Notes Panel
            </button>
          }
        >
          {dashboardNotes.length > 0 ? (
            <div className="space-y-3" role="list">
              {dashboardNotes.map((note) => (
                <div
                  key={note.path}
                  onClick={() => onOpenNote && onOpenNote(note)}
                  className="p-2.5 rounded-lg border border-[var(--color-divider)]/40 bg-[var(--color-page)]/20 hover:border-[var(--color-secondary)]/25 hover:bg-[var(--color-card)]/25 cursor-pointer transition-all"
                  role="listitem"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-xs font-semibold text-[var(--color-ink)] truncate flex-1">{note.title}</h4>
                    <span className="text-[8px] font-mono text-[var(--color-secondary)] shrink-0">
                      {new Date(note.modifiedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {note.preview && (
                    <p className="text-[10px] text-[var(--color-secondary)] truncate mt-1 leading-relaxed">
                      {note.preview}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-xs text-[var(--color-secondary)] italic">No recent vault notes loaded</p>
            </div>
          )}
        </EntranceHallCard>

        {/* QUICK ACCESS ACTIONS CARD */}
        <EntranceHallCard
          title="Quick Navigation"
          subtitle="Entrance Hall shortcuts"
          icon={Compass}
        >
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'calendar', label: 'Calendar Grid', icon: Calendar, desc: 'Agenda planner' },
              { id: 'tasks', label: 'Tasks Board', icon: CheckSquare, desc: 'Todoist columns' },
              { id: 'projects', label: 'Projects List', icon: Folder, desc: 'Directory trees' },
              { id: 'notes', label: 'Notes Inbox', icon: FileText, desc: 'Obsidian capture' },
              { id: 'thought-catcher', label: 'Thought Wheel', icon: Brain, desc: 'Idea stream' },
              { id: 'habits', label: 'Habits Tracker', icon: Sparkles, desc: 'Performance log' },
            ].map((route) => {
              const IconComp = route.icon;
              return (
                <button
                  key={route.id}
                  onClick={() => onNavigate(route.id as EntranceHallView)}
                  className="p-2.5 rounded-lg border border-[var(--color-divider)]/60 bg-[var(--color-page)]/40 text-left hover:border-[var(--color-secondary)]/30 hover:bg-[var(--color-card)]/40 transition-all outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-secondary)] select-none group"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-ink)] uppercase tracking-wider group-hover:text-[var(--color-secondary)] transition-colors">
                    <IconComp className="w-3.5 h-3.5 text-[var(--color-secondary)] group-hover:text-[var(--color-secondary)]" />
                    <span className="truncate">{route.label}</span>
                  </div>
                  <p className="text-[8px] text-[var(--color-secondary)] truncate mt-0.5 leading-none uppercase font-mono tracking-wide">
                    {route.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </EntranceHallCard>

        {/* SERVICES & INTEGRATION STATUS */}
        <EntranceHallCard
          title="Systems Connection"
          subtitle="Real-time provider heartbeats"
          icon={TrendingUp}
          headerAction={
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className={`p-2 rounded bg-[var(--color-card)] border border-[var(--color-divider)] text-[var(--color-secondary)] hover:text-[var(--color-ink)] transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-secondary)] ${refreshing ? '' : ''}`}
              title="Manual workspace synchronization"
              aria-label="Force manual workspace synchronization"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[var(--color-secondary)] ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          }
        >
          <div className="space-y-2.5">
            {/* Global Network status */}
            <div className="flex items-center justify-between p-2 rounded bg-[var(--color-page)]/40 border border-[var(--color-divider)]/40">
              <span className="text-[10px] font-mono text-[var(--color-secondary)] uppercase tracking-wider">Networking State</span>
              {isOffline ? (
                <span className="flex items-center gap-1 text-[9px] font-mono font-semibold uppercase text-[var(--color-warning)] bg-[var(--color-warning-surface)] border border-[var(--color-warning)] px-1.5 py-0.5 rounded tracking-wider">
                  <WifiOff className="w-3 h-3" />
                  <span>Offline</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[9px] font-mono font-semibold uppercase text-[var(--color-success)] bg-[var(--color-success-surface)] border border-[var(--color-success)] px-1.5 py-0.5 rounded tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success-surface)] glow-dot" />
                  <span>Online</span>
                </span>
              )}
            </div>

            {/* Service heartbeats */}
            {serviceStatus.length > 0 ? (
              <div className="space-y-1.5" role="list">
                {serviceStatus.map((srv) => (
                  <div
                    key={srv.provider}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--color-card)]/10 transition-colors"
                    role="listitem"
                  >
                    <span className="text-xs font-semibold text-[var(--color-secondary)]">{getProviderLabel(srv.provider)}</span>
                    <div className="flex items-center gap-1.5">
                      {srv.status === 'connected' ? (
                        <span className="text-[8px] font-mono font-semibold uppercase text-[var(--color-success)] bg-[var(--color-success-surface)] px-1.5 py-0.5 rounded tracking-wider flex items-center gap-1">
                          <Check className="w-2.5 h-2.5 text-[var(--color-success)]" />
                          <span>OK</span>
                        </span>
                      ) : srv.status === 'warning' ? (
                        <span className="text-[8px] font-mono font-semibold uppercase text-[var(--color-warning)] bg-[var(--color-warning-surface)] px-1.5 py-0.5 rounded tracking-wider flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 text-[var(--color-warning)]" />
                          <span>Attention</span>
                        </span>
                      ) : (
                        <span className="text-[8px] font-mono font-semibold uppercase text-[var(--color-warning)] bg-[var(--color-warning-surface)] px-1.5 py-0.5 rounded tracking-wider flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5 text-[var(--color-warning)]" />
                          <span>Unlinked</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-[10px] text-[var(--color-secondary)] italic">No system heartbeats mapped</p>
              </div>
            )}

            {/* Sync Timestamp footer */}
            <div className="text-right text-[8px] font-mono text-[var(--color-secondary)] mt-3">
              Last Sync: {lastUpdated || 'N/A'}
            </div>
          </div>
        </EntranceHallCard>
      </div>
    </div>
  );
};
