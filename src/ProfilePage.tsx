import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Player from "./player/player";
import Storage from "./storage/storage";
import type { Track } from "./types";
import { CONFIG } from "./config";

const FirebaseAccount = lazy(() => import("./FirebaseAccount"));

type ProfileTab = "profile" | "preferences" | "account" | "help";

interface UserProfile {
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatar: string;
}

const PROFILE_KEY = "royalstream:profile";
const FAVORITES_KEY = "royalstream:favorites";
const HISTORY_KEY = "royalstream:recentlyPlayed";
const HISTORY_EVENT = "royalstream:recentlyplayed";
const EMPTY_PROFILE: UserProfile = { username: "", displayName: "", email: "", bio: "", avatar: "" };
const TABS: { id: ProfileTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Playback & Appearance" },
  { id: "account", label: "Account & Privacy" },
  { id: "help", label: "Help" },
];

function readProfile(): UserProfile {
  const stored = Storage.get<Partial<UserProfile>>(PROFILE_KEY, {}) ?? {};
  return { ...EMPTY_PROFILE, ...stored, email: "" };
}

function PreferenceRow({ title, description, checked, onChange }: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-item profile-preference">
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export default function ProfilePage({ navigate }: { navigate: (page: "library" | "admin") => void }) {
  const [tab, setTab] = useState<ProfileTab>("profile");
  const [profile, setProfile] = useState<UserProfile>(readProfile);
  const [draft, setDraft] = useState<UserProfile>(readProfile);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [firebaseUser, setFirebaseUser] = useState({ uid: "", email: "" });
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [cloudProfileLoaded, setCloudProfileLoaded] = useState(false);
  const [editing, setEditing] = useState(() => {
    const saved = readProfile();
    return !saved.username && !saved.displayName && !saved.bio && !saved.avatar;
  });
  const [notice, setNotice] = useState("");
  const [darkMode, setDarkMode] = useState(() => Storage.get<boolean>("royalstream:darkMode", true) ?? true);
  const [offlineCache, setOfflineCache] = useState(() => Storage.get<boolean>("royalstream:offlineCache", true) ?? true);
  const [autoplay, setAutoplay] = useState(() => Storage.get<boolean>("royalstream:autoplay", true) ?? true);
  const [saveHistory, setSaveHistory] = useState(() => Storage.get<boolean>("royalstream:saveListeningHistory", true) ?? true);
  const [volume, setVolume] = useState(() => Storage.get<number>("royalstream:volume", CONFIG.PLAYER.DEFAULT_VOLUME) ?? CONFIG.PLAYER.DEFAULT_VOLUME);
  const [favorites, setFavorites] = useState<Track[]>(() => Storage.get<Track[]>(FAVORITES_KEY, []) ?? []);
  const [recent, setRecent] = useState<Track[]>(() => Storage.get<Track[]>(HISTORY_KEY, []) ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const acceptUser = (detail: { uid?: string; email?: string } | undefined) => {
      if (!active) return;
      setFirebaseUser({ uid: detail?.uid ?? "", email: detail?.email ?? "" });
      setCloudProfileLoaded(!detail?.uid);
    };
    const handleAuthChange = (event: Event) => acceptUser((event as CustomEvent<{ uid?: string; email?: string }>).detail);
    window.addEventListener("royalstream:authchange", handleAuthChange);
    void import("./firebase/auth").then(({ auth }) => {
      if (active) acceptUser({ uid: auth?.currentUser?.uid, email: auth?.currentUser?.email ?? "" });
    }).catch(() => acceptUser(undefined));
    return () => {
      active = false;
      window.removeEventListener("royalstream:authchange", handleAuthChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setAdminEnabled(false);
    if (firebaseUser.uid) {
      void import("./firebase/adminStore").then(({ isAdmin }) => isAdmin(firebaseUser.uid))
        .then((enabled) => { if (active) setAdminEnabled(enabled); })
        .catch(() => { if (active) setAdminEnabled(false); });
    }
    return () => { active = false; };
  }, [firebaseUser.uid]);

  useEffect(() => {
    if (!firebaseUser.uid) {
      const localProfile = readProfile();
      setProfile(localProfile);
      setDraft(localProfile);
      setAvatarFile(null);
      setEditing(!localProfile.username && !localProfile.displayName && !localProfile.bio && !localProfile.avatar);
      return;
    }
    let active = true;
    setCloudProfileLoaded(false);
    void import("./firebase/profileStore").then(({ loadCloudProfile }) => loadCloudProfile(firebaseUser.uid))
      .then((cloudProfile) => {
        if (!active) return;
        if (cloudProfile) {
          const nextProfile = { ...EMPTY_PROFILE, ...cloudProfile, email: "" };
          setProfile(nextProfile);
          setDraft(nextProfile);
          setEditing(false);
        }
        setCloudProfileLoaded(true);
      })
      .catch(() => {
        if (active) {
          setCloudProfileLoaded(true);
          setNotice("Could not load your cloud profile. Check your connection and Firebase rules.");
        }
      });
    return () => { active = false; };
  }, [firebaseUser.uid]);

  const favoriteArtists = useMemo(() => {
    const seen = new Set<string>();
    return favorites.flatMap((track) => {
      const name = track.artist?.trim();
      const key = name?.toLocaleLowerCase();
      if (!name || !key || seen.has(key)) return [];
      seen.add(key);
      return [name];
    });
  }, [favorites]);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
    setNotice(Storage.set("royalstream:darkMode", darkMode) ? "" : "Your appearance preference may not be saved because browser storage is unavailable.");
  }, [darkMode]);

  useEffect(() => {
    Player.setVolume(volume);
    setNotice(Storage.set("royalstream:volume", volume) ? "" : "Your volume preference may not be saved because browser storage is unavailable.");
  }, [volume]);

  useEffect(() => {
    setNotice(Storage.set("royalstream:autoplay", autoplay) ? "" : "Your autoplay preference may not be saved because browser storage is unavailable.");
  }, [autoplay]);

  useEffect(() => {
    setNotice(Storage.set("royalstream:saveListeningHistory", saveHistory) ? "" : "Your history preference may not be saved because browser storage is unavailable.");
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({ type: "SET_OFFLINE_CACHE", enabled: offlineCache });
      });
    }
  }, [offlineCache, saveHistory]);

  useEffect(() => {
    setNotice(Storage.set("royalstream:offlineCache", offlineCache) ? "" : "Your offline cache preference may not be saved because browser storage is unavailable.");
  }, [offlineCache]);

  useEffect(() => {
    const refreshFavorites = () => setFavorites(Storage.get<Track[]>(FAVORITES_KEY, []) ?? []);
    const refreshHistory = () => setRecent(Storage.get<Track[]>(HISTORY_KEY, []) ?? []);
    window.addEventListener("storage", refreshFavorites);
    window.addEventListener("royalstream:favoriteschange", refreshFavorites);
    window.addEventListener("storage", refreshHistory);
    window.addEventListener(HISTORY_EVENT, refreshHistory);
    return () => {
      window.removeEventListener("storage", refreshFavorites);
      window.removeEventListener("royalstream:favoriteschange", refreshFavorites);
      window.removeEventListener("storage", refreshHistory);
      window.removeEventListener(HISTORY_EVENT, refreshHistory);
    };
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      let nextProfile = { ...draft, email: "" };
      if (firebaseUser.uid) {
        const { saveCloudProfile, uploadCloudAvatar } = await import("./firebase/profileStore");
        if (avatarFile) nextProfile = { ...nextProfile, avatar: await uploadCloudAvatar(firebaseUser.uid, avatarFile) };
        await saveCloudProfile(firebaseUser.uid, nextProfile);
      } else if (!Storage.set(PROFILE_KEY, nextProfile)) {
        setNotice("Could not save your profile. Browser storage may be full or unavailable; try a smaller image.");
        return;
      }
      setProfile(nextProfile);
      setDraft(nextProfile);
      setAvatarFile(null);
      setEditing(false);
      setNotice(firebaseUser.uid ? "Profile saved to your account." : "Profile saved on this device.");
    } catch {
      setNotice("Could not save your profile. Check your connection, Firebase rules, and available storage.");
    }
  };

  const changeAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setNotice("Choose an image file.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setNotice("Profile images must be 1 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDraft((current) => ({ ...current, avatar: reader.result as string }));
        setAvatarFile(file);
        setNotice("");
      }
    };
    reader.onerror = () => setNotice("The selected image could not be read.");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const clearLocalProfile = () => {
    if (!window.confirm("Remove the profile information saved on this device? This does not delete an online account.")) return;
    if (!Storage.remove(PROFILE_KEY)) {
      setNotice("Could not remove the local profile because browser storage is unavailable.");
      return;
    }
    setProfile(EMPTY_PROFILE);
    setDraft(EMPTY_PROFILE);
    setEditing(true);
    setNotice("Local profile information removed.");
  };

  const clearHistory = () => {
    if (!window.confirm("Clear recently played tracks saved on this device?")) return;
    if (!Storage.remove(HISTORY_KEY)) {
      setNotice("Could not clear listening history because browser storage is unavailable.");
      return;
    }
    setRecent([]);
    setNotice("Recently played history cleared.");
  };

  return (
    <section className="slide-up profile-page">
      <div className="profile-page-heading">
        <p className="eyebrow soft">YOUR SPACE</p>
        <h1>Profile &amp; Settings</h1>
        <p>Manage your profile and app preferences.</p>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="Profile and settings sections">
        {TABS.map((item) => (
          <button key={item.id} id={`profile-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls="profile-tabpanel" className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setNotice(""); }}>
            {item.label}
          </button>
        ))}
      </div>

      <div id="profile-tabpanel" className="profile-tabpanel" role="tabpanel" aria-labelledby={`profile-tab-${tab}`}>
        {notice && <p className="profile-notice" role="status">{notice}</p>}

        {tab === "profile" && (
          <div className="profile-sections">
            <section className="profile-card profile-main-card" aria-labelledby="profile-details-heading">
              <div className="profile-card-heading">
                <div><h2 id="profile-details-heading">Profile details</h2><p>{firebaseUser.uid ? "Profile details are saved to your Firebase account." : "Signed-out profile details are saved only in this browser."}</p></div>
                {!editing && <button className="secondary-cta" type="button" onClick={() => { setDraft(profile); setEditing(true); setNotice(""); }}>Edit profile</button>}
              </div>
              {editing ? (
                <form className="profile-form" onSubmit={saveProfile}>
                  <div className="profile-avatar-row">
                    <div className="profile-avatar" aria-hidden="true">
                      {draft.avatar ? <img src={draft.avatar} alt="" /> : <span>{(draft.displayName || draft.username || "?").trim().slice(0, 1).toUpperCase()}</span>}
                    </div>
                    <div>
                      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" onChange={changeAvatar} />
                      <button className="secondary-cta" type="button" onClick={() => fileInputRef.current?.click()}>Change picture</button>
                      <p className="profile-hint">Image file, up to 1 MB. Saved only on this device.</p>
                    </div>
                  </div>
                  <div className="profile-form-grid">
                    <label>Username<input autoComplete="username" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} maxLength={40} /></label>
                    <label>Display name<input autoComplete="name" value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} maxLength={80} /></label>
                    <label>Email address<input type="email" value="" placeholder="Requires an account service" disabled aria-describedby="email-account-note" /><small id="email-account-note" className="profile-hint">Email cannot be edited until account support is available.</small></label>
                    <label className="profile-bio-field">Bio<textarea value={draft.bio} onChange={(event) => setDraft({ ...draft, bio: event.target.value })} rows={3} maxLength={280} /></label>
                  </div>
                  <div className="profile-form-actions">
                    {profile.displayName || profile.username || profile.bio || profile.avatar ? <button className="inline-link" type="button" onClick={() => { setDraft(profile); setEditing(false); setNotice(""); }}>Cancel</button> : null}
                    <button className="primary-cta" type="submit" disabled={Boolean(firebaseUser.uid) && !cloudProfileLoaded}>{cloudProfileLoaded ? "Save profile" : "Loading profile…"}</button>
                  </div>
                </form>
              ) : (
                <div className="profile-summary">
                  <div className="profile-avatar">{profile.avatar ? <img src={profile.avatar} alt="Profile" /> : <span>{(profile.displayName || profile.username || "?").trim().slice(0, 1).toUpperCase()}</span>}</div>
                  <div><h3>{profile.displayName || "Display name not set"}</h3><p>{profile.username ? `@${profile.username}` : "Username not set"}</p><p>{firebaseUser.email || "Email account details are unavailable."}</p>{profile.bio && <p className="profile-bio">{profile.bio}</p>}</div>
                </div>
              )}
            </section>

            <section className="profile-card" aria-labelledby="profile-library-heading">
              <div className="profile-card-heading"><div><h2 id="profile-library-heading">Your music</h2><p>Your library activity saved in this app.</p></div></div>
              <div className="profile-music-grid">
                <div className="profile-stat"><strong>Liked songs</strong><span>{favorites.length}</span><button className="inline-link" type="button" onClick={() => navigate("library")}>Open library</button></div>
                <div className="profile-stat"><strong>Recently played</strong><span>{recent.length}</span><small>{recent.slice(0, 3).map((track) => track.title).filter(Boolean).join(" · ") || "No listening history yet"}</small></div>
                <div className="profile-stat"><strong>Favorite artists</strong><span>{favoriteArtists.length}</span><small>{favoriteArtists.slice(0, 3).join(" · ") || "Like songs to build this list"}</small></div>
                <div className="profile-stat"><strong>My playlists</strong><span>—</span><small>Playlist creation is not available in this app yet.</small></div>
              </div>
            </section>
          </div>
        )}

        {tab === "preferences" && (
          <div className="profile-sections">
            <section className="profile-card"><div className="profile-card-heading"><div><h2>Playback</h2><p>Adjust playback behavior and sound level.</p></div></div>
              <PreferenceRow title="Autoplay next track" description="Continue to the next queued track when a song ends." checked={autoplay} onChange={setAutoplay} />
              <label className="setting-item profile-volume-row"><span><strong>Volume</strong><small>{Math.round(volume * 100)}% default player volume</small></span><input type="range" min="0" max="1" step="0.01" value={volume} aria-label="Default playback volume" onChange={(event) => setVolume(Number(event.target.value))} /></label>
              <div className="profile-info-row"><strong>Audio quality</strong><p>Quality is provided by the music stream. This app has no quality-selection control.</p></div>
            </section>
            <section className="profile-card"><div className="profile-card-heading"><div><h2>Appearance &amp; notifications</h2><p>Choose how RoyalStream behaves on this device.</p></div></div>
              <PreferenceRow title="Dark mode" description="Use the dark appearance." checked={darkMode} onChange={setDarkMode} />
              <PreferenceRow title="Offline cache" description="Keep app assets and recent music results available offline." checked={offlineCache} onChange={setOfflineCache} />
              <div className="profile-info-row"><strong>Notifications</strong><p>Notifications are not available because this app has no notification service.</p></div>
            </section>
          </div>
        )}

        {tab === "account" && (
          <div className="profile-sections">
            {adminEnabled && <section className="profile-card"><div className="profile-card-heading"><div><h2>Catalog administration</h2><p>Manage tracks and artwork published on RoyalStream.</p></div><button className="primary-cta" type="button" onClick={() => navigate("admin")}>Open admin dashboard</button></div></section>}
            <section className="profile-card"><Suspense fallback={<p role="status">Loading account tools…</p>}><FirebaseAccount /></Suspense></section>
            <section className="profile-card"><div className="profile-card-heading"><div><h2>Account information</h2><p>Firebase handles sign-in and profile details. Preferences and music activity remain on this device for now.</p></div></div>
              <div className="profile-info-row"><strong>Username</strong><p>{profile.username || "Not set"} · Edit this under Profile.</p></div>
              <div className="profile-info-row"><strong>Email</strong><p>The signed-in email is shown in the Firebase sign-in panel. Email changes are not wired yet.</p></div>
              <div className="profile-info-row"><strong>Password</strong><p>For email/password accounts, change your password in the sign-in panel. Google accounts manage passwords with Google.</p></div>
            </section>
            <section className="profile-card"><div className="profile-card-heading"><div><h2>Privacy &amp; security</h2><p>Profile, favorites, preferences, and listening history currently remain in this browser.</p></div></div>
              <PreferenceRow title="Save listening history" description="Keep a list of recently played tracks on this device." checked={saveHistory} onChange={setSaveHistory} />
              <button className="secondary-cta profile-danger-action" type="button" onClick={clearHistory}>Clear listening history</button>
              <div className="profile-info-row"><strong>Delete account</strong><p>Secure account deletion needs a server-side cleanup function before it can be offered.</p></div>
              <button className="inline-link profile-remove-action" type="button" onClick={clearLocalProfile}>Remove local profile information</button>
            </section>
          </div>
        )}

        {tab === "help" && (
          <section className="profile-card"><div className="profile-card-heading"><div><h2>Help &amp; support</h2><p>Help resources and account support are not configured for this app yet.</p></div></div>
            <div className="profile-info-row"><strong>Playback help</strong><p>If a track will not play, try another track or check your connection. Stream availability depends on the source.</p></div>
            <div className="profile-info-row"><strong>Contact support</strong><p>No support email or help endpoint is configured.</p></div>
          </section>
        )}
      </div>
    </section>
  );
}
