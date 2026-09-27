// The tuner presets (notes.js), the instrument-page string tables
// (data/instruments.json), the instrument menu and the analytics allowlist
// must name the same instruments with the same notes.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const site = path.join(__dirname, '../../stringtune');
const read = file => fs.readFileSync(path.join(site, file), 'utf8');

function presets() {
  const env = {};
  vm.createContext(env);
  vm.runInContext(read('static/js/tuner/notes.js') + '\nthis.Notes = Notes;', env);
  return JSON.parse(JSON.stringify(env.Notes.presets));
}

test('notes.js presets match data/instruments.json', () => {
  assert.deepEqual(presets(), JSON.parse(read('data/instruments.json')));
});

test('every preset has a menu option and an analytics value', () => {
  const menu = read('layouts/partials/tuner.html');
  const analytics = read('static/js/analytics.js');
  const allowed = analytics.match(/instrument: \[([^\]]*)\]/)[1];
  for (const name of Object.keys(presets())) {
    assert.match(menu, new RegExp(`slice "${name}" `), `menu option for ${name}`);
    assert.ok(allowed.includes(`'${name}'`), `analytics value for ${name}`);
  }
});

test('standard tunings are correct', () => {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const spell = values => values.map(v => names[v % 12] + (Math.floor(v / 12) - 1)).join(' ');
  const p = presets();
  assert.equal(spell(p.violin), 'G3 D4 A4 E5');
  assert.equal(spell(p.viola), 'C3 G3 D4 A4');
  assert.equal(spell(p.cello), 'C2 G2 D3 A3');
  assert.equal(spell(p.mandolin), 'G3 D4 A4 E5');
  assert.equal(spell(p.bouzouki4), 'C3 F3 A3 D4');
  assert.equal(spell(p.bouzouki3), 'D3 A3 D4');
  assert.equal(spell(p.banjo5), 'G4 D3 G3 B3 D4');
  assert.equal(spell(p.banjo4), 'C3 G3 D4 A4');
  assert.equal(spell(p.charango), 'G4 C5 E5 A4 E5');
  assert.equal(spell(p.ukulele), 'G4 C4 E4 A4');
  assert.equal(spell(p.bass), 'E1 A1 D2 G2');
  assert.equal(spell(p.guitar), 'E2 A2 D3 G3 B3 E4');
});

test('instrument pages use known presets with one label per string', () => {
  const data = JSON.parse(read('data/instruments.json'));
  const dir = path.join(site, 'content');
  let pages = 0;
  for (const lang of fs.readdirSync(dir)) {
    const langDir = path.join(dir, lang);
    if (!fs.statSync(langDir).isDirectory()) continue;
    for (const file of fs.readdirSync(langDir).filter(f => f.endsWith('-tuner.md'))) {
      const text = fs.readFileSync(path.join(langDir, file), 'utf8');
      assert.match(text, /^type: instrument$/m, `${lang}/${file} type`);
      const blocks = text.split(/^  - preset: /m).slice(1);
      assert.ok(blocks.length > 0, `${lang}/${file} has tunings`);
      for (const block of blocks) {
        const preset = block.split('\n')[0].trim();
        assert.ok(data[preset], `${lang}/${file}: unknown preset ${preset}`);
        const labels = JSON.parse(block.match(/^    labels: (\[.*\])$/m)[1]);
        assert.equal(labels.length, data[preset].length, `${lang}/${file}: labels for ${preset}`);
      }
      pages += 1;
    }
  }
  assert.ok(pages >= 29, `found ${pages} instrument pages`);
});
