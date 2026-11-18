export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B0C0E", surface: "#131418", raised: "#1A1C21",
        text: "#ECEAE4", dim: "#9C9A92", mute: "#6B6A65",
        signal: "#6EA8FE", ok: "#5BC88A", bad: "#F06A5D", warn: "#E8B04B",
      },
      fontFamily: {
        serif: ['"Instrument Serif"', "Fraunces", "serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      fontSize: { "12": "12px", "13": "13px", "14": "14px", "16": "16px", "20": "20px", "28": "28px", "44": "44px", "64": "64px" },
      borderRadius: { card: "10px" },
      borderColor: { line: "rgba(255,255,255,0.08)" },
    },
  },
  plugins: [],
};
