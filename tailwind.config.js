const colors = require('tailwindcss/colors')

module.exports = {
  content: [
    "./*.html",
    "./_drafts/**/*.md",
    "./_includes/**/*.html",
    "./_layouts/**/*.html",
    "./_posts/**/*.md",
    "./_data/**/*.yml"
  ],
  theme: {
    colors: {
      ...colors,
      primary: '#155f7a',
      'light-primary': '#dcecf0',
      secondary: '#17130f',
    }
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
}
