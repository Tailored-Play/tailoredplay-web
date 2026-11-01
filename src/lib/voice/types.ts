import { VoiceProviderType } from "@/types/database";

export interface VoiceParticipantState {
  userId: string;
  username: string;
  avatarUrl: string;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isSpeaking: boolean;
}

/**
 * Pluggable interface for Voice & Video communication providers
 * (e.g., LiveKit, Daily.co, Agora, or custom WebRTC P2P).
 */
export interface IVoiceVideoProvider {
  readonly providerType: VoiceProviderType;
  connect(params: {
    partyId: string;
    roomUrl?: string | null;
    userId: string;
    username: string;
    token?: string;
  }): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  getParticipants(): VoiceParticipantState[];
}
