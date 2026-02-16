/**
 * SLIDING WINDOW AUDIO WORKLET PROCESSOR
 * Inlines Wasm glue code and implements a 2048-sample sliding window.
 */

// 1. TextDecoder Polyfill
if (typeof TextDecoder === 'undefined') {
    globalThis.TextDecoder = class {
        constructor() { }
        decode(view) {
            const uint8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
            let out = "";
            for (let i = 0; i < uint8.length; i++) out += String.fromCharCode(uint8[i]);
            return out;
        }
    };
}

// 2. Wasm Glue Code
let wasmModule, wasm;
let WASM_VECTOR_LEN = 0;
let cachedFloat32ArrayMemory0 = null;
let cachedUint8ArrayMemory0 = null;
let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.buffer !== wasm.memory.buffer) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function decodeText(ptr, len) {
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

class WasmPitchDetector {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmPitchDetector.prototype);
        obj.__wbg_ptr = ptr;
        return obj;
    }
    free() {
        if (this.__wbg_ptr !== 0) {
            const ptr = this.__wbg_ptr;
            this.__wbg_ptr = 0;
            wasm.__wbg_wasmpitchdetector_free(ptr, 0);
        }
    }
    static new(sample_rate, fft_size) {
        const ret = wasm.wasmpitchdetector_new(sample_rate, fft_size);
        const obj = WasmPitchDetector.__wrap(ret);
        // Get pointers to internal buffers
        obj.audioPtr = wasm.wasmpitchdetector_audio_ptr(obj.__wbg_ptr);
        obj.resultPtr = wasm.wasmpitchdetector_result_ptr(obj.__wbg_ptr);
        obj.fftSize = fft_size;
        return obj;
    }
    detect(audio_buffer) {
        if (audio_buffer.length !== this.fftSize) return undefined;

        try {
            // 1. Copy audio data to the pre-allocated Wasm memory
            const memory = getFloat32ArrayMemory0();
            memory.set(audio_buffer, this.audioPtr / 4);

            // Trigger detection on internal buffer
            const success = wasm.wasmpitchdetector_detect(this.__wbg_ptr);

            if (success === 0) return undefined;

            // 3. Read results (pitch, clarity)
            const freshMemory = getFloat32ArrayMemory0();
            const pitch = freshMemory[this.resultPtr / 4];
            const clarity = freshMemory[this.resultPtr / 4 + 1];

            return [pitch, clarity];
        } catch (e) {
            console.error("[Worklet] Detection internal error:", e);
            throw e;
        }
    }
}

