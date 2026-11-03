"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import {
  Game,
  MonetizationSettings,
  Party,
  PartyMember,
  Profile,
  TailoredInitializeSessionPayload,
  TailoredUnityEventDetail,
} from "@/types/database";
import { AdOverlayController } from "@/components/ads/AdOverlayController";
import {
  broadcastPartySignal,
  isPlatformDebugMode,
  notifyBroadcast,
  subscribeToPartyRealtime,
  subscribeToPlatformEvents,
} from "@/lib/store/platform-store";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileArchive,
  Keyboard,
  LogOut,
  Megaphone,
  Play,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Volume2,
  Wifi,
} from "lucide-react";

/**
 * Critical WebGL Browser Safeguard #2:
 * Prevents Chrome/Edge from throttling the Host's Unity NGO loop when they
 * alt-tab to Zoom, Google Meet, or Microsoft Teams by running both:
 * 1) A silent Web Audio API Oscillator (gain = 0.00001)
 * 2) A dedicated background Web Worker heartbeat timer
 */
function useHostAntiThrottle(enabled: boolean) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setIsActive(false);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let oscillator: OscillatorNode | null = null;
    let worker: Worker | null = null;
    let workerUrl: string | null = null;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
        oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.00001; // inaudible silent lock
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
      }
    } catch (e) {
      console.warn("[HostAntiThrottle] Web Audio init skipped:", e);
    }

    try {
      const workerCode = `
        let timer = setInterval(() => {
          postMessage({ tick: Date.now() });
        }, 500);
        onmessage = (e) => {
          if (e.data === 'stop') clearInterval(timer);
        };
      `;
      const blob = new Blob([workerCode], { type: "application/javascript" });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      setIsActive(true);
    } catch (e) {
      console.warn("[HostAntiThrottle] Web Worker init skipped:", e);
    }

    return () => {
      setIsActive(false);
      try {
        oscillator?.stop();
        audioCtx?.close();
      } catch {
        // ignore
      }
      try {
        worker?.postMessage("stop");
        worker?.terminate();
        if (workerUrl) URL.revokeObjectURL(workerUrl);
      } catch {
        // ignore
      }
    };
  }, [enabled]);

  return isActive;
}

function classifyTailoredZipEntry(entryName: string): {
  targetFileName: string;
  contentType: string;
} | null {
  const normalized = entryName.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.endsWith("/") || normalized.includes("__MACOSX")) {
    return null;
  }
  const lower = normalized.toLowerCase();
  let contentType = "application/octet-stream";
  if (lower.endsWith(".html")) contentType = "text/html";
  else if (lower.endsWith(".js") || lower.endsWith(".mjs"))
    contentType = "application/javascript";
  else if (lower.endsWith(".css")) contentType = "text/css";
  else if (lower.endsWith(".json")) contentType = "application/json";
  else if (lower.endsWith(".csv")) contentType = "text/csv";
  else if (lower.endsWith(".png")) contentType = "image/png";
  else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
    contentType = "image/jpeg";
  else if (lower.endsWith(".svg")) contentType = "image/svg+xml";
  else if (lower.endsWith(".glb")) contentType = "model/gltf-binary";
  else if (lower.endsWith(".mp3")) contentType = "audio/mpeg";
  else if (lower.endsWith(".ogg")) contentType = "audio/ogg";
  else if (lower.endsWith(".wav")) contentType = "audio/wav";

  return {
    targetFileName: normalized,
    contentType,
  };
}

interface TailoredCoreMountProps {
  baseUrl: string;
  slug?: string;
  onSendMessageReady: (
    sendFn: (go: string, method: string, param?: string) => void,
    unloadFn: () => Promise<void>
  ) => void;
}

/**
 * Inner component that mounts a compiled TailoredCore HTML5 / Vite bundle
 * (`${baseUrl}/index.html`) inside a zero-latency sandboxed iframe and wires
 * the bidirectional `window.TailoredManager` + `TailoredUnityEvent` bridge.
 */
