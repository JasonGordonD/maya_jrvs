# AGENTS.md

Instructions for AI coding agents working on the Maya JRVS codebase.

## Project overview

Maya JRVS is a browser-based executive AI assistant. The frontend is React 19 + Vite 6 with TypeScript. All LLM and voice calls are proxied through Supabase Edge Functions (Deno runtime) so that API keys never touch the browser.

## Tech stack

- **Language**: TypeScript (strict mode)
- **Frontend**: React 19, Vite 6, Tailwind CSS 3
- **Edge functions**: Deno (Supabase Edge Functions), no npm imports — use `https://esm.sh/` for third-party modules
- **Voice**: ElevenLabs TTS via edge proxy (`mjrvs_tts`), STT via Web Speech API or optional realtime websocket proxy
- **Icons**: `lucide-react`
- **Fonts**: DM Sans (UI), IBM Plex Mono (system labels, metadata)

## Repository layout

```
/                          # Repo root is also the frontend source root
├── App.tsx                # Main application component (model selector, chat, sidebar)
├── index.tsx              # React entry point
├── index.html             # HTML shell
├── index.css              # Global styles + CSS custom properties (design tokens)
├── types.ts               # Shared TypeScript interfaces (TranscriptItem, MayaState, etc.)
├── utils.ts               # Utility functions (ElevenLabs voice parameter calculation)
├── vite.config.ts         # Vite config (port 3001, path alias @/ -> repo root)
├── tsconfig.json          # TypeScript config
├── components/
│   └── ControlDeck.tsx    # Status monitor + text input panel
├── hooks/
│   ├── useElevenLabs.ts   # TTS hook (ElevenLabs proxy or Web Speech API fallback)
│   └── useSpeechToText.ts # STT hook (Web Speech API or realtime websocket proxy)
├── services/
│   ├── gemini.ts          # Frontend LLM client (calls mjrvs_llm edge function)
│   └── supabaseConfig.ts  # Browser-side Supabase URL/key resolution + auth headers
├── supabase/functions/
│   ├── mjrvs_llm/index.ts    # Multi-provider LLM router (Google, Anthropic, xAI, Mistral)
│   ├── mjrvs_tts/index.ts    # ElevenLabs TTS proxy
│   └── mjrvs_vision/index.ts # Media analysis (Gemini, Grok Vision, Voyage embeddings)
├── Message.tsx            # Chat message rendering
├── Response.tsx           # Streaming response display
├── ConversationBar.tsx    # Conversation bar UI
├── FileUpload.tsx         # File upload component
├── MicSelector.tsx        # Microphone device selector
├── GlassPanel.tsx         # Frosted glass panel component
├── TactileButton.tsx      # Styled button component
├── RadarChart.tsx         # Radar chart visualization
├── ComponentShowcase.tsx  # Component demo page
└── Orb.tsx                # (Empty placeholder)
```

## Coding conventions

### TypeScript

- Strict mode is enabled. Do not use `any` unless absolutely necessary; prefer `unknown` with type narrowing.
- Export types alongside their modules. Shared types go in `types.ts`.
- Use `type` for object shapes and `interface` only when declaration merging is needed.
- Error handling: catch `unknown`, narrow with `instanceof Error`.

### React

- Functional components only. Use hooks (`useState`, `useRef`, `useEffect`, `useCallback`, `useMemo`).
- Components are `.tsx` files at the repo root or in `components/`.
- Hooks live in `hooks/` and are named `use*.ts`.
- Services live in `services/` and are plain `.ts` files.

### CSS / styling

- Tailwind CSS utility classes for layout and spacing.
- Design tokens are CSS custom properties defined in `index.css` (e.g. `--bg-void`, `--bg-surface`, `--accent-warm`, `--text-primary`). Reference them via `var(--token-name)` in Tailwind arbitrary values like `bg-[var(--bg-surface)]`.
- The `.maya-mono` class applies IBM Plex Mono for system/label text.
- No CSS modules. No styled-components.

