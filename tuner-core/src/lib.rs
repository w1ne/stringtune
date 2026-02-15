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

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    fn generate_sine(frequency: f32, sample_rate: usize, length: usize) -> Vec<f32> {
        (0..length)
            .map(|i| (2.0 * PI * frequency * i as f32 / sample_rate as f32).sin())
            .collect()
    }

    #[test]
    fn test_pitch_detection_a4() {
        let sample_rate = 44100;
        let fft_size = 2048;
        let mut detector = WasmPitchDetector::new(sample_rate, fft_size);
        
        let frequency = 440.0;
        let signal = generate_sine(frequency, sample_rate, fft_size);
        
        let detected = detector.detect(&signal).expect("Should detect a pitch");
        assert!((detected - frequency).abs() < 1.0, "Expected {}, got {}", frequency, detected);
    }

    #[test]
    fn test_pitch_detection_e2() {
        let sample_rate = 44100;
        let fft_size = 2048;
        let mut detector = WasmPitchDetector::new(sample_rate, fft_size);
        
        let frequency = 82.41; // Low E on guitar
        let signal = generate_sine(frequency, sample_rate, fft_size);
        
        let detected = detector.detect(&signal).expect("Should detect a pitch");
        assert!((detected - frequency).abs() < 1.0, "Expected {}, got {}", frequency, detected);
    }
}
