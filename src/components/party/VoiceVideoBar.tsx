"use client";

import React, { useState } from "react";
import { Party, PartyMember } from "@/types/database";
import {
  ExternalLink,
  Mic,
  MicOff,
  PhoneCall,
  Settings2,
  Video,
  VideoOff,
} from "lucide-react";

interface VoiceVideoBarProps {
  party: Party;
  members: PartyMember[];
  isHost: boolean;
  onUpdateVoiceConfig: (updates: {
    voice_provider_type: Party["voice_provider_type"];
    voice_room_url: string | null;
  }) => Promise<void>;
}

export function VoiceVideoBar({
  party,
  members,
  isHost,
  onUpdateVoiceConfig,
}: VoiceVideoBarProps) {
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [providerType, setProviderType] = useState<Party["voice_provider_type"]>(
    party.voice_provider_type || "external_link"
  );
  const [roomUrl, setRoomUrl] = useState(party.voice_room_url || "");

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateVoiceConfig({
      voice_provider_type: providerType,
      voice_room_url: roomUrl.trim() || null,
    });
    setIsEditingConfig(false);
  };

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
            <PhoneCall className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">
                Voice & Camera Channel
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                {party.voice_provider_type === "external_link"
                  ? "Meeting Bridge"
                  : party.voice_provider_type}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {party.voice_room_url
                ? "External meeting room linked for this party"
                : "Pluggable voice/camera bar (LiveKit / Daily / External Link)"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {party.voice_room_url && (
            <a
              href={party.voice_room_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Join Call (Zoom/Meet)</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => setMicEnabled((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
              micEnabled
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
                : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
            }`}
            title="Toggle Microphone (Plugin Adapter)"
          >
            {micEnabled ? (
              <Mic className="h-3.5 w-3.5" />
            ) : (
              <MicOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {micEnabled ? "Mic On" : "Muted"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCamEnabled((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
              camEnabled
                ? "border-indigo-500/40 bg-indigo-500/20 text-indigo-300"
                : "border-slate-700 bg-slate-800 text-slate-400 hover:text-white"
            }`}
            title="Toggle Camera (Plugin Adapter)"
          >
            {camEnabled ? (
              <Video className="h-3.5 w-3.5" />
            ) : (
              <VideoOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {camEnabled ? "Cam On" : "Cam Off"}
            </span>
          </button>

          {isHost && (
            <button
              type="button"
              onClick={() => setIsEditingConfig((v) => !v)}
              className="rounded-xl border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:border-indigo-500 hover:text-white"
              title="Configure Party Voice/Video Plugin or Meeting Link"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active Camera Preview Strip when Cam is toggled on */}
      {camEnabled && (
        <div className="mt-3 flex gap-2 overflow-x-auto pt-1">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="relative flex h-16 w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-indigo-500/30 bg-slate-950 p-1.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  m.profile?.avatar_url ||
                  `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${m.user_id}`
                }
                alt={m.profile?.username || "Player"}
                className="h-7 w-7 rounded-full"
              />
              <span className="mt-1 max-w-full truncate text-[10px] font-medium text-slate-300">
                {m.profile?.username || "Guest"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Host Voice Provider Configurator */}
      {isHost && isEditingConfig && (
        <form
          onSubmit={handleSaveConfig}
          className="mt-3 grid gap-2.5 border-t border-slate-800 pt-3 sm:grid-cols-3"
        >
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400">
              Voice Plugin Adapter
            </label>
            <select
              value={providerType}
              onChange={(e) =>
                setProviderType(e.target.value as Party["voice_provider_type"])
              }
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="external_link">
                External Link (Zoom / Meet / Teams)
              </option>
              <option value="livekit">LiveKit WebRTC Plugin (Ready)</option>
              <option value="daily">Daily.co Video SDK (Ready)</option>
              <option value="none">Disabled</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-semibold uppercase text-slate-400">
              Meeting Link or Room Endpoint
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="url"
                value={roomUrl}
                onChange={(e) => setRoomUrl(e.target.value)}
                placeholder="https://meet.google.com/... or https://zoom.us/j/..."
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
