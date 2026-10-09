// Combined Jamendo and Audius API.

import Jamendo from "./jamendo";
import Audius from "./audius";
import type { Track } from "../types";

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

        const [jamendo, audius] = await Promise.allSettled([
            Jamendo.trending(limit),
            Audius.trending(limit)
        ]);

        return this.combine([jamendo, audius]);

    }

    async search(query: string): Promise<MusicResult> {

        const [jamendo, audius] = await Promise.allSettled([
            Jamendo.search(query),
            Audius.search(query)
        ]);

        return this.combine([jamendo, audius]);

    }

}

export default new MusicAPI();
