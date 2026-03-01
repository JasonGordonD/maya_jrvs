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
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type PendingAttachment = {
  id: string
  file: File
}

const ACCEPTED_FILE_TYPES =
  ".pdf,.txt,.md,.docx,.json,.csv,.png,.jpg,.jpeg"

export type AudioInputMode = "mic" | "device" | "mixed"

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

  /**
   * Audio capture mode for session input
   */
  audioInputMode?: AudioInputMode

  /**
   * Callback when system audio capture is currently active
   */
  onSystemAudioCaptureChange?: (isActive: boolean) => void

  /**
   * Changing this signal forces an active session disconnect
   */
  forceDisconnectSignal?: number

  /**
   * Changing this signal starts a brand new session.
   */
  newSessionSignal?: number
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
      audioInputMode = "mic",
      onSystemAudioCaptureChange,
      forceDisconnectSignal,
      newSessionSignal,
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
    const displayStreamRef = React.useRef<MediaStream | null>(null)
    const mixedMicStreamRef = React.useRef<MediaStream | null>(null)
    const mixedDisplayStreamRef = React.useRef<MediaStream | null>(null)
    const audioContextRef = React.useRef<AudioContext | null>(null)
    const previousDisconnectSignalRef = React.useRef<number | undefined>(
      forceDisconnectSignal
    )
    const previousNewSessionSignalRef = React.useRef<number | undefined>(
      newSessionSignal
    )

    const stopStream = React.useCallback((stream: MediaStream | null) => {
      if (!stream) return
      stream.getTracks().forEach((track) => track.stop())
    }, [])

    const cleanupPreparedAudioStreams = React.useCallback(() => {
      stopStream(mediaStreamRef.current)
      stopStream(displayStreamRef.current)
      stopStream(mixedMicStreamRef.current)
      stopStream(mixedDisplayStreamRef.current)

      mediaStreamRef.current = null
      displayStreamRef.current = null
      mixedMicStreamRef.current = null
      mixedDisplayStreamRef.current = null

      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }

      onSystemAudioCaptureChange?.(false)
    }, [onSystemAudioCaptureChange, stopStream])

    const requestDisplayAudioStream = React.useCallback(async () => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("System audio capture not supported in this browser.")
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: false,
      })

      stream.getVideoTracks().forEach((track) => track.stop())
      if (stream.getAudioTracks().length === 0) {
        stopStream(stream)
        throw new Error(
          "No system audio track was shared. Select a tab/window with audio."
        )
      }

      const [audioTrack] = stream.getAudioTracks()
      if (audioTrack) {
        audioTrack.addEventListener(
          "ended",
          () => {
            onSystemAudioCaptureChange?.(false)
          },
          { once: true }
        )
      }

      return stream
    }, [onSystemAudioCaptureChange, stopStream])

    const getMicConstraints = React.useCallback((): MediaTrackConstraints | true => {
      return inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true
    }, [inputDeviceId])

    const getInputStreamForMode = React.useCallback(async () => {
      if (audioInputMode === "mic") {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getMicConstraints(),
        })
        mediaStreamRef.current = stream
        onSystemAudioCaptureChange?.(false)
        return stream
      }

      if (audioInputMode === "device") {
        const displayStream = await requestDisplayAudioStream()
        displayStreamRef.current = displayStream
        mediaStreamRef.current = displayStream
        onSystemAudioCaptureChange?.(true)
        return displayStream
      }

      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: getMicConstraints(),
      })
      const systemStream = await requestDisplayAudioStream()

      const AudioContextCtor =
        window.AudioContext ||
        // @ts-expect-error webkitAudioContext is vendor-prefixed.
        window.webkitAudioContext

      if (!AudioContextCtor) {
        stopStream(micStream)
        stopStream(systemStream)
        throw new Error("Web Audio API is not supported in this browser.")
      }

      const audioContext = new AudioContextCtor()
      audioContextRef.current = audioContext

      const destination = audioContext.createMediaStreamDestination()
      const micSource = audioContext.createMediaStreamSource(micStream)
      const systemSource = audioContext.createMediaStreamSource(systemStream)

      micSource.connect(destination)
      systemSource.connect(destination)
      void audioContext.resume()

      const mixedStream = destination.stream
      mixedMicStreamRef.current = micStream
      mixedDisplayStreamRef.current = systemStream
      mediaStreamRef.current = mixedStream
      onSystemAudioCaptureChange?.(true)

      return mixedStream
    }, [
      audioInputMode,
      getMicConstraints,
      onSystemAudioCaptureChange,
      requestDisplayAudioStream,
      stopStream,
    ])

    const conversation = useConversation({
      onConnect: () => {
        onConnect?.()
      },
      onDisconnect: () => {
        setAgentState("disconnected")
        onDisconnect?.()
        setKeyboardOpen(false)
        cleanupPreparedAudioStreams()
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

    const startSessionWithInputStream = React.useCallback(
      async (
        inputStream: MediaStream,
        sessionConfig:
          | {
              signedUrl: string
              connectionType: "websocket"
              onStatusChange: (status: {
                status:
                  | "disconnected"
                  | "connecting"
                  | "connected"
                  | "disconnecting"
              }) => void
            }
          | {
              agentId: string
              connectionType: "webrtc"
              onStatusChange: (status: {
                status:
                  | "disconnected"
                  | "connecting"
                  | "connected"
                  | "disconnecting"
              }) => void
            }
      ) => {
        // SDK currently supports inputDeviceId. For custom system/mixed streams,
        // we inject the prepared stream into session initialization.
        const originalGetUserMedia =
          navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)

        const injectedGetUserMedia: typeof navigator.mediaDevices.getUserMedia =
          async () => inputStream

        ;(
          navigator.mediaDevices as MediaDevices & {
            getUserMedia: typeof navigator.mediaDevices.getUserMedia
          }
        ).getUserMedia = injectedGetUserMedia

        try {
          return await conversation.startSession({
            ...sessionConfig,
            ...(audioInputMode === "mic" && inputDeviceId
              ? { inputDeviceId }
              : {}),
          })
        } finally {
          ;(
            navigator.mediaDevices as MediaDevices & {
              getUserMedia: typeof navigator.mediaDevices.getUserMedia
            }
          ).getUserMedia = originalGetUserMedia
        }
      },
      [audioInputMode, conversation, inputDeviceId]
    )

    const startConversation = React.useCallback(async () => {
      try {
        setAgentState("connecting")

        const inputStream = await getInputStreamForMode()

        if (getSignedUrl) {
          const signedUrl = await getSignedUrl()
          const conversationId = await startSessionWithInputStream(inputStream, {
            signedUrl,
            connectionType: "websocket",
            onStatusChange: (status) => setAgentState(status.status),
          })
          onConversationId?.(conversationId)
          return
        }

        if (!agentId) {
          throw new Error(
            "ConversationBar requires either getSignedUrl or agentId"
          )
        }

        const conversationId = await startSessionWithInputStream(inputStream, {
          agentId,
          connectionType: "webrtc",
          onStatusChange: (status) => setAgentState(status.status),
        })
        onConversationId?.(conversationId)
      } catch (error) {
        console.error("Error starting conversation:", error)
        setAgentState("disconnected")
        cleanupPreparedAudioStreams()
        onError?.(error as Error)
      }
    }, [
      getInputStreamForMode,
      getSignedUrl,
      agentId,
      onError,
      onConversationId,
      startSessionWithInputStream,
      cleanupPreparedAudioStreams,
    ])

    const endConversation = React.useCallback(async () => {
      try {
        await conversation.endSession()
      } catch (error) {
        console.error("Error ending conversation:", error)
      } finally {
        setAgentState("disconnected")
        cleanupPreparedAudioStreams()
      }
    }, [conversation, cleanupPreparedAudioStreams])

    const handleEndSession = React.useCallback(() => {
      void endConversation()
    }, [endConversation])

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
        cleanupPreparedAudioStreams()
      }
    }, [cleanupPreparedAudioStreams])

    React.useEffect(() => {
      cleanupPreparedAudioStreams()
    }, [inputDeviceId, audioInputMode, cleanupPreparedAudioStreams])

    React.useEffect(() => {
      if (!agentState) return
      onConnectionStatusChange?.(agentState)
    }, [agentState, onConnectionStatusChange])

    React.useEffect(() => {
      onSpeakingChange?.(conversation.isSpeaking)
    }, [conversation.isSpeaking, onSpeakingChange])

    React.useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented) return
        if (event.key.toLowerCase() !== "m") return
        if (event.metaKey || event.ctrlKey || event.altKey) return

        const active = document.activeElement as HTMLElement | null
        if (active) {
          const tag = active.tagName
          if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            tag === "SELECT" ||
            active.isContentEditable
          ) {
            return
          }
        }

        event.preventDefault()
        setIsMuted((prev) => !prev)
      }

      window.addEventListener("keydown", onKeyDown)
      return () => {
        window.removeEventListener("keydown", onKeyDown)
      }
    }, [])

    React.useEffect(() => {
      if (forceDisconnectSignal === previousDisconnectSignalRef.current) {
        return
      }

      previousDisconnectSignalRef.current = forceDisconnectSignal
      if (agentState === "connected" || agentState === "connecting") {
        void endConversation()
      }
    }, [agentState, forceDisconnectSignal, endConversation])

    React.useEffect(() => {
      if (newSessionSignal === previousNewSessionSignalRef.current) {
        return
      }

      previousNewSessionSignalRef.current = newSessionSignal

      const startFreshSession = async () => {
        if (agentState === "connected" || agentState === "connecting") {
          await endConversation()
        }
        await startConversation()
      }

      void startFreshSession()
    }, [agentState, endConversation, newSessionSignal, startConversation])

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
