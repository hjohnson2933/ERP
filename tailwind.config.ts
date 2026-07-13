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
        // Dark chrome (sidebar + top bar), mirroring the Mill List.
        nav: {
          DEFAULT: "#2f3d56",
          dark: "#26314a",
          hover: "#3a4a67",
          muted: "#9aa6ba",
        },
        // Burnt-orange accent for primary actions, logo, active nav.
        accent: {
          DEFAULT: "#e0663a",
          hover: "#c9572e",
          soft: "#f6e3d8",
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
