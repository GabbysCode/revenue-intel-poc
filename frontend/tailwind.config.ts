import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f0f0f",
          card: "#1a1a1a",
          hover: "#222222",
          border: "#2a2a2a",
          muted: "#888888",
        },
        accent: {
          green: "#4ade80",
          red: "#f87171",
          yellow: "#facc15",
          blue: "#60a5fa",
          purple: "#a78bfa",
          orange: "#fb923c",
          teal: "#2dd4bf",
        },
      },
    },
  },
  plugins: [],
};
export default config;
