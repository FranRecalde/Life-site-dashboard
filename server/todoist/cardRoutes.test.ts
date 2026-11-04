import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTodoistCardRouter } from './cardRoutes';

test('private card boundary: authentication, connection, project labels and sanitized upstream failures', async () => {
  let connected = true, status = 0, reads = 0;
  const app = express();
  app.use('/api/todoist/card', (req,res,next) => req.headers.authorization === 'Bearer fixture' ? next() : res.status(401).json({ error: 'Unauthenticated' }), createTodoistCardRouter({
    configured: () => connected,
    tasks: async () => { reads++; if(status) throw Object.assign(new Error('sensitive-upstream-body'), {status}); return [{id:'one',projectId:'inbox',title:'Private task'}] as any; },
    projects: async () => [{id:'inbox',name:'Inbox',inbox_project:true}],
  }));
  const server = app.listen(0,'127.0.0.1'); await new Promise<void>(resolve => server.once('listening',resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/todoist/card`;
  const get = () => fetch(url,{headers:{Authorization:'Bearer fixture'}});
  try {
    assert.equal((await fetch(url)).status,401); assert.equal(reads,0);
    const response = await get(); assert.equal(response.headers.get('cache-control'),'private, no-store');
    const body = await response.json(); assert.equal(body.data.inboxProjectId,'inbox'); assert.equal(body.data.tasks[0].projectName,'Inbox');
    status=401; const rejected = await get(); assert.equal(rejected.status,401); assert.equal((await rejected.json()).todoistError,true);
    status=429; const limited = await get(); assert.equal(limited.status,502); assert.ok(!JSON.stringify(await limited.json()).includes('sensitive-upstream-body'));
    connected=false; const empty = (await (await get()).json()).data; assert.equal(empty.connected,false); assert.deepEqual(empty.tasks,[]);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
});
