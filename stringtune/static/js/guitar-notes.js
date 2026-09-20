let currentAudio = null;
let currentButton = null;

function playPauseAudio(file, btnElement) {
    if (currentAudio) {
        currentAudio.pause();
        currentButton.innerHTML = "▶️";
        if (currentButton === btnElement) {
            currentAudio.currentTime = 0;  // reset the audio to the beginning
            currentAudio = null;
            currentButton = null;
            return;
        }
    }

    currentAudio = new Audio('/sounds/' + file);
    currentAudio.loop = true;  // make the audio play in a loop
    currentAudio.play();
    currentButton = btnElement;

    btnElement.innerHTML = "⏸️";
    currentAudio.onended = function() {
        btnElement.innerHTML = "▶️";
        currentAudio = null;
        currentButton = null;
    };
}

document.querySelectorAll("[data-sound]").forEach(button => {
    button.addEventListener("click", () => playPauseAudio(button.dataset.sound, button));
});
