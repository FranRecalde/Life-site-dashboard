import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import { signalObsidianDestinationPath } from '../signalObsidianDestination';
import { SIGNAL_KINDS, SIGNAL_ROLES, SignalCapture, SignalItem, SignalItemType, SignalReviewQueueEntry, UpdateSignalItemInput } from '../types';

const destination = (type: SignalItemType) => type === 'task' ? 'Todoist' : type === 'event' ? 'Google Calendar' : 'Obsidian';
export const BIN_UNDO_WINDOW_MS = 5_000;

export const SignalWorkspace: React.FC = () => {
  const [entries, setEntries] = useState<SignalReviewQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpdateSignalItemInput>({});
  const [source, setSource] = useState<Record<string, SignalCapture>>({});
  const [binUndoItem, setBinUndoItem] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [sendingPaste, setSendingPaste] = useState(false);
  const [pasteSuccess, setPasteSuccess] = useState<string | null>(null);
  const binUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => { setLoading(true); setError(null); try { setEntries(await ApiClient.getSignalItems()); } catch (e: any) { setError(e.message || 'Unable to load Signal.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); return () => { if (binUndoTimer.current) clearTimeout(binUndoTimer.current); }; }, []);
  const replace = (item: SignalItem) => setEntries((current) => current.map((entry) => entry.entryType === 'item' && entry.item.id === item.id ? { ...entry, item } : entry));
  const edit = (item: SignalItem) => { setEditing(item.id); setDraft({ type: item.type, title: item.title, summary: item.summary, role: item.role, project: item.project, kind: item.kind, dueDate: item.dueDate, eventStart: item.eventStart, eventEnd: item.eventEnd, allDay: item.allDay, url: item.url, suggestedLabel: item.suggestedLabel, suggestedTag: item.suggestedTag }); };
  const save = async (id: string) => { setBusy(id); try { replace(await ApiClient.updateSignalItem(id, draft)); setEditing(null); } catch (e: any) { setError(e.message || 'Unable to save item.'); } finally { setBusy(null); } };
  const keep = async (id: string) => { setBusy(id); try { const item = await ApiClient.keepSignalItem(id); item.dispatchStatus === 'succeeded' ? setEntries((all) => all.filter((entry) => entry.entryType !== 'item' || entry.item.id !== id)) : replace(item); if (item.dispatchStatus === 'failed') setError('Dispatch failed; the approved item remains recoverable.'); } catch (e: any) { setError(e.message || 'Unable to keep item.'); } finally { setBusy(null); } };
  const bin = async (id: string) => { setBusy(id); try { await ApiClient.binSignalItem(id); setEntries((all) => all.filter((entry) => entry.entryType !== 'item' || entry.item.id !== id)); if (binUndoTimer.current) clearTimeout(binUndoTimer.current); setBinUndoItem(id); binUndoTimer.current = setTimeout(() => { setBinUndoItem(null); binUndoTimer.current = null; }, BIN_UNDO_WINDOW_MS); } catch (e: any) { setError(e.message || 'Unable to bin item.'); } finally { setBusy(null); } };
  const undoBin = async () => { if (!binUndoItem) return; const id = binUndoItem; setBusy(id); try { const item = await ApiClient.undoBinSignalItem(id); if (binUndoTimer.current) clearTimeout(binUndoTimer.current); binUndoTimer.current = null; setBinUndoItem(null); setEntries((all) => [...all, { entryType: 'item' as const, createdAt: item.createdAt, item }].sort((left, right) => right.createdAt.localeCompare(left.createdAt))); } catch (e: any) { setError(e.message || 'Unable to undo bin.'); } finally { setBusy(null); } };
  const dismiss = async (id: string) => { setBusy(id); try { await ApiClient.dismissSignalCapture(id); setEntries((all) => all.filter((entry) => entry.entryType !== 'capture' || entry.capture.id !== id)); } catch (e: any) { setError(e.message || 'Unable to dismiss capture.'); } finally { setBusy(null); } };
  const toggleSource = async (item: SignalItem) => { if (source[item.captureId]) { setSource((all) => { const copy = { ...all }; delete copy[item.captureId]; return copy; }); return; } try { const capture = await ApiClient.getSignalCapture(item.captureId); setSource((all) => ({ ...all, [item.captureId]: capture })); } catch (e: any) { setError(e.message || 'Unable to load source.'); } };
  const sendPaste = async () => { setSendingPaste(true); setError(null); setPasteSuccess(null); try { await ApiClient.createSignalCapture({ rawText: pasteText }); setPasteText(''); setPasteSuccess('Capture sent to Signal for review.'); await load(); } catch (e: any) { setError(e.message || 'Unable to send capture.'); } finally { setSendingPaste(false); } };

  return <div className="mx-auto max-w-5xl space-y-5 text-left">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1e293b] bg-[#0a0f1d]/70 p-5">
      <div><p className="text-[10px] font-mono tracking-widest text-[#c5a86a] uppercase">Review first</p><h1 className="text-2xl font-black text-white">Signal</h1><p className="text-sm text-slate-400">Nothing reaches a destination until you Keep it.</p></div>
      <button onClick={() => void load()} className="flex items-center gap-2 rounded-lg border border-[#28344a] px-3 py-2 text-xs text-slate-300"><RefreshCw className="h-4 w-4" />Refresh</button>
    </div>
    <form onSubmit={(event) => { event.preventDefault(); void sendPaste(); }} className="rounded-xl border border-[#28344a] bg-[#111a2b] p-5">
      <label htmlFor="signal-paste" className="text-sm font-bold text-white">Paste a capture</label>
      <textarea id="signal-paste" value={pasteText} onChange={(event) => setPasteText(event.target.value)} onKeyDown={(event) => { if (event.ctrlKey && event.key === 'Enter' && !sendingPaste) { event.preventDefault(); void sendPaste(); } }} placeholder="Paste text to classify for review" className="mt-3 min-h-28 w-full rounded border border-[#28344a] bg-[#070b13] p-3 text-sm text-white" />
      <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-500">Ctrl+Enter to send</span><button type="submit" disabled={sendingPaste} className="rounded bg-[#c5a86a] px-3 py-2 text-xs font-bold text-[#07101a] disabled:opacity-50">{sendingPaste ? 'Sending…' : 'Send'}</button></div>
    </form>
    {error && <p className="rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
    {pasteSuccess && <p className="rounded-lg border border-[#c5a86a]/40 bg-[#17130b] p-3 text-sm text-[#e4cb93]">{pasteSuccess}</p>}
    {binUndoItem && <div className="flex items-center justify-between gap-3 rounded-lg border border-[#c5a86a]/40 bg-[#17130b] p-3 text-sm text-[#e4cb93]"><span>Item binned.</span><button disabled={busy === binUndoItem} onClick={() => void undoBin()} className="rounded border border-[#c5a86a]/60 px-3 py-1 text-xs font-bold">Undo</button></div>}
    {loading ? <div className="py-20 text-center text-slate-400"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div> : entries.length === 0 ? <div className="rounded-xl border border-dashed border-[#28344a] p-12 text-center text-slate-500">Nothing waiting for review.</div> : entries.map((entry) => {
      if (entry.entryType === 'capture') {
        const { capture } = entry; const failed = capture.processingStatus === 'failed';
        return <article key={capture.id} className={`rounded-xl border p-5 ${failed ? 'border-red-900/60 bg-red-950/20' : 'border-[#28344a] bg-[#111a2b]'}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><span className={`rounded border px-2 py-1 text-[10px] font-bold uppercase ${failed ? 'border-red-900/60 text-red-300' : 'border-[#c5a86a]/40 text-[#e4cb93]'}`}>{failed ? 'Processing failed' : 'No review items'}</span><h2 className="mt-3 text-lg font-bold text-white">{failed ? 'Capture needs attention' : 'Nothing useful found'}</h2><p className="mt-1 text-sm text-slate-400">{failed ? 'Signal could not process this capture. It remains visible for review.' : 'Signal processed this capture but found nothing to review.'}</p></div><span className="text-xs text-slate-500">{capture.sourceType === 'selection' ? 'Browser selection' : 'Pasted text'}</span></div>
          <div className="mt-4 rounded bg-[#0a0f1d] p-3 text-xs text-slate-400"><span className="font-semibold text-slate-300">Source:</span> {capture.sourceTitle || capture.sourceUrl || (capture.sourceType === 'selection' ? 'Browser selection' : 'Pasted text')}<span className="ml-3">Captured: {new Date(capture.capturedAt).toLocaleString('en-GB')}</span>{capture.sourceUrl && capture.sourceTitle && <span className="ml-3">{capture.sourceUrl}</span>}{failed && <span className="ml-3 text-red-300">Error: {capture.processingError || 'processing_failed'}</span>}</div>
          {!failed && <div className="mt-4"><button disabled={busy === capture.id} onClick={() => void dismiss(capture.id)} className="rounded border border-[#28344a] px-3 py-2 text-xs text-slate-300">Dismiss</button></div>}
        </article>;
      }
      const item = entry.item;
      const isEditing = editing === item.id; const current = isEditing ? { ...item, ...draft } : item; const isBusy = busy === item.id;
      return <article key={item.id} className="rounded-xl border border-[#28344a] bg-[#111a2b] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><span className="rounded border border-[#c5a86a]/40 px-2 py-1 text-[10px] font-bold uppercase text-[#e4cb93]">{current.type}</span><h2 className="mt-3 text-lg font-bold text-white">{current.title}</h2><p className="mt-1 text-sm text-slate-400">{current.summary || 'No summary supplied.'}</p></div><span className="text-xs text-slate-500">{destination(current.type)}</span></div>
        {isEditing ? <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={current.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white" />
          <select value={current.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as SignalItemType })} className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white">{(['task','event','information','link'] as SignalItemType[]).map((x) => <option key={x}>{x}</option>)}</select>
          <textarea value={current.summary || ''} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} className="md:col-span-2 rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white" placeholder="Summary" />
          <select value={current.role || ''} onChange={(e) => setDraft({ ...draft, role: (e.target.value || undefined) as any })} className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white"><option value="">No role</option>{SIGNAL_ROLES.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={current.kind || ''} onChange={(e) => setDraft({ ...draft, kind: (e.target.value || undefined) as any })} className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white"><option value="">No kind</option>{SIGNAL_KINDS.map((x) => <option key={x}>{x}</option>)}</select>
          <input value={current.project || ''} onChange={(e) => setDraft({ ...draft, project: e.target.value })} placeholder="Project" className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white" />
          <input type="date" value={current.type === 'task' ? current.dueDate || '' : current.eventStart || ''} onChange={(e) => setDraft({ ...draft, [current.type === 'task' ? 'dueDate' : 'eventStart']: e.target.value })} className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white" />
          {current.type === 'task' && <input value={current.suggestedLabel || ''} onChange={(e) => setDraft({ ...draft, suggestedLabel: e.target.value })} placeholder="Todoist label (optional)" className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white" />}
          {current.type === 'link' && <input value={current.url || ''} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="URL" className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white" />}
          {(current.type === 'information' || current.type === 'link') && <input value={current.suggestedTag || ''} onChange={(e) => setDraft({ ...draft, suggestedTag: e.target.value })} placeholder="Obsidian tag (optional)" className="rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-white" />}
          {(current.type === 'information' || current.type === 'link') && <p className="md:col-span-2 rounded border border-[#28344a] bg-[#070b13] p-2 text-sm text-slate-300"><span className="font-semibold text-white">Destination:</span> {signalObsidianDestinationPath(current)}</p>}
        </div> : <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">{current.role && <span>Role: {current.role}</span>}{current.project && <span>Project: {current.project}</span>}{current.kind && <span>Kind: {current.kind}</span>}{(current.dueDate || current.eventStart) && <span>Date: {current.dueDate || current.eventStart}</span>}{current.confidence !== undefined && <span>Confidence: {Math.round(current.confidence * 100)}%</span>}</div>}
        <div className="mt-4 rounded bg-[#0a0f1d] p-3 text-xs text-slate-400"><span className="font-semibold text-slate-300">Source:</span> {item.sourceExcerpt}{item.captureId && <button onClick={() => void toggleSource(item)} className="ml-3 text-[#e4cb93] underline">{source[item.captureId] ? 'Hide full source' : 'Show full source'}</button>}{source[item.captureId] && <pre className="mt-3 whitespace-pre-wrap font-sans text-slate-300">{source[item.captureId].rawText}</pre>}</div>
        <div className="mt-4 flex flex-wrap gap-2">{isEditing ? <><button disabled={isBusy} onClick={() => void save(item.id)} className="flex items-center gap-1 rounded bg-[#c5a86a] px-3 py-2 text-xs font-bold text-[#07101a]"><Check className="h-3.5 w-3.5" />Save</button><button onClick={() => setEditing(null)} className="rounded border border-[#28344a] px-3 py-2 text-xs text-slate-300">Cancel</button></> : <><button disabled={isBusy} onClick={() => void keep(item.id)} className="flex items-center gap-1 rounded bg-[#c5a86a] px-3 py-2 text-xs font-bold text-[#07101a]"><Check className="h-3.5 w-3.5" />Keep</button><button onClick={() => edit(item)} className="flex items-center gap-1 rounded border border-[#28344a] px-3 py-2 text-xs text-slate-300"><Pencil className="h-3.5 w-3.5" />Edit</button><button disabled={isBusy} onClick={() => void bin(item.id)} className="flex items-center gap-1 rounded border border-red-900/60 px-3 py-2 text-xs text-red-300"><Trash2 className="h-3.5 w-3.5" />Bin</button></>}</div>
      </article>;
    })}</div>;
};
