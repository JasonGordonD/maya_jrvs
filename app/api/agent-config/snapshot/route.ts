import { NextResponse } from "next/server"

import { getOrCreateConfigSnapshot, snapshotAgentConfig } from "@/lib/config-snapshot"

export const runtime = "nodejs"

const readAgentIdFromRequest = (request: Request): string | undefined => {
  const url = new URL(request.url)
  const candidate = url.searchParams.get("agent_id")
  if (!candidate) return undefined

  const trimmed = candidate.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const isRefreshRequested = (request: Request): boolean => {
  const value = new URL(request.url).searchParams.get("refresh")
  if (!value) return false

  return value === "1" || value.toLowerCase() === "true"
}

const toErrorResponse = (error: unknown) => {
  const details =
    error instanceof Error ? error.message : "Unknown snapshot request error"

  return NextResponse.json(
    {
      error: "Unable to load agent config snapshot",
      details,
    },
    { status: 500 }
  )
}

export async function GET(request: Request) {
  const agentId = readAgentIdFromRequest(request)
  const refresh = isRefreshRequested(request)

  try {
    if (refresh) {
      const refreshed = await snapshotAgentConfig({ agentId })
      return NextResponse.json({ ...refreshed, source: "live" })
    }

    const snapshot = await getOrCreateConfigSnapshot({ agentId })
    return NextResponse.json(snapshot)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const agentId = readAgentIdFromRequest(request)

  try {
    const refreshed = await snapshotAgentConfig({ agentId })
    return NextResponse.json({ ...refreshed, source: "live" })
  } catch (error) {
    return toErrorResponse(error)
  }
}
