export interface EmotionScore {
  name: string;
  score: number;
}

export interface SentimentResult {
  topEmotions: EmotionScore[];
  timestamp: number;
  rawScores: EmotionScore[];
}

export interface HumeSentimentClientConfig {
  apiKey: string;
  onSentiment: (result: SentimentResult) => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class HumeSentimentClient {
  private ws: WebSocket | null = null;
  private config: HumeSentimentClientConfig;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_MS = 2000;
  private readonly HUME_WS_URL = 'wss://api.hume.ai/v0/stream/models';
  private isIntentionallyClosed = false;

  constructor(config: HumeSentimentClientConfig) {
    this.config = config;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.isIntentionallyClosed = false;
    const url = `${this.HUME_WS_URL}?apikey=${encodeURIComponent(this.config.apiKey)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('✅ Hume WebSocket connected');
      this.reconnectAttempts = 0;
      this.config.onConnected?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.handleHumeResponse(data);
      } catch (e) {
        console.error('Hume: failed to parse response', e);
      }
    };

    this.ws.onerror = (event) => {
      console.error('Hume WebSocket error:', event);
      this.config.onError?.('Hume connection error');
    };

    this.ws.onclose = (event) => {
      console.log('Hume WebSocket closed:', event.code, event.reason);
      this.config.onDisconnected?.();
      if (!this.isIntentionallyClosed && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    console.log(`Hume: reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.RECONNECT_DELAY_MS * this.reconnectAttempts);
  }

  sendAudioChunk(base64Audio: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload = {
      models: {
        prosody: {},
        burst: {},
      },
      data: base64Audio,
      stream_window_ms: 2000
    };
    this.ws.send(JSON.stringify(payload));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleHumeResponse(data: any): void {
    if (data.error) {
      console.error('Hume API error:', data.error);
      this.config.onError?.(data.error);
      return;
    }

    const prosody = data?.prosody?.predictions?.[0];
    const burst   = data?.burst?.predictions?.[0];
    if (!prosody?.emotions && !burst?.emotions) return;

    const scoreMap = new Map<string, number>();
    for (const e of (prosody?.emotions ?? [])) scoreMap.set(e.name, e.score);
    for (const e of (burst?.emotions   ?? [])) {
      const existing = scoreMap.get(e.name) ?? 0;
      if (e.score > existing) scoreMap.set(e.name, e.score);
    }

    const rawScores: EmotionScore[] = Array.from(scoreMap.entries()).map(([name, score]) => ({ name, score }));
    const topEmotions = [...rawScores]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    this.config.onSentiment({
      topEmotions,
      timestamp: Date.now(),
      rawScores,
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    this.reconnectAttempts = 0;
  }
}
