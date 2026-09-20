// Route a production-origin browser entirely to the local build. Third-party
// scripts are stubs: this validates emitted GA commands, not live GA ingestion.
const {chromium} = require('../stringtune/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.TUNER_URL || 'http://127.0.0.1:8094';
const origin = 'https://stringtune.com';
(async () => {
 const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
 try {
  const context = await browser.newContext({serviceWorkers: 'block', viewport: {width: 390, height: 844}});
  await context.route('**/*', async route => {
   const url = new URL(route.request().url());
   if (url.origin === origin) {
    const response = await route.fetch({url: base + url.pathname + url.search});
    return route.fulfill({response});
   }
   if (url.hostname === 'www.googletagmanager.com' || url.hostname === 'pagead2.googlesyndication.com') {
    return route.fulfill({contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'}, body: '/* Analytics/ads stub: never contact the live collection endpoints. */'});
   }
   return route.abort();
  });
  await context.addInitScript(() => {
   window.__micMode = 'denied';
   navigator.mediaDevices.getUserMedia = async () => {
    if (window.__micMode === 'denied') throw new DOMException('Do not collect this message', 'NotAllowedError');
    const context = new AudioContext(); const oscillator = context.createOscillator();
    const gain = context.createGain(); const output = context.createMediaStreamDestination();
    gain.gain.value = window.__micMode === 'silent' ? 0 : 0.2;
    oscillator.frequency.value = 110;
    oscillator.connect(gain);gain.connect(output);oscillator.start();await context.resume();
    window.__input = {context, stream: output.stream};return output.stream;
   };
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.install();
  await page.goto(origin, {waitUntil: 'networkidle'});
  const events = () => page.evaluate(() => (window.dataLayer || []).filter(args => args[0] === 'event').map(args => ({name: args[1], params: args[2]})));
  const count = async name => (await events()).filter(e => e.name === name).length;
  assert.equal(await page.evaluate(() => window.dataLayer.filter(args => args[0] === 'config').length), 1);
  await page.locator('#startButton').click();
  await page.waitForFunction(() => app.tuner.state === 'error');
  const denied = (await events()).find(e => e.name === 'tuner_error');
  assert.equal(denied.params.reason, 'not_allowed');assert.equal(denied.params.stage, 'microphone');
  assert.equal(JSON.stringify(await events()).includes('Do not collect'), false);
  await page.selectOption('#instrumentSelect', 'bass');assert.equal(await count('instrument_change'), 1);
  await page.evaluate(() => window.__micMode = 'silent');await page.locator('#startButton').click();
  await page.waitForFunction(() => app.tuner.state === 'listening');
  // Use a virtual timer for the observation period, not a 15-second real delay.
  await page.evaluate(() => app.syncUsageListening());
  await page.clock.fastForward(15100);
  assert.equal(await count('tuner_no_note'), 1);
  await page.locator('#stopButton').click();await page.evaluate(() => window.__input.context.close());
  await page.evaluate(() => window.__micMode = 'tone');await page.locator('#startButton').click();
  await page.waitForFunction(() => app.usage.hasNote, {}, {timeout: 15000});
  assert.equal(await count('tuner_first_note'), 1);
  await page.locator('#stopButton').click();await page.evaluate(() => window.__input.context.close());
  await page.locator('#stringTargets button').first().click();
  await page.waitForFunction(() => !!app.tuner.oscillator);
  assert.equal(await count('reference_play'), 1);await page.locator('#stopButton').click();
  // A reference recording must not become the user's first microphone note.
  await page.evaluate(() => {window.Audio = class {play() {return Promise.resolve();} pause() {}};});
  await page.locator('[data-sound]').first().click();
  await page.locator('#startButton').click();
  await page.waitForFunction(() => app.tuner.state === 'listening' && app.recordingReferenceActive);
  await page.clock.fastForward(16000);
  assert.equal(await count('tuner_first_note'), 1);
  assert.equal(await count('tuner_no_note'), 1);
  await page.locator('[data-sound]').first().click();
  await page.waitForFunction(() => app.usage.hasNote, {}, {timeout: 15000});
  assert.equal(await count('tuner_first_note'), 2);
  await page.locator('#stopButton').click();await page.evaluate(() => window.__input.context.close());

  // Exercise the recording controls while keeping actual sound/file decoding out of this check.
  await page.evaluate(() => { window.Audio = class {play() {return Promise.resolve();} pause() {}}; });
  await page.locator('[data-sound]').first().click();
  await page.waitForFunction(() => window.dataLayer.some(args => args[1] === 'reference_play' && args[2].source === 'recording'));
  await page.locator('[data-sound]').first().click();
  assert.equal(await page.locator('#tunerFeedback').getAttribute('href'), 'https://strungtune.canny.io/bug-or-idea');
  await page.locator('#tunerFeedback').evaluate(link => link.addEventListener('click', e => e.preventDefault()));
  await page.locator('#tunerFeedback').click();assert.equal(await count('feedback_open'), 1);
  await page.evaluate(() => {
   const event = new Event('beforeinstallprompt', {cancelable: true});
   event.prompt = () => { window.__prompts = (window.__prompts || 0) + 1; };
   event.userChoice = Promise.resolve({outcome: 'accepted'});window.dispatchEvent(event);
  });
  await page.locator('#installAppBtn').click();assert.equal(await count('install_prompt_result'), 1);
  assert.equal(await count('app_installed'), 0);
  await page.evaluate(() => {window.dispatchEvent(new Event('appinstalled'));window.dispatchEvent(new Event('appinstalled'));});
  assert.equal(await count('app_installed'), 1);assert.equal(await count('conversion'), 0);
  // A broken transport must not stop the user from retrying audio.
  await page.evaluate(() => {window.gtag = () => {throw new Error('blocked transport');};});
  await page.locator('#stringTargets button').first().click();await page.waitForFunction(() => !!app.tuner.oscillator);
  await page.locator('#stopButton').click();
  assert.deepEqual(errors, []);
  console.log('Usage milestones, no-note/errors, references, feedback and confirmed install passed; no live analytics traffic.');
 } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
