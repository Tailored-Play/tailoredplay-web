"use client";

import {
  EntitlementLog,
  Game,
  MonetizationSettings,
  Party,
  PartyMember,
  PartyMessage,
  PlanType,
  Profile,
  ScoreEntry,
} from "@/types/database";
import {
  calculateNormalizedPartyPoints,
  generateAvatarUrl,
  generateCorporateUsername,
  generateInviteCode,
} from "@/lib/identity";
import {
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

export const STORAGE_KEYS = {
  CURRENT_USER_ID: "tp_current_user_id_v1",
  PROFILES: "tp_profiles_v1",
  GAMES: "tp_games_v1",
  PARTIES: "tp_parties_v1",
  PARTY_MEMBERS: "tp_party_members_v1",
  SCORES: "tp_scores_v1",
  MESSAGES: "tp_messages_v1",
  ENTITLEMENTS: "tp_entitlements_v1",
  MONETIZATION: "tp_monetization_v1",
};

const BROADCAST_CHANNEL_NAME = "tailoredplay_realtime_sync_v1";

export const DEFAULT_MONETIZATION_SETTINGS: MonetizationSettings = {
  id: 1,
  ads_enabled_globally: true,
  enable_web_banners: true,
  enable_preroll_ads: true,
  enable_midgame_ads: true,
  enable_rewarded_ads: true,
  midgame_ad_cooldown_seconds: 120,
  plan_party_pass_enabled: true,
  plan_pro_monthly_enabled: true,
  plan_lifetime_enabled: true,
  plan_party_pass_grants_rewarded_free: false,
  plan_pro_monthly_grants_rewarded_free: true,
  plan_lifetime_grants_rewarded_free: true,
  party_pass_price_usd: 9.99,
  party_pass_price_ars: 9900,
  pro_monthly_price_usd: 29.0,
  pro_monthly_price_ars: 29000,
  lifetime_price_usd: 149.0,
  lifetime_price_ars: 149000,
  updated_at: new Date().toISOString(),
};

export const SEED_GAMES: Game[] = [
  {
    id: "tailoredcore-sands-of-time",
    slug: "sands-of-time",
    title: "Sands of Time",
    description:
      "60-second cooperative celestial astrolabe minigame with high-precision spring needle balancing, solar flare hazards, and dual-slate kiosk telemetry.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=800&q=80",
    min_players: 2,
    max_players: 8,
    ideal_duration_mins: 5,
    sync_type: "synced_singleplayer",
    r2_base_url: "/games/sands-of-time",
    build_file_prefix: "index",
    ads_mode: "inherit",
    is_published: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "tailoredcore-housemates",
    slug: "housemates",
    title: "Housemates",
    description:
      "Tactile architectural dollhouse decorating minigame. Cooperatively satisfy secret roommate desires by painting walls and coordinating furniture vignettes.",
    thumbnail_url:
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80",
    min_players: 2,
    max_players: 4,
    ideal_duration_mins: 10,
    sync_type: "synced_singleplayer",
    r2_base_url: "/games/housemates",
    build_file_prefix: "index",
    ads_mode: "inherit",
    is_published: true,
    created_at: new Date().toISOString(),
  },
];

/**
 * Returns true if running in Debug Mode:
 * - Environment variable NEXT_PUBLIC_APP_MODE === 'debug'
 * - Dev server listening on Port 3001
 * - URL contains ?debug=true or ?debug=1
 */
export function isPlatformDebugMode(): boolean {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_APP_MODE === "debug";
  }
  return (
    process.env.NEXT_PUBLIC_APP_MODE === "debug" ||
    window.location.port === "3001" ||
    window.location.search.includes("debug=true") ||
    window.location.search.includes("debug=1")
  );
}

// =============================================================================
// Local Storage + BroadcastChannel Helpers (Multi-Tab Local Sync)
// =============================================================================

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    notifyBroadcast({ type: "STORE_UPDATED", key });
  } catch (e) {
    console.warn("[PlatformStore] Failed writing local storage:", e);
  }
}

export interface BroadcastEventPacket {
  type:
    | "STORE_UPDATED"
    | "UNITY_CUSTOM_EVENT"
    | "RELAY_CODE_PUBLISHED"
    | "PARTY_STATE_CHANGED"
    | "PARTY_AD_BREAK_TRIGGERED"
    | "PARTY_AD_STATUS_UPDATED";
  key?: string;
  partyId?: string;
  payload?: unknown;
}

