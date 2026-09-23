# KB seed templates

Templates for Jhunu's Crafts. Each file becomes one `kb_documents` row (frontmatter: `title`,
`kind`, `language`).

**Rules**
- Every business fact is a `{{PLACEHOLDER}}`. Jason/Dad replace them with real values.
  Nobody (human or AI) fills them with guesses.
- A document **cannot be activated** while any `{{…}}` remains: the database rejects it
  (`kb_documents_no_placeholders_when_active`). `pnpm kb load` imports such files as inactive
  and lists the missing placeholders.
- If a question doesn't apply (e.g. no bKash), delete that section. Don't write "N/A".
- "Also asked as" lines help retrieval in Bangla/Banglish. Add real phrasings customers use.

`demo/` holds the **fictional** demo-org KB used by the public demo and evals. Its values are
made up on purpose and must never be copied into the real templates.

Load: `pnpm kb load jhunus-crafts kb-seed` (see `scripts/kb.ts`).
