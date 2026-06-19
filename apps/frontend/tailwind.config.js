/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy:  { DEFAULT: '#0D1B2A', 2: '#112236' },
        brand: { DEFAULT: '#1A6FBF', light: '#3B9EE8', dark: '#0F4C8A' },
        teal:  { DEFAULT: '#0EA5A0' },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
