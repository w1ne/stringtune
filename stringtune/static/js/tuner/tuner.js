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
  this.stableLimit = 3; // Wait for 3 stable measurements (~35ms)
  this.tolerance = 1.02;
  this.smoothing = true;
  this.smoothFrequencies = [];
  this.smoothingDepth = 25; // Deeper history for better outlier rejection
  this.lastSmoothed = null; // For EMA state

  // Stabilizer State
  this.lockedNote = null;
  this.lockingBuffer = 0;
  this.currentCents = 0;
  this.centsVelocity = 0;
  this.lastUpdate = Date.now();

  this.initGetUserMedia();
};

Tuner.prototype.enableSmoothing = function () {
  this.smoothing = true;
};

Tuner.prototype.disableSmoothing = function () {
  this.smoothing = false;
};

Tuner.prototype.smoothFrequency = function (frequency, clarity) {
  this.smoothFrequencies.push(frequency);
  if (this.smoothFrequencies.length > this.smoothingDepth) {
    this.smoothFrequencies.shift();
  }

  // 1. Median Filter (removes noise spikes)
  const sorted = [...this.smoothFrequencies].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // 2. Exponential Moving Average with Clarity-based weighting
  // High clarity = 1.0 (trust new data), Low clarity = 0.1 (stay stable)
  // This produces the sluggish "analogue" needle feel
  if (this.lastSmoothed === null) {
    this.lastSmoothed = median;
  }

  const alpha = 0.15 + (clarity * 0.4); // Snappier: ranges from 0.15 (noisy) to 0.55 (clean)
  this.lastSmoothed = this.lastSmoothed * (1 - alpha) + median * alpha;

  return this.lastSmoothed;
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
    // 1. Statistical Smoothing (Median + EMA)
    if (this.smoothing) {
      frequency = this.smoothFrequency(frequency, this.lastClarity || 0.5);
    }

    // 2. Detection Gating: Reject noise aggressively
    // Lowered threshold to 0.65 to catch low E1/E2 strings which often have lower clarity
    const clarityThreshold = (this.lockedNote === null) ? 0.65 : 0.40;
    if (this.lastClarity < clarityThreshold) {
      if (this.lastClarity > 0.3) {
        // console.log(`[Tuner] Low clarity: ${this.lastClarity.toFixed(2)} (Hz: ${frequency.toFixed(1)})`);
      }
      return;
    }

    this.lastFrequency = frequency;
    const rawNote = this.getNote(frequency);

    // 3. Note Locking (Hysteresis)
    // Prevents flickering note letters when you're between two semitones
    if (this.lockedNote === null) {
      this.lockingBuffer++;
      if (this.lockingBuffer > 5) { // Require 5 stable frames before initial grab
        this.lockedNote = rawNote;
        this.lockingBuffer = 0;
        this.currentCents = this.getCents(frequency, rawNote);
        this.centsVelocity = 0;
      }
      return; // Wait for lock
    } else {
      const centsToLocked = this.getCents(frequency, this.lockedNote);
      // breakaway threshold: must be > 65 cents away to consider switching
      if (Math.abs(centsToLocked) > 65) {
        this.lockingBuffer++;
        if (this.lockingBuffer > 12) { // Require ~120ms of consistent shift
          this.lockedNote = rawNote;
          this.lockingBuffer = 0;
        }
      } else {
        this.lockingBuffer = 0;
      }
    }

    // 4. Emit Stabilized Result
    // We send mediam-filtered cents. Meter.js will handle the physical smoothing.
    const targetCents = this.getCents(frequency, this.lockedNote);

    // HARD CLAMP: UI only supports ±50 cents. Anything else is ignored/clamped.
    let finalCents = targetCents;
    if (finalCents > 50) finalCents = 50;
    if (finalCents < -50) finalCents = -50;

    // Stability Check for UI "Lock" visual
    if (Math.abs(targetCents) < 3) {
      this.stableCount++;
    } else {
      this.stableCount = Math.max(0, this.stableCount - 1); // Slow decay
    }

    if (this.onNoteDetected) {
      this.onNoteDetected({
        name: this.noteStrings[this.lockedNote % 12],
        value: this.lockedNote,
        cents: finalCents,
        octave: Math.floor(this.lockedNote / 12) - 1,
        frequency: frequency,
        isStable: this.stableCount >= 20
      });
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
      // console.log("[Tuner] Message from worklet:", event.data.type);
      if (event.data.type === 'result') {
        this.lastClarity = event.data.clarity;
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
