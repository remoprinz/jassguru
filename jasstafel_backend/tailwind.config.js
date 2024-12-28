/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/config/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'chalk-red': '#ff0000',
        'chalk-white': '#ffffff',
        'chalk-gray': 'rgba(128, 128, 128, 0.3)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
      }
    },
  },
  plugins: [
    function ({ addUtilities }) {
      addUtilities({
        '.touch-action-none': {
          'touch-action': 'none',
        },
        '.touch-callout-none': {
          '-webkit-touch-callout': 'none',
        },
      });
    },
  ],
};