/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#c2410c', dark: '#9a3412' },
        danger: { DEFAULT: '#b91c1c', dark: '#991b1b' },
        // Landing (Mastrovoce brand): paper, ink and warm greys.
        mv: {
          paper: '#faf7f2',
          ink: '#0f172a',
          sheet: '#ffffff',
          line: '#ddd5c7',
          muted: '#57534e',
          soft: '#f1ece3',
          mark: '#fff1e8',
        },
      },
      fontFamily: {
        'mv-display': ['var(--font-mv-display)', 'Arial Narrow', 'Arial', 'sans-serif'],
        'mv-text': ['var(--font-mv-text)', 'system-ui', 'sans-serif'],
        'mv-hand': ['var(--font-mv-hand)', 'cursive'],
      },
    },
  },
  plugins: [],
};
