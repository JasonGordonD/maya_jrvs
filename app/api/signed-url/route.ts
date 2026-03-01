import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY" },
      { status: 500 }
    )
  }

  if (!agentId) {
    return NextResponse.json(
      { error: "Missing NEXT_PUBLIC_ELEVENLABS_AGENT_ID" },
      { status: 500 }
    )
  }

  const upstreamUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
      },
      cache: "no-store",
    })

    const rawBody = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          error: "Failed to fetch signed URL from ElevenLabs",
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

    const signedUrl =
      typeof parsedBody === "string"
        ? parsedBody
        : (parsedBody as { signed_url?: string; signedUrl?: string })
            .signed_url ??
          (parsedBody as { signed_url?: string; signedUrl?: string })
            .signedUrl

    if (!signedUrl) {
      return NextResponse.json(
        { error: "ElevenLabs response did not include a signed URL" },
        { status: 502 }
      )
    }

    return NextResponse.json({ signedUrl })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error requesting signed URL"

    return NextResponse.json(
      { error: "Unable to request signed URL", details: message },
      { status: 500 }
    )
  }
}
