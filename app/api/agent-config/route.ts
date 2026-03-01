import { NextResponse } from "next/server"

import {
  getElevenLabsAgentId,
  getElevenLabsApiKey,
} from "@/lib/server-env"
import { decomposeAgentConfig, type ConfigSnapshot } from "@/lib/config-snapshot"

export const runtime = "nodejs"

export async function GET() {
  const apiKey = getElevenLabsApiKey()
  const agentId = getElevenLabsAgentId()

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY" } satisfies Partial<ConfigSnapshot>,
      { status: 500 }
    )
  }

  if (!agentId) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_ELEVENLABS_AGENT_ID" } satisfies Partial<ConfigSnapshot>,
      { status: 500 }
    )
  }

  const url = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
    })

    const body = await upstream.text()

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `ElevenLabs API error (${upstream.status}): ${body || upstream.statusText}`,
          chunks: [],
          snapshot_at: new Date().toISOString(),
          agent_name: "",
        } satisfies ConfigSnapshot,
        { status: upstream.status }
      )
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(body)
    } catch {
      return NextResponse.json(
        {
          error: "Failed to parse ElevenLabs API response as JSON",
          chunks: [],
          snapshot_at: new Date().toISOString(),
          agent_name: "",
        } satisfies ConfigSnapshot,
        { status: 502 }
      )
    }

    const now = new Date().toISOString()
    const chunks = decomposeAgentConfig(parsed)
    const agentName =
      typeof parsed.name === "string" ? parsed.name : "Unknown Agent"

    const snapshot: ConfigSnapshot = {
      chunks,
      snapshot_at: now,
      agent_name: agentName,
    }

    return NextResponse.json(snapshot)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error fetching agent config"

    return NextResponse.json(
      {
        error: `Unable to fetch agent config: ${message}`,
        chunks: [],
        snapshot_at: new Date().toISOString(),
        agent_name: "",
      } satisfies ConfigSnapshot,
      { status: 500 }
    )
  }
}
