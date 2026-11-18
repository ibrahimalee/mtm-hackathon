export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)", sheet: "var(--sheet)", sheet2: "var(--sheet2)", ink: "var(--ink)", ink2: "var(--ink2)", ink3: "var(--ink3)",
        accent: "var(--accent)", green: "var(--green)", amber: "var(--amber)", blue: "var(--blue)", line: "var(--line)", line2: "var(--line2)",
      },
      fontFamily: {
        serif: ['"Instrument Serif"', "Georgia", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
