"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import { getUserScoreHistory } from "@/lib/store/platform-store";
import { ScoreEntry } from "@/types/database";
import {
  Crown,
  Dices,
  Gamepad2,
  History,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";

export function Navbar() {
  const {
    profile,
    isLoading,
    isLiveSupabase,
    randomizeIdentity,
    updateUsername,
    upgradeAccount,
    toggleAdminRole,
  } = useAuth();

  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    if (profile) {
      setUsernameInput(profile.username);
    }
  }, [profile]);

  useEffect(() => {
    if (isUpgradeModalOpen && profile) {
      getUserScoreHistory(profile.id).then(setScoreHistory);
    }
  }, [isUpgradeModalOpen, profile]);

  const hasActiveAdFree =
    profile?.ad_free_until &&
    new Date(profile.ad_free_until).getTime() > Date.now();

  const handleSaveUsernameOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    await updateUsername(usernameInput);
    setStatusMessage("Display name & avatar updated!");
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleUpgradeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    const { error } = await upgradeAccount({
      email: emailInput.trim(),
      password: passwordInput || undefined,
      username: usernameInput.trim() || undefined,
    });
    if (error) {
      setStatusMessage(`Error: ${error}`);
    } else {
      setStatusMessage(
        "Account upgraded! Your guest history & scores are now permanently linked."
      );
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-white transition hover:opacity-90"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
                <Gamepad2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight">
                  Tailored<span className="text-indigo-400">Play</span>
                </span>
                <span className="ml-2 hidden rounded-md border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-300 sm:inline-block">
                  Team Hub
                </span>
              </div>
            </Link>

            <span
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium md:inline-flex ${
                isLiveSupabase
                  ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
              title={
                isLiveSupabase
                  ? "Connected to Supabase PostgreSQL & Realtime"
                  : "Running in Multi-Tab Local Sync Mode (configure .env.local for live Supabase)"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isLiveSupabase ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {isLiveSupabase ? "Supabase Live" : "Local Multi-Tab Sync"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {profile?.role === "admin" && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/25"
              >
                <ShieldCheck className="h-4 w-4 text-violet-400" />
                <span>Admin CMS</span>
              </Link>
            )}

            {!isLiveSupabase && profile && (
              <button
                onClick={toggleAdminRole}
                className="hidden rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition hover:border-slate-700 hover:text-slate-200 lg:inline-block"
                title="Dev helper: Toggle between Admin and Regular User role"
              >
                Role: <strong className="text-slate-200">{profile.role}</strong>
              </button>
            )}

            {hasActiveAdFree && (
              <div className="hidden items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300 sm:flex">
                <Crown className="h-3.5 w-3.5 text-amber-400" />
                <span>Ad-Free Host</span>
              </div>
            )}

            {isLoading || !profile ? (
              <div className="h-9 w-40 animate-pulse rounded-xl bg-slate-800" />
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="group flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/90 py-1.5 pl-2 pr-3 text-left transition hover:border-indigo-500/50 hover:bg-slate-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profile.avatar_url}
                    alt={profile.username}
                    className="h-7 w-7 rounded-lg bg-slate-800 object-cover"
                  />
                  <div className="leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-100 group-hover:text-indigo-300">
                        {profile.username}
                      </span>
                      <span
                        className={`rounded px-1 py-0.2 text-[9px] font-bold uppercase ${
                          profile.is_anonymous
                            ? "bg-slate-800 text-slate-400"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {profile.is_anonymous ? "Temp Guest" : "Verified"}
                      </span>
                    </div>
                    <span className="block text-[10px] text-indigo-400">
                      {profile.is_anonymous
                        ? "Save History / Edit Profile"
                        : profile.email || "Account Linked"}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Account Upgrade & History Modal */}
      {isUpgradeModalOpen && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 shadow-2xl">
            <button
              onClick={() => setIsUpgradeModalOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="h-14 w-14 rounded-2xl border border-indigo-500/40 bg-slate-800 p-1"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">
                    {profile.username}
                  </h2>
                  <button
                    type="button"
                    onClick={randomizeIdentity}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:border-indigo-500 hover:text-white"
                    title="Roll a new random corporate alias"
                  >
                    <Dices className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Reroll</span>
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Session UUID:{" "}
                  <code className="text-slate-300">
                    {profile.id.slice(0, 12)}...
                  </code>
                </p>
              </div>
            </div>

            {statusMessage && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-medium text-emerald-300">
                {statusMessage}
              </div>
            )}

            {/* Quick Username Edit */}
            <form onSubmit={handleSaveUsernameOnly} className="mt-5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Display Name (Sent automatically to Unity games)
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  placeholder="e.g. AgileCapybara42"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Update Name
                </button>
              </div>
            </form>

            {/* Upgrade Anonymous Guest -> Permanent Account */}
            {profile.is_anonymous ? (
              <form
                onSubmit={handleUpgradeSubmit}
                className="mt-6 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4"
              >
                <div className="flex items-center gap-2 text-indigo-300">
                  <Sparkles className="h-4 w-4" />
                  <h3 className="text-sm font-bold">
                    Claim Permanent Account & Keep History
                  </h3>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Link your email to convert this temporary guest identity into
                  a permanent profile. All your past party scores and badges stay
                  attached to your UUID.
                </p>
                <div className="mt-3 space-y-2.5">
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="work.email@company.com"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Choose a password (optional for magic link)"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500"
                  >
                    <UserCheck className="h-4 w-4" />
                    <span>Convert Temp Profile to Permanent Account</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                <UserCheck className="h-4 w-4 shrink-0" />
                <span>
                  Permanent account linked to{" "}
                  <strong>{profile.email || "your credentials"}</strong>.
                </span>
              </div>
            )}

            {/* Recent Score History */}
            <div className="mt-6">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400">
                <span className="flex items-center gap-1.5">
                  <History className="h-3.5 w-3.5 text-indigo-400" />
                  Your Recent Game History ({scoreHistory.length})
                </span>
              </div>
              <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {scoreHistory.length === 0 ? (
                  <p className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3 text-center text-xs text-slate-500">
                    No scores recorded yet. Join a party and play a mini-game!
                  </p>
                ) : (
                  scoreHistory.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-slate-200">
                          {s.game?.title || "Mini-Game"}
                        </span>
                        <span className="ml-2 text-[10px] text-slate-500">
                          Round {s.round_number}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400">
                          Raw: <strong className="text-white">{s.score_value}</strong>
                        </span>
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-bold text-indigo-300">
                          +{s.party_points} pts
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
