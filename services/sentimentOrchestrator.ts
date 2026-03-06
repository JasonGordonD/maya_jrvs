import { HumeSentimentClient, SentimentResult } from './humeSentimentClient';

export interface SentimentOrchestratorConfig {
  humeApiKey: string;
  source?: 'caller' | 'agent';
  deviceId?: string;
  inputStream?: MediaStream;
  chunkIntervalMs?: number;
  onSentimentUpdate?: (formatted: string, result: SentimentResult) => void;
  onError?: (error: string) => void;
}

// MAYA JRVS — Chief of staff persona emotion set
// Tuned for professional operator context, NOT intimate/romantic
const MEANINGFUL_EMOTIONS = new Set([
  'Anger', 'Anxiety', 'Confusion', 'Contempt', 'Determination',
  'Distress', 'Doubt', 'Excitement', 'Fear', 'Frustration',
  'Happiness', 'Interest', 'Joy', 'Pain', 'Sadness',
  'Surprise (negative)', 'Surprise (positive)', 'Sympathy',
  'Tiredness', 'Triumph'
]);

const SCORE_THRESHOLD = 0.25;
const SAMPLE_RATE = 16000;

export class SentimentOrchestrator {
  private client: HumeSentimentClient;
  private micStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private latestSentiment: SentimentResult | null = null;
  private config: SentimentOrchestratorConfig;
  private isRunning = false;
  private pcmBuffer: Float32Array[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastChunkSentAt = 0;
  private usesManualAudioFeed = false;

  constructor(config: SentimentOrchestratorConfig) {
    this.config = config;
    this.client = new HumeSentimentClient({
      apiKey: config.humeApiKey,
      onSentiment: (result) => {
        this.latestSentiment = result;
        const formatted = this.formatSentimentForInjection(result);
        if (formatted) {
          config.onSentimentUpdate?.(formatted, result);
        }
      },
      onError: config.onError,
      onConnected: () => console.log('🎭 Hume sentiment pipeline active'),
      onDisconnected: () => console.log('🎭 Hume sentiment pipeline disconnected'),
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      this.usesManualAudioFeed =
        this.config.source === 'agent' && !this.config.inputStream && !this.config.deviceId;

      if (!this.usesManualAudioFeed) {
        if (this.config.inputStream) {
          const sourceTrack = this.config.inputStream.getAudioTracks()[0];
          if (!sourceTrack) {
            throw new Error('Provided input stream has no audio track');
          }
          // Clone to ensure orchestrator cleanup does not stop caller-owned tracks.
          this.micStream = new MediaStream([sourceTrack.clone()]);
        } else {
          const audioConstraints: MediaTrackConstraints = {
            sampleRate: SAMPLE_RATE,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          };
          if (this.config.deviceId) {
            audioConstraints.deviceId = { exact: this.config.deviceId };
          }
          this.micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        }
      }

      this.client.connect();

      if (!this.usesManualAudioFeed && this.micStream) {
        this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
        this.sourceNode = this.audioContext.createMediaStreamSource(this.micStream);

        const bufferSize = 4096;
        this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
        this.scriptProcessor.onaudioprocess = (event) => {
          const channelData = event.inputBuffer.getChannelData(0);
          this.pcmBuffer.push(new Float32Array(channelData));
        };

        this.sourceNode.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);
      }

      const chunkInterval = this.config.chunkIntervalMs ?? 2000;
      this.flushTimer = setInterval(() => this.flushPcmBuffer(), chunkInterval);
      this.heartbeatTimer = setInterval(() => this.sendHeartbeatPing(), 30000);

      this.isRunning = true;
      console.log(`🎭 Sentiment orchestrator started (${chunkInterval}ms WAV chunks @ ${SAMPLE_RATE}Hz)`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('SentimentOrchestrator: failed to start', error);
      this.config.onError?.(`Failed to start sentiment pipeline: ${error.message}`);
    }
  }

  feedAudioChunk(bytes: Uint8Array): void {
    if (!this.isRunning || bytes.length < 2) return;

    // ElevenLabs onAudio delivers 16-bit little-endian PCM bytes.
    const sampleCount = Math.floor(bytes.length / 2);
    if (sampleCount === 0) return;

    const pcm = new Float32Array(sampleCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
    for (let i = 0; i < sampleCount; i++) {
      const sample = view.getInt16(i * 2, true);
      pcm[i] = sample < 0 ? sample / 0x8000 : sample / 0x7FFF;
    }
    this.pcmBuffer.push(pcm);
  }

  private flushPcmBuffer(): void {
    this.maybeSendKeepalive();

    if (this.pcmBuffer.length === 0) return;
    if (!this.client.isConnected()) {
      this.pcmBuffer = [];
      return;
    }

    const totalSamples = this.pcmBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of this.pcmBuffer) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pcmBuffer = [];

    const MAX_SAMPLES = 80000; // 5 seconds at 16kHz — hard cap against Hume's limit
    const capped = merged.length > MAX_SAMPLES ? merged.slice(merged.length - MAX_SAMPLES) : merged;

    const wav = this.buildWav(capped);
    const base64 = this.arrayBufferToBase64(wav);
    this.client.sendAudioChunk(base64);
    this.lastChunkSentAt = Date.now();
  }

  private maybeSendKeepalive(): void {
    if (!this.client.isConnected()) return;
    if (Date.now() - this.lastChunkSentAt < 45000) return;

    // Send 0.5s of silence to prevent Hume keepalive ping timeout (1011)
    const silentSamples = new Float32Array(SAMPLE_RATE / 2);
    const wav = this.buildWav(silentSamples);
    const base64 = this.arrayBufferToBase64(wav);
    this.client.sendAudioChunk(base64);
    this.lastChunkSentAt = Date.now();
  }

  private sendHeartbeatPing(): void {
    const ws = (this.client as unknown as { ws?: WebSocket | null }).ws;
    if (ws?.readyState !== WebSocket.OPEN) return;

    // Hume's browser WebSocket client does not expose protocol-level ping frames,
    // so send an empty JSON object as an application-level keepalive.
    try {
      ws.send('{}');
    } catch {
      // Ignore transient send races if the socket closes between readyState check and send.
    }
  }

  private buildWav(pcmFloat32: Float32Array): ArrayBuffer {
    const numSamples = pcmFloat32.length;
    const bytesPerSample = 2;
    const dataSize = numSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, 16, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    let byteOffset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, pcmFloat32[i]));
      view.setInt16(byteOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      byteOffset += 2;
    }
    return buffer;
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  stop(): void {
    if (!this.isRunning) return;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }

    this.pcmBuffer = [];
    this.client.disconnect();
    this.latestSentiment = null;
    this.usesManualAudioFeed = false;
    this.isRunning = false;
    console.log('🎭 Sentiment orchestrator stopped');
  }

  getCachedSentimentUpdate(): string | null {
    if (!this.latestSentiment) return null;
    const ageSec = (Date.now() - this.latestSentiment.timestamp) / 1000;
    if (ageSec > 10) return null;
    return this.formatSentimentForInjection(this.latestSentiment);
  }

  private formatSentimentForInjection(result: SentimentResult): string | null {
    const meaningful = result.topEmotions.filter(
      e => MEANINGFUL_EMOTIONS.has(e.name) && e.score >= SCORE_THRESHOLD
    );
    if (meaningful.length === 0) return null;

    const emotionList = meaningful
      .slice(0, 3)
      .map(e => `${e.name} (${e.score.toFixed(2)})`)
      .join(', ');

    const source = this.config.source ?? 'caller';
    return `<sentiment_update source="${source}">${emotionList}</sentiment_update>`;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  get running(): boolean {
    return this.isRunning;
  }
}
