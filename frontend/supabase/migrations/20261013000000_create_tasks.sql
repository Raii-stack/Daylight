create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  priority text not null check (priority in ('Low', 'Medium', 'High')),
  deadline timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_id_deadline_idx
  on public.tasks (user_id, deadline);

alter table public.tasks enable row level security;

create policy "Users can read their own tasks"
  on public.tasks for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own tasks"
  on public.tasks for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own tasks"
  on public.tasks for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own tasks"
  on public.tasks for delete
  to authenticated
  using ((select auth.uid()) = user_id);
