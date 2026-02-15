use wasm_bindgen::prelude::*;
use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector;

#[wasm_bindgen]
pub struct WasmPitchDetector {
    detector: McLeodDetector<f32>,
    sample_rate: usize,
}

#[wasm_bindgen]
impl WasmPitchDetector {
    pub fn new(sample_rate: usize, fft_size: usize) -> WasmPitchDetector {
        // padding is typically fft_size / 2 for overlap
        let detector = McLeodDetector::new(fft_size, fft_size / 2);
        WasmPitchDetector {
            detector,
            sample_rate,
        }
    }

    pub fn detect(&mut self, audio_buffer: &[f32]) -> Option<f32> {
        // get_pitch(signal, sample_rate, power_threshold, clarity_threshold)
        // power_threshold: 0.5 (more sensitive to quiet playing)
        // clarity_threshold: 0.4 (more tolerant of noise/harmonics)
        match self.detector.get_pitch(audio_buffer, self.sample_rate, 0.5, 0.4) {
            Some(pitch) => Some(pitch.frequency),
            None => None,
        }
    }
}
