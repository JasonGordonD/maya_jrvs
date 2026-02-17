# Orphan Branch Delta Report

Generated: 2026-02-17 13:54 UTC
Compared against: `main` @ `0779987b785d06a691ac3987c2f44cf0af82f264` (origin/main)

---

## Summary Table

| Branch | Total Commits | Already on Main | Clean Apply | Conflicts | Dead Target | New Files |
|--------|--------------|-----------------|-------------|-----------|-------------|-----------|
| `cursor/agent-configuration-conversation-failure-2065` | 8 | 12 | 0 | 0 | 0 | 0 |
| `cursor/agents-markdown-file-6388` | 1 | 0 | 0 | 0 | 0 | 1 |
| `cursor/maya-jrvs-system-prompt-a399` | 14 | 0 | 12 | 16 | 4 | 2 |
| `cursor/voice-picker-component-c5f1` | 2 | 0 | 2 | 1 | 0 | 6 |
| `cursor/elevenlabs-maya-workflow-74b0` | 1 | 0 | 0 | 1 | 0 | 1 |
| `cursor/jrsv-code-quality-44ad` | 5 | 6 | 0 | 0 | 0 | 0 |

> File-level counts: each file in each commit is counted separately. A single commit touching 3 files produces 3 file-level entries.

---

## Key Context

- Commits `eabbc69` and `8d7cc73` on main rewrote the voice system:
  - `eabbc69` — Rewrote `App.tsx` (232 insertions, 122 deletions): replaced homebrew `useElevenLabs`/`useSpeechToText` hooks with `@elevenlabs/react` `useConversation` agent hook.
  - `8d7cc73` — Deleted `hooks/useElevenLabs.ts` and `hooks/useSpeechToText.ts`, cleaned up env vars in `README.md`, `package-lock.json`, `vite-env.d.ts`.
- Fork point for branches 1–4: `c9aef85` (Rename voice engine labels to ElevenLabs).
- Fork point for branch 5: `9ddfb89` (Allow cross-origin access for mjrvs_llm edge function).
- Fork point for branch 6: `7cc12b3` (Update README for edge-routed architecture and new UI system).

---

## Branch 1: `cursor/agent-configuration-conversation-failure-2065`

**Fork point:** `c9aef85` — Rename voice engine labels to ElevenLabs
**Verdict:** All 8 commits are cherry-picks of commits already on main. Diffs are byte-identical.

### Commit 1: `72cbf5c` — Add conversation failure analysis for conv_2801khnhjqynetqrp7f2xzg67jp8

Cherry-picked to main as `3590a86`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `analysis-conversation-failure-2065.md` | EXISTS | ALREADY ON MAIN | Identical diff in `3590a86` |

**Change description:** Creates a new analysis document investigating a specific conversation failure.

### Commit 2: `f324649` — Expand fix options: per-node custom LLM, native-everywhere, remove null override, cascade workaround

Cherry-picked to main as `c0936e6`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `analysis-conversation-failure-2065.md` | EXISTS | ALREADY ON MAIN | Identical diff in `c0936e6` |

**Change description:** Expands the analysis document with additional fix options and workarounds.

### Commit 3: `6b522ac` — Add SDK documentation-backed findings: api_type, custom_llm coupling, native model list, and refined recommendations

Cherry-picked to main as `0facd49`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `analysis-conversation-failure-2065.md` | EXISTS | ALREADY ON MAIN | Identical diff in `0facd49` |

**Change description:** Adds SDK documentation references and refines recommendations in the analysis.

### Commit 4: `9bdca82` — Identify platform bug via backup_llm_config evidence; revise recommendation to all-native with bug report

Cherry-picked to main as `4a8a60a`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `analysis-conversation-failure-2065.md` | EXISTS | ALREADY ON MAIN | Identical diff in `4a8a60a` |

**Change description:** Identifies a platform bug using backup_llm_config evidence and revises recommendations.

### Commit 5: `df87927` — Preserve Opus as foundational: multi-provider custom-llm per node with verified Chat Completions endpoints

