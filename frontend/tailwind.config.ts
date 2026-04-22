import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "var(--color-bg-base)",
        card: "var(--color-bg-card)",
        sidebar: "var(--color-bg-sidebar)",
        hover: "var(--color-bg-hover)",
        overlay: "var(--color-bg-overlay)",
        brand: "var(--color-brand)",
        "brand-dark": "var(--color-brand-dark)",
        "brand-light": "var(--color-brand-light)",
        text: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          tertiary: "var(--color-text-tertiary)",
          link: "var(--color-text-link)",
          inverse: "var(--color-text-inverse)"
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)"
        },
        success: "var(--color-success)",
        warning: "var(--color-warning)",
        info: "var(--color-info)",
        review: "var(--color-review)",
        interview: "var(--color-interview)",
        premium: "var(--color-premium-gold)"
      },
      fontFamily: {
        sans: [
          "'Source Sans Pro'",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "sans-serif"
        ]
      },
      boxShadow: {
        card: "0 0 0 1px var(--color-border), 0 2px 4px rgba(0,0,0,.07)",
        dropdown: "0 4px 12px rgba(0,0,0,.15)",
        modal: "0 8px 24px rgba(0,0,0,.2)",
        navbar: "0 0 0 1px var(--color-border)"
      },
      borderRadius: {
        card: "8px",
        input: "9999px",
        pill: "24px",
        badge: "12px"
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "approve-sweep": {
          "0%": { boxShadow: "inset 0 0 0 0 rgba(5,118,66,0.25)" },
          "100%": { boxShadow: "inset 6px 0 0 0 rgba(5,118,66,0.25)" }
        },
        "reject-fade": {
          "0%": { opacity: "1", filter: "blur(0)" },
          "100%": { opacity: "0.4", filter: "blur(1px)" }
        }
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
        "approve-sweep": "approve-sweep 300ms ease-out forwards",
        "reject-fade": "reject-fade 200ms ease-out forwards"
      }
    }
  },
  plugins: []
};

export default config;
