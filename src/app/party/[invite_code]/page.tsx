"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import {
  getGames,
  getPartyByInviteCode,
  getPartyMembersWithProfiles,
  getPartyMessages,
  getPartyScores,
  getProfileById,
  isPlatformDebugMode,
  joinPartyAsMember,
  SEED_GAMES,
  sendPartyMessage,
  submitPlayerScore,
  subscribeToPartyRealtime,
  subscribeToPlatformEvents,
  updateMonetizationSettings,
  updatePartyState,
} from "@/lib/store/platform-store";
import { resolvePartyAdFreeStatus } from "@/lib/identity";
import {
  Game,
  Party,
  PartyMember,
  PartyMessage,
  Profile,
  ScoreEntry,
} from "@/types/database";
import { VoiceVideoBar } from "@/components/party/VoiceVideoBar";
import { PartyChatDrawer } from "@/components/party/PartyChatDrawer";
import { UnityGameCanvas } from "@/components/unity/UnityGameCanvas";
import { WebBannerAdSlot } from "@/components/ads/AdOverlayController";
import { HostUpgradeModal } from "@/components/ads/HostUpgradeModal";
import {
  AlertTriangle,
  Award,
  Check,
  Clock,
  Crown,
  Filter,
  Gamepad2,
  Play,
  Plus,
  RotateCcw,
  Share2,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

export default function PartyRoomPage() {
  const params = useParams<{ invite_code: string }>();
  const inviteCode = (params?.invite_code || "").toUpperCase();

  const { profile, monetization, refreshState } = useAuth();

  const [party, setParty] = useState<Party | null>(null);
  const [hostProfile, setHostProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [games, setGames] = useState<Game[]>(SEED_GAMES);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [messages, setMessages] = useState<PartyMessage[]>([]);
  const [notFound, setNotFound] = useState(false);

  const [showAllGames, setShowAllGames] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isDebug, setIsDebug] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<"podium" | "round">(
    "podium"
  );

  useEffect(() => {
    setIsDebug(isPlatformDebugMode());
  }, []);

  const loadPartyData = useCallback(async () => {
    if (!inviteCode) return;
    const foundParty = await getPartyByInviteCode(inviteCode);
    if (!foundParty) {
      setNotFound(true);
      return;
    }
    setNotFound(false);
    setParty(foundParty);

    const [allGames, partyScores, partyMsgs, hostProf, roster] =
      await Promise.all([
        getGames(false),
        getPartyScores(foundParty.id),
        getPartyMessages(foundParty.id),
        getProfileById(foundParty.host_id),
        getPartyMembersWithProfiles(foundParty.id),
      ]);

    setGames(allGames);
    setScores(partyScores);
    setMessages(partyMsgs);
    setHostProfile(hostProf);
    setMembers(roster);
  }, [inviteCode]);

  // Automatically join party roster once profile & party are loaded
  useEffect(() => {
    if (!profile || !inviteCode) return;
    getPartyByInviteCode(inviteCode).then(async (found) => {
      if (found) {
        await joinPartyAsMember(found, profile);
        await loadPartyData();
      } else {
        setNotFound(true);
      }
    });
  }, [profile, inviteCode, loadPartyData]);

  // Subscribe to Realtime updates (Cross-device Supabase Realtime + Multi-Tab BroadcastChannel)
  useEffect(() => {
    if (!party?.id) {
      const unsub = subscribeToPlatformEvents(() => {
        loadPartyData();
      });
      return unsub;
    }

    const unsub = subscribeToPartyRealtime(party.id, () => {
      loadPartyData();
    });
    return unsub;
  }, [party?.id, loadPartyData]);

  // Periodic safety polling ensures mobile browser reconnections sync automatically
  useEffect(() => {
    if (party?.status === "in_game") return;
    const interval = setInterval(() => {
      loadPartyData();
    }, 6000);
    return () => clearInterval(interval);
  }, [loadPartyData, party?.status]);

  const isHost = Boolean(party && profile && party.host_id === profile.id);

  const currentGame = useMemo(() => {
    if (!party?.current_game_id) return null;
    return (
      games.find(
        (g) =>
          g.id === party.current_game_id ||
          g.slug === party.current_game_id
      ) || null
    );
  }, [party?.current_game_id, games]);

  const adFreeResolution = useMemo(() => {
    return resolvePartyAdFreeStatus({
      party,
      hostProfile,
      currentGame,
      monetization,
    });
  }, [party, hostProfile, currentGame, monetization]);

  const filteredGames = useMemo(() => {
    if (!party) return games;
    if (showAllGames) return games;
    return games.filter(
      (g) =>
        g.min_players <= party.target_players &&
        party.target_players <= g.max_players &&
        g.ideal_duration_mins <= party.target_duration_mins
    );
  }, [games, party, showAllGames]);

  // Cumulative Party Podium (sums normalized `party_points` across all rounds played)
  const cumulativePodium = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        username: string;
        avatarUrl: string;
        totalPartyPoints: number;
        totalRawScore: number;
        roundsPlayed: number;
      }
    >();

    members.forEach((m) => {
      map.set(m.user_id, {
        userId: m.user_id,
        username: m.profile?.username || "Guest",
        avatarUrl:
          m.profile?.avatar_url ||
          `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${m.user_id}`,
        totalPartyPoints: 0,
        totalRawScore: 0,
        roundsPlayed: 0,
      });
    });

    scores.forEach((s) => {
      const existing = map.get(s.user_id) || {
        userId: s.user_id,
        username: s.profile?.username || "Guest",
        avatarUrl:
          s.profile?.avatar_url ||
          `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${s.user_id}`,
        totalPartyPoints: 0,
        totalRawScore: 0,
        roundsPlayed: 0,
      };
      existing.totalPartyPoints += Number(s.party_points || 0);
      existing.totalRawScore += Number(s.score_value || 0);
      existing.roundsPlayed += 1;
      map.set(s.user_id, existing);
    });

    return Array.from(map.values()).sort(
      (a, b) =>
        b.totalPartyPoints - a.totalPartyPoints ||
        b.totalRawScore - a.totalRawScore
    );
  }, [members, scores]);

  const handleCopyInviteLink = () => {
    if (typeof window === "undefined" || !party) return;
    const url = `${window.location.origin}/party/${party.invite_code}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleLaunchGame = async (game: Game) => {
    if (!party || !isHost) return;
    await updatePartyState(party.id, {
      status: "in_game",
      current_game_id: game.id,
      network_room_code: null,
    });
    await loadPartyData();
  };

  const handleUpdateCriteria = async (
    targetPlayers: number,
    targetDurationMins: number
  ) => {
    if (!party || !isHost) return;
    await updatePartyState(party.id, {
      target_players: targetPlayers,
      target_duration_mins: targetDurationMins,
    });
    await loadPartyData();
  };

  const handlePublishRelayCode = async (joinCode: string) => {
    if (!party) return;
    await updatePartyState(party.id, {
      network_room_code: joinCode,
    });
    await loadPartyData();
  };

  const handleSubmitScore = async (
    scoreValue: number,
    metadata?: Record<string, unknown>
  ) => {
    if (!party || !profile || !party.current_game_id) return;
    await submitPlayerScore({
      partyId: party.id,
      gameId: party.current_game_id,
      userId: profile.id,
      roundNumber: party.current_round || 1,
      scoreValue,
      metadata,
    });
    await loadPartyData();
  };

  const handleNotifyGameEnded = async () => {
    if (!party) return;
    await updatePartyState(party.id, {
      status: "leaderboard",
    });
    await loadPartyData();
  };

  const handleReturnToLobby = async () => {
    if (!party) return;
    await updatePartyState(party.id, {
      status: "lobby",
      current_round: (party.current_round || 1) + 1,
      network_room_code: null,
    });
    await loadPartyData();
  };

  const handleReplayNextRound = async () => {
    if (!party) return;
    await updatePartyState(party.id, {
      status: "in_game",
      current_round: (party.current_round || 1) + 1,
      network_room_code: null,
    });
    await loadPartyData();
  };

  const handleToggleAdFree = async () => {
    if (!party) return;
    await updatePartyState(party.id, {
      ad_free_override: !party.ad_free_override,
    });
    await loadPartyData();
  };

  const handleToggleRewardedAdFree = async () => {
    if (!party) return;
    await updatePartyState(party.id, {
      rewarded_ad_free_override: !party.rewarded_ad_free_override,
    });
    await loadPartyData();
  };

  const handleUpdateAdCooldown = async (seconds: number) => {
    await updateMonetizationSettings({
      midgame_ad_cooldown_seconds: seconds,
    });
    await loadPartyData();
  };

  const handleSendMessage = async (content: string) => {
    if (!party || !profile) return;
    await sendPartyMessage({
      partyId: party.id,
      userId: profile.id,
      content,
    });
    await loadPartyData();
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white">
          Party Room &ldquo;{inviteCode}&rdquo; Not Found
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Check the 6-character invite code with your Host or start a new team
          party.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  if (!party || !profile) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="h-64 animate-pulse rounded-3xl bg-slate-900" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
      {/* Top Banner Ad Slot (Hidden automatically if Party is Ad-Free) */}
      <WebBannerAdSlot
        isAdFree={adFreeResolution.isAdFree}
        enableWebBanners={monetization.enable_web_banners}
        isHost={isHost}
        onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
      />

      {/* Party Top Header Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/90 px-5 py-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Party Room Code
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                  party.status === "in_game"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : party.status === "leaderboard"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-indigo-500/20 text-indigo-300"
                }`}
              >
                {party.status.replace("_", " ")} • Round #{party.current_round}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2.5">
              <span className="font-mono text-2xl font-extrabold tracking-widest text-white">
                {party.invite_code}
              </span>
              <button
                type="button"
                onClick={handleCopyInviteLink}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-200 transition hover:bg-indigo-500/25"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Invite Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5" />
                    <span>Copy Invite Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Party Filter Pills */}
          <div className="hidden items-center gap-2 border-l border-slate-800 pl-4 md:flex">
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs">
              <span className="text-slate-400">Target Size: </span>
              <strong className="text-white">{party.target_players}p</strong>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs">
              <span className="text-slate-400">Duration: </span>
              <strong className="text-white">
                {party.target_duration_mins}m
              </strong>
            </div>
          </div>
        </div>

        {/* Right Side: Ad-Free Status + Navigation */}
        <div className="flex flex-wrap items-center gap-2.5">
          {adFreeResolution.isAdFree ? (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Ad-Free Party ({adFreeResolution.reason})</span>
            </div>
          ) : isHost ? (
            <button
              type="button"
              onClick={() => setIsUpgradeModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-500/15 transition hover:brightness-110"
            >
              <Crown className="h-4 w-4" />
              <span>Host: Remove Ads for Party</span>
            </button>
          ) : (
            <span className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-400">
              Ad-Supported Session
            </span>
          )}

          {party.status !== "leaderboard" && (
            <button
              type="button"
              onClick={() =>
                updatePartyState(party.id, { status: "leaderboard" }).then(
                  loadPartyData
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>Standings</span>
            </button>
          )}
        </div>
      </div>

      {/* Pluggable Voice & Camera Bar */}
      <div className="mb-4">
        <VoiceVideoBar
          party={party}
          members={members}
          isHost={isHost}
          onUpdateVoiceConfig={async (updates) => {
            await updatePartyState(party.id, updates);
            await loadPartyData();
          }}
        />
      </div>

      {/* Main Content + Right Sidebar (Roster & Collapsible Chat) */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Left/Center Primary Stage */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* VIEW 1: IN-GAME UNITY WEBGL CANVAS */}
          {party.status === "in_game" && currentGame ? (
            <UnityGameCanvas
              party={party}
              game={currentGame}
              currentUser={profile}
              members={members}
              isAdFree={adFreeResolution.isAdFree}
              isRewardedAdFree={adFreeResolution.isRewardedAdFree}
              monetization={monetization}
              onPublishRelayCode={handlePublishRelayCode}
              onSubmitScore={handleSubmitScore}
              onNotifyGameEnded={handleNotifyGameEnded}
              onReturnToLobby={handleReturnToLobby}
              onOpenHostUpgrade={() => setIsUpgradeModalOpen(true)}
              onToggleAdFree={handleToggleAdFree}
              onToggleRewardedAdFree={handleToggleRewardedAdFree}
              onUpdateAdCooldown={handleUpdateAdCooldown}
            />
          ) : party.status === "leaderboard" ? (
            /* VIEW 2: DUAL LEADERBOARD & PARTY PODIUM */
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-amber-400">
                    <Trophy className="h-5 w-5" />
                    <span className="text-xs font-extrabold uppercase tracking-wider">
                      Party Leaderboard & Podium
                    </span>
                  </div>
                  <h2 className="mt-1 text-2xl font-extrabold text-white">
                    Team Building Standings
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-xl border border-slate-800 bg-slate-950 p-1">
                    <button
                      type="button"
                      onClick={() => setLeaderboardTab("podium")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        leaderboardTab === "podium"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Cumulative Party Podium
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaderboardTab("round")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        leaderboardTab === "round"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Per-Round Raw Scores ({scores.length})
                    </button>
                  </div>

                  {isHost && (
                    <div className="flex gap-2">
                      {currentGame && (
                        <button
                          type="button"
                          onClick={handleReplayNextRound}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3.5 py-2 text-xs font-bold text-indigo-200 hover:bg-indigo-500/25"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Replay {currentGame.title}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleReturnToLobby}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                      >
                        <Gamepad2 className="h-3.5 w-3.5" />
                        <span>Select Next Game</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {leaderboardTab === "podium" ? (
                <div className="mt-6 space-y-3">
                  {cumulativePodium.map((player, index) => (
                    <div
                      key={player.userId}
                      className={`flex items-center justify-between rounded-2xl border px-4 py-3.5 ${
                        index === 0
                          ? "border-amber-400/40 bg-amber-500/10"
                          : index === 1
                            ? "border-slate-600/50 bg-slate-800/40"
                            : index === 2
                              ? "border-amber-700/40 bg-amber-950/20"
                              : "border-slate-800 bg-slate-950/60"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-xl font-extrabold text-xs ${
                            index === 0
                              ? "bg-amber-400 text-slate-950"
                              : index === 1
                                ? "bg-slate-300 text-slate-950"
                                : index === 2
                                  ? "bg-amber-700 text-white"
                                  : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          #{index + 1}
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={player.avatarUrl}
                          alt={player.username}
                          className="h-10 w-10 rounded-xl bg-slate-800"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {player.username}
                            </span>
                            {player.userId === profile.id && (
                              <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                                You
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">
                            {player.roundsPlayed} round(s) completed • Raw sum:{" "}
                            {player.totalRawScore.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-extrabold text-amber-300">
                          {player.totalPartyPoints} pts
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-slate-500">
                          Normalized Party Points
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-6 space-y-2.5">
                  {scores.length === 0 ? (
                    <p className="rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center text-xs text-slate-500">
                      No round scores submitted yet. Launch a game and submit a
                      score!
                    </p>
                  ) : (
                    scores.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <Award className="h-4 w-4 text-indigo-400" />
                          <div>
                            <span className="font-bold text-white">
                              {s.profile?.username || "Player"}
                            </span>
                            <span className="ml-2 text-slate-400">
                              in{" "}
                              <strong className="text-slate-200">
                                {s.game?.title || "Game"}
                              </strong>{" "}
                              (Round #{s.round_number})
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-slate-300">
                            Raw Score:{" "}
                            <strong className="font-mono text-white">
                              {s.score_value}
                            </strong>
                          </span>
                          <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 font-bold text-amber-300">
                            +{s.party_points} Party Pts
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            /* VIEW 3: PARTY LOBBY & FILTERED GAME SELECTOR */
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Recommended Mini-Games for Your Party
                  </h2>
                  <p className="text-xs text-slate-400">
                    Filtered for{" "}
                    <strong className="text-indigo-300">
                      {party.target_players} players
                    </strong>{" "}
                    and{" "}
                    <strong className="text-indigo-300">
                      ≤{party.target_duration_mins} min
                    </strong>{" "}
                    session duration
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isHost && (
                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs">
                      <Filter className="h-3.5 w-3.5 text-indigo-400" />
                      <select
                        value={party.target_players}
                        onChange={(e) =>
                          handleUpdateCriteria(
                            Number(e.target.value),
                            party.target_duration_mins
                          )
                        }
                        className="bg-transparent font-semibold text-white focus:outline-none"
                      >
                        {[2, 4, 6, 8, 12, 16, 24].map((n) => (
                          <option key={n} value={n} className="bg-slate-900">
                            {n} Players
                          </option>
                        ))}
                      </select>
                      <span className="text-slate-600">•</span>
                      <select
                        value={party.target_duration_mins}
                        onChange={(e) =>
                          handleUpdateCriteria(
                            party.target_players,
                            Number(e.target.value)
                          )
                        }
                        className="bg-transparent font-semibold text-white focus:outline-none"
                      >
                        {[10, 15, 20, 30, 45, 60].map((m) => (
                          <option key={m} value={m} className="bg-slate-900">
                            {m} Mins
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowAllGames((v) => !v)}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    {showAllGames
                      ? "Apply Party Filter"
                      : `Show All (${games.length})`}
                  </button>
                </div>
              </div>

              {games.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/25 p-8 text-center shadow-xl">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                    <AlertTriangle className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-white">
                    No Unity Games Loaded in Catalog
                  </h3>
                  <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-300">
                    There are currently no games registered on this server. To start testing, upload a Unity WebGL <code className="text-indigo-300 font-mono">.zip</code> build via the Admin CMS, or build directly from Unity using <code className="text-indigo-300 font-mono">TailoredPlay &gt; Build &amp; Deploy Direct to Local Web</code>.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    <Link
                      href="/admin"
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 transition"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Upload / Register Game in Admin CMS</span>
                    </Link>
                  </div>
                </div>
              ) : filteredGames.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center">
                  <p className="text-sm font-semibold text-white">
                    No games match the strict filter ({party.target_players}p /{" "}
                    {party.target_duration_mins}m).
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAllGames(true)}
                    className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                  >
                    Show All Available Games
                  </button>
                </div>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 transition hover:border-indigo-500/50"
                    >
                      <div>
                        <div className="relative h-40 w-full bg-slate-900">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={game.thumbnail_url}
                            alt={game.title}
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute left-3 top-3 flex gap-1.5">
                            <span className="rounded-lg bg-slate-950/90 px-2.5 py-1 text-[10px] font-bold uppercase text-indigo-300">
                              {game.sync_type === "multiplayer_ngo"
                                ? "Multiplayer NGO"
                                : "Synced Solo"}
                            </span>
                            {game.ads_mode === "force_off" && (
                              <span className="rounded-lg bg-emerald-950/90 px-2 py-1 text-[10px] font-bold text-emerald-300">
                                Ad-Free
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-4">
                          <h3 className="text-base font-bold text-white">
                            {game.title}
                          </h3>
                          <p className="mt-1 text-xs leading-relaxed text-slate-400">
                            {game.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-800/80 px-4 py-3">
                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5 text-indigo-400" />
                            {game.min_players}–{game.max_players}p
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-indigo-400" />~
                            {game.ideal_duration_mins}m
                          </span>
                        </div>

                        {isHost ? (
                          members.length >= Math.max(game.min_players, 2) ? (
                            <button
                              type="button"
                              onClick={() => handleLaunchGame(game)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
                            >
                              <Play className="h-3.5 w-3.5" />
                              <span>Launch for Party</span>
                            </button>
                          ) : isDebug ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleLaunchGame(game)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500"
                                title="Debug bypass: launch solo without minimum 2 players"
                              >
                                <Play className="h-3.5 w-3.5 fill-current" />
                                <span>⚡ Launch Solo (Debug)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  window.open(
                                    window.location.origin + `/party/${party.invite_code}`,
                                    "_blank",
                                    "width=1100,height=700"
                                  );
                                }}
                                className="inline-flex items-center gap-1 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-500/25"
                                title="Open guest tab to fulfill 2-player requirement"
                              >
                                <Users className="h-3.5 w-3.5" />
                                <span>+ Guest Tab</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                disabled
                                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed opacity-80"
                              >
                                <Users className="h-3.5 w-3.5 text-amber-400" />
                                <span>Requires 2+ Players ({members.length}/2 joined)</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleCopyInviteLink}
                                className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                              >
                                {copiedLink ? "✓ Invite link copied!" : "+ Copy invite link to join"}
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-[11px] font-medium text-slate-500">
                            Waiting for Host to launch...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Live Party Roster + Collapsible Text Chat Drawer */}
        <div className="flex w-full flex-col gap-4 lg:w-auto">
          {/* Party Roster Card */}
          <div className="w-full rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 lg:w-80">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-200">
                <Users className="h-4 w-4 text-indigo-400" />
                Party Roster ({members.length}/{party.target_players})
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Realtime Sync
              </span>
            </div>

            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
              {members.map((m) => {
                const name = m.profile?.username || "Guest";
                const avatar =
                  m.profile?.avatar_url ||
                  `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${m.user_id}`;
                return (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatar}
                        alt={name}
                        className="h-7 w-7 rounded-lg bg-slate-800"
                      />
                      <span className="truncate font-semibold text-slate-200">
                        {name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {m.role === "host" && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                          <Crown className="h-3 w-3" />
                          Host
                        </span>
                      )}
                      {m.user_id === profile.id && (
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                          You
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Collapsible Party Text Chat Drawer */}
          <PartyChatDrawer
            messages={messages}
            currentUser={profile}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>

      {/* Host Upgrade Modal */}
      <HostUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        hostProfile={hostProfile || profile}
        partyId={party.id}
        monetization={monetization}
        onEntitlementGranted={async () => {
          await refreshState();
          await loadPartyData();
        }}
      />
    </div>
  );
}
