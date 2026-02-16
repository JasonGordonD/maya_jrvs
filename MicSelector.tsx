import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, ChevronDown } from 'lucide-react';
import TactileButton from './TactileButton';

interface AudioDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

/**
 * Hook for managing audio input devices
 */
export const useAudioDevices = () => {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState(false);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);

      // Enumerate devices
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = deviceList
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label.replace(/\s*\(.*?\)\s*/g, '').trim() || `Microphone ${device.deviceId.slice(0, 4)}`,
          groupId: device.groupId,
        }));

      setDevices(audioInputs);
    } catch (err: any) {
      setError(err.message || 'Failed to load audio devices');
      setHasPermission(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();

    // Listen for device changes
    const handleDeviceChange = () => {
      loadDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadDevices]);

  return { devices, loading, error, hasPermission, loadDevices };
};

/**
 * Live waveform visualization for audio preview
 */
const LiveWaveform: React.FC<{ deviceId: string; muted: boolean }> = ({ deviceId, muted }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(50).fill(0));
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    if (muted) return;

    const setupAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: deviceId ? { exact: deviceId } : undefined },
        });

        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        source.connect(analyser);

        streamRef.current = stream;
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        const updateWaveform = () => {
          if (!analyserRef.current) return;

          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);

          const bars = 50;
          const step = Math.floor(dataArray.length / bars);
          const normalized = Array.from({ length: bars }, (_, i) => {
            const value = dataArray[i * step] / 255;
            return Math.max(0.02, value);
          });

          setWaveformData(normalized);
          animationFrameRef.current = requestAnimationFrame(updateWaveform);
        };

        updateWaveform();
      } catch (error) {
        console.error('Failed to setup audio preview:', error);
      }
    };

    setupAudio();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [deviceId, muted]);

  return (
    <div className="flex items-center gap-0.5 h-8 px-2">
      {waveformData.map((value, i) => (
        <div
          key={i}
          className="flex-1 transition-all duration-75"
          style={{
            height: `${value * 100}%`,
            opacity: muted ? 0.1 : 0.3 + value * 0.7,
            minHeight: '2px',
            background: `linear-gradient(to top, var(--holo-cyan-30), var(--holo-cyan))`,
            boxShadow: !muted && value > 0.3 ? `0 0 ${Math.round(value * 8)}px var(--holo-cyan-15)` : 'none',
          }}
        />
      ))}
    </div>
  );
};

interface MicSelectorProps {
  value?: string;
  onValueChange?: (deviceId: string) => void;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const MicSelector: React.FC<MicSelectorProps> = ({
  value,
  onValueChange,
  muted: controlledMuted,
  onMutedChange,
  disabled = false,
  className = '',
}) => {
  const { devices, loading, error, hasPermission, loadDevices } = useAudioDevices();
  const [isOpen, setIsOpen] = useState(false);
  const [internalMuted, setInternalMuted] = useState(false);
  const [internalValue, setInternalValue] = useState('');

  const isMuted = controlledMuted !== undefined ? controlledMuted : internalMuted;
  const selectedDevice = value !== undefined ? value : internalValue;

  // Auto-select first device if none selected
  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) {
      const firstDeviceId = devices[0].deviceId;
      if (value === undefined) {
        setInternalValue(firstDeviceId);
      }
      onValueChange?.(firstDeviceId);
    }
  }, [devices, selectedDevice, value, onValueChange]);

  const handleMuteToggle = () => {
    const newMuted = !isMuted;
    if (controlledMuted === undefined) {
      setInternalMuted(newMuted);
    }
    onMutedChange?.(newMuted);
  };

  const handleDeviceSelect = (deviceId: string) => {
    if (value === undefined) {
      setInternalValue(deviceId);
    }
    onValueChange?.(deviceId);
    setIsOpen(false);
  };

  const selectedDeviceLabel =
    devices.find((d) => d.deviceId === selectedDevice)?.label || 'Select Microphone';

  return (
    <div className={`relative ${className}`}>
      {/* Main Control */}
      <div className="flex items-center gap-2 glass-panel neon-border p-2">
        {/* Mute Toggle */}
        <TactileButton
          state={isMuted ? 'error' : 'online'}
          onClick={handleMuteToggle}
          disabled={disabled}
          icon={isMuted ? <MicOff size={14} /> : <Mic size={14} />}
          className="!px-3 !py-2"
        />

        {/* Device Selector */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled || loading}
          className="flex-1 flex items-center justify-between px-3 py-2 glass-light neon-border font-holo-label text-zinc-300 hover:border-[rgba(34,211,238,0.4)] holo-interactive disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="truncate">{loading ? 'LOADING...' : selectedDeviceLabel}</span>
          <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''} text-cyan-400`} />
        </button>
      </div>

      {/* Preview Waveform */}
      {selectedDevice && (
        <div className="mt-2 glass-light neon-border">
          <LiveWaveform deviceId={selectedDevice} muted={isMuted} />
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 glass-heavy neon-border-strong z-50 max-h-60 overflow-y-auto holo-scrollbar">
          {error && (
            <div className="p-3 font-holo-label neon-text-red">
              ERROR: {error}
              <button
                onClick={loadDevices}
                className="block mt-2 text-cyan-400 hover:text-cyan-300 neon-text-subtle"
              >
                RETRY
              </button>
            </div>
          )}

          {!hasPermission && !error && (
            <div className="p-3 font-holo-label text-yellow-400">
              PERMISSION_REQUIRED
              <button
                onClick={loadDevices}
                className="block mt-2 text-cyan-400 hover:text-cyan-300 neon-text-subtle"
              >
                GRANT_ACCESS
              </button>
            </div>
          )}

          {devices.length === 0 && !loading && !error && (
            <div className="p-3 font-holo-label text-zinc-500">NO_DEVICES_FOUND</div>
          )}

          {devices.map((device) => (
            <button
              key={device.deviceId}
              onClick={() => handleDeviceSelect(device.deviceId)}
              className={`w-full px-3 py-2 text-left font-holo-label transition-colors ${
                device.deviceId === selectedDevice
                  ? 'glass-light text-cyan-400 border-l-2 border-cyan-500 neon-text-subtle shadow-[0_0_8px_rgba(34,211,238,0.1)]'
                  : 'text-zinc-400 hover:text-cyan-400 hover:bg-[rgba(34,211,238,0.05)]'
              }`}
            >
              {device.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