async function initWasm(module) {
    const imports = {
        "./tuner_core_bg.js": {
            __wbg___wbindgen_copy_to_typed_array_fc0809a4dec43528: function (arg0, arg1, arg2) {
                new Uint8Array(arg2.buffer, arg2.byteOffset, arg2.byteLength).set(getArrayU8FromWasm0(arg0, arg1));
            },
            __wbg___wbindgen_throw_be289d5034ed271b: function (arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbindgen_init_externref_table: function () {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        }
    };

    const result = await WebAssembly.instantiate(module, imports);
    wasm = result.instance.exports;
    wasmModule = result.module;
    if (wasm.__wbindgen_start) wasm.__wbindgen_start();
}

// 3. AudioWorklet Processor with Sliding Window
class PitchProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.detector = null;

        // Accumulation buffer - increased to 4096 for better low-frequency (E2) resolution
        this.bufferSize = 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.accumulationCounter = 0;
        // LPF Coefficients (Biquad Butterworth LPF, 800Hz @ 44100Hz)
        // Calculated via standard recipe: https://shepazu.github.io/Audio-EQ-Cookbook/audio-eq-cookbook.html
        const w0 = 2 * Math.PI * 800 / sampleRate;
        const cosW0 = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * 0.707); // Q=0.707
        const b0 = (1 - cosW0) / 2;
        const b1 = 1 - cosW0;
        const b2 = (1 - cosW0) / 2;
        const a0 = 1 + alpha;
        const a1 = -2 * cosW0;
        const a2 = 1 - alpha;

        this.filter = {
            b0: b0 / a0, b1: b1 / a0, b2: b2 / a0,
            a1: a1 / a0, a2: a2 / a0,
            x1: 0, x2: 0, y1: 0, y2: 0
        };

        this.processInterval = 4; // Process every 4th 128-sample block (~11.6ms / 86Hz)
        this.callsSinceLastProcess = 0;

        const wasmBytes = options.processorOptions.wasmsBytes || options.processorOptions.wasmBytes;
        console.log("[Worklet] Constructor called, wasmBytes present:", !!wasmBytes);
        this.init(wasmBytes);
    }

    async init(wasmBytes) {
        try {
            if (!wasmBytes) throw new Error("No Wasm bytes provided");
            await initWasm(wasmBytes);
            this.detector = WasmPitchDetector.new(sampleRate, this.bufferSize);
            console.log("[Worklet] Engine ready at sampleRate:", sampleRate);
            this.port.postMessage({ type: 'ready' });
        } catch (e) {
            this.port.postMessage({ type: 'error', error: e.toString() });
        }
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input.length) return true;
        const channel = input[0];
        if (!channel) return true;

        // 1. Shift old data left (moves samples 128...4096 to 0...3968)
        this.buffer.copyWithin(0, channel.length);

        // 2. Filter new samples and place them at the END of the buffer
        for (let i = 0; i < channel.length; i++) {
            const x = channel[i];
            const y = this.filter.b0 * x + this.filter.b1 * this.filter.x1 + this.filter.b2 * this.filter.x2
                - this.filter.a1 * this.filter.y1 - this.filter.a2 * this.filter.y2;

            this.filter.x2 = this.filter.x1;
            this.filter.x1 = x;
            this.filter.y2 = this.filter.y1;
            this.filter.y1 = y;

            this.buffer[this.bufferSize - channel.length + i] = y;
        }

        this.accumulationCounter += channel.length;
        this.callsSinceLastProcess++;

        // 2. Only process if we have enough samples and hit interval
        // Wait until we have at least one full buffer initially
        if (this.accumulationCounter < this.bufferSize) return true;

        if (this.callsSinceLastProcess >= this.processInterval) {
            this.callsSinceLastProcess = 0;

            if (this.detector) {
                try {
                    // AGC: Normalize the buffer to 0.95 peak before detection
                    // This ensures the McLeod detector sees high-amplitude peaks regardless of mic volume
                    let maxAmp = 0;
                    for (let i = 0; i < this.bufferSize; i++) {
                        const abs = Math.abs(this.buffer[i]);
                        if (abs > maxAmp) maxAmp = abs;
                    }

                    let normalizedBuffer = this.buffer;
                    if (maxAmp > 0.001) {
                        const gain = 0.95 / maxAmp;
                        normalizedBuffer = new Float32Array(this.bufferSize);
                        for (let i = 0; i < this.bufferSize; i++) {
                            normalizedBuffer[i] = this.buffer[i] * gain;
                        }
                    }

                    const result = this.detector.detect(normalizedBuffer);
                    if (result && result.length >= 2) {
                        const pitch = result[0];
                        const clarity = result[1];
                        if (pitch > 0) {
                            // Heartbeat: log every 100th valid pitch
                            if (this.accumulationCounter % 12800 === 0) {
                                console.log(`[Worklet] Heartbeat - Pitch: ${pitch.toFixed(1)}Hz, Clarity: ${clarity.toFixed(2)}`);
                            }
                            this.port.postMessage({ type: 'result', pitch, clarity });
                        }
                    }
                } catch (err) {
                    this.port.postMessage({ type: 'error', error: 'Wasm detection failed: ' + err.toString() });
                }
            }
        }

        return true;
    }
}

registerProcessor('pitch-processor', PitchProcessor);
