import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070c1c',
          900: '#0d1730',
        },
        line: {
          subtle: '#1c2f5c',
          strong: '#2a4a8c',
        },
        cyan: {
          400: '#38e8ff',
        },
        indigo: {
          500: '#3a4bd6',
        },
        frost: {
          100: '#eaf6ff',
          300: '#cfe4ff',
          500: '#9db3d9',
        },
        win: '#3af0b0',
        loss: '#ff5f5f',
        amber: '#ffc04d',
      },
      fontFamily: {
        sans: ['var(--font-rajdhani)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
