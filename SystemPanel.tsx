import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Cpu,
  Radio,
  Server,
  Shield,
  Thermometer,
  Zap,
} from 'lucide-react';
import { ErrorLogEntry, MayaState } from './types';
import { RadarChart } from './RadarChart';

interface SystemPanelProps {
  isAgentConnected: boolean;
  agentMode: 'listening' | 'speaking' | null;
  selectedModel: string;
  provider: string;
  transcript: { id: string; role: string; text: string; timestamp: Date }[];
  errorLog: ErrorLogEntry[];
  sessionElapsed: string;
  currentNode: string | null;
  mayaState?: MayaState;
  className?: string;
}

const DEFAULT_STATE: MayaState = {
  personality: {
    caution_level: 42,
    formality_level: 58,
    trust_level: 71,
    relationship_depth: 65,
  },
  cognitive_soma: {
    context_pressure: 0.0,
    synchrony: 0.0,
    verification_itch: 0.0,
    friction_load: 0.0,
    semantic_gravity: 0.0,
  },
  error_patterns: {
    padding_corrections: 0,
    character_contamination: 0,
    silent_substitutions: 0,
    verification_failures: 0,
  },
};

const SomaGauge: React.FC<{ label: string; value: number; max?: number }> = ({
  label,
  value,
  max = 1,
}) => {
  const pct = Math.min(100, (value / max) * 100);
  const isElevated = pct > 60;
  const isCritical = pct > 85;

  return (
    <div className="maya-soma-gauge">
      <div className="maya-soma-gauge-header">
        <span className="maya-soma-gauge-label">{label}</span>
        <span
          className={`maya-soma-gauge-value ${isCritical ? 'critical' : isElevated ? 'elevated' : ''}`}
        >
          {value.toFixed(2)}
        </span>
      </div>
      <div className="maya-soma-gauge-track">
        <div
          className={`maya-soma-gauge-fill ${isCritical ? 'critical' : isElevated ? 'elevated' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const ErrorLogRow: React.FC<{ entry: ErrorLogEntry }> = ({ entry }) => {
  const time = entry.timestamp;
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${time.getSeconds().toString().padStart(2, '0')}`;

  return (
    <div className="maya-error-log-row">
      <span className="maya-error-log-time">{timeStr}</span>
      <span className={`maya-error-log-source maya-error-source-${entry.source.toLowerCase()}`}>
        {entry.source}
      </span>
      <span className="maya-error-log-code">{entry.code}</span>
      <span className="maya-error-log-msg">{entry.message}</span>
    </div>
  );
};

export const SystemPanel: React.FC<SystemPanelProps> = ({
  isAgentConnected,
  agentMode,
  selectedModel,
  provider,
  transcript,
  errorLog,
  sessionElapsed,
  currentNode,
  mayaState,
  className = '',
}) => {
  const state = mayaState || DEFAULT_STATE;

  const subsystems = useMemo(
    () => [
      {
        label: 'VOICE_AGENT',
        status: isAgentConnected ? 'online' : 'offline',
        detail: isAgentConnected
          ? agentMode === 'speaking'
            ? 'TX_ACTIVE'
            : agentMode === 'listening'
              ? 'RX_ACTIVE'
              : 'STANDBY'
          : 'DISCONNECTED',
      },
      {
        label: 'LLM_ROUTER',
        status: 'online' as const,
        detail: `${selectedModel} · ${provider.toUpperCase()}`,
      },
      {
        label: 'MEMORY',
        status: transcript.length > 0 ? ('online' as const) : ('offline' as const),
        detail: `${transcript.length} TURNS`,
      },
      {
        label: 'VISION',
        status: transcript.some((t) => t.text.toLowerCase().includes('vision'))
          ? ('online' as const)
          : ('offline' as const),
        detail: 'mjrvs_vision',
      },
      {
        label: 'ERROR_BUS',
        status: errorLog.length > 0 ? ('warning' as const) : ('online' as const),
        detail: `${errorLog.length} EVENT${errorLog.length !== 1 ? 'S' : ''}`,
      },
    ],
    [isAgentConnected, agentMode, selectedModel, provider, transcript, errorLog]
  );

  const radarData = useMemo(
    () => ({
      caution: state.personality.caution_level,
      formality: state.personality.formality_level,
      trust: state.personality.trust_level,
      depth: state.personality.relationship_depth,
    }),
    [state.personality]
  );

  const totalErrors = useMemo(
    () =>
      state.error_patterns.padding_corrections +
      state.error_patterns.character_contamination +
      state.error_patterns.silent_substitutions +
      state.error_patterns.verification_failures,
    [state.error_patterns]
  );

  return (
    <div className={`maya-system-panel maya-scrollbar ${className}`}>
      {/* Section: Status Overview */}
      <section className="maya-sys-section">
        <div className="maya-sys-section-header">
          <Cpu size={12} />
          <span>System Status</span>
          <span className="maya-sys-uptime">{sessionElapsed}</span>
        </div>

        <div className="maya-sys-subsystem-grid">
          {subsystems.map((sub) => (
            <div key={sub.label} className="maya-sys-subsystem-card">
              <div className="maya-sys-subsystem-row">
                <span
                  className={`maya-sys-dot ${
                    sub.status === 'online'
                      ? 'online'
                      : sub.status === 'warning'
                        ? 'warning'
                        : ''
                  }`}
                />
                <span className="maya-sys-subsystem-label">{sub.label}</span>
              </div>
              <span className="maya-sys-subsystem-detail">{sub.detail}</span>
            </div>
          ))}
        </div>

        {currentNode && (
          <div className="maya-sys-node-badge">
            <Radio size={10} />
            <span>NODE: {currentNode}</span>
          </div>
        )}
      </section>

      {/* Section: Cognitive Soma */}
      <section className="maya-sys-section">
        <div className="maya-sys-section-header">
          <BrainCircuit size={12} />
          <span>Cognitive Soma</span>
        </div>

        <div className="maya-sys-soma-grid">
          <SomaGauge label="CTX_PRESSURE" value={state.cognitive_soma.context_pressure} />
          <SomaGauge label="SYNCHRONY" value={state.cognitive_soma.synchrony} />
          <SomaGauge label="VERIFY_ITCH" value={state.cognitive_soma.verification_itch} />
          <SomaGauge label="FRICTION" value={state.cognitive_soma.friction_load} />
          <SomaGauge label="SEM_GRAVITY" value={state.cognitive_soma.semantic_gravity} />
        </div>
      </section>

      {/* Section: Personality Radar */}
      <section className="maya-sys-section">
        <div className="maya-sys-section-header">
          <Shield size={12} />
          <span>Personality Vector</span>
        </div>
        <RadarChart data={radarData} size={160} />
      </section>

      {/* Section: Error Patterns */}
      <section className="maya-sys-section">
        <div className="maya-sys-section-header">
          <Thermometer size={12} />
          <span>Error Patterns</span>
          <span className="maya-sys-error-count">{totalErrors}</span>
        </div>

        <div className="maya-sys-error-pattern-grid">
          <div className="maya-sys-error-pattern-item">
            <span>PAD_CORRECTIONS</span>
            <strong>{state.error_patterns.padding_corrections}</strong>
          </div>
          <div className="maya-sys-error-pattern-item">
            <span>CHAR_CONTAMINATION</span>
            <strong>{state.error_patterns.character_contamination}</strong>
          </div>
          <div className="maya-sys-error-pattern-item">
            <span>SILENT_SUBS</span>
            <strong>{state.error_patterns.silent_substitutions}</strong>
          </div>
          <div className="maya-sys-error-pattern-item">
            <span>VERIFY_FAIL</span>
            <strong>{state.error_patterns.verification_failures}</strong>
          </div>
        </div>
      </section>

      {/* Section: Error Log */}
      <section className="maya-sys-section">
        <div className="maya-sys-section-header">
          <AlertTriangle size={12} />
          <span>Error Log</span>
          <span className="maya-sys-error-count">{errorLog.length}</span>
        </div>

        {errorLog.length === 0 ? (
          <div className="maya-sys-empty">
            <Zap size={14} />
            <span>NO_ERRORS_RECORDED</span>
          </div>
        ) : (
          <div className="maya-sys-error-log">
            {errorLog.slice(0, 20).map((entry) => (
              <ErrorLogRow key={entry.id} entry={entry} />
            ))}
            {errorLog.length > 20 && (
              <div className="maya-sys-error-log-overflow">
                +{errorLog.length - 20} MORE
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section: Runtime Info */}
      <section className="maya-sys-section">
        <div className="maya-sys-section-header">
          <Server size={12} />
          <span>Runtime</span>
        </div>

        <div className="maya-sys-runtime-grid">
          <div className="maya-sys-runtime-item">
            <span>FRAMEWORK</span>
            <strong>React 19 + Vite 6</strong>
          </div>
          <div className="maya-sys-runtime-item">
            <span>VOICE_SDK</span>
            <strong>@elevenlabs/react</strong>
          </div>
          <div className="maya-sys-runtime-item">
            <span>BACKEND</span>
            <strong>Supabase Edge</strong>
          </div>
          <div className="maya-sys-runtime-item">
            <span>VERSION</span>
            <strong>v3.0</strong>
          </div>
        </div>
      </section>
    </div>
  );
};
