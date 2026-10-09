import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import MusicAPI from "./api/musicApi";
import Player from "./player/player";
import QueueManager from "./player/queue";
import ProfilePage from "./ProfilePage";
import Storage from "./storage/storage";
import type { Track } from "./types";
import { formatTime } from "./utils/time";

const DEFAULT_COVER = "assets/images/default-cover.png";
const PAGES = ["home", "discover", "search", "library", "profile"] as const;
type PageName = typeof PAGES[number];
const FAVORITES_CHANGE_EVENT = "royalstream:favoriteschange";

function pageFromUrl(): PageName {
  const requested = new URLSearchParams(window.location.search).get("page");
  if (requested === "settings") {
    const url = new URL(window.location.href);
    url.searchParams.set("page", "profile");
    window.history.replaceState({ page: "profile" }, "", `${url.pathname}${url.search}${url.hash}`);
    return "profile";
  }
  return PAGES.includes(requested as PageName) ? requested as PageName : "home";
}

function TrackCard({ track }: { track: Track }) {
  const [favorite, setFavorite] = useState(() =>
    (Storage.get<Track[]>("royalstream:favorites", []) ?? []).some((item) => item.id === track.id),
  );
  const [storageError, setStorageError] = useState(false);

  const toggleFavorite = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const favorites = Storage.get<Track[]>("royalstream:favorites", []) ?? [];
    const index = favorites.findIndex((item) => item.id === track.id);
    if (index >= 0) favorites.splice(index, 1);
    else favorites.push(track);
    if (!Storage.set("royalstream:favorites", favorites)) {
      setStorageError(true);
      return;
    }
    setStorageError(false);
    window.dispatchEvent(new Event(FAVORITES_CHANGE_EVENT));
    setFavorite(index < 0);
  };

  return (
    <article className="track-card">
      <button className="track-play" type="button" onClick={() => Player.playTrack(track)} aria-label={`Play ${track.title || "track"} by ${track.artist || "unknown artist"}`}>
        <img src={track.artwork || DEFAULT_COVER} alt="" loading="lazy" />
        <div className="track-details">
          <h3>{track.title || "Untitled track"}</h3>
          <p>{track.artist || "Unknown artist"}</p>
        </div>
      </button>
      <div className="favorite-action">
        <button className="favorite-toggle" type="button" aria-label={favorite ? `Remove ${track.title || "track"} from favorites` : `Add ${track.title || "track"} to favorites`} onClick={toggleFavorite} aria-pressed={favorite}>
          {favorite ? "♥" : "♡"}
        </button>
        {storageError && <span className="favorite-storage-error" role="status">Could not save favorite</span>}
      </div>
    </article>
  );
}

function TrackCollection({ tracks, emptyText = "No tracks found." }: { tracks: Track[]; emptyText?: string }) {
  if (!tracks.length) return <p>{emptyText}</p>;
  return tracks.map((track) => <TrackCard key={track.id} track={track} />);
}

function TrackSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="track-skeletons" role="status" aria-label="Loading tracks">
      {Array.from({ length: count }, (_, index) => (
        <div className="track-card skeleton-track" key={index} aria-hidden="true">
          <span className="skeleton-art" />
          <span className="skeleton-copy"><span /><span /><span /></span>
        </div>
      ))}
    </div>
  );
}

function usePageTracks(page: string): { tracks: Track[]; status: "loading" | "ready" | "error"; partial: boolean } {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    if (page !== "home" && page !== "discover") return;
    let active = true;
    setStatus("loading");
    MusicAPI.trending(page === "home" ? 15 : 12)
      .then((items) => {
        if (active) {
          setTracks(items.tracks);
          setPartial(items.failedSources > 0 && items.tracks.length > 0);
          setStatus(items.failedSources === 2 ? "error" : "ready");
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) setStatus("error");
      });
    return () => { active = false; };
  }, [page]);

  return { tracks, status, partial };
}

