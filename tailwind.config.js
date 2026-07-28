/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "'JetBrains Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
        serif: [
          "'Source Serif 4'",
          "ui-serif",
          "Georgia",
          "Cambria",
          "'Times New Roman'",
          "Times",
          "serif",
        ],
      },
      colors: {
        // Escala neutra cálida (Monad): parchment → ash → smoke → graphite → off-black → ink
        stone: {
          50: "#f6f3f1",
          100: "#efe9e5",
          200: "#cecac8",
          300: "#b8b3b0",
          400: "#979390",
          500: "#797776",
          600: "#635f5e",
          700: "#4e4d4d",
          800: "#363535",
          900: "#242424",
          950: "#000000",
        },
        // Acento de marca (Monad Lake Blue) — reemplaza al verde usado como color primario
        emerald: {
          50: "#eef1fb",
          100: "#dfe6f9",
          200: "#c3d0f3",
          300: "#a0b5eb",
          400: "#7b96e3",
          500: "#4b74d8",
          600: "#2b59d1",
          700: "#1f45a8",
          800: "#193887",
        },
        parchment: "#f6f3f1",
        periwinkle: "#cfdaf5",
        "sky-blue": "#a0b5eb",
        mint: "#a7fccd",
        coral: "#ff9473",
        gold: "#ecda98",
        crimson: "#f37a0a",
        ink: "#000000",
      },
      borderRadius: {
        pill: "9999px",
        card: "40px",
        "2xl": "40px",
      },
    },
  },
  plugins: [],
};
