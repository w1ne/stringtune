const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(overrides={}) {
 const track={stop(){this.stopped=true}};
 const stream={getTracks:()=>[track]};
 class AudioContext {
  constructor(){this.state='running';this.destination={};this.audioWorklet={addModule:async()=>{}};}
  resume(){this.state='running';return Promise.resolve()}
  createAnalyser(){return {connect(){},disconnect(){},frequencyBinCount:1024}}
  createMediaStreamSource(){return {connect(){},disconnect(){}}}
  createOscillator(){return {frequency:{value:0},connect(){},disconnect(){},start(){},stop(){}}}
  createGain(){return {gain:{value:1},connect(){},disconnect(){}}}
  close(){this.state='closed';return Promise.resolve()}
 }
 const env={window:{AudioContext},navigator:{mediaDevices:{getUserMedia:async()=>stream}},console,alert(){},setTimeout,clearTimeout,fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)}),
 AudioWorkletNode:class {constructor(){this.port={close(){}};queueMicrotask(()=>this.port.onmessage?.({data:{type:'ready'}}));}connect(){}disconnect(){}},...overrides};
 vm.createContext(env);vm.runInContext(fs.readFileSync(path.join(__dirname,'../../stringtune/static/js/tuner/tuner.js'),'utf8')+'\nthis.Tuner=Tuner;',env);
 return {tuner:new env.Tuner(440),env,track};
}
test('reference playback works without requesting microphone',async()=>{
 const {tuner,env}=setup();env.navigator.mediaDevices.getUserMedia=()=>{throw Error('mic must not be requested')};
 await assert.doesNotReject(async()=>tuner.play(440));assert.equal(tuner.oscillator.frequency.value,440);tuner.stopOscillator();assert.equal(tuner.oscillator,null);
});
test('startup propagates permission denial and permits a retry',async()=>{
 const {tuner,env,track}=setup();let attempts=0;env.navigator.mediaDevices.getUserMedia=async()=>{if(!attempts++)throw Error('permission denied');return {getTracks:()=>[track]}};
 await assert.rejects(()=>tuner.init(),/permission denied/);assert.notEqual(tuner.state,'listening');await tuner.init();assert.equal(tuner.state,'listening');await tuner.stop();assert.equal(track.stopped,true);
});
test('engine failure releases a granted microphone',async()=>{
 const {tuner,env,track}=setup();env.fetch=async()=>({ok:false,status:503});await assert.rejects(()=>tuner.init(),/503/);assert.equal(track.stopped,true);
});
test('calibration rejects malformed or out-of-range numbers',()=>{
 const {env}=setup();for(const value of [-440,0,Infinity,NaN,'440oops',501,399])assert.equal(env.Tuner.isValidCalibration(value),false);
 for(const value of [400,440,442.5,'432',500])assert.equal(env.Tuner.isValidCalibration(value),true);
});
test('detector requires clarity and stable samples, follows cents changes',()=>{
 const {tuner}=setup();const notes=[];tuner.onNoteDetected=n=>notes.push(n);tuner.lastClarity=.1;for(let i=0;i<10;i++)tuner.updatePitch(440);assert.equal(notes.length,0);
 tuner.lastClarity=.95;for(let i=0;i<7;i++)tuner.updatePitch(440);assert.equal(notes.at(-1).value,69);
 for(let i=0;i<7;i++)tuner.updatePitch(445);assert.ok(notes.at(-1).cents>15);assert.equal(notes.at(-1).value,69);
});
test('stop during pending microphone permission cannot restart capture',async()=>{
 const {tuner,env,track}=setup();let grant;env.navigator.mediaDevices.getUserMedia=()=>new Promise(r=>grant=r);
 const startup=tuner.init();await new Promise(r=>setImmediate(r));await tuner.stop();grant({getTracks:()=>[track]});await startup.catch(()=>{});assert.equal(track.stopped,true);assert.notEqual(tuner.state,'listening');
});
test('a queued error from a previous worklet cannot stop a new session',async()=>{
 const {tuner}=setup(); await tuner.init(); const staleError=tuner.workletNode.onprocessorerror;
 await tuner.stop(); await tuner.init(); staleError(); assert.equal(tuner.state,'listening'); await tuner.stop();
});

test('microphone-ready observer fires after acquisition and cannot break capture', async () => {
 const {tuner}=setup();let calls=0;tuner.onMicrophoneReady=()=>{calls++;assert.ok(tuner.stream);throw Error('observer blocked')};
 await tuner.init();assert.equal(calls,1);assert.equal(tuner.state,'listening');await tuner.stop();
});
test('failure stage distinguishes permission from engine download without exposing message', async () => {
 const {tuner,env}=setup();env.navigator.mediaDevices.getUserMedia=async()=>{throw Error('denied')};
 await assert.rejects(()=>tuner.init());assert.equal(tuner.failureStage,'microphone');
 const next=setup();next.env.fetch=async()=>({ok:false,status:503});await assert.rejects(()=>next.tuner.init());assert.equal(next.tuner.failureStage,'download');
});
