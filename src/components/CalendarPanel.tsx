import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Calendar, ChevronDown, Plus } from 'lucide-react';
import { DashboardSnapshot, CalendarEvent, UserSettings, DashboardContext } from '../types';

export interface CalendarPanelProps {
  activeTab: DashboardContext;
  filteredData: DashboardSnapshot | null;
  googleCalendars: any[];
  googleCalendarsLoading: boolean;
  activeSelectedCalendarIds: string[];
  handleToggleCalendar: (id: string) => void;
  handleSelectAllCalendars: () => void;
  handleClearAllCalendars: () => void;
  calendarView: 'day' | 'week' | 'month';
  setCalendarView: (view: 'day' | 'week' | 'month') => void;
  currentCalendarDate: Date;
  setCurrentCalendarDate: (date: Date) => void;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  settings: UserSettings | null;
  onAddEventClick?: () => void;
  onSlotClick?: (date: Date, hour: string) => void;
}

export const CalendarPanel: React.FC<CalendarPanelProps> = ({
  activeTab,
  filteredData,
  googleCalendars,
  googleCalendarsLoading,
  activeSelectedCalendarIds,
  handleToggleCalendar,
  handleSelectAllCalendars,
  handleClearAllCalendars,
  calendarView,
  setCalendarView,
  currentCalendarDate,
  setCurrentCalendarDate,
  setSelectedEvent,
  settings,
  onAddEventClick,
  onSlotClick,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showCalendarsDropdown, setShowCalendarsDropdown] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCalendarsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const activeDayEvents = useMemo(() => {
    if (!filteredData) return [];
    const dateStr = currentCalendarDate.toISOString().split('T')[0];
    return filteredData.calendarEvents.filter(e => e.start.startsWith(dateStr));
  }, [filteredData, currentCalendarDate]);

  const workingHoursList = useMemo(() => {
    let startHour = parseInt(settings?.calendar?.workingHoursStart?.split(':')[0] || '04', 10);
    let endHour = parseInt(settings?.calendar?.workingHoursEnd?.split(':')[0] || '00', 10);
    if (endHour === 0) {
      endHour = 24;
    }
    const hours = [];
    if (startHour >= endHour) {
      startHour = 4;
      endHour = 24;
    }
    for (let h = startHour; h < endHour; h++) {
      hours.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return hours;
  }, [settings]);

  return (
    <section className="col-span-1 lg:col-span-6 bg-[var(--color-card)] bg-[var(--color-card)] rounded-xl border border-[var(--color-divider)] border-[var(--color-divider)] shadow-sm p-4 sm:p-6 overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 flex-wrap">
        <div className="flex justify-between items-center w-full sm:w-auto">
          <div>
            <h3 className="font-display text-lg font-semibold text-[var(--color-control)] text-[var(--color-ink)]">TODAY'S AGENDA</h3>
            <p className="text-xs text-[var(--color-secondary)] mt-0.5">Google Calendar Events Overview</p>
          </div>
          <button
            id="add-event-header-btn"
            onClick={onAddEventClick}
            className="sm:hidden flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-ink)] bg-[var(--color-card-raised)] bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] rounded-lg transition-colors cursor-pointer shrink-0 ml-4"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Event</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Event Button (Desktop/Tablet) */}
          <button
            id="add-event-btn"
            onClick={onAddEventClick}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] bg-[var(--color-card-raised)] bg-[var(--color-card-raised)] hover:bg-[var(--color-card)] hover:bg-[var(--color-card)] rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Event</span>
          </button>

          {/* Calendars Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="calendars-dropdown-toggle"
              onClick={() => setShowCalendarsDropdown(!showCalendarsDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--color-control)] text-[var(--color-secondary)] hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)]/60 border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg transition-colors cursor-pointer"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Calendars ({activeSelectedCalendarIds.length})</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {showCalendarsDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-[var(--color-card)] bg-[var(--color-card)] border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg shadow-lg z-50 p-3 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--color-divider)] border-[var(--color-divider)]">
                  <span className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] uppercase tracking-wider">Visible Calendars</span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAllCalendars}
                      className="text-[10px] font-semibold text-[var(--color-control)] text-[var(--color-secondary)] hover:underline cursor-pointer"
                    >
                      All
                    </button>
                    <span className="text-[10px] text-[var(--color-secondary)]">|</span>
                    <button
                      onClick={handleClearAllCalendars}
                      className="text-[10px] font-semibold text-[var(--color-control)] text-[var(--color-secondary)] hover:underline cursor-pointer"
                    >
                      None
                    </button>
                  </div>
                </div>

                {googleCalendarsLoading && (
                  <div className="text-center py-2 text-xs text-[var(--color-secondary)]">
                    Loading calendars...
                  </div>
                )}

                {!googleCalendarsLoading && googleCalendars.length === 0 && (
                  <div className="text-center py-2 text-xs text-[var(--color-secondary)]">
                    No calendars found. Ensure Google is connected.
                  </div>
                )}

                {!googleCalendarsLoading && googleCalendars.length > 0 && (
                  <div className="space-y-2">
                    {googleCalendars.map(cal => {
                      const isSelected = activeSelectedCalendarIds.includes(cal.id);
                      return (
                        <label
                          key={cal.id}
                          className="flex items-center gap-2 px-1.5 py-1 hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)]/40 rounded cursor-pointer transition-colors select-none text-left"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCalendar(cal.id)}
                            className="h-3.5 w-3.5 text-[var(--color-control)] text-[var(--color-secondary)] rounded border-[var(--color-divider)] border-[var(--color-divider)] focus:ring-[var(--color-control)] focus:ring-offset-gray-900 cursor-pointer"
                          />
                          {cal.backgroundColor && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cal.backgroundColor }}
                            />
                          )}
                          <span className="text-xs font-normal text-[var(--color-ink)] text-[var(--color-secondary)] truncate flex-1">
                            {cal.summary}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Day/Week/Month Switcher */}
          <div className="flex gap-2 bg-[var(--color-card-raised)] bg-[var(--color-card)] p-1 rounded-lg border border-[var(--color-divider)] border-[var(--color-divider)]/80">
            {(['day', 'week', 'month'] as const).map(view => (
              <button
                key={view}
                onClick={() => setCalendarView(view)}
                className={`px-3 py-1 text-[10px] font-semibold uppercase rounded-md transition-colors cursor-pointer ${
                  calendarView === view
                    ? 'bg-[var(--color-card)] bg-[var(--color-card)] text-[var(--color-control)] text-[var(--color-ink)] shadow-sm'
                    : 'text-[var(--color-secondary)]'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeSelectedCalendarIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg bg-[var(--color-card-raised)] bg-[var(--color-card)]/20">
          <Calendar className="h-8 w-8 text-[var(--color-secondary)] mb-3" />
          <p className="text-sm font-semibold text-[var(--color-ink)] text-[var(--color-ink)]">No calendars selected</p>
          <p className="text-xs text-[var(--color-secondary)] mt-1 text-center">Use the "Calendars" dropdown above to select calendars to display in the {activeTab} view.</p>
        </div>
      ) : (
        <>
          {/* Default Day View - Focused 12-hour grid (Phase 7.6) */}
          {calendarView === 'day' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <button
                  onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setDate(currentCalendarDate.getDate() - 1)))}
                  className="text-xs font-semibold text-[var(--color-control)] text-[var(--color-ink)] hover:underline shrink-0 cursor-pointer"
                >
                  <span className="hidden sm:inline">← Previous Day</span>
                  <span className="sm:hidden">← Prev</span>
                </button>
                <p className="text-xs sm:text-sm font-semibold tracking-tight text-center px-1 truncate min-w-0">
                  {currentCalendarDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <button
                  onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setDate(currentCalendarDate.getDate() + 1)))}
                  className="text-xs font-semibold text-[var(--color-control)] text-[var(--color-ink)] hover:underline shrink-0 cursor-pointer"
                >
                  <span className="hidden sm:inline">Next Day →</span>
                  <span className="sm:hidden">Next →</span>
                </button>
              </div>

              <div className="border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg divide-y divide-[var(--color-divider)] divide-[var(--color-divider)] max-h-96 overflow-y-auto">
                {workingHoursList.map(hour => {
                  const matchedEvents = activeDayEvents.filter(e => {
                    if (e.allDay) return false;
                    const startHourStr = new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit' }) + ':00';
                    return startHourStr === hour;
                  });

                  return (
                    <div key={hour} className="flex min-h-[4rem] group hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)]/40 transition-colors">
                      <div className="w-16 flex justify-center items-start pt-2 text-[10px] font-semibold text-[var(--color-secondary)] font-mono border-r border-[var(--color-divider)] border-[var(--color-divider)]/40 shrink-0">
                        {hour}
                      </div>
                      <div
                        id={`slot-${hour}`}
                        onClick={matchedEvents.length === 0 && onSlotClick ? () => onSlotClick(currentCalendarDate, hour) : undefined}
                        className={`flex-1 p-2 flex flex-col gap-1.5 justify-center min-w-0 ${matchedEvents.length === 0 ? 'cursor-pointer hover:bg-[var(--color-card-raised)] hover:bg-[var(--color-card)]/20' : ''}`}
                      >
                        {matchedEvents.length === 0 ? (
                          <span className="text-xs text-[var(--color-secondary)]  select-none group-hover:opacity-60 transition-opacity">No scheduled events (click to add)</span>
                        ) : (
                          matchedEvents.map(event => (
                            <div
                              key={event.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                              }}
                              className="bg-[var(--color-card-raised)] bg-[var(--color-card)] border-l-4 border-[var(--color-control)] border-[var(--color-secondary)] p-2 rounded cursor-pointer hover:shadow-sm transition-shadow text-left min-w-0"
                            >
                              <p className="text-xs font-semibold text-[var(--color-ink)] text-[var(--color-ink)] truncate">{event.title}</p>
                              <p className="text-[10px] text-[var(--color-secondary)] mt-0.5 font-mono">
                                {new Date(event.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} - {new Date(event.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Bottom boundary row representing end of day / midnight */}
                <div key="bottom-boundary" className="flex min-h-[2.5rem] bg-[var(--color-card-raised)] bg-[var(--color-card)]/40 transition-colors">
                  <div className="w-16 flex justify-center items-center text-[10px] font-semibold text-[var(--color-secondary)] font-mono border-r border-[var(--color-divider)] border-[var(--color-divider)]/40 shrink-0">
                    {settings?.calendar?.workingHoursEnd || '00:00'}
                  </div>
                  <div className="flex-1 p-2 flex items-center min-w-0">
                    <span className="text-[10px] text-[var(--color-secondary)]  select-none font-semibold uppercase tracking-wider">End of Day</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Week view */}
          {calendarView === 'week' && (
            <div className="text-center py-4">
              <p className="text-xs font-semibold text-[var(--color-secondary)] mb-3">7-DAY WEEK VIEW</p>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="grid grid-cols-7 gap-2 border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg p-3 bg-[var(--color-card-raised)] bg-[var(--color-card)] min-w-[700px]">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - d.getDay() + (i + 1)); // start from monday
                    const dateStr = d.toISOString().split('T')[0];
                    const eventsForDay = filteredData?.calendarEvents.filter(e => e.start.startsWith(dateStr)) || [];

                    return (
                      <div key={i} className="bg-[var(--color-card)] bg-[var(--color-card)] rounded p-2 min-h-[8rem] border border-[var(--color-divider)] border-[var(--color-divider)]/60 min-w-0">
                        <p className="text-[10px] font-semibold text-[var(--color-secondary)] font-mono truncate">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</p>
                        <div className="space-y-1 mt-2 text-left">
                          {eventsForDay.slice(0, 3).map(e => (
                            <div key={e.id} onClick={(evt) => { evt.stopPropagation(); setSelectedEvent(e); }} className="bg-[var(--color-card-raised)] bg-[var(--color-card)] text-[10px] p-1 rounded cursor-pointer truncate font-normal" title={e.title}>
                              {e.title}
                            </div>
                          ))}
                          {eventsForDay.length > 3 && (
                            <p className="text-[9px] text-[var(--color-secondary)] text-center mt-1 font-semibold">+{eventsForDay.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Month view */}
          {calendarView === 'month' && (
            <div className="text-center py-4">
              <p className="text-xs font-semibold text-[var(--color-secondary)] mb-3">MONTH GRID VIEW</p>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="grid grid-cols-7 gap-2 border border-[var(--color-divider)] border-[var(--color-divider)] rounded-lg p-3 bg-[var(--color-card-raised)] bg-[var(--color-card)] min-w-[700px]">
                  {Array.from({ length: 28 }).map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - 14 + i);
                    const dateStr = d.toISOString().split('T')[0];
                    const eventsForDay = filteredData?.calendarEvents.filter(e => e.start.startsWith(dateStr)) || [];

                    return (
                      <div key={i} className="bg-[var(--color-card)] bg-[var(--color-card)] rounded p-1.5 min-h-[5rem] border border-[var(--color-divider)] border-[var(--color-divider)]/60 text-left min-w-0">
                        <span className="text-[9px] font-semibold text-[var(--color-secondary)] font-mono">{d.getDate()}</span>
                        <div className="space-y-0.5 mt-1 truncate">
                          {eventsForDay.slice(0, 2).map(e => (
                            <div key={e.id} onClick={(evt) => { evt.stopPropagation(); setSelectedEvent(e); }} className="bg-[var(--color-card-raised)] bg-[var(--color-card)] text-[9px] p-0.5 rounded cursor-pointer truncate font-normal" title={e.title}>
                              {e.title}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
