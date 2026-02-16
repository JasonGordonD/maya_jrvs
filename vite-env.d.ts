/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_PUBLIC_SUPABASE_URL?: string;
  readonly VITE_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly VITE_NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly VITE_NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly VITE_STT_PROXY_WS_URL?: string;
  readonly VITE_ELEVENLABS_AUTO_MODE?: string;
  readonly VITE_ELEVENLABS_VOICE_ID?: string;
  readonly VITE_ELEVENLABS_OUTPUT_FORMAT?: string;
  readonly VITE_ELEVENLABS_MODEL_ID?: string;
  readonly VITE_TTS_ENGINE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
