const config = {
  // Order matters: the overlay plugin adds `@source` directives that Tailwind
  // must already see when it scans. Next requires every entry to be a module
  // specifier string, not an inline plugin object.
  plugins: ["./postcss/commercial-overlay-sources.cjs", "@tailwindcss/postcss"],
};

export default config;
