"use client";

import React, { useEffect, useState } from "react";
import { Crown, Megaphone, Play, ShieldCheck, Sparkles, VolumeX } from "lucide-react";

declare global {
  interface Window {
    adBreak?: (config: {
      type: string;
      name: string;
      beforeAd?: () => void;
      afterAd?: () => void;
      adBreakDone?: (placementInfo: unknown) => void;
    }) => void;
  }
}

interface WebBannerAdSlotProps {
  isAdFree: boolean;
  enableWebBanners: boolean;
  isHost: boolean;
  onOpenUpgradeModal: () => void;
}

export function WebBannerAdSlot({
  isAdFree,
  enableWebBanners,
  isHost,
  onOpenUpgradeModal,
}: WebBannerAdSlotProps) {
  if (isAdFree || !enableWebBanners) {
    return null;
  }

  return (
    <div className="mx-auto my-3 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/90 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 px-4 py-2.5 text-xs">
      <div className="flex items-center gap-2.5">
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Sponsored Banner
        </span>
        <span className="text-slate-300">
          Running a large corporate All-Hands or Team Building session? Keep
          focus sharp with zero commercial interruptions.
        </span>
      </div>

      {isHost ? (
        <button
          type="button"
          onClick={onOpenUpgradeModal}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25"
        >
          <Crown className="h-3.5 w-3.5 text-amber-400" />
          <span>Host: Disable Ads for Whole Party</span>
        </button>
      ) : (
        <span className="text-[11px] text-slate-400">
          Ask your Party Host to unlock Ad-Free mode
        </span>
      )}
    </div>
  );
}

interface AdOverlayControllerProps {
  isOpen: boolean;
  placement: string;
  isAdFree: boolean;
  isRewardedAdFree?: boolean;
  adKind?: "commercial" | "rewarded";
  isHost: boolean;
  durationSeconds?: number;
  onAdCompleted: () => void;
  onAdDismissedEarly?: () => void;
  onOpenHostUpgrade: () => void;
}

/**
 * Wraps the Unity WebGL canvas to display Google AdSense H5 Games Ads (`adBreak`)
 * or fall back to an internal 15-second House Ad / Host Upgrade countdown overlay.
 * Supports both commercial breaks (ResumeFromAd) and opt-in rewarded ads (CompleteRewardedAd).
 */
export function AdOverlayController({
  isOpen,
  placement,
  isAdFree,
  isRewardedAdFree = false,
  adKind = "commercial",
  isHost,
  durationSeconds = 15,
  onAdCompleted,
  onAdDismissedEarly,
  onOpenHostUpgrade,
}: AdOverlayControllerProps) {
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [usingHouseFallback, setUsingHouseFallback] = useState(false);

  const isExempt = adKind === "rewarded" ? isRewardedAdFree : isAdFree;

  // Immediately resume/reward if party becomes Ad-Free while overlay is open
  useEffect(() => {
    if (isOpen && isExempt) {
      onAdCompleted();
    }
  }, [isOpen, isExempt, onAdCompleted]);

  useEffect(() => {
    if (!isOpen || isExempt) return;

    setSecondsLeft(durationSeconds);

    // Attempt Google H5 Games Ads API (`window.adBreak`) first if present
    if (typeof window !== "undefined" && typeof window.adBreak === "function") {
      try {
        if (adKind === "rewarded") {
          window.adBreak({
            type: "reward",
            name: placement || "rewarded_bonus",
            adBreakDone: (info: unknown) => {
              // If ad finished or rewarded
              onAdCompleted();
            },
          });
        } else {
          window.adBreak({
            type: placement === "preroll" ? "preroll" : "next",
            name: placement || "midgame_break",
            adBreakDone: () => {
              onAdCompleted();
            },
          });
        }
        return;
      } catch (err) {
        console.warn(
          "[AdOverlayController] H5 adBreak failed or blocked, falling back to 15s House Ad:",
          err
        );
      }
    }

    setUsingHouseFallback(true);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, isExempt, adKind, placement, durationSeconds, onAdCompleted]);

  useEffect(() => {
    if (isOpen && usingHouseFallback && secondsLeft === 0) {
      onAdCompleted();
    }
  }, [isOpen, usingHouseFallback, secondsLeft, onAdCompleted]);

  if (!isOpen || isExempt) return null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/92 p-6 text-center backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-indigo-500/30 bg-slate-900/95 p-6 shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400">
          <Megaphone className="h-6 w-6" />
        </div>

        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
          <span>{adKind === "rewarded" ? "Sponsored Reward" : "Commercial Break"} • {placement}</span>
        </div>

        <h3 className="mt-3 text-lg font-extrabold text-white">
          {adKind === "rewarded" ? "Unlock Your In-Game Bonus" : "Keep Your Team Flow Uninterrupted"}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
          {adKind === "rewarded"
            ? "Watch this short sponsor message to claim your in-game reward. You can cancel at any time."
            : "Unity audio & game loop are paused (`Time.timeScale = 0`). Your game will resume automatically when the countdown finishes."}
        </p>

        {/* Progress Bar */}
        <div className="mt-5 overflow-hidden rounded-full bg-slate-800 h-2">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-amber-400 transition-all duration-1000"
            style={{
              width: `${
                ((durationSeconds - secondsLeft) / durationSeconds) * 100
              }%`,
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1">
            <VolumeX className="h-3.5 w-3.5 text-slate-500" />
            Unity Audio Paused
          </span>
          <span className="font-mono font-bold text-amber-300">
            {adKind === "rewarded" ? `Reward grants in ${secondsLeft}s...` : `Resuming in ${secondsLeft}s...`}
          </span>
        </div>

        {/* 1-Click Host Checkout CTA or Rewarded Cancel */}
        <div className="mt-5 space-y-2">
          {adKind === "rewarded" ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAdDismissedEarly || onAdCompleted}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Cancel & Skip Reward
              </button>
              <button
                type="button"
                onClick={onAdCompleted}
                className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-500 px-3 py-2.5 text-xs font-bold text-white shadow-lg"
              >
                Dev: Complete & Grant
              </button>
            </div>
          ) : isHost ? (
            <button
              type="button"
              onClick={onOpenHostUpgrade}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-xs font-extrabold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
            >
              <Crown className="h-4 w-4" />
              <span>Host: Remove Ads for Entire Party Now</span>
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>
                Only the Party Host needs to upgrade to skip ads for everyone!
              </span>
            </div>
          )}

          {adKind !== "rewarded" && (
            <button
              type="button"
              onClick={onAdCompleted}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 underline hover:text-slate-300"
            >
              <Play className="h-3 w-3" />
              <span>Dev Test: Skip Countdown & Trigger ResumeFromAd()</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
