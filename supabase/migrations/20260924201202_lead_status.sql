-- Simple sales pipeline for custom/bulk inquiries (/leads). Null = new (not yet touched).
alter table tickets
  add column lead_status text check (lead_status in ('new', 'contacted', 'won', 'lost'));