let broadcastChannel: BroadcastChannel | null = null;
const listeners = new Set<(packet: BroadcastEventPacket) => void>();

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return null;
  }
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const packet = event.data as BroadcastEventPacket;
      listeners.forEach((cb) => cb(packet));
    };
  }
  return broadcastChannel;
}

export function notifyBroadcast(packet: BroadcastEventPacket) {
  const ch = getBroadcastChannel();
  ch?.postMessage(packet);
  listeners.forEach((cb) => cb(packet));
}

export function subscribeToPlatformEvents(
  callback: (packet: BroadcastEventPacket) => void
): () => void {
  getBroadcastChannel();
  listeners.add(callback);

  const storageHandler = (e: StorageEvent) => {
    if (e.key && e.key.startsWith("tp_")) {
      callback({ type: "STORE_UPDATED", key: e.key });
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", storageHandler);
  }

  return () => {
    listeners.delete(callback);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", storageHandler);
    }
  };
}

/**
 * Subscribes to real-time events for a specific party room across distinct devices.
 * Uses Supabase Realtime channels (postgres_changes + broadcast) when Supabase is configured,
 * and falls back to multi-tab BroadcastChannel / localStorage events.
 */
export function subscribeToPartyRealtime(
  partyId: string,
  callback: (packet: BroadcastEventPacket) => void
): () => void {
  const unsubPlatform = subscribeToPlatformEvents((packet) => {
    if (!packet.partyId || packet.partyId === partyId) {
      callback(packet);
    }
  });

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return unsubPlatform;
  }

  const channel = supabase
    .channel(`party_room_${partyId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "parties",
        filter: `id=eq.${partyId}`,
      },
      (payload) => {
        callback({
          type: "PARTY_STATE_CHANGED",
          partyId,
          payload: payload.new,
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "party_members",
        filter: `party_id=eq.${partyId}`,
      },
      (payload) => {
        callback({
          type: "PARTY_STATE_CHANGED",
          partyId,
          payload,
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "scores",
        filter: `party_id=eq.${partyId}`,
      },
      (payload) => {
        callback({
          type: "STORE_UPDATED",
          key: STORAGE_KEYS.SCORES,
          partyId,
          payload: payload.new,
        });
      }
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "party_messages",
        filter: `party_id=eq.${partyId}`,
      },
      (payload) => {
        callback({
          type: "STORE_UPDATED",
          key: STORAGE_KEYS.MESSAGES,
          partyId,
          payload: payload.new,
        });
      }
    )
    .on("broadcast", { event: "party_signal" }, (event) => {
      if (event.payload) {
        callback(event.payload as BroadcastEventPacket);
      }
    })
    .subscribe();

  return () => {
    unsubPlatform();
    supabase.removeChannel(channel);
  };
}

/**
 * Broadcasts an ephemeral or high-priority party action across all connected devices in the room.
 */
export async function broadcastPartySignal(
  partyId: string,
  packet: BroadcastEventPacket
): Promise<void> {
  const fullPacket: BroadcastEventPacket = { ...packet, partyId };
  notifyBroadcast(fullPacket);

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    try {
      const channel = supabase.channel(`party_room_${partyId}`);
      await channel.send({
        type: "broadcast",
        event: "party_signal",
        payload: fullPacket,
      });
    } catch (e) {
      console.warn("[PlatformStore] Supabase realtime broadcast error:", e);
    }
  }
}

let localSeedInitialized = false;

// Ensure initial seed data exists in local store
function ensureLocalSeed() {
  if (typeof window === "undefined" || localSeedInitialized) return;
  localSeedInitialized = true;

  const rawExisting = window.localStorage.getItem(STORAGE_KEYS.GAMES);
  if (!rawExisting) {
    window.localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(SEED_GAMES));
  } else {
    try {
      const existingGames = JSON.parse(rawExisting) as Game[];
      const filtered = existingGames.filter(
        (g) =>
          g.slug !== "sandbox-brawl" &&
          g.id !== "tailoredcore-sandbox-brawl" &&
          !g.id.startsWith("game-uuid-")
      );
      // Ensure all current SEED_GAMES are present and up to date
      for (const seed of SEED_GAMES) {
        const idx = filtered.findIndex((g) => g.slug === seed.slug || g.id === seed.id);
        if (idx === -1) {
          filtered.push(seed);
        } else {
          filtered[idx] = { ...filtered[idx], ...seed };
        }
      }
      const updatedJson = JSON.stringify(filtered);
      if (updatedJson !== rawExisting) {
        window.localStorage.setItem(STORAGE_KEYS.GAMES, updatedJson);
      }
    } catch {
      window.localStorage.setItem(STORAGE_KEYS.GAMES, JSON.stringify(SEED_GAMES));
    }
  }

  const rawMonetization = window.localStorage.getItem(STORAGE_KEYS.MONETIZATION);
  if (!rawMonetization) {
    window.localStorage.setItem(
      STORAGE_KEYS.MONETIZATION,
      JSON.stringify(DEFAULT_MONETIZATION_SETTINGS)
    );
  }
}

// =============================================================================
// 1. AUTH & PROFILE API
// =============================================================================

export async function ensureAnonymousOrCurrentProfile(): Promise<Profile> {
  ensureLocalSeed();
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    let userId = session?.user?.id;
    let isAnon = session?.user?.is_anonymous ?? true;
    let email = session?.user?.email ?? null;

    if (!userId) {
      const { data: anonData, error: anonError } =
        await supabase.auth.signInAnonymously();
      if (!anonError && anonData.user) {
        userId = anonData.user.id;
        isAnon = anonData.user.is_anonymous ?? true;
        email = anonData.user.email ?? null;
      }
    }

    if (userId) {
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (existingProfile) {
        return { ...existingProfile, email } as Profile;
      }

      const username = generateCorporateUsername();
      const newProfile: Profile = {
        id: userId,
        is_anonymous: isAnon,
        username,
        avatar_url: generateAvatarUrl(username),
        role: "user",
        ad_free_until: null,
        email,
        created_at: new Date().toISOString(),
      };

      await supabase.from("profiles").upsert(newProfile);
      return newProfile;
    }
  }

  // Local / Demo session (stored per tab via sessionStorage so opening 2 tabs creates Host + Guest!)
  let sessionUserId =
    typeof window !== "undefined"
      ? window.sessionStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID)
      : null;

  const profiles = readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);

  if (sessionUserId) {
    const found = profiles.find((p) => p.id === sessionUserId);
    if (found) return found;
  }

  const newId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `guest-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const username = generateCorporateUsername();
  const isFirstUser = profiles.length === 0;

  const created: Profile = {
    id: newId,
    is_anonymous: true,
    username,
    avatar_url: generateAvatarUrl(username),
    // Make first local user admin by default so /admin works out-of-the-box, plus a quick toggle in Navbar
    role: isFirstUser ? "admin" : "user",
    ad_free_until: null,
    email: null,
    created_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, newId);
  }
  writeLocal(STORAGE_KEYS.PROFILES, [...profiles, created]);
  return created;
}

