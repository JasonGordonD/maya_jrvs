import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  FileWarning,
  Image,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Radio,
  Send,
  Settings2,
  ThumbsDown,
  ThumbsUp,
  Unplug,
  Volume2
} from 'lucide-react';

import { useConversation } from '@elevenlabs/react';
import { TranscriptItem, ErrorLogEntry } from './types';
import { Message, MessageContent, ConversationEmptyState } from './Message';
import { generateMayaResponse, MayaModelProvider } from './services/gemini';
import GlassPanel from './GlassPanel';
import TactileButton from './TactileButton';
import { Response } from './Response';
import { MicSelector } from './MicSelector';
import { FileUpload } from './FileUpload';
import { buildSupabaseAuthHeaders, getBrowserSupabaseConfig } from './services/supabaseConfig';
import { Orb } from './components/ui/orb';

type ModelOption = {
  model: string;
  provider: MayaModelProvider;
  latencyMs: number;
};

const MODEL_OPTIONS: ModelOption[] = [
  { model: 'gemini-3-flash-preview', provider: 'google', latencyMs: 420 },
  { model: 'gemini-2.5-flash', provider: 'google', latencyMs: 390 },
  { model: 'gemini-3-pro-preview', provider: 'google', latencyMs: 760 },
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

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || 'agent_0401khmtcyfef6hbpcvchjv5jj02';

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
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');
  const [latencyByModel, setLatencyByModel] = useState<Record<string, number>>({});

  const [showContextSidebar, setShowContextSidebar] = useState(true);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showMicSelector, setShowMicSelector] = useState(false);
  const [selectedMic, setSelectedMic] = useState('');
  const [micMuted, setMicMuted] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);
  const [agentMode, setAgentMode] = useState<'listening' | 'speaking' | null>(null);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [sessionStart, setSessionStart] = useState<Date | null>(null);
  const [sessionElapsed, setSessionElapsed] = useState('00:00');

  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<ReturnType<typeof useConversation> | null>(null);

  const addError = useCallback((code: string, message: string, source: ErrorLogEntry['source'], details?: unknown) => {
    const detailsSuffix = details ? ` | ${JSON.stringify(details).slice(0, 180)}` : '';
    setErrorLog((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: new Date(),
        code,
        message: `${message}${detailsSuffix}`,
        source
      },
      ...prev
    ]);
    console.error(`[${source}] ${code}: ${message}`, details);
  }, []);

  // ElevenLabs Conversational AI agent hook
  const conversation = useConversation({
    onConnect: () => {
      console.log('[MJRVS] Agent session connected');
      setCurrentNode(null);
      setSessionStart(new Date());
    },
    onDisconnect: () => {
      console.log('[MJRVS] Agent session disconnected');
      setAgentMode(null);
      setCurrentNode(null);
      setSessionStart(null);
      setSessionElapsed('00:00');
    },
    onMessage: (message) => {
      const item: TranscriptItem = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: message.source === 'user' ? 'user' : 'model',
        text: message.message,
        timestamp: new Date(),
        metadata: message.source === 'ai' ? {
          model: 'agent',
          provider: 'anthropic',
        } : undefined,
      };
      setTranscript((prev) => [...prev, item]);
    },
    onModeChange: (mode) => {
      setAgentMode(mode.mode === 'speaking' ? 'speaking' : 'listening');
    },
    onError: (message, context) => {
      addError('AGENT_ERROR', message, 'VOICE_AGENT', context);
    },
    clientTools: {
      announce_node: async (params: { node_name?: string }) => {
        const nodeName = params.node_name || 'Unknown';
        console.log('[MJRVS] Node transition:', nodeName);
        setCurrentNode(nodeName);
        return 'Node acknowledged';
      },
    },
  });

  conversationRef.current = conversation;

  const isAgentConnected = conversation.status === 'connected';
  const isAgentConnecting = conversation.status === 'connecting';
  const isSpeaking = conversation.isSpeaking;

  // Start agent voice session
  const startAgentSession = useCallback(async () => {
    try {
      await conversation.startSession({
        agentId: AGENT_ID,
        connectionType: 'webrtc',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start agent session';
      addError('AGENT_CONNECT_FAILURE', message, 'VOICE_AGENT', error);
    }
  }, [addError, conversation]);

  // End agent voice session
  const endAgentSession = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end agent session';
      addError('AGENT_DISCONNECT_FAILURE', message, 'VOICE_AGENT', error);
    }
  }, [addError, conversation]);

  // Text chat via mjrvs_llm (used when agent is disconnected)
  const handleTextChat = useCallback(async (text: string) => {
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addError('INTELLIGENCE_FAILURE', message, 'SYSTEM', {
        input: text.slice(0, 120),
        transcriptLength: transcript.length
      });
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
  }, [addError, isProcessing, selectedModel, transcript]);

  // Unified text submit: routes to agent or text chat based on connection state
  const handleTextSubmit = useCallback((event?: React.FormEvent) => {
    event?.preventDefault();
    const value = textInput.trim();
    if (!value) return;

    if (isAgentConnected) {
      conversation.sendUserMessage(value);
    } else {
      handleTextChat(value);
    }
    setTextInput('');
  }, [conversation, handleTextChat, isAgentConnected, textInput]);

  // Image upload via mjrvs_vision edge function
  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addError('VISION_ERROR', 'File must be an image.', 'SYSTEM');
      return;
    }

    setIsProcessing(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

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

      // Add upload indicator to transcript
      setTranscript((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          role: 'user',
          text: `[Image uploaded: ${file.name}]`,
          timestamp: new Date()
        },
      ]);

      // Inject analysis into agent session or text chat
      if (isAgentConnected) {
        conversation.sendContextualUpdate(`Vision analysis of uploaded image "${file.name}": ${analysis}`);
        setTranscript((prev) => [
          ...prev,
          {
            id: `${Date.now() + 1}`,
            role: 'model',
            text: `[Vision analysis injected into agent context]\n\n${analysis}`,
            timestamp: new Date(),
            metadata: { model: 'mjrvs_vision', provider: 'xai' }
          },
        ]);
      } else {
        await handleTextChat(`Vision analysis: ${analysis}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown vision failure';
      addError('VISION_FAILURE', message, 'SYSTEM', { fileName: file.name });
    } finally {
      setIsProcessing(false);
    }
  }, [addError, conversation, handleTextChat, isAgentConnected, supabaseKey, supabaseUrl]);

  // Handle mic device change — wire to SDK
  const handleMicChange = useCallback((deviceId: string) => {
    setSelectedMic(deviceId);
    if (isAgentConnected && deviceId) {
      conversation.changeInputDevice({
        format: 'pcm',
        sampleRate: 16000,
        inputDeviceId: deviceId,
      }).catch((err) => {
        console.error('[MJRVS] Failed to change input device:', err);
      });
    }
  }, [conversation, isAgentConnected]);

  // Session timer
  useEffect(() => {
    if (!sessionStart) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
      const mins = Math.floor(diff / 60).toString().padStart(2, '0');
      const secs = (diff % 60).toString().padStart(2, '0');
      setSessionElapsed(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, isProcessing]);

  // Global error handler
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      addError('UNCAUGHT_EXCEPTION', event.message || 'Unknown script error', 'SYSTEM');
    };
    window.addEventListener('error', handleGlobalError);
    return () => window.removeEventListener('error', handleGlobalError);
  }, [addError]);

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
    voice: isAgentConnected,
    state: isAgentConnected || transcript.length > 0,
  };

  // Audio volume levels for 3D Orb reactivity
  const [inputVolume, setInputVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  useEffect(() => {
    if (!isAgentConnected) {
      setInputVolume(0);
      setOutputVolume(0);
      return;
    }
    let frameId: number;
    const update = () => {
      const inVol = conversation.getInputVolume();
      const outVol = conversation.getOutputVolume();
      setInputVolume(typeof inVol === 'number' ? Math.min(1, inVol) : 0);
      setOutputVolume(typeof outVol === 'number' ? Math.min(1, outVol) : 0);
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [conversation, isAgentConnected]);

  // Map conversation state to orb agent state
  const getAgentState = useCallback(() => {
    if (conversation.status === 'connecting') return 'thinking' as const;
    if (isSpeaking) return 'talking' as const;
    if (isAgentConnected) return 'listening' as const;
    return null;
  }, [conversation.status, isSpeaking, isAgentConnected]);

  const [transcriptCopied, setTranscriptCopied] = useState(false);

  // Export transcript as formatted markdown
  const exportTranscript = useCallback(() => {
    if (transcript.length === 0) return;
    const markdown = transcript
      .map((msg) => {
        const speaker = msg.role === 'user' ? '**You:**' : '**Maya:**';
        const time = msg.timestamp.toLocaleTimeString();
        return `${speaker} (${time})\n${msg.text}\n`;
      })
      .join('\n---\n\n');
    navigator.clipboard.writeText(markdown).then(() => {
      setTranscriptCopied(true);
      setTimeout(() => setTranscriptCopied(false), 2000);
    });
  }, [transcript]);

  // Feedback handler for agent messages
  const handleFeedback = useCallback((messageId: string, positive: boolean) => {
    conversation.sendFeedback(positive);
    setTranscript((prev) =>
      prev.map((item) => item.id === messageId ? { ...item, feedbackSent: true } : item)
    );
  }, [conversation]);

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
          {!isAgentConnected ? (
            <>
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
            </>
          ) : (
            <>
              <label className="maya-mono uppercase text-[10px] tracking-[0.14em]">Agent</label>
              <div className="maya-model-select-wrap">
                <span className="provider-dot provider-dot-anthropic" />
                <span className="maya-model-select" style={{ cursor: 'default' }}>
                  JRVS · {agentMode === 'speaking' ? 'SPEAKING' : agentMode === 'listening' ? 'LISTENING' : 'CONNECTED'}
                  {currentNode && <span className="maya-node-indicator"> · {currentNode}</span>}
                </span>
                <span className="maya-model-latency">live</span>
              </div>
            </>
          )}
        </div>

        <div className="maya-header-right">
          {isAgentConnected && (
            <TactileButton
              state={micMuted ? 'offline' : 'online'}
              icon={micMuted ? <MicOff size={14} /> : <Mic size={14} />}
              onClick={() => setMicMuted((prev) => !prev)}
              aria-label="Toggle microphone mute"
              title="Toggle microphone mute"
            >
              {micMuted ? 'Muted' : 'Mic On'}
            </TactileButton>
          )}
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
          {isAgentConnected || isAgentConnecting ? (
            <TactileButton
              state="online"
              icon={<Unplug size={14} />}
              onClick={endAgentSession}
            >
              {isAgentConnecting ? 'Connecting...' : 'Online'}
            </TactileButton>
          ) : (
            <TactileButton
              state="offline"
              icon={<Radio size={14} />}
              onClick={startAgentSession}
            >
              Connect
            </TactileButton>
          )}
        </div>
      </header>

      <div className="maya-telemetry-bar">
        <div className="maya-telemetry-item"><StatusDot active={telemetry.voice} />VOICE</div>
        <div className="maya-telemetry-item"><StatusDot active={telemetry.memory} />MEMORY</div>
        <div className="maya-telemetry-item"><StatusDot active={telemetry.vision} />VISION</div>
        <div className="maya-telemetry-item"><StatusDot active={telemetry.state} />STATE</div>
        {sessionStart && (
          <div className="maya-telemetry-item maya-session-timer">{sessionElapsed}</div>
        )}
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
                  <li><span>Mode</span><strong>{isAgentConnected ? 'Voice Agent' : 'Text Chat'}</strong></li>
                  <li><span>Agent</span><strong>{isAgentConnected ? 'Connected' : 'Disconnected'}</strong></li>
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
          {transcript.length > 0 && (
            <div className="maya-transcript-toolbar">
              <button
                className="maya-export-button"
                onClick={exportTranscript}
                title="Copy transcript to clipboard"
              >
                <ClipboardCopy size={12} />
                {transcriptCopied ? 'Copied' : 'Export'}
              </button>
            </div>
          )}
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
                    {item.role === 'model' ? <Response>{item.text}</Response> : <span>{item.text}</span>}
                  </MessageContent>
                  {item.role === 'model' && conversation.canSendFeedback && !item.feedbackSent && (
                    <div className="maya-feedback-buttons">
                      <button onClick={() => handleFeedback(item.id, true)} title="Good response">
                        <ThumbsUp size={12} /> Good
                      </button>
                      <button onClick={() => handleFeedback(item.id, false)} title="Bad response">
                        <ThumbsDown size={12} /> Bad
                      </button>
                    </div>
                  )}
                  {item.role === 'model' && item.feedbackSent && (
                    <div className="maya-feedback-sent">
                      Feedback sent
                    </div>
                  )}
                </Message>
              ))
            )}

            {/* 3D Orb — reacts to both input and output audio */}
            {(isAgentConnected || isAgentConnecting) && (
              <div className="maya-orb-container">
                <Orb
                  agentState={getAgentState()}
                  colors={['#ff2d78', '#c2185b']}
                  volumeMode="manual"
                  manualInput={inputVolume}
                  manualOutput={outputVolume}
                />
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
            className={`maya-voice-button ${isAgentConnected && (agentMode === 'listening' || agentMode === 'speaking') ? 'active' : ''}`}
            onClick={() => {
              if (!isAgentConnected) {
                startAgentSession();
              } else {
                setMicMuted((prev) => !prev);
              }
            }}
            aria-label={isAgentConnected ? 'Toggle microphone' : 'Connect to agent'}
          >
            {isAgentConnected ? <Mic size={14} /> : <Volume2 size={14} />}
          </button>

          <input
            type="text"
            value={textInput}
            onChange={(event) => {
              setTextInput(event.target.value);
              if (isAgentConnected) {
                conversation.sendUserActivity();
              }
            }}
            placeholder={isAgentConnected ? 'Send text to Maya (or speak)...' : 'Ask Maya anything...'}
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
        PRMPT · MAYA JRVS v3.0
      </footer>

      {showMicSelector && (
        <GlassPanel variant="heavy" className="maya-modal maya-modal-sm">
          <div className="maya-modal-header">
            <h2>Microphone</h2>
            <button onClick={() => setShowMicSelector(false)}>Close</button>
          </div>
          <MicSelector
            value={selectedMic}
            onValueChange={handleMicChange}
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

      {errorLog.length > 0 && (
        <div className="maya-error-pill">
          <FileWarning size={12} />
          <span>{errorLog[0].code}</span>
        </div>
      )}
    </div>
  );
};

export default App;
