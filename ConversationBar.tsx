import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Keyboard, Send, Radio, Unplug } from 'lucide-react';
import { useConversation } from '@elevenlabs/react';
import TactileButton from './TactileButton';

interface ConversationBarProps {
  agentId: string;
  className?: string;
  waveformClassName?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (message: string, context?: unknown) => void;
  onMessage?: (message: { source: 'user' | 'ai'; message: string }) => void;
}

export const ConversationBar: React.FC<ConversationBarProps> = ({
  agentId,
  className = '',
  waveformClassName = '',
  onConnect,
  onDisconnect,
  onError,
  onMessage,
}) => {
  const [textInput, setTextInput] = useState('');
  const [showTextInput, setShowTextInput] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(40).fill(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);

  const conversation = useConversation({
    onConnect: () => {
      onConnect?.();
      setupAudioAnalysis();
    },
    onDisconnect: () => {
      onDisconnect?.();
      cleanupAudioAnalysis();
    },
    onError: (message, context) => {
      onError?.(message, context);
    },
    onMessage: (message) => {
      onMessage?.(message);
    },
  });

  const setupAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 128;
      source.connect(analyser);

      mediaStreamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      updateWaveform();
    } catch (error) {
      console.error('Failed to setup audio analysis:', error);
    }
  };

  const updateWaveform = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const bars = 40;
    const step = Math.floor(dataArray.length / bars);
    const normalized = Array.from({ length: bars }, (_, i) => {
      const value = dataArray[i * step] / 255;
      return Math.max(0.05, value * 1.5);
    });

    setWaveformData(normalized);
    animationFrameRef.current = requestAnimationFrame(updateWaveform);
  };

  const cleanupAudioAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    analyserRef.current = null;
    setWaveformData(new Array(40).fill(0));
  };

  useEffect(() => {
    return () => {
      cleanupAudioAnalysis();
    };
  }, []);

  const handleConnect = async () => {
    try {
      await conversation.startSession({ agentId, connectionType: 'webrtc' });
    } catch (error) {
      console.error('Failed to start conversation:', error);
    }
  };

  const handleDisconnect = () => {
    conversation.endSession();
  };

  const handleSendText = () => {
    if (!textInput.trim()) return;
    conversation.sendUserMessage(textInput.trim());
    setTextInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const getStatusText = () => {
    switch (conversation.status) {
      case 'disconnected':
        return 'LINK_IDLE';
      case 'connecting':
        return 'ESTABLISHING_UPLINK...';
      case 'connected':
        return 'LINK_ACTIVE';
      default:
        return 'UNKNOWN';
    }
  };

  const getStatusColor = () => {
    switch (conversation.status) {
      case 'connected':
        return 'text-cyan-400 phosphor-glow';
      case 'connecting':
        return 'text-yellow-400 animate-pulse';
      default:
        return 'text-zinc-600';
    }
  };

  const isMicMuted = !!conversation.micMuted;

  const handleToggleMicMute = () => {
    // TODO: Wire mic mute control once @elevenlabs/react exposes runtime setter in hook return.
    console.warn('Mic mute toggle unavailable in current @elevenlabs/react hook API.');
  };

  return (
    <div className={`flex flex-col gap-3 p-4 glass-panel neon-border ${className}`}>
      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 ${conversation.status === 'connected' ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.6)]' : conversation.status === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-zinc-700'}`} />
          <span className={`font-holo-label ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <TactileButton
            state={showTextInput ? 'online' : 'default'}
            onClick={() => setShowTextInput(!showTextInput)}
            icon={<Keyboard size={14} />}
            className="!px-3 !py-2"
          />

          {conversation.status === 'connected' && (
            <TactileButton
              state={isMicMuted ? 'error' : 'online'}
              onClick={handleToggleMicMute}
              icon={isMicMuted ? <MicOff size={14} /> : <Mic size={14} />}
              className="!px-3 !py-2"
            />
          )}

          {conversation.status === 'disconnected' ? (
            <TactileButton
              state="online"
              onClick={handleConnect}
              icon={<Radio size={14} />}
            >
              ESTABLISH_UPLINK
            </TactileButton>
          ) : (
            <TactileButton
              state="error"
              onClick={handleDisconnect}
              icon={<Unplug size={14} />}
            >
              SEVER_UPLINK
            </TactileButton>
          )}
        </div>
      </div>

      {/* Waveform Visualization */}
      {conversation.status === 'connected' && !isMicMuted && (
        <div className="flex items-center justify-center gap-0.5 h-16 glass-light neon-border p-2">
          {waveformData.map((value, i) => (
            <div
              key={i}
              className={`flex-1 transition-all duration-75 ${waveformClassName}`}
              style={{
                height: `${value * 100}%`,
                opacity: 0.4 + value * 0.6,
                background: `linear-gradient(to top, var(--holo-cyan-30), var(--holo-cyan))`,
                boxShadow: value > 0.3 ? `0 0 ${Math.round(value * 8)}px var(--holo-cyan-15)` : 'none',
              }}
            />
          ))}
        </div>
      )}

      {/* Text Input */}
      {showTextInput && (
        <div className="flex items-center gap-2 p-2 glass-light neon-border">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="INJECT_TRACE..."
            className="flex-1 bg-transparent text-zinc-300 font-holo-data text-sm placeholder:text-zinc-700 resize-none outline-none min-h-[40px] max-h-[120px]"
            rows={2}
          />
          <TactileButton
            state={textInput.trim() ? 'online' : 'default'}
            onClick={handleSendText}
            disabled={!textInput.trim()}
            icon={<Send size={14} />}
            className="!px-3 !py-2"
          />
        </div>
      )}
    </div>
  );
};
