import { fileURLToPath } from "node:url";

const config = {
  // Order matters: the overlay plugin adds `@source` directives that Tailwind
  // must already see when it scans. Next requires every entry to be a module
  // specifier string, not an inline plugin object.
  //
  // Absolute, not "./postcss/…": Turbopack evaluates this config inside its own
  // PostCSS transform and requires each entry from there, so a relative path
  // resolves against the compiled chunk instead of this file. Webpack accepts
  // the absolute path just the same.
  plugins: [
    fileURLToPath(new URL("./postcss/commercial-overlay-sources.cjs", import.meta.url)),
    "@tailwindcss/postcss",
  ],
};

export default config;
