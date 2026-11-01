import { Game, MonetizationSettings, Party, Profile } from "@/types/database";

const CORPORATE_ADJECTIVES = [
  "Agile",
  "Synergy",
  "Quantum",
  "Dynamic",
  "Nimble",
  "Pixel",
  "Cosmic",
  "Turbo",
  "Velvet",
  "Hyper",
  "Lean",
  "Stellar",
  "Cloud",
  "Bionic",
  "Apex",
];

const ANIMALS = [
  "Capybara",
  "Otter",
  "Falcon",
  "Penguin",
  "Fox",
  "Koala",
  "Dolphin",
  "Panda",
  "Lynx",
  "Toucan",
  "Quokka",
  "Narwhal",
  "Badger",
  "Gecko",
  "Alpaca",
];

export function generateCorporateUsername(): string {
  const adj =
    CORPORATE_ADJECTIVES[
      Math.floor(Math.random() * CORPORATE_ADJECTIVES.length)
    ];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj}${animal}${num}`;
}

export function generateAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(
    seed
  )}`;
}

export function generateInviteCode(length = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes ambiguous 0/O/1/I
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Resolves whether a Party currently has Ad-Free and Rewarded-Ad-Free status based on:
 * 1. Global Ads Master Switch (`!monetization.ads_enabled_globally`) & `enable_rewarded_ads`
 * 2. Current Game override (`ads_mode === 'force_on'` vs `'force_off'`)
 * 3. Party manual overrides (`party.ad_free_override`, `party.rewarded_ad_free_override`)
 * 4. Host active entitlement (`hostProfile.ad_free_until`, `hostProfile.rewarded_ad_free_until`)
 */
export function resolvePartyAdFreeStatus(params: {
  party: Party | null;
  hostProfile: Profile | null;
  currentGame: Game | null;
  monetization: MonetizationSettings;
}): {
  isAdFree: boolean;
  isRewardedAdFree: boolean;
  reason: string;
  rewardedReason: string;
} {
  const { party, hostProfile, currentGame, monetization } = params;

  let isAdFree = false;
  let reason = "Standard Ad-Supported Party";
  let isRewardedAdFree = false;
  let rewardedReason = "Standard Rewarded Ads Active";

  // 1. Global master switches
  if (!monetization.ads_enabled_globally) {
    return {
      isAdFree: true,
      isRewardedAdFree: true,
      reason: "Global Ads Disabled by Admin",
      rewardedReason: "Global Ads Disabled by Admin",
    };
  }

  if (!monetization.enable_rewarded_ads) {
    isRewardedAdFree = true;
    rewardedReason = "Rewarded Ads Disabled by Admin";
  }

  // 2. Commercial / Interstitial Break resolution
  if (currentGame?.ads_mode === "force_on") {
    if (party?.ad_free_override) {
      isAdFree = true;
      reason = "Admin Party Override";
    } else {
      isAdFree = false;
      reason = "Game Forces Ads On";
    }
  } else if (currentGame?.ads_mode === "force_off") {
    isAdFree = true;
    reason = "Sponsor / Ad-Free Game";
    isRewardedAdFree = true;
    rewardedReason = "Sponsor / Ad-Free Game";
  } else if (party?.ad_free_override) {
    isAdFree = true;
    reason = "Party Ad-Free Override Enabled";
  } else if (hostProfile?.ad_free_until) {
    const expiresAt = new Date(hostProfile.ad_free_until).getTime();
    if (expiresAt > Date.now()) {
      isAdFree = true;
      reason = "Host Ad-Free Pass Active";
    }
  }

  // 3. Rewarded Ad Free resolution (Tiered / Separate perk)
  if (!isRewardedAdFree) {
    if (party?.rewarded_ad_free_override) {
      isRewardedAdFree = true;
      rewardedReason = "Party Rewarded Ad-Free Override Enabled";
    } else if (hostProfile?.rewarded_ad_free_until) {
      const rewExpiresAt = new Date(hostProfile.rewarded_ad_free_until).getTime();
      if (rewExpiresAt > Date.now()) {
        isRewardedAdFree = true;
        rewardedReason = "Host Rewarded VIP Perk Active";
      }
    } else if (hostProfile?.ad_free_until && new Date(hostProfile.ad_free_until).getTime() > Date.now()) {
      const plan = hostProfile.active_plan_type;
      if (
        (plan === "party_pass_24h" && monetization.plan_party_pass_grants_rewarded_free) ||
        (plan === "pro_monthly" && monetization.plan_pro_monthly_grants_rewarded_free) ||
        (plan === "lifetime" && monetization.plan_lifetime_grants_rewarded_free)
      ) {
        isRewardedAdFree = true;
        rewardedReason = `Host Tier (${plan}) Grants Instant Rewards`;
      }
    }
  }

  return { isAdFree, isRewardedAdFree, reason, rewardedReason };
}

/**
 * Calculates normalized Party Points (for the multi-game Party Podium) based on
 * placement rank in a round:
 * 1st = 100 pts, 2nd = 80 pts, 3rd = 65 pts, 4th = 50 pts, 5th = 40 pts, etc.
 */
export function calculateNormalizedPartyPoints(rankZeroIndexed: number): number {
  const table = [100, 80, 65, 50, 40, 30, 25, 20, 15, 10];
  if (rankZeroIndexed < 0) return 50;
  if (rankZeroIndexed < table.length) return table[rankZeroIndexed];
  return 10;
}
