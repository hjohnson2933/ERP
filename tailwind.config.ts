import type { Config } from "tailwindcss";

// Color tokens mirror the mill list's "ink-toned" status palette
// (see types.ts STATUSES/STAGES) so shared concepts like job status
// look identical in both apps.
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
