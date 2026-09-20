/** @jest-environment node */
jest.setTimeout(60000);
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const processorCode = fs.readFileSync(path.join(__dirname, '../audio-worklet/processor.js'), 'utf8');
const wasmBytes = fs.readFileSync(path.join(__dirname, '../../tuner-core/tuner_core_bg.wasm'));
async function engine(sampleRate) {
  let Processor, ready;
  const messages = [];
  const initialized = new Promise(resolve => ready = resolve);
  const context = {
    sampleRate, TextDecoder, WebAssembly,
    console: {log() {}, error: console.error},
    AudioWorkletProcessor: class { constructor() {
      this.port = {postMessage(message) { messages.push(message); if (['ready','error'].includes(message.type)) ready(message); }};
    }},
    registerProcessor(_, value) { Processor = value; }
  };
  vm.runInNewContext(processorCode, context);
  const processor = new Processor({processorOptions: {wasmBytes}});
  const status = await initialized;
  if (status.type !== 'ready') throw new Error(status.error);
  return {processor, messages};
}
test.each([44100, 48000])('real WASM/worklet detects instrument strings at %i Hz', async sampleRate => {
  for (const frequency of [41.203,55,73.416,82.407,110,146.832,196,246.942,261.626,329.628,391.995,440]) {
    const {processor, messages} = await engine(sampleRate);
    try {
      for (let offset = 0; offset < sampleRate; offset += 128) {
        const block = Float32Array.from({length:128}, (_, i) => 0.2 * Math.sin(2*Math.PI*frequency*(offset+i)/sampleRate));
        processor.process([[block]], [], {});
      }
      const results = messages.filter(m => m.type === 'result').slice(-10);
      expect(results.length).toBe(10);
      const pitch = results.reduce((sum,m) => sum+m.pitch,0)/results.length;
      const cents = 1200*Math.log2(pitch/frequency);
      if (Math.abs(cents) > 2) throw new Error(`${frequency} Hz at ${sampleRate}: ${cents.toFixed(2)} cents error`);
      expect(results.at(-1).clarity).toBeGreaterThan(0.7);
    } finally { processor.detector.free(); }
  }
});
test('silence emits no pitch', async () => {
  const {processor,messages} = await engine(48000);
  try {
    for(let i=0;i<400;i++) processor.process([[new Float32Array(128)]],[],{});
    expect(messages.filter(m => m.type === 'result')).toHaveLength(0);
  } finally { processor.detector.free(); }
});
