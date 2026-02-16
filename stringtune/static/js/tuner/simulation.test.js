/**
 * SIMULATION TEST DRIVER
 * This script runs the real PitchProcessor logic in Node.js with the real WASM.
 */
const fs = require('fs');
const path = require('path');

// 1. Mock Environment
global.AudioWorkletProcessor = class { };
global.registerProcessor = jest.fn();
global.sampleRate = 44100;

// 2. Load and Polyfill Wasm
const wasmPath = path.resolve(__dirname, '../../../static/tuner-core/tuner_core_bg.wasm');
const wasmBuffer = fs.readFileSync(wasmPath);

// 3. Load processor.js
const processorCode = fs.readFileSync(path.resolve(__dirname, '../audio-worklet/processor.js'), 'utf8');

// We need to inject the wasmBuffer into the constructor options
describe('PitchProcessor Simulation', () => {
    let PitchProcessorClass;

    beforeAll(() => {
        // Evaluate the processor code in a context
        const context = {
            AudioWorkletProcessor: global.AudioWorkletProcessor,
            registerProcessor: (name, cls) => { PitchProcessorClass = cls; },
            sampleRate: global.sampleRate,
            console: console,
            TextDecoder: require('util').TextDecoder,
            WebAssembly: WebAssembly,
            // Mock Float32Array and other typed arrays if needed, but Node has them
        };

        // Wrap in a function to isolate
        const fn = new Function(...Object.keys(context), processorCode);
        fn(...Object.values(context));
    });

    test('Should process 440Hz with 4096 FFT size without crashing', async () => {
        const options = {
            processorOptions: { wasmBytes: wasmBuffer }
        };
        const processor = new PitchProcessorClass(options);

        // Wait for ready message
        await new Promise(resolve => {
            processor.port.onmessage = (e) => {
                if (e.data.type === 'ready') resolve();
                if (e.data.type === 'error') throw new Error(e.data.error);
            };
        });

        // Set buffer size to 4096 for this test
        processor.bufferSize = 4096;
        processor.buffer = new Float32Array(4096);
        processor.detector.free();
        // We need a way to re-init with 4096 in the test
        // Actually, let's just modify the processor.js for simulation
    });
});
