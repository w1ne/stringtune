let currentAudio = null;
let currentButton = null;

function notifyReferenceRecording(playing) {
    try {
        document.dispatchEvent(new CustomEvent('stringtune:reference', { detail: { playing } }));
    } catch (_) {
        // An unavailable observer must not interrupt playback controls.
    }
}

function stopReferenceRecording() {
    const audio = currentAudio;
    const button = currentButton;
    currentAudio = null;
    currentButton = null;
    if (button) button.innerHTML = '▶️';
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        notifyReferenceRecording(false);
    }
}

function trackReferenceRecording(name, instrument, error) {
    try {
        const fields = { source: 'recording', instrument };
        if (name === 'reference_error') {
            fields.stage = 'reference';
            fields.reason = window.TuningUsage?.errorReason(error) || 'unknown';
        }
        const send = () => { try { window.StringTuneAnalytics?.track(name, fields); } catch (_) { /* Optional. */ } };
        // analytics.js is deferred: hold events fired while the page still parses.
        if (!window.StringTuneAnalytics && window.document?.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', send, { once: true });
        } else {
            send();
        }
    } catch (_) {
        // Measurement must never interrupt audio controls.
    }
}

async function playPauseAudio(file, btnElement) {
    const togglingOff = currentButton === btnElement;
    stopReferenceRecording();
    if (togglingOff) return;

    const instrument = btnElement.closest('[data-instrument]')?.dataset.instrument;
    let audio;
    try {
        audio = new Audio('/sounds/' + file);
        audio.loop = true;
        currentAudio = audio;
        currentButton = btnElement;
        notifyReferenceRecording(true);
        audio.onended = () => {
            if (currentAudio === audio) stopReferenceRecording();
        };
        await audio.play();
        // A different button, stop, or pagehide may have replaced this playback.
        if (currentAudio !== audio) return;
        btnElement.innerHTML = '⏸️';
        trackReferenceRecording('reference_play', instrument);
    } catch (error) {
        // A rejected superseded play request is expected during rapid switching.
        if (audio && currentAudio !== audio) return;
        stopReferenceRecording();
        trackReferenceRecording('reference_error', instrument, error);
    }
}

document.querySelectorAll('[data-sound]').forEach(button => {
    button.addEventListener('click', () => playPauseAudio(button.dataset.sound, button));
});
window.addEventListener('pagehide', stopReferenceRecording);
