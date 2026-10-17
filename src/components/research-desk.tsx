"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type Article = { title: string; description: string; url: string; image?: string | null; published_at?: string | null; source: string };
type Brief = { headline: string; overview: string; key_points: string[]; watch_for: string[]; confidence: "low" | "medium" | "high"; scope_note: string };
type Location = { name: string; admin1?: string; country: string; latitude: number; longitude: number; timezone: string };
type Weather = { current: Record<string, number | string>; timezone: string; units: Record<string, string> };
type SavedBrief = { id: string; topic: string; brief: Brief; sources: Article[]; created_at: string };

const quickTopics = ["AI agents in the workplace", "Advanced chips and compute", "Open-source language models", "Cybersecurity and AI"];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail ?? "Something went wrong. Please try again.");
  return body as T;
}

function Mark() { return <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>; }
function Icon({ name }: { name: string }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (name === "arrow") return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="10.8" cy="10.8" r="6.5" /><path d="m16 16 4.2 4.2" /></svg>;
  if (name === "bookmark") return <svg {...common}><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21z" /></svg>;
  if (name === "cloud") return <svg {...common}><path d="M7.3 18h10a4 4 0 0 0 .3-8 6.2 6.2 0 0 0-11.9 1.5A3.3 3.3 0 0 0 7.3 18Z" /><path d="M12 13v6m-2-2 2 2 2-2" /></svg>;
  if (name === "spark") return <svg {...common}><path d="m12 3 1.5 6.2L20 11l-6.5 1.8L12 19l-1.5-6.2L4 11l6.5-1.8L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></svg>;
}

function dateLabel(value?: string | null) {
  if (!value) return "Publication time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Publication time unavailable";
  const hours = Math.round((Date.now() - date.getTime()) / 3_600_000);
  if (hours < 1) return "Published less than an hour ago";
  if (hours < 24) return `Published ${hours}h ago`;
  return `Published ${Math.floor(hours / 24)}d ago`;
}

function weatherLabel(code: number) {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return code === 1 ? "Mostly clear" : code === 2 ? "Partly cloudy" : "Overcast";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Thunderstorms";
  return "Current conditions";
}

function Alert({ children, kind = "error" }: { children: React.ReactNode; kind?: "error" | "note" }) {
  return <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}><Icon name="info" /> <span>{children}</span></div>;
}

