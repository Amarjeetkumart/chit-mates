/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["'Poppins'", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#edf5ff",
          100: "#d6e5ff",
          200: "#adc9ff",
          300: "#85acff",
          400: "#5b8eff",
          500: "#326fff",
          600: "#2055db",
          700: "#143eb7",
          800: "#0b2b93",
          900: "#081f7a",
        },
      },
      boxShadow: {
        glow: "0 20px 45px -20px rgba(59,130,246,0.6)",
        card: "0 18px 40px -12px rgba(15,23,42,0.35)",
      },
      keyframes: {
        "card-flight": {
          "0%": {
            opacity: "0",
            transform: "translate3d(0,40px,0) scale(0.8)",
          },
          "45%": {
            opacity: "1",
            transform: "translate3d(0,-10px,0) scale(1)",
          },
          "100%": {
            opacity: "0",
            transform: "translate3d(0,-160px,0) scale(0.85)",
          },
        },
        "soft-glow": {
          "0%, 100%": {
            opacity: "0.6",
            filter: "blur(0px)",
          },
          "50%": {
            opacity: "1",
            filter: "blur(2px)",
          },
        },
        "modal-pop": {
          "0%": {
            opacity: "0",
            transform: "scale(0.9) translateY(40px)",
          },
          "60%": {
            opacity: "1",
            transform: "scale(1.02) translateY(0)",
          },
          "100%": {
            opacity: "1",
            transform: "scale(1)",
          },
        },
        "badge-pulse": {
          "0%, 100%": {
            opacity: "0.8",
            transform: "scale(1)",
          },
          "50%": {
            opacity: "1",
            transform: "scale(1.08)",
          },
        },
      },
      animation: {
        "card-flight": "card-flight 650ms ease-in-out forwards",
        "soft-glow": "soft-glow 4s ease-in-out infinite",
        "modal-pop": "modal-pop 450ms ease-out",
        "badge-pulse": "badge-pulse 3200ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
