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

        // 1. Shift buffer and add new samples
        this.buffer.copyWithin(0, channel.length);
        this.buffer.set(channel, this.bufferSize - channel.length);

        this.accumulationCounter += channel.length;
        this.callsSinceLastProcess++;

        // 2. Only process if we have enough samples and hit interval
        // Wait until we have at least one full buffer initially
        if (this.accumulationCounter < this.bufferSize) return true;

        if (this.callsSinceLastProcess >= this.processInterval) {
            this.callsSinceLastProcess = 0;

            if (this.detector) {
                try {
                    const result = this.detector.detect(this.buffer);
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
