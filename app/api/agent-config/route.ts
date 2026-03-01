import { NextResponse } from "next/server"

import {
  mjrvs_get_or_create_config_snapshot,
  mjrvs_snapshot_agent_config,
} from "@/lib/mjrvs_config_snapshot"

export const runtime = "nodejs"

const mjrvs_read_agent_id = (request: Request): string | undefined => {
  const request_url = new URL(request.url)
  const raw_agent_id = request_url.searchParams.get("agent_id")
  if (!raw_agent_id) return undefined

  const trimmed_agent_id = raw_agent_id.trim()
  return trimmed_agent_id.length > 0 ? trimmed_agent_id : undefined
}

const mjrvs_read_refresh = (request: Request): boolean => {
  const request_url = new URL(request.url)
  const refresh_value = request_url.searchParams.get("refresh")
  if (!refresh_value) return false

  return refresh_value === "1" || refresh_value.toLowerCase() === "true"
}

const mjrvs_to_error_response = (error: unknown) => {
  const details =
    error instanceof Error ? error.message : "Unknown snapshot request error"

  return NextResponse.json(
    {
      error: "Unable to load agent config snapshot",
      details,
      chunks: [],
      snapshot_at: null,
      agent_id: null,
      agent_name: "",
      source: "live",
    },
    { status: 500 }
  )
}

export async function GET(request: Request) {
  const agent_id = mjrvs_read_agent_id(request)
  const refresh = mjrvs_read_refresh(request)

  try {
    if (refresh) {
      const snapshot_state = await mjrvs_snapshot_agent_config({ agent_id })
      return NextResponse.json({
        ...snapshot_state,
        source: "live",
        agent_name: snapshot_state.agent_id ?? "Unknown Agent",
      })
    }

    const snapshot_result = await mjrvs_get_or_create_config_snapshot({
      agent_id,
    })
    return NextResponse.json({
      ...snapshot_result,
      agent_name: snapshot_result.agent_id ?? "Unknown Agent",
    })
  } catch (error) {
    return mjrvs_to_error_response(error)
  }
}

export async function POST(request: Request) {
  const agent_id = mjrvs_read_agent_id(request)

  try {
    const snapshot_state = await mjrvs_snapshot_agent_config({ agent_id })
    return NextResponse.json({
      ...snapshot_state,
      source: "live",
      agent_name: snapshot_state.agent_id ?? "Unknown Agent",
    })
  } catch (error) {
    return mjrvs_to_error_response(error)
  }
}
