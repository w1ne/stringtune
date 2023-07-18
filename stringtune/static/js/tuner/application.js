const Application = function () {
  this.initA4();
  this.tuner = new Tuner(this.a4);
  this.notes = new Notes(".tuner .notes", this.tuner);
  this.meter = new Meter(".tuner .meter");
  this.frequencyBars = new FrequencyLines(".tuner .frequency-lines");
  this.update({
    name: "A",
    frequency: this.a4,
    octave: 4,
    value: 69,
    cents: 0,
  });
};

Application.prototype.initA4 = function () {
  this.$a4 = document.querySelector(".a4 span");
  this.a4 = parseInt(localStorage.getItem("a4")) || 440;
  this.$a4.innerHTML = this.a4;
};

Application.prototype.start = function () {
  const self = this;

  this.tuner.onNoteDetected = function (note) {
    if (self.notes.isAutoMode) {
      if (self.lastNote === note.name) {
        self.update(note);
      } else {
        self.lastNote = note.name;
      }
    }
  };

  document.getElementById("startButton").addEventListener("click", function () {
    try {
      self.tuner.init();
      self.frequencyData = new Uint8Array(self.tuner.analyser.frequencyBinCount);
  
      // If successful, hide the button
      document.getElementById("startButton").style.display = "none";
      // Send a Google Analytics event
      gtag('event', 'click', {
        'event_category': 'StartTunerButton',
        'event_label': 'Button Clicked',
        'value': '1'
    });
    } catch (error) {
      console.error('Microphone initialization failed:', error);

      let button = document.getElementById("startButton");
      button.style.backgroundColor = "#808080"; // change to grey
      button.textContent = "Error starting mic";
      button.disabled = true; // disable the button
    }
  });

  this.$a4.addEventListener("click", function () {
    swal
      .fire({ input: "number", inputValue: self.a4 })
      .then(function ({ value: a4 }) {
        if (!parseInt(a4) || a4 === self.a4) {
          return;
        }
        self.a4 = a4;
        self.$a4.innerHTML = a4;
        self.tuner.middleA = a4;
        self.notes.createNotes();
        self.update({
          name: "A",
          frequency: self.a4,
          octave: 4,
          value: 69,
          cents: 0,
        });
        localStorage.setItem("a4", a4);
      });
  });

  this.updateFrequencyBars();

  document.querySelector(".auto input").addEventListener("change", () => {
    this.notes.toggleAutoMode();
  });
};

Application.prototype.updateFrequencyBars = function () {
  if (this.tuner.analyser) {
    this.tuner.analyser.getByteFrequencyData(this.frequencyData);
    this.frequencyBars.update(this.frequencyData);
  }
  requestAnimationFrame(this.updateFrequencyBars.bind(this));
};

Application.prototype.update = function (note) {
  this.notes.update(note);
  this.meter.update((note.cents / 50) * 45);
};

const app = new Application();
app.start();
