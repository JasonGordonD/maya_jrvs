import React, { useState, useEffect, useCallback } from 'react';
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
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionStream.getTracks().forEach((track) => track.stop());
      setHasPermission(true);

      // Enumerate devices
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = deviceList
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label.trim() || `Microphone ${device.deviceId.slice(0, 4)}`,
          groupId: device.groupId,
        }));

      setDevices(audioInputs);
    } catch (err: unknown) {
      // TODO: type this properly for browser media permission errors.
      const message = err instanceof Error ? err.message : 'Failed to load audio devices';
      setError(message);
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
      <div className="flex items-center gap-2 maya-panel p-2">
        {/* Mute Toggle */}
        <TactileButton
          state={isMuted ? 'offline' : 'online'}
          onClick={handleMuteToggle}
          disabled={disabled}
          icon={isMuted ? <MicOff size={14} /> : <Mic size={14} />}
          className="!px-3 !py-2"
        />

        {/* Device Selector */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled || loading}
          className="flex-1 flex items-center justify-between px-3 py-2 maya-surface border border-[var(--border-medium)] maya-mono text-xs uppercase tracking-wide text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="truncate">{loading ? 'LOADING...' : selectedDeviceLabel}</span>
          <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 maya-panel z-50 max-h-60 overflow-y-auto maya-scrollbar">
          {error && (
            <div className="p-3 maya-mono text-xs uppercase tracking-wide text-[var(--text-secondary)]">
              ERROR: {error}
              <button
                onClick={loadDevices}
                className="block mt-2 text-[var(--accent-warm)]"
              >
                RETRY
              </button>
            </div>
          )}

          {!hasPermission && !error && (
            <div className="p-3 maya-mono text-xs uppercase tracking-wide text-[var(--text-secondary)]">
              PERMISSION_REQUIRED
              <button
                onClick={loadDevices}
                className="block mt-2 text-[var(--accent-warm)]"
              >
                GRANT_ACCESS
              </button>
            </div>
          )}

          {devices.length === 0 && !loading && !error && (
            <div className="p-3 maya-mono text-xs uppercase tracking-wide text-[var(--text-secondary)]">NO_DEVICES_FOUND</div>
          )}

          {devices.map((device) => (
            <button
              key={device.deviceId}
              onClick={() => handleDeviceSelect(device.deviceId)}
              className={`w-full px-3 py-2 text-left maya-mono text-xs uppercase tracking-wide transition-colors ${
                device.deviceId === selectedDevice
                  ? 'bg-[var(--glass-hover)] text-[var(--text-primary)] border-l-2 border-[var(--accent-warm)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass)]'
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
