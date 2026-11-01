"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import {
  createParty,
  getGames,
  isPlatformDebugMode,
  SEED_GAMES,
  updatePartyState,
} from "@/lib/store/platform-store";
import { Game } from "@/types/database";
import { WebBannerAdSlot } from "@/components/ads/AdOverlayController";
import { HostUpgradeModal } from "@/components/ads/HostUpgradeModal";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Crown,
  Gamepad2,
  Play,
  Plus,
  Sparkles,
  Users,
  Video,
  Wrench,
  Zap,
} from "lucide-react";

const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60];
const PLAYER_PRESETS = [4, 8, 12, 16, 24];

export default function HomePage() {
  const router = useRouter();
  const { profile, monetization, refreshState } = useAuth();

  const [games, setGames] = useState<Game[]>(SEED_GAMES);
  const [targetPlayers, setTargetPlayers] = useState<number>(8);
  const [targetDurationMins, setTargetDurationMins] = useState<number>(30);
  const [meetingUrl, setMeetingUrl] = useState<string>("");
  const [inviteCodeInput, setInviteCodeInput] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [showAllCatalog, setShowAllCatalog] = useState(true);
  const [isDebug, setIsDebug] = useState(false);

  useEffect(() => {
    setIsDebug(isPlatformDebugMode());
  }, []);

  useEffect(() => {
    getGames(false).then(setGames);
  }, []);

  const matchingGames = useMemo(() => {
    return games.filter(
      (g) =>
        g.min_players <= targetPlayers &&
        targetPlayers <= g.max_players &&
        g.ideal_duration_mins <= targetDurationMins
    );
  }, [games, targetPlayers, targetDurationMins]);

  const displayedGames = showAllCatalog
    ? games
    : matchingGames.length > 0
      ? matchingGames
      : games;

  const isHostAdFree = Boolean(
    !monetization.ads_enabled_globally ||
      (profile?.ad_free_until &&
        new Date(profile.ad_free_until).getTime() > Date.now())
  );

  const handleCreateParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setIsCreating(true);
    try {
      const party = await createParty({
        hostProfile: profile,
        targetPlayers,
        targetDurationMins,
        voiceProviderType: "external_link",
        voiceRoomUrl: meetingUrl.trim() || undefined,
      });
      router.push(`/party/${party.invite_code}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLaunchGameDirect = async (
    game: Game,
    isDebugSolo = false,
    e?: React.MouseEvent
  ) => {
    if (e) {
      e.stopPropagation();
    }
    if (!profile) return;
    setIsCreating(true);
    try {
      const party = await createParty({
        hostProfile: profile,
        targetPlayers: Math.max(game.min_players, 2),
        targetDurationMins: game.ideal_duration_mins,
      });
      await updatePartyState(party.id, {
        current_game_id: game.id,
        status: isDebugSolo ? "in_game" : "lobby",
      });
      router.push(
        `/party/${party.invite_code}${isDebugSolo ? "?debug=1" : ""}`
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inviteCodeInput.trim().toUpperCase();
    if (!cleaned) return;
    router.push(`/party/${cleaned}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Top Banner Slot */}
      <WebBannerAdSlot
        isAdFree={isHostAdFree}
        enableWebBanners={monetization.enable_web_banners}
        isHost={true}
        onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
      />

      {/* Hero Section */}
      <div className="mt-4 grid gap-8 lg:grid-cols-12 lg:items-start">
        {/* Left 7 Cols: Value Prop + Host Party Creator */}
        <div className="space-y-6 lg:col-span-7">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Zero-Friction Unity WebGL Team Building</span>
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              Instant Corporate{" "}
              <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-amber-300 bg-clip-text text-transparent">
                Party & Networking
              </span>{" "}
              Games
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
              No downloads or mandatory sign-ups. Participants get an automatic
              corporate alias and avatar on arrival, join via a single link, and
              play real-time multiplayer or synced Unity WebGL mini-games right
              in their browser.
            </p>
          </div>

          {/* Host Party Configurator Card */}
          <form
            onSubmit={handleCreateParty}
            className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  1. Host a New Team Party
                </h2>
                <p className="text-xs text-slate-400">
                  Set your group size & meeting duration to filter ideal Unity
                  games
                </p>
              </div>
              <span className={`rounded-xl border px-3 py-1 text-xs font-bold ${
                games.length > 0
                  ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-300"
              }`}>
                {games.length > 0
                  ? `${matchingGames.length} Matching Games`
                  : "No Games Loaded"}
              </span>
            </div>

            <div className="mt-5 space-y-5">
              {/* Player Amount Selector */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Users className="h-4 w-4 text-indigo-400" />
                    <span>Expected Player Amount</span>
                  </label>
                  <span className="rounded-lg bg-indigo-500/20 px-2.5 py-0.5 text-xs font-extrabold text-indigo-300">
                    {targetPlayers} Players
                  </span>
                </div>

                <input
                  type="range"
                  min={1}
                  max={30}
                  value={targetPlayers}
                  onChange={(e) => setTargetPlayers(Number(e.target.value))}
                  className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-800 accent-indigo-500"
                />

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PLAYER_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setTargetPlayers(preset)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        targetPlayers === preset
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
                      }`}
                    >
                      {preset} Players
                    </button>
                  ))}
                </div>
              </div>

              {/* Meeting Ideal Duration Selector */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
                  <Clock className="h-4 w-4 text-indigo-400" />
                  <span>Meeting / Activity Ideal Duration</span>
                </label>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {DURATION_OPTIONS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setTargetDurationMins(mins)}
                      className={`rounded-xl border py-2 text-xs font-bold transition ${
                        targetDurationMins === mins
                          ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                          : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-white"
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional External Call Link */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <Video className="h-3.5 w-3.5 text-slate-500" />
                  <span>
                    Optional Zoom / Google Meet / Teams Link (Shown in Lobby)
                  </span>
                </label>
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating || !profile}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-indigo-600/25 transition hover:brightness-110 disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                <span>
                  {isCreating
                    ? "Creating Party Room..."
                    : "Create Party & Generate Invite Link"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Right 5 Cols: Join by Code + Host Ad-Free Pass Card */}
        <div className="space-y-6 lg:col-span-5">
          {/* Join Existing Party Card */}
          <form
            onSubmit={handleJoinByCode}
            className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl"
          >
            <h2 className="text-lg font-bold text-white">
              Have a Party Invite Code?
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Enter the 6-character code shared by your Host (or open their
              special invite link directly).
            </p>
            <div className="mt-4 flex gap-2">
              <input
                type="text"
                maxLength={8}
                value={inviteCodeInput}
                onChange={(e) =>
                  setInviteCodeInput(e.target.value.toUpperCase())
                }
                placeholder="ABC123"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center font-mono text-base font-extrabold uppercase tracking-widest text-white focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-bold text-white transition hover:bg-indigo-500"
              >
                Join Room
              </button>
            </div>
          </form>

          {/* Host Universal Ad-Free Card */}
          <div className="rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 p-6">
            <div className="flex items-center gap-2.5 text-amber-300">
              <Crown className="h-5 w-5" />
              <span className="text-xs font-extrabold uppercase tracking-wider">
                Host-Level Ad-Free Entitlement
              </span>
            </div>
            <h3 className="mt-2 text-base font-bold text-white">
              Only the Host Pays — Every Guest Plays Ad-Free
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Upgrade your Host profile with a 24-Hour Party Pass, Monthly Pro
              subscription, or Lifetime Pass to disable webpage banners and
              in-game ad breaks for everyone in your party.
            </p>
            <button
              type="button"
              onClick={() => setIsUpgradeModalOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25"
            >
              <Crown className="h-4 w-4" />
              <span>
                {isHostAdFree
                  ? "Ad-Free Active • View Entitlement Plans"
                  : "View Host Ad-Free Plans"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Game Catalog Section */}
      <section className="mt-12">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                <Gamepad2 className="h-5 w-5 text-indigo-400" />
                <span>Available Games Catalog</span>
              </h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${
                  isDebug
                    ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : "border border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
                }`}
              >
                {isDebug ? "🛠️ Debug Environment (Port 3001)" : "🎮 Real Web Platform (Port 3000)"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {showAllCatalog
                ? `Showing all ${games.length} games. In Final Web, games require a party with min 2 players. Debug Web permits 1-player solo launch.`
                : `Showing ${matchingGames.length} games matching ${targetPlayers} players & ≤${targetDurationMins} mins.`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllCatalog((prev) => !prev)}
              className="rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              {showAllCatalog
                ? `Apply Party Filter (${matchingGames.length} matches)`
                : `Show All Games (${games.length})`}
            </button>
          </div>
        </div>

        {games.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-900 p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-white">
              No Unity WebGL Games in Catalog
            </h3>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-300">
              There are currently no games registered on this platform. You can upload a compiled WebGL build in the Admin CMS, or use the Unity Editor command <code className="text-indigo-300 font-mono">TailoredPlay &gt; Build &amp; Deploy Direct to Local Web</code>.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition"
              >
                <Plus className="h-4 w-4" />
                <span>Upload First Game in Admin CMS</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {displayedGames.map((game) => {
              const isMatch =
                game.min_players <= targetPlayers &&
                targetPlayers <= game.max_players &&
                game.ideal_duration_mins <= targetDurationMins;

              return (
                <div
                  key={game.id}
                  className={`group flex flex-col justify-between overflow-hidden rounded-2xl border bg-slate-900/90 transition shadow-lg ${
                    isMatch || showAllCatalog
                      ? "border-slate-800 hover:border-indigo-500/60 hover:shadow-indigo-500/10"
                      : "border-slate-900 opacity-60 hover:opacity-100"
                  }`}
                >
                  <div>
                    <div
                      onClick={() => handleLaunchGameDirect(game, isDebug)}
                      className="relative h-44 w-full cursor-pointer overflow-hidden bg-slate-950"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={game.thumbnail_url}
                        alt={game.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-slate-950/85 px-2 py-0.5 text-[10px] font-bold text-indigo-300 backdrop-blur-sm">
                          Min {Math.max(game.min_players, 2)} Players
                        </span>
                        {game.ads_mode === "force_off" && (
                          <span className="rounded-md bg-emerald-950/90 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            Ad-Free
                          </span>
                        )}
                        {isDebug && (
                          <span className="rounded-md bg-amber-500/90 px-2 py-0.5 text-[10px] font-extrabold text-slate-950">
                            Debug Solo Ready
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <h3
                          onClick={() => handleLaunchGameDirect(game, isDebug)}
                          className="cursor-pointer text-base font-bold text-white transition hover:text-indigo-300"
                        >
                          {game.title}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">
                        {game.description}
                      </p>

                      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-indigo-400" />
                          {Math.max(game.min_players, 2)}–{game.max_players} Players
                        </span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-indigo-400" />~
                          {game.ideal_duration_mins} mins
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 p-3 bg-slate-950/50">
                    {isDebug ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleLaunchGameDirect(game, true, e)}
                          disabled={isCreating || !profile}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 hover:brightness-110 disabled:opacity-50"
                          title="Instant 1-player solo launch in Debug Mode"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>⚡ Solo Debug</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleLaunchGameDirect(game, false, e)}
                          disabled={isCreating || !profile}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3 py-2.5 text-xs font-bold text-indigo-200 transition hover:bg-indigo-500/25 disabled:opacity-50"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>Host Party</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleLaunchGameDirect(game, false, e)}
                        disabled={isCreating || !profile}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:brightness-110 disabled:opacity-50"
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>Host Party for {game.title} (Min 2 Players)</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {profile && (
        <HostUpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          hostProfile={profile}
          monetization={monetization}
          onEntitlementGranted={refreshState}
        />
      )}
    </div>
  );
}
