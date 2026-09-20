const purgecss = require('@fullhuman/postcss-purgecss').default;
module.exports = {
  plugins: [purgecss({
    // Scan sources, not public/: Hugo runs PostCSS before all pages are written.
    // Include JS so interactive states and generated note controls survive.
    content: ['./layouts/**/*.html', './themes/viko/layouts/**/*.html', './content/**/*.{md,html}', './static/js/**/*.js', './themes/viko/assets/js/**/*.js'],
    defaultExtractor: content => content.match(/[A-Za-z0-9_:/-]+/g) || [],
    safelist: ['html', 'body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img', 'br']
  })]
};
