-- A KB document cannot be active while it still contains {{PLACEHOLDER}} tokens (CLAUDE.md rule 1).
-- Keep the pattern in sync with PLACEHOLDER_RE in src/lib/placeholders.ts.
alter table kb_documents
  add constraint kb_documents_no_placeholders_when_active
  check (not is_active or content !~ '\{\{[^}]*\}\}');
