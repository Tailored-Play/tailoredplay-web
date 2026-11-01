-- =============================================================================
-- TailoredPlay — Corporate Unity WebGL Party & Networking Platform
-- Migration: 001_initial_schema.sql
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. PROFILES (extends auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_anonymous boolean not null default true,
  username text not null,
  avatar_url text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  ad_free_until timestamptz null,
  active_plan_type text null check (active_plan_type in ('party_pass_24h', 'pro_monthly', 'lifetime')),
  rewarded_ad_free_until timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

-- Automatically provision a corporate-safe profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  adjectives text[] := array['Agile', 'Synergy', 'Quantum', 'Dynamic', 'Nimble', 'Pixel', 'Cosmic', 'Turbo', 'Velvet', 'Hyper'];
  animals text[] := array['Capybara', 'Otter', 'Falcon', 'Penguin', 'Fox', 'Koala', 'Dolphin', 'Panda', 'Lynx', 'Toucan'];
  random_adj text;
  random_animal text;
  random_num int;
  generated_username text;
begin
  random_adj := adjectives[1 + floor(random() * array_length(adjectives, 1))::int];
  random_animal := animals[1 + floor(random() * array_length(animals, 1))::int];
  random_num := 10 + floor(random() * 90)::int;
  generated_username := coalesce(
    new.raw_user_meta_data->>'username',
    random_adj || random_animal || random_num::text
  );

  insert into public.profiles (id, is_anonymous, username, avatar_url, role)
  values (
    new.id,
    coalesce(new.is_anonymous, true),
    generated_username,
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=' || generated_username
    ),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. MONETIZATION_SETTINGS (Dynamic Runtime System Controls)
-- -----------------------------------------------------------------------------
create table if not exists public.monetization_settings (
  id int primary key default 1 check (id = 1),
  ads_enabled_globally boolean not null default true,
  enable_web_banners boolean not null default true,
  enable_preroll_ads boolean not null default true,
  enable_midgame_ads boolean not null default true,
  enable_rewarded_ads boolean not null default true,
  midgame_ad_cooldown_seconds int not null default 120,
  plan_party_pass_enabled boolean not null default true,
  plan_pro_monthly_enabled boolean not null default true,
  plan_lifetime_enabled boolean not null default true,
  plan_party_pass_grants_rewarded_free boolean not null default false,
  plan_pro_monthly_grants_rewarded_free boolean not null default true,
  plan_lifetime_grants_rewarded_free boolean not null default true,
  party_pass_price_usd numeric(10,2) not null default 9.99,
  party_pass_price_ars numeric(12,2) not null default 9900.00,
  pro_monthly_price_usd numeric(10,2) not null default 29.00,
  pro_monthly_price_ars numeric(12,2) not null default 29000.00,
  lifetime_price_usd numeric(10,2) not null default 149.00,
  lifetime_price_ars numeric(12,2) not null default 149000.00,
  updated_at timestamptz not null default now()
);

insert into public.monetization_settings (id)
values (1)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 3. GAMES (WebGL Game Catalog)
-- -----------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  thumbnail_url text not null default '',
  min_players int not null default 1 check (min_players >= 1),
  max_players int not null default 16 check (max_players >= min_players),
  ideal_duration_mins int not null default 15 check (ideal_duration_mins > 0),
  sync_type text not null default 'multiplayer_ngo' check (sync_type in ('multiplayer_ngo', 'synced_singleplayer')),
  r2_base_url text not null default '',
  build_file_prefix text not null default 'Build',
  ads_mode text not null default 'inherit' check (ads_mode in ('inherit', 'force_on', 'force_off')),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_games_published_filter
  on public.games(is_published, min_players, max_players, ideal_duration_mins);

-- Seed pre-compiled bundled HTML5 minigames for immediate out-of-the-box hosting
insert into public.games (id, slug, title, description, thumbnail_url, min_players, max_players, ideal_duration_mins, sync_type, r2_base_url, build_file_prefix, ads_mode, is_published)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'sands-of-time',
    'Sands of Time',
    '60-second cooperative celestial astrolabe minigame with high-precision spring needle balancing, solar flare hazards, and dual-slate kiosk telemetry.',
    'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=800&q=80',
    2,
    8,
    5,
    'synced_singleplayer',
    '/games/sands-of-time',
    'index',
    'inherit',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'housemates',
    'Housemates',
    'Tactile architectural dollhouse decorating minigame. Cooperatively satisfy secret roommate desires by painting walls and coordinating furniture vignettes.',
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
    2,
    4,
    10,
    'synced_singleplayer',
    '/games/housemates',
    'index',
    'inherit',
    true
  )
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- 4. PARTIES (Active Corporate Sessions)
-- -----------------------------------------------------------------------------
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  host_id uuid not null references public.profiles(id) on delete cascade,
  target_players int not null default 8 check (target_players >= 1),
  target_duration_mins int not null default 30 check (target_duration_mins > 0),
  status text not null default 'lobby' check (status in ('lobby', 'in_game', 'leaderboard', 'ended')),
  current_game_id uuid null references public.games(id) on delete set null,
  current_round int not null default 1,
  network_room_code text null,
  ad_free_override boolean not null default false,
  rewarded_ad_free_override boolean not null default false,
  voice_provider_type text not null default 'external_link' check (voice_provider_type in ('none', 'external_link', 'livekit', 'daily')),
  voice_room_url text null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_parties_invite_code on public.parties(invite_code);
