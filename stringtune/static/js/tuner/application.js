const Application = function () {
  this.startId = 0;
  this.$root = document.querySelector('.tuner');
  this.$status = document.getElementById('tunerStatus');
  this.$start = document.getElementById('startButton');
  this.$stop = document.getElementById('stopButton');
  this.startLabel = this.$start.querySelector('p').textContent;
  this.initA4();
  this.tuner = new Tuner(this.a4);
  this.notes = new Notes('.tuner .notes', this.tuner);
  this.meter = new Meter('.tuner .meter');
  this.frequencyBars = new FrequencyLines('.tuner .frequency-lines');
  this.clearReading();
};

Application.prototype.message = function (key, fallback) {
  return this.$root.dataset[key] || fallback;
};

Application.prototype.initA4 = function () {
  this.$a4 = document.querySelector('.a4 span');
  let saved;
  try { saved = localStorage.getItem('a4'); } catch (_) { /* Storage is optional. */ }
  this.a4 = Tuner.isValidCalibration(saved) ? Number(saved) : 440;
  this.$a4.textContent = this.a4;
};

Application.prototype.setStatus = function (text) {
  // Avoid repeatedly announcing unchanged guidance to screen readers.
  if (this.$status.textContent !== text) this.$status.textContent = text;
};

Application.prototype.clearReading = function () {
  clearTimeout(this.silenceTimer);
  this.notes.clearActive();
  this.notes.$frequency.textContent = '—';
  this.meter.reset();
  this.frequencyBars.clear();
  this.tuner.resetPitch();
};

Application.prototype.showError = function (error) {
  this.clearReading();
  this.$start.style.display = '';
  this.$start.disabled = false;
  this.$start.querySelector('p').textContent = this.message('retry', 'Try microphone again');
  this.$stop.hidden = true;
  const message = error.name === 'NotAllowedError'
    ? this.message('permission', 'Allow microphone access in your browser, then try again.')
    : error.message;
  this.setStatus(message);
};

Application.prototype.start = function () {
  this.tuner.onError = error => this.showError(error);
  this.tuner.onNoteDetected = note => {
    if (this.notes.isAutoMode) this.update(note);
  };
  this.$start.addEventListener('click', async () => {
    const startId = ++this.startId;
    this.notes.setAutoMode(true);
    document.querySelector('.auto input').checked = true;
    this.clearReading();
    this.$start.disabled = true;
    this.$stop.hidden = false;
    this.$start.querySelector('p').textContent = this.message('starting', 'Starting…');
    this.setStatus(this.message('allow', 'Allow microphone access to start tuning.'));
    try {
      await this.tuner.init();
      if (startId !== this.startId || this.tuner.state !== 'listening') return;
      this.frequencyData = new Uint8Array(this.tuner.analyser.frequencyBinCount);
      this.$start.style.display = 'none';
      this.setStatus(this.message('listening', 'Listening — play one string.'));
    } catch (error) {
      if (startId === this.startId) this.showError(error);
    } finally {
      if (startId === this.startId) this.$start.disabled = false;
    }
  });
  this.$stop.addEventListener('click', () => this.stop());
  window.addEventListener('pagehide', () => this.stop());

  document.querySelector('.auto input').addEventListener('change', event => {
    this.notes.setAutoMode(event.target.checked);
    this.clearReading();
    this.setStatus(event.target.checked
      ? (this.tuner.state === 'listening' ? this.message('listening', 'Listening — play one string.') : this.startLabel)
      : this.message('reference', 'Tap a note to hear a reference tone.'));
  });
  this.notes.onReference = playing => {
    document.querySelector('.auto input').checked = false;
    clearTimeout(this.silenceTimer);
    this.meter.reset();
    this.$stop.hidden = !playing && this.tuner.state !== 'listening';
    this.setStatus(this.message('reference', 'Tap a note to hear a reference tone.'));
  };
  this.notes.onError = error => this.setStatus(error.message);
  const select = document.getElementById('instrumentSelect');
  const setInstrument = () => {
    this.notes.setInstrument(select.value);
    this.clearReading();
  };
  select.addEventListener('change', setInstrument);
  setInstrument();
  this.initCalibration();
  this.initInstall();
  this.updateFrequencyBars();
};

Application.prototype.stop = function () {
  ++this.startId;
  this.notes.setAutoMode(true);
  document.querySelector('.auto input').checked = true;
  this.tuner.stop().catch(error => this.setStatus(error.message));
  this.clearReading();
  this.$stop.hidden = true;
  this.$start.style.display = '';
  this.$start.disabled = false;
  this.$start.querySelector('p').textContent = this.startLabel;
  this.setStatus('');
};

Application.prototype.initCalibration = function () {
  const dialog = document.getElementById('calibrationDialog');
  if (!dialog) return;
  const input = dialog.querySelector('input');
  document.getElementById('calibrationButton').addEventListener('click', () => {
    input.value = this.a4;
    input.setCustomValidity('');
    dialog.showModal();
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    if (!Tuner.isValidCalibration(input.value)) {
      input.setCustomValidity('Enter a frequency between 400 and 500 Hz.');
      input.reportValidity();
      return;
    }
    this.a4 = Number(input.value);
    this.$a4.textContent = this.a4;
    this.tuner.middleA = this.a4;
    this.tuner.stopOscillator();
    this.notes.createNotes();
    this.notes.setInstrument(document.getElementById('instrumentSelect').value);
    this.clearReading();
    try { localStorage.setItem('a4', this.a4); } catch (_) { /* Storage is optional. */ }
    dialog.close();
  });
};

Application.prototype.initInstall = function () {
  const button = document.getElementById('installAppBtn');
  let prompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    button.style.display = 'block';
  });
  button.addEventListener('click', async () => {
    if (!prompt) return;
    const current = prompt;
    prompt = null;
    button.style.display = 'none';
    try { await current.prompt(); await current.userChoice; }
    catch (error) { this.setStatus(error.message); }
  });
};

Application.prototype.updateFrequencyBars = function () {
  if (this.tuner.state === 'listening' && this.frequencyData) {
    this.tuner.analyser.getByteFrequencyData(this.frequencyData);
    this.frequencyBars.update(this.frequencyData);
  }
  requestAnimationFrame(this.updateFrequencyBars.bind(this));
};

Application.prototype.update = function (note) {
  this.notes.update(note);
  this.meter.update((note.cents / 50) * 45);
  this.setStatus(Math.abs(note.cents) <= 3 ? this.message('inTune', 'In tune')
    : note.cents < 0 ? this.message('flat', 'Too low — tighten the string')
    : this.message('sharp', 'Too high — loosen the string'));
  clearTimeout(this.silenceTimer);
  this.silenceTimer = setTimeout(() => {
    this.clearReading();
    this.setStatus(this.message('listening', 'Listening — play one string.'));
  }, 1500);
};

const app = new Application();
app.start();