export default function ResearchDesk() {
  const [topic, setTopic] = useState("");
  const [activeTopic, setActiveTopic] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState<"search" | "brief" | "" >("");
  const [error, setError] = useState("");
  const [service, setService] = useState<{ news: boolean; ai: boolean; database: boolean } | null>(null);
  const [view, setView] = useState<"scan" | "saved">("scan");
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([]);
  const [session, setSession] = useState<{ access_token: string; user: { email?: string } } | null>(null);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [weatherQuery, setWeatherQuery] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [localDate, setLocalDate] = useState("");

  useEffect(() => {
    setLocalDate(new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()));
    api<{ providers: { news: boolean; ai: boolean; database: boolean } }>("health").then((data) => setService(data.providers)).catch(() => setService(null));
    const supabase = getSupabase();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session as typeof session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession as typeof session));
    return () => subscription.subscription.unsubscribe();
  }, []);

  const bearer = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session]);

  const search = useCallback(async (value: string) => {
    const clean = value.trim();
    if (clean.length < 3) { setError("Enter at least three characters to search coverage."); return; }
    setBusy("search"); setError(""); setBrief(null); setArticles([]); setView("scan"); setActiveTopic(clean); setTopic(clean);
    try {
      const data = await api<{ articles: Article[] }>(`news?query=${encodeURIComponent(clean)}`);
      setArticles(data.articles);
      if (!data.articles.length) setError("No matching articles came back from GNews. Try a broader topic.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not search coverage."); }
    finally { setBusy(""); }
  }, []);

  async function makeBrief() {
    if (!activeTopic || !articles.length) return;
    setBusy("brief"); setError("");
    try {
      const data = await api<{ brief: Brief }>("brief", { method: "POST", body: JSON.stringify({ topic: activeTopic, articles }) });
      setBrief(data.brief);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create a research brief."); }
    finally { setBusy(""); }
  }

  async function loadSaved() {
    setView("saved"); setError("");
    if (!session) { setAuthOpen(true); return; }
    try { setSavedBriefs(await api<SavedBrief[]>("saved-briefs", { headers: bearer })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load saved briefs."); }
  }

  async function saveCurrentBrief() {
    if (!brief || !session) { setAuthOpen(true); return; }
    setError("");
    try {
      await api("saved-briefs", { method: "POST", headers: bearer, body: JSON.stringify({ topic: activeTopic, brief, sources: articles }) });
      setAuthMessage("Brief saved to your library.");
      setSavedBriefs(await api<SavedBrief[]>("saved-briefs", { headers: bearer }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save this brief."); }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault(); setAuthMessage("");
    const supabase = getSupabase();
    if (!supabase) { setAuthMessage("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env to enable sign-in."); return; }
    const { error: signInError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setAuthMessage(signInError ? signInError.message : "Check your inbox for a sign-in link.");
  }

  useEffect(() => {
    if (weatherQuery.trim().length < 2) { setLocations([]); return; }
    const selectedLabel = selectedLocation ? `${selectedLocation.name}${selectedLocation.country ? `, ${selectedLocation.country}` : ""}` : "";
    if (selectedLocation && weatherQuery.trim() === selectedLabel) { setLocations([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try { const data = await api<{ locations: Location[] }>(`weather/locations?query=${encodeURIComponent(weatherQuery.trim())}`); if (!cancelled) setLocations(data.locations); }
      catch (caught) { if (!cancelled) { setLocations([]); setWeatherError(caught instanceof Error ? caught.message : "Location search is unavailable right now."); } }
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [weatherQuery, selectedLocation]);

  async function chooseLocation(location: Location) {
    setSelectedLocation(location); setWeatherQuery(`${location.name}${location.country ? `, ${location.country}` : ""}`); setLocations([]); setWeatherBusy(true); setWeatherError("");
    try { setWeather(await api<Weather>(`weather/current?latitude=${location.latitude}&longitude=${location.longitude}`)); }
    catch (caught) { setWeatherError(caught instanceof Error ? caught.message : "Could not load weather."); }
    finally { setWeatherBusy(false); }
  }

  function showSaved(item: SavedBrief) {
    setActiveTopic(item.topic); setTopic(item.topic); setBrief(item.brief); setArticles(item.sources ?? []); setView("scan"); setError("");
  }

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="#main" aria-label="Signal Desk home"><Mark /><span>signal<span className="brand-light">desk</span></span></a>
      <nav className="topnav" aria-label="Main navigation"><a className={view === "scan" ? "nav-active" : ""} href="#main" onClick={() => setView("scan")}>Research</a><button className={view === "saved" ? "nav-active" : ""} onClick={loadSaved}>Saved briefs</button></nav>
      <div className="top-actions">
        <span className={`connection ${service?.news ? "is-live" : ""}`}><span className="connection-dot" />{service?.news ? "Live sources" : service ? "Setup needed" : "Connecting"}</span>
        {session ? <button className="profile-button" onClick={async () => { await getSupabase()?.auth.signOut(); setAuthMessage(""); }}>{session.user.email?.split("@")[0] ?? "Account"}<span className="profile-dot">{session.user.email?.[0]?.toUpperCase() ?? "S"}</span></button> : <button className="sign-in" onClick={() => { setAuthMessage(""); setAuthOpen(true); }}>Sign in</button>}
      </div>
    </header>

    <div className="page-grid" id="main">
      <section className="primary-column">
        <div className="eyebrow"><span className="eyebrow-rule" />RESEARCH DESK<span className="eyebrow-date">{localDate}</span></div>
        <div className="intro-row"><div><h1>A clearer read on<br />what’s changing.</h1><p className="intro-copy">Follow the technology shifts that matter. Start with a question; leave with the sources and a sharper point of view.</p></div><div className="issue-stamp"><span>YOUR FIELD NOTES</span><span className="stamp-line" /><span>NO. 001</span></div></div>

        <form className="search-form" onSubmit={(event) => { event.preventDefault(); void search(topic); }}>
          <label htmlFor="topic-search" className="sr-only">Search a technology topic</label>
          <Icon name="search" /><input id="topic-search" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What are you trying to understand?" maxLength={160} />
          <button className="search-button" type="submit" disabled={busy === "search"}>{busy === "search" ? <span className="spinner" /> : <>Explore <Icon name="arrow" /></>}</button>
        </form>
        <div className="suggestions"><span>TRY A THREAD</span>{quickTopics.map((value) => <button key={value} onClick={() => void search(value)}>{value}</button>)}</div>

        <div className="section-heading"><div><span className="section-kicker">{view === "saved" ? "YOUR LIBRARY" : activeTopic ? "TOPIC COVERAGE" : "START WITH A THREAD"}</span><h2>{view === "saved" ? "Saved briefs" : activeTopic || "A focused place to begin"}</h2></div>{view === "scan" && articles.length > 0 && <span className="source-count">{articles.length} {articles.length === 1 ? "source" : "sources"}</span>}</div>

        {error && <Alert>{error}</Alert>}
        {authMessage && !authOpen && <Alert kind="note">{authMessage}</Alert>}

        {view === "saved" ? <div className="saved-list">
          {!session ? <div className="empty-state"><div className="empty-icon"><Icon name="bookmark" /></div><h3>Your saved research lives here.</h3><p>Sign in with your email to keep briefs tied to your account.</p><button className="text-action" onClick={() => setAuthOpen(true)}>Sign in to view your library <Icon name="arrow" /></button></div>
            : savedBriefs.length ? savedBriefs.map((item) => <button className="saved-row" key={item.id} onClick={() => showSaved(item)}><span className="saved-label">RESEARCH BRIEF</span><strong>{item.topic}</strong><span>{item.brief.headline}</span><small>{new Date(item.created_at).toLocaleDateString()}</small></button>)
              : <div className="empty-state"><div className="empty-icon"><Icon name="bookmark" /></div><h3>Nothing saved yet.</h3><p>When you make a useful brief, save it here for another look.</p></div>}
        </div> : <>
          {articles.length > 0 && <>
            <div className="coverage-toolbar"><span><span className="live-indicator" />REPORTING FOUND FOR THIS QUESTION</span><button className="brief-button" onClick={() => void makeBrief()} disabled={busy !== ""}>{busy === "brief" ? <><span className="spinner" /> Reading sources</> : <><Icon name="spark" /> Make sense of this <Icon name="arrow" /></>}</button></div>
            <div className="source-list">{articles.map((article, index) => <article className="source-item" key={article.url}><span className="source-index">{String(index + 1).padStart(2, "0")}</span><div className="source-body"><div className="source-meta"><span>{article.source}</span><span className="meta-separator">·</span><span>{dateLabel(article.published_at)}</span></div><h3><a href={article.url} target="_blank" rel="noreferrer">{article.title}<span className="external-mark" aria-label="Opens source in a new tab"> ↗</span></a></h3>{article.description && <p>{article.description}</p>}</div></article>)}</div>
          </>}

          {brief && <section className="brief-panel" aria-labelledby="brief-heading"><div className="brief-topline"><span className="brief-label"><Icon name="spark" /> AI READING NOTES</span><button className="save-button" onClick={() => void saveCurrentBrief()}><Icon name="bookmark" /> Save brief</button></div><h2 id="brief-heading">{brief.headline}</h2><p className="brief-overview">{brief.overview}</p><div className="brief-grid"><div><h3>What the sources say</h3><ul>{brief.key_points.map((point, index) => <li key={index}>{point}</li>)}</ul></div><div><h3>Worth watching</h3><ul>{brief.watch_for.map((point, index) => <li key={index}>{point}</li>)}</ul></div></div><div className="brief-foot"><span>Confidence: <strong>{brief.confidence}</strong></span><span>{brief.scope_note}</span></div></section>}

          {!articles.length && !busy && <div className="empty-state research-empty"><div className="empty-index">01</div><div><h3>{activeTopic ? "No coverage to show yet." : "Choose a question worth following."}</h3><p>{activeTopic ? "Try a shorter or broader phrase, or check that the news provider is configured." : "Search a topic above to gather recent reporting from GNews. Sources stay visible alongside every AI reading note."}</p></div></div>}
        </>}
      </section>

      <aside className="context-column" aria-label="Research context">
        <section className="context-section"><div className="context-heading"><div><span className="section-kicker">OUTSIDE THE FEED</span><h2>Local context</h2></div><span className="context-number">01</span></div><p className="context-copy">A little context beyond the headlines, when it’s useful.</p><div className="weather-search-wrap"><Icon name="search" /><label htmlFor="location-search" className="sr-only">Search a city for current weather</label><input id="location-search" value={weatherQuery} onChange={(event) => { setWeatherQuery(event.target.value); setWeatherError(""); }} placeholder="Find a place" autoComplete="off" />{locations.length > 0 && <div className="location-menu" role="listbox">{locations.map((location) => <button key={`${location.latitude}-${location.longitude}`} role="option" aria-selected={false} onClick={() => void chooseLocation(location)}>{location.name}{location.admin1 ? `, ${location.admin1}` : ""}<small>{location.country}</small></button>)}</div>}</div>
          {weatherBusy && <div className="weather-skeleton"><span className="spinner" /> Checking current conditions</div>}
          {weatherError && <p className="weather-error" role="status">{weatherError}</p>}
          {weather && selectedLocation && <div className="weather-result"><div className="weather-top"><span>{selectedLocation.name}{selectedLocation.country ? `, ${selectedLocation.country}` : ""}</span><span>LIVE</span></div><div className="weather-reading"><strong>{Math.round(Number(weather.current.temperature_2m))}°</strong><div><span>{weatherLabel(Number(weather.current.weather_code))}</span><small>Feels like {Math.round(Number(weather.current.apparent_temperature))}°</small></div></div><div className="weather-details"><span>Humidity<strong>{weather.current.relative_humidity_2m}%</strong></span><span>Wind<strong>{Math.round(Number(weather.current.wind_speed_10m))} km/h</strong></span></div><p className="weather-credit"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> · {String(weather.current.time ?? "").replace("T", " ")} {weather.timezone}</p></div>}
          {!weather && !weatherBusy && !weatherError && <div className="weather-empty"><Icon name="cloud" /><p>Search a city to see its current conditions.</p><span>Open-Meteo · No key required</span></div>}
        </section>
        <section className="context-section source-note"><div className="context-heading"><div><span className="section-kicker">HOW TO READ THIS</span><h2>Evidence first.</h2></div><span className="context-number">02</span></div><div className="note-list"><p><span className="note-mark">A</span><span><strong>Open the source.</strong> Every headline links to its publisher so you can check the reporting yourself.</span></p><p><span className="note-mark">B</span><span><strong>Read the scope note.</strong> AI notes reflect only the articles shown here, not the whole news landscape.</span></p><p><span className="note-mark">C</span><span><strong>Look for uncertainty.</strong> The brief separates reported details from interpretation and open questions.</span></p></div></section>
        <section className="provider-status"><span className="status-overline">SERVICE STATUS</span><div><span>News reporting</span><span className={service?.news ? "status-ok" : "status-pending"}>{service?.news ? "Connected" : service ? "Needs setup" : "Checking"}</span></div><div><span>AI reading notes</span><span className={service?.ai ? "status-ok" : "status-pending"}>{service?.ai ? "Connected" : service ? "Needs setup" : "Checking"}</span></div><div><span>Saved research</span><span className={service?.database ? "status-ok" : "status-pending"}>{service?.database ? "Connected" : service ? "Optional" : "Checking"}</span></div><a href="#setup" onClick={(event) => { event.preventDefault(); setAuthMessage("For setup, see the project README and .env.example."); }}>About the connections <Icon name="arrow" /></a></section>
      </aside>
    </div>
    <footer className="footer"><a className="brand footer-brand" href="#main"><Mark /><span>signal<span className="brand-light">desk</span></span></a><span>Research with sources in view.</span><span className="footer-right">Live when configured · Built for careful reading</span></footer>

    {authOpen && <div className="modal-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}><section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" aria-label="Close sign-in" onClick={() => setAuthOpen(false)}>×</button><div className="modal-mark"><Mark /></div><span className="section-kicker">YOUR RESEARCH, KEPT</span><h2 id="auth-title">Sign in to your desk.</h2><p>We’ll send a one-time link to your email. No password to remember.</p><form onSubmit={(event) => void signIn(event)}><label htmlFor="email">Email address</label><input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /><button className="search-button" type="submit">Send sign-in link <Icon name="arrow" /></button></form>{authMessage && <p className="auth-message" role="status">{authMessage}</p>}{!getSupabase() && <p className="auth-setup">Sign-in becomes available after connecting a Supabase project. See README for setup.</p>}</section></div>}
  </main>;
}

