import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileWarning,
  Image,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Settings2,
  Unlink,
  Volume2
} from 'lucide-react';

import { TranscriptItem, EventLogEntry } from './types';
import { Message, MessageContent, ConversationEmptyState } from './Message';
import { useElevenLabs, VOICE_OPTIONS } from './hooks/useElevenLabs';
import { useSpeechToText } from './hooks/useSpeechToText';
import { generateMayaResponse, MayaModelProvider } from './services/gemini';
import GlassPanel from './GlassPanel';
import TactileButton from './TactileButton';
import { Response } from './Response';
import { MicSelector } from './MicSelector';
import { FileUpload } from './FileUpload';
import { buildSupabaseAuthHeaders, getBrowserSupabaseConfig } from './services/supabaseConfig';

type ModelOption = {
  model: string;
  provider: MayaModelProvider;
  latencyMs: number;
};

const MODEL_OPTIONS: ModelOption[] = [
  { model: 'gemini-2.0-flash', provider: 'google', latencyMs: 390 },
  { model: 'gemini-2.5-flash-preview-04-17', provider: 'google', latencyMs: 420 },
  { model: 'gemini-2.5-pro-preview-03-25', provider: 'google', latencyMs: 760 },
  { model: 'claude-opus-4-6', provider: 'anthropic', latencyMs: 880 },
  { model: 'claude-sonnet-4-5-20250929', provider: 'anthropic', latencyMs: 620 },
  { model: 'claude-haiku-4-5-20251001', provider: 'anthropic', latencyMs: 410 },
  { model: 'grok-4-1-fast', provider: 'xai', latencyMs: 470 },
  { model: 'mistral-large-2512', provider: 'mistral', latencyMs: 650 },
  { model: 'mistral-medium-2508', provider: 'mistral', latencyMs: 520 },
  { model: 'magistral-medium-2509', provider: 'mistral', latencyMs: 540 },
];

const PROVIDER_DOT_CLASS: Record<MayaModelProvider, string> = {
  google: 'provider-dot-google',
  anthropic: 'provider-dot-anthropic',
  xai: 'provider-dot-xai',
  mistral: 'provider-dot-mistral',
};

const STOPWORDS = new Set([
  'about', 'after', 'before', 'there', 'where', 'could', 'would', 'should', 'their', 'while', 'with', 'from', 'that',
  'this', 'what', 'when', 'have', 'please', 'your', 'will', 'been', 'they', 'them', 'here', 'into', 'then'
]);

const formatDuration = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const StatusDot: React.FC<{ active: boolean }> = ({ active }) => (
  <span className={`status-dot ${active ? 'active' : ''}`}>
    {active && <span className="status-dot-ring" />}
  </span>
);

