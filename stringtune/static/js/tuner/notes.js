const Notes = function (selector, tuner) {
  this.tuner = tuner;
  this.isAutoMode = true;
  this.$root = document.querySelector(selector);
  this.$notesList = this.$root.querySelector(".notes-list");
  this.$frequency = this.$root.querySelector("#freqValue");
  this.$notes = [];
  this.$notesMap = {};
  this.createNotes();
  this.$notesList.addEventListener("touchstart", (event) =>
    event.stopPropagation()
  );
};

Notes.prototype.createNotes = function () {
  this.$notesList.innerHTML = "";
  this.$notes = [];
  this.$notesMap = {};
  const minOctave = 1;
  const maxOctave = 8;
  for (var octave = minOctave; octave <= maxOctave; octave += 1) {
    for (var n = 0; n < 12; n += 1) {
      const $note = document.createElement("button");
      $note.type = "button";
      $note.className = "note";
      $note.disabled = this.isAutoMode;
      $note.dataset.name = this.tuner.noteStrings[n];
      $note.dataset.value = 12 * (octave + 1) + n;
      $note.dataset.octave = octave.toString();
      $note.dataset.frequency = this.tuner.getStandardFrequency(
        $note.dataset.value
      );
      $note.innerHTML =
        $note.dataset.name[0] +
        '<span class="note-sharp">' +
        ($note.dataset.name[1] || "") +
        "</span>" +
        '<span class="note-octave">' +
        $note.dataset.octave +
        "</span>";
      $note.setAttribute("aria-label", $note.dataset.name + $note.dataset.octave);
      this.$notesList.appendChild($note);
      this.$notes.push($note);
      this.$notesMap[$note.dataset.value] = $note;
    }
  }

  this.$notes.forEach($note => {
    $note.addEventListener('click', () => {
      if (!this.isAutoMode) this.playReference(Number($note.dataset.value));
    });
  });
};

Notes.presets = {
  guitar: [40, 45, 50, 55, 59, 64],
  bass: [28, 33, 38, 43],
  ukulele: [67, 60, 64, 69]
};

Notes.prototype.setInstrument = function (instrument) {
  this.tuner.stopOscillator();
  this.playingNote = null;
  this.instrument = instrument;
  const targets = document.getElementById('stringTargets');
  targets.replaceChildren();
  (Notes.presets[instrument] || Notes.presets.guitar).forEach(value => {
    const button = document.createElement('button');
    const name = this.tuner.noteStrings[value % 12] + (Math.floor(value / 12) - 1);
    button.type = 'button';
    button.dataset.value = value;
    button.textContent = name;
    button.setAttribute('aria-label', name + ' reference tone');
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => this.playReference(value));
    targets.appendChild(button);
  });
};

Notes.prototype.playReference = async function (value) {
  this.setAutoMode(false);
  if (this.playingNote === value) {
    this.tuner.stopOscillator();
    this.playingNote = null;
    this.clearActive();
    this.$frequency.textContent = '—';
  } else {
    this.playingNote = value;
    const frequency = this.tuner.getStandardFrequency(value);
    try {
      await this.tuner.play(frequency);
      if (this.playingNote !== value || this.isAutoMode) return;
      this.update({value, frequency});
    } catch (error) {
      this.playingNote = null;
      if (this.onError) this.onError(error);
      return;
    }
  }
  document.querySelectorAll('#stringTargets button').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.value) === this.playingNote));
  });
  if (this.onReference) this.onReference(this.playingNote !== null);
};

Notes.prototype.active = function ($note) {
  this.clearActive();
  $note.classList.add("active");
  const containerWidth = this.$notesList.offsetWidth;
  const noteOffset = $note.offsetLeft;
  const noteWidth = $note.offsetWidth;
  const scrollOffset = noteOffset - (containerWidth - noteWidth) / 2;
  this.$notesList.scrollTo({
    left: scrollOffset,
    behavior: "smooth"
  });
};

Notes.prototype.clearActive = function () {
  const $active = this.$notesList.querySelector(".active");
  if ($active) {
    $active.classList.remove("active");
  }
};

Notes.prototype.update = function (note) {
  if (note.value in this.$notesMap) {
    this.active(this.$notesMap[note.value]);
    if (this.$frequency) {
      this.$frequency.textContent = parseFloat(note.frequency).toFixed(1);
    } else {
      console.warn("this.$frequency element not found");
    }
  }
};

Notes.prototype.setAutoMode = function (enabled) {
  if (enabled) {
    this.tuner.stopOscillator();
    this.playingNote = null;
    document.querySelectorAll('#stringTargets button').forEach(button => button.setAttribute('aria-pressed', 'false'));
  }
  this.isAutoMode = enabled;
  this.$notes.forEach(note => { note.disabled = enabled; });
};

Notes.prototype.toggleAutoMode = function () {
  this.setAutoMode(!this.isAutoMode);
  this.clearActive();
};
