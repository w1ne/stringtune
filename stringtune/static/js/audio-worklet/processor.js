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
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
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

class WasmPitchDetector {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(WasmPitchDetector.prototype);
        obj.__wbg_ptr = ptr;
        return obj;
    }
    free() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        wasm.__wbg_wasmpitchdetector_free(ptr, 0);
    }
    detect(audio_buffer) {
        const ptr0 = passArrayF32ToWasm0(audio_buffer, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const resPtr = wasm.wasmpitchdetector_detect(this.__wbg_ptr, ptr0, len0);

        if (resPtr === 0) return undefined;

        // Read 2 floats from the static buffer in Wasm memory
        const memory = getFloat32ArrayMemory0();
        const pitch = memory[resPtr / 4];
        const clarity = memory[resPtr / 4 + 1];

        return [pitch, clarity];
    }
    static new(sample_rate, fft_size) {
        const ret = wasm.wasmpitchdetector_new(sample_rate, fft_size);
        return WasmPitchDetector.__wrap(ret);
    }
}

async function initWasm(module) {
    const imports = {
        "./tuner_core_bg.js": {
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

        // Accumulation buffer
        this.bufferSize = 2048;
        this.buffer = new Float32Array(this.bufferSize);
        this.accumulationCounter = 0;
        this.processInterval = 2; // Process every 2nd 128-sample block (~5.8ms / 172Hz)
        this.callsSinceLastProcess = 0;

        const wasmBytes = options.processorOptions.wasmsBytes || options.processorOptions.wasmBytes;
        this.init(wasmBytes);
    }

    async init(wasmBytes) {
        try {
            if (!wasmBytes) throw new Error("No Wasm bytes provided");
            await initWasm(wasmBytes);
            this.detector = WasmPitchDetector.new(sampleRate, this.bufferSize);
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
                const result = this.detector.detect(this.buffer);
                if (result && result.length >= 2) {
                    const pitch = result[0];
                    const clarity = result[1];
                    if (pitch > 0) {
                        this.port.postMessage({ type: 'result', pitch, clarity });
                    }
                }
            }
        }

        return true;
    }
}

registerProcessor('pitch-processor', PitchProcessor);
