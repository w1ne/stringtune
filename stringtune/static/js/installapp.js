function gtag_report_conversion(url) {
		var callback = function () {
			if (typeof (url) != 'undefined') {
				window.location = url;
			}
		};
		gtag('event', 'conversion', {
			'send_to': 'AW-11228831101/fU5eCPXi_bwYEP26qeop',
			'event_callback': callback
		});
		return false;
	}

	if ('serviceWorker' in navigator) {
		const path = window.location.pathname;
		navigator.serviceWorker.register('/sw.js')
		.then(reg => console.log('Registration succeeded: ', reg))
		.catch(err => console.log('Registration failed: ', err));
	}

	// Initialize deferredPrompt for use later to show browser install prompt.
	let deferredPrompt;

	window.addEventListener('beforeinstallprompt', (e) => {
		// Prevent the mini-infobar from appearing on mobile
		e.preventDefault();
		// Stash the event so it can be triggered later.
		deferredPrompt = e;
		// Update UI notify the user they can install the PWA
		document.getElementById("install-app-prompt").style.display = "block";
	});

	document.getElementById("install-button").addEventListener('click', async () => {
		gtag('event', 'app-install-android', { 'event_category': 'app-install-android', 'event_label': 'app-install-all' });
		gtag_report_conversion();
		document.getElementById("install-app-prompt").style.display = "none";
		// Show the install prompt
		if (!deferredPrompt) return;
		deferredPrompt.prompt();
		// Wait for the user to respond to the prompt
		const { outcome } = await deferredPrompt.userChoice;
		// We've used the prompt, and can't use it again, throw it away
		deferredPrompt = null;
	});

	// Detects if device is on iOS
	function isiOS() {
		return [
			'iPad Simulator',
			'iPhone Simulator',
			'iPod Simulator',
			'iPad',
			'iPhone',
			'iPod'
		].includes(navigator.platform)
			// iPad on iOS 13 detection
			|| (navigator.userAgent.includes("Mac") && "ontouchend" in document)
	}

	const test = isiOS();

	//Detects if device is in standalone mode
	const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone) || (window.matchMedia('(display-mode: standalone)').matches);

	window.dataLayer = window.dataLayer || [];
	function gtag() { dataLayer.push(arguments); }
	gtag('js', new Date());

	gtag('config', 'G-ZJQ4QQXGDS');

	if (isInStandaloneMode()) {
		// If the app is running in standalone mode, hide the language selector
		const languageSelector = document.getElementById('language-selector');
		if (languageSelector) {
			languageSelector.style.display = 'none';
		}
	}

	if (isInStandaloneMode()) {
		if (test) {
			gtag('event', 'pageview-app-ios', { 'event_category': 'pageview-app-ios', 'event_label': 'pageview-app-all' });
		} else {
			gtag('event', 'pageview-app-android', { 'event_category': 'pageview-app-android', 'event_label': 'pageview-app-all' });
		}
	} else {
		if (test) {
			gtag('event', 'pageview-web-ios', { 'event_category': 'pageview-web-ios', 'event_label': 'pageview-web-all' });
		} else {
			gtag('event', 'pageview-web', { 'event_category': 'pageview-web', 'event_label': 'pageview-web-all' });
		}
	}

	if (test && !isInStandaloneMode()) {
		document.getElementById("install-app-prompt-ios").style.display = "block";

		document.getElementById("install-button-ios").addEventListener('click', async () => {
			gtag('event', 'app-install-ios', { 'event_category': 'app-install-ios', 'event_label': 'app-install-all' });
			gtag_report_conversion();
			document.getElementById("install-app-prompt-ios").style.display = "none";
			// Show the install prompt
			document.getElementById("install-app-instructions-ios").style.display = "block";
			document.getElementById("install-app-screen").style.display = "block";
		});
	}
