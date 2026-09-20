// Observe attempts rather than individual audio frames. This module never sees a pitch.
(function () {
  const reasons = {
    NotAllowedError: 'not_allowed', SecurityError: 'not_allowed',
    NotFoundError: 'not_found', DevicesNotFoundError: 'not_found',
    NotReadableError: 'not_readable', TrackStartError: 'not_readable',
    NotSupportedError: 'unsupported', AbortError: 'aborted', TimeoutError: 'timeout'
  };
  class TuningUsage {
    constructor(track) { this.track = track; }
    emit(name, fields = {}) {
      try { this.track(name, {...fields, instrument: this.instrument, elapsed_ms: performance.now() - this.started}); }
      catch (_) { /* Observers cannot break audio. */ }
    }
    start(instrument) {
      this.finish('retry');
      this.active = true;
      this.started = performance.now();
      this.instrument = instrument;
      this.mic = this.isReady = this.hasNote = this.timedOut = this.listening = false;
      this.emit('tuner_start');
    }
    microphoneReady() {
      if (!this.active || this.mic) return;
      this.mic = true;
      this.emit('tuner_mic_ready');
    }
    ready(listening = true) {
      if (!this.active || this.isReady) return;
      this.isReady = true;
      this.emit('tuner_ready');
      this.setListening(listening);
    }
    setListening(listening) {
      const eligible = Boolean(this.active && this.isReady && listening);
      if (eligible === this.listening) return;
      this.listening = eligible;
      clearTimeout(this.timer);
      if (!eligible || this.hasNote || this.timedOut) return;
      this.timer = setTimeout(() => {
        this.timedOut = true;
        this.emit('tuner_no_note');
      }, 15000);
    }
    note() {
      if (!this.active || !this.isReady || !this.listening || this.hasNote) return;
      this.hasNote = true;
      clearTimeout(this.timer);
      this.emit('tuner_first_note');
    }
    error(error, stage) {
      if (!this.active) return;
      this.emit('tuner_error', {stage, reason: TuningUsage.errorReason(error)});
      this.finish('error');
    }
    finish(reason) {
      clearTimeout(this.timer);
      if (!this.active) return;
      const outcome = reason === 'error' ? 'error' : this.hasNote ? 'note_detected' : this.isReady ? 'no_note' : 'not_ready';
      this.emit('tuner_end', {outcome, end_reason: reason});
      this.active = false;
      this.listening = false;
    }
    static errorReason(error) { return reasons[error?.name] || 'unknown'; }
  }
  window.TuningUsage = TuningUsage;
})();
