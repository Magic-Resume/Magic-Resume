const path = require("node:path");

/**
 * Teach Tailwind about the commercial overlay's sources.
 *
 * `next.config.ts` swaps several `@/lib/extensions/*` slots for modules that
 * live outside this app entirely (a private checkout, located by
 * `MAGIC_RESUME_COMMERCIAL_*_ROOT`). Tailwind v4 auto-detects its sources by
 * walking the project it is compiled in, so it never reads those files, and any
 * utility they use that no open-source file also uses is never emitted.
 *
 * The failure mode is silent and misleading rather than loud. The pricing card's
 * `rounded-3xl` shell and `p-8` padding rendered only because unrelated
 * open-source components happen to use those same utilities; its `text-[44px]`
 * price never existed in the stylesheet at all, so the price silently inherited
 * body size and the card just looked cheap. Nothing errored, and the markup was
 * correct the whole time.
 *
 * Injected here rather than written into `globals.css` as `@source` because
 * these paths exist only in a commercial build, and naming that checkout inside
 * open-source CSS is precisely what `verify-oss-boundary.mjs` exists to prevent.
 * An open-source build sets neither variable and this plugin does nothing.
 */
const plugin = () => {
  const roots = [
    process.env.MAGIC_RESUME_COMMERCIAL_RUNTIME_ROOT,
    process.env.MAGIC_RESUME_COMMERCIAL_BILLING_ROOT,
  ].filter(Boolean);

  return {
    postcssPlugin: "magic-commercial-overlay-sources",
    Once(root) {
      // Only the entry that pulls Tailwind in — `@source` is meaningless in a
      // CSS module, and prepending it to every file would make Tailwind rescan
      // the overlay once per stylesheet.
      const importsTailwind = root.some(
        (node) =>
          node.type === "atrule" &&
          node.name === "import" &&
          node.params.includes("tailwindcss"),
      );
      if (!importsTailwind) return;

      for (const dir of roots) {
        // A CSS string rather than `postcss.atRule(...)`: `postcss` is hoisted
        // into this workspace but is not a declared dependency of this app, so
        // importing it fails to resolve. `prepend` parses a string just as well.
        root.prepend(`@source ${JSON.stringify(path.join(dir, "src"))};`);
      }
    },
  };
};

plugin.postcss = true;

module.exports = plugin;
