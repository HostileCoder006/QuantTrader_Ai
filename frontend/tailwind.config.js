/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#071014",
        panel: "#101a20",
        panel2: "#15242b",
        line: "#263941",
        mint: "#38d99a",
        cyan: "#43c8f5",
        amber: "#f7c35f"
      },
      boxShadow: {
        glow: "0 16px 60px rgba(56, 217, 154, 0.12)"
      }
    }
  },
  plugins: []
};
