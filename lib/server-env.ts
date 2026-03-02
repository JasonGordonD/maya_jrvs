/**
 * JRVS Agent ID Resolution — Canonical Source
 *
 * MJRVS_ELEVENLABS_AGENT_ID = agent_0401khmtcyfef6hbpcvchjv5jj02 (JRVS only)
 * ELEVENLABS_AGENT_ID = Betsy B only — NEVER use for JRVS resolution
 * NEXT_PUBLIC_MJRVS_ELEVENLABS_AGENT_ID = DELETED — do not re-add
 *
 * All JRVS agent ID resolution flows through getMjrvsElevenLabsAgentId()
 * or requireMjrvsElevenLabsAgentId() in this file only.
 */
const normalizeEnvValue = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const readEnvValue = (candidates: string[]): string | undefined => {
  for (const key of candidates) {
    const direct = normalizeEnvValue(process.env[key])
    if (direct) return direct
  }

  // Fallback for case-mismatch in host env configuration.
  const entries = Object.entries(process.env)
  for (const key of candidates) {
    const lowered = key.toLowerCase()
    const match = entries.find(([envKey, envValue]) => {
      return envKey.toLowerCase() === lowered && normalizeEnvValue(envValue)
    })
    if (match?.[1]) {
      return normalizeEnvValue(match[1])
    }
  }

  return undefined
}

const API_KEY_ENV_CANDIDATES = [
  "ELEVENLABS_API_KEY",
  "ELEVEN_LABS_API_KEY",
  "VITE_ELEVENLABS_API_KEY",
]

const MJRVS_AGENT_ID_ENV_CANDIDATES = ["MJRVS_ELEVENLABS_AGENT_ID"]

export const getElevenLabsApiKey = () => readEnvValue(API_KEY_ENV_CANDIDATES)
export const getMjrvsElevenLabsAgentId = () =>
  readEnvValue(MJRVS_AGENT_ID_ENV_CANDIDATES)

export const requireMjrvsElevenLabsAgentId = () => {
  const agentId = getMjrvsElevenLabsAgentId()
  if (!agentId) {
    throw new Error("Missing MJRVS_ELEVENLABS_AGENT_ID")
  }
  return agentId
}
