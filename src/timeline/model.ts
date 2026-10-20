import seed from './seed.json';

export type WorkBlock = { id: string; taskId?: string; date: string; start: string; end: string; kind: string; activeMinutes: number; note: string };
export type ProjectPlan = { id: string; name: string; target: string; fallback: string | null; priority: boolean; selected: boolean };
export type TimelineTask = { id: string; title: string; projectId: string; projectName: string; parentId?: string; description: string; labels: string[]; due: any; deadline: any; recurring: boolean; completed: boolean; url?: string; missing?: boolean };
export type ScheduleChange = { taskId: string; title: string; oldDue: string; newDate: string; newTime: string; status?: string };
export type TimelinePlan = {
  revision: number; timezone: string; projects: ProjectPlan[]; blocks: WorkBlock[];
  windows: { name: string; start: string; end: string; computerOnly: boolean }[];
  computerOnlyDates: string[]; started: Record<string, boolean>;
  occurrences: Record<string, TimelineTask>;
  preview?: { id: string; revision: number; changes: ScheduleChange[] };
};
export type TimelineSnapshot = { plan: TimelinePlan; availableProjects: { id: string; name: string }[]; tasks: TimelineTask[]; todayTasks: TimelineTask[]; today: string; historyComplete: boolean; warnings: string[]; fetchedAt: string; connectionError?: string; verificationNotice?: string };
export const groupingIds = new Set(seed.tasks.filter(t => t.grouping).map(t => t.id));
export const initialPlan = (): TimelinePlan => ({ revision: 0, timezone: 'Europe/London', projects: structuredClone(seed.projects), blocks: structuredClone(seed.blocks), windows: [{ name: 'Morning', start: '06:30', end: '09:30', computerOnly: true }, { name: 'Daytime', start: '09:30', end: '15:30', computerOnly: false }, { name: 'Evening', start: '18:00', end: '20:00', computerOnly: false }], computerOnlyDates: ['2026-10-26', '2026-10-29'], started: {}, occurrences: {} });
export const localDate = (now = new Date(), timezone = 'Europe/London') => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const mins = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const duration = (minutes: number) => `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)}h ` : ''}${minutes % 60 ? `${minutes % 60}m` : minutes ? '' : '0m'}`.trim();
export const dueKey = (due: any) => JSON.stringify(due || null);
// Todoist API v1 migration reference specifies this canonical task URL format.
export const taskURL = (id: string) => `https://app.todoist.com/app/task/${encodeURIComponent(id)}`;
export const taskDate = (task: TimelineTask, timezone: string) => {
  const value = task.due?.datetime || task.due?.date;
  return value && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? localDate(new Date(value), timezone) : value?.slice(0, 10);
};
export function progress(tasks: TimelineTask[], completeHistory: boolean) {
  const unique = [...new Map(tasks.filter(t => !groupingIds.has(t.id)).map(t => [t.id, t])).values()];
  const done = unique.filter(t => t.completed && !t.missing).length;
  const available = completeHistory && !unique.some(t => t.missing);
  return { done, total: unique.length, percent: available && unique.length ? Math.round(done / unique.length * 100) : null };
}
export function reconcile(raw: any[], history: any[], projects: any[], plan: TimelinePlan, now = new Date()) {
  const inbox = new Set(projects.filter(p => p.is_inbox_project || p.inbox_project || p.is_inbox).map(p => p.id));
  const accessible = new Map(projects.filter(p => !inbox.has(p.id) && !p.is_deleted && !p.is_archived).map(p => [p.id, p]));
  const normalize = (t: any, completed: boolean): TimelineTask => ({ id: t.task_id || t.id, title: t.content || 'Completed task', projectId: t.project_id, projectName: accessible.get(t.project_id)?.name || 'Unknown project', parentId: t.parent_id, description: t.description || '', labels: t.labels || [], due: t.due || null, deadline: t.deadline || null, recurring: !!(t.due?.is_recurring || t.recurring), completed, url: t.url || taskURL(t.task_id || t.id) });
  const all = new Map<string, TimelineTask>();
  for (const t of history) if (accessible.has(t.project_id)) all.set(t.task_id || t.id, normalize(t, true));
  for (const t of raw) if (accessible.has(t.project_id)) all.set(t.id, normalize(t, false));
  const selected = new Set(plan.projects.filter(p => p.selected && accessible.has(p.id)).map(p => p.id));
  const tasks = [...all.values()].filter(t => selected.has(t.projectId));
  for (const t of seed.tasks) if (plan.projects.some(p => p.id === t.projectId && p.selected) && !inbox.has(t.projectId) && !all.has(t.id)) tasks.push({ ...t, description: '', labels: [], projectName: accessible.get(t.projectId)?.name || plan.projects.find(p => p.id === t.projectId)?.name || '', due: null, deadline: null, recurring: false, completed: false, missing: true });
  const today = localDate(now, plan.timezone);
  const todayTasks = [...all.values()].filter(t => !selected.has(t.projectId) && !t.completed && taskDate(t, plan.timezone) === today);
  // External recurring completions remain acknowledged even after their due advances.
  for (const t of history) {
    const task = all.get(t.task_id || t.id);
    if (!task?.recurring || !t.completed_at || localDate(new Date(t.completed_at), plan.timezone) !== today) continue;
    const list = selected.has(task.projectId) ? tasks : todayTasks;
    const index = list.findIndex(v => v.id === task.id);
    if (index >= 0) list.splice(index, 1);
    list.push({ ...task, completed: true, due: { ...task.due, date: today, datetime: undefined } });
  }
  for (const [key, task] of Object.entries(plan.occurrences)) {
    if (key === `${today}:${task.id}` && accessible.has(task.projectId)) {
      const list = selected.has(task.projectId) ? tasks : todayTasks;
      const index = list.findIndex(t => t.id === task.id);
      if (index >= 0) list.splice(index, 1);
      list.push(task);
    }
  }
  return { tasks, todayTasks, today, availableProjects: [...accessible.values()].map(p => ({ id: p.id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name)), missingProjects: plan.projects.filter(p => p.selected && !accessible.has(p.id)).map(p => p.name) };
}

// Wall-clock values remain local; Intl resolves DST separately for each date.
export function zonedISO(date: string, time: string, timezone: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
    const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const wall = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
    instant += target - wall;
  }
  if (localDate(new Date(instant), timezone) !== date) throw new Error('Invalid local date/time');
  return new Date(instant).toISOString();
}

