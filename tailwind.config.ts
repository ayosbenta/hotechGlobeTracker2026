import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 12px 28px rgb(12 54 117 / 8%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
