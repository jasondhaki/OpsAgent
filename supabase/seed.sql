-- Demo org + fictional data only. Never real customers or real business facts.
insert into orgs (slug, name, is_demo, settings) values
  ('demo', 'Demo Crafts (fictional)', true,
   '{"autosendEnabled": false, "autosendIntents": [], "signature": "— Demo Crafts"}'::jsonb)
on conflict (slug) do nothing;

-- The real tenant. Settings stay default; business facts come later via KB placeholders.
insert into orgs (slug, name, is_demo) values
  ('jhunus-crafts', 'Jhunu''s Crafts', false)
on conflict (slug) do nothing;
