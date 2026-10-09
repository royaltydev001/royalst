import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore/lite";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { database } from "./database";
import { fileStorage } from "./storageClient";

export interface CloudProfile {
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
}

export async function loadCloudProfile(uid: string): Promise<CloudProfile | null> {
  if (!database) return null;
  const result = await getDoc(doc(database, "users", uid));
  if (!result.exists()) return null;
  const value = result.data();
  return {
    username: typeof value.username === "string" ? value.username : "",
    displayName: typeof value.displayName === "string" ? value.displayName : "",
    bio: typeof value.bio === "string" ? value.bio : "",
    avatar: typeof value.avatar === "string" ? value.avatar : "",
  };
}

export async function saveCloudProfile(uid: string, profile: CloudProfile): Promise<void> {
  if (!database) throw new Error("Firebase is not configured.");
  await setDoc(doc(database, "users", uid), {
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    avatar: profile.avatar,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function uploadCloudAvatar(uid: string, file: File): Promise<string> {
  if (!fileStorage) throw new Error("Firebase Storage is not configured.");
  const avatarRef = ref(fileStorage, `users/${uid}/avatar`);
  await uploadBytes(avatarRef, file, { contentType: file.type });
  return getDownloadURL(avatarRef);
}
