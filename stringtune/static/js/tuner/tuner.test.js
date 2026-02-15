/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

// Mock AudioContext and other browser globals BEFORE loading scripts
global.AudioContext = jest.fn().mockImplementation(() => ({
    createAnalyser: jest.fn().mockReturnValue({
        connect: jest.fn(),
        frequencyBinCount: 1024,
        getByteFrequencyData: jest.fn(),
    }),
    createMediaStreamSource: jest.fn().mockReturnValue({
        connect: jest.fn(),
    }),
    audioWorklet: {
        addModule: jest.fn().mockResolvedValue(true),
    },
    destination: {},
}));

global.AudioWorkletNode = jest.fn().mockImplementation(() => ({
    port: {
        onmessage: null,
        postMessage: jest.fn(),
    },
    connect: jest.fn(),
}));

// Mock browser APIs
global.navigator.mediaDevices = {
    getUserMedia: jest.fn().mockResolvedValue({}),
};

function loadScript(filename) {
    const code = fs.readFileSync(path.resolve(__dirname, filename), 'utf8');
    // Replace 'const ' or 'let ' with 'window.' to make them accessible in JSDOM
    const modifiedCode = code
        .replace(/^const\s+([a-zA-Z0-9_$]+)\s*=/gm, 'window.$1 =')
        .replace(/^let\s+([a-zA-Z0-9_$]+)\s*=/gm, 'window.$1 =');

    // Execute in the global context of JSDOM
    const script = document.createElement('script');
    script.textContent = modifiedCode;
    document.head.appendChild(script);
}

// Load scripts into JSDOM window
loadScript('tuner.js');
loadScript('meter.js');

describe('Tuner and Meter Unit Tests', () => {
    beforeEach(() => {
        // Mock DOM structure needed by classes
        document.body.innerHTML = `
            <div class="tuner">
                <div class="meter">
                    <div class="meter-pointer"></div>
                    <div id="tunedArea"></div>
                </div>
                <div class="notes">
                    <div class="notes-list"></div>
                    <div id="freqValue"></div>
                </div>
                <div class="a4"><span>440</span></div>
            </div>
        `;
    });

    test('Tuner class is available and calculates notes correctly', () => {
        const tuner = new window.Tuner(440);
        expect(tuner).toBeDefined();
        // A4 = 440Hz
        expect(tuner.getNote(440)).toBe(69);
        // E2 (Guitar low E) ~ 82.41Hz
        expect(tuner.getNote(82.41)).toBe(40);
    });

    test('Tuner calculates cents correctly', () => {
        const tuner = new window.Tuner(440);
        // 440Hz is exactly A4 (69), so 0 cents
        expect(tuner.getCents(440, 69)).toBe(0);
        // Half semitone up (50 cents)
        const fiftyCentsUp = 440 * Math.pow(2, 50 / 1200);
        expect(tuner.getCents(fiftyCentsUp, 69)).toBe(50);
    });

    test('Meter class updates target degree and handles NaN', () => {
        const meter = new window.Meter('.tuner .meter');
        meter.update(45);
        expect(meter.targetDeg).toBe(45);

        // Test NaN protection
        meter.velocity = NaN;
        meter.currentDeg = NaN;
        meter.tick();
        expect(meter.velocity).toBe(0);
        expect(meter.currentDeg).toBe(45);
    });

    test('Tuner updatePitch triggers onNoteDetected callback', () => {
        const tuner = new window.Tuner(440);
        const callback = jest.fn();
        tuner.onNoteDetected = callback;

        tuner.updatePitch(440);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            name: 'A',
            value: 69,
            frequency: 440,
            octave: 4
        }));
    });

    test('Tuner smoothing logic', () => {
        const tuner = new window.Tuner(440);
        tuner.smoothing = true;
        tuner.smoothingDepth = 3;

        // First update initializes EMA
        const first = tuner.smoothFrequency(440, 1.0);
        expect(first).toBe(440);

        // Second update pulls it towards new value
        const second = tuner.smoothFrequency(450, 1.0);
        expect(second).toBeGreaterThan(440);
        expect(second).toBeLessThan(450);
    });

    test('Tuner stability check for note changes', () => {
        const tuner = new window.Tuner(440);
        tuner.stableLimit = 2; // Shorten for test
        tuner.smoothing = false;
        const callback = jest.fn();
        tuner.onNoteDetected = callback;

        // E2 is note 40
        tuner.updatePitch(82.41);
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({
            isStable: false,
            value: 40
        }));

        // Second time stableCount becomes 1
        tuner.updatePitch(82.41);
        expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({
            isStable: false,
            value: 40
        }));

        // Third time stableCount becomes 2 (limit reached)
        tuner.updatePitch(82.41);
        expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({
            isStable: true,
            value: 40
        }));

        // Changing note makes it unstable again
        tuner.updatePitch(87.31); // F2
        expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({
            isStable: false,
            value: 41
        }));
    });
});
