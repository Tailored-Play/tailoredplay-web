"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { MonetizationSettings, Profile } from "@/types/database";
import {
  DEFAULT_MONETIZATION_SETTINGS,
  STORAGE_KEYS,
  ensureAnonymousOrCurrentProfile,
  getMonetizationSettings,
  isSupabaseConfigured,
  subscribeToPlatformEvents,
  updateProfileIdentity,
  upgradeAnonymousAccount,
} from "@/lib/store/platform-store";
import { generateAvatarUrl, generateCorporateUsername } from "@/lib/identity";

interface AuthContextValue {
  profile: Profile | null;
  monetization: MonetizationSettings;
  isLoading: boolean;
  isLiveSupabase: boolean;
  refreshState: () => Promise<void>;
  randomizeIdentity: () => Promise<void>;
  updateUsername: (newUsername: string) => Promise<void>;
  upgradeAccount: (params: {
    email: string;
    password?: string;
    username?: string;
  }) => Promise<{ error?: string }>;
  toggleAdminRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [monetization, setMonetization] = useState<MonetizationSettings>(
    DEFAULT_MONETIZATION_SETTINGS
  );
  const [isLoading, setIsLoading] = useState(true);
  const isLiveSupabase = isSupabaseConfigured();

  const refreshState = useCallback(async () => {
    const [p, m] = await Promise.all([
      ensureAnonymousOrCurrentProfile(),
      getMonetizationSettings(),
    ]);
    setProfile(p);
    setMonetization(m);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshState();
    const unsub = subscribeToPlatformEvents((packet) => {
      if (
        !packet.key ||
        packet.key === STORAGE_KEYS.PROFILES ||
        packet.key === STORAGE_KEYS.MONETIZATION ||
        packet.key === STORAGE_KEYS.ENTITLEMENTS ||
        packet.type === "PARTY_AD_STATUS_UPDATED"
      ) {
        refreshState();
      }
    });
    return unsub;
  }, [refreshState]);

  const randomizeIdentity = useCallback(async () => {
    if (!profile) return;
    const nextName = generateCorporateUsername();
    const updated = await updateProfileIdentity(profile.id, {
      username: nextName,
      avatar_url: generateAvatarUrl(nextName),
    });
    if (updated) setProfile(updated);
  }, [profile]);

  const updateUsername = useCallback(
    async (newUsername: string) => {
      if (!profile || !newUsername.trim()) return;
      const trimmed = newUsername.trim();
      const updated = await updateProfileIdentity(profile.id, {
        username: trimmed,
        avatar_url: generateAvatarUrl(trimmed),
      });
      if (updated) setProfile(updated);
    },
    [profile]
  );

  const upgradeAccount = useCallback(
    async (params: { email: string; password?: string; username?: string }) => {
      if (!profile) return { error: "No active session" };
      const res = await upgradeAnonymousAccount({
        userId: profile.id,
        ...params,
      });
      if (res.profile) {
        setProfile(res.profile);
      }
      return { error: res.error };
    },
    [profile]
  );

  const toggleAdminRole = useCallback(async () => {
    if (!profile) return;
    const nextRole = profile.role === "admin" ? "user" : "admin";
    const updated = await updateProfileIdentity(profile.id, { role: nextRole });
    if (updated) setProfile(updated);
  }, [profile]);

  return (
    <AuthContext.Provider
      value={{
        profile,
        monetization,
        isLoading,
        isLiveSupabase,
        refreshState,
        randomizeIdentity,
        updateUsername,
        upgradeAccount,
        toggleAdminRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
