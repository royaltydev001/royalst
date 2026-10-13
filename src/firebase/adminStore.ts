import { deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where, collection } from "firebase/firestore/lite";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { database } from "./database";
import { fileStorage } from "./storageClient";
import type { Track } from "../types";

const TRACK_LIMIT = 100;
const AUDIO_LIMIT = 50 * 1024 * 1024;
const ART_LIMIT = 5 * 1024 * 1024;
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm", "audio/flac"]);
const ART_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface NewTrack {
  title: string;
  artist: string;
  album: string;
  genre: string;
  artwork: File;
  audio?: File;
  streamUrl?: string;
}

function requireFirebase() {
  if (!database || !fileStorage) throw new Error("Firebase Firestore and Storage must be configured.");
  return { database, fileStorage };
}

export async function isAdmin(uid: string): Promise<boolean> {
  if (!database || !uid) return false;
  const role = await getDoc(doc(database, "admins", uid));
  return role.exists() && role.data().enabled === true;
}

function toTrack(id: string, data: Record<string, unknown>): Track | null {
  if (data.published !== true || typeof data.title !== "string" || typeof data.artist !== "string" || typeof data.artwork !== "string" || typeof data.streamUrl !== "string") return null;
  return {
    id,
    source: "admin",
    title: data.title,
    artist: data.artist,
    album: typeof data.album === "string" ? data.album : "",
    genre: typeof data.genre === "string" ? data.genre : "",
    artwork: data.artwork,
    streamUrl: data.streamUrl,
    duration: typeof data.duration === "number" ? data.duration : undefined,
  };
}

export async function getPublishedTracks(): Promise<Track[]> {
  if (!database) return [];
  const result = await getDocs(query(collection(database, "tracks"), where("published", "==", true), limit(TRACK_LIMIT)));
  return result.docs.map((item) => toTrack(item.id, item.data())).filter((item): item is Track => item !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export async function getAllTracks(): Promise<Track[]> {
  if (!database) throw new Error("Firebase Firestore is not configured.");
  const result = await getDocs(query(collection(database, "tracks"), limit(TRACK_LIMIT)));
  return result.docs.map((item) => toTrack(item.id, item.data())).filter((item): item is Track => item !== null);
}

function validateTrack(input: NewTrack) {
  if (!input.title.trim() || !input.artist.trim()) throw new Error("Track title and artist are required.");
  if (!ART_TYPES.has(input.artwork.type) || input.artwork.size > ART_LIMIT) throw new Error("Artwork must be JPG, PNG, or WebP and no larger than 5 MB.");
  if (input.audio) {
    if (!AUDIO_TYPES.has(input.audio.type) || input.audio.size > AUDIO_LIMIT) throw new Error("Audio must be a supported audio file and no larger than 50 MB.");
  } else {
    let parsed: URL;
    try { parsed = new URL(input.streamUrl || ""); } catch { throw new Error("Enter a valid HTTPS stream URL or upload an audio file."); }
    if (parsed.protocol !== "https:") throw new Error("Stream URLs must use HTTPS.");
  }
}

export async function createTrack(uid: string, input: NewTrack): Promise<void> {
  validateTrack(input);
  const { database: db, fileStorage: storage } = requireFirebase();
  if (!await isAdmin(uid)) throw new Error("This account does not have admin access.");
  const trackRef = doc(collection(db, "tracks"));
  const basePath = `tracks/${trackRef.id}`;
  const artworkRef = ref(storage, `${basePath}/artwork`);
  let audioRef: ReturnType<typeof ref> | null = null;
  try {
    await uploadBytes(artworkRef, input.artwork, { contentType: input.artwork.type });
    const artwork = await getDownloadURL(artworkRef);
    let streamUrl = input.streamUrl?.trim();
    if (input.audio) {
      audioRef = ref(storage, `${basePath}/audio`);
      await uploadBytes(audioRef, input.audio, { contentType: input.audio.type });
      streamUrl = await getDownloadURL(audioRef);
    }
    await setDoc(trackRef, {
      title: input.title.trim(), artist: input.artist.trim(), album: input.album.trim(), genre: input.genre.trim(),
      artwork, streamUrl, source: "admin", published: true, createdBy: uid, createdAt: serverTimestamp(),
    });
  } catch (error) {
    await Promise.allSettled([deleteObject(artworkRef), ...(audioRef ? [deleteObject(audioRef)] : [])]);
    throw error;
  }
}

export async function deleteTrack(trackId: string, uid: string): Promise<void> {
  const { database: db, fileStorage: storage } = requireFirebase();
  if (!await isAdmin(uid)) throw new Error("This account does not have admin access.");
  await deleteDoc(doc(db, "tracks", trackId));
  await Promise.allSettled(["artwork", "audio"].map((file) => deleteObject(ref(storage, `tracks/${trackId}/${file}`))));
}

export const ADMIN_UPLOAD_LIMITS = { audio: AUDIO_LIMIT, artwork: ART_LIMIT };
