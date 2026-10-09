/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
    theme: {
      container: {
        center: true,
        padding: "1rem",
        screens: { "2xl": "1400px" },
      },
      extend: {
        // System stacks only, as on the rental site and the Bitcube dashboard:
        // Power Mining ships no font files.
        fontFamily: {
          sans: ["var(--font-body)"],
          body: ["var(--font-body)"],
          display: ["var(--font-display)"],
          mono: ["var(--font-mono)"],
        },
        colors: {
          border: "hsl(var(--border))",
          input: "hsl(var(--input))",
          ring: "hsl(var(--ring))",
          background: "hsl(var(--background))",
          foreground: "hsl(var(--foreground))",
          primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
          secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
          destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
          muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
          accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
          popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
          card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
          success: {
            DEFAULT: "hsl(var(--success))",
            foreground: "hsl(var(--success-foreground))",
            soft: "hsl(var(--success-soft))",
          },
          warning: {
            DEFAULT: "hsl(var(--warning))",
            foreground: "hsl(var(--warning-foreground))",
            soft: "hsl(var(--warning-soft))",
            line: "hsl(var(--warning-line))",
          },
          info: { soft: "hsl(var(--info-soft))", line: "hsl(var(--info-line))" },
          segment: { DEFAULT: "hsl(var(--segment-track))", on: "hsl(var(--segment-on))" },
        },
        // Rental radius scale: cards 20, tiles 18, menus 16, inputs 14, segment 12/9.5, pills 980.
        borderRadius: {
          lg: "var(--radius)",
          md: "calc(var(--radius) - 2px)",
          sm: "calc(var(--radius) - 4px)",
          card: "20px",
          tile: "18px",
          menu: "16px",
          seg: "12px",
          "seg-inner": "9.5px",
          pill: "980px",
        },
        boxShadow: {
          card: "var(--shadow-card)",
          pill: "var(--shadow-pill)",
          menu: "var(--shadow-menu)",
          term: "var(--shadow-term)",
          focus: "var(--focus-ring)",
        },
        keyframes: {
          "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
          "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        },
        animation: {
          "accordion-down": "accordion-down 0.2s ease-out",
          "accordion-up": "accordion-up 0.2s ease-out",
        },
      },
    },
    plugins: [require("tailwindcss-animate")],
}
