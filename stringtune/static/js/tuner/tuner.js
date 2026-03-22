const Tuner = function (a4) {
  this.middleA = a4 || 440;
  this.semitone = 69;
  this.bufferSize = 4096;
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
  this.stableLimit = 3;
  this.tolerance = 1.05;
  this.smoothing = false;
  this.smoothFrequencies = [];

  // === TRACE SYSTEM ===
  this.trace = [];
  this.traceMax = 2000; // keep last 2000 events
  this.traceStart = Date.now();
  window.__tunerTrace = this.trace; // accessible from console

  this.initGetUserMedia();
};

Tuner.prototype.addTrace = function (type, data) {
  const entry = { t: Date.now() - this.traceStart, type: type };
  Object.assign(entry, data);
  this.trace.push(entry);
  if (this.trace.length > this.traceMax) this.trace.shift();
};

// Call window.__dumpTrace() in browser console to get CSV-like output
window.__dumpTrace = function () {
  const trace = window.__tunerTrace;
  if (!trace || trace.length === 0) { console.log("No trace data"); return; }
  console.log("=== TUNER TRACE (" + trace.length + " events) ===");
  console.log("time_ms | type | details");
  trace.forEach(function (e) {
    const details = Object.keys(e).filter(function (k) { return k !== 't' && k !== 'type'; })
      .map(function (k) { return k + "=" + (typeof e[k] === 'number' ? e[k].toFixed(2) : e[k]); }).join(" ");
    console.log(e.t + " | " + e.type + " | " + details);
  });
  // Summary stats
  var pitchEvents = trace.filter(function (e) { return e.type === 'raw'; });
  if (pitchEvents.length > 1) {
    var freqs = pitchEvents.map(function (e) { return e.freq; });
    var avg = freqs.reduce(function (a, b) { return a + b; }, 0) / freqs.length;
    var variance = freqs.reduce(function (a, f) { return a + (f - avg) * (f - avg); }, 0) / freqs.length;
    var stddev = Math.sqrt(variance);
    console.log("\n=== PITCH STATS ===");
    console.log("Samples: " + freqs.length);
    console.log("Avg freq: " + avg.toFixed(2) + " Hz");
    console.log("Std dev: " + stddev.toFixed(2) + " Hz");
    console.log("Min: " + Math.min.apply(null, freqs).toFixed(2) + " Hz");
    console.log("Max: " + Math.max.apply(null, freqs).toFixed(2) + " Hz");
    console.log("Range: " + (Math.max.apply(null, freqs) - Math.min.apply(null, freqs)).toFixed(2) + " Hz");

    // Note jump analysis
    var noteEvents = trace.filter(function (e) { return e.type === 'note_change'; });
    console.log("\n=== NOTE JUMPS ===");
    console.log("Total note changes: " + noteEvents.length);
    noteEvents.forEach(function (e) {
      console.log("  " + e.t + "ms: " + e.from + " -> " + e.to + " (freq=" + e.freq.toFixed(2) + ")");
    });

    // Rejected events
    var rejected = trace.filter(function (e) { return e.type === 'rejected'; });
    console.log("\n=== REJECTED (unstable) ===");
    console.log("Total rejected: " + rejected.length + " / " + pitchEvents.length + " raw (" + (100 * rejected.length / pitchEvents.length).toFixed(1) + "%)");
  }
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

// Initialize detected frequencies array
Tuner.prototype.detectedFrequencies = [];

Tuner.prototype.initGetUserMedia = function () {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!window.AudioContext) {
    return alert("AudioContext not supported");
  }

  // Older browsers might not implement mediaDevices at all, so we set an empty object first
  if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {};
  }

  // Some browsers partially implement mediaDevices. We can't just assign an object
  // with getUserMedia as it would overwrite existing properties.
  // Here, we will just add the getUserMedia property if it's missing.
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function (constraints) {
      // First get ahold of the legacy getUserMedia, if present
      const getUserMedia =
        navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

      // Some browsers just don't implement it - return a rejected promise with an error
      // to keep a consistent interface
      if (!getUserMedia) {
        alert("getUserMedia is not implemented in this browser");
      }

      // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
      return new Promise(function (resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    };
  }
};

Tuner.prototype.startRecord = function () {
  const self = this;
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then(function (stream) {
      const source = self.audioContext.createMediaStreamSource(stream);
      source.connect(self.analyser);
      // Connect to Worklet
      if (self.workletNode) {
        self.analyser.connect(self.workletNode);
        self.workletNode.connect(self.audioContext.destination);
      }
    })
    .catch(function (error) {
      alert(error.name + ": " + error.message);
    });
};

