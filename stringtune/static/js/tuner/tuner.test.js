const fs = require('fs');
const path = require('path');
function load(file, name) {
  window.eval(fs.readFileSync(path.join(__dirname, file), 'utf8') + `\nwindow.${name} = ${name};`);
}
beforeAll(() => {
  window.requestAnimationFrame = jest.fn();
  HTMLElement.prototype.scrollTo = jest.fn();
  window.eval(fs.readFileSync(path.join(__dirname, 'usage.js'), 'utf8'));
  load('tuner.js', 'Tuner'); load('notes.js', 'Notes'); load('meter.js', 'Meter');
  window.FrequencyLines = function () { this.update = jest.fn(); this.clear = jest.fn(); };
  window.eval(fs.readFileSync(path.join(__dirname, 'application.js'), 'utf8').replace(/const app = new Application\(\);\s*app.start\(\);?/, '') + '\nwindow.Application = Application;');
});
beforeEach(() => {
  jest.useFakeTimers({doNotFake: ['requestAnimationFrame']}); localStorage.clear();
  window.StringTuneAnalytics = {track: jest.fn()};
  document.body.innerHTML = `<div class="tuner"><div class="meter"><button id="startButton"><p>Start</p></button><div class="meter-pointer"></div><div id="tunedArea"></div></div>
  <div class="notes"><div class="notes-list"></div><div id="freqValue"></div></div>
  <div class="a4"><button id="calibrationButton"><span>440</span></button></div>
  <label class="auto"><input type="checkbox" checked></label><select id="instrumentSelect"><option value="guitar">Guitar</option><option value="bass">Bass</option><option value="ukulele">Ukulele</option></select>
  <div id="stringTargets"></div><p id="tunerStatus" role="status"></p><button id="stopButton" hidden>Stop</button></div><button id="installAppBtn"></button>`;
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
test('idle and invalid saved calibration do not fabricate a measurement', () => {
  localStorage.setItem('a4', '-440'); const app = new window.Application();
  expect(app.a4).toBe(440); expect(document.querySelector('#freqValue').textContent).toBe('—');
  expect(document.querySelector('.note.active')).toBeNull();
});
test('preset targets change, while chromatic detection remains available', () => {
  const app = new window.Application(); app.start();
  expect(document.querySelectorAll('#stringTargets button')).toHaveLength(6);
  const select = document.querySelector('#instrumentSelect'); select.value = 'bass'; select.dispatchEvent(new Event('change'));
  expect([...document.querySelectorAll('#stringTargets button')].map(b => Number(b.dataset.value))).toEqual([28,33,38,43]);
  app.notes.update({value:41, frequency:87.31}); expect(document.querySelector('#freqValue').textContent).toBe('87.3');
});
test('rebuilding notes does not retain detached elements or duplicate listeners', () => {
  const tuner = new window.Tuner(); const notes = new window.Notes('.notes', tuner);
  notes.createNotes(); notes.createNotes(); expect(notes.$notes).toHaveLength(96);
});
test('pending startup stays visible, permission failure offers retry', async () => {
  const app = new window.Application(); app.start(); let reject;
  app.tuner.init = jest.fn(() => new Promise((_, r) => reject = r));
  const button = document.querySelector('#startButton'); button.click();
  expect(button.style.display).not.toBe('none'); expect(button.disabled).toBe(true);
  reject(new Error('permission denied')); await Promise.resolve(); await Promise.resolve();
  expect(button.disabled).toBe(false); expect(button.style.display).not.toBe('none');
  expect(document.querySelector('#tunerStatus').textContent).toMatch(/permission denied/i);
});
test('valid readings expire on silence and clear detector history', () => {
  const app = new window.Application(); app.start(); app.tuner.state = 'listening';
  app.tuner.stableFrequency = 440; app.update({name:'A',value:69,frequency:440,cents:0});
  expect(document.querySelector('#freqValue').textContent).toBe('440.0');
  jest.advanceTimersByTime(1600); expect(document.querySelector('#freqValue').textContent).toBe('—');
  expect(app.tuner.stableFrequency).toBeNull();
});
test('meter renders neutral on initialization and rejects nonfinite updates', () => {
  const meter = new window.Meter('.meter'); expect(document.querySelector('.meter-pointer').style.transform).toBe('rotate(0deg)');
  meter.update(NaN); meter.tick(); expect(Number.isFinite(meter.currentDeg)).toBe(true);
});
test('an exactly centered first reading shows tuned feedback', () => {
  const meter = new window.Meter('.meter'); meter.update(0); meter.tick();
  expect(document.getElementById('tunedArea').style.visibility).toBe('visible');
  meter.reset(); meter.tick(); expect(document.getElementById('tunedArea').style.visibility).toBe('hidden');
});

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
test('real application wires startup milestones once and resumes no-note observation after manual mode', async () => {
  const app = new window.Application(); app.start();
  app.tuner.init = jest.fn(async () => {
    app.tuner.onMicrophoneReady(); app.tuner.state = 'listening';
    app.tuner.analyser = {frequencyBinCount: 32, disconnect() {}, getByteFrequencyData() {}};
  });
  document.querySelector('#startButton').click(); await flush();
  expect(window.StringTuneAnalytics.track.mock.calls.map(c => c[0])).toEqual(['tuner_start','tuner_mic_ready','tuner_ready']);
  const auto = document.querySelector('.auto input'); auto.checked = false; auto.dispatchEvent(new Event('change'));
  jest.advanceTimersByTime(20000);
  expect(window.StringTuneAnalytics.track.mock.calls.some(c => c[0] === 'tuner_no_note')).toBe(false);
  auto.checked = true; auto.dispatchEvent(new Event('change')); jest.advanceTimersByTime(15000);
  expect(window.StringTuneAnalytics.track.mock.calls.filter(c => c[0] === 'tuner_no_note')).toHaveLength(1);
  const note = {name: 'A', value: 69, frequency: 440, cents: 0};
  app.tuner.onNoteDetected(note); app.tuner.onNoteDetected(note);
  expect(window.StringTuneAnalytics.track.mock.calls.filter(c => c[0] === 'tuner_first_note')).toHaveLength(1);
  app.stop();
  expect(window.StringTuneAnalytics.track.mock.calls.at(-1)[1].outcome).toBe('note_detected');
});
test('instrument initialization is not a user change and analytics exceptions do not block controls', async () => {
  const app = new window.Application(); app.start();
  expect(window.StringTuneAnalytics.track).not.toHaveBeenCalled();
  window.StringTuneAnalytics.track.mockImplementation(() => { throw new Error('blocked'); });
  const select = document.querySelector('#instrumentSelect'); select.value = 'bass';
  expect(() => select.dispatchEvent(new Event('change'))).not.toThrow();
  expect(app.notes.instrument).toBe('bass');
  app.tuner.init = jest.fn(async () => { throw Object.assign(new Error('private details'), {name: 'NotAllowedError'}); });
  document.querySelector('#startButton').click(); await flush();
  expect(document.querySelector('#startButton').disabled).toBe(false);
  expect(document.querySelector('#startButton').style.display).not.toBe('none');
});
test('recorded references pause no-note observation and cannot become the first microphone note', async () => {
  const app = new window.Application(); app.start();
  app.tuner.init = jest.fn(async () => {
    app.tuner.onMicrophoneReady(); app.tuner.state = 'listening';
    app.tuner.analyser = {frequencyBinCount: 32, disconnect() {}, getByteFrequencyData() {}};
  });
  document.querySelector('#startButton').click(); await flush();
  document.dispatchEvent(new CustomEvent('stringtune:reference', {detail: {playing: true}}));
  app.tuner.onNoteDetected({name: 'A', value: 69, frequency: 440, cents: 0});
  jest.advanceTimersByTime(20000);
  expect(window.StringTuneAnalytics.track.mock.calls.some(c => ['tuner_first_note','tuner_no_note'].includes(c[0]))).toBe(false);
  document.dispatchEvent(new CustomEvent('stringtune:reference', {detail: {playing: false}}));
  app.tuner.onNoteDetected({name: 'A', value: 69, frequency: 440, cents: 0});
  expect(window.StringTuneAnalytics.track.mock.calls.filter(c => c[0] === 'tuner_first_note')).toHaveLength(1);
  app.stop();
});
