"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { ConversationBar } from "@/components/ui/conversation-bar"
import { Message, MessageContent } from "@/components/ui/message"
import { MicSelector } from "@/components/ui/mic-selector"
import { Response } from "@/components/ui/response"

type ConversationEvent = { source: "user" | "ai"; message: string }

type TranscriptMessage = {
  id: string
  source: "user" | "ai"
  message: string
}

const createMessageId = () =>
  `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const mergeAssistantMessage = (previous: string, incoming: string): string => {
  if (!previous) return incoming
  if (!incoming) return previous

  if (incoming.startsWith(previous)) return incoming
  if (previous.startsWith(incoming)) return previous
  if (previous.endsWith(incoming)) return previous

  const spacer = previous.endsWith(" ") || incoming.startsWith(" ") ? "" : " "
  return `${previous}${spacer}${incoming}`
}

export default function Home() {
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>("")
  const transcriptRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!transcriptRef.current) return
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [messages])

  const handleConversationMessage = useCallback((event: ConversationEvent) => {
    console.log("[JRVS] onMessage", event)

    const content = event.message.trim()
    if (!content) return

    setMessages((previous) => {
      const last = previous[previous.length - 1]

      if (event.source === "user") {
        if (last?.source === "user" && last.message === content) {
          return previous
        }

        return [
          ...previous,
          {
            id: createMessageId(),
            source: "user",
            message: content,
          },
        ]
      }

      if (last?.source === "ai") {
        const merged = mergeAssistantMessage(last.message, content)
        if (merged === last.message) {
          return previous
        }

        return [
          ...previous.slice(0, -1),
          {
            ...last,
            message: merged,
          },
        ]
      }

      return [
        ...previous,
        {
          id: createMessageId(),
          source: "ai",
          message: content,
        },
      ]
    })
  }, [])

  const handleUserTextMessage = useCallback((message: string) => {
    const content = message.trim()
    if (!content) return

    setMessages((previous) => {
      const last = previous[previous.length - 1]
      if (last?.source === "user" && last.message === content) {
        return previous
      }

      return [
        ...previous,
        {
          id: createMessageId(),
          source: "user",
          message: content,
        },
      ]
    })
  }, [])

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-7xl flex-col gap-6 lg:flex-row">
        <section className="flex min-h-0 w-full flex-col lg:w-[70%]">
          <h1 className="mb-4 text-3xl font-semibold">JRVS Dashboard</h1>

          <div className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">Live Transcript</h2>
            </div>

            <div
              ref={transcriptRef}
              className="flex-1 space-y-1 overflow-y-auto px-4 py-2"
            >
              {messages.length === 0 ? (
                <div className="text-muted-foreground flex h-full items-center justify-center py-10 text-sm">
                  Start a conversation to see live transcript messages.
                </div>
              ) : (
                messages.map((entry) => (
                  <Message
                    key={entry.id}
                    from={entry.source === "user" ? "user" : "assistant"}
                  >
                    <MessageContent
                      variant={entry.source === "user" ? "contained" : "flat"}
                      className={entry.source === "ai" ? "max-w-[90%]" : ""}
                    >
                      {entry.source === "ai" ? (
                        <Response>{entry.message}</Response>
                      ) : (
                        <p className="whitespace-pre-wrap">{entry.message}</p>
                      )}
                    </MessageContent>
                  </Message>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <ConversationBar
              agentId={process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID}
              getSignedUrl={getSignedUrl}
              inputDeviceId={selectedMicId || undefined}
              onConnect={() => {
                console.log("[JRVS] onConnect")
              }}
              onDisconnect={() => {
                console.log("[JRVS] onDisconnect")
              }}
              onMessage={handleConversationMessage}
              onSendMessage={handleUserTextMessage}
              onError={(error) => {
                console.error("[JRVS] onError", error)
              }}
            />

            <div className="flex justify-end">
              <MicSelector
                value={selectedMicId}
                onValueChange={(deviceId) => setSelectedMicId(deviceId)}
              />
            </div>
          </div>
        </section>

        <aside className="bg-card hidden rounded-xl border p-4 shadow-sm lg:block lg:w-[30%]">
          <h2 className="text-sm font-medium">Session</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Transcript and conversation controls are active in the left panel.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Messages this session: <span className="font-medium">{messages.length}</span>
          </p>
        </aside>
      </div>
    </main>
  )
}
