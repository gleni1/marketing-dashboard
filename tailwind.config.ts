import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core palette from CLAUDE.md
        ground: "#F4F2EE",
        ink: "#1A1D21",
        accent: "#C2410C",
        // On-target (blue)
        "on-target": "#1D4E89",
        "on-target-bg": "#E3ECF7",
        // Below-target (orange)
        "below-target": "#9A3412",
        "below-target-bg": "#FDEBDD",
        // UI colors
        muted: "#5A5F66",
        border: "#E2DFD8",
        "border-dark": "#CFCAC0",
        "header-text": "#DADCDF",
        "header-subtle": "#B9BCC1",
      },
      fontFamily: {
        archivo: ["Archivo", "sans-serif"],
        "public-sans": ["Public Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
