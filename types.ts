
export interface TranscriptItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  feedbackSent?: boolean;
  metadata?: {
    memory_hit?: boolean;
    tool_call?: string;
    token_count?: number;
    model?: string;
    provider?: 'google' | 'anthropic' | 'xai' | 'mistral';
    latency_ms?: number;
  };
}

export enum ConnectionStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
  DISCONNECTED = 'DISCONNECTED'
}

export interface MemoryEntry {
  id: string;
  content: string;
  score: number;
  timestamp: string;
}

export interface MayaState {
  personality: {
    caution_level: number;
    formality_level: number;
    trust_level: number;
    relationship_depth: number;
  };
  cognitive_soma: {
    context_pressure: number;
    synchrony: number;
    verification_itch: number; // Represented as an accumulating somatic gradient (0.0 - 1.0)
    friction_load: number;
    semantic_gravity: number;
  };
  error_patterns: {
    padding_corrections: number;
    character_contamination: number;
    silent_substitutions: number;
    verification_failures: number;
  };
  memory_access_log?: {
    query: string;
    hits: number;
    timestamp: number;
  }[];
}

export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  code: string;
  message: string;
  source: 'SYSTEM' | 'VOICE_AGENT' | 'NETWORK';
}
