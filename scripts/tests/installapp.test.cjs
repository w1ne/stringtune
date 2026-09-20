const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../../stringtune/static/js/installapp.js'), 'utf8');

function target() {
  const listeners = {};
  return { style: {}, hidden: false, disabled: false,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    emit(name, event = {}) { return Promise.all((listeners[name] || []).map(fn => fn(event))); }
  };
}
function setup({ ios = false, standalone = false, analytics = true, optionalButton = true } = {}) {
  const elements = Object.fromEntries(['install-button', 'install-app-prompt', 'installAppBtn', 'install-button-ios', 'install-app-prompt-ios', 'install-app-instructions-ios', 'install-app-screen', 'language-selector'].map(id => [id, target()]));
  if (!optionalButton) delete elements.installAppBtn;
  const events = [];
  const registrations = [];
  const navigator = { platform: ios ? 'iPhone' : 'Linux', userAgent: '', standalone, serviceWorker: { register(url) { registrations.push(url); return Promise.resolve(); } } };
  const window = Object.assign(target(), { navigator, location: { pathname: '/' }, matchMedia: () => ({ matches: standalone }) });
  if (analytics) window.StringTuneAnalytics = { track(name, fields) { events.push([name, { ...fields }]); } };
  const context = { window, navigator, document: { getElementById: id => elements[id] || null }, console: { log() {} }, dataLayer: [] };
  vm.runInNewContext(script, context);
  return { window, elements, events, registrations, context };
}
function offer(app, outcome = 'accepted', prompt = () => Promise.resolve()) {
  let calls = 0;
  const event = { preventDefault() {}, prompt() { calls++; return prompt(); }, userChoice: Promise.resolve({ outcome }) };
  return app.window.emit('beforeinstallprompt', event).then(() => () => calls);
}

test('both controls consume a browser prompt once even on rapid clicks', async () => {
  const app = setup();
  let finish;
  const calls = await offer(app, 'accepted', () => new Promise(resolve => { finish = resolve; }));
  const first = app.elements['install-button'].emit('click');
  const second = app.elements.installAppBtn.emit('click');
  const third = app.elements['install-button'].emit('click');
  assert.equal(calls(), 1);
  assert.equal(app.elements.installAppBtn.disabled, true);
  assert.equal(app.elements['install-button'].disabled, true);
  finish();
  await Promise.all([first, second, third]);
  assert.deepEqual(app.events, [ ['install_prompt_shown', { source: 'browser' }], ['install_prompt_open', { source: 'footer' }], ['install_prompt_result', { source: 'footer', outcome: 'accepted' }] ]);
});
for (const outcome of ['accepted', 'dismissed']) test(`${outcome} records choice but never installation or conversion`, async () => {
  const app = setup();
  const calls = await offer(app, outcome);
  await app.elements.installAppBtn.emit('click');
  assert.equal(calls(), 1);
  assert.deepEqual(app.events.at(-1), ['install_prompt_result', { source: 'tuner', outcome }]);
  assert.equal(app.events.some(([name]) => name === 'app_installed' || name === 'conversion'), false);
  assert.equal(app.context.dataLayer.length, 0);
});
test('only appinstalled records installation once and hides controls', async () => {
  const app = setup();
  await offer(app);
  await app.window.emit('appinstalled');
  await app.window.emit('appinstalled');
  assert.equal(app.events.filter(([name]) => name === 'app_installed').length, 1);
  assert.equal(app.elements.installAppBtn.style.display, 'none');
  assert.equal(app.elements['install-app-prompt'].style.display, 'none');
  await app.elements['install-button'].emit('click');
  assert.equal(app.events.some(([name]) => name === 'install_prompt_open'), false);
});
test('prompt rejection is handled without a rejected listener promise', async () => {
  const app = setup();
  await offer(app, 'dismissed', () => Promise.reject(new Error('blocked')));
  await app.elements['install-button'].emit('click');
  assert.deepEqual(app.events.at(-1), ['install_prompt_result', { source: 'footer', outcome: 'error' }]);
});
test('iOS opens instructions without claiming installation', async () => {
  const app = setup({ ios: true });
  await app.elements['install-button-ios'].emit('click');
  assert.equal(app.elements['install-app-instructions-ios'].style.display, 'block');
  assert.equal(app.elements['install-app-screen'].style.display, 'block');
  assert.deepEqual(app.events, [['install_instructions_open', { source: 'ios' }]]);
});
test('missing analytics and optional tuner control do not break installation', async () => {
  const app = setup({ analytics: false, optionalButton: false });
  const calls = await offer(app);
  await app.elements['install-button'].emit('click');
  assert.equal(calls(), 1);
  assert.deepEqual(app.registrations, ['/sw.js']);
});
test('standalone launch reports app_open and hides language selector', () => {
  const app = setup({ ios: true, standalone: true });
  assert.deepEqual(app.events, [['app_open', { source: 'ios' }]]);
  assert.equal(app.elements['language-selector'].style.display, 'none');
});
