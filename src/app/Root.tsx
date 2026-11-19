import { Component, Suspense, lazy, useEffect, useState } from "react"
import type { ReactNode } from "react"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router"
import { supabase } from "./lib/supabase"
import { SURFACE_BASE, ACCENT_SOLID, ACCENT_INK, TEXT_MUTED } from "./theme"
import { reportError } from "./lib/telemetry" // also starts crash reporting
import LandingPage from "./pages/Landing"
import AuthPage, { recovery } from "./pages/Auth"

/* The page list. Each tool is its own download, fetched only when someone opens it, so Home, Match Report and the rest
   never wait for the Tactics Board's code. */
const HomePage = lazy(() => import("./pages/Home")) // signed-in Home: its own download, so a deep link to a tool doesn't wait for it
const ProfilePage = lazy(() => import("./pages/Profile"))
const GoodbyePage = lazy(() => import("./pages/AccountData").then(m => ({ default: m.GoodbyePage })))
const TacticsBoard = lazy(() => import("./App")) // only downloaded when someone opens the Tactics Board
const AnalysisPage = lazy(() => import("./pages/Analysis")) // only downloaded when someone opens Live Game Analysis
const ReportPage = lazy(() => import("./pages/Report")) // only downloaded when someone opens Match Report
const BrainDumpPage = lazy(() => import("./pages/BrainDump")) // only downloaded when someone opens Brain Dump
const ShelfPage = lazy(() => import("./pages/Shelf")) // only downloaded when someone opens their shelf
const PublicCardPage = lazy(() => import("./pages/PublicCard")) // a creator's public card, open to anyone
const WelcomePage = lazy(() => import("./pages/Welcome")) // "Your studio is open", once, after sign-up

/* ─────────────────────────── Error Boundary ────────────────── */
const CHUNK_RELOAD_KEY = "ps_chunk_reload_attempted"

function isChunkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message ?? ""
  const name = (err as any).name ?? ""
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Unable to preload CSS") ||
    name === "ChunkLoadError" ||
    /Loading chunk \d+ failed/.test(msg)
  )
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info?: { componentStack?: string | null }) {
    reportError(error, "screen", { stack: (info?.componentStack ?? "").slice(0, 600) })
    if (isChunkError(error)) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1")
        window.location.reload()
        return
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: "100vw", height: "100vh", background: SURFACE_BASE,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 16, fontFamily: "'Inter', sans-serif",
        }}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, margin: 0 }}>
            Something went wrong. Please reload.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "9px 22px", borderRadius: 8,
              background: ACCENT_SOLID, color: ACCENT_INK,
              fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer",
            }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

/* ─────────────────────────── Home route ─────────────────────── */
/** "/" shows the landing page to visitors and Home (the menu to the whole studio) to signed-in users. */
function HomeRoute({ signedIn }: { signedIn: boolean }) {
  // Once Home has settled, fetch the Tactics Board quietly so it opens at once when tapped
  useEffect(() => {
    if (!signedIn) return
    const t = setTimeout(() => { import("./App").catch(() => { /* fetched again on open */ }) }, 2500)
    return () => clearTimeout(t)
  }, [signedIn])
  return signedIn ? <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><HomePage /></Suspense> : <LandingPage />
}

/** "/board" is the Tactics Board (sign-in only). A new visit opens a fresh board; "/board?open=ID" opens a saved one. */
function BoardRoute({ signedIn }: { signedIn: boolean }) {
  const loc = useLocation()
  if (!signedIn) return <Navigate to="/" replace />
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><TacticsBoard key={loc.key} /></Suspense>
}

/** "/analysis" is Live Game Analysis (sign-in only). A new visit starts a new analysis; "/analysis?open=ID" opens a saved one. */
function AnalysisRoute({ signedIn }: { signedIn: boolean }) {
  const loc = useLocation()
  if (!signedIn) return <Navigate to="/" replace />
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><AnalysisPage key={loc.key} /></Suspense>
}

/** "/report" is Match Report (sign-in only). A new visit starts a new report; "/report?open=ID" opens a saved one. */
function ReportRoute({ signedIn }: { signedIn: boolean }) {
  const loc = useLocation()
  if (!signedIn) return <Navigate to="/" replace />
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><ReportPage key={loc.key} /></Suspense>
}

/** "/shelf" is your shelf (sign-in only): everything you've made, in your order */
function ShelfRoute({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) return <Navigate to="/" replace />
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><ShelfPage /></Suspense>
}

/** "/braindump" is Brain Dump (sign-in only): the wall of notes */
function BraindumpRoute({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) return <Navigate to="/" replace />
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><BrainDumpPage /></Suspense>
}

/* ─────────────────────────── Root (entry) ───────────────────── */
export default function Root() {
  const [authUser, setAuthUser] = useState<import("@supabase/supabase-js").User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    // Never leave people on a blank screen: if the session check stalls or fails,
    // stop waiting after 6 seconds and show the site. A late session still signs them in.
    const done = () => { clearTimeout(timer); setAuthLoading(false) }
    const timer = setTimeout(done, 6000)
    supabase.auth.getSession()
      .then(({ data: { session } }) => setAuthUser(session?.user ?? null))
      .catch(() => { /* treat as signed out */ })
      .finally(done)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthUser(session?.user ?? null)
      // Link analytics to the account (user id only, never the email); forget it on sign-out
      const ph = (window as any).posthog
      if (session?.user) ph?.identify?.(session.user.id)
      else if (event === "SIGNED_OUT") ph?.reset?.()
    })
    return () => { clearTimeout(timer); subscription.unsubscribe() }
  }, [])

  if (authLoading) {
    return (
      <div style={{ width: "100vw", height: "100vh", background: SURFACE_BASE, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`@media (prefers-reduced-motion: no-preference) { .ps-boot { animation: ps-boot-pulse 1.4s ease-in-out infinite; } }
          @keyframes ps-boot-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }`}</style>
        <span className="ps-boot" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, letterSpacing: 2, color: TEXT_MUTED, userSelect: "none" }}>
          PITCHSTUDIO
        </span>
      </div>
    )
  }

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={recovery.pending && authUser ? <Navigate to="/reset" replace /> : <HomeRoute signedIn={!!authUser} />} />
          <Route path="/board" element={<BoardRoute signedIn={!!authUser} />} />
          <Route path="/braindump" element={<BraindumpRoute signedIn={!!authUser} />} />
          <Route path="/braindump/w/:wallId" element={<BraindumpRoute signedIn={!!authUser} />} />
          <Route path="/analysis" element={<AnalysisRoute signedIn={!!authUser} />} />
          <Route path="/report" element={<ReportRoute signedIn={!!authUser} />} />
          <Route path="/shelf" element={<ShelfRoute signedIn={!!authUser} />} />
          <Route path="/signin" element={authUser ? <Navigate to="/" replace /> : <AuthPage mode="signin" />} />
          <Route path="/signup" element={authUser ? <Navigate to="/" replace /> : <AuthPage mode="signup" />} />
          <Route path="/reset" element={<AuthPage mode="reset" />} />
          <Route path="/goodbye" element={<Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><GoodbyePage /></Suspense>} />
          <Route path="/profile" element={authUser ? <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><ProfilePage /></Suspense> : <Navigate to="/" replace />} />
          <Route path="/welcome" element={authUser ? <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><WelcomePage /></Suspense> : <Navigate to="/" replace />} />
          <Route path="/c/:handle" element={<Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><PublicCardPage /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
