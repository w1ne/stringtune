// Run against a Hugo build served locally. Capture uses a synthesized browser
// MediaStream: this verifies the real AudioWorklet/WASM path, not a physical mic.
const {chromium} = require('../stringtune/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.TUNER_URL || 'http://127.0.0.1:8094';
(async () => {
 const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 try {
 const context = await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
 const fakeMicrophone = () => {
  window.__micMode = 'denied';
  navigator.mediaDevices.getUserMedia = async () => {
   if(window.__micMode === 'denied') throw new DOMException('Permission denied','NotAllowedError');
   const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
   const output = context.createMediaStreamDestination(); gain.gain.value = 0.2; oscillator.frequency.value = 110;
   oscillator.connect(gain); gain.connect(output); oscillator.start(); await context.resume();
   window.__input = {context,oscillator,gain,stream:output.stream}; return output.stream;
  };
 };
 await context.addInitScript(fakeMicrophone);
 const page = await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for (const width of [320,390,768,1280]) {
  await page.setViewportSize({width,height:844});await page.goto(base,{waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor),'rgb(18, 18, 18)', 'Stylesheet must be applied');
  const size=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}));
  assert.ok(size.page<=width,`Overflow at ${width}: ${size.page}`);
  assert.equal(await page.locator('#freqValue').textContent(),'—');
 }
 await page.setViewportSize({width:390,height:844});
 await page.reload({waitUntil:'networkidle'});
 await page.locator('#stringTargets button').first().click();
 await page.waitForFunction(()=>app.tuner.oscillator && !app.notes.isAutoMode);
 assert.equal(await page.evaluate(()=>app.tuner.stream == null),true);
 await page.locator('#stopButton').click();
 assert.equal(await page.evaluate(()=>app.tuner.oscillator),null);
 await page.selectOption('#instrumentSelect','bass');assert.equal(await page.locator('#stringTargets button').count(),4);
 await page.locator('#calibrationButton').click();await page.locator('#calibrationInput').fill('-440');await page.locator('#calibrationDialog button[type=submit]').click();
 assert.equal(await page.evaluate(()=>app.a4),440);
 await page.locator('#calibrationInput').fill('442');await page.locator('#calibrationDialog button[type=submit]').click();
 assert.equal(await page.evaluate(()=>app.a4),442);
 await page.locator('#calibrationButton').click();await page.locator('#calibrationInput').fill('440');await page.locator('#calibrationDialog button[type=submit]').click();
 await page.locator('#startButton').click();await page.waitForFunction(()=>app.tuner.state==='error');
 assert.equal(await page.locator('#startButton').isVisible(),true); assert.equal(await page.locator('#startButton').isEnabled(),true);
 await page.evaluate(()=>window.__micMode='allowed');await page.locator('#startButton').click();
 await page.waitForFunction(()=>app.tuner.state==='listening' && Math.abs(Number(document.querySelector('#freqValue').textContent)-110)<0.3,{},{timeout:15000});
 const tuning=await page.locator('#freqValue').textContent();
 await page.evaluate(()=>window.__input.gain.gain.value=0);await page.waitForFunction(()=>document.querySelector('#freqValue').textContent==='—',{},{timeout:5000});
 await page.locator('#stopButton').click();assert.equal(await page.evaluate(()=>window.__input.stream.getTracks()[0].readyState),'ended');
 await page.evaluate(()=>window.__input.context.close());
 await page.screenshot({path:process.env.TUNER_SCREENSHOT || '/tmp/stringtune-fixed-mobile.png',fullPage:true});
 const offlineContext = await browser.newContext({serviceWorkers:'allow'});
 await offlineContext.addInitScript(fakeMicrophone);
 const offlinePage = await offlineContext.newPage();
 offlinePage.on('pageerror', error => errors.push(error.message));
 await offlinePage.goto(base, {waitUntil:'networkidle'});
 await offlinePage.waitForFunction(() => !!navigator.serviceWorker.controller, {}, {timeout:15000});
 await offlineContext.setOffline(true);
 await offlinePage.reload({waitUntil:'domcontentloaded'});
 await offlinePage.evaluate(() => window.__micMode='allowed');
 await offlinePage.locator('#startButton').click();
 await offlinePage.waitForFunction(() => app.tuner.state==='listening' && Number(document.querySelector('#freqValue').textContent)>100, {}, {timeout:15000});
 await offlinePage.locator('#stopButton').click();
 await offlinePage.evaluate(() => window.__input.context.close());
 await offlineContext.close();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({viewports:[320,390,768,1280],manualPlayback:true,presets:true,calibration:true,permissionRetry:true,realWorkletSyntheticHz:tuning,silence:true,tracksStopped:true,offlineStartup:true,browserErrors:errors},null,2));
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
