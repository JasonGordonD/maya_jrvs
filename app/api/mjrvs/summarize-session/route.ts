import { NextResponse } from "next/server"

export const runtime = "nodejs"

const EDGE_FUNCTION_NAME = "mjrvs_summarize_session"

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, "")

export async function POST(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    )
  }

  let requestBody: unknown
  try {
    requestBody = await request.json()
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 }
    )
  }

  const upstreamUrl = `${stripTrailingSlashes(supabaseUrl)}/functions/v1/${EDGE_FUNCTION_NAME}`

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
    })

    const upstreamBody = await upstreamResponse.text()

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          error: `Failed to call Supabase edge function ${EDGE_FUNCTION_NAME}`,
          details: upstreamBody || upstreamResponse.statusText,
        },
        { status: 500 }
      )
    }

    return new NextResponse(upstreamBody, {
      status: upstreamResponse.status,
      headers: {
        "Content-Type":
          upstreamResponse.headers.get("content-type") ??
          "application/json; charset=utf-8",
      },
    })
  } catch (error) {
    const details =
      error instanceof Error
        ? error.message
        : "Unknown error calling summarize-session edge function"

    return NextResponse.json(
      {
        error: `Unable to call Supabase edge function ${EDGE_FUNCTION_NAME}`,
        details,
      },
      { status: 500 }
    )
  }
}
