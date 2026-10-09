export interface Track {
  id: string;
  source: "jamendo" | "audius" | string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  streamUrl?: string | null;
  duration?: number;
  permalink?: string;
  genre?: string;
  image?: string;
  url?: string;
  preview?: string;
}

export interface AudiusTrackData {
  id: string;
  title?: string;
  user?: { name?: string };
  artwork?: Record<string, string | undefined>;
  duration?: number;
  permalink?: string;
  genre?: string;
  stream?: { url?: string };
  stream_url?: string;
  audio?: string;
}

export interface JamendoTrackData {
  id: string;
  name?: string;
  artist_name?: string;
  album_name?: string;
  image?: string;
  album_image?: string;
  audio?: string;
  duration?: number;
  shareurl?: string;
  musicinfo?: { tags?: { genres?: string[] } };
}
