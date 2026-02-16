import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
} from "react";
import type { ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { Search, Play, Pause, ChevronDown, Check, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Audio Player context – shared playback state across voice items    */
/* ------------------------------------------------------------------ */

interface AudioPlayerContextValue {
  currentUrl: string | null;
  isPlaying: boolean;
  play: (url: string) => void;
  pause: () => void;
  toggle: (url: string) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue>({
  currentUrl: null,
  isPlaying: false,
  play: () => {},
  pause: () => {},
  toggle: () => {},
});

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = useCallback((url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    setCurrentUrl(url);
    setIsPlaying(true);

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentUrl(null);
    };
    audio.onerror = () => {
      setIsPlaying(false);
      setCurrentUrl(null);
    };
    audio.play().catch(() => {
      setIsPlaying(false);
      setCurrentUrl(null);
    });
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(
    (url: string) => {
      if (currentUrl === url && isPlaying) {
        pause();
      } else {
        play(url);
      }
    },
    [currentUrl, isPlaying, pause, play]
  );

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{ currentUrl, isPlaying, play, pause, toggle }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
};

const useAudioPlayer = () => useContext(AudioPlayerContext);

/* ------------------------------------------------------------------ */
/*  Mini Orb – small visual representation for each voice              */
/* ------------------------------------------------------------------ */

const MiniOrb: React.FC<{ name: string; size?: number }> = ({
  name,
  size = 32,
}) => {
  const hue = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < (name ?? "").length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
  }, [name]);

  return (
    <div
      className="voice-picker-orb"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 35% 35%, hsl(${hue}, 55%, 60%), hsl(${hue}, 45%, 30%))`,
        boxShadow: `0 0 8px hsla(${hue}, 50%, 50%, 0.3)`,
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/*  Voice Item – single row inside the dropdown                        */
/* ------------------------------------------------------------------ */

interface VoiceItemProps {
  voice: ElevenLabs.Voice;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: () => void;
}

const VoiceItem: React.FC<VoiceItemProps> = ({
  voice,
  isSelected,
  isFocused,
  onSelect,
}) => {
  const { currentUrl, isPlaying, toggle } = useAudioPlayer();
  const previewUrl = voice.previewUrl ?? null;
  const isThisPlaying =
    previewUrl !== null && currentUrl === previewUrl && isPlaying;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      data-focused={isFocused}
      className={`voice-picker-item ${isFocused ? "focused" : ""} ${isSelected ? "selected" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <MiniOrb name={voice.name ?? "Unknown"} size={28} />

      <div className="voice-picker-item-info">
        <span className="voice-picker-item-name">{voice.name ?? "Unknown"}</span>
        {voice.labels && Object.keys(voice.labels).length > 0 && (
          <span className="voice-picker-item-labels">
            {Object.values(voice.labels).slice(0, 2).join(" · ")}
          </span>
        )}
      </div>

      {previewUrl && (
        <button
          type="button"
          className="voice-picker-play-btn"
          aria-label={isThisPlaying ? "Pause preview" : "Play preview"}
          onClick={(e) => {
            e.stopPropagation();
            toggle(previewUrl);
          }}
        >
          {isThisPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>
      )}

      {isSelected && (
        <Check size={14} className="voice-picker-check" />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  VoicePicker – main exported component                              */
/* ------------------------------------------------------------------ */

export interface VoicePickerProps {
  /** Required. Array of ElevenLabs voices. */
  voices: ElevenLabs.Voice[];
  /** Selected voice ID (controlled). */
  value?: string;
  /** Callback when selection changes. */
  onValueChange?: (value: string) => void;
  /** Placeholder text when no voice selected. */
  placeholder?: string;
  /** Optional CSS classes for the trigger button. */
  className?: string;
  /** Control popover open state. */
  open?: boolean;
  /** Callback when popover open state changes. */
  onOpenChange?: (open: boolean) => void;
}

export const VoicePicker: React.FC<VoicePickerProps> = ({
  voices,
  value,
  onValueChange,
  placeholder = "Select a voice...",
  className,
  open: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);

  const isControlledOpen = controlledOpen !== undefined;
  const isOpen = isControlledOpen ? controlledOpen : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlledOpen) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlledOpen, onOpenChange]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.voiceId === value),
    [voices, value]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return voices;
    const q = search.toLowerCase();
    return voices.filter((v) => (v.name ?? "").toLowerCase().includes(q));
  }, [voices, search]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [search]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setFocusedIndex(0);
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, setOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          const focused = filtered[focusedIndex];
          if (focused) {
            onValueChange?.(focused.voiceId);
            setOpen(false);
          }
          break;
        }
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [isOpen, filtered, focusedIndex, onValueChange, setOpen]
  );

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const el = listRef.current.children[focusedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, isOpen]);

  return (
    <AudioPlayerProvider>
      <div
        ref={containerRef}
        className={`voice-picker ${className ?? ""}`}
        onKeyDown={handleKeyDown}
      >
        {/* Trigger button */}
        <button
          type="button"
          className="voice-picker-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onClick={() => setOpen(!isOpen)}
        >
          {selectedVoice ? (
            <span className="voice-picker-trigger-content">
              <MiniOrb name={selectedVoice.name ?? ""} size={20} />
              <span className="voice-picker-trigger-name">
                {selectedVoice.name}
              </span>
            </span>
          ) : (
            <span className="voice-picker-trigger-placeholder">
              {placeholder}
            </span>
          )}
          <ChevronDown
            size={14}
            className={`voice-picker-chevron ${isOpen ? "rotated" : ""}`}
          />
        </button>

        {/* Dropdown popover */}
        {isOpen && (
          <div className="voice-picker-popover" role="dialog">
            {/* Search bar */}
            <div className="voice-picker-search-wrap">
              <Search size={14} className="voice-picker-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="voice-picker-search"
                placeholder="Search voices..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search voices"
              />
              {search && (
                <button
                  type="button"
                  className="voice-picker-search-clear"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Voice list */}
            <div
              ref={listRef}
              className="voice-picker-list"
              role="listbox"
              aria-label="Voices"
            >
              {filtered.length === 0 ? (
                <div className="voice-picker-empty">No voices found.</div>
              ) : (
                filtered.map((voice, index) => (
                  <VoiceItem
                    key={voice.voiceId}
                    voice={voice}
                    isSelected={voice.voiceId === value}
                    isFocused={index === focusedIndex}
                    onSelect={() => {
                      onValueChange?.(voice.voiceId);
                      setOpen(false);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </AudioPlayerProvider>
  );
};

export default VoicePicker;