export async function updateProfileIdentity(
  userId: string,
  updates: Partial<Pick<Profile, "username" | "avatar_url" | "role" | "ad_free_until" | "active_plan_type" | "rewarded_ad_free_until">>
): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("*")
      .single();
    if (!error && data) return data as Profile;
  }

  const profiles = readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  let updatedProfile: Profile | null = null;
  const next = profiles.map((p) => {
    if (p.id === userId) {
      updatedProfile = { ...p, ...updates };
      return updatedProfile;
    }
    return p;
  });
  writeLocal(STORAGE_KEYS.PROFILES, next);
  return updatedProfile;
}

export async function upgradeAnonymousAccount(params: {
  userId: string;
  email: string;
  password?: string;
  username?: string;
}): Promise<{ profile: Profile | null; error?: string }> {
  const { userId, email, password, username } = params;
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    const { error: authError } = await supabase.auth.updateUser({
      email,
      ...(password ? { password } : {}),
    });
    if (authError) {
      return { profile: null, error: authError.message };
    }

    const updatePayload: Record<string, unknown> = {
      is_anonymous: false,
    };
    if (username) {
      updatePayload.username = username;
      updatePayload.avatar_url = generateAvatarUrl(username);
    }

    const { data } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId)
      .select("*")
      .single();

    return { profile: (data as Profile) || null };
  }

  // Local mode upgrade preserves UUID and all party/score history
  const profiles = readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  let updated: Profile | null = null;
  const next = profiles.map((p) => {
    if (p.id === userId) {
      const nextUsername = username?.trim() || p.username;
      updated = {
        ...p,
        is_anonymous: false,
        email,
        username: nextUsername,
        avatar_url: generateAvatarUrl(nextUsername),
      };
      return updated;
    }
    return p;
  });
  writeLocal(STORAGE_KEYS.PROFILES, next);
  return { profile: updated };
}

