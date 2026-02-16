/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './*.{tsx,ts}',
    './components/**/*.{tsx,ts}',
    './hooks/**/*.{tsx,ts}',
    './services/**/*.{tsx,ts}',
    './node_modules/streamdown/dist/*.js',
  ],
  theme: {
    extend: {
      colors: {
        void: '#06060c',
        surface: '#0c0c14',
        elevated: '#111119',
        panel: '#16161f',
        neon: {
          DEFAULT: '#ff2d78',
          dim: 'rgba(255,45,120,0.08)',
          glow: 'rgba(255,45,120,0.25)',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