function HomePage({ tracks, status, partial, navigate }: { tracks: Track[]; status: "loading" | "ready" | "error"; partial: boolean; navigate: (page: PageName) => void }) {
  const featured = tracks[0];
  return (
    <section className="slide-up">
      <div className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow soft">Featured mix</p>
          <h1>Welcome to RoyalStream</h1>
          <p>Discover fresh electronic and indie music.</p>
          <div className="hero-actions">
            <button className="primary-cta" onClick={() => featured && Player.playTrack(featured)}>Play mix</button>
            <button className="secondary-cta" onClick={() => navigate("discover")}>Browse</button>
          </div>
        </div>
        <div className="hero-art-wrap">
          <img src={featured?.artwork || DEFAULT_COVER} alt="Featured artwork" />
          <div className="hero-meta">
            <span>{featured?.title || "RoyalStream"}</span>
            <span>{featured?.artist || "Curated playlist"}</span>
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-header">
          <h3>Trending Tracks</h3>
          <button className="inline-link" onClick={() => navigate("discover")}>View all</button>
        </div>
        <div className="track-list" id="trendingTracks">
          {status === "loading" ? <TrackSkeletons count={3} /> : status === "error" ? <p role="status">Music is temporarily unavailable. Try again shortly.</p> : <>{partial && <p role="status">Some results may be missing right now.</p>}<TrackCollection tracks={tracks} /></>}
        </div>
      </div>
    </section>
  );
}

function DiscoverPage({ tracks, status, partial }: { tracks: Track[]; status: "loading" | "ready" | "error"; partial: boolean }) {
  return (
    <section className="slide-up">
      <h1>Discover</h1>
      <p>Explore new artists and genres.</p>
      <div id="discoverContent">
        {status === "loading" ? <TrackSkeletons /> : status === "error" ? <p role="status">Music is temporarily unavailable. Try again shortly.</p> : <>{partial && <p role="status">Some results may be missing right now.</p>}<TrackCollection tracks={tracks} /></>}
      </div>
    </section>
  );
}

