use pitch_detection::detector::mcleod::McLeodDetector;
use pitch_detection::detector::PitchDetector;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmPitchDetector {
    detector: McLeodDetector<f32>,
    sample_rate: usize,
    audio_buffer: Vec<f32>,
    result_buffer: [f32; 2],
}

#[wasm_bindgen]
impl WasmPitchDetector {
    pub fn new(sample_rate: usize, fft_size: usize) -> WasmPitchDetector {
        let detector = McLeodDetector::new(fft_size, fft_size / 2);
        WasmPitchDetector {
            detector,
            sample_rate,
            audio_buffer: vec![0.0; fft_size],
            result_buffer: [0.0; 2],
        }
    }

    pub fn audio_ptr(&mut self) -> *mut f32 {
        self.audio_buffer.as_mut_ptr()
    }

    pub fn result_ptr(&self) -> *const f32 {
        self.result_buffer.as_ptr()
    }

    pub fn detect(&mut self) -> bool {
        match self
            .detector
            .get_pitch(&self.audio_buffer, self.sample_rate, 0.3, 0.1)
        {
            Some(pitch) => {
                self.result_buffer[0] =
                    refine_frequency(&self.audio_buffer, self.sample_rate, pitch.frequency);
                self.result_buffer[1] = pitch.clarity;
                true
            }
            None => false,
        }
    }
}

// The dependency's finite-window autocorrelation peak is biased toward shorter
// periods, most visibly on bass notes. Keep its candidate/clarity selection,
// then refine only the nearby period using correctly normalized overlapping
// sample pairs. This avoids a fixed cents offset that would depend on phase.
fn refine_frequency(signal: &[f32], sample_rate: usize, frequency: f32) -> f32 {
    let period = sample_rate as f64 / frequency as f64;
    if !period.is_finite() || period < 2.0 || period > (signal.len() / 2) as f64 {
        return frequency;
    }
    let center = period.round() as usize;
    let radius = ((period * 0.01).ceil() as usize).max(2);
    let start = center.saturating_sub(radius).max(1);
    let end = (center + radius).min(signal.len() / 2);
    let correlation = |lag: usize| -> f64 {
        let mut cross = 0.0;
        let mut energy = 0.0;
        for i in 0..signal.len() - lag {
            let a = signal[i] as f64;
            let b = signal[i + lag] as f64;
            cross += a * b;
            energy += a * a + b * b;
        }
        if energy > 0.0 {
            2.0 * cross / energy
        } else {
            0.0
        }
    };
    let mut best = center;
    let mut peak = f64::NEG_INFINITY;
    for lag in start..=end {
        let value = correlation(lag);
        if value > peak {
            best = lag;
            peak = value;
        }
    }
    // A boundary maximum suggests the candidate needs a wider search; preserve
    // the original rather than guessing a new fundamental.
    if best == start || best == end {
        return frequency;
    }
    let left = correlation(best - 1);
    let right = correlation(best + 1);
    let curvature = left - 2.0 * peak + right;
    let offset = if curvature.abs() > f64::EPSILON {
        (0.5 * (left - right) / curvature).clamp(-0.5, 0.5)
    } else {
        0.0
    };
    (sample_rate as f64 / (best as f64 + offset)) as f32
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

        detector.audio_buffer.copy_from_slice(&signal);
        assert!(detector.detect(), "Should detect a pitch");

        let result = unsafe { std::slice::from_raw_parts(detector.result_ptr(), 2) };
        let detected = result[0];
        assert!(
            (detected - frequency).abs() < 1.0,
            "Expected {}, got {}",
            frequency,
            detected
        );
        assert!(
            result[1] > 0.4,
            "Clarity should be sufficient for sine wave"
        );
    }

    #[test]
    fn test_pitch_detection_e2_2048() {
        let sample_rate = 44100;
        let fft_size = 2048;
        let mut detector = WasmPitchDetector::new(sample_rate, fft_size);

        let frequency = 82.41; // Low E on guitar
        let signal = generate_sine(frequency, sample_rate, fft_size);

        detector.audio_buffer.copy_from_slice(&signal);
        assert!(detector.detect(), "Should detect a pitch");

        let result = unsafe { std::slice::from_raw_parts(detector.result_ptr(), 2) };
        let detected = result[0];
        assert!(
            (detected - frequency).abs() < 1.0,
            "Expected {}, got {}",
            frequency,
            detected
        );
        assert!(
            result[1] > 0.3,
            "Clarity should be sufficient for low E sine"
        );
    }
}
