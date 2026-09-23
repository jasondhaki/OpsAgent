// Keep in sync with the kb_documents_no_placeholders_when_active check constraint.
const PLACEHOLDER_RE = /\{\{[^}]*\}\}/g;

/** Unique placeholder tokens left in the text, e.g. ["{{DELIVERY_FEE_DHAKA}}"]. */
export function findPlaceholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER_RE) ?? [])];
}
