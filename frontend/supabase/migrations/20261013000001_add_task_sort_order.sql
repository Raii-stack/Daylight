alter table public.tasks
  add column if not exists sort_order bigint;

create index if not exists tasks_user_id_sort_order_idx
  on public.tasks (user_id, sort_order);
