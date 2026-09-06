/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        board: {
          green: '#1a3c2c',
          greenDark: '#0e241a',
          slate: '#13171f',
          slateDark: '#0b0d13',
          border: '#2a3547',
        }
      },
      fontFamily: {
        chalk: ['Comic Sans MS', 'Chalkboard SE', 'Chalkboard', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
