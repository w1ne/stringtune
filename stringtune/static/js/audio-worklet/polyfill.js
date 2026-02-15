// TextDecoder Polyfill for AudioWorklet
if (typeof globalThis.TextDecoder === 'undefined') {
    class TextDecoderPolyfill {
        constructor(encoding = 'utf-8') {
            this.encoding = encoding;
        }
        decode(view) {
            const uint8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
            let out = "";
            for (let i = 0; i < uint8.length; i++) {
                out += String.fromCharCode(uint8[i]);
            }
            return out;
        }
    }
    globalThis.TextDecoder = TextDecoderPolyfill;
    if (typeof self !== 'undefined') {
        self.TextDecoder = TextDecoderPolyfill;
    }
}
console.log('AudioWorklet Polyfills loaded');
