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
  let failSave = false;
  let failSaveAfterDelete = false;
  const selections: string[][] = [];
  let projects: any[] = [...seed.projects.map(p => ({ id: p.id, name: p.name })), { id: 'extra', name: 'Additional project' }, { id: 'inbox', name: 'Renamed Inbox', is_inbox_project: true }, { id: 'archived', name: 'Archived', is_archived: true }];
  active.push({ id: 'extra-task', content: 'New project task', project_id: 'extra' });
  const calls: any[] = [];
  const app = express(); app.use(express.json());
  app.use((req: any, _res, next) => { req.user = req.headers['x-user'] || 'one'; next(); });
  app.use('/api/timeline', createTimelineRouter({
    now: () => new Date('2026-10-20T09:00:00Z'),
    loadSettings: async () => structuredClone(settings), saveSettings: async s => { if (failSave) throw new Error('Controlled save failure'); settings = structuredClone(s); },
    read: async ids => { selections.push(ids); if (failRead) throw Object.assign(new Error('Expired credential'), { status: 401 }); return { active, history, projects, historyComplete: true }; },
    deleteProject: async projectId => {
      calls.push({ projectId, action: 'deleteProject' });
      if (fail) throw new Error('Controlled Todoist failure');
      projects = projects.filter(p => p.id !== projectId);
      active = active.filter(t => t.project_id !== projectId);
      history = history.filter(t => t.project_id !== projectId);
      if (failSaveAfterDelete) failSave = true;
    },
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
  try { await run({ req, calls, selections, setFail: (v: boolean) => fail = v, setFailRead: (v: boolean) => failRead = v, active: () => active, projects: () => projects, setFailSave: (v: boolean) => failSave = v, setFailSaveAfterDelete: (v: boolean) => failSaveAfterDelete = v, setPlan: (plan: any) => { const key = Object.keys(settings.timelineByUser || {})[0]; if (key) settings.timelineByUser[key] = plan; }, settings: () => settings }); }
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
test('draft writes reject stale revisions, malformed records and foreign task IDs', () => fixture(async ({ req }) => {
  const plan = (await req()).body.plan;
  assert.equal((await req('/plan', 'PUT', { ...plan, revision: -1 })).status, 409);
  const bad = { ...plan, blocks: [...plan.blocks, { ...plan.blocks[0], id: 'new', taskId: 'foreign', date: '2027-01-01' }] };
  assert.equal((await req('/plan', 'PUT', bad)).status, 403);
  assert.equal((await req('/plan', 'PUT', { ...plan, blocks: [...plan.blocks, { ...plan.blocks[0] }] })).status, 409);
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

test('draft moves persist even with overlap warnings; stale moves and Todoist apply stay protected', () => fixture(async ({ req, calls }) => {
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
  const overlapping = await req('/plan', 'PUT', conflict);
  assert.equal(overlapping.status, 200);
  assert.deepEqual((await req()).body.plan, overlapping.body);
  const preview = await req('/preview', 'POST');
  assert.equal(preview.status, 409); assert.match(preview.body.error, /overlaps/);
  assert.equal((await req('/apply', 'POST', { previewId: 'old-preview' })).status, 409);
  assert.equal(calls.length, 0);
}));

test('clip regression: painting and plumber blocks can be dropped onto occupied days beyond targets', () => fixture(async ({ req, calls }) => {
  let plan = (await req()).body.plan;
  for (const [id, date] of [['6hpVFvV7hhgVV6cV-1', '2026-10-24'], ['6hpVFwP6HVQQWgc3-0', '2026-10-25']]) {
    // Paint has split blocks; choose its Friday occurrence by task identity.
    const source = id.startsWith('6hpVFvV7') ? plan.blocks.find(b => b.taskId === '6hpVFvV7hhgVV6cV' && b.date === '2026-10-23') : plan.blocks.find(b => b.id === id);
    assert.ok(source);
    const result = await req('/plan', 'PUT', { ...plan, blocks: plan.blocks.map(b => b.id === source.id ? { ...b, date } : b) });
    assert.equal(result.status, 200);
    plan = result.body;
    assert.deepEqual(plan.blocks.find(b => b.id === source.id), { ...source, date });
    assert.equal((await req()).body.plan.blocks.find(b => b.id === source.id).date, date);
  }
  assert.equal((await req('/preview', 'POST')).status, 409);
  const bad = { ...plan, blocks: plan.blocks.map((b, i) => i === 0 ? { ...b, activeMinutes: -1 } : b) };
  assert.equal((await req('/plan', 'PUT', bad)).status, 409);
  assert.equal(calls.length, 0);
}));

test('project deletion rejects invalid targets/confirmation/revision and protects Inbox and subprojects', () => fixture(async ({ req, calls, projects }) => {
  const plan = (await req()).body.plan;
  const p = plan.projects[0];
  const body = { revision: plan.revision, confirmName: p.name };
  const path = `/projects/${p.id}`;
  assert.equal((await req('/projects/foreign', 'DELETE', body)).status, 404);
  assert.equal((await req(path, 'DELETE', { ...body, confirmName: 'wrong' })).status, 409);
  assert.equal((await req(path, 'DELETE', { ...body, revision: -1 })).status, 409);
  projects()[0].is_inbox_project = true;
  assert.equal((await req(path, 'DELETE', body)).status, 403);
  delete projects()[0].is_inbox_project;
  projects().push({ id: 'child', parent_id: p.id, name: 'Child' });
  assert.equal((await req(path, 'DELETE', body)).status, 409);
  assert.equal(calls.length, 0);
}));

test('project deletion removes completed project, blocks, starts, occurrences and preview; preserves others across reads', () => fixture(async ({ req, calls }) => {
  let snapshot = (await req()).body;
  const p = snapshot.plan.projects[0];
  const ids = seed.tasks.filter(t => t.projectId === p.id).map(t => t.id);
  await req(`/tasks/${ids[0]}/start`, 'POST');
  for (const id of ids) await req(`/tasks/${id}/complete`, 'POST');
  await req('/preview', 'POST');
  snapshot = (await req()).body;
  const before = snapshot.plan;
  const result = await req(`/projects/${p.id}`, 'DELETE', { revision: before.revision, confirmName: p.name });
  assert.equal(result.status, 200);
  for (let i = 0; i < 2; i++) {
    const after = (await req()).body;
    assert.deepEqual(after.plan.projects, before.projects.filter(v => v.id !== p.id));
    assert.deepEqual(after.plan.blocks, before.blocks.filter(b => !ids.includes(b.taskId)));
    assert.ok(!after.tasks.some(t => t.projectId === p.id));
    assert.ok(ids.every(id => !(id in after.plan.started)));
    assert.equal(after.plan.preview, undefined);
    assert.equal(after.plan.revision, before.revision + 1);
  }
  assert.equal(calls.filter(c => c.action === 'deleteProject').length, 1);
  assert.equal((await req(`/projects/${p.id}`, 'DELETE', { revision: before.revision, confirmName: p.name })).status, 404);
}));

test('remote failure and unavailable connection preserve plan; partial local failure retries without another remote delete', () => fixture(async ({ req, calls, setFail, setFailRead, setFailSave, setFailSaveAfterDelete, active, setPlan, settings }) => {
  const before = (await req()).body.plan;
  const p = before.projects[1];
  // Materialize a plan and include a task created after the static seed.
  await req(`/tasks/${seed.tasks.find(t => t.projectId === p.id)!.id}/start`, 'POST');
  const saved = (await req()).body.plan;
  saved.blocks.push({ ...saved.blocks[0], id: 'dynamic-block', taskId: 'dynamic-task' });
  saved.occurrences['2026-10-20:dynamic-task'] = { id: 'dynamic-task', projectId: p.id };
  active().push({ id: 'dynamic-task', project_id: p.id, content: 'New task' });
  setPlan(saved);
  const body = { revision: saved.revision, confirmName: p.name };
  const path = `/projects/${p.id}`;
  setFailRead(true);
  assert.equal((await req(path, 'DELETE', body)).status, 401);
  assert.equal(calls.length, 0);
  setFailRead(false); setFail(true);
  assert.equal((await req(path, 'DELETE', body)).status, 500);
  const retained = (await req()).body.plan;
  assert.deepEqual(retained.blocks, saved.blocks);
  assert.deepEqual(retained.projects, saved.projects);
  setFail(false); setFailSave(true); calls.length = 0;
  assert.equal((await req(path, 'DELETE', body)).status, 500);
  assert.equal(calls.length, 0);
  setFailSave(false); setFailSaveAfterDelete(true);
  const partial = await req(path, 'DELETE', body);
  assert.equal(partial.status, 503);
  assert.match(partial.body.error, /Todoist project deleted/);
  setFailSave(false);
  assert.equal((await req(path, 'DELETE', body)).status, 200);
  assert.equal(calls.filter(c => c.action === 'deleteProject').length, 1);
  const after = (await req()).body.plan;
  assert.ok(!after.projects.some(v => v.id === p.id));
  assert.ok(!after.blocks.some(b => b.taskId === 'dynamic-task'));
  assert.equal(after.occurrences['2026-10-20:dynamic-task'], undefined);
  assert.equal(after.deletionTaskIds, undefined);
}));
