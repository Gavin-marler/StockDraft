/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        panel: "#141821",
        accent: "#22c55e",
        loss: "#ef4444",
      },
    },
  },
  plugins: [],
};
