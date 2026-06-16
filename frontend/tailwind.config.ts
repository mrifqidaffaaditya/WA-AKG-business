import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-fira-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-fira-code)", "ui-monospace", "monospace"],
        heading: ["var(--font-fira-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        // ── Warm charcoal base (remaps `slate-*` app-wide) ──
        // Darker index = deeper background; lighter index = brighter text.
        slate: {
          50: "#faf7f1",
          100: "#f5efe5",
          200: "#ede8e0", // primary text (cream)
          300: "#d9d0c0",
          400: "#b5a98f", // muted text / labels
          500: "#8e8167", // faint text / timestamps
          600: "#6b5f49",
          700: "#3a342a", // borders
          750: "#322c23",
          800: "#2b261e", // input / hover surface
          850: "#232019",
          900: "#1f1b14", // raised panel
          950: "#1a1612", // app background
        },
        // `stone-*` kept as an explicit alias to the same warm ramp
        stone: {
          50: "#faf7f1",
          100: "#f5efe5",
          200: "#ede8e0",
          300: "#d9d0c0",
          400: "#b5a98f",
          500: "#8e8167",
          600: "#6b5f49",
          700: "#3a342a",
          800: "#2b261e",
          900: "#1f1b14",
          950: "#1a1612",
        },
        // ── Amber accent (remaps `emerald-*` app-wide) ──
        emerald: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24", // accent text / icons on dark
          500: "#f59e0b", // primary action surface
          600: "#d97706", // hover
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
        brand: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
      },
      animation: {
        "fadeIn": "fadeIn 0.2s ease-out",
        "scaleUp": "scaleUp 0.2s ease-out",
        "slideUp": "slideUp 0.3s ease-out",
        "slideInRight": "slideInRight 0.25s ease-out",
        "spin-slow": "spin-slow 1.5s linear infinite",
        "bubble-in": "bubbleIn 0.3s ease-out",
        "float": "float 3s ease-in-out infinite",
        "pulse-dot": "pulseDot 1.5s ease-in-out infinite",
        "slide-in-from-bottom": "slideInFromBottom 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleUp: {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideInRight: {
          "0%": { transform: "translateX(10px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        bubbleIn: {
          "0%": { transform: "translateY(8px) scale(0.96)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(0.85)" },
        },
        slideInFromBottom: {
          "0%": { transform: "translateY(16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
