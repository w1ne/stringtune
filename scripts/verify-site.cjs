// Verify the built site: metadata, CSP enforcement, install flow and localized pages.
const { chromium } = require('../stringtune/node_modules/playwright');
const assert = require('node:assert/strict');
const base = process.env.TUNER_URL || 'http://127.0.0.1:8094';
(async () => {
 const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
 try {
  const page = await browser.newPage({serviceWorkers: 'block', viewport: {width: 390, height: 844}});
  const production = process.env.TUNER_PRODUCTION === '1';
  const externalScripts = [];
  await page.route('**/*', async route => {
   const request = route.request();
   if (new URL(request.url()).origin === new URL(base).origin) return route.continue();
   if (production && request.resourceType() === 'script') {
    externalScripts.push(request.url());
    return route.fulfill({contentType: 'application/javascript', headers: {'access-control-allow-origin': '*'}, body: 'window.__thirdPartyLoaded = (window.__thirdPartyLoaded || 0) + 1;'});
   }
   return route.abort();
  });
  await page.addInitScript(() => {
   window.__violations = [];
   document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.effectiveDirective));
  });
  for (const path of ['/', '/uk/', '/ar/', '/posts/', '/about/privacy/']) {
   await page.goto(base + path, {waitUntil: 'networkidle'});
   assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://stringtune.com' + path);
   assert.equal(await page.locator('link[rel=manifest]').count(), 1);
   assert.deepEqual(await page.evaluate(() => window.__violations), [], `CSP violations on ${path}`);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow on ${path}`);
  }
  await page.goto(base, {waitUntil: 'networkidle'});
  assert.equal(await page.locator('script[src="/js/production.js"]').count(), production ? 1 : 0);
  if (production) {
   assert.equal(await page.evaluate(() => window.__thirdPartyLoaded), 2);
   assert.ok(externalScripts.some(url => url.startsWith('https://pagead2.googlesyndication.com/')));
   assert.ok(externalScripts.some(url => url.startsWith('https://www.googletagmanager.com/')));
  }
  const manifest = await (await page.request.get(new URL(await page.locator('link[rel=manifest]').getAttribute('href'), base).href)).json();
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  assert.ok(await page.locator('#startButton img').getAttribute('width'));
  assert.ok(await page.locator('#startButton img').getAttribute('height'));
  for (const target of await page.locator('.language-link, .footer li a').all()) {
   const box = await target.boundingBox();
   assert.ok(box.height >= 48, `Small target: ${await target.textContent()}`);
  }
  await page.evaluate(() => {
   const event = new Event('beforeinstallprompt', {cancelable: true});
   event.prompt = () => { window.__prompted = true; };
   event.userChoice = Promise.resolve({outcome: 'dismissed'});
   window.dispatchEvent(event);
  });
  await page.locator('#install-button').click();
  assert.equal(await page.evaluate(() => window.__prompted), true);
  assert.deepEqual(await page.evaluate(() => window.__violations), []);
  // Simulate an HTML injection after the policy, before parser execution.
  await page.route(base + '/', async route => {
   const response = await route.fetch();
   await route.fulfill({response, body: (await response.text()).replace('</head>', '<script>window.__injected = true</script></head>')});
  });
  await page.reload({waitUntil: 'networkidle'});
  assert.ok(await page.evaluate(() => window.__violations.includes('script-src-elem')));
  assert.equal(await page.evaluate(() => window.__injected), undefined);
  console.log('Site metadata, mobile links, install prompt and CSP enforcement passed.');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
