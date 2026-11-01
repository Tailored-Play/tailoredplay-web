"use client";

import React, { useCallback, useEffect, useState } from "react";
import JSZip from "jszip";
import Link from "next/link";
import { useAuth } from "@/providers/AuthProvider";
import {
  deleteGame,
  getAllParties,
  getAllProfiles,
  getEntitlementLogs,
  getGames,
  grantHostEntitlement,
  revokeHostEntitlement,
  subscribeToPlatformEvents,
  updateMonetizationSettings,
  updatePartyState,
  upsertGame,
} from "@/lib/store/platform-store";
import {
  AdsMode,
  EntitlementLog,
  Game,
  GameSyncType,
  Party,
  Profile,
} from "@/types/database";
import {
  CheckCircle2,
  CloudUpload,
  Crown,
  Edit3,
  ExternalLink,
  FileArchive,
  Gamepad2,
  Lock,
  Plus,
  Settings,
  ShieldCheck,
  Sliders,
  Trash2,
  Users,
} from "lucide-react";

interface ExtractedBuildFile {
  originalPath: string;
  targetFileName: string;
  sizeBytes: number;
  contentType: string;
  contentEncoding?: string;
  status: "pending" | "uploading" | "done" | "error";
  blob: Blob;
}

function classifyUnityZipEntry(entryName: string): {
  targetFileName: string;
  contentType: string;
  contentEncoding?: string;
} | null {
  const lower = entryName.toLowerCase();
  if (lower.endsWith(".loader.js")) {
    return {
      targetFileName: "Build.loader.js",
      contentType: "application/javascript",
    };
  }
  if (lower.endsWith(".framework.js.br")) {
    return {
      targetFileName: "Build.framework.js.br",
      contentType: "application/javascript",
      contentEncoding: "br",
    };
  }
  if (lower.endsWith(".wasm.br")) {
    return {
      targetFileName: "Build.wasm.br",
      contentType: "application/wasm",
      contentEncoding: "br",
    };
  }
  if (lower.endsWith(".data.br")) {
    return {
      targetFileName: "Build.data.br",
      contentType: "application/octet-stream",
      contentEncoding: "br",
    };
  }
  if (lower.endsWith(".framework.js.gz")) {
    return {
      targetFileName: "Build.framework.js.gz",
      contentType: "application/javascript",
      contentEncoding: "gzip",
    };
  }
  if (lower.endsWith(".wasm.gz")) {
    return {
      targetFileName: "Build.wasm.gz",
      contentType: "application/wasm",
      contentEncoding: "gzip",
    };
  }
  if (lower.endsWith(".data.gz")) {
    return {
      targetFileName: "Build.data.gz",
      contentType: "application/octet-stream",
      contentEncoding: "gzip",
    };
  }
  if (lower.endsWith(".framework.js")) {
    return {
      targetFileName: "Build.framework.js",
      contentType: "application/javascript",
    };
  }
  if (lower.endsWith(".wasm")) {
    return {
      targetFileName: "Build.wasm",
      contentType: "application/wasm",
    };
  }
  if (lower.endsWith(".data")) {
    return {
      targetFileName: "Build.data",
      contentType: "application/octet-stream",
    };
  }
  return null;
}

