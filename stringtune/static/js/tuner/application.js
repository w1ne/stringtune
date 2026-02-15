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
      gtag('event', 'click-mic-button', {
        'event_category': 'StartTunerButton',
        'event_label': 'Button Clicked',
        'value': '1'
      });
    } catch (error) {
      console.error('Microphone initialization failed:', error);
      gtag('event', 'click-mic-error', {
        'event_category': 'StartTunerError',
        'event_label': 'Mic error',
        'value': error,
      });

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

  // Instrument Selector Logic
  const instrumentSelect = document.getElementById("instrumentSelect");
  if (instrumentSelect) {
    instrumentSelect.addEventListener("change", (e) => {
      const mode = e.target.value;
      // In the future, we can map this to different string sets or A4 defaults
      console.log("Instrument mode switched to:", mode);
      gtag('event', 'change_instrument', {
        'event_category': 'Tuner',
        'event_label': mode
      });
    });
  }

  // PWA Install Logic
  let deferredPrompt;
  const installBtn = document.getElementById("installAppBtn");

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI to notify the user they can add to home screen
    if (installBtn) {
      installBtn.style.display = 'block';

      installBtn.addEventListener('click', (e) => {
        // Hide our user interface that shows our A2HS button
        installBtn.style.display = 'none';
        // Show the prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the A2HS prompt');
            gtag('event', 'pwa_install', {
              'event_category': 'App',
              'event_label': 'Accepted'
            });
          } else {
            console.log('User dismissed the A2HS prompt');
          }
          deferredPrompt = null;
        });
      });
    }
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
