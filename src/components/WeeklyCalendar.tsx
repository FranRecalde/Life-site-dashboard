import React from 'react';
import { CalendarEvent } from '../types';
import { eventsOnDay, weekDates } from './calendarWorkflow';

export function WeeklyCalendar({ date, firstDay, events, hourHeight, onDateChange, onOpenEvent, onSlotClick }: {
  date: Date;
  firstDay?: 'monday' | 'sunday';
  events: CalendarEvent[];
  hourHeight: number;
  onDateChange: (date: Date) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onSlotClick?: (date: Date, hour: string) => void;
}) {
  const days = weekDates(date, firstDay);
  const moveWeek = (offset: number) => onDateChange(new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset));
  const columns = 'grid grid-cols-[64px_repeat(7,minmax(0,1fr))]';
  const eventButton = (event: CalendarEvent, day?: Date) => (
    <button key={event.id} onClick={() => onOpenEvent(event)} className="block w-full p-1 text-left rounded bg-[var(--color-card-raised)] border-l-2 border-[var(--color-control)] text-xs break-words">
      {!event.allDay && <span className="block font-mono text-[10px]">
        {day && new Date(event.start) < day ? 'Continues' : new Date(event.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        {' – '}{new Date(event.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
      </span>}
      {event.title}
    </button>
  );
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <button onClick={() => moveWeek(-7)} className="text-xs p-2">← Previous week</button>
      <p className="text-sm font-semibold">{days[0].toLocaleDateString('en-GB')} – {days[6].toLocaleDateString('en-GB')}</p>
      <button onClick={() => moveWeek(7)} className="text-xs p-2">Next week →</button>
    </div>
    <div className="overflow-auto max-h-[70vh] border border-[var(--color-divider)] rounded-lg" aria-label="Weekly calendar, full day">
      <div className="min-w-[800px]">
        <div className={`${columns} sticky top-0 z-10 bg-[var(--color-card)]`}>
          <span className="p-2 text-xs">Time</span>
          {days.map(day => <span key={day.toISOString()} className="p-2 text-xs font-semibold border-l border-[var(--color-divider)]">{day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>)}
        </div>
        <div className={`${columns} border-t border-[var(--color-divider)]`}>
          <span className="p-2 text-xs">All day</span>
          {days.map(day => <div key={day.toISOString()} className="p-1 border-l border-[var(--color-divider)] space-y-1">
            {eventsOnDay(events, day).filter(event => event.allDay).map(event => eventButton(event))}
          </div>)}
        </div>
        {Array.from({ length: 24 }, (_, hour) => (
          <div key={hour} data-calendar-hour={hour} style={{ minHeight: hourHeight }} className={`${columns} border-t border-[var(--color-divider)]`}>
            <span className="sticky left-0 bg-[var(--color-card)] p-1 text-[10px] leading-4 font-mono text-[var(--color-secondary)]">{String(hour).padStart(2, '0')}:00</span>
            {days.map(day => {
              const matches = eventsOnDay(events, day).filter(event => !event.allDay && (new Date(event.start) < day ? hour === 0 : new Date(event.start).getHours() === hour));
              return <div key={day.toISOString()} className="p-1 border-l border-[var(--color-divider)] space-y-1">
                {matches.map(event => eventButton(event, day))}
                {matches.length === 0 && onSlotClick && <button aria-label={`Add event ${day.toLocaleDateString('en-GB')} ${String(hour).padStart(2, '0')}:00`} onClick={() => onSlotClick(day, `${String(hour).padStart(2, '0')}:00`)} style={{ minHeight: hourHeight - 9 }} className="w-full h-full hover:bg-[var(--color-card-raised)] rounded" />}
              </div>;
            })}
          </div>
        ))}
        <div className="p-2 border-t border-[var(--color-divider)] text-xs font-mono">24:00</div>
      </div>
    </div>
  </div>;
}