export async function getAllProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (data && data.length > 0) return data as Profile[];
  }
  return readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
}

export async function getProfileById(userId: string): Promise<Profile | null> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (data) return data as Profile;
  }
  const profiles = readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  return profiles.find((p) => p.id === userId) || null;
}

// =============================================================================
// 2. MONETIZATION SETTINGS & ENTITLEMENTS API
// =============================================================================

export async function getMonetizationSettings(): Promise<MonetizationSettings> {
  ensureLocalSeed();
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("monetization_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (data) return data as MonetizationSettings;
  }
  return readLocal<MonetizationSettings>(
    STORAGE_KEYS.MONETIZATION,
    DEFAULT_MONETIZATION_SETTINGS
  );
}

export async function updateMonetizationSettings(
  updates: Partial<MonetizationSettings>
): Promise<MonetizationSettings> {
  const current = await getMonetizationSettings();
  const merged: MonetizationSettings = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from("monetization_settings").upsert(merged);
  }
  writeLocal(STORAGE_KEYS.MONETIZATION, merged);
  return merged;
}

export async function grantHostEntitlement(params: {
  userId: string;
  planType: PlanType;
  provider?: "mercadopago" | "lemonsqueezy" | "admin_manual";
  externalReference?: string;
}): Promise<Profile | null> {
  const {
    userId,
    planType,
    provider = "admin_manual",
    externalReference = `grant_${Date.now()}`,
  } = params;

  const now = Date.now();
  let durationMs = 24 * 60 * 60 * 1000; // 24h default
  if (planType === "pro_monthly") {
    durationMs = 30 * 24 * 60 * 60 * 1000;
  } else if (planType === "lifetime") {
    durationMs = 100 * 365 * 24 * 60 * 60 * 1000; // 100 years
  }

  const grantedUntil = new Date(now + durationMs).toISOString();

  const monetization = await getMonetizationSettings();
  let grantsRewardedFree = false;
  if (planType === "party_pass_24h" && monetization.plan_party_pass_grants_rewarded_free) grantsRewardedFree = true;
  if (planType === "pro_monthly" && monetization.plan_pro_monthly_grants_rewarded_free) grantsRewardedFree = true;
  if (planType === "lifetime" && monetization.plan_lifetime_grants_rewarded_free) grantsRewardedFree = true;

  const rewardedUntil = grantsRewardedFree ? grantedUntil : null;

  const logEntry: EntitlementLog = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `ent-${Date.now()}`,
    user_id: userId,
    provider,
    plan_type: planType,
    external_reference: externalReference,
    granted_until: grantedUntil,
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from("entitlement_logs").insert(logEntry);
  }

  const existingLogs = readLocal<EntitlementLog[]>(
    STORAGE_KEYS.ENTITLEMENTS,
    []
  );
  writeLocal(STORAGE_KEYS.ENTITLEMENTS, [logEntry, ...existingLogs]);

  return updateProfileIdentity(userId, {
    ad_free_until: grantedUntil,
    active_plan_type: planType,
    rewarded_ad_free_until: rewardedUntil,
  });
}

export async function revokeHostEntitlement(
  userId: string
): Promise<Profile | null> {
  return updateProfileIdentity(userId, {
    ad_free_until: null,
    active_plan_type: null,
    rewarded_ad_free_until: null,
  });
}

export async function getEntitlementLogs(): Promise<EntitlementLog[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("entitlement_logs")
      .select("*")
      .order("created_at", { ascending: false });
    if (data && data.length > 0) return data as EntitlementLog[];
  }
  return readLocal<EntitlementLog[]>(STORAGE_KEYS.ENTITLEMENTS, []);
}

// =============================================================================
// 3. GAMES CATALOG API
// =============================================================================