Cherry-picked to main as `fcbd134`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `analysis-conversation-failure-2065.md` | EXISTS | ALREADY ON MAIN | Identical diff in `fcbd134` |

**Change description:** Preserves Opus model as foundational and documents multi-provider custom LLM configuration.

### Commit 6: `fd11b4f` — CORRECTION: Working conversation disproves backend mismatch theory entirely

Cherry-picked to main as `0779987`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `analysis-conversation-failure-2065.md` | EXISTS | ALREADY ON MAIN | Identical diff in `0779987` |

**Change description:** Corrects the analysis based on a working conversation that disproves the backend mismatch theory.

### Commit 7: `e0eb9e6` — Integrate ElevenLabs Conversational AI agent via useConversation hook

Cherry-picked to main as `eabbc69`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | ALREADY ON MAIN | Identical diff in `eabbc69` |

**Change description:** Rewrites App.tsx to replace homebrew voice hooks with ElevenLabs Conversational AI `useConversation` agent hook.

### Commit 8: `45a0af4` — Remove dead homebrew STT/TTS hooks and clean up env vars

Cherry-picked to main as `8d7cc73`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `README.md` | EXISTS | ALREADY ON MAIN | Identical diff in `8d7cc73` |
| `hooks/useElevenLabs.ts` | DELETED | ALREADY ON MAIN | Deleted by identical diff in `8d7cc73` |
| `hooks/useSpeechToText.ts` | DELETED | ALREADY ON MAIN | Deleted by identical diff in `8d7cc73` |
| `package-lock.json` | EXISTS | ALREADY ON MAIN | Identical diff in `8d7cc73` |
| `vite-env.d.ts` | EXISTS | ALREADY ON MAIN | Identical diff in `8d7cc73` |

**Change description:** Removes dead homebrew STT/TTS hook files and cleans up related environment variable declarations.

---

## Branch 2: `cursor/agents-markdown-file-6388`

**Fork point:** `c9aef85` — Rename voice engine labels to ElevenLabs

### Commit 1: `d504f2a` — Add AGENTS.md with project conventions and architecture guide

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `AGENTS.md` | NEW | NEW FILE | File does not exist on main; would apply cleanly |

**Change description:** Adds an `AGENTS.md` file documenting project conventions, tech stack (React 19, Vite 6, Tailwind, Supabase Edge Functions), repository layout, and coding guidelines for AI agents.

---

## Branch 3: `cursor/maya-jrvs-system-prompt-a399`

**Fork point:** `c9aef85` — Rename voice engine labels to ElevenLabs
**Note:** This is the largest orphan branch (14 commits). It predates the voice system rewrite on main. Many commits touch `App.tsx` (rewritten by `eabbc69`) and `hooks/useElevenLabs.ts` (deleted by `8d7cc73`).

### Commit 1: `18e7159` — Replace Maya JRVS system prompt with v3.1 (clinical portfolio)

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `services/gemini.ts` | EXISTS | CLEAN APPLY | `services/gemini.ts` was not modified on main after fork; patch applies cleanly. Changes the system prompt text. |

**Change description:** Replaces the Maya JRVS system prompt with a v3.1 version focused on a clinical portfolio persona.

### Commit 2: `4237658` — Fix send button visibility, image preview in chat, and vision analysis attribution

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | CONFLICTS | Patch targets lines ~198–250 (image upload and vision flow). `App.tsx` was substantially rewritten by `eabbc69` on main — the image upload flow was reorganized and the `handleUserInput` callback was replaced with agent-based messaging. The specific lines this patch targets no longer exist in their original form. |
| `index.css` | EXISTS | CLEAN APPLY | Adds `.maya-send-button` hover styles and `.maya-message-image` class. `index.css` was not modified on main after fork. |
| `types.ts` | EXISTS | CLEAN APPLY | Adds `imageUrl?: string` field to `TranscriptItem`. `types.ts` was not modified on main after fork. |

**Change description:** Fixes send button disabled-state opacity, adds hover styles, shows image previews inline in chat, and attributes vision analysis to Maya.

