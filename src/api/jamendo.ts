// Jamendo API adapter.

import { CONFIG } from "../config";
import type { JamendoTrackData, Track } from "../types";

const BASE_URL = CONFIG.JAMENDO.BASE_URL;
const CLIENT_ID = CONFIG.JAMENDO.CLIENT_ID;

class JamendoAPI {

    async request(endpoint: string, params: Record<string, string | number | undefined | null> = {}): Promise<JamendoTrackData[]> {

        const url = new URL(`${BASE_URL}/${endpoint}`);

        url.searchParams.set("client_id", CLIENT_ID);
        url.searchParams.set("format", "json");

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, String(value));
            }
        });

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Jamendo request failed (${response.status})`);
        }

        const data = await response.json();

        return data.results || [];
    }

    normalize(track: JamendoTrackData): Track {

        return {

            id: `jamendo-${track.id}`,

            source: "jamendo",

            title: track.name || "Untitled track",

            artist: track.artist_name || "Unknown artist",

            album: track.album_name || "",

            artwork:
                track.image ||
                track.album_image ||
                "",

            streamUrl: track.audio,

            duration: track.duration,

            permalink: track.shareurl,

            genre: track.musicinfo?.tags?.genres?.join(", ") || ""

        };

    }

    async trending(limit = 20): Promise<Track[]> {

        const tracks = await this.request("tracks", {

            order: "popularity_total",

            audioformat: "mp32",

            limit

        });

        return tracks.map(track => this.normalize(track));

    }

    async search(query: string, limit = 20): Promise<Track[]> {

        if (!query.trim())
            return [];

        const tracks = await this.request("tracks", {

            namesearch: query,

            audioformat: "mp32",

            limit

        });

        return tracks.map(track => this.normalize(track));

    }

}

export default new JamendoAPI();
