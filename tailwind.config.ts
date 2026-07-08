import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          bg: "#f6f4ee",
          surface: "#ffffff",
          border: "#e3ddcf",
          text: "#2b2620",
          muted: "#8a7d66",
        },
        status: {
          hold: "#b03434",
          partial: "#b07a1e",
          approval: "#6c5fb8",
          ready: "#2660a4",
          inmill: "#c96d28",
          complete: "#3c7a3f",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
