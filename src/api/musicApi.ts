// Combined Jamendo and Audius API.

import Jamendo from "./jamendo";
import Audius from "./audius";
import type { Track } from "../types";

function getPublishedTracks() {
    return import("../firebase/adminStore").then(({ getPublishedTracks: load }) => load());
}

export interface MusicResult {
    tracks: Track[];
    failedSources: number;
}

function hasPlayableStream(track: Track): boolean {
    if (typeof track.streamUrl !== "string" || !track.streamUrl.trim()) return false;
    try {
        const stream = new URL(track.streamUrl);
        return stream.protocol === "https:" || stream.protocol === "http:";
    } catch {
        return false;
    }
}

class MusicAPI {

    private combine(results: PromiseSettledResult<Track[]>[]): MusicResult {
        const tracks = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
        return {
            tracks: tracks.filter(hasPlayableStream),
            failedSources: results.filter((result) => result.status === "rejected").length,
        };
    }

    async trending(limit = 20): Promise<MusicResult> {

        const [jamendo, audius, admin] = await Promise.allSettled([
            Jamendo.trending(limit),
            Audius.trending(limit),
            getPublishedTracks(),
        ]);

        const combined = this.combine([jamendo, audius]);
        const adminTracks = admin.status === "fulfilled" ? admin.value : [];
        return { ...combined, tracks: [...adminTracks, ...combined.tracks].slice(0, limit) };

    }

    async search(query: string): Promise<MusicResult> {

        const [jamendo, audius, admin] = await Promise.allSettled([
            Jamendo.search(query),
            Audius.search(query),
            getPublishedTracks(),
        ]);

        const combined = this.combine([jamendo, audius]);
        const term = query.trim().toLocaleLowerCase();
        const adminTracks = admin.status === "fulfilled" ? admin.value.filter((track) =>
            [track.title, track.artist, track.album, track.genre].some((value) => value?.toLocaleLowerCase().includes(term))) : [];
        return { ...combined, tracks: [...adminTracks, ...combined.tracks] };

    }

}

export default new MusicAPI();
