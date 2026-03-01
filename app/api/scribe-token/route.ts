import { NextResponse } from "next/server"

import { getElevenLabsApiKey } from "@/lib/server-env"

export const runtime = "nodejs"

async function createScribeToken() {
  const apiKey = getElevenLabsApiKey()

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY" },
      { status: 500 }
    )
  }

  try {
    const upstreamResponse = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text/get-realtime-token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          model_id: "scribe_v2_realtime",
          ttl_secs: 300,
        }),
        cache: "no-store",
      }
    )

    const rawBody = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          error: "Failed to fetch scribe token from ElevenLabs",
          details: rawBody || upstreamResponse.statusText,
        },
        { status: upstreamResponse.status }
      )
    }

    let parsedBody: unknown
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      parsedBody = rawBody
    }

    const token =
      typeof parsedBody === "string"
        ? parsedBody
        : (parsedBody as { token?: string; realtime_token?: string }).token ??
          (parsedBody as { token?: string; realtime_token?: string })
            .realtime_token

    if (!token) {
      return NextResponse.json(
        { error: "ElevenLabs response did not include a token" },
        { status: 502 }
      )
    }

    return NextResponse.json({ token })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error requesting scribe token"

    return NextResponse.json(
      { error: "Unable to request scribe token", details: message },
      { status: 500 }
    )
  }
}

export async function GET() {
  return createScribeToken()
}

export async function POST() {
  return createScribeToken()
}
