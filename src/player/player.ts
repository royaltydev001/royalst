import QueueManager from "./queue";
import { syncMediaSession, updatePlaybackState } from "./mediaSession";
import type { Track } from "../types";
import Storage from "../storage/storage";
import { CONFIG } from "../config";

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

class Player {
  private audio: HTMLAudioElement | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  private listeners: Set<(state: PlayerState) => void>;

  constructor() {
    this.audio = null;
    this.currentTrack = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.listeners = new Set<(state: PlayerState) => void>();
  }

  attachAudio(audio: HTMLAudioElement | null) {
    if (this.audio === audio) return;
    this.audio = audio;
    if (!audio) return;
    audio.volume = Storage.get<number>("royalstream:volume", CONFIG.PLAYER.DEFAULT_VOLUME) ?? CONFIG.PLAYER.DEFAULT_VOLUME;
    audio.addEventListener("play", () => this.setPlaying(true));
    audio.addEventListener("pause", () => this.setPlaying(false));
    audio.addEventListener("timeupdate", () => {
      this.currentTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      this.notify();
    });
    audio.addEventListener("loadedmetadata", () => this.updateDuration());
    audio.addEventListener("durationchange", () => this.updateDuration());
    audio.addEventListener("ended", () => {
      if (Storage.get<boolean>("royalstream:autoplay", true) ?? true) this.next(true);
      else this.setPlaying(false);
    });
  }

  subscribe(listener: (state: PlayerState) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): PlayerState {
    return {
      currentTrack: this.currentTrack,
      isPlaying: this.isPlaying,
      currentTime: this.currentTime,
      duration: this.duration,
    };
  }

  private updateDuration(): void {
    this.duration = this.audio && Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    this.notify();
  }

  notify(): void {
    const state = this.snapshot();
    this.listeners.forEach((listener) => listener(state));
  }

  setPlaying(isPlaying: boolean): void {
    this.isPlaying = isPlaying;
    updatePlaybackState(isPlaying);
    this.notify();
  }

  async playTrack(track: Track | null | undefined, { fromQueue = false }: { fromQueue?: boolean } = {}): Promise<Track | null> {
    if (!track || !this.audio) return null;
    const streamUrl = track.streamUrl || track.url || track.preview;
    if (!streamUrl) {
      console.warn("Track has no stream URL.", track);
      return null;
    }

    if (!fromQueue) {
      const index = QueueManager.queue.findIndex((item) => item.id === track.id);
      if (index >= 0) QueueManager.currentIndex = index;
      else {
        QueueManager.add(track);
        QueueManager.currentIndex = QueueManager.queue.length - 1;
      }
    }

    this.currentTrack = track;
    this.currentTime = 0;
    this.duration = 0;
    this.audio.src = streamUrl;
    this.audio.load();
    syncMediaSession(track, {
      onPrevious: () => this.previous(),
      onNext: () => this.next(),
    });
    this.notify();
    try {
      await this.audio.play();
      this.recordRecentlyPlayed(track);
    } catch (error) {
      this.setPlaying(false);
      console.warn("Playback could not start:", error);
    }
    return track;
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) return;
    const bounded = Math.min(1, Math.max(0, volume));
    if (this.audio) this.audio.volume = bounded;
  }

  private recordRecentlyPlayed(track: Track): void {
    if (!(Storage.get<boolean>("royalstream:saveListeningHistory", true) ?? true)) return;
    const previous = Storage.get<Track[]>("royalstream:recentlyPlayed", []) ?? [];
    const recent = [track, ...previous.filter((item) => item.id !== track.id)].slice(0, 30);
    if (!Storage.set("royalstream:recentlyPlayed", recent)) {
      console.warn("Recently played history could not be saved.");
      return;
    }
    window.dispatchEvent(new Event("royalstream:recentlyplayed"));
  }

  async resume(): Promise<Track | null> {
    if (!this.currentTrack || !this.audio) return null;
    try {
      await this.audio.play();
    } catch (error) {
      this.setPlaying(false);
      console.warn("Playback could not resume:", error);
    }
    return this.currentTrack;
  }

  pause(): void {
    this.audio?.pause();
  }

  seek(seconds: number): void {
    if (!this.audio || !Number.isFinite(this.duration)) return;
    const position = Math.min(Math.max(seconds, 0), this.duration);
    this.audio.currentTime = position;
    this.currentTime = position;
    this.notify();
  }

  next(fromEnded = false): void {
    const track = QueueManager.next();
    if (track) {
      void this.playTrack(track, { fromQueue: true });
      return;
    }
    if (!fromEnded && this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    this.currentTime = fromEnded ? this.duration : 0;
    this.setPlaying(false);
  }

  previous(): void {
    const track = QueueManager.previous();
    if (track) void this.playTrack(track, { fromQueue: true });
  }
}

const player = new Player();
export default player;
