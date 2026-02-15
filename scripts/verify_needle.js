const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("Loading Tuner...");
    await page.goto('http://localhost:1313');

    // 1. Check for Wasm load success
    const wasmLoaded = await page.evaluate(async () => {
        const tuner = window.tuner;
        if (!tuner) return "Tuner not found";
        return tuner.workletNode ? "Worklet OK" : "Worklet Pending";
    });
    console.log("Status:", wasmLoaded);

    // 2. Inject Mock Audio via AudioContext
    console.log("Injecting Mock 440Hz Signal...");
    await page.evaluate(() => {
        if (!window.tuner || !window.tuner.audioContext) return;
        const ctx = window.tuner.audioContext;
        const oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, ctx.currentTime);

        // Connect directly to the Worklet
        if (window.tuner.workletNode) {
            oscillator.connect(window.tuner.workletNode);
            oscillator.start();
        }
    });

    // 3. Wait and check needle motion
    await new Promise(r => setTimeout(r, 2000));

    const needleState = await page.evaluate(() => {
        const needle = document.querySelector('.meter-pointer');
        const note = document.querySelector('.note-name')?.innerText;
        return {
            transform: needle?.style.transform,
            note: note,
            targetDeg: window.meter?.targetDeg,
            currentDeg: window.meter?.currentDeg
        };
    });

    console.log("Needle State:", needleState);

    if (needleState.transform && needleState.transform !== "rotate(0deg)") {
        console.log("✅ SUCCESS: Needle is moving!");
    } else {
        console.log("❌ FAILURE: Needle is static.");
        process.exit(1);
    }

    await browser.close();
})();
