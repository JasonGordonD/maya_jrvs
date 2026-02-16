import { useState, useRef, useEffect, useCallback } from 'react';

export type TTSEngine = 'ELEVEN_LABS' | 'WEB_NATIVE';

export const useElevenLabs = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const autoMode = import.meta.env.VITE_ELEVENLABS_AUTO_MODE === 'true';
  const [engine, setEngine] = useState<TTSEngine>(autoMode ? 'ELEVEN_LABS' : 'ELEVEN_LABS');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null); 
  const speechSynthRef = useRef<SpeechSynthesis>(window.speechSynthesis);

  // Stop any current playback from any engine
  const stop = useCallback(() => {
    // 1. Cancel Network TTS
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null; 
    }

    // 2. Cancel Native TTS
    if (speechSynthRef.current) {
        speechSynthRef.current.cancel();
    }

    setIsSpeaking(false);
    setVolume(0);
  }, []);

  const speak = async (text: string) => {
    if (!text) return;
    
    // Stop any previous speech
    stop();
    setIsSpeaking(true);

    if (engine === 'WEB_NATIVE') {
        // --- WEB NATIVE MODE ---
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            
            // Try to find a good female voice
            const voices = speechSynthRef.current.getVoices();
            const preferredVoice = voices.find(v => v.name.includes('Samantha')) || 
                                   voices.find(v => v.name.includes('Google US English')) ||
                                   voices.find(v => v.lang === 'en-US');
            
            if (preferredVoice) utterance.voice = preferredVoice;

            utterance.onend = () => {
                setIsSpeaking(false);
                setVolume(0);
            };

            utterance.onerror = (e) => {
                console.error("Native TTS Error:", e);
                setIsSpeaking(false);
                setVolume(0);
            };

            // Speak
            speechSynthRef.current.speak(utterance);

        } catch (err) {
            console.error("Native TTS Failed:", err);
            setIsSpeaking(false);
        }

    } else {
        // --- ELEVEN LABS MODE ---
        abortControllerRef.current = new AbortController();
        
        try {
          const voiceId = import.meta.env.VITE_ELEVENLABS_VOICE_ID || "gE0owC0H9C8SzfDyIUtB";
          const outputFormat = import.meta.env.VITE_ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_64";
          const modelId = import.meta.env.VITE_ELEVENLABS_MODEL_ID || "eleven_v3";
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

          if (!supabaseUrl || !supabaseKey) {
            throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_KEY for TTS proxy.");
          }

          // TODO: Deploy/enable mjrvs_tts edge function proxy for ElevenLabs server-side key usage.
          const response = await fetch(
            `${supabaseUrl}/functions/v1/mjrvs_tts`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                text,
                voice_id: voiceId,
                output_format: outputFormat,
                model_id: modelId,
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
              }),
              signal: abortControllerRef.current.signal
            }
          );

          if (!response.ok) throw new Error(`TTS proxy failed: ${response.status}`);

          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          
          if (abortControllerRef.current?.signal.aborted) return;

          audioRef.current = audio;
          
          audio.onended = () => {
            setIsSpeaking(false);
            setVolume(0);
            URL.revokeObjectURL(audioUrl); 
          };
          
          await audio.play();

        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.log('Playback aborted by user');
          } else {
            console.error('VOICE_ERROR:', error);
          }
          setIsSpeaking(false);
          setVolume(0);
        }
    }
  };

  // Simulated Volume for Visualizer
  useEffect(() => {
    let interval: any;
    if (isSpeaking) {
      interval = setInterval(() => {
        // Native TTS doesn't give us volume data easily, so we simulate it for visual consistency
        setVolume(Math.random() * 0.5 + 0.3);
      }, 100);
    } else {
      setVolume(0);
    }
    return () => clearInterval(interval);
  }, [isSpeaking]);

  return { speak, stop, isSpeaking, volume, engine, setEngine };
};