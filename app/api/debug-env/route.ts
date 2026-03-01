import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY

  return NextResponse.json({
    hasApiKey: Boolean(apiKey),
    keyLength: apiKey?.length ?? 0,
    nodeEnv: process.env.NODE_ENV,
    allEnvKeys: Object.keys(process.env).filter(
      (key) => key.includes("ELEVEN") || key.includes("NEXT_PUBLIC")
    ),
  })
}