export async function getGames(includeUnpublished = false): Promise<Game[]> {
  ensureLocalSeed();
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    let query = supabase
      .from("games")
      .select("*")
      .order("created_at", { ascending: false });
    if (!includeUnpublished) {
      query = query.eq("is_published", true);
    }
    const { data } = await query;
    if (data && data.length > 0) return data as Game[];
  }

  const games = readLocal<Game[]>(STORAGE_KEYS.GAMES, SEED_GAMES);
  return includeUnpublished ? games : games.filter((g) => g.is_published);
}

export async function upsertGame(
  gameInput: Partial<Game> & { title: string; slug: string }
): Promise<Game> {
  const games = readLocal<Game[]>(STORAGE_KEYS.GAMES, SEED_GAMES);
  const existing = games.find(
    (g) => g.id === gameInput.id || g.slug === gameInput.slug
  );

  const record: Game = {
    id:
      existing?.id ||
      gameInput.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `game-${Date.now()}`),
    slug: gameInput.slug,
    title: gameInput.title,
    description: gameInput.description ?? existing?.description ?? "",
    thumbnail_url:
      gameInput.thumbnail_url ||
      existing?.thumbnail_url ||
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=800&q=80",
    min_players: Number(gameInput.min_players ?? existing?.min_players ?? 1),
    max_players: Number(gameInput.max_players ?? existing?.max_players ?? 16),
    ideal_duration_mins: Number(
      gameInput.ideal_duration_mins ?? existing?.ideal_duration_mins ?? 15
    ),
    sync_type:
      gameInput.sync_type ?? existing?.sync_type ?? "synced_singleplayer",
    r2_base_url:
      gameInput.r2_base_url ??
      existing?.r2_base_url ??
      `/builds/${gameInput.slug}`,
    build_file_prefix:
      gameInput.build_file_prefix ?? existing?.build_file_prefix ?? "Build",
    ads_mode: gameInput.ads_mode ?? existing?.ads_mode ?? "inherit",
    is_published: gameInput.is_published ?? existing?.is_published ?? true,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from("games").upsert(record);
  }

  const next = existing
    ? games.map((g) => (g.id === record.id ? record : g))
    : [record, ...games];
  writeLocal(STORAGE_KEYS.GAMES, next);
  return record;
}

export async function deleteGame(gameId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from("games").delete().eq("id", gameId);
  }
  const games = readLocal<Game[]>(STORAGE_KEYS.GAMES, SEED_GAMES);
  writeLocal(
    STORAGE_KEYS.GAMES,
    games.filter((g) => g.id !== gameId)
  );
}

// =============================================================================
// 4. PARTIES, ROSTER & REALTIME SYNC API
// =============================================================================

export async function createParty(params: {
  hostProfile: Profile;
  targetPlayers: number;
  targetDurationMins: number;
  voiceProviderType?: Party["voice_provider_type"];
  voiceRoomUrl?: string;
}): Promise<Party> {
  const inviteCode = generateInviteCode(6);
  const newParty: Party = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `party-${Date.now()}`,
    invite_code: inviteCode,
    host_id: params.hostProfile.id,
    target_players: params.targetPlayers,
    target_duration_mins: params.targetDurationMins,
    status: "lobby",
    current_game_id: null,
    current_round: 1,
    network_room_code: null,
    ad_free_override: false,
    voice_provider_type: params.voiceProviderType || "external_link",
    voice_room_url: params.voiceRoomUrl || null,
    created_at: new Date().toISOString(),
  };

  const hostMember: PartyMember = {
    party_id: newParty.id,
    user_id: params.hostProfile.id,
    role: "host",
    is_connected: true,
    joined_at: new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data: insertedParty } = await supabase
      .from("parties")
      .insert(newParty)
      .select("*")
      .single();
    if (insertedParty) {
      await supabase.from("party_members").upsert({
        party_id: insertedParty.id,
        user_id: params.hostProfile.id,
        role: "host",
        is_connected: true,
      });
      return insertedParty as Party;
    }
  }

  const parties = readLocal<Party[]>(STORAGE_KEYS.PARTIES, []);
  writeLocal(STORAGE_KEYS.PARTIES, [newParty, ...parties]);

  const members = readLocal<PartyMember[]>(STORAGE_KEYS.PARTY_MEMBERS, []);
  writeLocal(STORAGE_KEYS.PARTY_MEMBERS, [...members, hostMember]);

  return newParty;
}

