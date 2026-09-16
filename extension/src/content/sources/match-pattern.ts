import { escapeRegExp } from "../../text";

/**
 * Turns a Chrome match pattern into the regular expression `CaptionSource.matches` uses,
 * so a platform's URLs are declared once and the manifest and the runtime cannot drift.
 * Supports the subset the adapters need: `<scheme|*>://<host|*|*.host><path>`.
 */
export function matchPatternToRegExp(pattern: string): RegExp {
  const parts = /^(\*|https?):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/.exec(pattern);
  if (!parts) {
    throw new Error(`Unsupported match pattern: ${pattern}`);
  }

  const [, scheme = "", host = "", path = ""] = parts;
  const schemePart = scheme === "*" ? "https?" : scheme;
  const hostPart =
    host === "*"
      ? "[^/]+"
      : host.startsWith("*.")
        ? `(?:[^/]+\\.)?${escapeRegExp(host.slice(2))}`
        : escapeRegExp(host);
  const pathPart = path.split("*").map(escapeRegExp).join(".*");

  return new RegExp(`^${schemePart}://${hostPart}${pathPart}$`);
}
