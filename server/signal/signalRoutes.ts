import express, { NextFunction, Request, Response } from 'express';
import { createReadingBearerAuthenticator } from '../reading/readingBearerAuth';
import { SignalError, SignalService } from './signalService';

const asyncRoute = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };
const sendError = (error: unknown, response: Response) => { if (error instanceof SignalError) return response.status(error.status).json({ success: false, code: error.code, error: error.message }); console.error('Signal request failed safely.'); return response.status(500).json({ success: false, code: 'signal_unavailable', error: 'Signal is temporarily unavailable.' }); };

export function createSignalBrowserRouter(service: SignalService): express.Router {
  const router = express.Router();
  router.get('/items', asyncRoute(async (req, res) => { const limit = req.query.limit === undefined ? 100 : Number(req.query.limit); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new SignalError('invalid_limit', 'limit must be between 1 and 100.'); res.json({ success: true, data: await service.listReviewQueue(limit) }); }));
  router.get('/captures/:captureId', asyncRoute(async (req, res) => { const capture = await service.getCapture(req.params.captureId); res.json({ success: true, data: capture }); }));
  router.post('/captures/:captureId/dismiss', asyncRoute(async (req, res) => { res.json({ success: true, data: await service.dismissNoItemsCapture(req.params.captureId) }); }));
  router.patch('/items/:itemId', asyncRoute(async (req, res) => { res.json({ success: true, data: await service.updateItem(req.params.itemId, req.body) }); }));
  router.post('/items/:itemId/keep', asyncRoute(async (req, res) => { res.json({ success: true, data: await service.approveItem(req.params.itemId) }); }));
  router.post('/items/:itemId/bin', asyncRoute(async (req, res) => { res.json({ success: true, data: await service.discardItem(req.params.itemId) }); }));
  router.post('/items/:itemId/undo-bin', asyncRoute(async (req, res) => { res.json({ success: true, data: await service.undoDiscardItem(req.params.itemId) }); }));
  router.post('/captures/:captureId/process', asyncRoute(async (req, res) => { await service.processCapture(req.params.captureId); res.json({ success: true }); }));
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => sendError(error, res));
  return router;
}

export function createSignalActionRouter(service: SignalService, tokenHash: () => string): express.Router {
  const router = express.Router();
  router.use((req, res, next) => { const origin = req.get('Origin') || ''; if (/^(chrome|edge)-extension:\/\//.test(origin)) res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); res.set('Cache-Control', 'no-store'); if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.set('Access-Control-Allow-Methods', 'POST, OPTIONS'); return res.sendStatus(204); } next(); });
  router.post('/', createReadingBearerAuthenticator(tokenHash, { code: 'api_unavailable', message: 'Signal Capture is temporarily unavailable.' }), express.json({ limit: '512kb', strict: true }), asyncRoute(async (req, res) => { const capture = await service.createCapture(req.body); void service.processCapture(capture.id); res.status(201).json({ success: true, data: { captureId: capture.id, receivedAt: capture.createdAt, processingStatus: capture.processingStatus } }); }));
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => sendError(error, res));
  return router;
}
