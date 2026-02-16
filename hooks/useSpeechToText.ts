import { useState, useRef, useEffect, useCallback } from 'react';

export type STTEngine = 'WEB_SPEECH' | 'ELEVEN_LABS_REALTIME';

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error: string;
};

type WebSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  readyState?: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  abort?: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => WebSpeechRecognition;

type UseSpeechToTextOptions = {
  selectedDeviceId?: string;
};

export const useSpeechToText = (
  onFinalTranscript: (text: string) => void,
  options?: UseSpeechToTextOptions
) => {
  const selectedDeviceId = options?.selectedDeviceId?.trim() || undefined;
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [engine, setEngine] = useState<STTEngine>('WEB_SPEECH');
  const shouldCaptureRef = useRef(false);
  const selectedDeviceIdRef = useRef<string | undefined>(selectedDeviceId);
  const warnedWebSpeechDeviceRef = useRef(false);
  const previousSelectedDeviceRef = useRef<string | undefined>(selectedDeviceId);
  const realtimeConnectingRef = useRef(false);

  // Web Speech API refs
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);

  // ElevenLabs Realtime refs
  const websocketRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);

  useEffect(() => {
    if (engine !== 'ELEVEN_LABS_REALTIME' || !isListening) {
      previousSelectedDeviceRef.current = selectedDeviceId;
    }
  }, [engine, isListening, selectedDeviceId]);

  // Web Speech API setup
  useEffect(() => {
    if (engine !== 'WEB_SPEECH') return;

    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => {
        if (!shouldCaptureRef.current) {
          setInterimTranscript('');
        }
        setIsListening(false);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        if (event.error === 'not-allowed') {
            console.error("Speech Recognition Error:", event.error);
            shouldCaptureRef.current = false;
            setIsListening(false);
        }
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
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

    return () => {
      shouldCaptureRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort?.();
        } catch {
          // Ignore cleanup errors.
        }
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore cleanup errors.
        }
      }
    };
  }, [onFinalTranscript, engine]);

  // ElevenLabs Realtime STT
  const startElevenLabsRealtime = useCallback(async () => {
    if (realtimeConnectingRef.current || isListening) {
      return;
    }
    realtimeConnectingRef.current = true;
    try {
      const proxyWebsocketUrl = import.meta.env.VITE_STT_PROXY_WS_URL;
      if (!proxyWebsocketUrl) {
        // TODO: Route ElevenLabs realtime STT through a server-side proxy WebSocket.
        console.warn('[MJRVS] STT proxy URL not configured. Falling back to WEB_SPEECH.');
        realtimeConnectingRef.current = false;
        setEngine('WEB_SPEECH');
        setIsListening(false);
        return;
      }

      // Connect to WebSocket
      const ws = new WebSocket(proxyWebsocketUrl);

      ws.onopen = async () => {
        try {
          console.log('STT proxy websocket connected');

          const selectedDeviceId = selectedDeviceIdRef.current?.trim();
          let stream: MediaStream;

          // Get microphone stream
          if (selectedDeviceId) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: selectedDeviceId } },
              });
            } catch (error) {
              console.warn('[MJRVS] Selected input device unavailable; falling back to default input.', error);
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
          } else {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          }

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

          realtimeConnectingRef.current = false;
          setIsListening(true);
        } catch (err) {
          console.error('[MJRVS] STT setup failed:', err);
          realtimeConnectingRef.current = false;
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
        realtimeConnectingRef.current = false;
        setIsListening(false);
      };

      ws.onclose = () => {
        console.log('STT proxy websocket disconnected');
        realtimeConnectingRef.current = false;
        setIsListening(false);
      };

      websocketRef.current = ws;
    } catch (error) {
      console.error('Failed to start ElevenLabs Realtime STT:', error);
      realtimeConnectingRef.current = false;
      setIsListening(false);
    }
  }, [isListening, onFinalTranscript]);

  const stopElevenLabsRealtime = useCallback(() => {
    realtimeConnectingRef.current = false;
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
    shouldCaptureRef.current = true;
    if (engine === 'WEB_SPEECH') {
      if (selectedDeviceIdRef.current && !warnedWebSpeechDeviceRef.current) {
        console.warn(
          '[MJRVS] WEB_SPEECH engine uses browser-default input. Switch to ELEVEN_LABS_REALTIME to force selected device.'
        );
        warnedWebSpeechDeviceRef.current = true;
      }
      if (recognitionRef.current && !isListening) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch {
          // Ignore errors if already started
        }
      }
    } else {
      startElevenLabsRealtime();
    }
  }, [engine, isListening, startElevenLabsRealtime]);

  const stopListening = useCallback(() => {
    shouldCaptureRef.current = false;
    setInterimTranscript('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort?.();
      } catch {
        // Ignore abort errors.
      }
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors.
      }
    }
    stopElevenLabsRealtime();
    setIsListening(false);
  }, [stopElevenLabsRealtime]);

  useEffect(() => {
    if (engine !== 'ELEVEN_LABS_REALTIME' || !isListening) {
      return;
    }
    const previousDeviceId = previousSelectedDeviceRef.current;
    if (previousDeviceId === selectedDeviceId) {
      return;
    }
    previousSelectedDeviceRef.current = selectedDeviceId;
    // Reconnect realtime capture so selected input device changes take effect.
    stopElevenLabsRealtime();
    startElevenLabsRealtime();
  }, [engine, isListening, selectedDeviceId, startElevenLabsRealtime, stopElevenLabsRealtime]);

  return { isListening, interimTranscript, startListening, stopListening, engine, setEngine };
};
