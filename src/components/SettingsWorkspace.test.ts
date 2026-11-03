import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsWorkspace, type SettingsWorkspaceProps } from './SettingsWorkspace';

const noop = () => {};
const props: SettingsWorkspaceProps = {
  settingsSection: 'connections', setSettingsSection: noop,
  settingsEditState: {} as SettingsWorkspaceProps['settingsEditState'],
  setSettingsEditState: noop, saveSettingsSuccess: false, handleSaveSettings: noop,
  connectionsStatus: { googleConnected: 'connected', googleClientIdPrefix: '397169406918', googleClientSecret: 'configured' },
  secretsForm: { todoistToken: '', googleClientId: 'unsaved-draft.apps.googleusercontent.com', googleClientSecret: '' },
  setSecretsForm: noop, handleSaveConnections: noop, handleRemoveTodoistToken: noop, handleConnectGoogleCalendar: noop,
  getActiveObsidianMode: () => 'desktop', getObsidianStatusInfo: () => ({ text: '', color: '' }),
  obsidianUrl: '', handleObsidianUrlChange: noop, obsidianApiKey: 'saved-obsidian-secret', obsidianApiKeyInput: '',
  handleObsidianApiKeyChange: noop, rememberObsidian: false, handleRememberObsidianToggle: noop,
  handleForgetObsidian: noop, obsidianTestStatus: {}, handleTestObsidianConnection: noop,
};
const render = (overrides: Partial<SettingsWorkspaceProps> = {}) => renderToStaticMarkup(createElement(SettingsWorkspace, { ...props, ...overrides }));

test('all connection credential inputs disable autocomplete and secret inputs stay masked', () => {
  const html = render();
  assert.match(html, /<form[^>]*autoComplete="off"/i);
  for (const name of ['todoist-token', 'google-client-id', 'google-client-secret', 'obsidian-key']) {
    const input = html.match(new RegExp(`<input[^>]*id="connections-${name}"[^>]*>`))?.[0];
    assert.ok(input, name);
    assert.match(input, /autoComplete="off"/i);
    if (name !== 'google-client-id') assert.match(input, /type="password"/);
  }
  assert.doesNotMatch(html, /saved-obsidian-secret/);
});

test('saved ID hint uses server metadata independently of the unsaved draft and status says Token saved', () => {
  const html = render();
  assert.match(html, /Saved ID: 397169406918…/);
  assert.match(html, />Token saved</);
  assert.doesNotMatch(html, />Connected</);
  assert.match(render({ connectionsStatus: { googleConnected: 'disconnected', googleClientIdPrefix: '' } }), /No saved Client ID/);
  assert.match(render({ connectionsStatus: { googleConnected: 'disconnected' } }), /No token saved/);
});
