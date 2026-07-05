/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Geneus Health design system tokens (design/Geneus Health Design System.dc.html).
      // One calm green as the single point of brand emphasis; everything else is
      // a high-contrast neutral or a semantic (amber = safe-offline, red = error,
      // slate = in-transit). Built for bright sun and low-cost screens.
      colors: {
        brand: {
          DEFAULT: '#00502e', // primary
          dark: '#003d22', // pressed / active
          strong: '#006b3f', // brighter green — labels, dots, section numbers
          tint: '#dcefe2', // light green surface (secondary button, chips)
          wash: '#f0faf3', // faint selected background
          accent: '#8af5b4', // mint — highlights on dark
          'accent-soft': '#9df5bd', // mint — logo / on primary
          'on-dark': '#c8e9d5', // body text on primary green
          'on-dark-muted': '#81d9a2',
        },
        // Warning / pending — "safe, saved on this device, will sync". Never an error.
        amber: {
          DEFAULT: '#8a5a00',
          text: '#7a4f00',
          bg: '#fdeecb',
          border: '#f0d79a',
        },
        // Error
        danger: {
          DEFAULT: '#ba1a1a',
          strong: '#93000a',
          bg: '#ffdad6',
        },
        // Tertiary / in-transit (syncing, incoming referrals)
        slate: {
          DEFAULT: '#394750',
          text: '#2c3b52',
          bg: '#dde3f0',
        },
        // Neutral surfaces (light → dark)
        surface: {
          DEFAULT: '#f8f9fa', // app screen background
          container: '#edeeef',
          high: '#e1e3e4',
          muted: '#f3f4f5', // inset panels
        },
        // Ink / text
        ink: {
          DEFAULT: '#191c1d', // on-surface
          soft: '#3f4941', // on-surface-variant
          muted: '#6f7a71', // labels, secondary text
        },
        // Borders
        outline: {
          DEFAULT: '#bec9bf', // field / control borders
          soft: '#e1e3e4', // hairline card borders
          hair: '#d9dadb',
        },
      },
      fontFamily: {
        sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        field: '12px', // inputs, buttons
        card: '16px', // cards, panels
        sheet: '26px', // bottom sheets
        phone: '42px', // device frame (design canvas)
      },
      boxShadow: {
        // Soft green-tinted elevation used on cards and the device frame.
        card: '0 1px 3px rgba(0, 40, 20, 0.08)',
        sheet: '0 -12px 40px rgba(0, 0, 0, 0.16)',
      },
    },
  },
  plugins: [],
};
