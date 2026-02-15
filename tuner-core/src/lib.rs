use wasm_bindgen::prelude::*;
use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector;

#[wasm_bindgen]
pub struct WasmPitchDetector {
    detector: McLeodDetector<f32>,
    sample_rate: usize,
    result_buffer: [f32; 2],
}

#[wasm_bindgen]
impl WasmPitchDetector {
    pub fn new(sample_rate: usize, fft_size: usize) -> WasmPitchDetector {
        let detector = McLeodDetector::new(fft_size, fft_size / 2);
        WasmPitchDetector {
            detector,
            sample_rate,
            result_buffer: [0.0; 2],
        }
    }

    pub fn detect(&mut self, audio_buffer: &[f32]) -> *const f32 {
        // power_threshold: 0.3, clarity_threshold: 0.1
        match self.detector.get_pitch(audio_buffer, self.sample_rate, 0.3, 0.1) {
            Some(pitch) => {
                self.result_buffer[0] = pitch.frequency;
                self.result_buffer[1] = pitch.clarity;
                self.result_buffer.as_ptr()
            }
            None => std::ptr::null(),
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
        
        let ptr = detector.detect(&signal);
        assert!(!ptr.is_null(), "Should detect a pitch");
        
        let result = unsafe { std::slice::from_raw_parts(ptr, 2) };
        let detected = result[0];
        assert!((detected - frequency).abs() < 1.0, "Expected {}, got {}", frequency, detected);
        assert!(result[1] > 0.4, "Clarity should be sufficient for sine wave");
    }

    #[test]
    fn test_pitch_detection_e2_2048() {
        let sample_rate = 44100;
        let fft_size = 2048;
        let mut detector = WasmPitchDetector::new(sample_rate, fft_size);
        
        let frequency = 82.41; // Low E on guitar
        let signal = generate_sine(frequency, sample_rate, fft_size);
        
        let ptr = detector.detect(&signal);
        assert!(!ptr.is_null(), "Should detect a pitch");
        
        let result = unsafe { std::slice::from_raw_parts(ptr, 2) };
        let detected = result[0];
        assert!((detected - frequency).abs() < 1.0, "Expected {}, got {}", frequency, detected);
        assert!(result[1] > 0.3, "Clarity should be sufficient for low E sine");
    }
}
