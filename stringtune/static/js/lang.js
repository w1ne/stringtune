window.onload = function() {
  var savedLanguage = localStorage.getItem('selectedLanguage');
  var savedLanguageLink = localStorage.getItem('selectedLanguageLink');

  var htmlTag = document.querySelector('html');
  var currentLanguage = htmlTag.getAttribute('lang');

  var needToRedirect = false;
  var linkToRedirect = "";

  // Check if there is a savedLanguage and it's not the current language,
  // and savedLanguageLink is not null or empty
  if (savedLanguage && currentLanguage !== savedLanguage 
      && savedLanguageLink && savedLanguageLink.trim() !== '') {
      needToRedirect = true;
      linkToRedirect = savedLanguageLink;
  }

  // Add an event listener for each language link
  var languageLinks = document.querySelectorAll('.language-link');
  languageLinks.forEach(function (link) {
      link.addEventListener('click', function(e) {
          var lang = this.getAttribute('data-lang');
          var langLink = this.getAttribute('data-link');
          saveLanguage(lang, langLink);
          // Reset the redirected flag when the language is manually changed
          localStorage.removeItem('redirected');
      });
  });

  // If we need to redirect, do it here
  if (needToRedirect && !localStorage.getItem('redirected')) {
      localStorage.setItem('redirected', "true");
      window.location.href = linkToRedirect;
  }
}

function saveLanguage(lang, langLink) {
  localStorage.setItem('selectedLanguage', lang);
  localStorage.setItem('selectedLanguageLink', langLink);
}
