export type UserRole = "user" | "admin";
export type GameSyncType = "multiplayer_ngo" | "synced_singleplayer";
export type AdsMode = "inherit" | "force_on" | "force_off";
export type PartyStatus = "lobby" | "in_game" | "leaderboard" | "ended";
export type PartyMemberRole = "host" | "player";
export type PaymentProvider = "mercadopago" | "lemonsqueezy" | "admin_manual";
export type PlanType = "party_pass_24h" | "pro_monthly" | "lifetime";
export type VoiceProviderType = "none" | "external_link" | "livekit" | "daily";

export interface Profile {
  id: string;
  is_anonymous: boolean;
  username: string;
  avatar_url: string;
  role: UserRole;
  ad_free_until: string | null;
  active_plan_type?: PlanType | null;
  rewarded_ad_free_until?: string | null;
  email?: string | null;
  created_at: string;
}

export interface MonetizationSettings {
  id: number;
  ads_enabled_globally: boolean;
  enable_web_banners: boolean;
  enable_preroll_ads: boolean;
  enable_midgame_ads: boolean;
  enable_rewarded_ads: boolean;
  midgame_ad_cooldown_seconds: number;
  plan_party_pass_enabled: boolean;
  plan_pro_monthly_enabled: boolean;
  plan_lifetime_enabled: boolean;
  plan_party_pass_grants_rewarded_free: boolean;
  plan_pro_monthly_grants_rewarded_free: boolean;
  plan_lifetime_grants_rewarded_free: boolean;
  party_pass_price_usd: number;
  party_pass_price_ars: number;
  pro_monthly_price_usd: number;
  pro_monthly_price_ars: number;
  lifetime_price_usd: number;
  lifetime_price_ars: number;
  updated_at: string;
}

export interface Game {
  id: string;
  slug: string;
  title: string;
  description: string;
  thumbnail_url: string;
  min_players: number;
  max_players: number;
  ideal_duration_mins: number;
  sync_type: GameSyncType;
  r2_base_url: string;
  build_file_prefix: string;
  ads_mode: AdsMode;
  is_published: boolean;
  created_at: string;
}

export interface Party {
  id: string;
  invite_code: string;
  host_id: string;
  target_players: number;
  target_duration_mins: number;
  status: PartyStatus;
  current_game_id: string | null;
  current_round: number;
  network_room_code: string | null;
  ad_free_override: boolean;
  rewarded_ad_free_override?: boolean;
  voice_provider_type: VoiceProviderType;
  voice_room_url: string | null;
  created_at: string;
}

export interface PartyMember {
  party_id: string;
  user_id: string;
  role: PartyMemberRole;
  is_connected: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface ScoreEntry {
  id: string;
  party_id: string;
  game_id: string;
  user_id: string;
  round_number: number;
  score_value: number;
  party_points: number;
  metadata: Record<string, unknown> | null;
  recorded_at: string;
  profile?: Profile;
  game?: Game;
}

export interface PartyMessage {
  id: string;
  party_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: Profile;
}

export interface EntitlementLog {
  id: string;
  user_id: string;
  provider: PaymentProvider;
  plan_type: PlanType;
  external_reference: string;
  granted_until: string;
  created_at: string;
}

// =============================================================================
// Web <-> Unity Bridge Contract (TailoredSDK)
// =============================================================================

export interface TailoredBridgeUser {
  id: string;
  username: string;
  avatarUrl: string;
  isHost: boolean;
}

export interface TailoredInitializeSessionPayload {
  partyId: string;
  inviteCode: string;
  networkRoomCode: string;
  syncType: GameSyncType;
  isAdFree: boolean;
  isRewardedAdFree: boolean;
  adCooldownSeconds: number;
  roundNumber: number;
  currentUser: TailoredBridgeUser;
  partyMembers: TailoredBridgeUser[];
  isPrerollActive?: boolean;
}

export interface TailoredAdStatusPayload {
  isAdFree: boolean;
  isRewardedAdFree: boolean;
  adCooldownSeconds: number;
}

export type TailoredUnityEventType =
  | "OnUnityReady"
  | "PublishRelayCode"
  | "SubmitScore"
  | "RequestCommercialBreak"
  | "RequestRewardedAd"
  | "NotifyGameEnded"
  | "BroadcastPartyEvent";

export interface TailoredUnityEventDetail {
  type: TailoredUnityEventType;
  payload: {
    joinCode?: string;
    score?: number;
    metadata?: Record<string, unknown>;
    placement?: string;
    rewarded?: boolean;
    vipInstantGrant?: boolean;
    summaryJson?: string;
    eventName?: string;
    data?: string;
  };
}
