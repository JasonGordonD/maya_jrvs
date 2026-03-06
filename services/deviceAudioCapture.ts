export class DeviceAudioCapture {
  private stream: MediaStream | null = null;

  async start(): Promise<MediaStream> {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: false,
      audio: true,
    } as any);

    // Stop any video tracks — audio only
    displayStream.getVideoTracks().forEach((track) => track.stop());

    const audioTrack = displayStream.getAudioTracks()[0];
    if (!audioTrack) {
      throw new Error("No audio track in display stream — user did not share audio");
    }

    this.stream = new MediaStream([audioTrack]);
    return this.stream;
  }

  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }
}
