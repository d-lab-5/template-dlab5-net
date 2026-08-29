/**
 * Importing an image gives you a URL string.
 *
 * Gatsby's webpack turns `import logo from "./logo.png"` into a hashed asset
 * URL, but TypeScript knows nothing about that and fails the import outright.
 * These declarations are the missing half; without them the site does not
 * typecheck even though it builds.
 *
 * The hashing is why images live in `src/images/` and are imported, rather
 * than sitting in `static/` and being referenced by path: an imported asset
 * gets a content hash in its filename, so a changed logo cannot be served
 * from a stale cache.
 */
declare module "*.png" {
  const url: string;
  export default url;
}

declare module "*.jpg" {
  const url: string;
  export default url;
}

declare module "*.svg" {
  const url: string;
  export default url;
}

declare module "*.webp" {
  const url: string;
  export default url;
}
