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

const AGENT_ID_ENV_CANDIDATES = [
  "NEXT_PUBLIC_ELEVENLABS_AGENT_ID",
  "ELEVENLABS_AGENT_ID",
  "VITE_ELEVENLABS_AGENT_ID",
]

export const getElevenLabsApiKey = () => readEnvValue(API_KEY_ENV_CANDIDATES)
export const getElevenLabsAgentId = () => readEnvValue(AGENT_ID_ENV_CANDIDATES)
