-- Run in the Supabase SQL editor. User ownership is enforced by PostgreSQL RLS.
create table if not exists public.saved_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  topic text not null check (char_length(topic) between 3 and 160),
  brief jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists saved_briefs_user_created_idx
  on public.saved_briefs (user_id, created_at desc);

alter table public.saved_briefs enable row level security;

create policy "Users can read their own saved briefs"
  on public.saved_briefs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own saved briefs"
  on public.saved_briefs for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.saved_briefs to authenticated;