Tuner.prototype.updatePitch = function (frequency) {
  if (frequency) {
    var rawFreq = frequency;
    var clarity = this.lastClarity || 0;

    // Trace raw input from worklet
    this.addTrace('raw', { freq: rawFreq, clarity: clarity });

    // Ignore frequencies that are close multiples of the last frequency (harmonics)
    if (this.lastFrequency) {
      let ratio = frequency / this.lastFrequency;
      ratio = Math.round(ratio);
      if (ratio >= 0.98 * this.tolerance && ratio <= this.tolerance) {
        this.addTrace('harmonic_snap', { from: rawFreq, to: this.lastFrequency, ratio: frequency / this.lastFrequency });
        frequency = this.lastFrequency;
      }
    }

    if (this.smoothing) {
      frequency = this.smoothFrequency(frequency);
    }

    this.lastFrequency = frequency;
    const note = this.getNote(frequency);
    const noteName = this.noteStrings[note % 12] + (parseInt(note / 12) - 1);

    if (note !== this.currentNote) {
      var prevName = this.currentNote != null ?
        this.noteStrings[this.currentNote % 12] + (parseInt(this.currentNote / 12) - 1) : 'none';
      this.addTrace('note_change', { from: prevName, to: noteName, freq: frequency, clarity: clarity });
      this.stableCount = 0;
      this.currentNote = note;
    } else {
      this.stableCount++;
    }

    if (this.stableCount >= this.stableLimit && this.onNoteDetected) {
      var cents = this.getCents(frequency, note);
      this.addTrace('display', { note: noteName, freq: frequency, cents: cents, stable: this.stableCount });
      this.onNoteDetected({
        name: this.noteStrings[note % 12],
        value: note,
        cents: cents,
        octave: parseInt(note / 12) - 1,
        frequency: frequency,
      });
    } else if (this.stableCount < this.stableLimit) {
      this.addTrace('rejected', { note: noteName, freq: frequency, stable: this.stableCount, need: this.stableLimit });
    }
  }
};

Tuner.prototype.init = async function () {
  this.audioContext = new window.AudioContext();
  this.analyser = this.audioContext.createAnalyser();
  // State variables for updatePitch
  this.currentNote = null;
  this.stableCount = 0;
  this.lastFrequency = null;

  try {
    console.log("[Tuner] Fetching WASM binary...");
    // 1. Pre-fetch the Wasm binary (Worklets can't fetch in some browsers)
    const response = await fetch('/tuner-core/tuner_core_bg.wasm?v=' + Date.now());
    if (!response.ok) throw new Error("WASM fetch failed with status " + response.status);
    const wasmBytes = await response.arrayBuffer();
    console.log("[Tuner] WASM fetched, size:", wasmBytes.byteLength);

    // 2. Load the Worklet module (cache-busted for delivery insurance)
    const workletUrl = '/js/audio-worklet/processor.js?cache=' + Date.now();
    console.log("[Tuner] Adding AudioWorklet module:", workletUrl);
    await this.audioContext.audioWorklet.addModule(workletUrl);

    // 3. Create the node with pre-fetched bytes
    console.log("[Tuner] Creating AudioWorkletNode...");
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pitch-processor', {
      processorOptions: { wasmBytes }
    });
    console.log("[Tuner] AudioWorkletNode created:", this.workletNode);

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'result') {
        this.lastClarity = event.data.clarity;
        this.addTrace('worklet', { pitch: event.data.pitch, clarity: event.data.clarity });
        this.updatePitch(event.data.pitch);
      } else if (event.data.type === 'ready') {
        console.log("[Tuner] Worklet engine confirmed READY");
      } else if (event.data.type === 'error') {
        console.error('Worklet Error:', event.data.error);
        alert('Tuner Engine Error: ' + event.data.error);
      }
    };

    this.startRecord();
  } catch (e) {
    console.error('[Tuner] Init failed:', e);
    alert('Tuner Engine Failed: ' + e);
  }
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
Tuner.prototype.play = function (frequency) {
  if (!this.oscillator) {
    this.oscillator = this.audioContext.createOscillator();
    this.oscillator.connect(this.audioContext.destination);
    this.oscillator.start();
  }
  this.oscillator.frequency.value = frequency;
};

Tuner.prototype.stopOscillator = function () {
  if (this.oscillator) {
    this.oscillator.stop();
    this.oscillator = null;
  }
};
