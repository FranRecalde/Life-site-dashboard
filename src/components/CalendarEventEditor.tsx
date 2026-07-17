import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Loader2, AlertTriangle, Calendar, MapPin, AlignLeft, Edit3, Trash2, ExternalLink, Clock } from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import { CalendarEvent } from '../types';

interface CalendarEventEditorProps {
  event: CalendarEvent;
  onClose: () => void;
  onSuccess: () => void;
}

type EditorMode = 'view' | 'edit' | 'confirm_delete';

export const CalendarEventEditor: React.FC<CalendarEventEditorProps> = ({
  event,
  onClose,
  onSuccess,
}) => {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Keyboard and Focus Management
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

  // Check recurring status
  const isRecurring = useMemo(() => {
    return !!event.recurringEventId || !!event.isRecurring;
  }, [event]);

  // Check if editable
  const isEditable = useMemo(() => {
    return !!event.canEdit && !isRecurring;
  }, [event, isRecurring]);

  // Mode state: starts at 'view'
  const [mode, setMode] = useState<EditorMode>('view');

  // Parse Initial Date & Time Fields Safely
  const initialDateStr = useMemo(() => {
    if (!event.start) return '';
    if (event.start.includes('T')) {
      return event.start.split('T')[0];
    }
    return event.start; // YYYY-MM-DD
  }, [event]);

  const initialStartTimeStr = useMemo(() => {
    if (!event.start || !event.start.includes('T')) return '09:00';
    return event.start.split('T')[1].substring(0, 5); // HH:MM
  }, [event]);

  const initialEndTimeStr = useMemo(() => {
    if (!event.end) return '10:00';
    if (!event.end.includes('T')) return '10:00';
    return event.end.split('T')[1].substring(0, 5); // HH:MM
  }, [event]);

  // Form Fields State (Preserved in memory on failure)
  const [title, setTitle] = useState(event.title || '');
  const [description, setDescription] = useState(event.description || '');
  const [location, setLocation] = useState(event.location || '');
  const [date, setDate] = useState(initialDateStr);
  const [startTime, setStartTime] = useState(initialStartTimeStr);
  const [endTime, setEndTime] = useState(initialEndTimeStr);
  const [allDay, setAllDay] = useState(!!event.allDay);

  // Async States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Helper to format dates for human consumption
  const formatEventDate = (isoOrDateStr: string, allDayVal: boolean): string => {
    try {
      const d = new Date(isoOrDateStr);
      if (allDayVal) {
        return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      }
      return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + 
             ' at ' + 
             d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoOrDateStr;
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim()) {
      setErrorMsg('Title is required.');
      return;
    }

    // End time constraint validation
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

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      let finalStart: string;
      let finalEnd: string;

      if (allDay) {
        finalStart = date;
        // Calculate exclusive end date (next day)
        const d = new Date(`${date}T00:00:00`);
        d.setDate(d.getDate() + 1);
        const nextYear = d.getFullYear();
        const nextMonth = String(d.getMonth() + 1).padStart(2, '0');
        const nextDay = String(d.getDate()).padStart(2, '0');
        finalEnd = `${nextYear}-${nextMonth}-${nextDay}`;
      } else {
        const startDt = new Date(`${date}T${startTime}`);
        const endDt = new Date(`${date}T${endTime}`);
        finalStart = startDt.toISOString();
        finalEnd = endDt.toISOString();
      }

      // Safeguard: Ensure calendar ID is matching and passed correctly
      await ApiClient.updateCalendarEvent(event.calendarId, event.id, {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        start: finalStart,
        end: finalEnd,
        allDay,
      });

      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update calendar event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      // Safeguard: Ensure calendar ID is matching and passed correctly
      await ApiClient.deleteCalendarEvent(event.calendarId, event.id);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete calendar event.');
      // Switch back to view mode so they can see the error
      setMode('view');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 max-sm:p-0">
      <div 
        className="bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:max-h-[85vh] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Calendar Event Dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#eaedff] dark:border-[#283044]/40 shrink-0">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-[#00288e] dark:text-[#a8b8ff]" />
            <h2 className="font-display text-xs sm:text-sm font-bold text-[#00288e] dark:text-white uppercase tracking-wider">
              {mode === 'edit' ? 'Edit Event' : mode === 'confirm_delete' ? 'Delete Event' : 'Event Details'}
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50 flex items-center justify-center min-w-[44px] min-h-[44px]"
            aria-label="Close dialog"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Container */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2 text-xs font-semibold text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* VIEW MODE */}
          {mode === 'view' && (
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-extrabold uppercase bg-[#f2f3ff] text-[#00288e] dark:bg-[#1a2c4d] dark:text-[#a8b8ff] px-2.5 py-1 rounded">
                  {event.calendarName || 'Google Calendar'}
                </span>
                <h3 className="text-base sm:text-lg font-bold font-display text-[#131b2e] dark:text-white mt-2 leading-tight">
                  {event.title}
                </h3>
              </div>

              {/* Date, Location, Description */}
              <div className="space-y-3 border-t border-[#eaedff] dark:border-[#283044]/40 pt-4 text-xs">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[#757684] font-semibold">Time</p>
                    <p className="font-bold text-[#131b2e] dark:text-white mt-0.5">
                      {formatEventDate(event.start, !!event.allDay)}
                      {!event.allDay && ` - ${new Date(event.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                </div>

                {event.location && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[#757684] font-semibold">Location</p>
                      <p className="font-semibold text-gray-800 dark:text-gray-200 mt-0.5">{event.location}</p>
                    </div>
                  </div>
                )}

                {event.description && (
                  <div className="flex items-start gap-2.5">
                    <AlignLeft className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[#757684] font-semibold">Description</p>
                      <p className="text-gray-600 dark:text-gray-300 mt-0.5 whitespace-pre-wrap leading-relaxed">
                        {event.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Status and Protections */}
              <div className="pt-4 border-t border-[#eaedff] dark:border-[#283044]/40">
                {isRecurring ? (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-lg flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-amber-800 dark:text-amber-300">
                      <p className="font-bold uppercase tracking-wider text-[10px]">Recurring Event Protection</p>
                      <p className="mt-1">Recurring events must currently be changed in Google Calendar.</p>
                    </div>
                  </div>
                ) : !event.canEdit ? (
                  <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 p-3 rounded-lg flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <div className="text-gray-600 dark:text-gray-400">
                      <p className="font-bold uppercase tracking-wider text-[10px]">Read-only Event</p>
                      <p className="mt-1">This event is read-only. Editing or deleting is disabled on Life Site.</p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Actions Footer */}
              <div className="flex flex-col gap-2.5 border-t border-[#eaedff] dark:border-[#283044]/40 pt-4 mt-6">
                <div className="flex items-center justify-between gap-4">
                  {event.htmlLink && (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00288e] dark:text-[#a8b8ff] hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open in Google Calendar</span>
                    </a>
                  )}

                  <div className="flex gap-2 ml-auto">
                    {isEditable && (
                      <>
                        <button
                          type="button"
                          onClick={() => setMode('confirm_delete')}
                          className="px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setMode('edit')}
                          className="px-4 py-2 bg-[#00288e] text-white rounded-lg text-xs font-bold hover:bg-[#1e40af] transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </>
                    )}
                    {!isEditable && (
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-[#eaedff] dark:border-[#283044] rounded-lg text-xs font-bold text-[#757684] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      >
                        Close
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EDIT MODE */}
          {mode === 'edit' && (
            <form onSubmit={handleUpdateSubmit} className="space-y-4 text-left">
              {/* Title */}
              <div className="space-y-1">
                <label htmlFor="edit-event-title" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                  Title *
                </label>
                <input
                  id="edit-event-title"
                  type="text"
                  required
                  disabled={isSubmitting}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Brainstorming session"
                  className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                  autoFocus
                />
              </div>

              {/* Date Input */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="edit-event-date" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                    Date
                  </label>
                  <input
                    id="edit-event-date"
                    type="date"
                    required
                    disabled={isSubmitting}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                  />
                </div>

                {/* All-day toggle */}
                <div className="flex items-end pb-2.5">
                  <label className="flex items-center gap-2.5 px-1 py-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      disabled={isSubmitting}
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
                    <label htmlFor="edit-event-start" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                      Start Time
                    </label>
                    <input
                      id="edit-event-start"
                      type="time"
                      required={!allDay}
                      disabled={isSubmitting}
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="edit-event-end" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider">
                      End Time
                    </label>
                    <input
                      id="edit-event-end"
                      type="time"
                      required={!allDay}
                      disabled={isSubmitting}
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                    />
                  </div>
                </div>
              )}

              {/* Location */}
              <div className="space-y-1">
                <label htmlFor="edit-event-location" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                  <span>Location</span>
                </label>
                <input
                  id="edit-event-location"
                  type="text"
                  disabled={isSubmitting}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Meeting Room 4 / Zoom Link"
                  className="w-full text-xs bg-white dark:bg-[#131b2e] border border-[#eaedff] dark:border-[#283044] rounded p-2.5 focus:outline-none focus:border-[#00288e] text-gray-900 dark:text-white disabled:opacity-60"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label htmlFor="edit-event-description" className="block text-[10px] font-bold text-[#757684] uppercase tracking-wider flex items-center gap-1">
                  <AlignLeft className="w-3 h-3 text-gray-400 shrink-0" />
                  <span>Description</span>
                </label>
                <textarea
                  id="edit-event-description"
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                  onClick={() => {
                    setErrorMsg(null);
                    setMode('view');
                  }}
                  className="px-4 py-2 border border-[#eaedff] dark:border-[#283044] rounded-lg text-xs font-bold text-[#757684] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Back to Details
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-[#00288e] text-white rounded-lg text-xs font-bold hover:bg-[#1e40af] disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* CONFIRM DELETE MODE */}
          {mode === 'confirm_delete' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-2 text-red-500">
                <Trash2 className="w-6 h-6 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                  Confirm Delete Event
                </h3>
                <p className="text-xs text-[#757684] dark:text-gray-400 max-w-xs mx-auto leading-relaxed">
                  Are you sure you want to permanently delete this calendar event? This action cannot be undone.
                </p>
              </div>

              {/* Explicit Event Details Display */}
              <div className="bg-red-50/50 dark:bg-red-950/10 border border-red-100/50 dark:border-red-900/20 rounded-xl p-4 text-left space-y-2 max-w-sm mx-auto">
                <div>
                  <span className="text-[9px] font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wide">Event Title</span>
                  <p className="text-xs font-bold text-gray-900 dark:text-white mt-0.5">{event.title}</p>
                </div>
                <div>
                  <span className="text-[9px] font-extrabold text-red-600 dark:text-red-400 uppercase tracking-wide">Event Date</span>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
                    {formatEventDate(event.start, !!event.allDay)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center gap-2.5 pt-4 mt-6 max-w-sm mx-auto">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setMode('view')}
                  className="px-4 py-2 border border-[#eaedff] dark:border-[#283044] rounded-lg text-xs font-bold text-[#757684] hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer flex-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleDeleteSubmit}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer flex-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Yes, Delete Event</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
