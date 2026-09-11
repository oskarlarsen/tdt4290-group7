import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#F4FBF8", 100: "#E6F5EE", 200: "#C8E9DB", 300: "#A0D9C1",
          400: "#6EC4A0", 500: "#43A77D", 600: "#327C5C", 700: "#265F47",
          800: "#1A4131", 900: "#1B4332", 950: "#0A1913",
        },
        secondary: {
          50: "#F4FAF8", 100: "#E6F4EE", 200: "#C9E8DB", 300: "#A2D7C0",
          400: "#70C29E", 500: "#46A57B", 600: "#347A5B", 700: "#2D6A4F",
          800: "#1B4030", 900: "#122B20", 950: "#0B1913",
        },
        tertiary: {
          50: "#F4FBF8", 100: "#E6F5EE", 200: "#C9E9DA", 300: "#A1D8BF",
          400: "#6FC39C", 500: "#52B788", 600: "#337A59", 700: "#275E44",
          800: "#1B412F", 900: "#122B1F", 950: "#0A1912",
        },
        neutral: {
          50: "#F5F7FA", 100: "#E7ECF3", 200: "#CCD6E5", 300: "#A7B7D2",
          400: "#7891BA", 500: "#4F6C9C", 600: "#3A5073", 700: "#2D3D58",
          800: "#1E293B", 900: "#151C29", 950: "#0C1018",
        },
      },
      fontFamily: {
        headline: ["Geist", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;