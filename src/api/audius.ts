// Audius discovery API adapter.

import type { AudiusTrackData, Track } from "../types";

const HOST = "https://discoveryprovider.audius.co";

class AudiusAPI {

    async getBaseURL() {

        const response = await fetch(`${HOST}/`);

        const data = await response.json();

        return data.data;
    }

  async request(endpoint: string): Promise<AudiusTrackData[]> {

        const base = await this.getBaseURL();

        const response = await fetch(`${base}${endpoint}`);

        if (!response.ok)
            throw new Error("Audius request failed");

        const data = await response.json();

        return data.data || [];

    }

  normalize(track: AudiusTrackData): Track {

        const streamUrl =
            track.stream?.url ||
            track.stream_url ||
            track.audio ||
            null;

        return {

            id: `audius-${track.id}`,

            source: "audius",

            title: track.title || "Untitled track",

            artist: track.user?.name || "Unknown artist",

            album: "",

            artwork:
                track.artwork?.["480x480"] ||
                track.artwork?.["1000x1000"] ||
                "",

            streamUrl,

            duration: track.duration,

            permalink: track.permalink,

            genre: track.genre || ""

        };

    }

  async trending(limit = 20): Promise<Track[]> {

        const tracks = await this.request(
            `/v1/tracks/trending?limit=${limit}`
        );

        return tracks.map(track => this.normalize(track));

    }

  async search(query: string, limit = 20): Promise<Track[]> {

        if (!query.trim())
            return [];

        const tracks = await this.request(
            `/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`
        );

        return tracks.map(track => this.normalize(track));

    }

}

export default new AudiusAPI();
