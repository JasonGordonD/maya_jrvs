import { useState, useRef, useEffect, useCallback } from 'react';

export type STTEngine = 'WEB_SPEECH' | 'ELEVEN_LABS_REALTIME';

export const useSpeechToText = (onFinalTranscript: (text: string) => void) => {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [engine, setEngine] = useState<STTEngine>('WEB_SPEECH');

  // Web Speech API refs
  const recognitionRef = useRef<any>(null);

  // ElevenLabs Realtime refs
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Web Speech API setup
  useEffect(() => {
    if (engine !== 'WEB_SPEECH') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
            console.error("Speech Recognition Error:", event.error);
            setIsListening(false);
        }
      };

      recognition.onresult = (event: any) => {
        let final = '';
        let interim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (final) {
          onFinalTranscript(final);
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };

      recognitionRef.current = recognition;
    } else {
        console.warn("Speech Recognition not supported in this browser.");
    }
  }, [onFinalTranscript, engine]);

  // ElevenLabs Realtime STT
  const startElevenLabsRealtime = useCallback(async () => {
    try {
      const proxyWebsocketUrl = import.meta.env.VITE_STT_PROXY_WS_URL;
      if (!proxyWebsocketUrl) {
        // TODO: Route ElevenLabs realtime STT through a server-side proxy WebSocket.
        console.warn('[MJRVS] STT proxy URL not configured. Falling back to WEB_SPEECH.');
        setEngine('WEB_SPEECH');
        setIsListening(false);
        return;
      }

      // Connect to WebSocket
      const ws = new WebSocket(proxyWebsocketUrl);

      ws.onopen = async () => {
        try {
          console.log('STT proxy websocket connected');

          // Get microphone stream
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;

          // Setup audio processing
          const audioContext = new AudioContext({ sampleRate: 16000 });
          audioContextRef.current = audioContext;

          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
              }
              ws.send(pcm16.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioContext.destination);

          setIsListening(true);
        } catch (err) {
          console.error('[MJRVS] STT setup failed:', err);
          ws.close();
          setIsListening(false);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'partial_transcript') {
            setInterimTranscript(data.text || '');
          } else if (data.type === 'final_transcript' || data.type === 'committed_transcript') {
            if (data.text && data.text.trim()) {
              onFinalTranscript(data.text.trim());
              setInterimTranscript('');
            }
          }
        } catch (err) {
          console.error('Failed to parse STT message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('ElevenLabs Realtime STT error:', error);
        setIsListening(false);
      };

      ws.onclose = () => {
        console.log('STT proxy websocket disconnected');
        setIsListening(false);
      };

      websocketRef.current = ws;
    } catch (error) {
      console.error('Failed to start ElevenLabs Realtime STT:', error);
      setIsListening(false);
    }
  }, [onFinalTranscript]);

  const stopElevenLabsRealtime = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    setIsListening(false);
    setInterimTranscript('');
  }, []);

  // Unified start/stop
  const startListening = useCallback(() => {
    if (engine === 'WEB_SPEECH') {
      if (recognitionRef.current && recognitionRef.current.readyState !== 'started') {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch(e) {
          // Ignore errors if already started
        }
      }
    } else {
      startElevenLabsRealtime();
    }
  }, [engine, startElevenLabsRealtime]);

  const stopListening = useCallback(() => {
    if (engine === 'WEB_SPEECH') {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
      }
    } else {
      stopElevenLabsRealtime();
    }
  }, [engine, stopElevenLabsRealtime]);

  return { isListening, interimTranscript, startListening, stopListening, engine, setEngine };
};