export async function getPartyByInviteCode(
  inviteCode: string
): Promise<Party | null> {
  const normalized = inviteCode.trim().toUpperCase();
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("parties")
      .select("*")
      .eq("invite_code", normalized)
      .maybeSingle();
    if (data) return data as Party;
  }

  const parties = readLocal<Party[]>(STORAGE_KEYS.PARTIES, []);
  return (
    parties.find((p) => p.invite_code.toUpperCase() === normalized) || null
  );
}

export async function getAllParties(): Promise<Party[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("parties")
      .select("*")
      .order("created_at", { ascending: false });
    if (data && data.length > 0) return data as Party[];
  }
  return readLocal<Party[]>(STORAGE_KEYS.PARTIES, []);
}

export async function joinPartyAsMember(
  party: Party,
  profile: Profile
): Promise<PartyMember[]> {
  const role = party.host_id === profile.id ? "host" : "player";
  const supabase = getSupabaseBrowserClient();

  if (supabase) {
    await supabase.from("party_members").upsert({
      party_id: party.id,
      user_id: profile.id,
      role,
      is_connected: true,
    });
  }

  const members = readLocal<PartyMember[]>(STORAGE_KEYS.PARTY_MEMBERS, []);
  const exists = members.find(
    (m) => m.party_id === party.id && m.user_id === profile.id
  );

  let nextMembers: PartyMember[];
  if (exists) {
    nextMembers = members.map((m) =>
      m.party_id === party.id && m.user_id === profile.id
        ? { ...m, is_connected: true, role }
        : m
    );
  } else {
    nextMembers = [
      ...members,
      {
        party_id: party.id,
        user_id: profile.id,
        role,
        is_connected: true,
        joined_at: new Date().toISOString(),
      },
    ];
  }
  writeLocal(STORAGE_KEYS.PARTY_MEMBERS, nextMembers);
  return getPartyMembersWithProfiles(party.id);
}

export async function getPartyMembersWithProfiles(
  partyId: string
): Promise<PartyMember[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("party_members")
      .select("*, profile:profiles(*)")
      .eq("party_id", partyId)
      .order("joined_at", { ascending: true });
    if (data && data.length > 0) return data as PartyMember[];
  }

  const members = readLocal<PartyMember[]>(STORAGE_KEYS.PARTY_MEMBERS, []);
  const profiles = readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  return members
    .filter((m) => m.party_id === partyId)
    .map((m) => ({
      ...m,
      profile: profiles.find((p) => p.id === m.user_id),
    }));
}

export async function updatePartyState(
  partyId: string,
  updates: Partial<Party>
): Promise<Party | null> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("parties")
      .update(updates)
      .eq("id", partyId)
      .select("*")
      .single();
    if (data) {
      notifyBroadcast({
        type: "PARTY_STATE_CHANGED",
        partyId,
        payload: data,
      });
      return data as Party;
    }
  }

  const parties = readLocal<Party[]>(STORAGE_KEYS.PARTIES, []);
  let updated: Party | null = null;
  const next = parties.map((p) => {
    if (p.id === partyId) {
      updated = { ...p, ...updates };
      return updated;
    }
    return p;
  });
  writeLocal(STORAGE_KEYS.PARTIES, next);

  if (updates.network_room_code) {
    notifyBroadcast({
      type: "RELAY_CODE_PUBLISHED",
      partyId,
      payload: { joinCode: updates.network_room_code },
    });
  }

  return updated;
}

// =============================================================================
// 5. SCORES & DUAL LEADERBOARD API
// =============================================================================

