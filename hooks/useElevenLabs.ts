import { useState, useRef, useEffect, useCallback } from 'react';
import { buildSupabaseAuthHeaders, getBrowserSupabaseConfig } from '../services/supabaseConfig';

export type VoiceSlot = 'PRIMARY' | 'SECONDARY';

export interface VoiceConfig {
  id: string;
  label: string;
}

export const VOICE_OPTIONS: Record<VoiceSlot, VoiceConfig> = {
  PRIMARY: {
    id: import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'gE0owC0H9C8SzfDyIUtB',
    label: import.meta.env.VITE_ELEVENLABS_VOICE_LABEL || 'Maya',
  },
  SECONDARY: {
    id: import.meta.env.VITE_ELEVENLABS_VOICE_ID_ALT || 'gE0owC0H9C8SzfDyIUtB',
    label: import.meta.env.VITE_ELEVENLABS_VOICE_LABEL_ALT || 'Maya Alt',
  },
};

const MODEL_ID = 'eleven_v3';

export const useElevenLabs = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const [voiceSlot, setVoiceSlot] = useState<VoiceSlot>('PRIMARY');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    setIsSpeaking(false);
    setVolume(0);
  }, []);

  const speak = async (text: string) => {
    if (!text) return;

    stop();
    setIsSpeaking(true);
    abortControllerRef.current = new AbortController();

    try {
      const voiceId = VOICE_OPTIONS[voiceSlot].id;
      const outputFormat = import.meta.env.VITE_ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_64';
      const { url: supabaseUrl, key: supabaseKey } = getBrowserSupabaseConfig();

      if (!supabaseUrl) {
        throw new Error('Missing Supabase browser env for TTS proxy. Set VITE_SUPABASE_URL.');
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/mjrvs_tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildSupabaseAuthHeaders(supabaseKey),
          },
          body: JSON.stringify({
            text,
            voice_id: voiceId,
            output_format: outputFormat,
            model_id: MODEL_ID,
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const failureBody = await response.text().catch(() => '');
        throw new Error(`TTS proxy failed: ${response.status}${failureBody ? ` ${failureBody}` : ''}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioUrlRef.current = audioUrl;

      if (abortControllerRef.current?.signal.aborted) return;

      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        setVolume(0);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        setVolume(0);
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
      };

      await audio.play();
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'AbortError') {
        console.log('Playback aborted by user');
      } else {
        console.error('VOICE_ERROR:', error);
      }
      setIsSpeaking(false);
      setVolume(0);
    }
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSpeaking) {
      interval = setInterval(() => {
        setVolume(Math.random() * 0.5 + 0.3);
      }, 100);
    } else {
      setVolume(0);
    }
    return () => clearInterval(interval);
  }, [isSpeaking]);

  return { speak, stop, isSpeaking, volume, voiceSlot, setVoiceSlot };
};