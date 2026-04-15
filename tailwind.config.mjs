/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        bone: '#F1E9DA',
        paper: '#F8F1E3',
        ink: '#1A1410',
        muted: '#5E4F43',
        terracotta: '#B85C3C',
        clay: '#8C4A2F',
        sage: '#6F7B66',
        moss: '#4E5946',
        gold: '#A8873E',
        blush: '#D9A897',
        stone: '#A89B88',
      },
      fontFamily: {
        display: ['"Instrument Serif"', '"Cormorant Garamond"', 'serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        editorial: '0.35em',
      },
    },
  },
  plugins: [],
};
