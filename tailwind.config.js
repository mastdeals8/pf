/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff5ee', 100: '#ffe6d5', 200: '#ffcba8', 300: '#ffa571',
          400: '#ff7838', 500: '#f55510', 600: '#e8610a', 700: '#c04d08',
          800: '#983f0e', 900: '#7b360f',
        },
        accent: {
          50: '#fdf8f0', 100: '#faefd8', 200: '#f4dba8', 300: '#ecc270',
          400: '#e2a444', 500: '#d4882a', 600: '#b8701f', 700: '#95571b',
          800: '#7a451d', 900: '#663b1c',
        },
        neutral: {
          50: '#f9f9f9', 100: '#f2f2f2', 200: '#e5e5e5', 300: '#d4d4d4',
          400: '#a3a3a3', 500: '#737373', 600: '#525252', 700: '#404040',
          800: '#262626', 900: '#171717',
        },
        success: {
          50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e',
          600: '#16a34a', 700: '#15803d',
        },
        warning: {
          50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b',
          600: '#d97706', 700: '#b45309',
        },
        error: {
          50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444',
          600: '#dc2626', 700: '#b91c1c',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.04)',
        'card-md': '0 4px 12px -2px rgba(0,0,0,0.08), 0 2px 6px -2px rgba(0,0,0,0.05)',
        'card-lg': '0 8px 24px -4px rgba(0,0,0,0.10), 0 4px 12px -4px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};
