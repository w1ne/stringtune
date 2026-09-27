<p align="center"><img src="stringtune.svg" alt="StringTune" width="96"></p>

# StringTune

Free online tuner for guitar, bass, ukulele and any other string instrument. It runs in the browser and listens through your microphone. No app, no sign-up.

**Use it:** [stringtune.com](https://stringtune.com/) — in 19 languages.

## What it does

- Detects the pitch of any note and shows on a needle meter whether it is flat, sharp or in tune.
- Presets for guitar, bass and ukulele, with a reference tone for each string.
- Adjustable reference pitch (A4 from 400 to 500 Hz).
- Works offline once loaded, and installs as an app (PWA).
- Audio stays on your device. Nothing is recorded or uploaded.

## How it works

- `tuner-core/` — pitch detection in Rust, compiled to WebAssembly. It uses the McLeod Pitch Method (`pitch_detection` crate).
- An AudioWorklet feeds microphone samples to the WebAssembly detector.
- `stringtune/` — the site, built with Hugo. Translations live in `stringtune/i18n/`.

## Develop

```sh
npm ci
cd stringtune && hugo server
```

CI builds the site, runs the tuner regression tests and Lighthouse CI, and deploys `master` to GitHub Pages.

## Credits

StringTune started as a fork of [qiuxiang/tuner](https://github.com/qiuxiang/tuner) by Qiu Xiang (MIT). Since then it has a new pitch engine, the multilingual site and the PWA.

MIT licensed. See [license](license).
