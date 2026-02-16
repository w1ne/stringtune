/**
 * SIMULATION TEST DRIVER v2
 * This script runs the real PitchProcessor logic in Node.js with the real WASM.
 */
const fs = require('fs');
const path = require('path');
const { WebAssembly } = require('worker_threads'); // Use standard WebAssembly if available

// 1. Mock Environment
class MockAudioWorkletProcessor {
    constructor() {
        this.port = {
            postMessage: (msg) => {
                if (this.port.onmessage) this.port.onmessage(msg);
            },
            onmessage: null
        };
    }
}
global.AudioWorkletProcessor = MockAudioWorkletProcessor;
global.registerProcessor = (name, cls) => { global.PitchProcessorClass = cls; };
global.sampleRate = 44100;

// 2. Load processor.js and WASM
const wasmPath = path.resolve(__dirname, '../../tuner-core/tuner_core_bg.wasm');
const wasmBuffer = fs.readFileSync(wasmPath);
const processorCode = fs.readFileSync(path.resolve(__dirname, '../audio-worklet/processor.js'), 'utf8');

// 3. Execution Helper
async function runSimulation(fftSize, frequency) {
    console.log(`\n--- Starting Simulation: FFT=${fftSize}, Freq=${frequency}Hz ---`);

    // Reset global class
    global.PitchProcessorClass = null;

    // Evaluate processor.js
    const context = {
        AudioWorkletProcessor: global.AudioWorkletProcessor,
        registerProcessor: global.registerProcessor,
        sampleRate: global.sampleRate,
        console: console, // Use real console
        TextDecoder: require('util').TextDecoder,
        WebAssembly: global.WebAssembly || require('vm').runInNewContext('WebAssembly'),
    };

    try {
        const fn = new Function(...Object.keys(context), processorCode);
        fn(...Object.values(context));
    } catch (e) {
        console.error("Evaluation failed:", e);
        return false;
    }

    const options = {
        processorOptions: { wasmBytes: wasmBuffer }
    };

    // Force FFT size in code if necessary or just trust constructor
    console.log("Creating processor...");
    const processor = new global.PitchProcessorClass(options);
    processor.bufferSize = fftSize;
    processor.buffer = new Float32Array(fftSize);

    // Wait for READY
    console.log("Waiting for 'ready' message...");
    let isReady = false;
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject("Timeout waiting for WASM init"), 5000);
        processor.port.onmessage = (msg) => {
            if (msg.type === 'result') {
                console.log(`[SIM] Result: ${msg.pitch.toFixed(1)}Hz (clarity: ${msg.clarity.toFixed(2)})`);
            }
            if (msg.type === 'ready') {
                isReady = true;
                clearTimeout(timeout);
                resolve();
            }
            if (msg.type === 'error') {
                clearTimeout(timeout);
                console.error("Processor reported error:", msg.error);
                reject(msg.error);
            }
        };
    });

    // Feed some audio (sine wave)
    const samplesPerChannel = 128;
    const iterations = Math.ceil(fftSize / samplesPerChannel) + 10;

    console.log(`Feeding ${iterations} blocks of audio...`);

    for (let i = 0; i < iterations; i++) {
        const channel = new Float32Array(samplesPerChannel);
        for (let s = 0; s < samplesPerChannel; s++) {
            const time = (i * samplesPerChannel + s) / global.sampleRate;
            // E1 + Harmonics (Rich spectrum)
            channel[s] = 1.0 * Math.sin(2 * Math.PI * frequency * time) +
                0.5 * Math.sin(2 * Math.PI * (frequency * 2) * time) +
                0.3 * Math.sin(2 * Math.PI * (frequency * 3) * time);
        }

        try {
            processor.process([[channel]], [], {});
        } catch (e) {
            console.error(`CRASH at iteration ${i}:`, e);
            throw e;
        }
    }

    console.log("Simulation finished without crash.");
    return true;
}

// Run the tests
(async () => {
    try {
        await runSimulation(2048, 440);
        await runSimulation(4096, 440);
        await runSimulation(4096, 82.41);
        await runSimulation(4096, 41.2); // E1 (Low Bass E)
        console.log("\nALL SIMULATIONS PASSED!");
    } catch (e) {
        console.error("\nSIMULATION FAILED:", e);
        process.exit(1);
    }
})();