### Commit 3: `238e63f` — Fix conversation panel scrolling: add grid-template-rows and overflow containment

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `index.css` | EXISTS | CLEAN APPLY | Adds `grid-template-rows: 1fr` to `.maya-main`, `overflow: hidden` to conversation container, and responsive grid row. Not modified on main after fork. |

**Change description:** Fixes conversation panel scrolling by adding CSS grid row template and overflow containment.

### Commit 4: `e4a11c4` — Remove native voice: toggle between ElevenLabs V3 and Flash only

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | CONFLICTS | Patch targets line ~375 (voice engine toggle button). Entire voice UI section was rewritten by `eabbc69` on main — the toggle button and engine state no longer exist in this form. |
| `hooks/useElevenLabs.ts` | DELETED | DEAD TARGET | File was deleted by `8d7cc73` on main. This commit rewrites the hook to use `ELEVEN_V3`/`ELEVEN_FLASH` engine types instead of `ELEVEN_LABS`/`WEB_NATIVE`. |
| `vite-env.d.ts` | EXISTS | CONFLICTS | Patch removes `VITE_ELEVENLABS_AUTO_MODE`, `VITE_ELEVENLABS_MODEL_ID`, `VITE_TTS_ENGINE` env vars. Commit `8d7cc73` on main also removed these vars but additionally removed `VITE_STT_PROXY_WS_URL`, `VITE_ELEVENLABS_VOICE_ID`, `VITE_ELEVENLABS_OUTPUT_FORMAT` and added `VITE_ELEVENLABS_AGENT_ID`. Context lines differ. |

**Change description:** Removes the native Web Speech TTS option, replacing it with a toggle between two ElevenLabs models (V3 and Flash).

### Commit 5: `4d3c1a6` — Style model select dropdown to match dark palette

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `index.css` | EXISTS | CLEAN APPLY | Adds `.maya-model-select` option styles with dark palette colors. Patch applies cleanly (appends new CSS rules after existing `.maya-model-select` block at ~line 136). |

**Change description:** Adds CSS for the model select dropdown options to use the dark panel background, accent colors, and monospace font.

### Commit 6: `b607545` — Voice toggle switches voice ID only, not model

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | CONFLICTS | Patch targets line ~18 (imports) and ~96 (hook destructuring) and ~377 (toggle button). All three areas were rewritten by `eabbc69` on main — imports changed from `useElevenLabs` to `useConversation`, hook usage completely replaced, toggle button removed. |
| `hooks/useElevenLabs.ts` | DELETED | DEAD TARGET | File was deleted by `8d7cc73` on main. This commit restructures the hook to use voice slots (`PRIMARY`/`SECONDARY`) with configurable voice IDs instead of engine model switching. |
| `vite-env.d.ts` | EXISTS | CONFLICTS | Same conflict as commit 4 — patch context expects env vars that were removed/replaced by `8d7cc73` on main. |

**Change description:** Changes the voice toggle from switching ElevenLabs models to switching between two voice IDs (primary/secondary) on the same `eleven_v3` model.

### Commit 7: `3be3d53` — Set secondary voice ID default to LTdCOVuNg0GlsSue75IB

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `hooks/useElevenLabs.ts` | DELETED | DEAD TARGET | File was deleted by `8d7cc73` on main. This commit changes the secondary voice ID default from a copy of the primary ID to `LTdCOVuNg0GlsSue75IB`. |

**Change description:** Sets the secondary voice ID default to a distinct ElevenLabs voice clone ID.

### Commit 8: `d22ac14` — Update README to v3.1: document two-voice toggle and remove stale env vars

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `README.md` | EXISTS | CONFLICTS | Patch targets line ~115 (env var section), replacing `VITE_ELEVENLABS_AUTO_MODE` and `VITE_ELEVENLABS_VOICE_ID` with two-voice config vars. Commit `8d7cc73` on main also modified this area — removed stale env vars and restructured the environment section. Context lines differ. |

**Change description:** Updates README version to v3.1 and documents the two-voice toggle configuration with dual voice ID env vars.

