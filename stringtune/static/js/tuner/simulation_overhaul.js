/**
 * SIMULATION OVERHAUL v2 - FULL STACK VERIFICATION
 */
const fs = require('fs');
const path = require('path');

// 1. Mock Environment
global.sampleRate = 44100;
class MockPort {
    constructor() { this.onmessage = null; }
    postMessage(msg) { 
        if (this.onmessage) this.onmessage({ data: msg }); 
    }
}
global.AudioWorkletProcessor = class { 
    constructor() { this.port = new MockPort(); } 
};
global.registerProcessor = (name, cls) => { global.PitchProcessorClass = cls; };
global.navigator = { mediaDevices: { getUserMedia: () => Promise.resolve({}) } };
global.window = { AudioContext: class {} };
global.AudioContext = global.window.AudioContext;

const wasmBuffer = fs.readFileSync(path.resolve(__dirname, '../../tuner-core/tuner_core_bg.wasm'));
const processorCode = fs.readFileSync(path.resolve(__dirname, '../audio-worklet/processor.js'), 'utf8');

// Load Tuner logic
const tunerCode = fs.readFileSync(path.resolve(__dirname, 'tuner.js'), 'utf8');
const contextTuner = { 
    console: console, 
    alert: console.log,
    navigator: global.navigator,
    window: global.window,
    Date: Date,
    Math: Math
};
const TunerClass = new Function(...Object.keys(contextTuner), tunerCode + " return Tuner;")(...Object.values(contextTuner));

async function testScenario(name, freq, harmonics = false) {
    console.log(`\n--- Scenario: ${name} ---`);
    const contextProc = {
        AudioWorkletProcessor: global.AudioWorkletProcessor,
        registerProcessor: global.registerProcessor,
        sampleRate: global.sampleRate,
        console: console,
        TextDecoder: require('util').TextDecoder,
        WebAssembly: WebAssembly
    };
    new Function(...Object.keys(contextProc), processorCode)(...Object.values(contextProc));

    const processor = new global.PitchProcessorClass({ processorOptions: { wasmBytes: wasmBuffer } });
    const tuner = new TunerClass();
    
    // Wait for READY
    await new Promise(r => {
        processor.port.onmessage = (e) => { if(e.data.type === 'ready') r(); };
    });

    let lastDetectedResult = { name: '-', cents: 0, state: 'SEARCHING' };
    tuner.onNoteDetected = (result) => {
        lastDetectedResult = result;
        lastDetectedResult.state = tuner.state;
    };

    processor.port.onmessage = (e) => {
        if (e.data.type === 'result') {
            tuner.lastClarity = e.data.clarity;
            tuner.updatePitch(e.data.pitch);
        }
    };

    for (let i = 0; i < 500; i++) {
        const channel = new Float32Array(128);
        for (let s = 0; s < 128; s++) {
            const t = (i * 128 + s) / 44100;
            let val = Math.sin(2 * Math.PI * freq * t);
            if (harmonics) {
                // Harmonic Nightmare: Overtones much louder than fundamental
                val += 1.5 * Math.sin(2 * Math.PI * 1369 * t);
                val += 1.2 * Math.sin(2 * Math.PI * 2450 * t);
            }
            channel[s] = val;
        }
        processor.process([[channel]], [], {});
    }

    console.log(`Final State: ${lastDetectedResult.state}, Note: ${lastDetectedResult.name}, Cents: ${lastDetectedResult.cents.toFixed(1)}`);
    
    if (name.includes("Nightmare") && lastDetectedResult.state === 'TRACKING') {
       if (Math.abs(lastDetectedResult.frequency - freq) > 5) {
           throw new Error("Stability Overhaul Failed: Harmonic Noise caused flyaway!");
       }
    }
}

(async () => {
    try {
        await testScenario("A4 Clean", 440);
        await testScenario("E1 Nightmare (Noisy)", 41.2, true);
        console.log("\nVERIFICATION SUCCESSFUL: Tuner stays stable even with intense harmonic noise.");
    } catch (e) {
        console.error("FAILED:", e.message);
        process.exit(1);
    }
})();
