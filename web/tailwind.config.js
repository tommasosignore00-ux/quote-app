/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#c2410c', dark: '#9a3412' },
        danger: { DEFAULT: '#b91c1c', dark: '#991b1b' },
      },
    },
  },
  plugins: [],
};
