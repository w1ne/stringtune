# Understanding StringTune usage

The site sends a small set of GA4 events to the existing `G-ZJQ4QQXGDS` property. They measure whether the tuner becomes usable and which controls people use. A stable displayed note is not proof that an instrument was tuned correctly; the events do not measure pitch accuracy or diagnose jumping meters on their own.

## Event dictionary

| Event | Meaning |
| --- | --- |
| `tuner_start` | User presses Start or Retry; begins one attempt. |
| `tuner_mic_ready` | Browser grants a microphone stream; once per attempt. |
| `tuner_ready` | Worklet is ready and capture is connected; once per attempt. |
| `tuner_first_note` | First stable note displayed during visible automatic listening, excluding reference recordings; once per attempt. |
| `tuner_no_note` | No stable note after 15 uninterrupted seconds of visible automatic listening; once per attempt. May simply mean the user has not played a string. |
| `tuner_error` | Startup or runtime failure, with allowlisted stage and reason. |
| `tuner_end` | Stop, navigation, retry or error, with attempt outcome. Navigation events are best effort, especially on mobile. |
| `instrument_change` | Explicit instrument selection, not default initialization. |
| `reference_play` | Reference playback started, with source `tuner` or `recording`. |
| `reference_error` | Reference playback failed. |
| `feedback_open` | User follows the tuner feedback link, not proof that feedback was submitted. |
| `install_prompt_shown` | Browser offered an install prompt and app exposed its controls. |
| `install_prompt_open` | User opens the browser prompt, from `tuner` or `footer`. |
| `install_prompt_result` | Prompt accepted, dismissed or failed; not installation confirmation. |
| `install_instructions_open` | iOS installation instructions shown. |
| `app_installed` | Browser fires `appinstalled`; deduplicated per page. Not available on every browser. |
| `app_open` | Page opened in standalone mode; source distinguishes iOS from other browsers. Not a new installation. |

All events include `schema_version=1`, `locale`, and `app_mode` (`web` or `standalone`). Applicable events include `instrument`, `source`, `stage`, `reason`, `outcome`, and `end_reason`. Attempt events include `elapsed_ms`, measured from Start and bounded to one hour. Thus first-note elapsed time includes permission/startup waiting. The attempt's instrument is its starting preset; later changes have their own event.

Stages: `audio_context`, `microphone`, `download`, `worklet`, `connection`, `capture`, `reference`. Reasons: `not_allowed`, `not_found`, `not_readable`, `unsupported`, `aborted`, `timeout`, `unknown`. Native exceptions that lack a recognized name remain `unknown`; raw exception messages are never sent.

## Reports to configure in GA4

After deployment, confirm events in Realtime or a controlled DebugView session. Register event-scoped custom dimensions for `schema_version`, `instrument`, `stage`, `reason`, `outcome`, `end_reason`, `source`, `app_mode`, and `locale`; register `elapsed_ms` as a custom metric. Use GA4's existing browser, operating system, device category and acquisition dimensions rather than sending device names ourselves.

Create these explorations:

1. **Activation funnel:** `tuner_start` → `tuner_mic_ready` → `tuner_ready` → `tuner_first_note`. Break down by device category, browser, locale and instrument. GA4 user funnels are user-based; event counts represent attempts, so do not interchange the denominators.
2. **Failure table:** counts of `tuner_error` by stage/reason/browser, and `tuner_no_note` by instrument/browser. Compare error counts to start attempts and no-note counts to ready attempts in the same period and segment. Report counts alongside rates when samples are small.
3. **Attempt outcomes:** `tuner_end` by outcome (`note_detected`, `no_note`, `not_ready`, `error`) and end reason. Missing end events cannot be assumed to mean success or failure.
4. **Feature use:** users and event counts for instrument changes, reference playback, feedback clicks, and standalone launches. Separate reference sources.
5. **Installation:** prompt opens → accepted choices → `app_installed`. Keep iOS instructions and standalone launches separate because iOS does not provide equivalent installation confirmation.

`tuner_first_note` can be a product activation milestone; do not label it “successful tuning.” Mark `app_installed` as an installation key event if useful. The old `app-install-android` / `app-install-ios` events and click-triggered advertising conversion are removed because they measured intent rather than completed installation. The older custom `pageview-web*` and `pageview-app*` events are also replaced by standard GA4 page views and the explicit `app_open` event. Update reports that used these legacy names; this is a metric definition change, not a sudden traffic or conversion-rate drop.

## Data boundaries and limitations

- Custom events are enabled only for a production build running on `stringtune.com`, and are dropped when the browser reports offline. There is no offline analytics upload queue.
- No audio samples, pitch/note sequences, microphone labels, raw error strings or feedback text are included in custom events. GA4's existing page/browser metadata collection remains in place.
- Custom events are capped at 200 per page load to bound overhead and a blocked tag's in-memory queue. Blockers, connectivity loss and that cap can make funnels incomplete.
- The no-note timer pauses on backgrounding or any manual reference playback, restarts on return to listening, and is not restarted by a redundant synchronization or instrument change. Repeated readings never emit repeated first-note events.
- Analytics exceptions do not interrupt tuning or installation. Canny feedback remains a separate, user-initiated action.
- Tests intercept every third-party request and verify the commands queued for GA4. They do not establish live ingestion, configured custom definitions, dashboard results or physical-device reliability.

References: [GA4 events](https://developers.google.com/analytics/devguides/collection/ga4/events), [GA4 event parameters](https://developers.google.com/analytics/devguides/collection/ga4/event-parameters), [PWA installation events](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).
