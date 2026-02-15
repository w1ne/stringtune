use tuner_core::WasmPitchDetector;

fn generate_sine_wave(frequency: f32, sample_rate: usize, sample_count: usize) -> Vec<f32> {
    let mut buffer = Vec::with_capacity(sample_count);
    
    for i in 0..sample_count {
        let t = i as f32 / sample_rate as f32;
        let sample = (2.0 * std::f32::consts::PI * frequency * t).sin();
        buffer.push(sample);
    }
    buffer
}

#[test]
fn test_pure_sine_wave_a4() {
    let sample_rate = 44100;
    let fft_size = 4096;
    let mut detector = WasmPitchDetector::new(sample_rate, fft_size);
    
    // Generate 440Hz sine wave (Standard A4)
    let buffer = generate_sine_wave(440.0, sample_rate, fft_size);
    
    let ptr = detector.detect(&buffer);
    assert!(!ptr.is_null(), "Should detect pitch");
    let result = unsafe { std::slice::from_raw_parts(ptr, 2) };
    let pitch = result[0];
    
    println!("Detected: {}, Expected: 440.0", pitch);
    assert!((pitch - 440.0).abs() < 1.0, "Pitch should be within 1Hz of 440Hz");
    assert!(result[1] > 0.4, "Clarity should be sufficient");
}

#[test]
fn test_low_e_guitar() {
    let sample_rate = 44100;
    let fft_size = 4096;
    let mut detector = WasmPitchDetector::new(sample_rate, fft_size);
    
    // Low E string is ~82.41 Hz
    let target = 82.41;
    let buffer = generate_sine_wave(target, sample_rate, fft_size);
    
    let ptr = detector.detect(&buffer);
    assert!(!ptr.is_null(), "Should detect pitch");
    let result = unsafe { std::slice::from_raw_parts(ptr, 2) };
    let pitch = result[0];
    
    println!("Detected: {}, Expected: {}", pitch, target);
    assert!((pitch - target).abs() < 1.0, "Pitch should be within 1Hz of 82.41Hz");
    assert!(result[1] > 0.3, "Clarity should be sufficient");
}

#[test]
fn test_silence() {
    let sample_rate = 44100;
    let fft_size = 4096;
    let mut detector = WasmPitchDetector::new(sample_rate, fft_size);
    
    let buffer = vec![0.0; 4096];
    let ptr = detector.detect(&buffer);
    
    assert!(ptr.is_null(), "Should not detect pitch in silence");
}
