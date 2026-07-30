import express, { NextFunction, Request, Response } from 'express';
import { ReadingService, ReadingServiceError } from './readingService';
import { ReadingValidationError } from './readingValidation';

function sendReadingError(error: unknown, response: Response): void {
  if (error instanceof ReadingValidationError) {
    response.status(400).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  if (error instanceof ReadingServiceError) {
    const status =
      error.code === 'book_not_found' || error.code === 'capture_not_found'
        ? 404
        : error.code === 'book_revision_conflict' ||
            error.code === 'capture_state_conflict' ||
            error.code === 'book_inactive'
          ? 409
          : 400;
    response.status(status).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  console.error('Reading Capture request failed safely.');
  response.status(500).json({
    success: false,
    error: 'Reading Capture is temporarily unavailable.',
  });
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    handler(request, response).catch(next);
  };
}

export function createReadingBrowserRouter(service: ReadingService): express.Router {
  const router = express.Router();

  router.get('/books', asyncRoute(async (request, response) => {
    const rawIncludeArchived = request.query.includeArchived;
    if (
      rawIncludeArchived !== undefined &&
      rawIncludeArchived !== 'true' &&
      rawIncludeArchived !== 'false'
    ) {
      throw new ReadingValidationError(
        'invalid_include_archived',
        'includeArchived must be true or false.',
      );
    }
    const books = await service.listBooks(rawIncludeArchived === 'true');
    response.json({ success: true, data: books });
  }));

  router.post('/books', asyncRoute(async (request, response) => {
    const book = await service.createBook(request.body);
    response.status(201).json({ success: true, data: book });
  }));

  router.patch('/books/:bookId', asyncRoute(async (request, response) => {
    const book = await service.updateBook(request.params.bookId, request.body);
    response.json({ success: true, data: book });
  }));

  router.get('/captures', asyncRoute(async (request, response) => {
    const captures = await service.listCaptures({
      bookId: request.query.bookId,
      status: request.query.status,
      limit: request.query.limit,
    });
    response.json({ success: true, data: captures });
  }));

  router.post('/captures', asyncRoute(async (request, response) => {
    const result = await service.createCapture(
      request.body,
      'life_site',
    );
    response.status(201).json({
      success: true,
      data: {
        capture: result.capture,
      },
    });
  }));

  router.use((
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    sendReadingError(error, response);
  });

  return router;
}
