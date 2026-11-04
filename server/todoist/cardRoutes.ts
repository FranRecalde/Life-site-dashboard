import { Router } from 'express';
import type { TodoistTask } from '../../src/types';

// The existing integration belongs to the site's sole configured login.
export function createTodoistCardRouter(deps: {
  configured: () => boolean;
  tasks: () => Promise<TodoistTask[]>;
  projects: () => Promise<any[]>;
}) {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (!deps.configured()) return res.json({ data: { connected: false, tasks: [], inboxProjectId: null } });
    try {
      const [tasks, projects] = await Promise.all([deps.tasks(), deps.projects()]);
      const inbox = projects.find(p => p.inbox_project || p.is_inbox_project || p.is_inbox);
      const names = new Map(projects.map(p => [String(p.id), String(p.name)]));
      res.json({ data: {
        connected: true,
        inboxProjectId: inbox ? String(inbox.id) : null,
        tasks: tasks.map(task => ({ ...task, projectName: names.get(String(task.projectId)) || 'Project' })),
      } });
    } catch (error: any) {
      const rejected = error.status === 401 || error.status === 403;
      res.status(rejected ? 401 : 502).json({
        todoistError: rejected,
        error: rejected ? 'Todoist connection expired. Reconnect in Settings → Connections.' : 'Could not refresh Todoist. Your tasks have been kept; try Refresh shortly.',
      });
    }
  });
  return router;
}
