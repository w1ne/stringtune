# Usage measurement implementation plan

> Use the executing-plans skill to complete this approved scope and verify each step.

**Goal:** Identify where tuning attempts succeed or fail and provide direct access to user feedback.

**Architecture:** Reuse GA4 through a small allowlisted, production-only adapter. Keep per-attempt milestone state outside the audio engine; attach explicit lifecycle hooks at microphone acquisition and startup completion. Use a single install-prompt controller for both existing install buttons.

**Tech stack:** Existing plain JavaScript, Hugo, GA4, Node/Jest and Playwright.

## Approved design

The user approved tracking start → microphone ready → first stable note, permission/audio/no-note failures, instrument/reference usage, actual installation, and a small feedback button. The existing Canny board receives feedback; no new service or session recording is needed. Do not transmit audio, pitches, device labels, arbitrary error messages, or user-entered feedback in analytics.

A no-note event means no displayed stable note after 15 uninterrupted seconds of visible, automatic listening. It is an observation, not proof of a defect. Stop, backgrounding and manual-reference mode cancel the timer; returning to visible auto listening restarts it. First stable note is counted once per attempt and is not labeled a completed tuning. End events summarize the attempt's outcome. Analytics transport failures must never affect audio or UI.

Local/preview builds and offline sessions do not send usage events. Production runtime checks protect production builds served on localhost. Existing GA page views continue; coarse schema version, locale and display mode allow reports to separate rollout and app/web use. Browser/OS breakdowns use GA's existing dimensions.

Only `appinstalled` establishes a confirmed install; accepted/dismissed prompts and iOS instructions are distinct events. An installed iOS launch is app usage, not a newly confirmed installation.

## Tasks

- [x] Add failing tests for event allowlisting, production/offline gating, bounded timing, once-per-attempt milestones and timer cancellation.
- [x] Implement the analytics adapter and attempt observer; wire lifecycle hooks, instrument changes and reference playback.
- [x] Add regression tests for shared install prompt handling; record prompt outcomes and confirmed installs separately.
- [x] Add localized feedback link, CSP hashes and offline/version updates; document the event dictionary and GA4 report recipe.
- [ ] Run unit/browser/security/accessibility/Lighthouse checks, request code review, update PR #2 and wait for hosted CI.

## Verification

Use fake timers for no-note detection and stale callbacks; stub analytics to prove blocked/throwing transport cannot break application flows. Browser tests exercise the real controls with synthetic microphone audio and intercepted third-party requests, including production-host routing. Preserve the existing offline/audio and CSP enforcement checks. No production deployment or live analytics configuration is implied by these code changes.