### Commit 9: `628f6f0` — Major fix pass: scrolling, mic button, event log, voice labels, image display

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | CONFLICTS | Large refactor touching imports (line ~16: `ErrorLogEntry` → `EventLogEntry`), state (line ~87: `errorLog` → `eventLog`), error handling (line ~101: `addError` → `logEvent`), and voice labels. `App.tsx` was completely rewritten by `eabbc69` — imports, state management, and error handling all changed. |
| `hooks/useElevenLabs.ts` | DELETED | DEAD TARGET | File was deleted by `8d7cc73` on main. This commit changes voice label defaults from `Maya`/`Maya Alt` to `Native`/`ElevenLabs`. |
| `index.css` | EXISTS | CONFLICTS | Patch targets line ~340 (`.maya-conversation-panel`) adding `display: flex; flex-direction: column` and modifying `.maya-conversation-scroll`. The patch context references lines introduced by prior branch commits (238e63f, 4d3c1a6) that aren't on main. Note: `index.css` itself was NOT modified on main after fork — the conflict is purely due to inter-commit dependencies within this branch. |
| `types.ts` | EXISTS | CLEAN APPLY | Adds `EventCategory` type, renames `ErrorLogEntry` to `EventLogEntry` with expanded fields, adds deprecation alias. `types.ts` was not modified on main after fork. |

**Change description:** Major refactor: replaces error log with a categorized event log, fixes scrolling with flexbox, updates voice labels, and restructures image display.

### Commit 10: `68aafa6` — Cyberpunk retheme: neon pink palette, Tailwind+prose setup, streamdown rendering

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `Response.tsx` | EXISTS | CLEAN APPLY | Changes CSS variable references from `--accent-warm` to `--accent` and adjusts backdrop blur. `Response.tsx` was not modified on main after fork. |
| `index.css` | EXISTS | CONFLICTS | Replaces the entire warm copper color palette with a cyberpunk neon pink palette, adds Tailwind directives. Patch context at line ~134 references `.maya-model-select` styles added by commit `4d3c1a6` (not on main). Note: `index.css` was NOT modified on main — conflict is due to prior branch commits. |
| `package-lock.json` | EXISTS | CONFLICTS | Modifies lockfile entries around line ~72. Commit `8d7cc73` on main also modified `package-lock.json` (removed 9 lines of dependency entries). Context lines differ. |
| `package.json` | EXISTS | CLEAN APPLY | Adds `@tailwindcss/typography` dependency. `package.json` was not modified on main after fork. |
| `postcss.config.js` | NEW | NEW FILE | New file; does not exist on main. Would apply cleanly. |
| `tailwind.config.js` | NEW | NEW FILE | New file; does not exist on main. Would apply cleanly. |

**Change description:** Complete cyberpunk retheme: replaces warm copper palette with neon pink, sets up Tailwind CSS with PostCSS, adds typography plugin, and configures streamdown prose rendering.

### Commit 11: `8f30368` — Fix Gemini model names to actual Google API identifiers

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | CLEAN APPLY | Changes `MODEL_OPTIONS` from `gemini-3-*` names back to `gemini-2.0-flash`/`gemini-2.5-flash-preview-04-17`/`gemini-2.5-pro-preview-03-25` and updates `selectedModel` default. Patch context matches main's current `App.tsx` at the `MODEL_OPTIONS` declaration. |
| `services/gemini.ts` | EXISTS | CLEAN APPLY | Changes default model parameter from `gemini-3-flash-preview` to `gemini-2.0-flash`. Patch context matches main. |
| `supabase/functions/mjrvs_llm/index.ts` | EXISTS | CLEAN APPLY | Changes `SUPPORTED_MODELS` set and `DEFAULT_FALLBACK_MODEL` from `gemini-3-*` names to `gemini-2.0-*` names. Patch context matches main. |

**Change description:** Reverts from speculative `gemini-3-*` model names back to actual Google API identifiers (`gemini-2.0-flash`, `gemini-2.5-flash-preview-04-17`). Note: main currently uses the `gemini-3-*` names, so applying this would DOWNGRADE the model names.

