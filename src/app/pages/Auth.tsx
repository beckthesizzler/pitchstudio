import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Mail } from "lucide-react"
import { supabase } from "../lib/supabase"
import { IDENTITY_OPTIONS, friendlyAuthError, normalizeHandle } from "../lib/account"
import { ThemeToggle, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_ERROR, DS_ERROR_SOFT, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT, ACCENT_SOFT } from "../theme"
import { BoardArt } from "./BoardArt"

/* Sign in and sign up, one full page each ("/signin" and "/signup"). Same steps and the same database calls as before:
   email + password, then a handle + who you are, then a "check your email" screen when confirmation is on. */

/** Something@something.something with no spaces: the server does the real check. */
const looksLikeEmail = (s: string) => { const at = s.indexOf("@"); return at > 0 && !s.includes(" ") && s.indexOf(".", at) > at + 1 && !s.endsWith(".") }

type HandleState = "idle" | "short" | "checking" | "free" | "taken"

export default function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate()
  const signup = mode === "signup"
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [handle, setHandle] = useState("")
  const [identity, setIdentity] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [hState, setHState] = useState<HandleState>("idle")
  const stepRef = useRef(step)
  stepRef.current = step

  // Starting over when you switch between sign in and sign up
  useEffect(() => { setStep(1); setError(""); setSentTo(null); setResent(false) }, [mode])

  // Is the handle free? Checked a moment after you stop typing, so there are no surprises on the last button.
  useEffect(() => {
    if (!signup || step !== 2) return
    if (handle.length === 0) { setHState("idle"); return }
    if (handle.length < 3) { setHState("short"); return }
    setHState("checking")
    let live = true
    const t = window.setTimeout(async () => {
      const { data, error: e } = await (supabase as any).rpc("handle_available", { candidate: handle })
      if (!live) return
      setHState(e ? "idle" : data === false ? "taken" : "free")
    }, 450)
    return () => { live = false; window.clearTimeout(t) }
  }, [handle, signup, step])

  const submit = async () => {
    if (loading) return
    setError("")
    const cleanEmail = email.trim()

    if (signup) {
      if (step === 1) {
        if (!looksLikeEmail(cleanEmail)) { setError("Enter a valid email address."); return }
        if (password.length < 6) { setError("Use at least 6 characters for your password."); return }
        setStep(2); return
      }
      const h = normalizeHandle(handle)
      if (h.length < 3) { setError("Pick a name with at least 3 letters or numbers."); return }
      if (!identity) { setError("Choose how you see yourself on the pitch."); return }

      setLoading(true)
      // Is the name free? (The database also guards this when the account is created.)
      const { data: free, error: freeErr } = await (supabase as any).rpc("handle_available", { candidate: h })
      if (!freeErr && free === false) { setError("That name's taken. Try another."); setHState("taken"); setLoading(false); return }

      // The name and identity travel with the sign-up; the database saves them the moment the account is created.
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { handle: h, identity }, emailRedirectTo: window.location.origin },
      })
      if (signUpErr) {
        const code = signUpErr.code ?? ""
        if (code === "user_already_exists" || /already registered/i.test(signUpErr.message)) {
          setStep(1); setError("That email already has an account. Sign in instead."); setLoading(false); return
        }
        if (code === "weak_password" || code === "email_address_invalid" || /password|invalid format/i.test(signUpErr.message)) setStep(1)
        setError(friendlyAuthError(signUpErr))
        setLoading(false); return
      }
      // With "Confirm email" on, Supabase hides an existing email by returning a user with no identities
      if (!data.session && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setStep(1); setError("That email already has an account. Sign in instead."); setLoading(false); return
      }
      ;(window as any).posthog?.capture("sign_up", { identity, $set: { handle: h, identity } })
      setLoading(false)
      if (!data.session) { setSentTo(cleanEmail); return } // "Confirm email" is on: wait for the link
      // Only if the database step hasn't been set up yet (the name check above failed): save the answers directly.
      if (freeErr && data.user) void supabase.from("profiles").update({ handle: h, identity }).eq("id", data.user.id).then(() => {})
      return // the app notices you're signed in and opens your board
    }

    setLoading(true)
    const { error: e } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    setLoading(false)
    if (e) setError(friendlyAuthError(e))
  }

  const resend = async () => {
    if (!sentTo) return
    const { error: e } = await supabase.auth.resend({ type: "signup", email: sentTo })
    if (e) setError(friendlyAuthError(e)); else { setResent(true); setError("") }
  }

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") submit() }
  const canGo = signup && step === 2 ? handle.length >= 3 && !!identity && hState !== "taken" : !!email && !!password
  const ctaText = loading ? (signup ? "Creating account…" : "Signing in…") : signup ? (step === 1 ? "Continue" : "Create account") : "Sign in"

  return (
    <div className="au" style={{ background: SURFACE_BASE, color: TEXT_PRIMARY, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .au * { box-sizing: border-box; }
        @keyframes au-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: no-preference) { .au { animation: au-in .35s ease-out; } }
        .au-grid { display: grid; grid-template-columns: minmax(380px, 520px) 1fr; min-height: 100vh; }
        .au-left { padding: 28px 56px 36px; display: flex; flex-direction: column; min-width: 0; }
        .au-top { display: flex; align-items: center; justify-content: space-between; height: 40px; }
        .au-logo { background: none; border: none; cursor: pointer; color: ${TEXT_PRIMARY}; font-family: 'Cormorant Garamond', Georgia, serif; letter-spacing: .2em; font-size: 18px; font-weight: 600; padding: 0; }
        .au-form { margin: auto 0; max-width: 380px; width: 100%; padding: 36px 0; }
        .au-eyebrow { font-size: 12px; letter-spacing: .14em; font-weight: 600; color: ${ACCENT_TEXT}; }
        .au-h1 { font-size: 32px; letter-spacing: -.03em; line-height: 1.1; margin: 12px 0 0; font-weight: 700; }
        .au-p { color: ${TEXT_MUTED}; margin: 10px 0 0; line-height: 1.5; font-size: 15px; }
        .au-prog { display: flex; gap: 6px; margin-top: 22px; }
        .au-prog i { height: 3px; flex: 1; border-radius: 3px; background: ${SURFACE_2}; }
        .au-prog i.on { background: ${ACCENT_SOLID}; }
        .au-field { margin-top: 16px; }
        .au-label { font-size: 12px; color: ${TEXT_MUTED}; display: block; margin-bottom: 6px; }
        .au-inp { display: flex; align-items: center; height: 50px; border-radius: 12px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; padding: 0 14px; gap: 8px; transition: border-color .12s, box-shadow .12s; }
        .au-inp:focus-within { border-color: ${ACCENT_SOLID}; box-shadow: 0 0 0 4px ${ACCENT_SOFT}; }
        .au-inp input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; color: ${TEXT_PRIMARY}; font-size: 16px; font-family: inherit; height: 100%; }
        .au-inp input::placeholder { color: ${TEXT_MUTED}; opacity: .7; }
        .au-eye { background: none; border: none; color: ${TEXT_MUTED}; cursor: pointer; display: grid; place-items: center; padding: 4px; }
        .au-hint { font-size: 12px; margin-top: 7px; min-height: 16px; color: ${TEXT_MUTED}; }
        .au-hint.ok { color: ${ACCENT_TEXT}; } .au-hint.bad { color: ${DS_ERROR}; }
        .au-err { display: flex; gap: 8px; align-items: center; font-size: 13px; color: ${DS_ERROR}; background: ${DS_ERROR_SOFT}; border-radius: 10px; padding: 10px 12px; margin-top: 16px; }
        .au-btn { width: 100%; height: 50px; border-radius: 999px; font-weight: 600; font-size: 15px; border: 1px solid transparent; cursor: pointer; font-family: inherit; margin-top: 22px; transition: transform .12s, opacity .12s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .au-btn:hover:not(:disabled) { transform: scale(1.015); }
        .au-btn:disabled { opacity: .45; cursor: default; }
        .au-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; }
        .au-btn.sec { background: transparent; color: ${TEXT_PRIMARY}; border-color: ${DS_BORDER}; margin-top: 12px; }
        .au-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 4px; }
        .au-tile { text-align: left; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 14px; padding: 13px 14px; color: ${TEXT_PRIMARY}; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 600; transition: border-color .12s, background .12s; }
        .au-tile small { display: block; font-weight: 400; font-size: 12px; color: ${TEXT_MUTED}; margin-top: 3px; }
        .au-tile:hover { border-color: ${TEXT_MUTED}; }
        .au-tile.on { border-color: ${ACCENT_SOLID}; background: ${ACCENT_SOFT}; box-shadow: inset 0 0 0 1px ${ACCENT_SOLID}; }
        .au-back { background: none; border: none; color: ${TEXT_MUTED}; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-family: inherit; padding: 4px 0; margin-bottom: 18px; }
        .au-swap { text-align: center; font-size: 14px; color: ${TEXT_MUTED}; margin-top: 26px; }
        .au-swap button { background: none; border: none; color: ${TEXT_PRIMARY}; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 14px; padding: 0; }
        .au-right { background: radial-gradient(900px 520px at 30% 18%, var(--ps-glow), transparent), ${SURFACE_1}; display: flex; flex-direction: column; justify-content: center; padding: 56px 0 56px 56px; gap: 28px; overflow: hidden; border-left: 1px solid ${DS_BORDER}; }
        .au-quote { font-size: clamp(26px, 2.6vw, 36px); letter-spacing: -.03em; line-height: 1.15; font-weight: 700; max-width: 520px; margin: 0; }
        .au-quote span { color: ${ACCENT_TEXT}; display: block; }
        .au-shot { width: 118%; border-radius: 14px 0 0 14px; overflow: hidden; border: 1px solid ${DS_BORDER}; box-shadow: 0 30px 90px rgba(0,0,0,.3); }
        .au-mail { width: 64px; height: 64px; border-radius: 18px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; display: grid; place-items: center; color: ${ACCENT_TEXT}; }
        @media (max-width: 860px) {
          .au-grid { grid-template-columns: 1fr; }
          .au-right { display: none; }
          .au-left { padding: 18px 20px 28px; }
          .au-form { margin: 18px 0 0; max-width: none; padding-top: 24px; }
          .au-h1 { font-size: 29px; }
        }
        @media (prefers-reduced-motion: reduce) { .au-btn, .au-inp, .au-tile { transition: none; } .au-btn:hover { transform: none; } }
      `}</style>
      <div className="au-grid">
        <div className="au-left">
          <div className="au-top">
            <button className="au-logo" onClick={() => navigate("/")} aria-label="PitchStudio home">PITCHSTUDIO</button>
            <ThemeToggle />
          </div>
          <div className="au-form">
            {sentTo ? (
              <div style={{ textAlign: "center" }}>
                <div className="au-mail" style={{ margin: "0 auto" }}><Mail size={28} /></div>
                <h1 className="au-h1" style={{ marginTop: 22 }}>Check your email</h1>
                <p className="au-p">We sent a link to <b style={{ color: TEXT_PRIMARY, wordBreak: "break-all" }}>{sentTo}</b>.<br />Open it to finish creating your account. It signs you in automatically.</p>
                {error && <div className="au-err" role="alert"><AlertCircle size={15} /> {error}</div>}
                <button className="au-btn sec" onClick={resend} disabled={resent}>{resent ? "Sent again" : "Resend email"}</button>
                <div className="au-swap">Wrong address? <button onClick={() => { setSentTo(null); setStep(1); setResent(false) }}>Change it</button></div>
              </div>
            ) : (
              <>
                {signup && step === 2 && (
                  <button className="au-back" onClick={() => { setStep(1); setError("") }}><ArrowLeft size={15} /> Back</button>
                )}
                <div className="au-eyebrow">{signup ? (step === 1 ? "STEP 1 OF 2" : "STEP 2 OF 2") : "WELCOME BACK"}</div>
                <h1 className="au-h1">{!signup ? "Sign in" : step === 1 ? "Create your free account" : "Pick your name"}</h1>
                <p className="au-p">{!signup ? "Pick up where you left off." : step === 1 ? "Save every board and sign your exports with your own name." : "It goes on every export, like a signature."}</p>
                {signup && <div className="au-prog" aria-hidden="true"><i className="on" /><i className={step === 2 ? "on" : ""} /></div>}

                {(!signup || step === 1) ? (
                  <>
                    <div className="au-field">
                      <label className="au-label" htmlFor="au-email">Email</label>
                      <div className="au-inp">
                        <input id="au-email" type="email" placeholder="you@email.com" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey}
                          autoFocus={typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches} />
                      </div>
                    </div>
                    <div className="au-field">
                      <label className="au-label" htmlFor="au-pw">Password</label>
                      <div className="au-inp">
                        <input id="au-pw" type={showPw ? "text" : "password"} placeholder={signup ? "At least 6 characters" : "Your password"} autoComplete={signup ? "new-password" : "current-password"}
                          value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} />
                        <button className="au-eye" type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"}>{showPw ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="au-field">
                      <label className="au-label" htmlFor="au-handle">Your handle</label>
                      <div className="au-inp">
                        <span style={{ color: TEXT_MUTED, fontSize: 16 }}>@</span>
                        <input id="au-handle" type="text" placeholder="tactician99" value={handle} maxLength={30} onChange={e => setHandle(normalizeHandle(e.target.value))}
                          autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onKeyDown={onKey} autoFocus />
                        {hState === "free" && <Check size={17} style={{ color: ACCENT_TEXT }} />}
                      </div>
                      <div className={`au-hint ${hState === "free" ? "ok" : hState === "taken" ? "bad" : ""}`} aria-live="polite">
                        {hState === "free" ? `@${handle} is free` : hState === "taken" ? `@${handle} is taken. Try another.` : hState === "checking" ? "Checking…" : "Letters, numbers and underscores. You can change it later."}
                      </div>
                    </div>
                    <div className="au-field">
                      <span className="au-label">How do you see yourself on the pitch?</span>
                      <div className="au-tiles">
                        {IDENTITY_OPTIONS.map(o => (
                          <button key={o.value} type="button" className={`au-tile${identity === o.value ? " on" : ""}`} aria-pressed={identity === o.value} onClick={() => setIdentity(o.value)}>
                            {o.label}<small>{o.hint}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {error && <div className="au-err" role="alert"><AlertCircle size={15} /> {error}</div>}
                <button className="au-btn pri" onClick={submit} disabled={loading || !canGo}>{ctaText}</button>
                <div className="au-swap">
                  {signup ? <>Already have an account? <button onClick={() => navigate("/signin")}>Sign in</button></> : <>New here? <button onClick={() => navigate("/signup")}>Create a free account</button></>}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="au-right" aria-hidden="true">
          <p className="au-quote">Enable your creativity.<span>Where your genius comes to life.</span></p>
          <div className="au-shot"><BoardArt /></div>
        </div>
      </div>
    </div>
  )
}
