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
    <section className="col-span-1 lg:col-span-6 bg-white dark:bg-[#131b2e] rounded-xl border border-[#eaedff] dark:border-[#283044] shadow-sm p-4 sm:p-6 overflow-hidden flex flex-col h-full min-h-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 flex-wrap">
        <div className="flex justify-between items-center w-full sm:w-auto">
          <div>
            <h3 className="font-display text-lg font-bold text-[#00288e] dark:text-white">TODAY'S AGENDA</h3>
            <p className="text-xs text-[#757684] mt-0.5">Google Calendar Events Overview</p>
          </div>
          <button
            id="add-event-header-btn"
            onClick={onAddEventClick}
            className="sm:hidden flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-[#00288e] dark:bg-[#00288e] hover:bg-[#1e40af] dark:hover:bg-[#1e40af] rounded-lg transition-colors cursor-pointer shrink-0 ml-4"
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
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#00288e] dark:bg-[#00288e] hover:bg-[#1e40af] dark:hover:bg-[#1e40af] rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Event</span>
          </button>

          {/* Calendars Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              id="calendars-dropdown-toggle"
              onClick={() => setShowCalendarsDropdown(!showCalendarsDropdown)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#00288e] dark:text-[#a8b8ff] hover:bg-[#faf8ff] dark:hover:bg-[#0c1322]/60 border border-[#eaedff] dark:border-[#283044] rounded-lg transition-colors cursor-pointer"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>Calendars ({activeSelectedCalendarIds.length})</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            {showCalendarsDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded-lg shadow-lg z-50 p-3 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#eaedff] dark:border-[#283044]">
                  <span className="text-xs font-bold text-[#131b2e] dark:text-white uppercase tracking-wider">Visible Calendars</span>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSelectAllCalendars}
                      className="text-[10px] font-bold text-[#00288e] dark:text-[#a8b8ff] hover:underline cursor-pointer"
                    >
                      All
                    </button>
                    <span className="text-[10px] text-[#757684]">|</span>
                    <button
                      onClick={handleClearAllCalendars}
                      className="text-[10px] font-bold text-[#00288e] dark:text-[#a8b8ff] hover:underline cursor-pointer"
                    >
                      None
                    </button>
                  </div>
                </div>

                {googleCalendarsLoading && (
                  <div className="text-center py-2 text-xs text-[#757684]">
                    Loading calendars...
                  </div>
                )}

                {!googleCalendarsLoading && googleCalendars.length === 0 && (
                  <div className="text-center py-2 text-xs text-[#757684]">
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
                          className="flex items-center gap-2 px-1.5 py-1 hover:bg-[#faf8ff] dark:hover:bg-[#0c1322]/40 rounded cursor-pointer transition-colors select-none text-left"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleCalendar(cal.id)}
                            className="h-3.5 w-3.5 text-[#00288e] dark:text-[#a8b8ff] rounded border-gray-300 dark:border-gray-600 focus:ring-[#00288e] dark:focus:ring-offset-gray-900 cursor-pointer"
                          />
                          {cal.backgroundColor && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: cal.backgroundColor }}
                            />
                          )}
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate flex-1">
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
          <div className="flex gap-2 bg-[#faf8ff] dark:bg-[#0c1322] p-1 rounded-lg border border-[#eaedff] dark:border-[#283044]/80">
            {(['day', 'week', 'month'] as const).map(view => (
              <button
                key={view}
                onClick={() => setCalendarView(view)}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-colors cursor-pointer ${
                  calendarView === view
                    ? 'bg-white dark:bg-[#131b2e] text-[#00288e] dark:text-white shadow-sm'
                    : 'text-[#757684]'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeSelectedCalendarIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[#eaedff] dark:border-[#283044] rounded-lg bg-[#faf8ff] dark:bg-[#0c1322]/20">
          <Calendar className="h-8 w-8 text-[#757684]/60 mb-3" />
          <p className="text-sm font-semibold text-[#131b2e] dark:text-white">No calendars selected</p>
          <p className="text-xs text-[#757684] mt-1 text-center">Use the "Calendars" dropdown above to select calendars to display in the {activeTab} view.</p>
        </div>
      ) : (
        <>
          {/* Default Day View - Focused 12-hour grid (Phase 7.6) */}
          {calendarView === 'day' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2 gap-2">
                <button 
                  onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setDate(currentCalendarDate.getDate() - 1)))}
                  className="text-xs font-semibold text-[#00288e] dark:text-white hover:underline shrink-0 cursor-pointer"
                >
                  <span className="hidden sm:inline">← Previous Day</span>
                  <span className="sm:hidden">← Prev</span>
                </button>
                <p className="text-xs sm:text-sm font-bold tracking-tight text-center px-1 truncate min-w-0">
                  {currentCalendarDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <button 
                  onClick={() => setCurrentCalendarDate(new Date(currentCalendarDate.setDate(currentCalendarDate.getDate() + 1)))}
                  className="text-xs font-semibold text-[#00288e] dark:text-white hover:underline shrink-0 cursor-pointer"
                >
                  <span className="hidden sm:inline">Next Day →</span>
                  <span className="sm:hidden">Next →</span>
                </button>
              </div>

              <div className="border border-[#eaedff] dark:border-[#283044] rounded-lg divide-y divide-[#eaedff] dark:divide-[#283044] max-h-96 overflow-y-auto">
                {workingHoursList.map(hour => {
                  const matchedEvents = activeDayEvents.filter(e => {
                    if (e.allDay) return false;
                    const startHourStr = new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit' }) + ':00';
                    return startHourStr === hour;
                  });

                  return (
                    <div key={hour} className="flex min-h-[4rem] group hover:bg-[#faf8ff] dark:hover:bg-[#0c1322]/40 transition-colors">
                      <div className="w-16 flex justify-center items-start pt-2 text-[10px] font-extrabold text-[#757684] font-mono border-r border-[#eaedff] dark:border-[#283044]/40 shrink-0">
                        {hour}
                      </div>
                      <div
                        id={`slot-${hour}`}
                        onClick={matchedEvents.length === 0 && onSlotClick ? () => onSlotClick(currentCalendarDate, hour) : undefined}
                        className={`flex-1 p-2 flex flex-col gap-1.5 justify-center min-w-0 ${matchedEvents.length === 0 ? 'cursor-pointer hover:bg-[#faf8ff] dark:hover:bg-[#0c1322]/20' : ''}`}
                      >
                        {matchedEvents.length === 0 ? (
                          <span className="text-xs text-[#757684] opacity-30 select-none group-hover:opacity-60 transition-opacity">No scheduled events (click to add)</span>
                        ) : (
                          matchedEvents.map(event => (
                            <div
                              key={event.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(event);
                              }}
                              className="bg-[#f2f3ff] dark:bg-[#1a2c4d] border-l-4 border-[#00288e] dark:border-[#a8b8ff] p-2 rounded cursor-pointer hover:shadow-sm transition-shadow text-left min-w-0"
                            >
                              <p className="text-xs font-semibold text-[#131b2e] dark:text-white truncate">{event.title}</p>
                              <p className="text-[10px] text-[#757684] mt-0.5 font-mono">
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
                <div key="bottom-boundary" className="flex min-h-[2.5rem] bg-[#faf8ff] dark:bg-[#0c1322]/40 transition-colors">
                  <div className="w-16 flex justify-center items-center text-[10px] font-extrabold text-[#757684] font-mono border-r border-[#eaedff] dark:border-[#283044]/40 shrink-0">
                    {settings?.calendar?.workingHoursEnd || '00:00'}
                  </div>
                  <div className="flex-1 p-2 flex items-center min-w-0">
                    <span className="text-[10px] text-[#757684] opacity-40 select-none font-semibold uppercase tracking-wider">End of Day</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Week view */}
          {calendarView === 'week' && (
            <div className="text-center py-4">
              <p className="text-xs font-bold text-[#757684] mb-3">7-DAY WEEK VIEW</p>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="grid grid-cols-7 gap-2 border border-[#eaedff] dark:border-[#283044] rounded-lg p-3 bg-[#faf8ff] dark:bg-[#0c1322] min-w-[700px]">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - d.getDay() + (i + 1)); // start from monday
                    const dateStr = d.toISOString().split('T')[0];
                    const eventsForDay = filteredData?.calendarEvents.filter(e => e.start.startsWith(dateStr)) || [];

                    return (
                      <div key={i} className="bg-white dark:bg-[#131b2e] rounded p-2 min-h-[8rem] border border-[#eaedff] dark:border-[#283044]/60 min-w-0">
                        <p className="text-[10px] font-extrabold text-[#757684] font-mono truncate">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</p>
                        <div className="space-y-1 mt-2 text-left">
                          {eventsForDay.slice(0, 3).map(e => (
                            <div key={e.id} onClick={(evt) => { evt.stopPropagation(); setSelectedEvent(e); }} className="bg-[#f2f3ff] dark:bg-[#1a2c4d] text-[10px] p-1 rounded cursor-pointer truncate font-medium" title={e.title}>
                              {e.title}
                            </div>
                          ))}
                          {eventsForDay.length > 3 && (
                            <p className="text-[9px] text-[#757684] text-center mt-1 font-bold">+{eventsForDay.length - 3} more</p>
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
              <p className="text-xs font-bold text-[#757684] mb-3">MONTH GRID VIEW</p>
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="grid grid-cols-7 gap-2 border border-[#eaedff] dark:border-[#283044] rounded-lg p-3 bg-[#faf8ff] dark:bg-[#0c1322] min-w-[700px]">
                  {Array.from({ length: 28 }).map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - 14 + i);
                    const dateStr = d.toISOString().split('T')[0];
                    const eventsForDay = filteredData?.calendarEvents.filter(e => e.start.startsWith(dateStr)) || [];

                    return (
                      <div key={i} className="bg-white dark:bg-[#131b2e] rounded p-1.5 min-h-[5rem] border border-[#eaedff] dark:border-[#283044]/60 text-left min-w-0">
                        <span className="text-[9px] font-extrabold text-[#757684] font-mono">{d.getDate()}</span>
                        <div className="space-y-0.5 mt-1 truncate">
                          {eventsForDay.slice(0, 2).map(e => (
                            <div key={e.id} onClick={(evt) => { evt.stopPropagation(); setSelectedEvent(e); }} className="bg-[#f2f3ff] dark:bg-[#1a2c4d] text-[9px] p-0.5 rounded cursor-pointer truncate font-medium" title={e.title}>
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
