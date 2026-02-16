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
  readonly VITE_ELEVENLABS_VOICE_ID?: string;
  readonly VITE_ELEVENLABS_VOICE_LABEL?: string;
  readonly VITE_ELEVENLABS_VOICE_ID_ALT?: string;
  readonly VITE_ELEVENLABS_VOICE_LABEL_ALT?: string;
  readonly VITE_ELEVENLABS_OUTPUT_FORMAT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
