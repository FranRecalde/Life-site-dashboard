import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
  in_progress: 'In progress',
  delivered: 'Delivered',
  needs_attention: 'Needs attention',
};

const STATUS_STYLES: Record<ReadingCaptureStatus, string> = {
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  in_progress: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  delivered: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  needs_attention: 'border-red-500/30 bg-red-500/10 text-red-200',
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
  const pendingSubmission = useRef<{
    signature: string;
    key: string;
  } | null>(null);

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
    const signature = JSON.stringify(input);
    if (!pendingSubmission.current || pendingSubmission.current.signature !== signature) {
      pendingSubmission.current = {
        signature,
        key: crypto.randomUUID(),
      };
    }

    setSavingCapture(true);
    setError('');
    setSuccess('');
    try {
      const result = await ApiClient.createReadingCapture(
        input,
        pendingSubmission.current.key,
      );
      setSuccess(result.replayed ? 'Existing capture safely returned.' : 'Capture queued.');
      pendingSubmission.current = null;
      setOriginalText('');
      setCaptureType('thought');
      setSource('');
      setLocatorKind('');
      setLocatorValue('');
      await loadWorkspace();
    } catch (caught) {
      const requestError = caught as Error & { code?: string };
      if (requestError.code === 'idempotency_conflict') {
        pendingSubmission.current = null;
      }
      setError(requestError.message || 'Failed to queue capture.');
    } finally {
      setSavingCapture(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-400">
        <Loader2 className="mr-3 h-5 w-5 animate-spin text-[#c5a86a]" />
        Loading Reading Capture…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#1e293b]/60 bg-gradient-to-r from-[#0d1527] to-[#0a0f1d] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#c5a86a]">
              Temporary reading inbox
            </span>
            <h1 className="mt-1 text-2xl font-black uppercase tracking-wide text-white">
              Reading Capture
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              Preserve your exact words against the correct literature note. Phase 1 queues
              captures safely; it does not write to Obsidian.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadWorkspace(true)}
            disabled={refreshing}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#c5a86a]/30 bg-[#0a0f1d] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-300 hover:border-[#e4cb93] hover:text-white disabled:opacity-50"
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
              ? 'border-red-500/30 bg-red-500/10 text-red-100'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
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
        <section className="rounded-xl border border-[#1e293b]/60 bg-[#0a0f1d]/70 p-5 xl:col-span-5">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-white">Books</h2>
              <p className="text-xs text-slate-500">One exact literature-note path per book.</p>
            </div>
            <button
              type="button"
              onClick={openCreateBook}
              className="flex items-center gap-2 rounded-lg bg-[#c5a86a] px-3 py-2 text-xs font-bold text-[#0a0f1d] hover:bg-[#e4cb93]"
            >
              <Plus className="h-4 w-4" />
              Add book
            </button>
          </div>

          <label className="mb-4 flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="accent-[#c5a86a]"
            />
            Show archived books
          </label>

          {bookFormOpen && (
            <form onSubmit={saveBook} className="mb-5 space-y-3 rounded-lg border border-[#c5a86a]/25 bg-[#111a2b] p-4">
              <h3 className="text-sm font-bold text-white">
                {editingBook ? 'Edit book' : 'Create book'}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Title
                  <input
                    required
                    value={bookForm.title}
                    onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a]"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  Author
                  <input
                    required
                    value={bookForm.author}
                    onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a]"
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-400">
                Exact destination path
                <input
                  required
                  value={bookForm.destinationNotePath}
                  onChange={(event) => setBookForm({
                    ...bookForm,
                    destinationNotePath: event.target.value,
                  })}
                  placeholder="Literature notes/Book — Author.md"
                  className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 font-mono text-xs text-white outline-none focus:border-[#c5a86a]"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Tags, comma separated
                <input
                  value={bookForm.tags}
                  onChange={(event) => setBookForm({ ...bookForm, tags: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a]"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Default source
                <select
                  value={bookForm.defaultSource}
                  onChange={(event) => setBookForm({
                    ...bookForm,
                    defaultSource: event.target.value as '' | ReadingSource,
                  })}
                  className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a]"
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
                  className="rounded-lg border border-[#28344a] px-3 py-2 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBook}
                  className="flex items-center gap-2 rounded-lg bg-[#c5a86a] px-3 py-2 text-xs font-bold text-[#0a0f1d] disabled:opacity-50"
                >
                  {savingBook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {books.length === 0 && (
              <div className="rounded-lg border border-dashed border-[#28344a] p-6 text-center text-sm text-slate-500">
                No books yet.
              </div>
            )}
            {books.map((book) => (
              <article
                key={book.id}
                className={`rounded-lg border p-4 ${
                  book.status === 'archived'
                    ? 'border-[#28344a] bg-[#0b111d] opacity-65'
                    : 'border-[#28344a] bg-[#111a2b]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">{book.title}</h3>
                    <p className="text-xs text-slate-400">{book.author}</p>
                  </div>
                  <span className="rounded border border-[#c5a86a]/20 px-2 py-1 text-[10px] uppercase text-[#c5a86a]">
                    r{book.revision}
                  </span>
                </div>
                <p className="mt-3 break-all font-mono text-[11px] text-slate-500">
                  {book.destinationNotePath}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {book.tags.map((tag) => (
                    <span key={tag} className="rounded bg-[#1e293b] px-2 py-1 text-[10px] text-slate-300">
                      {tag}
                    </span>
                  ))}
                  {book.defaultSource && (
                    <span className="rounded bg-[#c5a86a]/10 px-2 py-1 text-[10px] text-[#e4cb93]">
                      {book.defaultSource}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEditBook(book)}
                    className="rounded border border-[#28344a] px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleBookArchive(book)}
                    className="flex items-center gap-1.5 rounded border border-[#28344a] px-3 py-1.5 text-xs text-slate-300 hover:text-white"
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

        <section className="rounded-xl border border-[#1e293b]/60 bg-[#0a0f1d]/70 p-5 xl:col-span-7">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-lg bg-[#c5a86a]/10 p-2.5 text-[#e4cb93]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold text-white">New capture</h2>
              <p className="text-xs text-slate-500">Your original words are stored unchanged.</p>
            </div>
          </div>

          <form onSubmit={saveCapture} className="space-y-4">
            <label className="block text-xs text-slate-400">
              Book
              <select
                required
                value={selectedBookId}
                onChange={(event) => setSelectedBookId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-3 text-sm text-white outline-none focus:border-[#c5a86a]"
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
              <div className="rounded-lg border border-[#28344a] bg-[#111a2b] p-3 text-xs text-slate-400">
                Destination: <span className="font-mono text-slate-200">{selectedBook.destinationNotePath}</span>
                {selectedBook.tags.length > 0 && (
                  <span className="mt-1 block">Inherited tags: {selectedBook.tags.join(', ')}</span>
                )}
              </div>
            )}

            <label className="block text-xs text-slate-400">
              Your exact words
              <textarea
                required
                rows={7}
                value={originalText}
                onChange={(event) => setOriginalText(event.target.value)}
                placeholder="Capture the thought exactly as you want to preserve it…"
                className="mt-1 w-full resize-y rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-3 text-sm leading-relaxed text-white outline-none focus:border-[#c5a86a]"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs text-slate-400">
                Capture type
                <select
                  value={captureType}
                  onChange={(event) => setCaptureType(event.target.value as ReadingCaptureType)}
                  className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a]"
                >
                  {CAPTURE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Source
                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value as '' | ReadingSource)}
                  className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a]"
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
              <label className="text-xs text-slate-400">
                Locator type
                <select
                  value={locatorKind}
                  onChange={(event) => setLocatorKind(event.target.value as typeof locatorKind)}
                  className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a]"
                >
                  <option value="">None</option>
                  <option value="page">Page</option>
                  <option value="location">Kindle location</option>
                  <option value="chapter">Chapter</option>
                  <option value="timestamp">Timestamp</option>
                </select>
              </label>
              <label className="text-xs text-slate-400">
                Locator
                <input
                  value={locatorValue}
                  disabled={!locatorKind}
                  onChange={(event) => setLocatorValue(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2.5 text-sm text-white outline-none focus:border-[#c5a86a] disabled:opacity-40"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={savingCapture || activeBooks.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#9a7d44] to-[#c5a86a] px-4 py-3 text-sm font-black uppercase tracking-wider text-[#070b13] hover:from-[#c5a86a] hover:to-[#e4cb93] disabled:opacity-40"
            >
              {savingCapture ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Queue capture
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-[#1e293b]/60 bg-[#0a0f1d]/70 p-5">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-bold text-white">Pending and recent captures</h2>
            <p className="text-xs text-slate-500">Firestore remains a temporary delivery queue, not the permanent notes vault.</p>
          </div>
          <label className="text-xs text-slate-400">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as '' | ReadingCaptureStatus)}
              className="ml-2 rounded-lg border border-[#28344a] bg-[#070b13] px-3 py-2 text-xs text-white"
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
            <div className="rounded-lg border border-dashed border-[#28344a] p-8 text-center text-sm text-slate-500">
              No captures in this view.
            </div>
          )}
          {captures.map((capture) => (
            <article key={capture.id} className="rounded-lg border border-[#28344a] bg-[#111a2b] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-white">
                    {capture.bookTitle}
                    <span className="ml-2 font-normal text-slate-500">— {capture.bookAuthor}</span>
                  </h3>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {new Date(capture.capturedAt).toLocaleString('en-GB')} ·{' '}
                    {CAPTURE_TYPE_OPTIONS.find((option) => option.value === capture.captureType)?.label}
                    {capture.source ? ` · ${capture.source}` : ''}
                    {capture.locator ? ` · ${capture.locator.kind}: ${capture.locator.value}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${STATUS_STYLES[capture.status]}`}>
                  {STATUS_LABELS[capture.status]}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {capture.originalText}
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-slate-600">
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