export async function submitPlayerScore(params: {
  partyId: string;
  gameId: string;
  userId: string;
  roundNumber: number;
  scoreValue: number;
  metadata?: Record<string, unknown>;
}): Promise<ScoreEntry> {
  const allScores = readLocal<ScoreEntry[]>(STORAGE_KEYS.SCORES, []);

  // Upsert score for this (partyId, gameId, roundNumber, userId) and recompute normalized party points
  const existingIdx = allScores.findIndex(
    (s) =>
      s.party_id === params.partyId &&
      s.game_id === params.gameId &&
      s.round_number === params.roundNumber &&
      s.user_id === params.userId
  );

  const entry: ScoreEntry = {
    id:
      existingIdx >= 0
        ? allScores[existingIdx].id
        : typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `score-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    party_id: params.partyId,
    game_id: params.gameId,
    user_id: params.userId,
    round_number: params.roundNumber,
    score_value: params.scoreValue,
    party_points: 100,
    metadata: params.metadata || {},
    recorded_at: new Date().toISOString(),
  };

  const nextScores =
    existingIdx >= 0
      ? allScores.map((s, i) => (i === existingIdx ? entry : s))
      : [...allScores, entry];

  // Re-rank all scores in the same (partyId, roundNumber) descending to assign normalized Party Points
  const roundScores = nextScores
    .filter(
      (s) =>
        s.party_id === params.partyId && s.round_number === params.roundNumber
    )
    .sort((a, b) => b.score_value - a.score_value);

  const rankMap = new Map<string, number>();
  roundScores.forEach((s, index) => {
    rankMap.set(s.id, calculateNormalizedPartyPoints(index));
  });

  const normalizedScores = nextScores.map((s) =>
    rankMap.has(s.id) ? { ...s, party_points: rankMap.get(s.id)! } : s
  );

  writeLocal(STORAGE_KEYS.SCORES, normalizedScores);

  const finalEntry =
    normalizedScores.find((s) => s.id === entry.id) || entry;

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from("scores").insert(finalEntry);
  }

  return finalEntry;
}

export async function getPartyScores(partyId: string): Promise<ScoreEntry[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("scores")
      .select("*, profile:profiles(*), game:games(*)")
      .eq("party_id", partyId)
      .order("score_value", { ascending: false });
    if (data && data.length > 0) {
      return data.map((entry, idx) => ({
        ...entry,
        party_points: calculateNormalizedPartyPoints(idx),
      })) as ScoreEntry[];
    }
  }

  const scores = readLocal<ScoreEntry[]>(STORAGE_KEYS.SCORES, []);
  const profiles = readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  const games = readLocal<Game[]>(STORAGE_KEYS.GAMES, SEED_GAMES);

  return scores
    .filter((s) => s.party_id === partyId)
    .map((s) => ({
      ...s,
      profile: profiles.find((p) => p.id === s.user_id),
      game: games.find((g) => g.id === s.game_id),
    }))
    .sort((a, b) => b.score_value - a.score_value);
}

export async function getUserScoreHistory(
  userId: string
): Promise<ScoreEntry[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("scores")
      .select("*, game:games(*)")
      .eq("user_id", userId)
      .order("recorded_at", { ascending: false });
    if (data && data.length > 0) return data as ScoreEntry[];
  }

  const scores = readLocal<ScoreEntry[]>(STORAGE_KEYS.SCORES, []);
  const games = readLocal<Game[]>(STORAGE_KEYS.GAMES, SEED_GAMES);

  return scores
    .filter((s) => s.user_id === userId)
    .map((s) => ({
      ...s,
      game: games.find((g) => g.id === s.game_id),
    }))
    .sort(
      (a, b) =>
        new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
    );
}

// =============================================================================
// 6. PARTY TEXT CHAT API
// =============================================================================

export async function getPartyMessages(
  partyId: string
): Promise<PartyMessage[]> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase
      .from("party_messages")
      .select("*, profile:profiles(*)")
      .eq("party_id", partyId)
      .order("created_at", { ascending: true });
    if (data && data.length > 0) return data as PartyMessage[];
  }

  const messages = readLocal<PartyMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const profiles = readLocal<Profile[]>(STORAGE_KEYS.PROFILES, []);
  return messages
    .filter((m) => m.party_id === partyId)
    .map((m) => ({
      ...m,
      profile: profiles.find((p) => p.id === m.user_id),
    }));
}

export async function sendPartyMessage(params: {
  partyId: string;
  userId: string;
  content: string;
}): Promise<PartyMessage> {
  const msg: PartyMessage = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `msg-${Date.now()}`,
    party_id: params.partyId,
    user_id: params.userId,
    content: params.content.trim(),
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.from("party_messages").insert(msg);
  }

  const messages = readLocal<PartyMessage[]>(STORAGE_KEYS.MESSAGES, []);
  writeLocal(STORAGE_KEYS.MESSAGES, [...messages, msg]);
  return msg;
}

export { isSupabaseConfigured };
