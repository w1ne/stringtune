# Tuner reliability implementation plan

Approved design: docs/reviews/2026-09-20-review.md; user approved the focused repair pass on 2026-09-20.

Goal: recoverable microphone startup, independent reference playback, functional presets, validated calibration, honest idle/silent states, responsive layout, and executable regression tests.

Architecture: retain Hugo templates and existing Tuner/Notes/Meter/Application responsibilities. Tuner owns audio lifecycle; Application owns UI states; Notes owns instrument targets and reference selection. Keep the current detector initially and investigate accuracy with the real WASM.

- [x] Repair nested npm lockfile and execute Jest; update obsolete test contracts, use real WASM simulations, repair Rust tests and add runtime checks to CI.
- [x] Add failing tests for reference playback without mic, propagated startup failure and retry, finite calibration, idle reading, instrument presets, silence reset, and initial needle render.
- [x] Implement awaited microphone/engine readiness with timeout, track cleanup, independent AudioContext setup, low-volume reference playback, and recoverable UI states.
- [x] Add instrument-specific reference targets while retaining chromatic detection, validate A4 at load and entry, expose accessible state/calibration controls, neutral idle display and stale-reading timeout.
- [x] Constrain note strip and scale meter geometry to viewport; keep existing colors. Verify 320/390/768/1280px screens and real browser interactions.
- [x] Run Jest, Rust, Hugo build and browser regression tests. Investigate bass bias independently; document residual physical-device limitations. Review diff and commit the scoped repairs.

Commands: npm ci && npm test -- --runInBand (in stringtune/); cargo test --locked (in tuner-core/); Hugo 0.114.0 build from stringtune/; Playwright browser regression against the generated local site.

Validation: 9 lifecycle/cache tests, 10 Jest tests, 6 Rust tests, Markdown lint, Hugo build and styled browser flows including offline startup pass. Independent review findings were reproduced and repaired. See docs/reviews/2026-09-20-repairs.md.
