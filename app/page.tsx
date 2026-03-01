 "use client"

import { useCallback } from "react"

import { ConversationBar } from "@/components/ui/conversation-bar"

export default function Home() {
  const getSignedUrl = useCallback(async () => {
    const response = await fetch("/api/signed-url", {
      method: "GET",
      cache: "no-store",
    })

    if (!response.ok) {
      const details = await response.text()
      throw new Error(
        `Unable to retrieve signed URL (${response.status}): ${details || "Unknown error"}`
      )
    }

    const data = (await response.json()) as { signedUrl?: string }

    if (!data.signedUrl) {
      throw new Error("Signed URL response missing signedUrl field")
    }

    return data.signedUrl
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-3xl font-semibold">JRVS Dashboard</h1>
      <div className="w-full max-w-3xl">
        <ConversationBar
          agentId={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID}
          getSignedUrl={getSignedUrl}
          onConnect={() => {
            console.log("[JRVS] onConnect")
          }}
          onDisconnect={() => {
            console.log("[JRVS] onDisconnect")
          }}
          onMessage={(message) => {
            console.log("[JRVS] onMessage", message)
          }}
          onError={(error) => {
            console.error("[JRVS] onError", error)
          }}
        />
      </div>
    </main>
  )
}
