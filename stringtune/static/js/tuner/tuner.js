const Tuner = function (a4) {
  this.middleA = Tuner.isValidCalibration(a4) ? Number(a4) : 440;
  this.semitone = 69;
  this.noteStrings = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ];
  this.stableLimit = 5;
  this.smoothing = false;
  this.smoothFrequencies = [];
  this.clarityGate = 0.7;       // Reject detections with clarity below this
  this.stableFrequency = null;   // Last frequency that was displayed (high confidence)
  this.stableClarity = 0;
  this.state = "idle";
  this.session = 0;
  this.playSession = 0;
};

Tuner.prototype.enableSmoothing = function () {
  this.smoothing = true;
};

Tuner.prototype.disableSmoothing = function () {
  this.smoothing = false;
};

Tuner.prototype.smoothFrequency = function (frequency) {
  this.smoothFrequencies.push(frequency);
  if (this.smoothFrequencies.length > 10) {
    this.smoothFrequencies.shift();
  }
  const sum = this.smoothFrequencies.reduce((a, b) => a + b, 0);
  return sum / this.smoothFrequencies.length;
};

// Keep validation identical for saved settings, UI input, and construction.
Tuner.isValidCalibration = function (value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 400 && number <= 500;
};

Tuner.prototype.ensureAudio = async function () {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw Object.assign(new Error("This browser does not support Web Audio."), {name: "NotSupportedError"});
  if (!this.audioContext || this.audioContext.state === "closed") {
    this.audioContext = new AudioContext();
  }
  if (this.audioContext.state === "suspended") await this.audioContext.resume();
  return this.audioContext;
};

Tuner.prototype.resetPitch = function () {
  this.currentNote = null;
  this.stableCount = 0;
  this.lastFrequency = null;
  this.stableFrequency = null;
  this.stableClarity = 0;
  this.smoothFrequencies = [];
};

Tuner.prototype.updatePitch = function (frequency) {
  if (Number.isFinite(frequency) && frequency > 0) {
    var clarity = this.lastClarity || 0;

    // Clarity gate — reject low-confidence detections
    if (clarity < this.clarityGate) {
      return;
    }

    // Octave jump rejection — if frequency is ~2x or ~0.5x the stable frequency
    // and the new clarity is lower, it's a harmonic — reject it
    if (this.stableFrequency && this.stableClarity > 0) {
      var ratio = frequency / this.stableFrequency;
      var isOctaveUp = ratio > 1.9 && ratio < 2.1;
      var isOctaveDown = ratio > 0.48 && ratio < 0.52;
      if ((isOctaveUp || isOctaveDown) && clarity < this.stableClarity * 0.85) {
        return;
      }
    }

    if (this.smoothing) {
      frequency = this.smoothFrequency(frequency);
    }

    this.lastFrequency = frequency;
    const note = this.getNote(frequency);

    if (note !== this.currentNote) {
      this.stableCount = 0;
      this.currentNote = note;
    } else {
      this.stableCount++;
    }

    if (this.stableCount >= this.stableLimit && this.onNoteDetected) {
      var cents = this.getCents(frequency, note);
      this.stableFrequency = frequency;
      this.stableClarity = clarity;
      this.onNoteDetected({
        name: this.noteStrings[note % 12],
        value: note,
        cents: cents,
        octave: parseInt(note / 12) - 1,
        frequency: frequency,
      });
    }
  }
};

// One startup at a time. A session token prevents a late permission grant
// from reconnecting capture after Stop or navigation.
Tuner.prototype.init = function () {
  if (this.state === "listening") return Promise.resolve();
  if (this.startPromise) return this.startPromise;
  const session = ++this.session;
  this.state = "starting";
  this.startPromise = this.startSession(session).finally(() => {
    if (session === this.session) this.startPromise = null;
  });
  return this.startPromise;
};

