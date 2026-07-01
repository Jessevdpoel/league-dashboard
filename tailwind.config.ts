import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        charcoal: {
          800: '#2a2622',
          900: '#1c1a17',
          950: '#121110',
        },
        gold: {
          100: '#f5e9c8',
          200: '#e9d6a0',
          300: '#dcc178',
          400: '#c9a24f',
          500: '#b3893a',
          700: '#8a6a2c',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
