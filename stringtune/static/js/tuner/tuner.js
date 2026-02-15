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
  this.stableLimit = 1; // Instant reaction (relies on Rust engine's internal stability)
  this.tolerance = 1.02;
  this.smoothing = true;
  this.smoothFrequencies = [];
  this.smoothingDepth = 3; // Minimal smoothing for lowest lag

  this.initGetUserMedia();
};

Tuner.prototype.enableSmoothing = function () {
  this.smoothing = true;
};

Tuner.prototype.disableSmoothing = function () {
  this.smoothing = false;
};

Tuner.prototype.smoothFrequency = function (frequency) {
  // Add new frequency to the array
  this.smoothFrequencies.push(frequency);

  // If the array size exceeds smoothingDepth, remove the oldest frequency
  if (this.smoothFrequencies.length > this.smoothingDepth) {
    this.smoothFrequencies.shift();
  }

  // Calculate the average frequency and return
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
    // Ignore frequencies that are close multiples of the last frequency (harmonics)
    if (this.lastFrequency) {
      let ratio = frequency / this.lastFrequency;
      ratio = Math.round(ratio);
      if (ratio >= 0.98 * this.tolerance && ratio <= this.tolerance) {
        frequency = this.lastFrequency;
      }
    }
    // Apply smoothing
    if (this.smoothing) {
      frequency = this.smoothFrequency(frequency);
    }

    this.lastFrequency = frequency;
    const note = this.getNote(frequency);

    // Stability Check
    if (note !== this.currentNote) {
      this.stableCount = 0;
      this.currentNote = note;
    } else {
      this.stableCount++;
    }

    // Only update UI if stable
    if (this.stableCount >= this.stableLimit && this.onNoteDetected) {
      this.onNoteDetected({
        name: this.noteStrings[note % 12],
        value: note,
        cents: this.getCents(frequency, note),
        octave: parseInt(note / 12) - 1,
        frequency: frequency,
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
    // 1. Pre-fetch the Wasm binary (Worklets can't fetch in some browsers)
    const response = await fetch('/tuner-core/tuner_core_bg.wasm');
    const wasmBytes = await response.arrayBuffer();

    // 2. Load the Worklet module (cache-busted for delivery insurance)
    const workletUrl = '/js/audio-worklet/processor.js?cache=' + Date.now();
    await this.audioContext.audioWorklet.addModule(workletUrl);

    // 3. Create the node with pre-fetched bytes
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pitch-processor', {
      processorOptions: { wasmBytes }
    });

    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'result') {
        this.updatePitch(event.data.pitch);
      } else if (event.data.type === 'error') {
        console.error('Worklet Error:', event.data.error);
        alert('Tuner Engine Error: ' + event.data.error);
      }
    };

    this.startRecord();
  } catch (e) {
    console.error('Failed to init AudioWorklet:', e);
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