function SearchPage() {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [status, setStatus] = useState("idle");
  const [partial, setPartial] = useState(false);
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setTracks([]);
      setPartial(false);
      setStatus("idle");
      return;
    }
    let active = true;
    setStatus("loading");
    const timer = window.setTimeout(() => {
      MusicAPI.search(term)
        .then((items) => {
          if (active) {
            setTracks(items.tracks.slice(0, 12));
            setPartial(items.failedSources > 0 && items.tracks.length > 0);
            setStatus(items.failedSources === 2 ? "error" : "ready");
          }
        })
        .catch((error) => {
          console.error(error);
          if (active) setStatus("error");
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className="slide-up">
      <h1>Search</h1>
      <input id="searchInput" className="search-box" type="text" placeholder="Search songs, artists..." value={query} onChange={(event) => setQuery(event.target.value)} />
      <div id="searchResults" className="track-list">
        {status === "idle" ? <p>Search for a song or artist.</p> : status === "loading" ? <p>Searching...</p> : status === "error" ? <p role="status">Search is temporarily unavailable. Try again shortly.</p> : <>{partial && <p role="status">Some results may be missing right now.</p>}<TrackCollection tracks={tracks} emptyText="No results found." /></>}
      </div>
    </section>
  );
}

function LibraryPage() {
  const [favorites, setFavorites] = useState<Track[]>(() => Storage.get<Track[]>("royalstream:favorites", []) ?? []);
  useEffect(() => {
    const refresh = () => setFavorites(Storage.get<Track[]>("royalstream:favorites", []) ?? []);
    window.addEventListener("storage", refresh);
    window.addEventListener(FAVORITES_CHANGE_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(FAVORITES_CHANGE_EVENT, refresh);
    };
  }, []);
  return (
    <section className="slide-up">
      <h1>Library</h1>
      <div id="favorites">
        <h3>Favorites</h3>
        {favorites.length ? <TrackCollection tracks={favorites} emptyText="No favorites yet." /> : <p>No favorites yet.</p>}
      </div>
    </section>
  );
}

function PlayerIcon({ name }: { name: "play" | "pause" | "previous" | "next" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {name === "play" && <path d="M8 5v14l11-7z" fill="currentColor" />}
      {name === "pause" && <path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor" />}
      {name === "previous" && <><path d="M6 5v14" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M19 5 8 12l11 7z" fill="currentColor" /></>}
      {name === "next" && <><path d="M18 5v14" fill="none" stroke="currentColor" strokeWidth="2" /><path d="m5 5 11 7-11 7z" fill="currentColor" /></>}
    </svg>
  );
}

function NavIcon({ page }: { page: PageName }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {page === "home" && <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />}
      {page === "discover" && <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" /></>}
      {page === "search" && <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>}
      {page === "library" && <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8" /></>}
      {page === "profile" && <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21z" /><path d="M19 4v5m-2.5-2.5h5" /></>}
    </svg>
  );
}

function UtilityIcon({ name }: { name: "menu" | "search" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {name === "menu" && <path d="M4 6h16M4 12h16M4 18h16" />}
      {name === "search" && <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>}
    </svg>
  );
}

function NowPlaying({
  state,
  open,
  onOpen,
  onClose,
  onToggle,
  onPrevious,
  onNext,
  onSeek,
}: {
  state: { currentTrack: Track | null; isPlaying: boolean; currentTime: number; duration: number };
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeek: (seconds: number) => void;
}) {
  const track = state.currentTrack;
  const artwork = track?.artwork || DEFAULT_COVER;
  const progress = state.duration > 0 ? Math.min(100, (state.currentTime / state.duration) * 100) : 0;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  return (
    <>
      <section id="miniPlayer" aria-label="Mini player">
        <button className="mini-player-open" type="button" onClick={onOpen} aria-label={`Open now playing: ${track?.title || "No song playing"}${track?.artist ? ` by ${track.artist}` : ""}`}>
          <img id="miniArtwork" src={artwork} alt="" />
          <span className="trackInfo">
            <span id="miniTitle">{track?.title || "No song playing"}</span>
            <span id="miniArtist">{track?.artist || "Select music"}</span>
          </span>
        </button>
        <div className="mini-player-controls" aria-label="Playback controls">
          <button className="mini-player-control" type="button" aria-label="Previous track" onClick={onPrevious}><PlayerIcon name="previous" /></button>
          <button id="playPause" className="mini-play-button" type="button" aria-label={state.isPlaying ? "Pause" : "Play"} onClick={onToggle}>
            <PlayerIcon name={state.isPlaying ? "pause" : "play"} />
          </button>
          <button className="mini-player-control" type="button" aria-label="Next track" onClick={onNext}><PlayerIcon name="next" /></button>
        </div>
        <div className="mini-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      </section>
      <div id="nowPlayingOverlay" className={open ? "visible" : ""} aria-hidden={!open} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div ref={dialogRef} className="now-playing-card" role="dialog" aria-modal="true" aria-labelledby="nowPlayingTitle">
          <button ref={closeButtonRef} id="nowPlayingClose" className="close-button" aria-label="Close now playing" onClick={onClose}>✕</button>
          <img id="nowPlayingArtwork" src={artwork} alt="Now playing artwork" />
          <div className="now-playing-meta">
            <p className="eyebrow">Now Playing</p>
            <h3 id="nowPlayingTitle">{track?.title || "No song playing"}</h3>
            <p id="nowPlayingArtist">{track?.artist || "Select music"}</p>
          </div>
          <div className="now-playing-actions">
            <button type="button" aria-label="Previous track" onClick={onPrevious}><PlayerIcon name="previous" /></button>
            <button id="nowPlayingPrimaryAction" className="primary-action" aria-label="Toggle playback" onClick={onToggle}><PlayerIcon name={state.isPlaying ? "pause" : "play"} /></button>
            <button type="button" aria-label="Next track" onClick={onNext}><PlayerIcon name="next" /></button>
          </div>
          <div className="playback-progress">
            <span aria-label="Elapsed time">{formatTime(state.currentTime)}</span>
            <input
              type="range"
              min="0"
              max={state.duration || 0}
              step="1"
              value={Math.min(state.currentTime, state.duration || 0)}
              disabled={!state.currentTrack || !state.duration}
              aria-label="Track position"
              onChange={(event) => onSeek(Number(event.target.value))}
            />
            <span aria-label="Track duration">{formatTime(state.duration)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [page, setPage] = useState<PageName>(pageFromUrl);
  const [playerState, setPlayerState] = useState(Player.snapshot());
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const { tracks, status, partial } = usePageTracks(page);

  useEffect(() => Player.subscribe(setPlayerState), []);
  useEffect(() => {
    if (playerState.currentTrack) setNowPlayingOpen(true);
  }, [playerState.currentTrack]);
  useEffect(() => {
    const audio = document.querySelector<HTMLAudioElement>("#audioPlayer");
    Player.attachAudio(audio);
  }, []);

  useEffect(() => {
    const handlePopState = () => setPage(pageFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback((nextPage: PageName) => {
    if (!PAGES.includes(nextPage) || page === nextPage) return;
    const url = new URL(window.location.href);
    if (nextPage === "home") url.searchParams.delete("page");
    else url.searchParams.set("page", nextPage);
    window.history.pushState({ page: nextPage }, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(nextPage);
  }, [page]);

  useEffect(() => {
    document.getElementById("content")?.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    const timer = window.setTimeout(() => document.getElementById("splash")?.classList.add("hidden"), 1000);
    return () => window.clearTimeout(timer);
  }, []);

  const togglePlayback = () => {
    if (playerState.isPlaying) Player.pause();
    else if (playerState.currentTrack) Player.resume();
    else if (QueueManager.current) Player.playTrack(QueueManager.current);
  };

  return (
    <>
      <div id="splash">
        <img src="assets/logo/logo.png" alt="RoyalStream" />
        <h1>RoyalStream</h1>
      </div>
      <div id="app">
        <header aria-hidden={nowPlayingOpen}>
          <button id="menuBtn" aria-label="Open library" onClick={() => navigate("library")}><UtilityIcon name="menu" /></button>
          <h2>RoyalStream</h2>
          <button id="searchBtn" aria-label="Search music" onClick={() => navigate("search")}><UtilityIcon name="search" /></button>
        </header>
        <main id="content" aria-hidden={nowPlayingOpen}>
          {page === "home" && <HomePage tracks={tracks} status={status} partial={partial} navigate={navigate} />}
          {page === "discover" && <DiscoverPage tracks={tracks} status={status} partial={partial} />}
          {page === "search" && <SearchPage />}
          {page === "library" && <LibraryPage />}
          {page === "profile" && <ProfilePage navigate={navigate} />}
        </main>
        <NowPlaying
          state={playerState}
          open={nowPlayingOpen}
          onOpen={() => setNowPlayingOpen(true)}
          onClose={() => setNowPlayingOpen(false)}
          onToggle={togglePlayback}
          onPrevious={() => Player.previous()}
          onNext={() => Player.next()}
          onSeek={(seconds) => Player.seek(seconds)}
        />
        <nav aria-label="Main navigation" aria-hidden={nowPlayingOpen}>
          {PAGES.map((item) => (
            <button key={item} className={page === item ? "active" : ""} aria-label={item === "profile" ? "Profile and settings" : item[0].toUpperCase() + item.slice(1)} aria-current={page === item ? "page" : undefined} onClick={() => navigate(item)}>
              <NavIcon page={item} />
              <span>{item === "profile" ? "Profile" : item[0].toUpperCase() + item.slice(1)}</span>
            </button>
          ))}
        </nav>
      </div>
      <audio id="audioPlayer" />
    </>
  );
}
