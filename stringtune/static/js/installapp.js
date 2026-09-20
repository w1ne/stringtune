(function () {
  'use strict';

  const element = (id) => document.getElementById(id);
  const display = (id, value) => {
    const node = element(id);
    if (node) node.style.display = value;
  };
  const track = (name, fields) => {
    try {
      window.StringTuneAnalytics?.track(name, fields);
    } catch (_) {
      // Measurement must never interrupt installation.
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Registration succeeded: ', reg))
      .catch(err => console.log('Registration failed: ', err));
  }

  const ios = ['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod']
    .includes(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
  const standalone = Boolean(navigator.standalone) || window.matchMedia('(display-mode: standalone)').matches;
  let deferredPrompt = null;
  let installed = false;

  function showBrowserControls(visible) {
    display('install-app-prompt', visible ? 'block' : 'none');
    for (const id of ['install-button', 'installAppBtn']) {
      const button = element(id);
      if (button) {
        button.disabled = !visible;
        button.style.display = visible ? '' : 'none';
      }
    }
  }

  showBrowserControls(false);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    if (installed || standalone) return;
    deferredPrompt = event;
    showBrowserControls(true);
    track('install_prompt_shown', { source: 'browser' });
  });

  async function openPrompt(source) {
    if (!deferredPrompt) return;
    // Consume synchronously: both buttons share the same single-use browser event.
    const prompt = deferredPrompt;
    deferredPrompt = null;
    showBrowserControls(false);
    track('install_prompt_open', { source });
    try {
      const choice = Promise.resolve(prompt.userChoice);
      // Observe choice immediately even if prompt() throws or rejects first.
      choice.catch(() => {});
      await prompt.prompt();
      const { outcome } = await choice;
      track('install_prompt_result', {
        source,
        outcome: outcome === 'accepted' || outcome === 'dismissed' ? outcome : 'error'
      });
    } catch (_) {
      track('install_prompt_result', { source, outcome: 'error' });
    }
  }

  for (const [id, source] of [['install-button', 'footer'], ['installAppBtn', 'tuner']]) {
    element(id)?.addEventListener('click', () => openPrompt(source));
  }

  window.addEventListener('appinstalled', () => {
    if (installed) return;
    installed = true;
    deferredPrompt = null;
    showBrowserControls(false);
    display('install-app-prompt-ios', 'none');
    display('install-app-instructions-ios', 'none');
    display('install-app-screen', 'none');
    track('app_installed', { source: 'browser' });
  });

  if (standalone) {
    display('language-selector', 'none');
    track('app_open', { source: ios ? 'ios' : 'browser' });
  } else if (ios) {
    display('install-app-prompt-ios', 'block');
    element('install-button-ios')?.addEventListener('click', () => {
      display('install-app-prompt-ios', 'none');
      display('install-app-instructions-ios', 'block');
      display('install-app-screen', 'block');
      track('install_instructions_open', { source: 'ios' });
    });
  }
})();
