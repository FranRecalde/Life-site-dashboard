const $ = (id) => document.getElementById(id);
const origin = $('origin'), token = $('token'), text = $('text'), status = $('status'), retry = $('retry');
const saved = await chrome.storage.local.get(['signalApiOrigin', 'signalCaptureToken', 'signalFailedCapture']);
origin.value = saved.signalApiOrigin || 'https://life-site-dashboard-708819606972.europe-west2.run.app'; token.value = saved.signalCaptureToken || ''; retry.hidden = !saved.signalFailedCapture;
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
function message(value, ok = false) { status.textContent = value; status.className = ok ? 'success' : 'error'; }
async function submit(payload) {
  await chrome.storage.local.set({ signalApiOrigin: origin.value.trim(), signalCaptureToken: token.value.trim() });
  message('Sending…'); const result = await chrome.runtime.sendMessage({ type: 'send', payload });
  if (result.ok) { message('Sent to Signal', true); text.value = ''; retry.hidden = true; } else { message(result.error); retry.hidden = false; }
}
$('send').addEventListener('click', () => { const rawText = text.value.trim(); if (!rawText) return message('Paste text or a URL first.'); void submit({ rawText, sourceUrl: tab?.url, sourceTitle: tab?.title, sourceType: 'paste', capturedAt: new Date().toISOString() }); });
retry.addEventListener('click', async () => { const value = (await chrome.storage.local.get('signalFailedCapture')).signalFailedCapture; if (value) void submit(value); });
