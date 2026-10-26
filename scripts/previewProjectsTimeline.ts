/** Isolated integration-test harness for the existing app; no external API calls. */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { createTimelineRouter } from '../server/timeline/timelineRoutes';
import { LocalSettingsStore } from '../server/storage/localSettingsStore';
import seed from '../src/timeline/seed.json';
import { localDate } from '../src/timeline/model';

const port = Number(process.env.TIMELINE_PREVIEW_PORT || 3100);
const directory = path.resolve(`data/timeline-verification-${port}`);
fs.mkdirSync(directory, { recursive: true });
const file = path.join(directory, 'tasks.json');
const store = new LocalSettingsStore(path.join(directory, 'settings.json'));
const baseTasks: any[] = seed.tasks.map(t => ({ id: t.id, project_id: t.projectId, content: t.title, labels: ['personal'], description: 'Controlled verification fixture — this is not live Todoist data.', due: null, url: undefined }));
const parent = (ids: string[], parentId: string) => ids.forEach(id => { baseTasks.find(t => t.id === id).parent_id = parentId; });
parent(['6hpVFwMG8WgvCx8V', '6hpVFwHH3XM9j7xV', '6hpVFwHJhxPgRH7V'], '6hpVFvVMWCw3HFr3');
parent(['6hpVFwJ6rPHP8MC3', '6hpVFwM3WggCjFmV', '6hpVFwMMfHV2M4pV', '6hpVFwP6HVQQWgc3'], '6hpVFvhxR862pFX3');
parent(['6hpVHQ85XH9CmgmV', '6hpVHQ9MXwwwWcJ3'], '6hpVHPQr4CVpfxP3');
parent(['6hpVHQ89W2797M73'], '6hpVHPPfqR6pGFR3');
baseTasks[0].due = { date: localDate() };
baseTasks.push({ id: 'fixture-today', content: 'Review today’s priorities', project_id: 'fixture-other', labels: ['personal'], due: { date: localDate() } });
baseTasks.push({ id: 'fixture-recurring', content: 'Daily planning check', project_id: 'fixture-other', labels: [], due: { date: localDate(), is_recurring: true } });
baseTasks.push({ id: 'fixture-inbox', content: 'THIS INBOX TASK MUST NEVER APPEAR', project_id: 'fixture-inbox', due: { date: localDate() } });
const state: { active: any[]; history: any[]; deletedProjects?: string[] } = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { active: baseTasks, history: [] };
const persist = () => fs.writeFileSync(file, JSON.stringify(state));
let failNext = false;
const projects = [...seed.projects.map(p => ({ id: p.id, name: p.name, created_at: '2026-10-20T00:00:00Z' })), { id: 'fixture-other', name: 'Other project' }, { id: 'fixture-inbox', name: 'Renamed Inbox', is_inbox_project: true }];
const app = express(); app.use(express.json());
app.use((req: any, _res, next) => { req.user = 'local-verification-fixture'; next(); });
app.get('/api/auth/me', (_req, res) => res.json({ authenticated: true, username: 'LOCAL TEST FIXTURE' }));
app.get('/api/settings', async (_req, res) => res.json(await store.loadSettings()));
app.get('/api/settings/connections', (_req, res) => res.json({}));
app.get('/api/dashboard', async (_req, res) => res.json({ settings: await store.loadSettings(), tasks: state.active.map(t => ({ id: t.id, provider: 'todoist', title: t.content, projectId: t.project_id, parentId: t.parent_id, dueDate: t.due?.date, labels: t.labels || [], isOverdue: false })), todoistProjects: [], calendarEvents: [], notes: [], todoistSections: [], todoistInboxProjectId: 'fixture-inbox', serviceStatus: [{ provider: 'todoist', status: 'connected' }], fetchedAt: new Date().toISOString() }));
app.get('/api/habits', (_req, res) => res.json([]));
app.post('/api/verification/fail-next', (_req, res) => { failNext = true; res.json({ fixture: true }); });
app.use('/api/timeline', createTimelineRouter({
  loadSettings: async () => store.loadSettings(), saveSettings: s => store.saveSettings(s),
  read: async () => ({ ...state, projects: projects.filter(p => !state.deletedProjects?.includes(p.id)), historyComplete: true, verificationNotice: 'LOCAL VERIFICATION FIXTURE · This is the existing app with controlled test data. Actions here never change your real Todoist account.' }),
  deleteProject: async id => {
    if (failNext) { failNext = false; throw new Error('Controlled Todoist deletion failure. No project was changed. Retry.'); }
    state.deletedProjects = [...(state.deletedProjects || []), id];
    state.active = state.active.filter(t => t.project_id !== id);
    state.history = state.history.filter(t => t.project_id !== id);
    persist();
  },
  command: async (id, action, payload: any) => {
    if (failNext) { failNext = false; throw new Error('Controlled Todoist failure. No task was changed. Retry.'); }
    const task = state.active.find(t => t.id === id);
    if (action === 'complete' && task) {
      state.history.push({ ...task, task_id: id, completed_at: new Date().toISOString() });
      if (task.due?.is_recurring) task.due = { ...task.due, date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) };
      else state.active = state.active.filter(t => t.id !== id);
    } else if (action === 'reopen') {
      const completed = state.history.find(t => t.task_id === id);
      if (!completed) throw new Error('Completed task unavailable.');
      state.active.push({ ...completed, id }); state.history = state.history.filter(t => t.task_id !== id);
    } else if (task) task.due = { date: payload.due_datetime, datetime: payload.due_datetime };
    persist();
  },
}));
// Clearly label fixtures inside the app; source component is identical to localhost:3000.
app.use('/api', (_req, res) => res.json([]));
const vite = await createViteServer({ server: { middlewareMode: true, hmr: { port: port + 21000 } }, appType: 'spa' });
app.use(vite.middlewares);
app.listen(port, '127.0.0.1', () => console.log(`Controlled fixture preview: http://localhost:${port}/?view=projects-timeline — no live Todoist writes`));
