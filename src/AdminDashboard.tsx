import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Track } from "./types";
import { ADMIN_UPLOAD_LIMITS, createTrack, deleteTrack, getAllTracks, isAdmin, type NewTrack } from "./firebase/adminStore";

const blank = { title: "", artist: "", album: "", genre: "", artwork: null as File | null, audio: null as File | null, streamUrl: "" };

export default function AdminDashboard() {
  const [uid, setUid] = useState("");
  const [access, setAccess] = useState<"checking" | "signed-out" | "denied" | "granted">("checking");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const artworkInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (userId: string) => {
    const allowed = await isAdmin(userId);
    if (!allowed) { setAccess("denied"); return; }
    setAccess("granted");
    setTracks(await getAllTracks());
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const applyUser = (user: { uid?: string } | undefined) => {
      if (!active) return;
      const userId = user?.uid || "";
      setUid(userId);
      if (!userId) { setAccess("signed-out"); return; }
      setAccess("checking");
      void refresh(userId).catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : "Could not check administrator access."); setAccess("denied"); } });
    };
    const onAuth = (event: Event) => applyUser((event as CustomEvent<{ uid?: string }>).detail);
    window.addEventListener("royalstream:authchange", onAuth);
    void import("./firebase/auth").then(async ({ auth }) => {
      if (!auth) { applyUser(undefined); return; }
      const { onAuthStateChanged } = await import("firebase/auth");
      if (active) unsubscribe = onAuthStateChanged(auth, (user) => applyUser({ uid: user?.uid }));
    }).catch(() => applyUser(undefined));
    return () => { active = false; unsubscribe?.(); window.removeEventListener("royalstream:authchange", onAuth); };
  }, [refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uid || !form.artwork || (!form.audio && !form.streamUrl.trim())) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const input: NewTrack = { title: form.title, artist: form.artist, album: form.album, genre: form.genre, artwork: form.artwork, audio: form.audio || undefined, streamUrl: form.audio ? undefined : form.streamUrl };
      await createTrack(uid, input);
      await refresh(uid);
      setForm(blank);
      if (artworkInput.current) artworkInput.current.value = "";
      if (audioInput.current) audioInput.current.value = "";
      setNotice("Track published and available in the music catalog.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Track could not be published. Check Firebase configuration and rules.");
    } finally { setBusy(false); }
  };

  const remove = async (track: Track) => {
    if (!uid || !window.confirm(`Delete “${track.title}” by ${track.artist}?`)) return;
    setError(""); setNotice("");
    try { await deleteTrack(track.id, uid); await refresh(uid); setNotice("Track deleted."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Track could not be deleted."); }
  };

  return <section className="slide-up admin-page">
    <div className="profile-page-heading"><p className="eyebrow soft">CATALOG MANAGEMENT</p><h1>Admin dashboard</h1><p>Add and publish playable tracks with their artwork and artist details.</p></div>
    {notice && <p className="profile-notice" role="status">{notice}</p>}
    {error && <p className="admin-error" role="alert">{error}</p>}
    {access === "checking" && <section className="profile-card"><p role="status">Checking account access…</p></section>}
    {access === "signed-out" && <section className="profile-card"><h2>Sign in required</h2><p>Sign in through Profile &amp; Settings → Account, then return to this page.</p></section>}
    {access === "denied" && <section className="profile-card"><h2>Administrator access required</h2><p>This account is not enabled as an administrator. A project owner must add a Firestore document at <code>admins/{uid || "YOUR_AUTH_UID"}</code> with <code>{'{ "enabled": true }'}</code>.</p></section>}
    {access === "granted" && <div className="admin-sections">
      <section className="profile-card"><div className="profile-card-heading"><div><h2>Add a track</h2><p>Upload a playable audio file or provide an HTTPS stream URL.</p></div></div>
        <form className="profile-form" onSubmit={submit}>
          <div className="profile-form-grid">
            <label>Track title<input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Artist<input required maxLength={120} value={form.artist} onChange={(event) => setForm({ ...form, artist: event.target.value })} /></label>
            <label>Album (optional)<input maxLength={120} value={form.album} onChange={(event) => setForm({ ...form, album: event.target.value })} /></label>
            <label>Genre (optional)<input maxLength={80} value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })} /></label>
            <label>Artwork · JPG, PNG, WebP<input ref={artworkInput} required type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setForm({ ...form, artwork: event.target.files?.[0] || null })} /><small className="profile-hint">Up to {ADMIN_UPLOAD_LIMITS.artwork / 1024 / 1024} MB</small></label>
            <label>Audio file · optional<input ref={audioInput} type="file" accept="audio/*" onChange={(event) => setForm({ ...form, audio: event.target.files?.[0] || null })} /><small className="profile-hint">Up to {ADMIN_UPLOAD_LIMITS.audio / 1024 / 1024} MB. Uploading audio replaces the stream URL.</small></label>
            <label className="profile-bio-field">HTTPS stream URL{form.audio && <small className="profile-hint">An uploaded audio file will be used instead.</small>}<input type="url" inputMode="url" placeholder="https://…" value={form.streamUrl} disabled={Boolean(form.audio)} required={!form.audio} onChange={(event) => setForm({ ...form, streamUrl: event.target.value })} /></label>
          </div>
          <div className="profile-form-actions"><button className="primary-cta" type="submit" disabled={busy || !form.artwork || (!form.audio && !form.streamUrl.trim())}>{busy ? "Publishing…" : "Publish track"}</button></div>
        </form>
      </section>
      <section className="profile-card"><div className="profile-card-heading"><div><h2>Published tracks</h2><p>{tracks.length} {tracks.length === 1 ? "track" : "tracks"} in the catalog (up to 100 shown).</p></div><button className="secondary-cta" type="button" onClick={() => void refresh(uid)}>Refresh</button></div>
        {tracks.length === 0 ? <p>No tracks have been published yet.</p> : <div className="admin-track-list">{tracks.map((track) => <article className="admin-track" key={track.id}><img src={track.artwork} alt="" /><div><strong>{track.title}</strong><span>{track.artist}{track.album ? ` · ${track.album}` : ""}</span></div><button className="secondary-cta profile-danger-action" type="button" onClick={() => void remove(track)}>Delete</button></article>)}</div>}
      </section>
    </div>}
  </section>;
}