function TailoredCoreMount({
  baseUrl,
  slug,
  onSendMessageReady,
}: TailoredCoreMountProps) {
  const cleanBase = baseUrl.replace(/\/$/, "");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const isDebug = isPlatformDebugMode();
  const flag = isDebug ? "debug=1" : "clean=1";
  const gameParam = slug
    ? `?game=${encodeURIComponent(slug)}&${flag}`
    : `?${flag}`;

  const staticUrl = `${cleanBase}/index.html${gameParam}`;
  const viteUrl = slug
    ? `http://localhost:5173/?game=${encodeURIComponent(slug)}&debug=1`
    : `http://localhost:5173/?debug=1`;

  const [iframeSrc, setIframeSrc] = useState<string>(() => {
    return isDebug ? "" : staticUrl;
  });

  useEffect(() => {
    setIsLoaded(false);
    if (!isDebug) {
      setIframeSrc(staticUrl);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    fetch("http://localhost:5173/", {
      mode: "no-cors",
      signal: controller.signal,
    })
      .then(() => {
        clearTimeout(timeoutId);
        if (isMounted) {
          console.log(
            `[TailoredCoreMount] Live Vite server active at :5173 -> Using HMR proxy (${viteUrl})`
          );
          setIframeSrc(viteUrl);
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        if (isMounted) {
          console.log(
            `[TailoredCoreMount] Live Vite server offline -> Falling back to static bundle (${staticUrl})`
          );
          setIframeSrc(staticUrl);
        }
      });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isDebug, staticUrl, viteUrl]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as
        | {
            type?: string;
            source?: string;
            detail?: TailoredUnityEventDetail;
          }
        | undefined;
      if (!data) return;
      if (
        (data.type === "TailoredUnityEvent" || data.source === "TailoredCore") &&
        data.detail
      ) {
        window.dispatchEvent(
          new CustomEvent("TailoredUnityEvent", { detail: data.detail })
        );
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    onSendMessageReady(
      (go, method, param) => {
        const win = iframeRef.current?.contentWindow as
          | (Window & {
              TailoredManager?: Record<string, (arg?: string) => void>;
            })
          | null
          | undefined;
        if (!win) return;
        try {
          if (
            go === "TailoredManager" &&
            win.TailoredManager &&
            typeof win.TailoredManager[method] === "function"
          ) {
            win.TailoredManager[method](param);
            return;
          }
        } catch {
          // Cross-origin fallback via postMessage below
        }
        win.postMessage(
          {
            source: "TailoredWebPlatform",
            target: go,
            method,
            parameter: param ?? "",
          },
          "*"
        );
      },
      async () => {
        if (iframeRef.current) {
          iframeRef.current.src = "about:blank";
        }
      }
    );
  }, [onSendMessageReady]);

  return (
    <div className="relative h-full w-full bg-slate-950">
      {!isLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
          <div className="mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-bold text-white">
            Loading TailoredCore HTML5 Runtime...
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Mounting {iframeSrc || staticUrl}
          </p>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={iframeSrc || undefined}
        title="TailoredCore HTML5 Runtime"
        onLoad={() => {
          if (iframeSrc) setIsLoaded(true);
        }}
        allow="autoplay; fullscreen; gamepad"
        className="h-full w-full border-0"
      />
    </div>
  );
}

interface UnityGameCanvasProps {
  party: Party;
  game: Game;
  currentUser: Profile;
  members: PartyMember[];
  isAdFree: boolean;
  isRewardedAdFree: boolean;
  monetization: MonetizationSettings;
  onPublishRelayCode: (joinCode: string) => Promise<void>;
  onSubmitScore: (
    score: number,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  onNotifyGameEnded: () => Promise<void>;
  onReturnToLobby: () => Promise<void>;
  onOpenHostUpgrade: () => void;
  onToggleAdFree?: () => Promise<void>;
  onToggleRewardedAdFree?: () => Promise<void>;
  onUpdateAdCooldown?: (seconds: number) => Promise<void>;
}

export function UnityGameCanvas({
  party,
  game,
  currentUser,
  members,
  isAdFree,
  isRewardedAdFree,
  monetization,
  onPublishRelayCode,
  onSubmitScore,
  onNotifyGameEnded,
  onReturnToLobby,
  onOpenHostUpgrade,
  onToggleAdFree,
  onToggleRewardedAdFree,
  onUpdateAdCooldown,
}: UnityGameCanvasProps) {
  const isHost = party.host_id === currentUser.id;
  const antiThrottleActive = useHostAntiThrottle(isHost);

  const [hasRealBinary, setHasRealBinary] = useState<boolean | null>(null);
  const [compressionType, setCompressionType] = useState<"br" | "gz" | "none">("br");
  const [keyboardCaptured, setKeyboardCaptured] = useState(true);
  const [adBreakState, setAdBreakState] = useState<{
    isOpen: boolean;
    placement: string;
    adKind: "commercial" | "rewarded";
  }>({
    isOpen: !isPlatformDebugMode() && !isAdFree && monetization.enable_preroll_ads,
    placement: "preroll",
    adKind: "commercial",
  });
  const lastCommercialAdTimestampRef = useRef<number>(0);

  // Inspector & Dev Controls State
  const [showConsole, setShowConsole] = useState(true);
  const [hotZipStatus, setHotZipStatus] = useState<string | null>(null);
  const [isUploadingHotZip, setIsUploadingHotZip] = useState(false);
  const hotZipInputRef = useRef<HTMLInputElement | null>(null);

  // Bridge Simulator State & Console Logs
  const [bridgeLogs, setBridgeLogs] = useState<
    Array<{ id: string; timestamp: string; direction: "WEB->UNITY" | "UNITY->WEB"; text: string }>
  >([]);
  const [simScore, setSimScore] = useState<number>(
    Math.floor(450 + Math.random() * 500)
  );
  const [simRelayCode, setSimRelayCode] = useState<string>(
    party.network_room_code ||
      `NGO-${party.invite_code}-${Math.floor(10 + Math.random() * 89)}`
  );
  const [simCustomEventText, setSimCustomEventText] = useState<string>(
    '{"questionIndex": 1, "answer": "B"}'
  );
  const [receivedSession, setReceivedSession] =
    useState<TailoredInitializeSessionPayload | null>(null);
  const [isUnloading, setIsUnloading] = useState(false);

  const sendMessageRef = useRef<
    (go: string, method: string, param?: string) => void
  >(() => {});
  const unloadRef = useRef<() => Promise<void>>(async () => {});

  const appendLog = useCallback(
    (direction: "WEB->UNITY" | "UNITY->WEB", text: string) => {
      const now = new Date();
      const timeStr = `${now.toTimeString().split(" ")[0]}.${String(now.getMilliseconds()).padStart(3, "0")}`;
      setBridgeLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: timeStr,
          direction,
          text,
        },
        ...prev.slice(0, 39),
      ]);
    },
    []
  );

  // Unified sendMessage dispatcher
  const dispatchToUnity = useCallback(
    (gameObject: string, methodName: string, parameter?: string) => {
      appendLog(
        "WEB->UNITY",
        `sendMessage('${gameObject}', '${methodName}', ${
          parameter ? parameter.slice(0, 90) + (parameter.length > 90 ? "..." : "") : "''"
        })`
      );

      if (methodName === "InitializeSession" && parameter) {
        try {
          setReceivedSession(
            JSON.parse(parameter) as TailoredInitializeSessionPayload
          );
        } catch {
          // ignore
        }
      } else if (methodName === "SetKeyboardCapture") {
        setKeyboardCaptured(parameter !== "false");
      } else if (methodName === "ReceiveRelayCode" && parameter) {
        setSimRelayCode(parameter);
      }

      sendMessageRef.current(gameObject, methodName, parameter);
    },
    [appendLog]
  );

  // Build the InitializeSession payload
  const buildSessionPayload = useCallback((): TailoredInitializeSessionPayload => {
    return {
      partyId: party.id,
      inviteCode: party.invite_code,
      networkRoomCode: party.network_room_code || "",
      syncType: game.sync_type,
      isAdFree,
      isRewardedAdFree,
      adCooldownSeconds: monetization.midgame_ad_cooldown_seconds ?? 120,
      roundNumber: party.current_round || 1,
      currentUser: {
        id: currentUser.id,
        username: currentUser.username,
        avatarUrl: currentUser.avatar_url,
        isHost,
      },
      partyMembers: members.map((m) => ({
        id: m.user_id,
        username: m.profile?.username || "Guest",
        avatarUrl:
          m.profile?.avatar_url ||
          `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${m.user_id}`,
        isHost: m.role === "host",
      })),
      isPrerollActive: adBreakState.isOpen && adBreakState.placement === "preroll",
    };
  }, [
    party,
    game.sync_type,
    isAdFree,
    isRewardedAdFree,
    monetization.midgame_ad_cooldown_seconds,
    currentUser,
    isHost,
    members,
    adBreakState.isOpen,
    adBreakState.placement,
  ]);

  // Sync ad status updates live to Unity
  useEffect(() => {
    dispatchToUnity(
      "TailoredManager",
      "UpdateAdStatus",
      JSON.stringify({
        isAdFree,
        isRewardedAdFree,
        adCooldownSeconds: monetization.midgame_ad_cooldown_seconds ?? 120,
      })
    );
  }, [isAdFree, isRewardedAdFree, monetization.midgame_ad_cooldown_seconds, dispatchToUnity]);

  // Probe whether TailoredCore HTML5 build (index.html) exists
  const probeBinary = useCallback(async () => {
    const cleanBase = game.r2_base_url.replace(/\/$/, "");
    const entryUrl = `${cleanBase}/index.html`;

    try {
      const entryRes = await fetch(entryUrl, { method: "HEAD" });
      if (!entryRes.ok) {
        setHasRealBinary(false);
        return;
      }
      setCompressionType("none");
      setHasRealBinary(true);
    } catch {
      setHasRealBinary(false);
    }
  }, [game.r2_base_url]);

  useEffect(() => {
    probeBinary();
  }, [probeBinary]);

  // Client-side Hot .zip Drop & Extractor for TailoredCore HTML5 bundles
  const handleHotZipUpload = async (file: File) => {
    if (!file) return;
    setIsUploadingHotZip(true);
    setHotZipStatus("Inspecting TailoredCore HTML5 .zip archive in browser...");

    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir);
      const discovered: Array<{
        targetFileName: string;
        contentType: string;
        blob: Blob;
      }> = [];

      for (const entry of entries) {
        const classification = classifyTailoredZipEntry(entry.name);
        if (classification) {
          const blob = await entry.async("blob");
          discovered.push({
            targetFileName: classification.targetFileName,
            contentType: classification.contentType,
            blob,
          });
        }
      }

      const hasIndexHtml = discovered.some(
        (d) =>
          d.targetFileName === "index.html" ||
          d.targetFileName.endsWith("/index.html")
      );
      if (discovered.length === 0 || !hasIndexHtml) {
        setHotZipStatus(
          "No TailoredCore HTML5 bundle (index.html + assets/*) found in .zip"
        );
        setIsUploadingHotZip(false);
        return;
      }

      // If all files are nested under a single top-level folder, strip that prefix so index.html sits at root
      const indexEntry = discovered.find(
        (d) =>
          d.targetFileName === "index.html" ||
          d.targetFileName.endsWith("/index.html")
      );
      const stripPrefix =
        indexEntry && indexEntry.targetFileName.includes("/")
          ? indexEntry.targetFileName.slice(
              0,
              indexEntry.targetFileName.lastIndexOf("/") + 1
            )
          : "";

      for (let i = 0; i < discovered.length; i++) {
        const item = discovered[i];
        const relPath =
          stripPrefix && item.targetFileName.startsWith(stripPrefix)
            ? item.targetFileName.slice(stripPrefix.length)
            : item.targetFileName;
        if (!relPath) continue;

        setHotZipStatus(
          `Uploading ${relPath} (${i + 1}/${discovered.length})...`
        );

        const formData = new FormData();
        formData.append("slug", game.slug);
        formData.append("fileName", relPath);
        formData.append(
          "file",
          new File([item.blob], relPath.split("/").pop() || "asset", {
            type: item.contentType,
          })
        );

        const res = await fetch("/api/admin/local-upload", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          throw new Error(`Failed uploading ${relPath}`);
        }
      }

      setHotZipStatus(
        `TailoredCore HTML5 bundle hot-deployed to /builds/${game.slug}! Reloading canvas...`
      );
      await probeBinary();
      setTimeout(() => setHotZipStatus(null), 3500);
    } catch (err) {
      console.error("[UnityGameCanvas] Hot .zip upload failed:", err);
      setHotZipStatus("Hot .zip deploy failed. Check console.");
    } finally {
      setIsUploadingHotZip(false);
    }
  };

  // Listen for window 'TailoredUnityEvent' dispatched by TailoredWebBridge.jslib (or Simulator)
  useEffect(() => {
    const handleUnityEvent = async (e: Event) => {
      const customEvt = e as CustomEvent<TailoredUnityEventDetail>;
      const detail = customEvt.detail;
      if (!detail) return;

      appendLog(
        "UNITY->WEB",
        `${detail.type}(${JSON.stringify(detail.payload || {})})`
      );

      switch (detail.type) {
        case "OnUnityReady": {
          const payload = buildSessionPayload();
          dispatchToUnity(
            "TailoredManager",
            "InitializeSession",
            JSON.stringify(payload)
          );
          if (adBreakState.isOpen) {
            dispatchToUnity("TailoredManager", "PauseForExternalAd", adBreakState.placement);
          }
          break;
        }
        case "PublishRelayCode": {
          const joinCode = detail.payload?.joinCode || "";
          if (joinCode) {
            await onPublishRelayCode(joinCode);
          }
          break;
        }
        case "SubmitScore": {
          const scoreVal = Number(detail.payload?.score ?? 0);
          await onSubmitScore(scoreVal, detail.payload?.metadata || {});
          break;
        }
        case "RequestCommercialBreak": {
          const placement = detail.payload?.placement || "midgame";
          const now = Date.now();
          const cooldownMs = (monetization.midgame_ad_cooldown_seconds ?? 120) * 1000;
          const onCooldown = now - lastCommercialAdTimestampRef.current < cooldownMs;

          if (isAdFree || !monetization.enable_midgame_ads || onCooldown) {
            dispatchToUnity(
              "TailoredManager",
              "ResumeFromAd",
              JSON.stringify({
                completed: false,
                skipped: true,
                reason: isAdFree ? "ad_free" : onCooldown ? "cooldown" : "disabled",
              })
            );
          } else {
            lastCommercialAdTimestampRef.current = now;
            setAdBreakState({ isOpen: true, placement, adKind: "commercial" });
            dispatchToUnity("TailoredManager", "PauseForExternalAd", placement);

            if (isHost) {
              broadcastPartySignal(party.id, {
                type: "PARTY_AD_BREAK_TRIGGERED",
                partyId: party.id,
                payload: { placement },
              });
            }
          }
          break;
        }
        case "RequestRewardedAd": {
          const placement = detail.payload?.placement || "rewarded_bonus";
          if (isRewardedAdFree || !monetization.enable_rewarded_ads) {
            dispatchToUnity(
              "TailoredManager",
              "CompleteRewardedAd",
              JSON.stringify({ placement, rewarded: true, vipInstantGrant: true })
            );
          } else {
            setAdBreakState({ isOpen: true, placement, adKind: "rewarded" });
          }
          break;
        }
        case "NotifyGameEnded": {
          await onNotifyGameEnded();
          break;
        }
        case "BroadcastPartyEvent": {
          broadcastPartySignal(party.id, {
            type: "UNITY_CUSTOM_EVENT",
            partyId: party.id,
            payload: {
              senderId: currentUser.id,
              senderName: currentUser.username,
              eventName: detail.payload?.eventName || "custom",
              payloadJson: detail.payload?.data || "{}",
            },
          });
          break;
        }
      }
    };

    window.addEventListener("TailoredUnityEvent", handleUnityEvent);
    return () =>
      window.removeEventListener("TailoredUnityEvent", handleUnityEvent);
  }, [
    appendLog,
    buildSessionPayload,
    currentUser.id,
    currentUser.username,
    dispatchToUnity,
    isAdFree,
    isRewardedAdFree,
    isHost,
    monetization.enable_midgame_ads,
    monetization.enable_rewarded_ads,
    monetization.midgame_ad_cooldown_seconds,
    onNotifyGameEnded,
    onPublishRelayCode,
    onSubmitScore,
    party.id,
    adBreakState.isOpen,
    adBreakState.placement,
  ]);

  // Forward incoming Realtime Relay Codes & Custom Party Events to Unity
  useEffect(() => {
    const unsub = subscribeToPartyRealtime(party.id, (packet) => {
      if (packet.partyId && packet.partyId !== party.id) return;

      if (packet.type === "RELAY_CODE_PUBLISHED") {
        const data = packet.payload as { joinCode?: string };
        if (data?.joinCode) {
          dispatchToUnity("TailoredManager", "ReceiveRelayCode", data.joinCode);
        }
      } else if (packet.type === "PARTY_AD_BREAK_TRIGGERED" && !isHost) {
        const data = packet.payload as { placement?: string };
        const plc = data?.placement || "midgame";
        if (!isAdFree && monetization.enable_midgame_ads) {
          dispatchToUnity("TailoredManager", "PauseForExternalAd", plc);
          setAdBreakState({ isOpen: true, placement: plc, adKind: "commercial" });
        }
      } else if (packet.type === "UNITY_CUSTOM_EVENT") {
        dispatchToUnity(
          "TailoredManager",
          "ReceivePartyEvent",
          JSON.stringify(packet.payload)
        );
      }
    });
    return unsub;
  }, [party.id, isHost, isAdFree, monetization.enable_midgame_ads, dispatchToUnity]);

  // Auto-emit OnUnityReady when in simulator mode
  useEffect(() => {
    if (hasRealBinary === false) {
      const timer = setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("TailoredUnityEvent", {
            detail: { type: "OnUnityReady", payload: {} },
          })
        );
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [hasRealBinary]);

  // Critical WebGL Safeguard #1: Keyboard Capture Guard
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      ) {
        dispatchToUnity("TailoredManager", "SetKeyboardCapture", "false");
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable
      ) {
        dispatchToUnity("TailoredManager", "SetKeyboardCapture", "true");
      }
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);
    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
    };
  }, [dispatchToUnity]);

  // Critical WebGL Safeguard #3: Clean Memory Unloading
  const handleSafeExitOrEnd = async (action: "lobby" | "end_game") => {
    setIsUnloading(true);
    try {
      await unloadRef.current();
    } catch (e) {
      console.warn("[UnityGameCanvas] Safe unload warning:", e);
    } finally {
      setIsUnloading(false);
    }

    if (action === "lobby") {
      await onReturnToLobby();
    } else {
      window.dispatchEvent(
        new CustomEvent("TailoredUnityEvent", {
          detail: { type: "NotifyGameEnded", payload: {} },
        })
      );
    }
  };

  const handleAdCompleted = useCallback(() => {
    const wasRewarded = adBreakState.adKind === "rewarded";
    const placement = adBreakState.placement;
    setAdBreakState((prev) => ({ ...prev, isOpen: false }));
    if (wasRewarded) {
      dispatchToUnity(
        "TailoredManager",
        "CompleteRewardedAd",
        JSON.stringify({ placement, rewarded: true, vipInstantGrant: false })
      );
    }
    dispatchToUnity("TailoredManager", "ResumeFromAd", "true");
  }, [adBreakState.adKind, adBreakState.placement, dispatchToUnity]);

  const handleAdDismissedEarly = useCallback(() => {
    const wasRewarded = adBreakState.adKind === "rewarded";
    const placement = adBreakState.placement;
    setAdBreakState((prev) => ({ ...prev, isOpen: false }));
    if (wasRewarded) {
      dispatchToUnity(
        "TailoredManager",
        "CompleteRewardedAd",
        JSON.stringify({ placement, rewarded: false, vipInstantGrant: false })
      );
    }
    dispatchToUnity("TailoredManager", "ResumeFromAd", "true");
  }, [adBreakState.adKind, adBreakState.placement, dispatchToUnity]);

  const emitSimulatedUnityEvent = (
    type: TailoredUnityEventDetail["type"],
    payload: TailoredUnityEventDetail["payload"] = {}
  ) => {
    window.dispatchEvent(
      new CustomEvent("TailoredUnityEvent", {
        detail: { type, payload },
      })
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Top Status & Safeguards Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-white">{game.title}</span>
          <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-300">
            {game.sync_type === "multiplayer_ngo"
              ? "Unity NGO + Relay"
              : "Synced Single-Player"}
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
              hasRealBinary
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
            }`}
          >
            <Cpu className="h-3 w-3" />
            <span>
              {hasRealBinary
                ? "TailoredCore HTML5"
                : "Bridge Simulator"}
            </span>
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
              keyboardCaptured
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
            title="WebGLInput.captureAllKeyboardInput status"
          >
            <Keyboard className="h-3 w-3" />
            <span>
              Keys: {keyboardCaptured ? "Captured" : "Released for Chat"}
            </span>
          </span>

          {isHost && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                antiThrottleActive
                  ? "bg-cyan-500/15 text-cyan-300"
                  : "bg-slate-800 text-slate-400"
              }`}
              title="Silent Web Audio Oscillator + Web Worker Heartbeat keeps Host NGO loop alive when alt-tabbed"
            >
              <Activity className="h-3 w-3" />
              <Volume2 className="h-3 w-3" />
              <span>Host Anti-Throttle Active</span>
            </span>
          )}

          {party.network_room_code && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
              <Wifi className="h-3 w-3" />
              <span>Relay: {party.network_room_code}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isHost && (
            <>
              <button
                type="button"
                disabled={isUnloading}
                onClick={() => handleSafeExitOrEnd("end_game")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Trophy className="h-3.5 w-3.5" />
                <span>Show Podium</span>
              </button>
              <button
                type="button"
                disabled={isUnloading}
                onClick={() => handleSafeExitOrEnd("lobby")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{isUnloading ? "Unloading..." : "Switch Game"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main 16:9 Unity WebGL Canvas Container + Ad Overlay */}
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
        <AdOverlayController
          isOpen={adBreakState.isOpen}
          placement={adBreakState.placement}
          isAdFree={isAdFree}
          isRewardedAdFree={isRewardedAdFree}
          adKind={adBreakState.adKind}
          isHost={isHost}
          onAdCompleted={handleAdCompleted}
          onAdDismissedEarly={handleAdDismissedEarly}
          onOpenHostUpgrade={onOpenHostUpgrade}
        />

        {hasRealBinary ? (
          <TailoredCoreMount
            baseUrl={game.r2_base_url}
            slug={game.slug}
            onSendMessageReady={(sendFn, unloadFn) => {
              sendMessageRef.current = sendFn;
              unloadRef.current = unloadFn;
            }}
          />
        ) : (
          /* High-End Interactive Standby & Warning Screen when no compiled TailoredCore HTML5 bundle is present */
          <div className="relative flex h-full w-full flex-col justify-between bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/20 p-6 overflow-y-auto">
            {/* Top Warning Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 backdrop-blur-md shadow-lg shadow-amber-500/5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wider">
                    No TailoredCore HTML5 Bundle Loaded for &ldquo;{game.title}&rdquo;
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    Target build path <code className="font-mono text-amber-300">{game.r2_base_url}</code> does not have a compiled TailoredCore bundle (<code className="font-mono text-slate-200">index.html</code>).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={probeBinary}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/25 transition"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Re-check Bundle</span>
                </button>
              </div>
            </div>

            {/* Center: Modern Drag & Drop Zone + Quick TailoredCore Instructions */}
            <div className="my-auto py-3 grid gap-4 md:grid-cols-2 max-w-4xl mx-auto w-full">
              {/* Option 1: Drop .zip directly */}
              <div
                onClick={() => hotZipInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.name.endsWith(".zip")) {
                    handleHotZipUpload(file);
                  }
                }}
                className="group cursor-pointer flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-500/40 bg-indigo-950/20 p-5 text-center transition hover:border-indigo-400 hover:bg-indigo-950/30 shadow-lg"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 transition group-hover:scale-110">
                  <FileArchive className="h-6 w-6" />
                </div>
                <h5 className="mt-3 text-sm font-bold text-white">
                  Drop TailoredCore HTML5 <span className="text-indigo-400">.zip</span> Here
                </h5>
                <p className="mt-1 text-xs text-slate-400 max-w-xs">
                  Click or drag your exported <code className="text-slate-300">_WebBundle.zip</code> archive to hot-deploy immediately into <code className="text-slate-300">{game.r2_base_url}</code>.
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-indigo-600/25 group-hover:bg-indigo-500">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Select .zip Archive</span>
                </span>
              </div>

              {/* Option 2: 1-Click TailoredCore CLI Export */}
              <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                    <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                    <span>TailoredCore Vite Builder</span>
                  </div>
                  <h5 className="mt-2 text-sm font-bold text-white">
                    1-Click Direct Local Bundle
                  </h5>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    In the root repository, run:
                  </p>
                  <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-mono text-[11px] text-indigo-300 break-all">
                    npm run build:cms-zip
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Outputs directly into <code className="text-slate-300">web/public{game.r2_base_url}</code> and <code className="text-slate-300">Builds/</code>. Once finished, click &ldquo;Re-check Bundle&rdquo; above!
                  </p>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Bundle format:</span>
                  <span className="font-semibold text-emerald-400">HTML5 + PixiJS v8 + Three.js</span>
                </div>
              </div>
            </div>

            {/* Bottom Status / Simulator Note */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-center text-xs text-slate-400">
              ⚡ Bridge Simulator is active: you can test party scoring, commercial breaks, rewarded ads, and relay networking in the toolbar below even before compiling the game.
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input for Hot .zip upload */}
      <input
        type="file"
        ref={hotZipInputRef}
        accept=".zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleHotZipUpload(file);
        }}
        className="hidden"
      />

      {/* =====================================================================
          DEV DEBUG TOOLBAR (Always Available)
         ===================================================================== */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-white">
              Developer Pipeline & Ad Controls
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => hotZipInputRef.current?.click()}
              disabled={isUploadingHotZip}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              <FileArchive className="h-3.5 w-3.5" />
              <span>{isUploadingHotZip ? "Uploading..." : "Hot .zip Upload"}</span>
            </button>

            <button
              type="button"
              onClick={probeBinary}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white"
              title="Re-check if Build.loader.js exists"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Build</span>
            </button>

            <button
              type="button"
              onClick={() => setShowConsole((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white"
            >
              {showConsole ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  <span>Hide Inspector</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <span>Show Bridge Logs ({bridgeLogs.length})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {hotZipStatus && (
          <div className="mt-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
            {hotZipStatus}
          </div>
        )}

        {/* Ad-Free & Cooldown Controls Row */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Ad-Free Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">
                Commercial Breaks
              </span>
              <span
                className={`text-xs font-extrabold ${
                  isAdFree ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {isAdFree ? "Ad-Free (Bypassed)" : "Ads Active"}
              </span>
            </div>
            {onToggleAdFree && (
              <button
                type="button"
                onClick={onToggleAdFree}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  isAdFree
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                }`}
              >
                {isAdFree ? "Enable Ads" : "Disable Ads"}
              </button>
            )}
          </div>

          {/* Rewarded Ad-Free Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">
                VIP Rewarded Perk
              </span>
              <span
                className={`text-xs font-extrabold ${
                  isRewardedAdFree ? "text-emerald-400" : "text-slate-300"
                }`}
              >
                {isRewardedAdFree ? "Instant VIP Grant" : "Show Video Overlay"}
              </span>
            </div>
            {onToggleRewardedAdFree && (
              <button
                type="button"
                onClick={onToggleRewardedAdFree}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  isRewardedAdFree
                    ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    : "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {isRewardedAdFree ? "Turn Off VIP" : "Enable VIP Grant"}
              </button>
            )}
          </div>

          {/* Ad Cooldown Selector */}
          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-400">
                Midgame Cooldown
              </span>
              <span className="text-xs font-extrabold text-white">
                {monetization.midgame_ad_cooldown_seconds ?? 120}s
              </span>
            </div>
            {onUpdateAdCooldown && (
              <div className="flex gap-1">
                {[0, 15, 120].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onUpdateAdCooldown(s)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      (monetization.midgame_ad_cooldown_seconds ?? 120) === s
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Ad Simulators */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-2">
            <button
              type="button"
              onClick={() =>
                emitSimulatedUnityEvent("RequestCommercialBreak", {
                  placement: "dev_manual_break",
                })
              }
              className="flex-1 rounded-lg border border-amber-500/40 bg-amber-500/15 py-1.5 text-center text-[10px] font-bold text-amber-300 hover:bg-amber-500/25"
            >
              Sim Break
            </button>
            <button
              type="button"
              onClick={() =>
                emitSimulatedUnityEvent("RequestRewardedAd", {
                  placement: "dev_manual_rewarded",
                })
              }
              className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 py-1.5 text-center text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/25"
            >
              Sim Rewarded
            </button>
          </div>
        </div>

        {/* Action Controls: Score, Relay Code, Broadcast */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {/* Left: Score Submission & Game End */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] font-bold uppercase text-slate-400">
                Score Value
              </label>
              <input
                type="number"
                value={simScore}
                onChange={(e) => setSimScore(Number(e.target.value))}
                className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                emitSimulatedUnityEvent("SubmitScore", {
                  score: simScore,
                  metadata: { round: party.current_round || 1 },
                })
              }
              className="mt-3.5 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <Trophy className="h-3.5 w-3.5" />
              <span>SubmitScore({simScore})</span>
            </button>
            {isHost && (
              <button
                type="button"
                onClick={() =>
                  emitSimulatedUnityEvent("NotifyGameEnded", {
                    summaryJson: '{"winner":"party"}',
                  })
                }
                className="mt-3.5 inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/20 px-2.5 py-1.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/30"
              >
                <Play className="h-3 w-3" />
                <span>NotifyGameEnded()</span>
              </button>
            )}
          </div>

          {/* Right: Unity Relay & Custom Event Broadcast */}
          <div className="flex flex-col justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-2.5">
            {isHost ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={simRelayCode}
                  onChange={(e) => setSimRelayCode(e.target.value)}
                  placeholder="Relay Join Code"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() =>
                    emitSimulatedUnityEvent("PublishRelayCode", {
                      joinCode: simRelayCode,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-cyan-500"
                >
                  <Radio className="h-3 w-3" />
                  <span>Publish Relay Code</span>
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-300">
                Relay Auto-Join Code:{" "}
                <strong className="font-mono text-cyan-300">
                  {party.network_room_code || "Waiting for Host..."}
                </strong>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={simCustomEventText}
                onChange={(e) => setSimCustomEventText(e.target.value)}
                placeholder='{"action":"move"}'
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-white"
              />
              <button
                type="button"
                onClick={() =>
                  emitSimulatedUnityEvent("BroadcastPartyEvent", {
                    eventName: "PLAYER_ACTION",
                    data: simCustomEventText,
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-700"
              >
                <Send className="h-3 w-3" />
                <span>Broadcast Event</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          PERSISTENT LIVE TWO-WAY BRIDGE INSPECTOR & EVENT LOG
         ===================================================================== */}
      {showConsole && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                Live Web ↔ Unity Bridge Event Stream ({bridgeLogs.length})
              </span>
              {receivedSession && (
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  ✓ Session Initialized ({receivedSession.partyMembers.length}p)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => emitSimulatedUnityEvent("OnUnityReady")}
                className="text-xs text-indigo-400 hover:underline"
              >
                Re-send OnUnityReady()
              </button>
              <button
                type="button"
                onClick={() => setBridgeLogs([])}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="max-h-48 space-y-1 overflow-y-auto font-mono text-[11px]">
            {bridgeLogs.length === 0 ? (
              <p className="text-slate-600">
                Waiting for bridge activity... (Click &ldquo;Re-send OnUnityReady&rdquo; or start gameplay)
              </p>
            ) : (
              bridgeLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-[10px] text-slate-600 shrink-0">
                    {log.timestamp}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.2 text-[9px] font-bold ${
                      log.direction === "WEB->UNITY"
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {log.direction}
                  </span>
                  <span className="break-all text-slate-300">{log.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Safeguard Info Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-indigo-400" />
          <span>
            Safeguards Active: Automatic{" "}
            <code className="text-slate-400">await unload()</code> on game switch • HTML Input Keyboard Capture Guard • Host Tab-Throttling Audio/Worker Lock
          </span>
        </span>
      </div>
    </div>
  );
}
