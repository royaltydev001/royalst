import type { Track } from "../types";

interface MediaSessionActions {
    onPrevious?: () => void;
    onNext?: () => void;
}

export function syncMediaSession(track?: Track | null, actions: MediaSessionActions = {}): void {

    if (typeof navigator === "undefined") {
        return;
    }

    if (!("mediaSession" in navigator)) {
        return;
    }

    const currentTrack: Partial<Track> = track || {};
    const title = currentTrack.title || "RoyalStream";
    const artist = currentTrack.artist || "RoyalStream";
    const artwork = currentTrack.artwork || "assets/images/default-cover.png";

    if ("MediaMetadata" in window) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title,
            artist,
            album: "RoyalStream",
            artwork: [
                {
                    src: artwork,
                    sizes: "512x512",
                    type: "image/png"
                }
            ]
        });
    }

    if (navigator.mediaSession.setActionHandler) {
        navigator.mediaSession.setActionHandler("play", () => {
            document.querySelector<HTMLAudioElement>("#audioPlayer")?.play();
        });

        navigator.mediaSession.setActionHandler("pause", () => {
            document.querySelector<HTMLAudioElement>("#audioPlayer")?.pause();
        });

        navigator.mediaSession.setActionHandler("previoustrack", actions.onPrevious || null);
        navigator.mediaSession.setActionHandler("nexttrack", actions.onNext || null);
    }

}

export function updatePlaybackState(isPlaying: boolean): void {

    if (typeof navigator === "undefined") {
        return;
    }

    if (!("mediaSession" in navigator)) {
        return;
    }

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

}
