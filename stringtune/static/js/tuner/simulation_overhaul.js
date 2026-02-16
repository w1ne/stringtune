/**
 * SIMULATION OVERHAUL v4 - THE "USER NIGHTMARE"
 * Reproducing E1 (41Hz) locking to A5 (880Hz)
 */
const fs = require('fs');
const path = require('path');

global.sampleRate = 44100;
class MockPort { constructor() { this.onmessage = null; } postMessage(msg) { if(this.onmessage) this.onmessage({data: msg}); } }
global.AudioWorkletProcessor = class { constructor() { this.port = new MockPort(); } };
global.registerProcessor = (name, cls) => { global.PitchProcessorClass = cls; };
global.navigator = { mediaDevices: { getUserMedia: () => Promise.resolve({}) } };
global.window = { AudioContext: class {} };
global.AudioContext = global.window.AudioContext;

const wasmBuffer = fs.readFileSync(path.resolve(__dirname, '../../tuner-core/tuner_core_bg.wasm'));
const processorCode = fs.readFileSync(path.resolve(__dirname, '../audio-worklet/processor.js'), 'utf8');
const tunerCode = fs.readFileSync(path.resolve(__dirname, 'tuner.js'), 'utf8');

const contextTuner = { console: console, alert: console.log, navigator: global.navigator, window: global.window, Date: Date, Math: Math };
const TunerClass = new Function(...Object.keys(contextTuner), tunerCode + " return Tuner;")(...Object.values(contextTuner));

async function runSimulation(noiseLevel = 1.0) {
    console.log(`\n--- Nightmare Test: E1 (41Hz) + A5 (880Hz) Noise (Level: ${noiseLevel}) ---`);
    const contextProc = { AudioWorkletProcessor: global.AudioWorkletProcessor, registerProcessor: global.registerProcessor, sampleRate: global.sampleRate, console: console, TextDecoder: require('util').TextDecoder, WebAssembly: WebAssembly };
    new Function(...Object.keys(contextProc), processorCode)(...Object.values(contextProc));

    const processor = new global.PitchProcessorClass({ processorOptions: { wasmBytes: wasmBuffer } });
    const tuner = new TunerClass();
    
    await new Promise(r => { processor.port.onmessage = (e) => { if(e.data.type === 'ready') r(); }; });

    let latest = { name: '-', cents: 0, frequency: 0 };
    tuner.onNoteDetected = (result) => { latest = result; };

    processor.port.onmessage = (e) => {
        if (e.data.type === 'result') {
            tuner.lastClarity = e.data.clarity;
            tuner.updatePitch(e.data.pitch);
        }
    };

    // 1 second of audio
    for (let i = 0; i < Math.ceil(44100 / 128); i++) {
        const channel = new Float32Array(128);
        for (let s = 0; s < 128; s++) {
            const t = (i * 128 + s) / 44100;
            // E1 Fundamental (Weak)
            let val = 0.5 * Math.sin(2 * Math.PI * 41.2 * t);
            // A5 Harmonic/Noise (Dominant)
            val += noiseLevel * Math.sin(2 * Math.PI * 880.0 * t);
            // DC Offset
            val += 0.05; 
            channel[s] = val;
        }
        processor.process([[channel]], [], {});
        if (i > 100 && latest.frequency > 800) {
            console.log(`[FAIL REPRODUCED] Detected ${latest.name} (${latest.frequency.toFixed(1)}Hz) instead of E1!`);
            return false;
        }
    }
    console.log(`Final Detection: ${latest.name} (${latest.frequency.toFixed(1)}Hz)`);
    return latest.name === 'E' && latest.frequency < 60;
}

(async () => {
    const success = await runSimulation(1.5);
    if (!success) {
        console.log("\nHYPOTHESIS CONFIRMED: Tuner fails on high-noise E1.");
        process.exit(0); // Exit 0 because we reproduced the problem
    } else {
        console.log("\nHypothesis Failed: Tuner already handles this? Check user environemnt.");
        process.exit(1);
    }
})();