### Commit 12: `d8ea7bc` — Default model to gemini-2.5-flash-preview-04-17 instead of 2.0-flash

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | CONFLICTS | Patch targets line ~76 (`selectedModel` default: `gemini-2.0-flash` → `gemini-2.5-flash-preview-04-17`). Main has `gemini-3-flash-preview` at this position (set by the net effect of earlier main commits). Context mismatch. |
| `services/gemini.ts` | EXISTS | CONFLICTS | Patch targets line ~116 (model default: `gemini-2.0-flash` → `gemini-2.5-flash-preview-04-17`). Main has `gemini-3-flash-preview`. Context mismatch. |
| `supabase/functions/mjrvs_llm/index.ts` | EXISTS | CONFLICTS | Patch targets line ~55 (`DEFAULT_FALLBACK_MODEL`: `gemini-2.0-flash` → `gemini-2.5-flash-preview-04-17`). Main has `gemini-3-flash-preview`. Context mismatch — prior branch commit `8f30368` set these to `gemini-2.0-*` but main never had that state. |

**Change description:** Changes default model from `gemini-2.0-flash` to `gemini-2.5-flash-preview-04-17` across App, Gemini service, and edge function.

### Commit 13: `4618502` — Restore gemini-3-flash-preview as default model

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | CONFLICTS | Patch targets `MODEL_OPTIONS` list and `selectedModel` default, changing from `gemini-2.5-flash-preview-04-17` to `gemini-3-flash-preview`. Context references prior branch state (after `d8ea7bc`). Main already HAS `gemini-3-flash-preview` as the default — the net effect of this commit IS already the state on main, but the patch itself cannot apply because the context lines don't match. |
| `services/gemini.ts` | EXISTS | CONFLICTS | Same pattern — changes model default to `gemini-3-flash-preview`. Main already has this value, but patch context expects the `gemini-2.5-flash-preview-04-17` intermediate state from `d8ea7bc`. |
| `supabase/functions/mjrvs_llm/index.ts` | EXISTS | CONFLICTS | Same pattern — restores `gemini-3-flash-preview` model names and `SUPPORTED_MODELS`. Main already has this state, but patch context doesn't match. |

**Change description:** Restores `gemini-3-flash-preview` as the default model across all files. Note: the NET EFFECT of commits 11–13 (regarding model names) is that the codebase returns to `gemini-3-flash-preview`, which IS the current state on main. However, individual patches cannot be cherry-picked due to intermediate states.

### Commit 14: `16f22c2` — Set fallback model to gemini-2.5-flash

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `supabase/functions/mjrvs_llm/index.ts` | EXISTS | CLEAN APPLY | Changes `DEFAULT_FALLBACK_MODEL` from `gemini-3-flash-preview` to `gemini-2.5-flash`. Patch context matches main (both have `gemini-3-flash-preview` at this position). Main currently has `gemini-3-flash-preview` as fallback; this would change it to `gemini-2.5-flash`. |

**Change description:** Changes the edge function's fallback model from `gemini-3-flash-preview` to `gemini-2.5-flash`.

---

## Branch 4: `cursor/voice-picker-component-c5f1`

**Fork point:** `c9aef85` — Rename voice engine labels to ElevenLabs

### Commit 1: `93979d0` — Add VoicePicker component, demo, and documentation

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `components/ui/voice-picker-demo.tsx` | NEW | NEW FILE | New component demo file. Would apply cleanly. |
| `components/ui/voice-picker.tsx` | NEW | NEW FILE | New VoicePicker component. Would apply cleanly. |
| `docs/voice-picker.mdx` | NEW | NEW FILE | New documentation file. Would apply cleanly. |
| `index.css` | EXISTS | CLEAN APPLY | Appends ~234 lines of Voice Picker CSS styles at the end of the file. `index.css` was not modified on main after fork. |
| `package-lock.json` | EXISTS | CONFLICTS | Adds 63 lines / removes 9 lines around line ~72. Commit `8d7cc73` on main also modified `package-lock.json` at overlapping positions (removed dependency entries). |
| `package.json` | EXISTS | CLEAN APPLY | Adds `@elevenlabs/elevenlabs-js` dependency. `package.json` was not modified on main after fork. |

