import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import {
  CreateReadingCaptureInput,
  ReadingBook,
  ReadingCapture,
  ReadingCaptureStatus,
  ReadingCaptureType,
  ReadingSource,
} from '../types';

const CAPTURE_TYPE_OPTIONS: Array<{ value: ReadingCaptureType; label: string }> = [
  { value: 'thought', label: 'Thought' },
  { value: 'quote_and_thought', label: 'Quote and thought' },
  { value: 'question', label: 'Question' },
  { value: 'action', label: 'Action' },
  { value: 'summary', label: 'Summary' },
];

const SOURCE_OPTIONS: Array<{ value: ReadingSource; label: string }> = [
  { value: 'physical', label: 'Physical' },
  { value: 'kindle', label: 'Kindle' },
  { value: 'audiobook', label: 'Audiobook' },
];

const STATUS_LABELS: Record<ReadingCaptureStatus, string> = {
  pending: 'Pending',
  claimed: 'Claimed',
  done: 'Done',
};

const STATUS_STYLES: Record<ReadingCaptureStatus, string> = {
  pending: 'border-[var(--color-warning)] bg-[var(--color-warning-surface)] text-[var(--color-warning)]',
  claimed: 'border-[var(--color-divider)] bg-[var(--color-card-raised)] text-[var(--color-secondary)]',
  done: 'border-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-success)]',
};

interface BookFormState {
  title: string;
  author: string;
  destinationNotePath: string;
  tags: string;
  defaultSource: '' | ReadingSource;
}

const emptyBookForm = (): BookFormState => ({
  title: '',
  author: '',
  destinationNotePath: '',
  tags: '',
  defaultSource: '',
});

