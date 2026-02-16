import { useState, useRef, useEffect, useCallback } from 'react';

export type TTSEngine = 'ELEVEN_LABS' | 'WEB_NATIVE';

export const useElevenLabs = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0); 
  // Default to Native if API key is missing to prevent immediate error
  const [engine, setEngine] = useState<TTSEngine>(process.env.REACT_APP_ELEVENLABS_API_KEY ? 'ELEVEN_LABS' : 'WEB_NATIVE');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null); 
  const speechSynthRef = useRef<SpeechSynthesis>(window.speechSynthesis);

  // Expose whether the key exists so UI can adapt
  const hasApiKey = !!process.env.REACT_APP_ELEVENLABS_API_KEY;

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

    // Force Native if no API key is present, ignoring the engine state
    const effectiveEngine = hasApiKey ? engine : 'WEB_NATIVE';

    if (effectiveEngine === 'WEB_NATIVE') {
        // --- WEB NATIVE MODE ---
        try {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            
            // Try to find a good female voice
            const voices = speechSynthRef.current.getVoices();
            // Expanded voice list for better fallbacks
            const preferredVoice = voices.find(v => v.name.includes('Samantha')) || 
                                   voices.find(v => v.name.includes('Google US English')) ||
                                   voices.find(v => v.name.includes('Microsoft Zira')) ||
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
          const apiKey = process.env.REACT_APP_ELEVENLABS_API_KEY;
          const voiceId = process.env.REACT_APP_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; 

          if (!apiKey) {
             // This block should theoretically be unreachable due to 'effectiveEngine' check, 
             // but strictly enforcing it for type safety and logic.
             throw new Error("CRITICAL: REACT_APP_ELEVENLABS_API_KEY is missing from environment variables.");
          }
          
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'xi-api-key': apiKey,
              },
              body: JSON.stringify({
                text,
                model_id: "eleven_turbo_v2_5", // Use Turbo 2.5 for lowest latency
                voice_settings: { 
                    stability: 0.5, 
                    similarity_boost: 0.75 
                }
              }),
              signal: abortControllerRef.current.signal
            }
          );

          if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`ElevenLabs API Failed (${response.status}): ${errorText}`);
          }

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
            console.log('TTS Playback aborted by user');
          } else {
            console.error('ELEVENLABS_ERROR:', error);
            // Fallback to native immediately if ElevenLabs fails (e.g., quota exceeded)
            setEngine('WEB_NATIVE');
            // Recursively call speak to try again with Native engine
            const utterance = new SpeechSynthesisUtterance("Error with voice stream. Switching to local backup.");
            speechSynthRef.current.speak(utterance);
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

  return { speak, stop, isSpeaking, volume, engine, setEngine, hasApiKey };
};