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
  // Start the physics loop
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
  this.targetDeg = deg;
};

Meter.prototype.tick = function () {
  // Smoothly move currentDeg towards targetDeg (Simple Ease-Out)
  // 0.15 factor gives a nice responsive but weighted feel
  const diff = this.targetDeg - this.currentDeg;

  if (Math.abs(diff) > 0.05) {
    this.currentDeg += diff * 0.3;
    this.$pointer.style.transform = "rotate(" + this.currentDeg + "deg)";

    // Update visibility logic based on current position
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
