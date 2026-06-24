const colors = require('tailwindcss/colors')

module.exports = {
  content: [
    "./_site/**/*.html"
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