**Change description:** Adds a new VoicePicker UI component with voice selection, preview playback, waveform visualization, and associated demo page and documentation.

### Commit 2: `988e94f` — Add Response component, demo, and documentation

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `components/ui/response-demo.tsx` | NEW | NEW FILE | New component demo file. Would apply cleanly. |
| `components/ui/response.tsx` | NEW | NEW FILE | New Response UI component. Would apply cleanly. |
| `docs/response.mdx` | NEW | NEW FILE | New documentation file. Would apply cleanly. |

**Change description:** Adds a new Response UI component for displaying streaming LLM responses, with demo page and documentation.

---

## Branch 5: `cursor/elevenlabs-maya-workflow-74b0`

**Fork point:** `9ddfb89` — Allow cross-origin access for mjrvs_llm edge function

### Commit 1: `d84181f` — docs: add ElevenLabs workflow chart for Maya prompt

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `README.md` | EXISTS | CONFLICTS | Patch targets line ~10, adding a reference to the workflow doc under "Voice hooks" section. Multiple main commits modified `README.md` after fork point `9ddfb89`: `bcfa0a2`, `b78275a`, `ffa7c3c`, `26a7f77`, `6ecf26a`, `8d7cc73`. The "Voice hooks" section was restructured and the `hooks/useElevenLabs.ts` reference this patch adds next to was later removed by `8d7cc73`. |
| `docs/elevenlabs-maya-agent-workflow.md` | NEW | NEW FILE | New file; does not exist on main. Would apply cleanly. Contains a Mermaid workflow chart for ElevenLabs Conversational AI agent integration. |

**Change description:** Adds an ElevenLabs workflow chart document with Mermaid diagrams mapping the Maya JRVS system prompt to a conversational AI agent workflow, plus a README reference.

---

## Branch 6: `cursor/jrsv-code-quality-44ad`

**Fork point:** `7cc12b3` — Update README for edge-routed architecture and new UI system
**Verdict:** All 5 commits are cherry-picks of commits already on main. Diffs are byte-identical.

### Commit 1: `05ecac8` — Add mjrvs_vision edge function with vision bug fixes

Cherry-picked to main as `0795d38`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `supabase/functions/mjrvs_vision/index.ts` | EXISTS | ALREADY ON MAIN | Identical diff in `0795d38` |

**Change description:** Adds the `mjrvs_vision` Supabase Edge Function for image analysis with vision model routing.

### Commit 2: `18af34b` — Harden Gemini routing with model fallback for mjrvs_vision

Cherry-picked to main as `df43a4a`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `supabase/functions/mjrvs_vision/index.ts` | EXISTS | ALREADY ON MAIN | Identical diff in `df43a4a` |

**Change description:** Adds model fallback logic and error hardening to the mjrvs_vision edge function.

### Commit 3: `9d0d1b9` — Make agent speech resilient with native TTS fallback

Cherry-picked to main as `23232d1`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `App.tsx` | EXISTS | ALREADY ON MAIN | Identical diff in `23232d1`. Note: this file was later rewritten by `eabbc69` on main, but this commit's content was already applied before that rewrite. |
| `hooks/useElevenLabs.ts` | DELETED | ALREADY ON MAIN | Identical diff in `23232d1`. File was later deleted by `8d7cc73` on main, but this commit's content was already applied before that deletion. |

**Change description:** Adds native browser TTS fallback when ElevenLabs proxy fails, improving speech resilience.

### Commit 4: `037d945` — Increase Vite chunk size warning limit

Cherry-picked to main as `4b103d8`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `vite.config.ts` | EXISTS | ALREADY ON MAIN | Identical diff in `4b103d8` |

**Change description:** Increases the Vite build chunk size warning limit to suppress warnings for large bundles.

### Commit 5: `811fab3` — Allow Render host in Vite preview and server

Cherry-picked to main as `19c069e`. Diffs identical.