create index if not exists idx_parties_host_id on public.parties(host_id);

-- -----------------------------------------------------------------------------
-- 5. PARTY_MEMBERS
-- -----------------------------------------------------------------------------
create table if not exists public.party_members (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('host', 'player')),
  is_connected boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

create index if not exists idx_party_members_party_id on public.party_members(party_id);

-- -----------------------------------------------------------------------------
-- 6. SCORES (Dual Leaderboard: Raw Game Score + Normalized Party Points)
-- -----------------------------------------------------------------------------
create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  round_number int not null default 1,
  score_value numeric not null default 0,
  party_points int not null default 0,
  metadata jsonb null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_scores_party_round on public.scores(party_id, round_number);
create index if not exists idx_scores_user_history on public.scores(user_id, recorded_at desc);

-- -----------------------------------------------------------------------------
-- 7. PARTY_MESSAGES (Realtime Lobby & In-Game Text Chat)
-- -----------------------------------------------------------------------------
create table if not exists public.party_messages (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_party_messages_party on public.party_messages(party_id, created_at asc);

-- -----------------------------------------------------------------------------
-- 8. ENTITLEMENT_LOGS (Host Payments & Admin Grants)
-- -----------------------------------------------------------------------------
create table if not exists public.entitlement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('mercadopago', 'lemonsqueezy', 'admin_manual')),
  plan_type text not null check (plan_type in ('party_pass_24h', 'pro_monthly', 'lifetime')),
  external_reference text not null default '',
  granted_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_entitlement_logs_user on public.entitlement_logs(user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.monetization_settings enable row level security;
alter table public.games enable row level security;
alter table public.parties enable row level security;
alter table public.party_members enable row level security;
alter table public.scores enable row level security;
alter table public.party_messages enable row level security;
alter table public.entitlement_logs enable row level security;

-- Set replica identity full so Supabase Realtime emits complete row state on updates
alter table public.parties replica identity full;
alter table public.party_members replica identity full;
alter table public.scores replica identity full;
alter table public.party_messages replica identity full;

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Profiles policies
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile with check on role"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin())
  with check (
    public.is_admin() or (
      auth.uid() = id
      and role = 'user'
      and ad_free_until is not distinct from (select p.ad_free_until from public.profiles p where p.id = auth.uid())
    )
  );

-- Monetization settings policies
create policy "Monetization settings are viewable by everyone"
  on public.monetization_settings for select using (true);

create policy "Only admins can update monetization settings"
  on public.monetization_settings for all using (public.is_admin());

-- Games policies
create policy "Published games are viewable by everyone, all games by admins"
  on public.games for select using (is_published = true or public.is_admin());

create policy "Only admins can insert/update/delete games"
  on public.games for all using (public.is_admin());

-- Parties policies
create policy "Parties are viewable by everyone with the invite code"
  on public.parties for select using (true);

create policy "Authenticated users can create parties"
  on public.parties for insert with check (auth.uid() = host_id);

create policy "Host or admin can update party"
  on public.parties for update using (auth.uid() = host_id or public.is_admin());

-- Party members policies
create policy "Party members are viewable by everyone"
  on public.party_members for select using (true);

create policy "Users can join parties or host can manage members"
  on public.party_members for insert with check (auth.uid() = user_id or public.is_admin());

create policy "Users can update their own connection status or host/admin can update"
  on public.party_members for update using (
    auth.uid() = user_id
    or exists (select 1 from public.parties p where p.id = party_id and p.host_id = auth.uid())
    or public.is_admin()
  );

-- Scores policies
create policy "Scores are viewable by everyone"
  on public.scores for select using (true);

create policy "Players can submit their own scores or host can submit party scores"
  on public.scores for insert with check (
    auth.uid() = user_id
    or exists (select 1 from public.parties p where p.id = party_id and p.host_id = auth.uid())
    or public.is_admin()
  );

-- Party messages policies
create policy "Party messages are viewable by everyone in the party"
  on public.party_messages for select using (true);

create policy "Authenticated users can post party messages"
  on public.party_messages for insert with check (auth.uid() = user_id);

-- Entitlement logs policies
create policy "Users can view their own entitlements or admins view all"
  on public.entitlement_logs for select using (auth.uid() = user_id or public.is_admin());

create policy "Only admins or service role can insert entitlement logs"
  on public.entitlement_logs for insert with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 10. REALTIME PUBLICATION
-- -----------------------------------------------------------------------------
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime for table
    public.parties,
    public.party_members,
    public.scores,
    public.party_messages,
    public.profiles,
    public.monetization_settings;
commit;