export const ReadingCaptureWorkspace: React.FC = () => {
  const [books, setBooks] = useState<ReadingBook[]>([]);
  const [captures, setCaptures] = useState<ReadingCapture[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'' | ReadingCaptureStatus>('');

  const [bookFormOpen, setBookFormOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<ReadingBook | null>(null);
  const [bookForm, setBookForm] = useState<BookFormState>(emptyBookForm);
  const [savingBook, setSavingBook] = useState(false);

  const [selectedBookId, setSelectedBookId] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [captureType, setCaptureType] = useState<ReadingCaptureType>('thought');
  const [source, setSource] = useState<'' | ReadingSource>('');
  const [locatorKind, setLocatorKind] = useState<
    '' | 'page' | 'location' | 'chapter' | 'timestamp'
  >('');
  const [locatorValue, setLocatorValue] = useState('');
  const [savingCapture, setSavingCapture] = useState(false);

  const activeBooks = useMemo(
    () => books.filter((book) => book.status === 'active'),
    [books],
  );
  const selectedBook = activeBooks.find((book) => book.id === selectedBookId);

  const loadWorkspace = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setError('');
    try {
      const [nextBooks, nextCaptures] = await Promise.all([
        ApiClient.getReadingBooks(includeArchived),
        ApiClient.getReadingCaptures({
          status: statusFilter || undefined,
          limit: 100,
        }),
      ]);
      setBooks(nextBooks);
      setCaptures(nextCaptures);
      const nextActiveBooks = nextBooks.filter((book) => book.status === 'active');
      setSelectedBookId((current) => (
        nextActiveBooks.some((book) => book.id === current)
          ? current
          : nextActiveBooks[0]?.id ?? ''
      ));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load Reading Capture.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [includeArchived, statusFilter]);

  const openCreateBook = () => {
    setEditingBook(null);
    setBookForm(emptyBookForm());
    setBookFormOpen(true);
    setError('');
    setSuccess('');
  };

  const openEditBook = (book: ReadingBook) => {
    setEditingBook(book);
    setBookForm({
      title: book.title,
      author: book.author,
      destinationNotePath: book.destinationNotePath,
      tags: book.tags.join(', '),
      defaultSource: book.defaultSource ?? '',
    });
    setBookFormOpen(true);
    setError('');
    setSuccess('');
  };

  const saveBook = async (event: FormEvent) => {
    event.preventDefault();
    setSavingBook(true);
    setError('');
    setSuccess('');
    const tags = bookForm.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    try {
      if (editingBook) {
        await ApiClient.updateReadingBook(editingBook.id, {
          expectedRevision: editingBook.revision,
          title: bookForm.title,
          author: bookForm.author,
          destinationNotePath: bookForm.destinationNotePath,
          tags,
          defaultSource: bookForm.defaultSource || null,
        });
        setSuccess('Book updated.');
      } else {
        await ApiClient.createReadingBook({
          title: bookForm.title,
          author: bookForm.author,
          destinationNotePath: bookForm.destinationNotePath,
          tags,
          defaultSource: bookForm.defaultSource || undefined,
        });
        setSuccess('Book created.');
      }
      setBookFormOpen(false);
      setEditingBook(null);
      setBookForm(emptyBookForm());
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save book.');
    } finally {
      setSavingBook(false);
    }
  };

  const toggleBookArchive = async (book: ReadingBook) => {
    setError('');
    setSuccess('');
    try {
      await ApiClient.updateReadingBook(book.id, {
        expectedRevision: book.revision,
        status: book.status === 'active' ? 'archived' : 'active',
      });
      setSuccess(book.status === 'active' ? 'Book archived.' : 'Book restored.');
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to update book.');
    }
  };

  const saveCapture = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBookId) {
      setError('Create or select an active book first.');
      return;
    }
    const input: CreateReadingCaptureInput = {
      bookId: selectedBookId,
      originalText,
      captureType,
      source: source || undefined,
      locator:
        locatorKind && locatorValue.trim()
          ? { kind: locatorKind, value: locatorValue }
          : undefined,
    };
    setSavingCapture(true);
    setError('');
    setSuccess('');
    try {
      await ApiClient.createReadingCapture(input);
      setSuccess('Capture queued.');
      setOriginalText('');
      setCaptureType('thought');
      setSource('');
      setLocatorKind('');
      setLocatorValue('');
      await loadWorkspace();
    } catch (caught) {
      const requestError = caught as Error;
      setError(requestError.message || 'Failed to queue capture.');
    } finally {
      setSavingCapture(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-[var(--color-secondary)]">
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-[var(--color-secondary)]" />
        Loading Reading Capture…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[var(--color-divider)]/60 bg-gradient-to-r from-[var(--color-card)] to-[var(--color-page)] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-[var(--color-secondary)]">
              Temporary reading inbox
            </span>
            <h1 className="mt-1 text-2xl font-semibold uppercase tracking-wide text-[var(--color-ink)]">
              Reading Capture
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--color-secondary)]">
              Preserve your exact words against the correct literature note. Phase 1 queues
              captures safely; it does not write to Obsidian.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWorkspace(true)}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--color-secondary)]/30 bg-[var(--color-page)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)] hover:border-[var(--color-secondary)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {(error || success) && (
        <div
          className={`flex items-start gap-3 rounded-lg border p-4 text-sm ${
            error
              ? 'border-[var(--color-warning)] bg-[var(--color-warning-surface)] text-[var(--color-warning)]'
              : 'border-[var(--color-success)] bg-[var(--color-success-surface)] text-[var(--color-success)]'
          }`}
          role={error ? 'alert' : 'status'}
        >
          {error
            ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{error || success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-[var(--color-divider)]/60 bg-[var(--color-page)]/70 p-5 xl:col-span-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-[var(--color-ink)]">Books</h2>
              <p className="text-xs text-[var(--color-secondary)]">One exact literature-note path per book.</p>
            </div>
            <button
              type="button"
              onClick={openCreateBook}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-card-raised)] px-3 py-2 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-card-raised)]"
            >
              <Plus className="h-4 w-4" />
              Add book
            </button>
          </div>

          <label className="mb-4 flex items-center gap-2 text-xs text-[var(--color-secondary)]">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="accent-[var(--color-secondary)]"
            />
            Show archived books
          </label>

          {bookFormOpen && (
            <form onSubmit={saveBook} className="mb-5 space-y-3 rounded-lg border border-[var(--color-secondary)]/25 bg-[var(--color-card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--color-ink)]">
                {editingBook ? 'Edit book' : 'Create book'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-[var(--color-secondary)]">
                  Title
                  <input
                    required
                    value={bookForm.title}
                    onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                  />
                </label>
                <label className="text-xs text-[var(--color-secondary)]">
                  Author
                  <input
                    required
                    value={bookForm.author}
                    onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                  />
                </label>
              </div>
              <label className="block text-xs text-[var(--color-secondary)]">
                Exact destination path
                <input
                  required
                  value={bookForm.destinationNotePath}
                  onChange={(event) => setBookForm({
                    ...bookForm,
                    destinationNotePath: event.target.value,
                  })}
                  placeholder="Literature notes/Book — Author.md"
                  className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                />
              </label>
              <label className="block text-xs text-[var(--color-secondary)]">
                Tags, comma separated
                <input
                  value={bookForm.tags}
                  onChange={(event) => setBookForm({ ...bookForm, tags: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                />
              </label>
              <label className="block text-xs text-[var(--color-secondary)]">
                Default source
                <select
                  value={bookForm.defaultSource}
                  onChange={(event) => setBookForm({
                    ...bookForm,
                    defaultSource: event.target.value as '' | ReadingSource,
                  })}
                  className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                >
                  <option value="">No default</option>
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBookFormOpen(false)}
                  className="rounded-lg border border-[var(--color-divider)] px-3 py-2 text-xs text-[var(--color-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBook}
                  className="flex items-center gap-2 rounded-lg bg-[var(--color-card-raised)] px-3 py-2 text-xs font-semibold text-[var(--color-ink)] disabled:opacity-50"
                >
                  {savingBook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {books.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--color-divider)] p-6 text-center text-sm text-[var(--color-secondary)]">
                No books yet.
              </div>
            )}
            {books.map((book) => (
              <article
                key={book.id}
                className={`rounded-lg border p-4 ${
                  book.status === 'archived'
                    ? 'border-[var(--color-divider)] bg-[var(--color-page)] '
                    : 'border-[var(--color-divider)] bg-[var(--color-card)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-[var(--color-ink)]">{book.title}</h3>
                    <p className="text-xs text-[var(--color-secondary)]">{book.author}</p>
                  </div>
                  <span className="rounded border border-[var(--color-secondary)]/20 px-2 py-1 text-[10px] uppercase text-[var(--color-secondary)]">
                    r{book.revision}
                  </span>
                </div>
                <p className="mt-3 break-all font-mono text-[11px] text-[var(--color-secondary)]">
                  {book.destinationNotePath}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {book.tags.map((tag) => (
                    <span key={tag} className="rounded bg-[var(--color-divider)] px-2 py-1 text-[10px] text-[var(--color-secondary)]">
                      {tag}
                    </span>
                  ))}
                  {book.defaultSource && (
                    <span className="rounded bg-[var(--color-card-raised)]/10 px-2 py-1 text-[10px] text-[var(--color-secondary)]">
                      {book.defaultSource}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditBook(book)}
                    className="rounded border border-[var(--color-divider)] px-3 py-1.5 text-xs text-[var(--color-secondary)] hover:text-[var(--color-ink)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleBookArchive(book)}
                    className="flex items-center gap-1.5 rounded border border-[var(--color-divider)] px-3 py-1.5 text-xs text-[var(--color-secondary)] hover:text-[var(--color-ink)]"
                  >
                    {book.status === 'active'
                      ? <Archive className="h-3.5 w-3.5" />
                      : <RotateCcw className="h-3.5 w-3.5" />}
                    {book.status === 'active' ? 'Archive' : 'Restore'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-divider)]/60 bg-[var(--color-page)]/70 p-5 xl:col-span-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-[var(--color-card-raised)]/10 p-2.5 text-[var(--color-secondary)]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--color-ink)]">New capture</h2>
              <p className="text-xs text-[var(--color-secondary)]">Your original words are stored unchanged.</p>
            </div>
          </div>

          <form onSubmit={saveCapture} className="space-y-4">
            <label className="block text-xs text-[var(--color-secondary)]">
              Book
              <select
                required
                value={selectedBookId}
                onChange={(event) => setSelectedBookId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-3 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
              >
                <option value="">Select a book</option>
                {activeBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title} — {book.author}
                  </option>
                ))}
              </select>
            </label>

            {selectedBook && (
              <div className="rounded-lg border border-[var(--color-divider)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-secondary)]">
                Destination: <span className="font-mono text-[var(--color-secondary)]">{selectedBook.destinationNotePath}</span>
                {selectedBook.tags.length > 0 && (
                  <span className="mt-1 block">Inherited tags: {selectedBook.tags.join(', ')}</span>
                )}
              </div>
            )}

            <label className="block text-xs text-[var(--color-secondary)]">
              Your exact words
              <textarea
                required
                rows={7}
                value={originalText}
                onChange={(event) => setOriginalText(event.target.value)}
                placeholder="Capture the thought exactly as you want to preserve it…"
                className="mt-1 w-full resize-y rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-3 text-sm leading-relaxed text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-[var(--color-secondary)]">
                Capture type
                <select
                  value={captureType}
                  onChange={(event) => setCaptureType(event.target.value as ReadingCaptureType)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                >
                  {CAPTURE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--color-secondary)]">
                Source
                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value as '' | ReadingSource)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                >
                  <option value="">
                    {selectedBook?.defaultSource
                      ? `Use book default (${selectedBook.defaultSource})`
                      : 'Not specified'}
                  </option>
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[var(--color-secondary)]">
                Locator type
                <select
                  value={locatorKind}
                  onChange={(event) => setLocatorKind(event.target.value as typeof locatorKind)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)]"
                >
                  <option value="">None</option>
                  <option value="page">Page</option>
                  <option value="location">Kindle location</option>
                  <option value="chapter">Chapter</option>
                  <option value="timestamp">Timestamp</option>
                </select>
              </label>
              <label className="text-xs text-[var(--color-secondary)]">
                Locator
                <input
                  value={locatorValue}
                  disabled={!locatorKind}
                  onChange={(event) => setLocatorValue(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-secondary)] disabled:opacity-40"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingCapture || activeBooks.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[var(--color-secondary)] to-[var(--color-secondary)] px-4 py-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-ink)] hover:from-[var(--color-secondary)] hover:to-[var(--color-secondary)] disabled:opacity-40"
            >
              {savingCapture ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Queue capture
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-[var(--color-divider)]/60 bg-[var(--color-page)]/70 p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold text-[var(--color-ink)]">Pending and recent captures</h2>
            <p className="text-xs text-[var(--color-secondary)]">Firestore remains a temporary delivery queue, not the permanent notes vault.</p>
          </div>
          <label className="text-xs text-[var(--color-secondary)]">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as '' | ReadingCaptureStatus)}
              className="ml-2 rounded-lg border border-[var(--color-divider)] bg-[var(--color-page)] px-3 py-2 text-xs text-[var(--color-ink)]"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-3">
          {captures.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--color-divider)] p-8 text-center text-sm text-[var(--color-secondary)]">
              No captures in this view.
            </div>
          )}
          {captures.map((capture) => (
            <article key={capture.id} className="rounded-lg border border-[var(--color-divider)] bg-[var(--color-card)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-[var(--color-ink)]">
                    {capture.bookTitle}
                    <span className="ml-2 font-normal text-[var(--color-secondary)]">— {capture.bookAuthor}</span>
                  </h3>
                  <p className="mt-1 text-[11px] text-[var(--color-secondary)]">
                    {new Date(capture.capturedAt).toLocaleString('en-GB')} ·{' '}
                    {CAPTURE_TYPE_OPTIONS.find((option) => option.value === capture.captureType)?.label}
                    {capture.source ? ` · ${capture.source}` : ''}
                    {capture.locator ? ` · ${capture.locator.kind}: ${capture.locator.value}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${STATUS_STYLES[capture.status]}`}>
                  {STATUS_LABELS[capture.status]}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-secondary)]">
                {capture.originalText}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-[var(--color-secondary)]">
                <span>{capture.destinationNotePath}</span>
                <span>{capture.id}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
