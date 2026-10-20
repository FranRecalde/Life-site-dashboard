import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createTimelineRouter } from './timelineRoutes';
import { defaultSettings } from '../storage/localSettingsStore';
import seed from '../../src/timeline/seed.json';

async function fixture(run: (f: any) => Promise<void>) {
  let settings = structuredClone(defaultSettings);
  let active: any[] = seed.tasks.map(t => ({ id: t.id, content: t.title, project_id: t.projectId }));
  let history: any[] = [];
  let fail = false;
  let failRead = false;
  const selections: string[][] = [];
  const projects = [...seed.projects.map(p => ({ id: p.id, name: p.name })), { id: 'extra', name: 'Additional project' }, { id: 'inbox', name: 'Renamed Inbox', is_inbox_project: true }, { id: 'archived', name: 'Archived', is_archived: true }];
  active.push({ id: 'extra-task', content: 'New project task', project_id: 'extra' });
  const calls: any[] = [];
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => { req.user = req.headers['x-user'] || 'one'; next(); });
  app.use('/api/timeline', createTimelineRouter({
    now: () => new Date('2026-10-20T09:00:00Z'),
    loadSettings: async () => structuredClone(settings), saveSettings: async s => { settings = structuredClone(s); },
    read: async ids => { selections.push(ids); if (failRead) throw Object.assign(new Error('Expired credential'), { status: 401 }); return { active, history, projects, historyComplete: true }; },
    command: async (taskId, action, payload: any) => {
      calls.push({ taskId, action, payload });
      if (fail) throw new Error('Controlled Todoist failure');
      const task = active.find(t => t.id === taskId);
      if (action === 'complete') { active = active.filter(t => t.id !== taskId); history.push({ ...task, task_id: taskId }); }
      else if (action === 'reopen') {
        const completed = history.find(t => t.task_id === taskId);
        active.push({ ...completed, id: taskId }); history = history.filter(t => t.task_id !== taskId);
      } else task.due = { date: payload.due_datetime };
    },
  }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/timeline`;
  const req = async (path = '', method = 'GET', body?: any, user = 'one') => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'x-user': user }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json() };
  };
  try { await run({ req, calls, selections, setFail: (v: boolean) => fail = v, setFailRead: (v: boolean) => failRead = v, active: () => active }); }
  finally { await new Promise<void>(r => server.close(() => r())); }
}

test('live-boundary fixture: start persists by owner; completion failure never completes; repeat completion is deduplicated', () => fixture(async ({ req, calls, setFail }) => {
  const id = seed.tasks[0].id;
  assert.equal((await req(`/tasks/${id}/start`, 'POST')).status, 200);
  assert.equal((await req()).body.plan.started[id], true);
  assert.equal((await req('', 'GET', undefined, 'two')).body.plan.started[id], undefined);
  setFail(true);
  assert.equal((await req(`/tasks/${id}/complete`, 'POST')).status, 500);
  assert.equal((await req()).body.tasks.find(t => t.id === id).completed, false);
  setFail(false); calls.length = 0;
  const results = await Promise.all([req(`/tasks/${id}/complete`, 'POST'), req(`/tasks/${id}/complete`, 'POST')]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(calls.length, 1);
  assert.equal((await req()).body.tasks.find(t => t.id === id).completed, true);
  assert.equal((await req(`/tasks/${id}/reopen`, 'POST')).status, 200);
  assert.equal((await req()).body.tasks.find(t => t.id === id).completed, false);
  assert.equal((await req(`/tasks/not-owned/complete`, 'POST')).status, 404);
}));
test('preview never writes, stale due rejects, partial failures retry without rewriting successes', () => fixture(async ({ req, calls, setFail, active }) => {
  const preview = (await req('/preview', 'POST')).body;
  assert.equal(calls.length, 0); assert.ok(preview.changes.length > 0);
  const staleId = preview.changes[0].taskId;
  active().find(t => t.id === staleId).due = { date: '2026-11-01' };
  setFail(true);
  const failed = await req('/apply', 'POST', { previewId: preview.id });
  assert.equal(failed.status, 200);
  assert.match(failed.body.changes.find(c => c.taskId === staleId).status, /Conflict/);
  assert.ok(failed.body.changes.some(c => c.status.startsWith('Failed')));
  assert.ok(!calls.some(c => c.taskId === staleId));
  setFail(false); calls.length = 0;
  const success = await req('/apply', 'POST', { previewId: preview.id });
  assert.ok(success.body.changes.some(c => c.status === 'Applied'));
  assert.ok(calls.every(c => Object.keys(c.payload).join() === 'due_datetime'));
  calls.length = 0;
  await req('/apply', 'POST', { previewId: preview.id }); assert.equal(calls.length, 0);
  const nextPreview = (await req('/preview', 'POST')).body;
  assert.ok(nextPreview.changes.every(c => c.taskId === staleId));
  assert.equal((await req('/apply', 'POST', { previewId: 'forged' })).status, 409);
}));
test('draft writes reject stale revisions, conflicts and foreign task IDs', () => fixture(async ({ req }) => {
  const plan = (await req()).body.plan;
  assert.equal((await req('/plan', 'PUT', { ...plan, revision: -1 })).status, 409);
  const bad = { ...plan, blocks: [...plan.blocks, { ...plan.blocks[0], id: 'new', taskId: 'foreign', date: '2027-01-01' }] };
  assert.equal((await req('/plan', 'PUT', bad)).status, 403);
  assert.equal((await req('/plan', 'PUT', { ...plan, blocks: [...plan.blocks, { ...plan.blocks[0], id: 'dup' }] })).status, 409);
}));
test('expired Todoist connection retains an honest draft and blocks all task writes', () => fixture(async ({ req, setFailRead, calls }) => {
  setFailRead(true);
  const snapshot = (await req()).body;
  assert.match(snapshot.connectionError, /Reconnect/);
  assert.equal(snapshot.historyComplete, false);
  assert.equal(snapshot.tasks.length, 78);
  assert.ok(snapshot.tasks.every(t => t.missing && !t.completed));
  const start = await req(`/tasks/${seed.tasks[0].id}/start`, 'POST');
  assert.equal(start.status, 503); assert.match(start.body.error, /Reconnect/);
  assert.equal((await req('/preview', 'POST')).status, 503);
  assert.equal(calls.length, 0);
}));

test('project picker accepts only accessible projects, loads their tasks/history and persists per owner', () => fixture(async ({ req, calls, selections }) => {
  const before = (await req()).body;
  assert.ok(before.availableProjects.some(p => p.id === 'extra'));
  assert.ok(!before.availableProjects.some(p => ['inbox', 'archived'].includes(p.id)));
  for (const projectId of ['inbox', 'archived', 'foreign']) assert.equal((await req('/projects', 'POST', { projectId, target: '2026-11-30', revision: 0 })).status, 403);
  assert.equal((await req('/projects', 'POST', { projectId: 'extra', target: '2026-02-30', revision: 0 })).status, 400);
  const added = await req('/projects', 'POST', { projectId: 'extra', target: '2026-11-30', revision: 0 });
  assert.equal(added.status, 200);
  assert.equal(added.body.plan.projects.length, before.plan.projects.length + 1);
  assert.ok(added.body.tasks.some(t => t.id === 'extra-task'));
  assert.ok(selections.at(-1).includes('extra'));
  assert.equal((await req('', 'GET', undefined, 'two')).body.plan.projects.length, before.plan.projects.length);
  assert.equal((await req('/projects', 'POST', { projectId: 'extra', target: '2026-11-30', revision: 0 })).status, 409);
  const repeated = await req('/projects', 'POST', { projectId: 'extra', target: '2026-11-30', revision: 1 });
  assert.equal(repeated.body.plan.projects.length, before.plan.projects.length + 1);
  assert.equal(calls.length, 0);
}));

test('moving a block persists its date and preserves time; conflicts and stale moves do not change saved data', () => fixture(async ({ req, calls }) => {
  await req('/projects', 'POST', { projectId: 'extra', target: '2026-11-30', revision: 0 });
  let plan = (await req()).body.plan;
  const block = { id: 'drag-test', taskId: 'extra-task', date: '2026-11-02', start: '10:00', end: '10:30', activeMinutes: 30, kind: 'Computer', note: 'Drag test' };
  let saved = await req('/plan', 'PUT', { ...plan, blocks: [...plan.blocks, block] });
  assert.equal(saved.status, 200);
  plan = saved.body;
  const moved = { ...plan, blocks: plan.blocks.map(b => b.id === block.id ? { ...b, date: '2026-11-03' } : b) };
  saved = await req('/plan', 'PUT', moved);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.blocks.find(b => b.id === block.id), { ...block, date: '2026-11-03' });
  assert.equal((await req('/plan', 'PUT', moved)).status, 409);
  const conflict = { ...saved.body, blocks: [...saved.body.blocks, { ...block, id: 'collision', date: '2026-11-03' }] };
  assert.equal((await req('/plan', 'PUT', conflict)).status, 409);
  assert.deepEqual((await req()).body.plan, saved.body);
  assert.equal(calls.length, 0);
}));