Tuner.prototype.startSession = async function (session) {
  const assertCurrent = () => {
    if (session !== this.session) throw new Error("Microphone startup cancelled.");
  };
  try {
    this.failureStage = 'audio_context';
    const context = await this.ensureAudio();
    assertCurrent();
    this.failureStage = 'microphone';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw Object.assign(new Error("Microphone access requires a supported browser and HTTPS."), {name: "NotSupportedError"});
    }
    const stream = await navigator.mediaDevices.getUserMedia({audio: {
      echoCancellation: false, noiseSuppression: false, autoGainControl: false
    }});
    if (session !== this.session) {
      stream.getTracks().forEach(track => track.stop());
      assertCurrent();
    }
    this.stream = stream;
    try { if (this.onMicrophoneReady) this.onMicrophoneReady(); } catch (_) { /* Observers are optional. */ }
    this.resetPitch();
    this.analyser = context.createAnalyser();
    this.failureStage = 'download';
    const response = await fetch('/tuner-core/tuner_core_bg.wasm?v=10');
    assertCurrent();
    if (!response.ok) throw new Error("Tuner download failed (" + response.status + ").");
    const wasmBytes = await response.arrayBuffer();
    assertCurrent();
    this.failureStage = 'worklet';
    await context.audioWorklet.addModule('/js/audio-worklet/processor.js?v=10');
    assertCurrent();
    const node = this.workletNode = new AudioWorkletNode(context, 'pitch-processor', {
      processorOptions: { wasmBytes }
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Object.assign(new Error("Tuner engine did not become ready."), {name: "TimeoutError"})), 10000);
      this.cancelReady = () => { clearTimeout(timeout); reject(new Error("Microphone startup cancelled.")); };
      node.port.onmessage = ({data}) => {
        if (session !== this.session) return;
        if (data.type === 'ready') {
          clearTimeout(timeout);
          this.cancelReady = null;
          resolve();
        } else if (data.type === 'error') {
          clearTimeout(timeout);
          const error = new Error(data.error);
          if (this.state === 'starting') reject(error);
          else {
            this.failureStage = 'worklet';
            this.stop();
            if (this.onError) this.onError(error);
          }
        } else if (data.type === 'result' && this.state === 'listening' && !this.oscillator) {
          this.lastClarity = data.clarity;
          this.updatePitch(data.pitch);
        }
      };
      node.onprocessorerror = () => {
        if (session !== this.session) return;
        clearTimeout(timeout);
        const error = new Error("The audio engine stopped. Please try again.");
        if (this.state === 'starting') reject(error);
        else { this.failureStage = 'worklet'; this.stop(); if (this.onError) this.onError(error); }
      };
    });
    assertCurrent();
    this.failureStage = 'connection';
    this.source = context.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
    this.analyser.connect(node);
    node.connect(context.destination);
    this.state = "listening";
    stream.getTracks().forEach(track => {
      track.onended = () => {
        if (session !== this.session) return;
        this.failureStage = 'capture';
        this.stop();
        if (this.onError) this.onError(Object.assign(new Error("Microphone disconnected. Please try again."), {name: 'NotReadableError'}));
      };
    });
  } catch (error) {
    if (session === this.session) {
      const stopped = this.stop();
      this.state = "error";
      await stopped;
    }
    throw error;
  }
};

Tuner.prototype.stop = async function () {
  ++this.session;
  this.startPromise = null;
  this.state = "idle";
  if (this.cancelReady) { this.cancelReady(); this.cancelReady = null; }
  this.stopOscillator();
  if (this.stream) this.stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
  if (this.source) this.source.disconnect();
  if (this.workletNode) {
    this.workletNode.onprocessorerror = null;
    this.workletNode.port.onmessage = null;
    this.workletNode.disconnect();
    this.workletNode.port.close();
  }
  if (this.analyser) this.analyser.disconnect();
  this.stream = this.source = this.workletNode = this.analyser = null;
  this.resetPitch();
  const context = this.audioContext;
  this.audioContext = null;
  if (context && context.state !== "closed") await context.close();
};

/**
 * get musical note from frequency
 *
 * @param {number} frequency
 * @returns {number}
 */
Tuner.prototype.getNote = function (frequency) {
  const note = 12 * (Math.log(frequency / this.middleA) / Math.log(2));
  return Math.round(note) + this.semitone;
};

/**
 * get the musical note's standard frequency
 *
 * @param note
 * @returns {number}
 */
Tuner.prototype.getStandardFrequency = function (note) {
  return this.middleA * Math.pow(2, (note - this.semitone) / 12);
};

/**
 * get cents difference between given frequency and musical note's standard frequency
 *
 * @param {number} frequency
 * @param {number} note
 * @returns {number}
 */
Tuner.prototype.getCents = function (frequency, note) {
  return Math.floor(
    (1200 * Math.log(frequency / this.getStandardFrequency(note))) / Math.log(2)
  );
};

/**
 * play the musical note
 *
 * @param {number} frequency
 */
Tuner.prototype.play = async function (frequency) {
  frequency = Number(frequency);
  if (!Number.isFinite(frequency) || frequency <= 0) throw new Error("Invalid reference frequency.");
  const session = ++this.playSession;
  const context = await this.ensureAudio();
  if (session !== this.playSession) return;
  if (!this.oscillator) {
    this.oscillator = context.createOscillator();
    this.referenceGain = context.createGain();
    this.referenceGain.gain.value = 0.1;
    this.oscillator.connect(this.referenceGain);
    this.referenceGain.connect(context.destination);
    this.oscillator.frequency.value = frequency;
    this.oscillator.start();
  } else {
    this.oscillator.frequency.value = frequency;
  }
};

Tuner.prototype.stopOscillator = function () {
  ++this.playSession;
  if (this.oscillator) {
    this.oscillator.stop();
    this.oscillator.disconnect();
    this.referenceGain.disconnect();
    this.oscillator = this.referenceGain = null;
  }
};
