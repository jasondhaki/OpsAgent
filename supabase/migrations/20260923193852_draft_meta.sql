-- Generation metadata for AI drafts: {tier, provider, model, promptVersion, needsHumanBecause}.
-- The gate's primary_model / no_human_request checks read it, including on resumed jobs.
alter table drafts add column meta jsonb not null default '{}'::jsonb;
