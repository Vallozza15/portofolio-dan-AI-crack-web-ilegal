-- Vallozza portfolio — gallery schema
-- Run this in the Supabase SQL editor as the project owner.
-- It creates the admin allow-list, gallery table, bucket, and RLS policies.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Admin allow-list
-- ---------------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Deliberately no RLS policies on admin_users. The security-definer function
-- below can read it, and the service role can manage it from the dashboard.
revoke all on public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users where user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gallery table
-- ---------------------------------------------------------------------------
create table if not exists public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text,
  alt_text text,
  category text not null default 'Personal'
    check (category in (
      'Personal', 'Technology', 'Campus', 'Activities',
      'Achievements', 'Projects', 'Photography'
    )),
  taken_on date,
  source_url text,
  source_label text,
  width integer not null default 1200 check (width > 0),
  height integer not null default 1500 check (height > 0),
  is_placeholder boolean not null default false,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gallery_items enable row level security;

grant select on public.gallery_items to anon, authenticated;
grant insert, update, delete on public.gallery_items to authenticated;

drop policy if exists "gallery public read" on public.gallery_items;
create policy "gallery public read"
  on public.gallery_items for select
  using (published = true or public.is_admin());

drop policy if exists "gallery admin insert" on public.gallery_items;
create policy "gallery admin insert"
  on public.gallery_items for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "gallery admin update" on public.gallery_items;
create policy "gallery admin update"
  on public.gallery_items for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "gallery admin delete" on public.gallery_items;
create policy "gallery admin delete"
  on public.gallery_items for delete
  to authenticated
  using (public.is_admin());

-- Keep updated_at accurate.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gallery_items_set_updated_at on public.gallery_items;
create trigger gallery_items_set_updated_at
  before update on public.gallery_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery',
  'gallery',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

drop policy if exists "gallery images public read" on storage.objects;
create policy "gallery images public read"
  on storage.objects for select
  using (bucket_id = 'gallery');

drop policy if exists "gallery images admin upload" on storage.objects;
create policy "gallery images admin upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gallery' and public.is_admin());

drop policy if exists "gallery images admin update" on storage.objects;
create policy "gallery images admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'gallery' and public.is_admin())
  with check (bucket_id = 'gallery' and public.is_admin());

drop policy if exists "gallery images admin delete" on storage.objects;
create policy "gallery images admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'gallery' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Create the first admin
-- ---------------------------------------------------------------------------
-- 1. Authentication → Users → Add user (use a strong password).
-- 2. Disable public sign-ups in Authentication → Providers → Email.
-- 3. Run the statement below with the real admin email:
--
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'you@example.com'
-- on conflict (user_id) do nothing;
--
-- The signed-in user must be in admin_users before any write policy passes.
