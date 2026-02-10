import { strings } from "./he";

export function t(key: string): string {
  const value = strings[key];
  if (!value) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[strings] Missing key: ${key}`);
    }
    return `[${key}]`;
  }
  return value;
}

export function tWith(key: string, vars: Record<string, string | number>): string {
  let value = t(key);
  for (const [k, v] of Object.entries(vars)) {
    value = value.replace(`{${k}}`, String(v));
  }
  return value;
}

export { strings } from "./he";
export { KEYS } from "./keys";
