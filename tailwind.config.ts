import type { Config } from "tailwindcss"

// Tailwind styles the application chrome only (panels, toolbars, dialogs).
// Canvas content is never styled with Tailwind: canvas nodes carry explicit
// style objects so the same styling can be emitted into the exported component.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/editor/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        chrome: {
          bg: "#0e0e11",
          panel: "#17171c",
          border: "#26262e",
          text: "#e7e7ea",
          muted: "#8b8b96",
          accent: "#5b8cff",
        },
      },
    },
  },
  plugins: [],
}

export default config
