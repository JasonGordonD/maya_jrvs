"use client"

import * as React from "react"
import { useConversation } from "@elevenlabs/react"
import {
  ArrowUpIcon,
  ChevronDown,
  Keyboard,
  Mic,
  MicOff,
  Paperclip,
  PhoneIcon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { LiveWaveform } from "@/components/ui/live-waveform"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type PendingAttachment = {
  id: string
  file: File
}

const ACCEPTED_FILE_TYPES =
  ".pdf,.txt,.md,.docx,.json,.csv,.png,.jpg,.jpeg"

export interface ConversationBarProps {
  /**
   * ElevenLabs Agent ID to connect to (used when getSignedUrl is not provided)
   */
  agentId?: string

  /**
   * Optional callback to fetch a signed URL from your backend.
   * If provided, the conversation will use websocket + signed URL auth.
   */
  getSignedUrl?: () => Promise<string>

  /**
   * Custom className for the container
   */
  className?: string

  /**
   * Custom className for the waveform
   */
  waveformClassName?: string

  /**
   * Callback when conversation connects
   */
  onConnect?: () => void

  /**
   * Callback when conversation disconnects
   */
  onDisconnect?: () => void

  /**
   * Callback when connection status changes
   */
  onConnectionStatusChange?: (
    status: "disconnected" | "connecting" | "connected" | "disconnecting"
  ) => void

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback for low-level debug events from the conversation SDK
   */
  onDebug?: (event: unknown) => void

  /**
   * Callback when speaking state changes
   */
  onSpeakingChange?: (isSpeaking: boolean) => void

  /**
   * Callback when a message is received
   */
  onMessage?: (message: { source: "user" | "ai"; message: string }) => void

  /**
   * Callback when user sends a message
   */
  onSendMessage?: (message: string) => void

  /**
   * Callback when a conversation ID is available
   */
  onConversationId?: (conversationId: string) => void

  /**
   * Preferred microphone input device id
   */
  inputDeviceId?: string
}

export const ConversationBar = React.forwardRef<
  HTMLDivElement,
  ConversationBarProps
>(
  (
    {
      agentId,
      getSignedUrl,
      className,
      waveformClassName,
      onConnect,
      onDisconnect,
      onConnectionStatusChange,
      onError,
      onDebug,
      onSpeakingChange,
      onMessage,
      onSendMessage,
      onConversationId,
      inputDeviceId,
    },
    ref
  ) => {
    const [isMuted, setIsMuted] = React.useState(false)
    const [agentState, setAgentState] = React.useState<
      "disconnected" | "connecting" | "connected" | "disconnecting" | null
    >("disconnected")
    const [keyboardOpen, setKeyboardOpen] = React.useState(false)
    const [textInput, setTextInput] = React.useState("")
    const [pendingAttachments, setPendingAttachments] = React.useState<
      PendingAttachment[]
    >([])
    const mediaStreamRef = React.useRef<MediaStream | null>(null)
    const fileInputRef = React.useRef<HTMLInputElement | null>(null)

    const conversation = useConversation({
      onConnect: () => {
        onConnect?.()
      },
      onDisconnect: () => {
        setAgentState("disconnected")
        onDisconnect?.()
        setKeyboardOpen(false)
      },
      onMessage: (message) => {
        onMessage?.(message)
      },
      onDebug: (event) => {
        onDebug?.(event)
      },
      micMuted: isMuted,
      onError: (error: unknown) => {
        console.error("Error:", error)
        setAgentState("disconnected")
        const errorObj =
          error instanceof Error
            ? error
            : new Error(
                typeof error === "string" ? error : JSON.stringify(error)
              )
        onError?.(errorObj)
      },
    })

    const getMicStream = React.useCallback(async () => {
      if (mediaStreamRef.current) return mediaStreamRef.current

      const audioConstraints: MediaTrackConstraints | true = inputDeviceId
        ? { deviceId: { exact: inputDeviceId } }
        : true
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      })
      mediaStreamRef.current = stream

      return stream
    }, [inputDeviceId])

    const startConversation = React.useCallback(async () => {
      try {
        setAgentState("connecting")

        await getMicStream()

        if (getSignedUrl) {
          const signedUrl = await getSignedUrl()
          const conversationId = await conversation.startSession({
            signedUrl,
            connectionType: "websocket",
            onStatusChange: (status) => setAgentState(status.status),
            ...(inputDeviceId ? { inputDeviceId } : {}),
          })
          onConversationId?.(conversationId)
          return
        }

        if (!agentId) {
          throw new Error(
            "ConversationBar requires either getSignedUrl or agentId"
          )
        }

        const conversationId = await conversation.startSession({
          agentId,
          connectionType: "webrtc",
          onStatusChange: (status) => setAgentState(status.status),
          ...(inputDeviceId ? { inputDeviceId } : {}),
        })
        onConversationId?.(conversationId)
      } catch (error) {
        console.error("Error starting conversation:", error)
        setAgentState("disconnected")
        onError?.(error as Error)
      }
    }, [
      conversation,
      getMicStream,
      getSignedUrl,
      agentId,
      onError,
      onConversationId,
      inputDeviceId,
    ])

    const handleEndSession = React.useCallback(() => {
      conversation.endSession()
      setAgentState("disconnected")

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
      }
    }, [conversation])

    const toggleMute = React.useCallback(() => {
      setIsMuted((prev) => !prev)
    }, [])

    const handleStartOrEnd = React.useCallback(() => {
      if (agentState === "connected" || agentState === "connecting") {
        handleEndSession()
      } else if (agentState === "disconnected") {
        startConversation()
      }
    }, [agentState, handleEndSession, startConversation])

    const handleSendText = React.useCallback(() => {
      if (!textInput.trim()) return

      const messageToSend = textInput
      // V3: implement file upload to agent via client tool or contextual update
      conversation.sendUserMessage(messageToSend)
      setTextInput("")
      onSendMessage?.(messageToSend)
    }, [conversation, textInput, onSendMessage])

    const isConnected = agentState === "connected"

    const handleTextChange = React.useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        setTextInput(value)

        if (value.trim() && isConnected) {
          conversation.sendContextualUpdate(value)
        }
      },
      [conversation, isConnected]
    )

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          handleSendText()
        }
      },
      [handleSendText]
    )

    const handleOpenFilePicker = React.useCallback(() => {
      fileInputRef.current?.click()
    }, [])

    const handleFileSelection = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : []
        if (files.length === 0) return

        const attachments = files.map((file) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2, 8)}`,
          file,
        }))

        setPendingAttachments((prev) => [...prev, ...attachments])
        setKeyboardOpen(true)
        event.target.value = ""
      },
      []
    )

    const handleRemoveAttachment = React.useCallback((id: string) => {
      setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
    }, [])

    React.useEffect(() => {
      return () => {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop())
        }
      }
    }, [])

    React.useEffect(() => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop())
        mediaStreamRef.current = null
      }
    }, [inputDeviceId])

    React.useEffect(() => {
      if (!agentState) return
      onConnectionStatusChange?.(agentState)
    }, [agentState, onConnectionStatusChange])

    React.useEffect(() => {
      onSpeakingChange?.(conversation.isSpeaking)
    }, [conversation.isSpeaking, onSpeakingChange])

    return (
      <div
        ref={ref}
        className={cn("flex w-full items-end justify-center p-4", className)}
      >
        <Card className="m-0 w-full gap-0 border p-0 shadow-lg">
          <div className="flex flex-col-reverse">
            <div>
              {keyboardOpen && <Separator />}
              <div className="flex items-center justify-between gap-2 p-2">
                <div className="flex items-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED_FILE_TYPES}
                    className="hidden"
                    onChange={handleFileSelection}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleOpenFilePicker}
                    aria-label="Add attachments"
                    title="Add attachments"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </div>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMute}
                    aria-pressed={isMuted}
                    className={cn(isMuted ? "bg-foreground/5" : "")}
                    disabled={!isConnected}
                  >
                    {isMuted ? <MicOff /> : <Mic />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setKeyboardOpen((v) => !v)}
                    aria-pressed={keyboardOpen}
                    className="relative"
                    disabled={!isConnected}
                  >
                    <Keyboard
                      className={
                        "h-5 w-5 transform-gpu transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] " +
                        (keyboardOpen
                          ? "scale-75 opacity-0"
                          : "scale-100 opacity-100")
                      }
                    />
                    <ChevronDown
                      className={
                        "absolute inset-0 m-auto h-5 w-5 transform-gpu transition-all delay-50 duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] " +
                        (keyboardOpen
                          ? "scale-100 opacity-100"
                          : "scale-75 opacity-0")
                      }
                    />
                  </Button>
                  <Separator orientation="vertical" className="mx-1 -my-2.5" />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleStartOrEnd}
                    disabled={agentState === "disconnecting"}
                  >
                    {isConnected || agentState === "connecting" ? (
                      <XIcon className="h-5 w-5" />
                    ) : (
                      <PhoneIcon className="h-5 w-5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "overflow-hidden transition-all duration-300 ease-out",
                keyboardOpen ? "max-h-[220px]" : "max-h-0"
              )}
            >
              <div className="relative px-2 pt-2 pb-2">
                {pendingAttachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2 pr-10">
                    {pendingAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="bg-foreground/10 text-foreground flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs"
                      >
                        <span className="max-w-[200px] truncate">
                          {attachment.file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(attachment.id)}
                          className="text-foreground/70 hover:text-foreground inline-flex items-center"
                          aria-label={`Remove ${attachment.file.name}`}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Textarea
                  value={textInput}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your message..."
                  className="min-h-[100px] resize-none border-0 pr-12 shadow-none focus-visible:ring-0"
                  disabled={!isConnected}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSendText}
                  disabled={!textInput.trim() || !isConnected}
                  className="absolute right-3 bottom-3 h-8 w-8"
                >
                  <ArrowUpIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    )
  }
)

ConversationBar.displayName = "ConversationBar"
