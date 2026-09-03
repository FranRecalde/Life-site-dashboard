const MENU_ID = 'send-selection-to-signal';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Send selection to Signal', contexts: ['selection'] });
});

async function settings() {
  const value = await chrome.storage.local.get(['signalApiOrigin', 'signalCaptureToken']);
  return { origin: (value.signalApiOrigin || 'http://localhost:3000').replace(/\/$/, ''), token: value.signalCaptureToken || '' };
}

async function send(payload) {
  const { origin, token } = await settings();
  if (!token) throw new Error('Add your Signal capture token in the extension popup first.');
  const response = await fetch(`${origin}/api/actions/signal-captures`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Signal could not receive this capture.'); }
  return response.json();
}

async function showResult(text) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: text === 'OK' ? '#198754' : '#b42318' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 4000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const payload = { rawText: info.selectionText, sourceUrl: info.pageUrl || tab?.url, sourceTitle: tab?.title, sourceType: 'selection', capturedAt: new Date().toISOString() };
  try { await send(payload); await chrome.storage.local.remove('signalFailedCapture'); await showResult('OK'); }
  catch (error) { await chrome.storage.local.set({ signalFailedCapture: payload }); await showResult('!'); }
});

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'send') return;
  send(message.payload).then(async (value) => { await chrome.storage.local.remove('signalFailedCapture'); respond({ ok: true, value }); }).catch(async (error) => { await chrome.storage.local.set({ signalFailedCapture: message.payload }); respond({ ok: false, error: error.message }); });
  return true;
});