const orderChains = [
  ['6hpVFwHH3XM9j7xV', '6hpVFwHJhxPgRH7V', '6hpVFvV7hhgVV6cV'],
  ['6hpVHPcVWmq6c7QQ', '6hpVHPXF5QR5VmMx'], ['6hpVHPcVWmq6c7QQ', '6hpVHPfGCv6HxWXQ'],
  ['6hpVGWrXFW86m2MQ', '6hpVGWxfPQ4hVrCQ', '6hpVGX23fWg6m5cx', '6hpVGWxxQP66gPRx', '6hpVGX5hm65CM3GQ', '6hpVGX4grGp6Pf2Q', '6hpVGX3qmRP9pFcQ'],
];
export function conflicts(plan: TimelinePlan): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const blocks = [...plan.blocks].sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  for (const b of blocks) {
    const tag = `${b.date} ${b.start} ${b.note || b.taskId || b.id}`;
    if (ids.has(b.id)) errors.push(`${tag}: duplicate block ID`);
    ids.add(b.id);
    if (!/^\d{4}-\d\d-\d\d$/.test(b.date) || Number.isNaN(Date.parse(b.date)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end) || mins(b.end) <= mins(b.start) || !Number.isFinite(b.activeMinutes) || b.activeMinutes < 0 || b.activeMinutes > mins(b.end) - mins(b.start)) { errors.push(`${tag}: invalid date, time or active estimate`); continue; }
    if (!['Computer', 'In person', 'Visit', 'Teaching', 'Buffer', 'Wait'].includes(b.kind)) errors.push(`${tag}: unknown work type`);
    // Reservations can include a lunch break; they still block active work.
    if (b.kind !== 'Wait' && !plan.windows.some(w => b.start >= w.start && b.end <= w.end && (!w.computerOnly || b.kind === 'Computer' || b.kind === 'Buffer'))) errors.push(`${tag}: outside a suitable work window`);
    if (plan.computerOnlyDates.includes(b.date) && !['Computer', 'Buffer', 'Wait'].includes(b.kind)) errors.push(`${tag}: computer-only date`);
    const task = seed.tasks.find(t => t.id === b.taskId);
    const project = task && plan.projects.find(p => p.id === task.projectId);
    if (project && b.date > (project.fallback && project.fallback > project.target ? project.fallback : project.target)) errors.push(`${tag}: after project target${project.fallback ? ' / fallback' : ''}. Adjust the block or project target.`);
    if (b.taskId?.startsWith('6hpVPr') && !['2026-10-20', '2026-10-22', '2026-10-24'].includes(b.date)) errors.push(`${tag}: Spanish is only on 20, 22 and 24 October`);
    if (b.taskId?.startsWith('6hpVPr') && (b.start !== '18:00' || b.end !== '18:30')) errors.push(`${tag}: Spanish is 18:00–18:30`);
  }
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length && blocks[j].date === blocks[i].date; j++) {
    if (blocks[j].start < blocks[i].end && blocks[i].start < blocks[j].end) errors.push(`${blocks[i].date}: ${blocks[i].start}–${blocks[i].end} (${blocks[i].taskId || blocks[i].note}) overlaps ${blocks[j].start}–${blocks[j].end} (${blocks[j].taskId || blocks[j].note})`);
  }
  for (const chain of orderChains) for (let i = 1; i < chain.length; i++) {
    const before = blocks.filter(b => b.taskId === chain[i - 1]).map(b => `${b.date}T${b.end}`).sort().at(-1);
    const after = blocks.filter(b => b.taskId === chain[i]).map(b => `${b.date}T${b.start}`).sort()[0];
    if (before && after && before > after) errors.push(`Dependency: finish ${chain[i - 1]} before ${chain[i]}`);
  }
  return errors;
}
