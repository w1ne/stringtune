let wakeLock = null;

const requestWakeLock = async () => {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock was released');
        });
        console.log('Wake Lock is active');
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
};

const releaseWakeLock = async () => {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
    }
};

const screenLockCheckbox = document.getElementById('screenLock');

screenLockCheckbox.addEventListener('change', (event) => {
    if (event.target.checked) {
        requestWakeLock();
        localStorage.setItem('screenLock', 'true');
    } else {
        releaseWakeLock();
        localStorage.setItem('screenLock', 'false');
    }
});

// Check local storage and update checkbox state accordingly
const screenLockState = localStorage.getItem('screenLock');
if (screenLockState === 'true') {
    screenLockCheckbox.checked = true;
    requestWakeLock();
} else {
    screenLockCheckbox.checked = false;
}
