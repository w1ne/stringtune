#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
wasm_output="$(mktemp -d)"
trap 'rm -rf "$wasm_output"' EXIT
wasm-pack build "$project_root/tuner-core" --target web --release --out-dir "$wasm_output" -- --locked
cp "$wasm_output/tuner_core_bg.wasm" "$project_root/stringtune/static/tuner-core/"
cp "$wasm_output/tuner_core.js" "$project_root/stringtune/static/tuner-core/"
