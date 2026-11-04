// Local-only browser verification. Never loads server.ts, .env or real credentials.
import express from 'express';
import { createServer } from 'vite';
import { createTodoistCardRouter } from '../server/todoist/cardRoutes';
import type { TodoistTask } from '../src/types';
const today = new Date().toLocaleDateString('en-CA');
const seed: TodoistTask[] = [
  { id:'fixture-today', provider:'todoist', title:'Plan today — a long task title that wraps cleanly in a very small floating window without hiding the completion checkbox', dueDate:today, labels:[], isOverdue:false, projectId:'inbox' },
  { id:'fixture-repeat', provider:'todoist', title:'Daily reading (recurring test task)', dueDate:'2026-01-01', recurring:true, labels:[], isOverdue:true, projectId:'reading' },
  { id:'fixture-inbox', provider:'todoist', title:'Undated inbox task', labels:[], isOverdue:false, projectId:'inbox' },
];
let tasks = structuredClone(seed), mode = 'connected';
const app = express(); app.use(express.json());
app.get('/__card', async (_req,res) => res.type('html').send(await vite.transformIndexHtml('/__card', '<html><head><title>Task card verification</title></head><body><div id="root"></div><script type="module" src="/scripts/todoistCardPreview.tsx"></script></body></html>')));
app.post('/api/fixture', (req,res) => { mode = req.body.mode; tasks = mode === 'empty' ? [] : structuredClone(seed); res.json({success:true}); });
app.use('/api', (_req,res,next) => mode === 'expired' ? res.status(401).json({error:'Session expired'}) : next());
app.use('/api/todoist/card', createTodoistCardRouter({
  configured: () => mode !== 'disconnected',
  tasks: async () => { if (mode === 'read-error') throw new Error('Fixture read error'); return tasks; },
  projects: async () => [{id:'inbox',name:'Inbox',inbox_project:true},{id:'reading',name:'Reading'}],
}));
app.post('/api/tasks/:id/complete', async (req,res) => {
  await new Promise(resolve=>setTimeout(resolve,400));
  if(mode === 'completion-error') return res.status(502).json({error:'Test completion failed. Task kept; try again.'});
  tasks = tasks.flatMap(t=>t.id !== req.params.id ? [t] : t.recurring ? [{...t,dueDate:'2099-01-01'}] : []);
  res.json({success:true});
});
const vite = await createServer({server:{middlewareMode:true},appType:'spa'}); app.use(vite.middlewares);
app.listen(3106,'127.0.0.1',()=>console.log('Fixture preview: http://localhost:3106/__card (test data only)'));
