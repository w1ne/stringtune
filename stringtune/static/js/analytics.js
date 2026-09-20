// A narrow boundary: no audio, pitches, device labels or free-form error text.
(function () {
  const enabled = location.hostname === 'stringtune.com' &&
    document.querySelector('meta[name="stringtune-analytics"]')?.content === 'enabled';
  const events = new Set([
    'tuner_start', 'tuner_mic_ready', 'tuner_ready', 'tuner_first_note',
    'tuner_no_note', 'tuner_error', 'tuner_end', 'instrument_change',
    'reference_play', 'reference_error', 'feedback_open', 'install_prompt_shown',
    'install_prompt_open', 'install_prompt_result', 'install_instructions_open',
    'app_installed', 'app_open'
  ]);
  const values = {
    instrument: ['guitar', 'bass', 'ukulele'],
    stage: ['audio_context', 'microphone', 'download', 'worklet', 'connection', 'capture', 'reference'],
    reason: ['not_allowed', 'not_found', 'not_readable', 'unsupported', 'aborted', 'timeout', 'unknown'],
    source: ['tuner', 'footer', 'browser', 'ios', 'recording'],
    outcome: ['note_detected', 'no_note', 'not_ready', 'error', 'accepted', 'dismissed'],
    end_reason: ['stop', 'pagehide', 'retry', 'error']
  };
  const locales = new Set(['en','ar','da','de','el','es','fi','fr','it','ja','ko','nl','no','pl','pt','sv','tr','uk','zh']);
  let remaining = 200; // Bound custom event/queue growth if a blocker prevents GA loading.
  if (enabled && navigator.onLine !== false) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    try {
      window.gtag('js', new Date());
      window.gtag('config', 'G-ZJQ4QQXGDS');
    } catch (_) { /* Measurement is optional. */ }
  }
  window.StringTuneAnalytics = {
    track(name, fields = {}) {
      try {
        if (!enabled || navigator.onLine === false || !events.has(name) || remaining <= 0 || typeof window.gtag !== 'function') return;
        const params = {
          schema_version: '1',
          locale: locales.has(document.documentElement.lang) ? document.documentElement.lang : 'unknown',
          app_mode: navigator.standalone || window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'web'
        };
        for (const [key, allowed] of Object.entries(values)) {
          if (allowed.includes(fields[key])) params[key] = fields[key];
        }
        if (Number.isFinite(fields.elapsed_ms)) params.elapsed_ms = Math.min(3600000, Math.max(0, Math.round(fields.elapsed_ms)));
        remaining--;
        window.gtag('event', name, params);
      } catch (_) { /* Analytics must never interrupt tuning, navigation or install. */ }
    }
  };
})();
