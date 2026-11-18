/** @type {import('tailwindcss').Config} */
// 60 / 30 / 10 colour system. Keep these three families in sync with the :root variables in src/styles/index.css.
//   60%  milk   dominant surfaces: page, sheet, modal body, cards, light basemap
//   30%  brand  #F76806: primary actions, header bands, active/selected states
//   10%  ink    #101820: text, outlines, map controls, tooltips
// Contrast rules (measured): ink on milk 16.6:1, ink on brand 5.9:1. White/milk TEXT on brand is only 2.8-3.0:1 and
// brand TEXT on milk is 2.8:1, so: text on brand is always ink, and brand is never used for text on milk.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        milk: { DEFAULT: "#FAF6EC", 2: "#F1EBDD", line: "#DDD4BF" },
        brand: { DEFAULT: "#F76806", press: "#D95A00" },
        ink: { DEFAULT: "#101820", muted: "#5B5F66" }
      }
    }
  },
  plugins: []
};
