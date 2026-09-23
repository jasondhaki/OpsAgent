-- §5.1 Extensions & enums. SQL is the source of truth for enums (CLAUDE.md rule 11).
create extension if not exists vector with schema extensions;
create extension if not exists citext with schema extensions;

create type channel         as enum ('email','simulator','web_chat');
create type ticket_intent   as enum ('product_question','shipping_payment','order_status',
                                     'custom_bulk_order','complaint_return','payment_issue',
                                     'other','spam');
create type ticket_status   as enum ('received','processing','needs_review','approved',
                                     'sent','rejected','closed','error');
create type urgency_level   as enum ('low','medium','high');
create type sentiment_level as enum ('positive','neutral','negative','hostile');
create type msg_direction   as enum ('inbound','outbound');
create type outbox_status   as enum ('queued','claimed','sent','failed','cancelled');
create type job_status      as enum ('queued','running','done','failed','dead');
create type member_role     as enum ('owner','reviewer','viewer');
