/**
 * Hebrew slugify matching Sanity's implementation.
 *
 * Rules: trim → spaces to hyphens → keep Hebrew/Latin/digits/hyphens → slice(0, 96)
 */

export function slugifyHebrew(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\u0590-\u05FFa-zA-Z0-9-]/g, "")
    .slice(0, 96);
}
