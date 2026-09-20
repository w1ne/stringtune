const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '../../stringtune/static/js/', file), 'utf8');
function setup({host = 'stringtune.com', enabled = true, online = true} = {}) {
 const env = {console, navigator: {onLine: online}, location: {hostname: host}, document: {
  documentElement: {lang: 'en'}, querySelector: () => ({content: enabled ? 'enabled' : 'disabled'})
 }, matchMedia: () => ({matches: false})};
 env.window = env; vm.createContext(env); vm.runInContext(read('analytics.js'), env);
 return env;
}
test('analytics only initializes on an online production runtime and build', () => {
 for (const options of [{host: 'localhost'}, {enabled: false}, {online: false}]) {
  const env = setup(options); env.StringTuneAnalytics.track('tuner_start', {instrument: 'guitar'});
  assert.equal(env.dataLayer, undefined);
 }
 const env = setup(); assert.equal(env.dataLayer.filter(args => args[0] === 'config').length, 1);
});
test('event boundary drops raw data, unknown events, and unbounded values', () => {
 const env = setup(); const start = env.dataLayer.length;
 env.StringTuneAnalytics.track('tuner_error', {instrument: 'bass', stage: 'microphone', reason: 'not_allowed', elapsed_ms: 1e20, audio: 'secret', message: 'device serial 123', note: 69});
 env.StringTuneAnalytics.track('unexpected', {message: 'secret'});
 const event = env.dataLayer.at(-1); assert.equal(env.dataLayer.length, start + 1);
 assert.equal(event[1], 'tuner_error');
 assert.deepEqual(Object.keys(event[2]).sort(), ['app_mode', 'elapsed_ms', 'instrument', 'locale', 'reason', 'schema_version', 'stage'].sort());
 assert.equal(event[2].elapsed_ms, 3600000);
 env.StringTuneAnalytics.track('instrument_change', {instrument: 'secret user input', elapsed_ms: NaN});
 assert.equal(env.dataLayer.at(-1)[2].instrument, undefined);
 assert.equal(env.dataLayer.at(-1)[2].elapsed_ms, undefined);
});
test('offline, blocked, or throwing analytics cannot interrupt application calls', () => {
 const env = setup(); const n = env.dataLayer.length;
 env.navigator.onLine = false; env.StringTuneAnalytics.track('tuner_start'); assert.equal(env.dataLayer.length, n);
 env.navigator.onLine = true; env.gtag = () => { throw new Error('blocked'); };
 assert.doesNotThrow(() => env.StringTuneAnalytics.track('tuner_start'));
 env.gtag = undefined; assert.doesNotThrow(() => env.StringTuneAnalytics.track('tuner_start'));
});
function attempt() {
 let now = 0, next = 0; const timers = new Map(), events = [];
 const env = {window: {}, performance: {now: () => now}, setTimeout: (fn, delay) => {timers.set(++next, {fn, time: now + delay}); return next;}, clearTimeout: id => timers.delete(id)};
 vm.createContext(env); vm.runInContext(read('tuner/usage.js'), env);
 const usage = new env.window.TuningUsage((name, params) => events.push({name, params}));
 return {usage, events, tick(ms) { now += ms; for (const [id, timer] of timers) if(timer.time <= now) {timers.delete(id); timer.fn();} }};
}
test('attempt milestones are once-only and timings do not include another attempt', () => {
 const {usage, events, tick} = attempt(); usage.start('guitar');tick(120); usage.microphoneReady(); usage.microphoneReady();
 usage.ready();usage.ready(); tick(150); usage.note(); usage.note();tick(20000);usage.finish('stop');usage.finish('pagehide');
 assert.deepEqual(events.map(e => e.name), ['tuner_start','tuner_mic_ready','tuner_ready','tuner_first_note','tuner_end']);
 assert.equal(events[3].params.elapsed_ms, 270); assert.equal(events[4].params.outcome, 'note_detected');
 usage.start('bass');tick(50);usage.microphoneReady();assert.equal(events.at(-1).params.elapsed_ms, 50);
});
test('no-note timeout excludes permission waiting, paused/manual/background listening and stopped attempts', () => {
 const {usage, events, tick} = attempt();usage.start('guitar');tick(30000);
 assert.equal(events.length,1);usage.ready();tick(14000);usage.setListening(false);tick(30000);
 assert.equal(events.some(e=>e.name==='tuner_no_note'),false);
 usage.setListening(true);tick(14999);assert.equal(events.some(e=>e.name==='tuner_no_note'),false);
 tick(1);tick(30000);assert.equal(events.filter(e=>e.name==='tuner_no_note').length,1);
 usage.finish('stop'); usage.start('bass');usage.ready();usage.finish('stop');tick(20000);
 assert.equal(events.filter(e=>e.name==='tuner_no_note').length,1);
});
test('errors finish attempts once with controlled stage/reason and no exception text', () => {
 const {usage, events, tick} = attempt();usage.start('ukulele');tick(30);
 usage.error({name:'NotAllowedError',message:'private information'}, 'microphone');
 usage.error(new Error('again'), 'worklet');tick(20000);
 assert.deepEqual(events.map(e=>e.name),['tuner_start','tuner_error','tuner_end']);
 assert.equal(events[1].params.reason,'not_allowed');assert.equal(events[2].params.outcome,'error');
 assert.equal(JSON.stringify(events).includes('private information'),false);
});
test('redundant listening updates do not postpone timeout and paused notes do not count', () => {
 const {usage, events, tick} = attempt();usage.start('guitar');usage.ready();tick(14000);
 usage.setListening(true);tick(1000);assert.equal(events.filter(e=>e.name==='tuner_no_note').length,1);
 usage.setListening(false);usage.note();assert.equal(events.some(e=>e.name==='tuner_first_note'),false);
 usage.setListening(true);usage.note();assert.equal(events.filter(e=>e.name==='tuner_first_note').length,1);
});
test('blocked tags cannot grow the custom event queue without bound', () => {
 const env = setup();for(let i=0;i<250;i++) env.StringTuneAnalytics.track('reference_play', {source:'tuner'});
 assert.equal(env.dataLayer.filter(args=>args[0]==='event').length,200);
});
