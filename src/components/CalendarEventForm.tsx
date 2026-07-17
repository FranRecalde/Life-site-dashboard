import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, AlertTriangle, Calendar, MapPin, AlignLeft } from 'lucide-react';
import { ApiClient } from '../services/apiClient';

interface CalendarEventFormProps {
  onClose: () => void;
  googleCalendars: any[];
  connectionsStatus: any;
  initialDate?: Date;
  initialStartHour?: string; // HH:MM
  onSuccess: () => void;
}

export const CalendarEventForm: React.FC<CalendarEventFormProps> = ({
  onClose,
  googleCalendars,
  connectionsStatus,
  initialDate,
  initialStartHour,
  onSuccess,
}) => {
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

  // Filter writable calendars
  const writableCalendars = useMemo(() => {
    return googleCalendars.filter(cal => cal.accessRole === 'owner' || cal.accessRole === 'writer');
  }, [googleCalendars]);

  const defaultCalendarId = useMemo(() => {
    const primary = writableCalendars.find(c => c.primary || c.id === 'primary');
    return primary ? primary.id : (writableCalendars[0]?.id || '');
  }, [writableCalendars]);

  // Format local date YYYY-MM-DD safely
  const formatLocalDate = (dateObj: Date): string => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const initialDateStr = useMemo(() => {
    return initialDate ? formatLocalDate(initialDate) : formatLocalDate(new Date());
  }, [initialDate]);

  // Determine initial start/end times
  const defaultStartTime = initialStartHour || '09:00';
  const defaultEndTime = useMemo(() => {
    if (initialStartHour) {
      const startHourInt = parseInt(initialStartHour.split(':')[0], 10);
      const endHourInt = startHourInt + 1;
      return endHourInt === 24 ? '23:59' : `${endHourInt.toString().padStart(2, '0')}:00`;
    }
    return '10:00';
  }, [initialStartHour]);

  // Form Fields State
  const [title, setTitle] = useState('');
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [date, setDate] = useState(initialDateStr);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  // Sync default calendar ID if list loads late
  useEffect(() => {
    if (!calendarId && defaultCalendarId) {
      setCalendarId(defaultCalendarId);
    }
  }, [defaultCalendarId, calendarId]);

  // Request & Error States
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check write availability
  const isWriteUnavailable = useMemo(() => {
    return (
      !connectionsStatus ||
      connectionsStatus.googleConnected !== 'connected' ||
      !connectionsStatus.googleWriteAuthorized ||
      writableCalendars.length === 0
    );
  }, [connectionsStatus, writableCalendars]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!title.trim()) {
      setErrorMsg('Title is required.');
      return;
    }

    if (!calendarId) {
      setErrorMsg('Please select a writable calendar.');
      return;
    }

    // End time check if not all-day
    if (!allDay) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;
      if (endMinutes <= startMinutes) {
        setErrorMsg('End time must be after start time.');
        return;
      }
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      let finalStart: string;
      let finalEnd: string;

      if (allDay) {
        finalStart = date;
        // Calculate exclusive end date (next day) safely
        const d = new Date(`${date}T00:00:00`);
        d.setDate(d.getDate() + 1);
        const nextYear = d.getFullYear();
        const nextMonth = String(d.getMonth() + 1).padStart(2, '0');
        const nextDay = String(d.getDate()).padStart(2, '0');
        finalEnd = `${nextYear}-${nextMonth}-${nextDay}`;
      } else {
        // Build Local Dates using input string, convert to ISO
        const startDt = new Date(`${date}T${startTime}`);
        const endDt = new Date(`${date}T${endTime}`);
        finalStart = startDt.toISOString();
        finalEnd = endDt.toISOString();
      }

      await ApiClient.createCalendarEvent(calendarId, {
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        start: finalStart,
        end: finalEnd,
        allDay,
      });

      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create calendar event.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 max-sm:p-0">
      <div 
        className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-h-[85vh] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#eaedff] dark:border-[#283044]/40 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#00288e] dark:text-[#a8b8ff]" />
            <h2 className="font-display text-base sm:text-lg font-bold text-[#00288e] dark:text-white uppercase tracking-wider">
              Add Calendar Event
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer flex items-center justify-center min-w-[44px] min-h-[44px]"
            aria-label="Close dialog"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-4">
          {isWriteUnavailable ? (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-4 rounded-xl max-w-sm">
                <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-1">
                  Write Access Unavailable
                </h3>
                <p className="text-xs text-[#757684] dark:text-gray-400 leading-relaxed">
                  Reconnect Google Calendar to enable adding and editing events. Go to Settings → Connections and reconnect your account.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-[#eaedff] dark:border-[#283044] rounded-lg text-xs font-bold text-[#757684] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handleFormSubmit} className="space-y-4">
              {errorMsg && (
                <div className="flex items-start gap-2 text-xs font-semibold text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1">
                <label htmlFor="event-title" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                  Title *
                </label>
                <input
                  id="event-title"
                  type="text"
                  required
                  disabled={isSaving}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Brainstorming session"
                  className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                  autoFocus
                />
              </div>

              {/* Writable Calendar Selection */}
              <div className="space-y-1">
                <label htmlFor="event-calendar" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                  Calendar *
                </label>
                <select
                  id="event-calendar"
                  required
                  disabled={isSaving}
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60 cursor-pointer"
                >
                  {writableCalendars.map((cal) => (
                    <option key={cal.id} value={cal.id}>
                      {cal.summary} {cal.primary ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="event-date" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                    Date
                  </label>
                  <input
                    id="event-date"
                    type="date"
                    required
                    disabled={isSaving}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                  />
                </div>

                {/* All-day toggle */}
                <div className="flex items-end pb-2.5 sm:pb-3">
                  <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      disabled={isSaving}
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                      className="h-4 w-4 text-[#00288e] dark:text-[#a8b8ff] rounded border-gray-300 dark:border-gray-600 focus:ring-[#00288e] dark:focus:ring-offset-gray-900 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-[#757684] dark:text-gray-300 uppercase tracking-wider">
                      All-day event
                    </span>
                  </label>
                </div>
              </div>

              {/* Start & End Times */}
              {!allDay && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="event-start" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                      Start Time
                    </label>
                    <input
                      id="event-start"
                      type="time"
                      required={!allDay}
                      disabled={isSaving}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="event-end" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                      End Time
                    </label>
                    <input
                      id="event-end"
                      type="time"
                      required={!allDay}
                      disabled={isSaving}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                    />
                  </div>
                </div>
              )}

              {/* Location */}
              <div className="space-y-1">
                <label htmlFor="event-location" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                  <span>Location</span>
                </label>
                <input
                  id="event-location"
                  type="text"
                  disabled={isSaving}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Meeting Room 4 / Zoom Link"
                  className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label htmlFor="event-description" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider flex items-center gap-1">
                  <AlignLeft className="w-3 h-3 text-gray-400 shrink-0" />
                  <span>Description</span>
                </label>
                <textarea
                  id="event-description"
                  disabled={isSaving}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Event details or agenda..."
                  rows={3}
                  className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white resize-none disabled:opacity-60 leading-relaxed"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2.5 border-t border-[#eaedff] dark:border-[#283044]/40 pt-4 mt-6">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={onClose}
                  className="px-4 py-2 border border-[#eaedff] dark:border-[#283044] rounded-lg text-xs font-bold text-[#757684] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-[#00288e] text-white rounded-lg text-xs font-bold hover:bg-[#1e40af] disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Add Event</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
