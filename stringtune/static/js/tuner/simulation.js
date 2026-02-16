/**
 * SIMULATION TEST DRIVER v3 - HARMONIC NIGHTMARE
 */
const fs = require('fs');
const path = require('path');

// Mock Environment
global.AudioWorkletProcessor = class {};
global.registerProcessor = (name, cls) => { global.PitchProcessorClass = cls; };
global.sampleRate = 44100;

const wasmPath = path.resolve(__dirname, '../../tuner-core/tuner_core_bg.wasm');
const wasmBuffer = fs.readFileSync(wasmPath);
const processorCode = fs.readFileSync(path.resolve(__dirname, '../audio-worklet/processor.js'), 'utf8');

async function runSimulation(name, frequency, includeHarmonics = false) {
    console.log(`\n--- Starting: ${name} (${frequency}Hz, harmonics=${includeHarmonics}) ---`);
    global.PitchProcessorClass = null;

    const context = {
        AudioWorkletProcessor: global.AudioWorkletProcessor,
        registerProcessor: global.registerProcessor,
        sampleRate: global.sampleRate,
        console: console,
        TextDecoder: require('util').TextDecoder,
        WebAssembly: WebAssembly,
    };

    const fn = new Function(...Object.keys(context), processorCode);
    fn(...Object.values(context));

    const processor = new global.PitchProcessorClass({ processorOptions: { wasmBytes: wasmBuffer } });
    processor.bufferSize = 4096;
    processor.buffer = new Float32Array(4096);

    let lastPitch = 0;
    processor.port.onmessage = (msg) => {
        if (msg.type === 'result') {
            lastPitch = msg.pitch;
            console.log(`[SIM] ${msg.pitch.toFixed(1)}Hz (clarity: ${msg.clarity.toFixed(2)})`);
        }
    };

    // Simulate audio
    const blocks = 50;
    for (let i = 0; i < blocks; i++) {
        const channel = new Float32Array(128);
        for (let s = 0; s < 128; s++) {
            const time = (i * 128 + s) / 44100;
            let val = Math.sin(2 * Math.PI * frequency * time);
            if (includeHarmonics) {
                // Harmonic Nightmare: Overtones louder than fundamental
                val += 1.5 * Math.sin(2 * Math.PI * (frequency * 2) * time);
                val += 1.2 * Math.sin(2 * Math.PI * (frequency * 3) * time);
            }
            channel[s] = val;
        }
        processor.process([[channel]], [], {});
    }
    
    if (Math.abs(lastPitch - frequency) > 5) {
        throw new Error(`Misdetected: expected ~${frequency}Hz, got ${lastPitch.toFixed(1)}Hz`);
    }
}

(async () => {
    try {
        await runSimulation("Standard A4", 440);
        await runSimulation("E1 Fundamental", 41.2);
        await runSimulation("E1 Harmonic Confusion", 41.2, true);
        console.log("\nSUCCESS: All detection scenarios passed.");
    } catch (e) {
        console.error("\nFAILURE:", e.message);
        process.exit(1);
    }
})();
