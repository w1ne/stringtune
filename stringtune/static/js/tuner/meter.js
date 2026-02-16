/**
 * @param {string} selector
 * @constructor
 */
const Meter = function (selector) {
  this.$root = document.querySelector(selector);
  this.$pointer = this.$root.querySelector(".tuner .meter-pointer");
  this.init();
  this.currentDeg = 0;
  this.targetDeg = 0;

  // Analogue Physics
  this.velocity = 0;
  this.friction = 0.82;       // Slightly faster responsiveness (was 0.85)
  this.springStrength = 0.15; // Stronger spring (was 0.08) for snappier analogue action

  requestAnimationFrame(this.tick.bind(this));
};

Meter.prototype.init = function () {
  for (var i = 0; i <= 10; i += 1) {
    const $scale = document.createElement("div");
    $scale.className = "meter-scale";
    $scale.style.transform = "rotate(" + (i * 9 - 45) + "deg)";
    if (i % 5 === 0) {
      $scale.classList.add("meter-scale-strong");
    }
    this.$root.appendChild($scale);
  }
};

/**
 * @param {number} deg
 */
Meter.prototype.update = function (deg) {
  // Hard clamp to visual arc (±45 degrees = ±50 cents)
  if (deg > 45) deg = 45;
  if (deg < -45) deg = -45;
  this.targetDeg = deg;
};

Meter.prototype.tick = function () {
  // 1. Spring Physics: Needle has "mass" and "inertia"
  const force = (this.targetDeg - this.currentDeg) * this.springStrength;
  this.velocity += force;
  this.velocity *= this.friction;
  if (!isNaN(this.velocity) && !isNaN(this.currentDeg)) {
    this.currentDeg += this.velocity;
  } else {
    this.velocity = 0;
    this.currentDeg = this.targetDeg || 0;
  }

  // Decay target towards 0 slowly if no new updates received
  // This helps the needle return to center when playing stops
  this.targetDeg *= 0.99;

  // Hard Clamp: Prevent "circles" even if physics explodes
  if (this.currentDeg > 45) {
    this.currentDeg = 45;
    this.velocity = 0;
  } else if (this.currentDeg < -45) {
    this.currentDeg = -45;
    this.velocity = 0;
  }

  // 2. Render if moving
  if (Math.abs(this.velocity) > 0.001 || Math.abs(this.targetDeg - this.currentDeg) > 0.01) {
    this.$pointer.style.transform = "rotate(" + this.currentDeg + "deg)";

    const tunedArea = document.getElementById("tunedArea");
    if (tunedArea) {
      const minTunedDegree = -3;
      const maxTunedDegree = 3;
      if (this.currentDeg >= minTunedDegree && this.currentDeg <= maxTunedDegree) {
        tunedArea.style.visibility = "visible";
      } else {
        tunedArea.style.visibility = "hidden";
      }
    }
  }

  requestAnimationFrame(this.tick.bind(this));
};
