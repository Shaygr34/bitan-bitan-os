/**
 * Load markdown prompt templates and interpolate {variable} placeholders.
 */

import { readFileSync } from "fs";
import { join } from "path";

const PROMPTS_DIR = join(process.cwd(), "prompts");

/**
 * Load a prompt template from the prompts/ directory and interpolate variables.
 */
export function loadPrompt(
  filename: string,
  variables: Record<string, string> = {},
): string {
  const filepath = join(PROMPTS_DIR, filename);
  let content = readFileSync(filepath, "utf-8");

  for (const [key, value] of Object.entries(variables)) {
    content = content.replaceAll(`{${key}}`, value);
  }

  return content;
}