export default function AdminDashboardPage() {
  const { profile, monetization, refreshState, toggleAdminRole } = useAuth();

  const [activeTab, setActiveTab] = useState<
    "games" | "monetization" | "entitlements"
  >("games");

  const [games, setGames] = useState<Game[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [entitlementLogs, setEntitlementLogs] = useState<EntitlementLog[]>([]);

  // Game Form State
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [idealDurationMins, setIdealDurationMins] = useState(15);
  const [syncType, setSyncType] = useState<GameSyncType>("multiplayer_ngo");
  const [adsMode, setAdsMode] = useState<AdsMode>("inherit");
  const [isPublished, setIsPublished] = useState(true);
  const [r2BaseUrl, setR2BaseUrl] = useState("");

  // Zip Uploader State
  const [extractedFiles, setExtractedFiles] = useState<ExtractedBuildFile[]>(
    []
  );
  const [isUploadingZip, setIsUploadingZip] = useState(false);
  const [uploadBanner, setUploadBanner] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    const [g, u, p, logs] = await Promise.all([
      getGames(true),
      getAllProfiles(),
      getAllParties(),
      getEntitlementLogs(),
    ]);
    setGames(g);
    setProfiles(u);
    setParties(p);
    setEntitlementLogs(logs);
  }, []);

  useEffect(() => {
    loadAdminData();
    const unsub = subscribeToPlatformEvents(() => {
      loadAdminData();
    });
    return unsub;
  }, [loadAdminData]);

  // Auto-slugify title when creating a new game
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!editingGameId) {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setSlug(generatedSlug);
      setR2BaseUrl(`/builds/${generatedSlug}`);
    }
  };

  const handleSelectGameForEdit = (game: Game) => {
    setEditingGameId(game.id);
    setTitle(game.title);
    setSlug(game.slug);
    setDescription(game.description);
    setThumbnailUrl(game.thumbnail_url);
    setMinPlayers(game.min_players);
    setMaxPlayers(game.max_players);
    setIdealDurationMins(game.ideal_duration_mins);
    setSyncType(game.sync_type);
    setAdsMode(game.ads_mode);
    setIsPublished(game.is_published);
    setR2BaseUrl(game.r2_base_url);
    setExtractedFiles([]);
    setUploadBanner(null);
  };

  const resetGameForm = () => {
    setEditingGameId(null);
    setTitle("");
    setSlug("");
    setDescription("");
    setThumbnailUrl("");
    setMinPlayers(2);
    setMaxPlayers(16);
    setIdealDurationMins(15);
    setSyncType("multiplayer_ngo");
    setAdsMode("inherit");
    setIsPublished(true);
    setR2BaseUrl("");
    setExtractedFiles([]);
  };

  // Client-side JSZip inspection (bypasses Vercel's 4.5MB limit!)
  const handleZipFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadBanner("Inspecting Unity WebGL .zip archive in browser...");
    try {
      const zip = await JSZip.loadAsync(file);
      const discovered: ExtractedBuildFile[] = [];

      const entries = Object.values(zip.files).filter((f) => !f.dir);
      for (const entry of entries) {
        const classification = classifyUnityZipEntry(entry.name);
        if (classification) {
          const blob = await entry.async("blob");
          discovered.push({
            originalPath: entry.name,
            targetFileName: classification.targetFileName,
            sizeBytes: blob.size,
            contentType: classification.contentType,
            contentEncoding: classification.contentEncoding,
            status: "pending",
            blob,
          });
        }
      }

      setExtractedFiles(discovered);
      if (discovered.length === 0) {
        setUploadBanner(
          "No Unity WebGL build artifacts (.loader.js, .wasm.br, .data.br, .framework.js.br) found in this .zip."
        );
      } else {
        setUploadBanner(
          `Extracted ${discovered.length} Unity WebGL build files in-memory. Click "Save Game & Upload Build" to push with Brotli headers.`
        );
      }
    } catch (err) {
      console.error("[Admin] JSZip error:", err);
      setUploadBanner("Failed to read .zip file.");
    }
  };

  const handleSaveGameAndUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;

    setIsUploadingZip(true);
    let finalBaseUrl = r2BaseUrl.trim() || `/builds/${slug.trim()}`;

    try {
      // Upload any extracted Unity WebGL files via Presigned R2 URLs (or local dev fallback)
      if (extractedFiles.length > 0) {
        for (let i = 0; i < extractedFiles.length; i++) {
          const item = extractedFiles[i];
          setExtractedFiles((prev) =>
            prev.map((f, idx) =>
              idx === i ? { ...f, status: "uploading" } : f
            )
          );

          const presignRes = await fetch("/api/admin/r2-presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug: slug.trim(),
              fileName: item.targetFileName,
            }),
          });
          const presignData = await presignRes.json();

          if (presignData.mode === "r2_presigned" && presignData.uploadUrl) {
            const putHeaders: Record<string, string> = {
              "Content-Type": item.contentType,
            };
            if (item.contentEncoding) {
              putHeaders["Content-Encoding"] = item.contentEncoding;
            }

            const putRes = await fetch(presignData.uploadUrl, {
              method: "PUT",
              headers: putHeaders,
              body: item.blob,
            });

            if (!putRes.ok) {
              throw new Error(`R2 PUT failed for ${item.targetFileName}`);
            }
            finalBaseUrl = presignData.r2BaseUrl;
          } else {
            // Local fallback to public/builds/[slug]/[targetFileName]
            const formData = new FormData();
            formData.append("slug", slug.trim());
            formData.append("fileName", item.targetFileName);
            formData.append(
              "file",
              new File([item.blob], item.targetFileName, {
                type: item.contentType,
              })
            );
            const localRes = await fetch("/api/admin/local-upload", {
              method: "POST",
              body: formData,
            });
            const localData = await localRes.json();
            if (localData.r2BaseUrl) {
              finalBaseUrl = localData.r2BaseUrl;
            }
          }

          setExtractedFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f))
          );
        }
      }

      await upsertGame({
        id: editingGameId || undefined,
        title: title.trim(),
        slug: slug.trim(),
        description: description.trim(),
        thumbnail_url: thumbnailUrl.trim(),
        min_players: minPlayers,
        max_players: maxPlayers,
        ideal_duration_mins: idealDurationMins,
        sync_type: syncType,
        ads_mode: adsMode,
        is_published: isPublished,
        r2_base_url: finalBaseUrl,
        build_file_prefix: "Build",
      });

      await loadAdminData();
      setUploadBanner(
        `Game "${title}" saved! Build Base URL: ${finalBaseUrl}`
      );
      if (!editingGameId) {
        resetGameForm();
      }
    } catch (err) {
      console.error("[Admin] Upload/Save failed:", err);
      setUploadBanner("Error uploading WebGL build files. Check console.");
    } finally {
      setIsUploadingZip(false);
    }
  };

  if (profile && profile.role !== "admin") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400">
          <Lock className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">
          Admin Role Required (`profiles.role === &apos;admin&apos;`)
        </h1>
        <p className="mt-2 text-xs text-slate-400">
          Your current profile (<strong>{profile.username}</strong>) has role{" "}
          <code>{profile.role}</code>.
        </p>
        <button
          type="button"
          onClick={toggleAdminRole}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-indigo-500"
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Promote Current Session to Admin (Dev Helper)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-0.5 text-xs font-bold text-violet-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>TailoredPlay Admin CMS</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold text-white sm:text-3xl">
            Game Catalog, R2 Uploader & Monetization Control
          </h1>
        </div>

        {/* Navigation Tabs */}
        <div className="flex rounded-2xl border border-slate-800 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("games")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "games"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Gamepad2 className="h-4 w-4" />
            <span>Games & .zip R2 Uploader ({games.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("monetization")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "monetization"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Dynamic Monetization & Ads</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("entitlements")}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === "entitlements"
                ? "bg-indigo-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Crown className="h-4 w-4" />
            <span>Host Passes & Active Parties</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: GAMES CATALOG & AUTOMATED .ZIP CLOUDFLARE R2 UPLOADER
         ===================================================================== */}
      {activeTab === "games" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Left 5 Cols: Add / Edit Game + Client-Side JSZip R2 Uploader */}
          <form
            onSubmit={handleSaveGameAndUpload}
            className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 lg:col-span-5"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white">
                {editingGameId ? "Edit Game & Build" : "Upload New Unity Game"}
              </h2>
              {editingGameId && (
                <button
                  type="button"
                  onClick={resetGameForm}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>New Game</span>
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400">
                  Game Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="e.g. Synergy Sprint Trivia"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400">
                  Unique Slug
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="synergy-sprint-trivia"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe gameplay, networking style, and ideal team size..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400">
                  Min Players
                </label>
                <input
                  type="number"
                  min={1}
                  value={minPlayers}
                  onChange={(e) => setMinPlayers(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400">
                  Max Players
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400">
                  Ideal Mins
                </label>
                <input
                  type="number"
                  min={1}
                  value={idealDurationMins}
                  onChange={(e) => setIdealDurationMins(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400">
                  Networking Sync Type
                </label>
                <select
                  value={syncType}
                  onChange={(e) => setSyncType(e.target.value as GameSyncType)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="multiplayer_ngo">
                    Multiplayer (Unity NGO / Relay)
                  </option>
                  <option value="synced_singleplayer">
                    Synced Single-Player
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400">
                  Game Ad Policy (`ads_mode`)
                </label>
                <select
                  value={adsMode}
                  onChange={(e) => setAdsMode(e.target.value as AdsMode)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  <option value="inherit">
                    Inherit (Follows Host Entitlement)
                  </option>
                  <option value="force_off">
                    Force Off (Ad-Free / Sponsored Game)
                  </option>
                  <option value="force_on">Force On (Always Show Ads)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400">
                Thumbnail Image URL
              </label>
              <input
                type="url"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
              />
            </div>

            {/* Unity WebGL .zip Client-Side Extractor & R2 Presigned Uploader */}
            <div className="rounded-2xl border border-dashed border-indigo-500/40 bg-indigo-950/15 p-4">
              <div className="flex items-center gap-2 text-indigo-300">
                <FileArchive className="h-4 w-4" />
                <span className="text-xs font-bold">
                  Unity WebGL `.zip` Build Uploader (Client JSZip + Presigned
                  R2)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Unzips in browser to bypass Vercel&apos;s 4.5MB limit and sets{" "}
                <code>Content-Encoding: br</code> on <code>.wasm.br</code>,{" "}
                <code>.js.br</code>, and <code>.data.br</code>.
              </p>

              <input
                type="file"
                accept=".zip"
                onChange={handleZipFileSelected}
                className="mt-3 block w-full text-xs text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-3.5 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-indigo-500"
              />

              {extractedFiles.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {extractedFiles.map((f) => (
                    <div
                      key={f.targetFileName}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-[11px]"
                    >
                      <div>
                        <span className="font-mono font-bold text-white">
                          {f.targetFileName}
                        </span>
                        <span className="ml-2 text-slate-500">
                          ({(f.sizeBytes / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {f.contentEncoding && (
                          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] text-indigo-300">
                            br
                          </span>
                        )}
                        <span className="text-[10px] font-bold uppercase text-emerald-400">
                          {f.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {uploadBanner && (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs text-indigo-200">
                {uploadBanner}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-indigo-600"
                />
                <span>Published in Party Lobby</span>
              </label>

              <button
                type="submit"
                disabled={isUploadingZip}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
              >
                <CloudUpload className="h-4 w-4" />
                <span>
                  {isUploadingZip
                    ? "Uploading .br Assets..."
                    : editingGameId
                      ? "Update Game"
                      : "Save Game & Upload Build"}
                </span>
              </button>
            </div>
          </form>

          {/* Right 7 Cols: Existing Games Catalog Table */}
          <div className="space-y-3 lg:col-span-7">
            {games.length === 0 ? (
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
                  <Gamepad2 className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-white">
                  No Games in Catalog Yet
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                  Fill out the form on the left to register your game and upload its WebGL .zip archive, or build from Unity using the Editor menu.
                </p>
              </div>
            ) : (
              games.map((game) => (
              <div
                key={game.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4"
              >
                <div className="flex items-center gap-3.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={game.thumbnail_url}
                    alt={game.title}
                    className="h-14 w-20 rounded-xl bg-slate-950 object-cover"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white">
                        {game.title}
                      </h3>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          game.is_published
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {game.is_published ? "Published" : "Draft"}
                      </span>
                      <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
                        {game.sync_type}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {game.min_players}–{game.max_players} players • Ideal:{" "}
                      {game.ideal_duration_mins}m • Build:{" "}
                      <code className="text-slate-300">{game.r2_base_url}</code>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quick per-game Ads Mode selector */}
                  <select
                    value={game.ads_mode}
                    onChange={async (e) => {
                      await upsertGame({
                        ...game,
                        ads_mode: e.target.value as AdsMode,
                      });
                      await loadAdminData();
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-amber-300"
                    title="Per-Game Ad Override"
                  >
                    <option value="inherit">Ads: Inherit</option>
                    <option value="force_off">Ads: Force Off</option>
                    <option value="force_on">Ads: Force On</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleSelectGameForEdit(game)}
                    className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white"
                    title="Edit Game"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await deleteGame(game.id);
                      await loadAdminData();
                    }}
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 hover:bg-rose-500/20"
                    title="Delete Game"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )))}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: DYNAMIC MONETIZATION & AD SYSTEM CONTROLS
         ===================================================================== */}
      {activeTab === "monetization" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Global Ad Placement Switches */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <Settings className="h-4 w-4 text-indigo-400" />
              <span>Global Ad Placements & Master Switch</span>
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Enable or disable ads across the entire platform or specific
              placements at system will without redeploying code.
            </p>

            <div className="mt-5 space-y-3">
              {[
                {
                  key: "ads_enabled_globally" as const,
                  label: "Global Ads Master Switch",
                  desc: "When turned off, all parties and games run 100% ad-free globally.",
                },
                {
                  key: "enable_web_banners" as const,
                  label: "Webpage Display Banners",
                  desc: "Show top display banners on the landing page and party lobby.",
                },
                {
                  key: "enable_preroll_ads" as const,
                  label: "Pre-Roll Game Launch Ads",
                  desc: "Run an ad break when a party first launches a Unity game.",
                },
                {
                  key: "enable_midgame_ads" as const,
                  label: "Mid-Game Commercial Breaks (`RequestCommercialBreak`)",
                  desc: "Respond to Unity C# `RequestCommercialBreak()` calls with an ad overlay.",
                },
                {
                  key: "enable_rewarded_ads" as const,
                  label: "Opt-In Rewarded Ads (`RequestRewardedAd`)",
                  desc: "Allow Unity games to present voluntary rewarded ads for bonus points/hints.",
                },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex cursor-pointer items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 p-4"
                >
                  <div className="pr-4">
                    <div className="text-xs font-bold text-white">
                      {item.label}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {item.desc}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(monetization[item.key])}
                    onChange={async (e) => {
                      await updateMonetizationSettings({
                        [item.key]: e.target.checked,
                      });
                      await refreshState();
                    }}
                    className="h-5 w-5 rounded accent-indigo-600"
                  />
                </label>
              ))}

              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <label className="block text-xs font-bold text-white">
                  Mid-Game Ad Cooldown (Seconds)
                </label>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Minimum real-time seconds between commercial breaks to avoid audience fatigue.
                </p>
                <input
                  type="number"
                  min={0}
                  value={monetization.midgame_ad_cooldown_seconds ?? 120}
                  onChange={async (e) => {
                    await updateMonetizationSettings({
                      midgame_ad_cooldown_seconds: Number(e.target.value),
                    });
                    await refreshState();
                  }}
                  className="mt-2 w-32 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* One-Time vs Periodical Host Payment Plans */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <Crown className="h-4 w-4 text-amber-400" />
              <span>One-Time vs. Periodical Host Payment Models</span>
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Toggle which checkout options are offered to Party Hosts (one-time
              24h event pass, recurring monthly subscription, or one-time
              lifetime unlock).
            </p>

            <div className="mt-5 space-y-4">
              {/* Plan 1: 24h Party Pass */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white">
                      1. 24-Hour Party Pass (One-Time Event Payment)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={monetization.plan_party_pass_enabled}
                    onChange={async (e) => {
                      await updateMonetizationSettings({
                        plan_party_pass_enabled: e.target.checked,
                      });
                      await refreshState();
                    }}
                    className="h-4 w-4 accent-amber-400"
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400">
                      USD Price (Lemon Squeezy)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={monetization.party_pass_price_usd}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          party_pass_price_usd: Number(e.target.value),
                        });
                        await refreshState();
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400">
                      ARS Price (Mercado Pago)
                    </label>
                    <input
                      type="number"
                      value={monetization.party_pass_price_ars}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          party_pass_price_ars: Number(e.target.value),
                        });
                        await refreshState();
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
                <div className="mt-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={monetization.plan_party_pass_grants_rewarded_free}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          plan_party_pass_grants_rewarded_free: e.target.checked,
                        });
                        await refreshState();
                      }}
                      className="h-3.5 w-3.5 rounded accent-amber-400"
                    />
                    <span>Include Instant Rewarded Ad VIP Bypass (`isRewardedAdFree`)</span>
                  </label>
                </div>
              </div>

              {/* Plan 2: Pro Monthly */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white">
                      2. Corporate Host Pro (Periodical Monthly Subscription)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={monetization.plan_pro_monthly_enabled}
                    onChange={async (e) => {
                      await updateMonetizationSettings({
                        plan_pro_monthly_enabled: e.target.checked,
                      });
                      await refreshState();
                    }}
                    className="h-4 w-4 accent-amber-400"
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400">
                      USD / Month
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={monetization.pro_monthly_price_usd}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          pro_monthly_price_usd: Number(e.target.value),
                        });
                        await refreshState();
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400">
                      ARS / Month
                    </label>
                    <input
                      type="number"
                      value={monetization.pro_monthly_price_ars}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          pro_monthly_price_ars: Number(e.target.value),
                        });
                        await refreshState();
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
                <div className="mt-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={monetization.plan_pro_monthly_grants_rewarded_free}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          plan_pro_monthly_grants_rewarded_free: e.target.checked,
                        });
                        await refreshState();
                      }}
                      className="h-3.5 w-3.5 rounded accent-amber-400"
                    />
                    <span>Include Instant Rewarded Ad VIP Bypass (`isRewardedAdFree`)</span>
                  </label>
                </div>
              </div>

              {/* Plan 3: Lifetime Unlock */}
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white">
                      3. Lifetime Host Unlock (One-Time Permanent)
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={monetization.plan_lifetime_enabled}
                    onChange={async (e) => {
                      await updateMonetizationSettings({
                        plan_lifetime_enabled: e.target.checked,
                      });
                      await refreshState();
                    }}
                    className="h-4 w-4 accent-amber-400"
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400">
                      USD Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={monetization.lifetime_price_usd}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          lifetime_price_usd: Number(e.target.value),
                        });
                        await refreshState();
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400">
                      ARS Price
                    </label>
                    <input
                      type="number"
                      value={monetization.lifetime_price_ars}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          lifetime_price_ars: Number(e.target.value),
                        });
                        await refreshState();
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                </div>
                <div className="mt-2.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={monetization.plan_lifetime_grants_rewarded_free}
                      onChange={async (e) => {
                        await updateMonetizationSettings({
                          plan_lifetime_grants_rewarded_free: e.target.checked,
                        });
                        await refreshState();
                      }}
                      className="h-3.5 w-3.5 rounded accent-amber-400"
                    />
                    <span>Include Instant Rewarded Ad VIP Bypass (`isRewardedAdFree`)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: HOST ENTITLEMENTS & ACTIVE PARTIES MANAGER
         ===================================================================== */}
      {activeTab === "entitlements" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          {/* Users & 1-Click Host Entitlement Grants */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 lg:col-span-7">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <Users className="h-4 w-4 text-indigo-400" />
              <span>Users & 1-Click Host Ad-Free Grants ({profiles.length})</span>
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Manually grant or revoke 24h Party Pass, Monthly Pro, or Lifetime
              Ad-Free Host status.
            </p>

            <div className="mt-4 space-y-2.5">
              {profiles.map((u) => {
                const isAdFree =
                  u.ad_free_until &&
                  new Date(u.ad_free_until).getTime() > Date.now();

                return (
                  <div
                    key={u.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={u.avatar_url}
                        alt={u.username}
                        className="h-8 w-8 rounded-lg bg-slate-800"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">
                            {u.username}
                          </span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                            {u.is_anonymous ? "Anon Guest" : u.email || "Linked"}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {isAdFree ? (
                            <span className="font-semibold text-emerald-400">
                              Ad-Free until{" "}
                              {new Date(u.ad_free_until!).toLocaleDateString()}
                            </span>
                          ) : (
                            "Standard Free Tier"
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await grantHostEntitlement({
                            userId: u.id,
                            planType: "party_pass_24h",
                          });
                          await loadAdminData();
                          await refreshState();
                        }}
                        className="rounded-lg border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25"
                      >
                        +24h Pass
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await grantHostEntitlement({
                            userId: u.id,
                            planType: "pro_monthly",
                          });
                          await loadAdminData();
                          await refreshState();
                        }}
                        className="rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-bold text-indigo-300 hover:bg-indigo-500/25"
                      >
                        +30d Pro
                      </button>
                      {isAdFree && (
                        <button
                          type="button"
                          onClick={async () => {
                            await revokeHostEntitlement(u.id);
                            await loadAdminData();
                            await refreshState();
                          }}
                          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Parties & Per-Party Ad-Free Override */}
          <div className="space-y-6 lg:col-span-5">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
              <h2 className="text-base font-bold text-white">
                Active Party Rooms ({parties.length})
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                1-click override to disable ads for any specific corporate party
                room.
              </p>

              <div className="mt-4 space-y-2.5">
                {parties.length === 0 ? (
                  <p className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-center text-xs text-slate-500">
                    No parties created yet.
                  </p>
                ) : (
                  parties.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-extrabold text-white">
                            {p.invite_code}
                          </span>
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                            {p.status}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {p.target_players}p • {p.target_duration_mins}m
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await updatePartyState(p.id, {
                              ad_free_override: !p.ad_free_override,
                            });
                            await loadAdminData();
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                            p.ad_free_override
                              ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                              : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
                          }`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          <span>
                            {p.ad_free_override
                              ? "Ad-Free ON"
                              : "Ad-Free OFF"}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={async () => {
                            await updatePartyState(p.id, {
                              rewarded_ad_free_override: !p.rewarded_ad_free_override,
                            });
                            await loadAdminData();
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                            p.rewarded_ad_free_override
                              ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                              : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
                          }`}
                          title="Instant VIP Rewarded Ads Bypass"
                        >
                          <Crown className="h-3 w-3" />
                          <span>
                            {p.rewarded_ad_free_override
                              ? "Rewarded VIP ON"
                              : "Rewarded VIP OFF"}
                          </span>
                        </button>

                        <Link
                          href={`/party/${p.invite_code}`}
                          className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white"
                          title="Open Party Room"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Entitlement Audit Logs */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
              <h2 className="text-sm font-bold text-white">
                Recent Entitlement Audit Logs ({entitlementLogs.length})
              </h2>
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs">
                {entitlementLogs.length === 0 ? (
                  <p className="text-slate-500">No entitlement logs yet.</p>
                ) : (
                  entitlementLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                    >
                      <div>
                        <span className="font-bold text-amber-300">
                          {log.plan_type}
                        </span>
                        <span className="ml-2 text-[10px] uppercase text-slate-400">
                          via {log.provider}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Until {new Date(log.granted_until).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