### Edge functions (Deno)

- Each edge function is a single `index.ts` file in `supabase/functions/<name>/`.
- They use `Deno.serve()` and run in Deno, not Node.js.
- Third-party imports use URL imports (`https://esm.sh/`), not npm.
- API keys are read from `Deno.env.get("KEY_NAME")` — never hardcoded.
- All edge functions return JSON with CORS headers for `*` origin.
- HTTP errors use a local `HttpError` class pattern (status + payload).

## LLM provider routing

The `mjrvs_llm` edge function routes by model prefix:

| Prefix        | Provider  | API key env var    |
|---------------|----------|--------------------|
| `gemini-*`    | Google   | `GEMINI_API_KEY`   |
| `claude-*`    | Anthropic| `ANTHROPIC_API_KEY`|
| `grok-*`      | xAI      | `XAI_API_KEY`      |
| `mistral-*` / `magistral-*` | Mistral | `MISTRAL_API_KEY` |

If a non-Google provider key is missing, the function falls back to `gemini-3-flash-preview` automatically.

## Supported models

Update the `SUPPORTED_MODELS` set in `supabase/functions/mjrvs_llm/index.ts` **and** the `MODEL_OPTIONS` array in `App.tsx` when adding or removing models. Keep them in sync.

## Environment variables

### Browser (Vite)

All browser-accessible env vars must be prefixed `VITE_`. Set them in `.env.local` (gitignored).

Required:
- `VITE_SUPABASE_URL` — Supabase project URL (falls back to hardcoded default)

Optional:
- `VITE_SUPABASE_KEY` or `VITE_SUPABASE_ANON_KEY` — publishable anon key
- `VITE_STT_PROXY_WS_URL` — websocket URL for realtime STT proxy
- `VITE_ELEVENLABS_AUTO_MODE` — `"true"` to default to ElevenLabs TTS engine
- `VITE_ELEVENLABS_VOICE_ID`, `VITE_ELEVENLABS_OUTPUT_FORMAT`, `VITE_ELEVENLABS_MODEL_ID`

### Edge function secrets (Supabase)

- `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `MISTRAL_API_KEY`
- `ELEVENLABS_API_KEY` (for `mjrvs_tts`)
- `VOYAGE_API_KEY` (for `mjrvs_vision` embeddings)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (for `mjrvs_vision` DB access)

## Build and validation

```bash
npm install          # Install dependencies
npm run dev          # Dev server on http://localhost:3001
npm run build        # Production build
npx tsc --noEmit     # Type check (must pass before committing)
```

Always run `npx tsc --noEmit` to verify type correctness. There is no linter or test runner configured; the type checker is the primary validation gate.

## Important rules

1. **No API keys in the browser.** All provider keys must stay in edge function environment variables. The browser only sends the Supabase anon key (public).
2. **Keep model lists in sync.** `SUPPORTED_MODELS` in `mjrvs_llm/index.ts` and `MODEL_OPTIONS` in `App.tsx` must match.
3. **System prompt lives in `services/gemini.ts`.** The `SYSTEM_PROMPT` constant defines Maya's personality. Edit with care — it is sent with every LLM request.
4. **Edge functions are Deno, not Node.** Do not use `require()`, `process.env`, or Node-only APIs. Use `Deno.env.get()`, URL imports, and Web APIs.
5. **Path alias.** `@/` resolves to the repo root (configured in `vite.config.ts` and `tsconfig.json`).
6. **No test suite.** Validate changes with `npx tsc --noEmit` and `npm run build`.
7. **Voice fallback.** If ElevenLabs TTS fails, the `useElevenLabs` hook automatically falls back to the browser's native Web Speech API. Do not break this fallback path.
8. **CORS.** All edge functions include permissive CORS headers. Do not remove them — the frontend calls these functions cross-origin.