const App: React.FC = () => {
  const { url: supabaseUrl, key: supabaseKey } = getBrowserSupabaseConfig();
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [textInput, setTextInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash-preview-04-17');
  const [latencyByModel, setLatencyByModel] = useState<Record<string, number>>({});

  const [showContextSidebar, setShowContextSidebar] = useState(true);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const [selectedMic, setSelectedMic] = useState('');
  const [micMuted, setMicMuted] = useState(false);

  const [systemOnline, setSystemOnline] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [eventLogExpanded, setEventLogExpanded] = useState(false);

  const transcriptBottomRef = useRef<HTMLDivElement>(null);

  const {
    speak,
    stop: stopSpeaking,
    isSpeaking,
    volume,
    voiceSlot,
    setVoiceSlot
  } = useElevenLabs();

  const logEvent = useCallback((category: EventLogEntry['category'], code: string, message: string, detail?: string) => {
    setEventLog((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: new Date(),
        category,
        code,
        message,
        detail,
      },
      ...prev.slice(0, 99),
    ]);
    if (category === 'ERROR') {
      console.error(`[${category}] ${code}: ${message}`, detail);
    } else {
      console.log(`[${category}] ${code}: ${message}`, detail ?? '');
    }
  }, []);

  const handleUserInput = useCallback(async (text: string, skipTTS = false) => {
    if (!text.trim() || isProcessing) return;
    setIsProcessing(true);

    const userMessage: TranscriptItem = {
      id: `${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date()
    };
    setTranscript((prev) => [...prev, userMessage]);

    try {
      const history = transcript.map((item) => ({ role: item.role, text: item.text }));
      const response = await generateMayaResponse(history, text, selectedModel);
      setLatencyByModel((prev) => ({ ...prev, [selectedModel]: response.latencyMs }));

      logEvent('LLM', 'RESPONSE_OK', `${response.provider}/${response.model}`, `${response.tokens} tokens · ${response.latencyMs}ms`);

      const modelMessage: TranscriptItem = {
        id: `${Date.now() + 1}`,
        role: 'model',
        text: response.content,
        timestamp: new Date(),
        metadata: {
          token_count: response.tokens,
          model: response.model,
          provider: response.provider,
          latency_ms: response.latencyMs,
        }
      };
      setTranscript((prev) => [...prev, modelMessage]);

      if (!skipTTS && systemOnline) {
        logEvent('TTS', 'TTS_START', `Voice: ${VOICE_OPTIONS[voiceSlot].label}`);
        await speak(response.content);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logEvent('ERROR', 'LLM_FAILURE', message, `model=${selectedModel} · input="${text.slice(0, 80)}"`);
      setTranscript((prev) => [
        ...prev,
        {
          id: `${Date.now() + 2}`,
          role: 'model',
          text: `Error: ${message}`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  }, [logEvent, isProcessing, selectedModel, speak, systemOnline, transcript, voiceSlot]);

  const handleUserSpeech = useCallback((text: string) => {
    handleUserInput(text, false);
  }, [handleUserInput]);

  const {
    isListening,
    startListening,
    stopListening,
    interimTranscript,
    engine: sttEngine,
    setEngine: setSttEngine
  } = useSpeechToText(handleUserSpeech, { selectedDeviceId: selectedMic });

  const handleTextSubmit = useCallback((event?: React.FormEvent) => {
    event?.preventDefault();
    const value = textInput.trim();
    if (!value) return;
    handleUserInput(value, true);
    setTextInput('');
  }, [handleUserInput, textInput]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      logEvent('ERROR', 'VISION_ERROR', 'File must be an image.');
      return;
    }

    setIsProcessing(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64Data = dataUrl.split(',')[1];

      const userImageMessage: TranscriptItem = {
        id: `${Date.now()}`,
        role: 'user',
        text: `[Image uploaded: ${file.name}]`,
        imageUrl: dataUrl,
        timestamp: new Date()
      };
      setTranscript((prev) => [...prev, userImageMessage]);

      if (!supabaseUrl) {
        throw new Error('SUPABASE_ENV_MISSING. CHECK VITE_SUPABASE_URL.');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/mjrvs_vision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildSupabaseAuthHeaders(supabaseKey),
        },
        body: JSON.stringify({
          action: 'analyze_base64',
          base64_data: base64Data,
          mime_type: file.type,
          media_type: 'image',
          user_id: 'rami',
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
          const body = await response.json() as { error?: string };
          errorMessage = body.error || errorMessage;
        } catch {
          const fallback = await response.text().catch(() => 'Unknown error');
          errorMessage = `${errorMessage}: ${fallback}`;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json() as { analysis_text?: string };
      const analysis = result.analysis_text || 'No analysis text returned.';
      logEvent('VISION', 'ANALYSIS_OK', `${file.name}`, analysis.slice(0, 120));

      const history = [...transcript, userImageMessage].map((item) => ({ role: item.role, text: item.text }));
      const mayaResponse = await generateMayaResponse(history, `[Vision analysis of uploaded image "${file.name}"]: ${analysis}`, selectedModel);
      setLatencyByModel((prev) => ({ ...prev, [selectedModel]: mayaResponse.latencyMs }));
      logEvent('LLM', 'VISION_RESPONSE', `${mayaResponse.provider}/${mayaResponse.model}`, `${mayaResponse.tokens} tokens · ${mayaResponse.latencyMs}ms`);

      const modelMessage: TranscriptItem = {
        id: `${Date.now() + 1}`,
        role: 'model',
        text: mayaResponse.content,
        timestamp: new Date(),
        metadata: {
          token_count: mayaResponse.tokens,
          model: mayaResponse.model,
          provider: mayaResponse.provider,
          latency_ms: mayaResponse.latencyMs,
        }
      };
      setTranscript((prev) => [...prev, modelMessage]);

      if (systemOnline) {
        await speak(mayaResponse.content);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown vision failure';
      logEvent('ERROR', 'VISION_FAILURE', message, file.name);
    } finally {
      setIsProcessing(false);
    }
  }, [logEvent, selectedModel, speak, supabaseKey, supabaseUrl, systemOnline, transcript]);

  useEffect(() => {
    if (!systemOnline || micMuted) {
      if (isListening) stopListening();
      return;
    }

    if (isSpeaking || isProcessing) {
      if (isListening) stopListening();
      return;
    }

    if (!isListening) {
      startListening();
    }
  }, [isListening, isProcessing, isSpeaking, micMuted, startListening, stopListening, systemOnline]);

  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimTranscript, isProcessing]);

  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      logEvent('ERROR', 'UNCAUGHT_EXCEPTION', event.message || 'Unknown script error');
    };
    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, [logEvent]);

  const selectedModelConfig = useMemo(
    () => MODEL_OPTIONS.find((option) => option.model === selectedModel) || MODEL_OPTIONS[0],
    [selectedModel]
  );

  const displayLatency = latencyByModel[selectedModel] ?? selectedModelConfig.latencyMs;
  const sessionDurationMs = transcript.length > 0
    ? Date.now() - transcript[0].timestamp.getTime()
    : 0;

  const activeTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of transcript.slice(-16)) {
      const words = entry.text.toLowerCase().split(/[^a-z0-9]+/g);
      for (const word of words) {
        if (word.length < 5 || STOPWORDS.has(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }, [transcript]);

  const telemetry = {
    memory: transcript.length > 0,
    vision: transcript.some((item) => item.text.toLowerCase().includes('vision')),
    voice: systemOnline && (isListening || isSpeaking),
    state: systemOnline,
  };

  return (
    <div className="maya-shell">
      <div className="ambient-glow" />
      <div className="film-grain" />

      <header className="maya-header">
        <div className="maya-header-left">
          <div className="maya-brand-icon">
            <BrainCircuit size={16} />
          </div>
          <div>
            <h1 className="maya-title">Maya JRVS</h1>
            <p className="maya-subtitle">Executive orchestration interface</p>
          </div>
        </div>

        <div className="maya-header-center">
          <label className="maya-mono uppercase text-[10px] tracking-[0.14em]">Model</label>
          <div className="maya-model-select-wrap">
            <span className={`provider-dot ${PROVIDER_DOT_CLASS[selectedModelConfig.provider]}`} />
            <select
              className="maya-model-select"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.model} value={option.model}>
                  {option.model}
                </option>
              ))}
            </select>
            <span className="maya-model-latency">{displayLatency}ms</span>
          </div>
        </div>

        <div className="maya-header-right">
          <TactileButton
            state="online"
            icon={<Cpu size={14} />}
            onClick={() => setVoiceSlot((prev) => (prev === 'PRIMARY' ? 'SECONDARY' : 'PRIMARY'))}
            aria-label="Toggle voice"
            title="Toggle voice"
          >
            Voice: {VOICE_OPTIONS[voiceSlot].label}
          </TactileButton>
          <TactileButton
            state={sttEngine === 'ELEVEN_LABS_REALTIME' ? 'online' : 'default'}
            icon={<Mic size={14} />}
            onClick={() => {
              stopListening();
              setSttEngine((prev) => (prev === 'ELEVEN_LABS_REALTIME' ? 'WEB_SPEECH' : 'ELEVEN_LABS_REALTIME'));
            }}
          >
            {sttEngine === 'ELEVEN_LABS_REALTIME' ? 'Proxy STT' : 'Web STT'}
          </TactileButton>
          <TactileButton
            state={showMicSelector ? 'online' : 'default'}
            icon={<Settings2 size={14} />}
            onClick={() => setShowMicSelector((prev) => !prev)}
          >
            Mic
          </TactileButton>
          <TactileButton
            state={showFileUpload ? 'online' : 'default'}
            icon={<Paperclip size={14} />}
            onClick={() => setShowFileUpload((prev) => !prev)}
          >
            Files
          </TactileButton>
          <TactileButton
            state={systemOnline ? 'online' : 'offline'}
            icon={systemOnline ? <Unlink size={14} /> : <Activity size={14} />}
            onClick={() => {
              if (systemOnline) {
                stopListening();
                stopSpeaking();
                setMicMuted(true);
                setShowMicSelector(false);
                setSystemOnline(false);
                logEvent('SYSTEM', 'OFFLINE', 'System taken offline');
                return;
              }
              setMicMuted(false);
              setSystemOnline(true);
              logEvent('SYSTEM', 'ONLINE', `Model: ${selectedModel}`, `Voice: ${VOICE_OPTIONS[voiceSlot].label} · STT: ${sttEngine}`);
            }}
          >
            {systemOnline ? 'Online' : 'Offline'}
          </TactileButton>
        </div>
      </header>

      <div className="maya-telemetry-bar">
        <div className="maya-telemetry-item"><StatusDot active={telemetry.memory} />MEMORY</div>
        <div className="maya-telemetry-item"><StatusDot active={telemetry.vision} />VISION</div>
        <div className="maya-telemetry-item"><StatusDot active={telemetry.voice} />VOICE</div>
        <div className="maya-telemetry-item"><StatusDot active={telemetry.state} />STATE</div>
      </div>

      <main className="maya-main">
        <aside className={`maya-context-sidebar ${showContextSidebar ? '' : 'collapsed'}`}>
          <button className="maya-sidebar-toggle" onClick={() => setShowContextSidebar((prev) => !prev)}>
            {showContextSidebar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>

          {showContextSidebar && (
            <div className="maya-sidebar-content">
              <section>
                <h3>Session stats</h3>
                <ul>
                  <li><span>Turns</span><strong>{transcript.length}</strong></li>
                  <li><span>Duration</span><strong>{formatDuration(sessionDurationMs)}</strong></li>
                  <li><span>Voice</span><strong>{VOICE_OPTIONS[voiceSlot].label}</strong></li>
                  <li><span>STT</span><strong>{sttEngine === 'ELEVEN_LABS_REALTIME' ? 'Proxy RT' : 'Web Speech'}</strong></li>
                </ul>
              </section>

              <section>
                <h3>Active topics</h3>
                {activeTopics.length === 0 ? (
                  <p className="maya-sidebar-empty">Topics appear as conversation evolves.</p>
                ) : (
                  <ul className="maya-topic-list">
                    {activeTopics.map((topic) => (
                      <li key={topic}>{topic}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3>Keyboard shortcuts</h3>
                <ul className="maya-shortcut-list">
                  <li><kbd>Enter</kbd><span>Send message</span></li>
                  <li><kbd>Shift + Enter</kbd><span>New line</span></li>
                  <li><kbd>Cmd/Ctrl + K</kbd><span>Focus input</span></li>
                </ul>
              </section>
            </div>
          )}
        </aside>

        <section className="maya-conversation-panel">
          <div className="maya-conversation-scroll maya-scrollbar">
            {transcript.length === 0 ? (
              <ConversationEmptyState />
            ) : (
              transcript.map((item) => (
                <Message
                  key={item.id}
                  from={item.role === 'user' ? 'user' : 'assistant'}
                  timestamp={item.timestamp}
                  metadata={item.metadata}
                >
                  <MessageContent from={item.role === 'user' ? 'user' : 'assistant'}>
                    {item.imageUrl && (
                      <img
                        src={item.imageUrl}
                        alt="Uploaded image"
                        className="maya-message-image"
                      />
                    )}
                    {item.role === 'model' ? <Response>{item.text}</Response> : <span>{item.text}</span>}
                  </MessageContent>
                </Message>
              ))
            )}

            {interimTranscript && systemOnline && (
              <div className="maya-interim-line">
                <Mic size={12} />
                <span>{interimTranscript}</span>
              </div>
            )}

            {isProcessing && (
              <div className="maya-processing-line">
                <Loader2 size={14} className="animate-spin" />
                <span>Maya is reasoning...</span>
              </div>
            )}
            <div ref={transcriptBottomRef} />
          </div>
        </section>
      </main>

      <div className="maya-input-wrap">
        <form onSubmit={handleTextSubmit} className="maya-input-bar">
          <button
            type="button"
            className={`maya-voice-button ${isListening ? 'active' : ''}`}
            onClick={() => {
              if (isListening) {
                stopListening();
                setMicMuted(true);
              } else {
                setMicMuted(false);
                if (!systemOnline) setSystemOnline(true);
                startListening();
              }
            }}
            aria-label="Toggle microphone"
          >
            <Mic size={14} />
          </button>

          <input
            type="text"
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder={systemOnline ? 'Ask Maya anything...' : 'Set system online to begin...'}
            disabled={isProcessing}
            className="maya-input"
          />

          <button
            type="submit"
            disabled={!textInput.trim() || isProcessing}
            className={`maya-send-button ${textInput.trim() ? 'ready' : ''}`}
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </form>
      </div>

      <footer className="maya-footer maya-mono">
        PRMPT · MAYA JRVS v3.1
      </footer>

      {showMicSelector && (
        <GlassPanel variant="heavy" className="maya-modal maya-modal-sm">
          <div className="maya-modal-header">
            <h2>Microphone</h2>
            <button onClick={() => setShowMicSelector(false)}>Close</button>
          </div>
          <MicSelector
            value={selectedMic}
            onValueChange={setSelectedMic}
            muted={micMuted}
            onMutedChange={setMicMuted}
          />
        </GlassPanel>
      )}

      {showFileUpload && (
        <GlassPanel variant="heavy" className="maya-modal maya-modal-lg">
          <div className="maya-modal-header">
            <h2>File upload</h2>
            <button onClick={() => setShowFileUpload(false)}>Close</button>
          </div>
          <FileUpload
            onFilesSelected={(files) => {
              const firstImage = files.find((file) => file.type.startsWith('image/'));
              if (firstImage) void handleImageUpload(firstImage);
            }}
            maxFiles={5}
            maxSize={20}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
          />
        </GlassPanel>
      )}

      {eventLog.length > 0 && (
        <div className="maya-event-log">
          <div
            className="maya-event-log-header"
            onClick={() => setEventLogExpanded((prev) => !prev)}
          >
            <div className="maya-event-log-header-left">
              <FileWarning size={12} />
              <span>Event log</span>
              <span className="maya-event-log-badge">{eventLog.length}</span>
            </div>
            <span>{eventLogExpanded ? '▾' : '▸'}</span>
          </div>
          {eventLogExpanded && (
            <div className="maya-event-log-body maya-scrollbar">
              {eventLog.slice(0, 50).map((entry) => (
                <div key={entry.id} className="maya-event-log-entry">
                  <div className="maya-event-log-row">
                    <span className="maya-event-log-code">[{entry.category}] {entry.code}</span>
                    <span className="maya-event-log-time">
                      {entry.timestamp.toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                  </div>
                  <div className="maya-event-log-detail">{entry.message}</div>
                  {entry.detail && <div className="maya-event-log-detail">{entry.detail}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;