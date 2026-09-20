const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../stringtune/static/js/guitar-notes.js'), 'utf8');
function setup({ analytics = true } = {}) {
  const events = [];
  const referenceStates = [];
  const audio = [];
  const listeners = {};
  const buttons = ['guitar', 'bass'].map(instrument => ({
    dataset: { sound: `${instrument}.mp3` }, innerHTML: '▶️',
    closest() { return { dataset: { instrument } }; },
    addEventListener(name, fn) { this[name] = fn; }
  }));
  const window = {
    TuningUsage: { errorReason: () => 'not_allowed' },
    addEventListener(name, fn) { listeners[name] = fn; }
  };
  if (analytics) window.StringTuneAnalytics = { track(name, fields) { events.push([name, { ...fields }]); } };
  function Audio(url) {
    this.url = url;
    this.currentTime = 7;
    this.paused = false;
    this.pause = () => { this.paused = true; };
    this.play = () => new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    audio.push(this);
  }
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  const document = { querySelectorAll: () => buttons, dispatchEvent(event) {
    assert.equal(event.type, 'stringtune:reference');
    referenceStates.push(event.detail.playing);
  } };
  vm.runInNewContext(source, { window, Audio, CustomEvent, document });
  return { events, audio, buttons, window, listeners, referenceStates, document };
}
test('records reference play only when playback resolves with the selected instrument', async () => {
  const app = setup();
  const pending = app.buttons[0].click();
  assert.deepEqual(app.events, []);
  app.audio[0].resolve();
  await pending;
  assert.deepEqual(app.events, [['reference_play', { source: 'recording', instrument: 'guitar' }]]);
  assert.equal(app.buttons[0].innerHTML, '⏸️');
});
test('rejected playback is caught, measured and resets the failed UI', async () => {
  const app = setup();
  const pending = app.buttons[0].click();
  app.audio[0].reject(new Error('blocked'));
  await pending;
  assert.deepEqual(app.events, [['reference_error', { source: 'recording', instrument: 'guitar', stage: 'reference', reason: 'not_allowed' }]]);
  assert.equal(app.buttons[0].innerHTML, '▶️');
});
test('rapid switching ignores stale resolution and stale ended callbacks', async () => {
  const app = setup();
  const first = app.buttons[0].click();
  const second = app.buttons[1].click();
  assert.equal(app.audio[0].paused, true);
  app.audio[0].resolve();
  await first;
  assert.deepEqual(app.events, []);
  assert.equal(app.buttons[0].innerHTML, '▶️');
  app.audio[1].resolve();
  await second;
  app.audio[0].onended();
  assert.equal(app.buttons[1].innerHTML, '⏸️');
  assert.deepEqual(app.events, [['reference_play', { source: 'recording', instrument: 'bass' }]]);
});
test('toggling pending playback off stops it without a play event', async () => {
  const app = setup();
  const pending = app.buttons[0].click();
  await app.buttons[0].click();
  assert.equal(app.audio.length, 1);
  assert.equal(app.audio[0].paused, true);
  assert.equal(app.audio[0].currentTime, 0);
  app.audio[0].resolve();
  await pending;
  assert.deepEqual(app.events, []);
  assert.equal(app.buttons[0].innerHTML, '▶️');
});
test('pagehide stops playback and absent analytics is safe', async () => {
  const app = setup({ analytics: false });
  const pending = app.buttons[0].click();
  app.audio[0].resolve();
  await pending;
  app.listeners.pagehide();
  assert.equal(app.audio[0].paused, true);
  assert.equal(app.buttons[0].innerHTML, '▶️');
});

test('observer pauses while play is pending and resumes on rejection', async () => {
  const app = setup();
  const pending = app.buttons[0].click();
  assert.deepEqual(app.referenceStates, [true]);
  app.audio[0].reject(new Error('blocked'));
  await pending;
  assert.deepEqual(app.referenceStates, [true, false]);
});
test('switches notify observer while stale completion never changes state', async () => {
  const app = setup();
  const first = app.buttons[0].click();
  const second = app.buttons[1].click();
  assert.deepEqual(app.referenceStates, [true, false, true]);
  app.audio[0].resolve();
  await first;
  assert.deepEqual(app.referenceStates, [true, false, true]);
  app.listeners.pagehide();
  app.audio[1].resolve();
  await second;
  assert.deepEqual(app.referenceStates, [true, false, true, false]);
});
test('toggling off resumes observer and observer failures cannot break playback', async () => {
  const app = setup();
  const pending = app.buttons[0].click();
  await app.buttons[0].click();
  app.audio[0].resolve();
  await pending;
  assert.deepEqual(app.referenceStates, [true, false]);
  app.document.dispatchEvent = () => { throw new Error('observer unavailable'); };
  const next = app.buttons[0].click();
  app.audio[1].resolve();
  await next;
  assert.equal(app.buttons[0].innerHTML, '⏸️');
  app.listeners.pagehide();
  assert.equal(app.audio[1].paused, true);
});