| File | Exists on Main | Content Status | Notes |
|------|---------------|----------------|-------|
| `vite.config.ts` | EXISTS | ALREADY ON MAIN | Identical diff in `19c069e` |

**Change description:** Adds the Render.com hosting domain to Vite's allowed hosts for preview and dev server.

---

## Recommendations

### Branch 1: `cursor/agent-configuration-conversation-failure-2065`
**SAFE TO DELETE** — All 8 commits have been cherry-picked to main with byte-identical diffs. No unique content remains.

### Branch 2: `cursor/agents-markdown-file-6388`
**CHERRY-PICK CANDIDATES** — Contains a single commit (`d504f2a`) adding `AGENTS.md` (project conventions and architecture guide for AI agents). This is a new file that does not exist on main and would apply cleanly. Recommend cherry-picking if the team wants to maintain an `AGENTS.md`.

### Branch 3: `cursor/maya-jrvs-system-prompt-a399`
**NEEDS MANUAL PORT** — This is the most complex branch with 14 commits spanning UI fixes, voice system changes, model configuration, and a cyberpunk retheme. Specific guidance:

- **Cherry-pick directly (clean apply):**
  - `18e7159` — System prompt v3.1 update to `services/gemini.ts`
  - `238e63f` — Scrolling fix (CSS grid-template-rows) in `index.css`
  - `4d3c1a6` — Model select dropdown dark styling in `index.css`
  - `16f22c2` — Set fallback model to `gemini-2.5-flash` in edge function

- **Partially salvageable (some files clean, some conflict):**
  - `4237658` — Image preview and send button fixes: `index.css` and `types.ts` apply cleanly, but `App.tsx` conflicts due to `eabbc69` rewrite
  - `628f6f0` — Event log refactor: `types.ts` applies cleanly, but `App.tsx`, `hooks/useElevenLabs.ts` (dead), and `index.css` (branch-internal dependency) conflict
  - `8f30368` — All 3 files apply cleanly BUT this would DOWNGRADE model names from `gemini-3-*` to `gemini-2.0-*` — likely NOT wanted

- **Dead / superseded:**
  - `e4a11c4`, `b607545`, `3be3d53` — Voice toggle changes all target `hooks/useElevenLabs.ts` (deleted) and old `App.tsx` voice UI (rewritten). Entirely superseded by the new agent-based architecture.
  - `d22ac14` — README voice config docs; superseded by `8d7cc73` on main
  - `d8ea7bc`, `4618502` — Model name shuffling; net effect already on main

- **Review carefully before porting:**
  - `68aafa6` — Cyberpunk retheme. The color palette, Tailwind setup (`postcss.config.js`, `tailwind.config.js`), and `Response.tsx` prose changes apply cleanly. The `index.css` palette replacement and `package-lock.json` conflict. This is a major design direction change that requires a human decision.

### Branch 4: `cursor/voice-picker-component-c5f1`
**CHERRY-PICK CANDIDATES** — Both commits introduce new UI components:
- `93979d0` — VoicePicker component: 3 new files apply cleanly, `index.css` and `package.json` apply cleanly, only `package-lock.json` conflicts (trivially resolvable by re-running `npm install`).
- `988e94f` — Response component: all 3 files are new and apply cleanly.

These are self-contained UI components with demos and docs. The `package-lock.json` conflict is mechanical and would resolve with a fresh `npm install` after cherry-pick.

### Branch 5: `cursor/elevenlabs-maya-workflow-74b0`
**CHERRY-PICK CANDIDATES** — Single commit (`d84181f`) adds a valuable ElevenLabs workflow chart doc. The new file `docs/elevenlabs-maya-agent-workflow.md` applies cleanly. The `README.md` reference conflicts (the "Voice hooks" section it targets was restructured on main) — the README change would need manual re-application to reference the doc from the correct section, but the doc file itself is standalone.

### Branch 6: `cursor/jrsv-code-quality-44ad`
**SAFE TO DELETE** — All 5 commits have been cherry-picked to main with byte-identical diffs. No unique content remains.
