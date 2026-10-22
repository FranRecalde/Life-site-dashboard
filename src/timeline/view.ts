export type TimelineView = 'day' | 'week' | 'fortnight' | 'month';

// Calendar arithmetic uses UTC noon so browser timezone/DST cannot shift dates.
export const addDays = (date: string, count: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
};
export const rangeStart = (date: string, view: TimelineView) => view === 'month' ? `${date.slice(0, 7)}-01` : date;
export const rangeDays = (date: string, view: TimelineView) => view === 'month'
  ? new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate()
  : view === 'day' ? 1 : view === 'week' ? 7 : 14;
export const shiftRange = (date: string, view: TimelineView, direction: number) => {
  if (view !== 'month') return addDays(date, direction * rangeDays(date, view));
  const value = new Date(`${rangeStart(date, view)}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + direction);
  return value.toISOString().slice(0, 10);
};

// Reveal only the clipped part of a date; visible dates must not move the viewport.
export const revealDateScrollLeft = (scrollLeft: number, viewportWidth: number, pinnedWidth: number, dateLeft: number, dateWidth: number) => {
  if (dateLeft < scrollLeft + pinnedWidth) return Math.max(0, dateLeft - pinnedWidth);
  if (dateLeft + dateWidth > scrollLeft + viewportWidth) return dateLeft + dateWidth - viewportWidth;
  return scrollLeft;
};
