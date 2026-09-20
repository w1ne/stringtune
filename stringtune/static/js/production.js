// Loaded only by production builds. Descendants inherit this script's CSP trust.
for (const src of [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8679955917317735',
  'https://www.googletagmanager.com/gtag/js?id=G-ZJQ4QQXGDS'
]) {
  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.append(script);
}
