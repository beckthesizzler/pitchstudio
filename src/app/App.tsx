import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, Component, lazy, Suspense } from "react"
import type { ReactNode } from "react"
import React from "react"
import { toPng, toJpeg, toBlob, toCanvas as nodeToCanvas, getFontEmbedCSS } from "html-to-image"
import {
  MousePointer2, UserPlus, ArrowUpRight, Type, Pentagon,
  Trash2, Download, RotateCcw, RotateCw,
  ChevronDown, FileImage, Move, Hand, PanelLeftClose, PanelLeftOpen,
  ImagePlus, Square, Circle, Minus, Plus, BookOpen,
  Lock, X, RefreshCw, ChevronRight,
  Save, FolderOpen, LogIn, LogOut, AlertCircle, Check, Clock, MoreHorizontal, Copy, BringToFront, SendToBack, Unlock,
  Video,
  Settings, ArrowLeft, HelpCircle, Mail, AlignLeft, ChevronUp,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Grid3x3, Rows3, Pencil, Waypoints, Eye, EyeOff, Play, Sun, Moon,
} from "lucide-react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router"
import { supabase } from "./lib/supabase"
import { stripHandleSuffix } from "./lib/account"
import {
  PS_VOLT, SURFACE_BASE, SURFACE_1, SURFACE_2, ACCENT_GRADIENT, ACCENT_SOLID, ACCENT_INK, ACCENT_SOFT, ACCENT_TEXT,
  TEXT_PRIMARY, TEXT_MUTED, DS_ERROR, DS_ERROR_SOFT, DS_BORDER, DS_BORDER_STRONG, GLASS, SCRIM, useTheme,
} from "./theme"
import LandingPage from "./pages/Landing"
import AuthPage from "./pages/Auth"
import HomePage from "./pages/Home"
import { Mark } from "./brand/Mark"
import { CreatorSeal, SealDisc } from "./brand/Signature"
import { DEFAULT_BRAND, readBrand, logoToDataUrl, type Brand } from "./brand/brand"
import ProfilePage from "./pages/Profile"
const AnalysisPage = lazy(() => import("./pages/Analysis")) // only downloaded when someone opens Live Game Analysis
import Tour, { TOUR_KEY } from "./Tour"

/* ─────────────────────────── Types ─────────────────────────── */
type Tool =
  | "select" | "pan"
  | "homePlayer" | "awayPlayer" | "marker" | "ball"
  | "arrow" | "text" | "shape" | "image" | "zone"

type ShapeKind = "polygon" | "circle" | "ellipse" | "rect"

/** How a kit's second colour is laid over its main colour */
const KIT_PATTERNS = ["solid", "stripes", "hoops", "halves", "sash", "band", "sleeves"] as const
type KitPattern = typeof KIT_PATTERNS[number]

interface Player {
  id: string; x: number; y: number
  name: string; num: string
  bg: string; fg: string; ring: string
  glow?: boolean
  scale?: number
  pat?: KitPattern // kit pattern; no pat = a plain colour (every board saved before kits)
  bg2?: string // the pattern's second colour
  outline?: boolean // an outline around the shirt number, so it reads on stripes
  kind?: "marker" | "ball" // a ✕ marker or the ball; no kind = a player (every board saved before this)
  locked?: boolean // locked pieces can't be clicked, moved or nudged until you right-click → Unlock (same on every element type)
  ghost?: boolean // a faded copy: where a player was, or where they'll be
  team?: "home" | "away" // the team they play for (boards from before teams were kept go by the kit)
}
interface Arrow {
  id: string
  x1: number; y1: number; x2: number; y2: number
  cpx: number; cpy: number
  color: string; strokeW: number
  dash: "none" | "dashed" | "dotted"
  label: string; twoWay: boolean
  locked?: boolean
  kind?: "pass" | "run" | "dribble" | "shot" | "line" // what the line shows; no kind = an arrow drawn before line types
  step?: number // the step number shown on the line, to give the order of play
  fromId?: string; toId?: string // the pieces the line starts and ends on; it follows them when they move
  dist?: boolean // shows the line's length in metres
}
interface TextBox {
  id: string; x: number; y: number
  text: string; fg: string; bg: string
  border: string; dash: boolean
  size: number; bold: boolean; width: number
  layer: "foreground" | "background"
  manualH?: number
  noBox?: boolean
  locked?: boolean
}
interface Shape {
  id: string; kind: ShapeKind
  pts: [number, number][]
  closed: boolean
  x: number; y: number; w: number; h: number
  fill: string; fillOpacity: number
  stroke: string; strokeW: number; strokeDash: boolean
  label: string
  locked?: boolean
  ids?: string[] // a team shape: the piece each point is attached to ("" = a free point); the points follow the pieces
  dist?: boolean // shows each side's length in metres
}
interface CustomZone {
  id: string
  x: number; y: number; w: number; h: number  // pitch-local coordinates (0..PW, 0..PH)
  color: string; opacity: number; label: string
  locked?: boolean
}
interface UploadedImage {
  id: string; x: number; y: number
  width: number; height: number
  src: string; opacity: number
  layer: "background" | "overlay"
  naturalW: number; naturalH: number
  locked?: boolean
}
interface CanvasState {
  players: Player[]; arrows: Arrow[]; texts: TextBox[]
  shapes: Shape[]; images: UploadedImage[]
  title: string; bgColor: string; showPitch: boolean
  customZones?: CustomZone[]; settings?: BoardSettings
  steps?: BoardStep[]; step?: number // a move in steps (a drop can come with one)
}
interface Template {
  id: string; name: string
  data: CanvasState
  published: boolean
  createdAt: number
}

/** How a board looks. Saved with the board so it reopens exactly the same. */
interface BoardSettings {
  workspaceMode: "tactics" | "brainstorm"
  canvasMode: "full" | "half" | "blank"
  showPitch: boolean
  pitchColor: "green" | "white"
  bgColor: string
  pitchScale: number; pitchOffX: number; pitchOffY: number
  view3d: boolean; rotation: number
  homeColor: string; awayColor: string
  showPlayerLabels: boolean
  textLayer: "foreground" | "background"
  showLanes: boolean; show18Zones: boolean
  pitchVisible: boolean // false hides the drawn pitch (grass and lines) so a photo behind it shows; zones and lanes stay
  homePat: KitPattern; homeC2: string; homeNum: string; homeName: string // the home kit's pattern, second colour and number colour, and the team's name
  awayPat: KitPattern; awayC2: string; awayNum: string; awayName: string
  labelSize: "standard" | "large" | "xl" // name and number size on the pieces; bigger stays readable on a phone
  nameStyle: "halo" | "chip" // names on a dark outline, or on a small dark chip
  tokenStyle: "classic" | "minimal" // minimal = flat pieces: no drop shadow, a thin ring
  vertical: boolean // the pitch stands upright: home goal at the bottom
  focus: "board" | "pitch" | "half" | "third" // the part of the board you see and export
  focusEnd: "attack" | "defend" // which end a half or a third shows
  frameRatio: "auto" | "16:9" | "4:5" | "1:1" | "9:16" // the shape of the export
  homeFormation: string; homeShape: "base" | "in" | "out" // the formation the home team was last set to ("" = none), and its shape: lineup, in or out of possession
  awayFormation: string; awayShape: "base" | "in" | "out"
  pitchStyle: "classic" | "night" | "paper" // classic = green or white lines; night and paper are the editorial looks
  psMark: boolean // the PS mark mowed into the middle of the pitch
  editorial: boolean // the editorial frame: slate, score strip, caption, legend, crop marks and edition number
  kicker: string // the small line above the title
  homeScore: string; awayScore: string; scoreNote: string // the score strip: the goals each side scored, and a note such as FT
  caption: string // the line (or two) under the board
  showLegend: boolean; cropMarks: boolean; showEdition: boolean
  animSpeed: "slow" | "normal" | "fast"; endCard: boolean // how fast the steps play, and the animated end card on GIF and video exports
}
/** What a saved board keeps in canvas_data (version 2). Version 1 boards only had the five element lists. */
interface BoardData {
  v: 2
  players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[]
  customZones: CustomZone[]
  settings: BoardSettings
  steps?: BoardStep[]; step?: number // a move in steps: every step (this one too) and which is on screen. Only boards with 2 or more steps have them
}
const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  workspaceMode: "tactics", canvasMode: "full", showPitch: true, pitchColor: "green", bgColor: "#2D2F34",
  pitchScale: 1, pitchOffX: 0, pitchOffY: 0, view3d: false, rotation: 0,
  homeColor: "#fbbf24", awayColor: "#1d4ed8", showPlayerLabels: true, textLayer: "foreground",
  showLanes: false, show18Zones: false, pitchVisible: true,
  homePat: "solid", homeC2: "#fbbf24", homeNum: "#000000", homeName: "",
  awayPat: "solid", awayC2: "#1d4ed8", awayNum: "#ffffff", awayName: "",
  labelSize: "standard", nameStyle: "halo", tokenStyle: "classic",
  vertical: false, focus: "board", focusEnd: "attack", frameRatio: "auto",
  homeFormation: "", homeShape: "base", awayFormation: "", awayShape: "base",
  pitchStyle: "classic", psMark: false, editorial: false, kicker: "", homeScore: "", awayScore: "", scoreNote: "", caption: "",
  showLegend: true, cropMarks: true, showEdition: true, animSpeed: "normal", endCard: true,
}
/** Builds a complete, valid settings object from anything (saved data or the live board). Missing or bad values fall back to the defaults. */
function settingsFrom(src: Record<string, unknown> | null | undefined): BoardSettings {
  const v = src ?? {}
  const d = DEFAULT_BOARD_SETTINGS
  const oneOf = <T extends string>(x: unknown, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly unknown[]).includes(x) ? (x as T) : fallback
  const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback)
  const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback)
  const str = (x: unknown, fallback: string) => (typeof x === "string" && x ? x : fallback)
  return {
    workspaceMode: oneOf(v.workspaceMode, ["tactics", "brainstorm"] as const, d.workspaceMode), // an old Report board opens as a tactics board
    canvasMode: oneOf(v.canvasMode, ["full", "half", "blank"] as const, d.canvasMode),
    showPitch: bool(v.showPitch, d.showPitch),
    pitchColor: oneOf(v.pitchColor, ["green", "white"] as const, d.pitchColor),
    bgColor: str(v.bgColor, d.bgColor),
    pitchScale: num(v.pitchScale, d.pitchScale), pitchOffX: num(v.pitchOffX, d.pitchOffX), pitchOffY: num(v.pitchOffY, d.pitchOffY),
    view3d: bool(v.view3d, d.view3d), rotation: num(v.rotation, d.rotation),
    homeColor: str(v.homeColor, d.homeColor), awayColor: str(v.awayColor, d.awayColor),
    showPlayerLabels: bool(v.showPlayerLabels, d.showPlayerLabels),
    textLayer: oneOf(v.textLayer, ["foreground", "background"] as const, d.textLayer),
    showLanes: bool(v.showLanes, d.showLanes), show18Zones: bool(v.show18Zones, d.show18Zones),
    pitchVisible: bool(v.pitchVisible, d.pitchVisible),
    homePat: oneOf(v.homePat, KIT_PATTERNS, d.homePat), homeC2: str(v.homeC2, d.homeC2), homeNum: str(v.homeNum, d.homeNum),
    homeName: typeof v.homeName === "string" ? v.homeName.slice(0, 30) : d.homeName,
    awayPat: oneOf(v.awayPat, KIT_PATTERNS, d.awayPat), awayC2: str(v.awayC2, d.awayC2), awayNum: str(v.awayNum, d.awayNum),
    awayName: typeof v.awayName === "string" ? v.awayName.slice(0, 30) : d.awayName,
    labelSize: oneOf(v.labelSize, ["standard", "large", "xl"] as const, d.labelSize),
    nameStyle: oneOf(v.nameStyle, ["halo", "chip"] as const, d.nameStyle),
    tokenStyle: oneOf(v.tokenStyle, ["classic", "minimal"] as const, d.tokenStyle),
    vertical: bool(v.vertical, d.vertical),
    focus: oneOf(v.focus, ["board", "pitch", "half", "third"] as const, d.focus),
    focusEnd: oneOf(v.focusEnd, ["attack", "defend"] as const, d.focusEnd),
    frameRatio: oneOf(v.frameRatio, ["auto", "16:9", "4:5", "1:1", "9:16"] as const, d.frameRatio),
    homeFormation: typeof v.homeFormation === "string" ? v.homeFormation.slice(0, 20) : d.homeFormation,
    homeShape: oneOf(v.homeShape, ["base", "in", "out"] as const, d.homeShape),
    awayFormation: typeof v.awayFormation === "string" ? v.awayFormation.slice(0, 20) : d.awayFormation,
    awayShape: oneOf(v.awayShape, ["base", "in", "out"] as const, d.awayShape),
    pitchStyle: oneOf(v.pitchStyle, ["classic", "night", "paper"] as const, d.pitchStyle),
    psMark: bool(v.psMark, d.psMark), editorial: bool(v.editorial, d.editorial),
    kicker: typeof v.kicker === "string" ? v.kicker.slice(0, 40) : d.kicker,
    homeScore: typeof v.homeScore === "string" ? v.homeScore.slice(0, 3) : d.homeScore,
    awayScore: typeof v.awayScore === "string" ? v.awayScore.slice(0, 3) : d.awayScore,
    scoreNote: typeof v.scoreNote === "string" ? v.scoreNote.slice(0, 12) : d.scoreNote,
    caption: typeof v.caption === "string" ? v.caption.slice(0, 160) : d.caption,
    showLegend: bool(v.showLegend, d.showLegend), cropMarks: bool(v.cropMarks, d.cropMarks), showEdition: bool(v.showEdition, d.showEdition),
    animSpeed: oneOf(v.animSpeed, ["slow", "normal", "fast"] as const, d.animSpeed), endCard: bool(v.endCard, d.endCard),
  }
}
/** Reads any saved board, old or new format, and fills in anything missing. */
function normalizeBoardData(raw: unknown): BoardData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const list = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
  return {
    v: 2,
    players: list<Player>(r.players), arrows: list<Arrow>(r.arrows), texts: list<TextBox>(r.texts),
    shapes: list<Shape>(r.shapes), images: list<UploadedImage>(r.images),
    customZones: list<CustomZone>(r.customZones),
    settings: settingsFrom(r.settings as Record<string, unknown> | undefined),
    ...stepsFrom(r.steps, r.step),
  }
}
/** A board's steps, when it has 2 or more (anything else is a board without steps) */
function stepsFrom(raw: unknown, at: unknown): { steps?: BoardStep[]; step?: number } {
  const list = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
  const steps = list<Record<string, unknown>>(raw).filter(f => f && typeof f === "object").map(f => ({
    players: list<Player>(f.players), arrows: list<Arrow>(f.arrows), texts: list<TextBox>(f.texts),
    shapes: list<Shape>(f.shapes), customZones: list<CustomZone>(f.customZones), note: typeof f.note === "string" ? f.note.slice(0, 48) : "",
  }))
  if (steps.length < 2) return {}
  const i = typeof at === "number" && Number.isFinite(at) ? Math.round(at) : 0
  return { steps, step: Math.max(0, Math.min(steps.length - 1, i)) }
}
/** A short way to compare "what's on screen" with "what was last saved". */
const boardFingerprint = (title: string, narrative: string, data: BoardData) => JSON.stringify([title, narrative, data])
/** The pieces a board is made of, in a fixed order. Lists are compared as objects, so an edit shows up the moment it happens. */
const boardParts = (title: string, narrative: string, d: BoardData): unknown[] =>
  [title, narrative, d.players, d.arrows, d.texts, d.shapes, d.images, d.customZones, ...Object.values(d.settings),
    d.step, ...(d.steps ?? []).flatMap(f => [f.players, f.arrows, f.texts, f.shapes, f.customZones, f.note])]
const sameParts = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
/** The same data always gives the same text, whatever order the keys come back in from the database. */
function canonicalJson(x: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort)
      : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort((v as Record<string, unknown>)[k])]))
      : v
  return JSON.stringify(sort(x))
}
/** How long a save is waited for before it counts as failed, so "Saving…" can never get stuck:
 *  20 s, plus 1 s for every 50 KB it sends (photos on a slow phone connection need longer), up to 3 minutes. */
const saveTimeoutFor = (size: number) => Math.min(180000, 20000 + Math.ceil(size / 50000) * 1000)
/** Runs a database request, but stops waiting for it after ms (and cancels it, unless cancel is false). Gives null if it took too long. */
function withTimeout<T>(make: (signal: AbortSignal) => PromiseLike<T>, ms: number, cancel = true): Promise<T | null> {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => { if (cancel) ctrl.abort(); resolve(null) }, ms) })
  return Promise.race([Promise.resolve(make(ctrl.signal)), timeout]).finally(() => clearTimeout(timer))
}
/** What one save writes, decided at the moment it was asked for. */
type SaveSnap = { epoch: number; uid: string; title: string; narrative: string; data: BoardData }
/** The board's fonts, ready to put into exported pictures (fetched on the first export). */
let exportFontCSS: Promise<string> | null = null
/** Why the "leaving the board" dialog is showing. */
type LeaveReason = "new" | "failed" | "conflict" | "saving"
/** Saves still on their way. The hub's list waits for them (up to maxMs), so it doesn't show an older version of a board. */
const savesInFlight = new Set<Promise<unknown>>()
const waitForSaves = (maxMs: number) =>
  Promise.race([Promise.allSettled(Array.from(savesInFlight)), new Promise(resolve => setTimeout(resolve, maxMs))])
/** The save each saved board is waiting on. Opening that board waits for it: it may hold the last change made before Back. */
const boardSavesInFlight = new Map<string, Promise<unknown>>()
const waitForBoardSave = (id: string) => boardSavesInFlight.get(id) ?? Promise.resolve()
/** Tells the board page to open as Braindump (set by the "/braindump" page, read once when the board opens). */
const boardHandoff = { braindump: false }
/** Unsaved new boards are kept on this device (one for the board, one for Braindump),
 *  so the browser's Back button, a closed tab or a crash doesn't lose them. Boards with big photos are too large to keep. */
const DRAFT_MAX_CHARS = 1000000
const draftKey = (userId: string, mode: string) => `ps_draft_${mode === "brainstorm" ? "braindump" : "board"}_${userId}`
function readDraft(key: string): { title: string; narrative: string; data: unknown } | null {
  try {
    const d = JSON.parse(localStorage.getItem(key) || "null")
    return d && typeof d === "object" && d.data && typeof d.data === "object" ? { title: String(d.title || ""), narrative: String(d.narrative || ""), data: d.data } : null
  } catch { return null }
}

type Sel = null | { kind: "player" | "arrow" | "text" | "shape" | "image" | "zone"; id: string }
type SelItem = NonNullable<Sel>

/* ─────────────────────────── Constants ─────────────────────── */
const CW = 1400, CH = 900    // canvas dimensions
const PW = 1050, PH = 680    // pitch dimensions
const PX = (CW - PW) / 2    // = 175, pitch x offset
const PY = (CH - PH) / 2    // = 110, pitch y offset
const SVG_DISPLAY_W = 980 // the board is shown at most 980 × 630 at 100% zoom

/** Where the pitch sits on the canvas. Horizontal: as it always has. Vertical: turned a quarter, home goal at the bottom. */
type PitchGeo = { ox: number; oy: number; sc: number; v: boolean }
const VERT_SCALE = 0.78 // an upright pitch is scaled to fit the canvas height
const pitchGeo = (v: boolean, scale: number, offX: number, offY: number): PitchGeo => v
  ? { ox: (CW - PH * VERT_SCALE) / 2 + offX, oy: (CH - PW * VERT_SCALE) / 2 + offY, sc: scale * VERT_SCALE, v }
  : { ox: PX + offX, oy: PY + offY, sc: scale, v }
/** Pitch coordinates (the pitch drawn 1050 × 680, home goal on the left) → board coordinates */
const toCanvas = (g: PitchGeo, px: number, py: number) =>
  g.v ? { x: g.ox + g.sc * py, y: g.oy + g.sc * (PW - px) } : { x: g.ox + g.sc * px, y: g.oy + g.sc * py }
/** Board coordinates → pitch coordinates */
const toPitch = (g: PitchGeo, x: number, y: number) =>
  g.v ? { x: PW - (y - g.oy) / g.sc, y: (x - g.ox) / g.sc } : { x: (x - g.ox) / g.sc, y: (y - g.oy) / g.sc }
/** A move on the board, as a move in pitch coordinates (zones live in pitch coordinates) */
const pitchDelta = (g: PitchGeo, dx: number, dy: number) =>
  g.v ? { x: -dy / g.sc, y: dx / g.sc } : { x: dx / g.sc, y: dy / g.sc }
const pitchTransformAttr = (g: PitchGeo) =>
  g.v ? `translate(${g.ox},${g.oy}) scale(${g.sc}) translate(0,${PW}) rotate(-90)` : `translate(${g.ox},${g.oy}) scale(${g.sc})`
/** The board rectangle covering part of the pitch */
const pitchRect = (g: PitchGeo, x1: number, y1: number, x2: number, y2: number) => {
  const a = toCanvas(g, x1, y1), b = toCanvas(g, x2, y2)
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }
}
/** Export sizes in pixels; "auto" keeps the frame's own shape */
const FRAME_SIZES: Record<BoardSettings["frameRatio"], [number, number] | null> = {
  auto: null, "16:9": [1920, 1080], "4:5": [1080, 1350], "1:1": [1080, 1080], "9:16": [1080, 1920],
}
/** The part of the board you see and export: the whole board, or the pitch, a half or a third with room for names and the seal, widened to the export shape */
const frameRect = (g: PitchGeo, focus: BoardSettings["focus"], end: BoardSettings["focusEnd"], ratio: BoardSettings["frameRatio"], ed?: { strip: boolean; lines: number; pitch?: boolean } | null) => {
  let r = { x: 0, y: 0, w: CW, h: CH }
  if (focus !== "board") {
    const part = focus === "half" ? PW / 2 : focus === "third" ? PW / 3 : PW
    const [x1, x2] = end === "attack" ? [PW - part, PW] : [0, part]
    const p = pitchRect(g, x1, 0, x2, PH)
    r = { x: p.x - 36, y: p.y - 36, w: p.w + 72, h: p.h + 100 }
  }
  // The editorial frame: room above for the slate (and under it for the score strip on a narrow frame) and below for the caption and the legend.
  // The whole board already has that room in its margins.
  if (ed && focus !== "board") {
    const top = 104 + (ed.strip && r.w < 1100 ? 58 : 0), bottom = 40 + (ed.lines ? ed.lines * 22 + 14 : 0)
    r = { ...r, y: r.y - top, h: r.h + top + bottom }
  }
  // On the whole board, the slate and a long caption must clear the pitch too (an upright pitch reaches almost to the edges)
  if (ed?.pitch && focus === "board") {
    const p = pitchRect(g, 0, 0, PW, PH)
    const top = Math.max(0, 104 - (p.y - r.y)), bottom = Math.max(0, (ed.lines ? 84 + (ed.lines - 1) * 22 : 52) - (r.y + r.h - p.y - p.h))
    if (top || bottom) r = { ...r, y: r.y - top, h: r.h + top + bottom }
  }
  const size = FRAME_SIZES[ratio]
  if (size) {
    const a = size[0] / size[1]
    if (r.w / r.h < a) { const w = r.h * a; r = { ...r, x: r.x - (w - r.w) / 2, w } }
    else { const h = r.w / a; r = { ...r, y: r.y - (h - r.h) / 2, h } }
  }
  return r
}
const UPRIGHT_3D = "perspective(1400px) rotateX(38deg) scaleY(0.95)" // the 3D tilt, on screen and in exports
// Pitch center in pitch-local coords
const PCX = PW / 2, PCY = PH / 2

const uid = () => Math.random().toString(36).slice(2, 9)
const HOME_COLORS = { bg: "#fbbf24", fg: "#000000", ring: "#000000" }
const AWAY_COLORS = { bg: "#1d4ed8", fg: "#ffffff", ring: "#60a5fa" }
const MARKER_COLOR = "#f87171" // a new ✕ marker starts red, easy to see on any pitch
/** Size of a piece at scale 1: a player's circle, a ✕ marker, the ball. */
const pieceBase = (p: Player) => (p.kind === "ball" ? 12 : p.kind === "marker" ? 20 : 28)
/** A football: a centre patch, five patches cut off by the edge, and the seams between them. On the pitch it's white with black patches; as a tool icon it's drawn in the text colour. */
function BallGlyph({ r, icon = false }: { r: number; icon?: boolean }) {
  const ink = icon ? "currentColor" : "#161616"
  // A point d × r from the centre, at an angle in degrees (0 = straight up)
  const at = (d: number, deg: number) => { const a = (deg - 90) * Math.PI / 180; return `${(Math.cos(a) * d * r).toFixed(2)},${(Math.sin(a) * d * r).toFixed(2)}` }
  const ks = [0, 72, 144, 216, 288]
  return (
    <g>
      <circle r={r} fill={icon ? "none" : "#ffffff"} stroke={ink} strokeWidth={r * (icon ? 0.18 : 0.08)} />
      <polygon points={ks.map(k => at(0.33, k)).join(" ")} fill={ink} />
      {ks.map(k => (
        <g key={k}>
          <path d={`M${at(0.65, k)}L${at(0.83, k + 20)}L${at(1, k + 10)}A${r},${r} 0 0 0 ${at(1, k - 10)}L${at(0.83, k - 20)}Z`} fill={ink} />
          <path d={`M${at(0.33, k)}L${at(0.65, k)}M${at(0.83, k + 20)}L${at(0.83, k + 52)}`} fill="none" stroke={ink} strokeWidth={r * (icon ? 0.12 : 0.07)} strokeLinecap="round" />
        </g>
      ))}
    </g>
  )
}
/** The one row of colours every picker shows, + opens any colour: white, black, PS Volt, red, amber, sky, royal, green, pink */
const SWATCHES = ["#ffffff", "#000000", PS_VOLT, "#f87171", "#fbbf24", "#60a5fa", "#1d4ed8", "#4ade80", "#f472b6"]
const SHAPE_FILLS = ["#fbbf24", "#f87171", "#60a5fa", "#4ade80", "#f472b6", PS_VOLT] // new shapes take these in turn
// Grey (the default), the old near-black, grass, white, then the Night and Paper looks
const BG_PRESETS = ["#2D2F34","#0d1117","#1a472a","#ffffff","#06080b","#ddd6c3"]
/** Black or white, whichever reads better on this colour (kit numbers). Same answer as before for the original swatches. */
const inkOn = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return "#ffffff"
  const v = parseInt(m[1], 16)
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255 > 0.7 ? "#000000" : "#ffffff"
}
type Kit = { id: string; name: string; pat: KitPattern; c1: string; c2: string; num: string }
const kit = (id: string, name: string, pat: KitPattern, c1: string, c2: string, num: string): Kit => ({ id, name, pat, c1, c2, num })
/** Club-style kits, named by colour only: no club names, no crests */
const KITS: Kit[] = [
  kit("white", "White", "solid", "#ffffff", "#ffffff", "#000000"),
  kit("red", "Red", "solid", "#da291c", "#da291c", "#ffffff"),
  kit("sky", "Sky blue", "solid", "#6cabdd", "#6cabdd", "#0b1f4b"),
  kit("royal", "Royal blue", "solid", "#1d4ed8", "#1d4ed8", "#ffffff"),
  kit("navy", "Navy", "solid", "#0b1f4b", "#0b1f4b", "#ffffff"),
  kit("yellow", "Yellow", "solid", "#edbb00", "#edbb00", "#000000"),
  kit("amber", "Amber", "solid", "#fbbf24", "#fbbf24", "#000000"), // the home team's starting kit
  kit("green", "Green", "solid", "#15803d", "#15803d", "#ffffff"),
  kit("black", "Black", "solid", "#111111", "#111111", "#ffffff"),
  kit("orange", "Orange", "solid", "#f97316", "#f97316", "#000000"),
  kit("claret", "Claret", "solid", "#7a263a", "#7a263a", "#ffffff"),
  kit("blue-garnet-stripes", "Blue & garnet stripes", "stripes", "#1d4ed8", "#a50044", "#ffffff"),
  kit("red-white-stripes", "Red & white stripes", "stripes", "#da291c", "#ffffff", "#ffffff"),
  kit("black-white-stripes", "Black & white stripes", "stripes", "#111111", "#ffffff", "#ffffff"),
  kit("red-black-stripes", "Red & black stripes", "stripes", "#da291c", "#111111", "#ffffff"),
  kit("green-white-hoops", "Green & white hoops", "hoops", "#15803d", "#ffffff", "#ffffff"),
  kit("blue-white-hoops", "Blue & white hoops", "hoops", "#1d4ed8", "#ffffff", "#ffffff"),
  kit("blue-white-halves", "Blue & white halves", "halves", "#1d4ed8", "#ffffff", "#ffffff"),
  kit("red-yellow-halves", "Red & yellow halves", "halves", "#da291c", "#edbb00", "#ffffff"),
  kit("white-red-sash", "White with red sash", "sash", "#ffffff", "#da291c", "#000000"),
  kit("navy-yellow-band", "Navy with yellow band", "band", "#0b1f4b", "#edbb00", "#ffffff"),
  kit("red-white-sleeves", "Red with white sleeves", "sleeves", "#da291c", "#ffffff", "#ffffff"),
  kit("white-black-sleeves", "White with black sleeves", "sleeves", "#ffffff", "#111111", "#000000"),
]
/** The kits a team block shows before "More kits" */
const TOP_KITS = ["white", "red", "sky", "royal", "navy", "black-white-stripes"]
const GK_KITS: Kit[] = [
  kit("gk-lime", "Lime", "solid", "#a3e635", "#a3e635", "#000000"),
  kit("gk-pink", "Pink", "solid", "#f472b6", "#f472b6", "#000000"),
  kit("gk-purple", "Purple", "solid", "#7c3aed", "#7c3aed", "#ffffff"),
  kit("gk-grey", "Grey", "solid", "#6b7280", "#6b7280", "#ffffff"),
  kit("gk-teal", "Teal", "solid", "#0d9488", "#0d9488", "#ffffff"),
  kit("gk-orange", "Orange", "solid", "#f97316", "#f97316", "#000000"),
  kit("gk-black-lime-sleeves", "Black with lime sleeves", "sleeves", "#111111", "#a3e635", "#ffffff"),
]
/** True when this player is wearing that team kit (a player with no pattern is a plain colour) */
const wearsKit = (p: Player, k: { pat: KitPattern; c1: string; c2: string }, defaultBg: string) =>
  !p.kind && (((p.pat ?? "solid") === k.pat && p.bg === k.c1 && (k.pat === "solid" || p.bg2 === k.c2)) || ((p.pat ?? "solid") === "solid" && p.bg === defaultBg))
/** What a player needs to wear a kit. A plain colour stays exactly as boards always stored it */
const kitProps = (k: { pat: KitPattern; c1: string; c2: string; num: string }): Partial<Player> =>
  k.pat === "solid" ? { bg: k.c1, fg: k.num, pat: undefined, bg2: undefined, outline: false } : { bg: k.c1, fg: k.num, pat: k.pat, bg2: k.c2, outline: true }

/* ── Design tokens ──────────────────────────────────────────────
   Fonts (do not mix roles):
   · Cormorant Garamond — PITCHSTUDIO wordmark only
   · Barlow Condensed   — logo badges, chrome labels, uppercase UI
   · Inter              — all body text, inputs, and buttons
──────────────────────────────────────────────────────────────── */

/* ─────────────────────────── Formations ────────────────────── */
interface FormationPos {
  x: number; y: number   // pitch-local coords
  pos: string            // position abbreviation
  num: number            // shirt number
}
interface Formation {
  name: string
  description: string
  positions: FormationPos[]
}

const FORMATIONS: Formation[] = [
  {
    name: "4-3-3",
    description: "Attacking with wide forwards",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 247, pos: "CB", num: 5 },
      { x: 260, y: 433, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 440, y: 195, pos: "CM", num: 6 },
      { x: 460, y: 340, pos: "CM", num: 8 },
      { x: 440, y: 485, pos: "CM", num: 7 },
      { x: 730, y: 118, pos: "LW", num: 11 },
      { x: 790, y: 340, pos: "ST", num: 9 },
      { x: 730, y: 562, pos: "RW", num: 10 },
    ]
  },
  {
    name: "4-4-2",
    description: "Classic flat four",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 247, pos: "CB", num: 5 },
      { x: 260, y: 433, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 470, y: 100, pos: "LM", num: 11 },
      { x: 450, y: 260, pos: "CM", num: 8 },
      { x: 450, y: 420, pos: "CM", num: 6 },
      { x: 470, y: 580, pos: "RM", num: 7 },
      { x: 780, y: 240, pos: "ST", num: 9 },
      { x: 780, y: 440, pos: "ST", num: 10 },
    ]
  },
  {
    name: "4-2-3-1",
    description: "Double pivot with AM",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 247, pos: "CB", num: 5 },
      { x: 260, y: 433, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 400, y: 255, pos: "DM", num: 6 },
      { x: 400, y: 425, pos: "DM", num: 8 },
      { x: 590, y: 140, pos: "LW", num: 11 },
      { x: 620, y: 340, pos: "AM", num: 10 },
      { x: 590, y: 540, pos: "RW", num: 7 },
      { x: 810, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "4-1-4-1",
    description: "Single pivot with wide mids",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 247, pos: "CB", num: 5 },
      { x: 260, y: 433, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 390, y: 340, pos: "DM", num: 6 },
      { x: 540, y: 120, pos: "LM", num: 11 },
      { x: 520, y: 267, pos: "CM", num: 8 },
      { x: 520, y: 413, pos: "CM", num: 7 },
      { x: 540, y: 560, pos: "RM", num: 10 },
      { x: 820, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "3-5-2",
    description: "Three at back with wingbacks",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 180, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 250, y: 500, pos: "CB", num: 3 },
      { x: 390, y: 78, pos: "LWB", num: 11 },
      { x: 420, y: 228, pos: "CM", num: 8 },
      { x: 440, y: 340, pos: "CM", num: 6 },
      { x: 420, y: 452, pos: "CM", num: 7 },
      { x: 390, y: 602, pos: "RWB", num: 2 },
      { x: 760, y: 250, pos: "ST", num: 9 },
      { x: 760, y: 430, pos: "ST", num: 10 },
    ]
  },
  {
    name: "3-4-3",
    description: "Three defenders, high wide",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 185, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 250, y: 495, pos: "CB", num: 3 },
      { x: 450, y: 120, pos: "LM", num: 11 },
      { x: 430, y: 268, pos: "CM", num: 8 },
      { x: 430, y: 412, pos: "CM", num: 7 },
      { x: 450, y: 560, pos: "RM", num: 2 },
      { x: 710, y: 140, pos: "LW", num: 10 },
      { x: 770, y: 340, pos: "ST", num: 9 },
      { x: 710, y: 540, pos: "RW", num: 6 },
    ]
  },
  {
    name: "5-3-2",
    description: "Five defenders, compact",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 78, pos: "LWB", num: 3 },
      { x: 260, y: 210, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 260, y: 470, pos: "CB", num: 6 },
      { x: 250, y: 602, pos: "RWB", num: 2 },
      { x: 450, y: 210, pos: "CM", num: 8 },
      { x: 470, y: 340, pos: "CM", num: 10 },
      { x: 450, y: 470, pos: "CM", num: 7 },
      { x: 750, y: 248, pos: "ST", num: 9 },
      { x: 750, y: 432, pos: "ST", num: 11 },
    ]
  },
  {
    name: "5-4-1",
    description: "Defensive five with bank of four",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 78, pos: "LWB", num: 3 },
      { x: 260, y: 210, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 260, y: 470, pos: "CB", num: 6 },
      { x: 250, y: 602, pos: "RWB", num: 2 },
      { x: 460, y: 145, pos: "LM", num: 11 },
      { x: 445, y: 278, pos: "CM", num: 8 },
      { x: 445, y: 402, pos: "CM", num: 7 },
      { x: 460, y: 535, pos: "RM", num: 10 },
      { x: 790, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "4-3-2-1",
    description: "Christmas Tree",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 255, pos: "CB", num: 5 },
      { x: 260, y: 425, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 400, y: 200, pos: "CM", num: 6 },
      { x: 420, y: 340, pos: "CM", num: 8 },
      { x: 400, y: 480, pos: "CM", num: 7 },
      { x: 600, y: 235, pos: "SS", num: 11 },
      { x: 600, y: 445, pos: "SS", num: 10 },
      { x: 790, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "4-4-1-1",
    description: "Shadow striker behind lone forward",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 255, pos: "CB", num: 5 },
      { x: 260, y: 425, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 465, y: 128, pos: "LM", num: 11 },
      { x: 445, y: 262, pos: "CM", num: 8 },
      { x: 445, y: 418, pos: "CM", num: 7 },
      { x: 465, y: 552, pos: "RM", num: 10 },
      { x: 630, y: 340, pos: "SS", num: 6 },
      { x: 800, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "4-2-4",
    description: "Ultra attacking with four forwards",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 255, pos: "CB", num: 5 },
      { x: 260, y: 425, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 450, y: 260, pos: "CM", num: 6 },
      { x: 450, y: 420, pos: "CM", num: 8 },
      { x: 740, y: 110, pos: "LW", num: 11 },
      { x: 780, y: 260, pos: "ST", num: 9 },
      { x: 780, y: 420, pos: "ST", num: 10 },
      { x: 740, y: 570, pos: "RW", num: 7 },
    ]
  },
  {
    name: "3-4-2-1",
    description: "Two attacking mids behind lone striker",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 185, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 250, y: 495, pos: "CB", num: 3 },
      { x: 450, y: 120, pos: "LM", num: 11 },
      { x: 430, y: 268, pos: "CM", num: 8 },
      { x: 430, y: 412, pos: "CM", num: 6 },
      { x: 450, y: 560, pos: "RM", num: 2 },
      { x: 650, y: 240, pos: "AM", num: 10 },
      { x: 650, y: 440, pos: "AM", num: 7 },
      { x: 800, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "4-5-1",
    description: "Flat five midfield with lone striker",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 247, pos: "CB", num: 5 },
      { x: 260, y: 433, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 480, y: 80,  pos: "LM", num: 11 },
      { x: 460, y: 220, pos: "CM", num: 8 },
      { x: 470, y: 340, pos: "CM", num: 6 },
      { x: 460, y: 460, pos: "CM", num: 7 },
      { x: 480, y: 600, pos: "RM", num: 10 },
      { x: 810, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "3-2-4-1",
    description: "Three defenders with double pivot and four forwards",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 255, y: 185, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 255, y: 495, pos: "CB", num: 3 },
      { x: 400, y: 255, pos: "DM", num: 6 },
      { x: 400, y: 425, pos: "DM", num: 8 },
      { x: 620, y: 120, pos: "LW", num: 11 },
      { x: 640, y: 265, pos: "AM", num: 10 },
      { x: 640, y: 415, pos: "AM", num: 7 },
      { x: 620, y: 560, pos: "RW", num: 2 },
      { x: 810, y: 340, pos: "ST", num: 9 },
    ]
  },
  {
    name: "4-1-2-1-2",
    description: "Midfield diamond with two strikers",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 247, pos: "CB", num: 5 },
      { x: 260, y: 433, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 390, y: 340, pos: "DM", num: 6 },
      { x: 540, y: 215, pos: "CM", num: 8 },
      { x: 540, y: 465, pos: "CM", num: 7 },
      { x: 660, y: 340, pos: "AM", num: 10 },
      { x: 790, y: 230, pos: "ST", num: 9 },
      { x: 790, y: 450, pos: "ST", num: 11 },
    ]
  },
  {
    name: "5-2-3",
    description: "Five defenders with narrow midfield",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 78,  pos: "LWB", num: 3 },
      { x: 260, y: 210, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 260, y: 470, pos: "CB", num: 6 },
      { x: 250, y: 602, pos: "RWB", num: 2 },
      { x: 470, y: 260, pos: "CM", num: 8 },
      { x: 470, y: 420, pos: "CM", num: 7 },
      { x: 720, y: 140, pos: "LW", num: 11 },
      { x: 780, y: 340, pos: "ST", num: 9 },
      { x: 720, y: 540, pos: "RW", num: 10 },
    ]
  },
  {
    name: "4-3-1-2",
    description: "Three midfielders behind an attacking mid and two strikers",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 250, y: 110, pos: "LB", num: 3 },
      { x: 260, y: 247, pos: "CB", num: 5 },
      { x: 260, y: 433, pos: "CB", num: 4 },
      { x: 250, y: 570, pos: "RB", num: 2 },
      { x: 420, y: 190, pos: "CM", num: 6 },
      { x: 440, y: 340, pos: "CM", num: 8 },
      { x: 420, y: 490, pos: "CM", num: 7 },
      { x: 620, y: 340, pos: "AM", num: 10 },
      { x: 790, y: 230, pos: "ST", num: 9 },
      { x: 790, y: 450, pos: "ST", num: 11 },
    ]
  },
  {
    name: "3-1-4-2",
    description: "Three at back with a holding mid and four across",
    positions: [
      { x: 100, y: 340, pos: "GK", num: 1 },
      { x: 255, y: 185, pos: "CB", num: 5 },
      { x: 260, y: 340, pos: "CB", num: 4 },
      { x: 255, y: 495, pos: "CB", num: 3 },
      { x: 390, y: 340, pos: "DM", num: 6 },
      { x: 560, y: 110, pos: "LM", num: 11 },
      { x: 545, y: 268, pos: "CM", num: 8 },
      { x: 545, y: 412, pos: "CM", num: 7 },
      { x: 560, y: 570, pos: "RM", num: 2 },
      { x: 790, y: 250, pos: "ST", num: 9 },
      { x: 790, y: 430, pos: "ST", num: 10 },
    ]
  },
]

type TeamShape = BoardSettings["homeShape"]
/** Every position code a formation uses: a player still named after one takes the new position's name */
const POS_CODES = new Set(FORMATIONS.flatMap(f => f.positions.map(p => p.pos)))
const IN_X: Record<string, number> = { GK: 140, CB: 330, LB: 560, RB: 560, LWB: 760, RWB: 760, DM: 470, CM: 640, LM: 720, RM: 720, LW: 830, RW: 830, AM: 740, SS: 800, ST: 900 }
const OUT_X: Record<string, number> = { g: 95, d: 230, dm: 320, m: 390, a: 480, s: 560 }
/** In possession, the front players stay just onside: level with where a team out of possession holds its back line */
const ONSIDE_X = PW - OUT_X.d - 12
/** Where a formation's players stand: as written (lineup), in possession or out of possession. Home team, attacking to the right. */
function shapePositions(f: Formation, shape: TeamShape): FormationPos[] {
  if (shape === "base") return f.positions
  const has = (...c: string[]) => f.positions.some(p => c.includes(p.pos))
  const wide = has("LB", "RB", "LWB", "RWB"), dm = has("DM")
  const top = (p: FormationPos) => p.y < 340
  if (shape === "out") {
    // A compact block: everyone drops into a line (wingers into midfield; a back three's wide mids into a back five), spread evenly across it
    const line = (p: FormationPos) => p.pos === "GK" ? "g" : ["CB", "LB", "RB", "LWB", "RWB"].includes(p.pos) || (!wide && (p.pos === "LM" || p.pos === "RM")) ? "d"
      : p.pos === "DM" ? "dm" : p.pos === "AM" || p.pos === "SS" ? "a" : p.pos === "ST" ? "s" : "m"
    const out = f.positions.map(p => ({ ...p }))
    for (const k of Object.keys(OUT_X)) {
      const row = out.filter(p => line(p) === k).sort((a, b) => a.y - b.y), n = row.length
      const flank = row.some(p => /^[LR]/.test(p.pos))
      const span = n < 2 ? 0 : n === 2 ? (flank ? 400 : 180) : n === 3 ? (flank ? 420 : 260) : n === 4 ? 420 : 500
      row.forEach((p, i) => { p.x = OUT_X[k]; p.y = n < 2 ? 340 : 340 - span / 2 + (i * span) / (n - 1) })
    }
    return out
  }
  // In possession: full-backs high and wide, wingers inside, centre-backs split, the team pushed up
  const avg = (c: string) => { const xs = f.positions.filter(p => p.pos === c).map(p => p.x); return xs.reduce((a, b) => a + b, 0) / xs.length }
  const cms = f.positions.filter(p => p.pos === "CM")
  const six = !dm && cms.length === 3 ? cms.reduce((a, b) => (Math.abs(b.y - 340) < Math.abs(a.y - 340) ? b : a)) : null // three CMs and no DM: the middle one holds
  return f.positions.map(p => {
    if (p.pos === "GK") return { ...p, x: IN_X.GK, y: 340 }
    let x = IN_X[p.pos] + (p.x - avg(p.pos)) * 0.5, y = p.y
    if (p.pos === "CB") y = 340 + (y - 340) * 1.35
    if (p.pos === "CM" && !dm) x = p === six ? 470 : cms.length === 3 ? 640 : 540
    if (p.pos === "LB" || p.pos === "RB") y = top(p) ? 65 : 615
    if (p.pos === "LWB" || p.pos === "RWB") y = top(p) ? 45 : 635
    if (p.pos === "LM" || p.pos === "RM") y = wide ? (top(p) ? 200 : 480) : (top(p) ? 50 : 630)
    if (p.pos === "LW" || p.pos === "RW") y = top(p) ? 195 : 485
    return { ...p, x: Math.min(ONSIDE_X, x), y: Math.max(40, Math.min(640, y)) }
  })
}
/** Pairs each row with a different column at the lowest total cost (the Hungarian method). Needs rows ≤ columns. */
function assign(cost: number[][]): number[] {
  const n = cost.length, m = n ? cost[0].length : 0
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity, j1 = 0
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta }
      j0 = j1
    } while (p[j0] !== 0)
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1 } while (j0)
  }
  const res = new Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1
  return res
}
/** For each point in a, the point in b it's paired with (closest overall, no two sharing), or -1 when b runs out */
function matchPoints(a: { x: number; y: number }[], b: { x: number; y: number }[]): number[] {
  if (!a.length || !b.length) return a.map(() => -1)
  const d = (p: { x: number; y: number }, q: { x: number; y: number }) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2
  if (a.length <= b.length) return assign(a.map(p => b.map(q => d(p, q))))
  const res = a.map(() => -1)
  assign(b.map(q => a.map(p => d(p, q)))).forEach((i, j) => { res[i] = j })
  return res
}
/** One formation's spots paired with another's: as close as possible, keeping defenders in defence and each side on its side (a left-back becomes a left wing-back) */
function matchSlots(from: FormationPos[], to: FormationPos[]): number[] {
  const role = (pos: string) => [pos === "GK" ? 0 : /B$/.test(pos) ? 1 : /^(DM|CM|LM|RM)$/.test(pos) ? 2 : 3, pos[0] === "L" ? 0 : pos[0] === "R" ? 2 : 1]
  return assign(from.map(p => to.map(q => {
    const [g1, s1] = role(p.pos), [g2, s2] = role(q.pos)
    return (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + 30000 * (Math.abs(g1 - g2) + Math.abs(s1 - s2))
  })))
}
/** Team-sheet order: the goalkeeper, then each line from the back, right to left (home team, attacking to the right) */
function sheetOrder(pts: { x: number; y: number }[]): number[] {
  const lines: number[][] = []
  for (const i of pts.map((_, i) => i).sort((i, j) => pts[i].x - pts[j].x)) {
    const last = lines[lines.length - 1]
    if (last && pts[i].x - pts[last[last.length - 1]].x < 80) last.push(i); else lines.push([i])
  }
  return lines.flatMap(l => l.sort((i, j) => pts[j].y - pts[i].y))
}
/** Reads a pasted lineup: one name per line, or separated by commas; a shirt number before or after a name is kept */
function parseLineup(text: string): { name: string; num?: string }[] {
  return text.split(/[\n,;]/).map(t => t.replace(/^\s*[-•*·]\s*/, "").trim()).filter(Boolean).map(t => {
    const a = /^#?(\d{1,2})[.):\s-]+(.+)$/.exec(t)
    if (a) return { name: a[2].trim(), num: a[1] }
    const b = /^(.+?)[\s(#-]+(\d{1,2})\)?$/.exec(t)
    if (b) return { name: b[1].trim(), num: b[2] }
    return { name: t }
  }).filter(e => e.name).map(e => ({ ...e, name: e.name.slice(0, 30) })).slice(0, 30)
}
/** A saved squad: a team's name, kit, and players' names and numbers in team-sheet order. Kept in this browser, for any board. */
interface Squad { id: string; name: string; teamName: string; kit: { pat: KitPattern; c1: string; c2: string; num: string }; players: { name: string; num: string }[] }
const SQUADS_KEY = "ps-squads"
const readSquads = (): Squad[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SQUADS_KEY) || "[]")
    return Array.isArray(v) ? v.filter((q: Squad) => q && typeof q.id === "string" && typeof q.name === "string" && Array.isArray(q.players) && q.kit && KIT_PATTERNS.includes(q.kit.pat)) : []
  } catch { return [] }
}
const writeSquads = (list: Squad[]) => {
  try { localStorage.setItem(SQUADS_KEY, JSON.stringify(list)) }
  catch { console.warn("Squads couldn't be kept on this device: browser storage is full") }
}

/* ─────────────────────────── Helpers ────────────────────────── */
function arrowPath(x1: number, y1: number, x2: number, y2: number, cpx: number, cpy: number) {
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`
}
/** Points along an arrow's curve (used by box-select). */
const arrowPoints = (a: Arrow) => Array.from({ length: 17 }, (_, i) => {
  const t = i / 16, u = 1 - t
  return [u * u * a.x1 + 2 * u * t * a.cpx + t * t * a.x2, u * u * a.y1 + 2 * u * t * a.cpy + t * t * a.y2] as [number, number]
})
/** A text box's height on the board: it grows with its lines, or the height you dragged it to. */
const textBoxH = (t: TextBox) => Math.max(t.text.split("\n").length * t.size * 1.45 + 20, t.manualH || 0)
/** Where the pieces being moved were when the move started. */
type MoveBase = { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[]; zones: CustomZone[] }
function arrowHead(x2: number, y2: number, cpx: number, cpy: number, size = 16) {
  const angle = Math.atan2(y2 - cpy, x2 - cpx)
  const s = 0.42
  return `${x2},${y2} ${x2 - size * Math.cos(angle - s)},${y2 - size * Math.sin(angle - s)} ${x2 - size * Math.cos(angle + s)},${y2 - size * Math.sin(angle + s)}`
}
function arrowHeadRev(x1: number, y1: number, cpx: number, cpy: number, size = 16) {
  const angle = Math.atan2(y1 - cpy, x1 - cpx)
  const s = 0.42
  return `${x1},${y1} ${x1 - size * Math.cos(angle - s)},${y1 - size * Math.sin(angle - s)} ${x1 - size * Math.cos(angle + s)},${y1 - size * Math.sin(angle + s)}`
}
function dashArr(d: Arrow["dash"]) {
  return d === "dashed" ? "12,6" : d === "dotted" ? "4,4" : undefined
}
type LineKind = NonNullable<Arrow["kind"]>
const LINE_KINDS: [LineKind, string][] = [["pass", "Pass"], ["run", "Run"], ["dribble", "Dribble"], ["shot", "Shot"], ["line", "Line"]]
/** How each line type looks when you pick it */
const LINE_PRESET: Record<LineKind, { dash: Arrow["dash"]; strokeW: number }> = {
  pass: { dash: "none", strokeW: 3 }, run: { dash: "dashed", strokeW: 3 }, dribble: { dash: "none", strokeW: 3 },
  shot: { dash: "none", strokeW: 5 }, line: { dash: "none", strokeW: 3 },
}
/** A point on a line's curve (t = 0 at the start, 1 at the end) */
const curveAt = (x1: number, y1: number, cpx: number, cpy: number, x2: number, y2: number, t: number) => {
  const u = 1 - t
  return { x: u * u * x1 + 2 * u * t * cpx + t * t * x2, y: u * u * y1 + 2 * u * t * cpy + t * t * y2 }
}
/** A dribble: a wave along the curve that fades out at both ends, so the head sits straight */
function wavyPath(x1: number, y1: number, x2: number, y2: number, cpx: number, cpy: number, amp: number, wave: number) {
  const N = 120
  const pts = [{ x: x1, y: y1 }], dist = [0]
  for (let i = 1; i <= N; i++) { const p = curveAt(x1, y1, cpx, cpy, x2, y2, i / N); dist.push(dist[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)); pts.push(p) }
  const len = dist[N]
  return pts.map((p, i) => {
    const t = i / N, dx = 2 * (1 - t) * (cpx - x1) + 2 * t * (x2 - cpx), dy = 2 * (1 - t) * (cpy - y1) + 2 * t * (y2 - cpy)
    const l = Math.hypot(dx, dy) || 1
    const o = amp * Math.max(0, Math.min(1, dist[i] / wave, (len - dist[i]) / wave)) * Math.sin((2 * Math.PI * dist[i]) / wave)
    return `${i ? "L" : "M"} ${p.x - (dy / l) * o} ${p.y + (dx / l) * o}`
  }).join(" ")
}
/** The piece under a point (the one on top), if any */
const pieceAt = (pieces: Player[], x: number, y: number) =>
  [...pieces].reverse().find(p => !p.locked && Math.hypot(p.x - x, p.y - y) <= pieceBase(p) * (p.scale || 1))
/** Where a line is drawn: an end attached to a piece starts or stops at the piece's edge, not its centre */
const lineEnds = (a: Arrow, pieces: Map<string, Player>) => {
  let { x1, y1, x2, y2 } = a
  const P = a.fromId ? pieces.get(a.fromId) : undefined, Q = a.toId ? pieces.get(a.toId) : undefined
  if (P) { const r = pieceBase(P) * (P.scale || 1) + 4, d = Math.hypot(a.cpx - x1, a.cpy - y1) || 1; x1 += ((a.cpx - x1) / d) * r; y1 += ((a.cpy - y1) / d) * r }
  if (Q) { const r = pieceBase(Q) * (Q.scale || 1) + 4, d = Math.hypot(a.cpx - x2, a.cpy - y2) || 1; x2 += ((a.cpx - x2) / d) * r; y2 += ((a.cpy - y2) / d) * r }
  return { x1, y1, x2, y2 }
}
/** Metres on the pitch: it's drawn 10 units to the metre (105 m × 68 m), at whatever size it's shown */
const metres = (g: PitchGeo, d: number) => Math.round(d / (g.sc * 10))
/** The length of a line along its curve, centre to centre */
const curveLen = (a: Arrow) => {
  let l = 0, p = { x: a.x1, y: a.y1 }
  for (let i = 1; i <= 24; i++) { const q = curveAt(a.x1, a.y1, a.cpx, a.cpy, a.x2, a.y2, i / 24); l += Math.hypot(q.x - p.x, q.y - p.y); p = q }
  return l
}
/** The order pieces are joined in: a line runs the way they're spread out (a back four side to side, a spine end to end); a shape goes round its middle */
function shapeOrder(pts: { x: number; y: number }[], closed: boolean): number[] {
  const n = pts.length, cx = pts.reduce((a, p) => a + p.x, 0) / n, cy = pts.reduce((a, p) => a + p.y, 0) / n
  const idx = pts.map((_, i) => i)
  if (closed) return idx.sort((i, j) => Math.atan2(pts[i].y - cy, pts[i].x - cx) - Math.atan2(pts[j].y - cy, pts[j].x - cx))
  let sxx = 0, syy = 0, sxy = 0
  for (const p of pts) { sxx += (p.x - cx) ** 2; syy += (p.y - cy) ** 2; sxy += (p.x - cx) * (p.y - cy) }
  const th = Math.atan2(2 * sxy, sxx - syy) / 2, ux = Math.cos(th), uy = Math.sin(th) // the direction they're most spread along
  const along = (i: number) => (pts[i].x - cx) * ux + (pts[i].y - cy) * uy
  return idx.sort((i, j) => along(i) - along(j))
}
/** A copied team shape stays attached to the copied pieces, never to the originals (none copied: it's a free shape) */
const remapIds = (ids: string[] | undefined, idMap: Map<string, string>) => {
  const out = ids?.map(i => idMap.get(i) ?? "")
  return out?.some(Boolean) ? out : undefined
}
/** A small "12 m" tag on a line */
function DistTag({ x, y, m }: { x: number; y: number; m: number }) {
  const t = `${m} m`, w = t.length * 7 + 12
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: "none" }}>
      <rect x={-w / 2} y={-10} width={w} height={20} rx={10} fill="rgba(10,12,15,0.86)" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
      <text textAnchor="middle" dominantBaseline="central" y={0.5} fill="#ffffff" fontSize={13} fontWeight={700}
        style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.04em" }}>{t}</text>
    </g>
  )
}

/* ─────────────────────────── Pitch SVG ─────────────────────── */
// Renders in pitch-local coords (0..PW, 0..PH)
/** The two editorial pitch looks: Night (a dark pitch, thin pale lines, a volt centre spot) and Paper (warm paper, ink lines). bg is the canvas colour that goes with each. */
const PITCH_LOOKS = {
  night: { a: "#10171f", b: "#0b1118", line: "rgba(255,255,255,0.4)", w: 2, box: "rgba(255,255,255,0.07)", spot: PS_VOLT, bg: "#06080b", mark: "#ffffff" },
  paper: { a: "#f3eee1", b: "#ece6d5", line: "rgba(34,30,22,0.62)", w: 2.2, box: "rgba(34,30,22,0.08)", spot: "#1d1b16", bg: "#ddd6c3", mark: "#1d1b16" },
} as const
function PitchSVG({ pitchColor, look = "classic", mark = false, upright = false }: { pitchColor: "green" | "white"; look?: BoardSettings["pitchStyle"]; mark?: boolean; upright?: boolean }) {
  const lk = look === "classic" ? null : PITCH_LOOKS[look]
  const L = lk ? lk.line : pitchColor === "white" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)", W = lk ? lk.w : 2.5
  const BOX = lk ? lk.box : pitchColor === "white" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)", SPOT = lk ? lk.spot : L
  return (
    <g>
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={i * (PW / 13)} y={0} width={PW / 13 + 1} height={PH}
          fill={lk ? (i % 2 === 0 ? lk.a : lk.b) : pitchColor === "white" ? "#ffffff" : i % 2 === 0 ? "#1e6634" : "#1a5a2d"} />
      ))}
      {/* The PS mark, mowed into the grass across the stripes */}
      {mark && (
        <g style={{ pointerEvents: "none" }} transform={upright ? `rotate(90 ${PCX} ${PCY})` : undefined}>
          <clipPath id="ps-mark-clip">
            <text x={PCX} y={PCY + 118} textAnchor="middle" fontSize={340} fontWeight={800} style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "-0.01em" }}>PS</text>
          </clipPath>
          <g clipPath="url(#ps-mark-clip)">
            {Array.from({ length: 18 }, (_, i) => (
              <rect key={i} x={PCX - 240} y={PCY - 150 + i * 17} width={480} height={17}
                fill={lk ? lk.mark : "#ffffff"} fillOpacity={i % 2 === 0 ? (lk && look === "paper" ? 0.24 : 0.2) : 0.07} />
            ))}
          </g>
        </g>
      )}
      <rect x={3} y={3} width={PW - 6} height={PH - 6} fill="none" stroke={L} strokeWidth={W} />
      <line x1={PCX} y1={3} x2={PCX} y2={PH - 3} stroke={L} strokeWidth={W} />
      <circle cx={PCX} cy={PCY} r={91.5} fill="none" stroke={L} strokeWidth={W} />
      <circle cx={PCX} cy={PCY} r={4.5} fill={SPOT} />
      <rect x={3} y={PCY - 201.5} width={162} height={403} fill="none" stroke={L} strokeWidth={W} />
      <rect x={3} y={PCY - 91.5} width={53} height={183} fill="none" stroke={L} strokeWidth={W} />
      <rect x={-14} y={PCY - 37} width={14} height={74} fill={BOX} stroke={L} strokeWidth={1.5} />
      <circle cx={110} cy={PCY} r={4} fill={SPOT} />
      <path d={`M 165 ${PCY - 73.1} A 91.5 91.5 0 0 1 165 ${PCY + 73.1}`} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW - 165} y={PCY - 201.5} width={162} height={403} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW - 56} y={PCY - 91.5} width={53} height={183} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW} y={PCY - 37} width={14} height={74} fill={BOX} stroke={L} strokeWidth={1.5} />
      <circle cx={PW - 110} cy={PCY} r={4} fill={SPOT} />
      <path d={`M ${PW - 165} ${PCY - 73.1} A 91.5 91.5 0 0 0 ${PW - 165} ${PCY + 73.1}`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M 13 3 A 10 10 0 0 1 3 13`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M ${PW - 13} 3 A 10 10 0 0 0 ${PW - 3} 13`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M 3 ${PH - 13} A 10 10 0 0 1 13 ${PH - 3}`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M ${PW - 3} ${PH - 13} A 10 10 0 0 0 ${PW - 13} ${PH - 3}`} fill="none" stroke={L} strokeWidth={W} />
    </g>
  )
}

/* ─────────────────────────── Editorial frame ───────────────── */
/** The caption broken into lines (at most 4), so the frame knows how much room it needs */
function wrapCaption(text: string, max = 48): string[] {
  const out: string[] = []
  let line = ""
  for (const w of text.trim().split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > max) { out.push(line); line = w } else line = line ? line + " " + w : w
  }
  if (line) out.push(line)
  return out.slice(0, 4)
}
/** "PS/0142 · 12.10.26": the number of this export, and today's date */
const editionStamp = (n: number) => {
  const d = new Date(), two = (x: number) => String(x).padStart(2, "0")
  return `PS/${String(n).padStart(4, "0")} · ${two(d.getDate())}.${two(d.getMonth() + 1)}.${two(d.getFullYear() % 100)}`
}
const EDITION_KEY = "ps-edition"
const readEdition = () => { try { const n = parseInt(localStorage.getItem(EDITION_KEY) || "0", 10); return Number.isFinite(n) && n > 0 ? n : 0 } catch { return 0 } }
type EdTeam = { name: string; score: string; pat: KitPattern; c1: string; c2: string }
type LegendItem = { kind: LineKind | "ghost"; color: string; label: string }
/** The slate across the top (kicker, title, score strip), the caption and the legend underneath, crop marks at the corners and the edition number. It sits on the board, so every export carries it. */
function EditorialFrame({ frame, k, ink, title, kicker, strip, note, caption, legend, crop, edition, band, step }: {
  frame: { x: number; y: number; w: number; h: number }; k: number; ink: string
  title: string; kicker: string; strip: { home: EdTeam; away: EdTeam } | null; note: string
  caption: string[]; legend: LegendItem[]; crop: boolean; edition: string | null
  band?: { color: string; top: number; bottom: number } | null // a band in the canvas colour above top and below bottom (the pitch carries on under a half or a third)
  step?: { n: number; of: number; note: string; fade: number } | null // the step on screen, shown in the slate after the kicker
}) {
  const x0 = frame.x, y0 = frame.y, x1 = frame.x + frame.w, y1 = frame.y + frame.h, m = 36 * k
  const narrow = frame.w < 1100
  const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t)
  const font = { fontFamily: "'Barlow Condensed',sans-serif" }
  const titleY = y0 + (kicker || step ? 88 : 70) * k
  const stripY = narrow ? y0 + (kicker || step ? 146 : 128) * k : y0 + 62 * k
  // How wide the kicker is, so the step can sit just after it
  const kickRef = useRef<SVGTextElement>(null)
  const [kickW, setKickW] = useState(0)
  useLayoutEffect(() => {
    const measure = () => { let w = 0; try { w = kickRef.current?.getBBox().width ?? 0 } catch { /* not drawn yet */ } setKickW(w) }
    measure()
    document.fonts?.ready.then(measure)
  }, [kicker, k])
  const cx = narrow ? (x0 + x1) / 2 : x1 - m - 310 * k
  const ks = narrow ? k * 0.85 : k // a narrow frame gets a slightly smaller strip
  const side = (t: EdTeam, dir: 1 | -1, id: string) => {
    const sw = 22 * ks * Math.max(t.score.length, 1)
    const disc = dir * (14 * ks + sw + 24 * ks)
    return (
      <g>
        <text x={dir * 14 * ks} y={stripY + 14 * ks} textAnchor={dir === 1 ? "start" : "end"} fill={ink} fontSize={44 * ks} fontWeight={800} style={font}>{t.score}</text>
        <g transform={`translate(${disc},${stripY + 1 * ks})`}>
          <KitFill cid={`ed-${id}`} r={11 * ks} pat={t.pat} c1={t.c1} c2={t.c2} />
          <circle r={11 * ks} fill="none" stroke={ink} strokeOpacity={0.5} strokeWidth={1.4} />
        </g>
        <text x={disc + dir * 22 * ks} y={stripY + 8 * ks} textAnchor={dir === 1 ? "start" : "end"} fill={ink} fontSize={25 * ks} fontWeight={700}
          style={{ ...font, letterSpacing: "0.05em", textTransform: "uppercase" }}>{cut(t.name.trim(), narrow ? 11 : 16)}</text>
      </g>
    )
  }
  let lx = x0 + m
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* On a half or a third the pitch carries on under the slate and the caption: a band in the canvas colour keeps them on clean ground */}
      {band && (
        <g>
          <defs>
            <linearGradient id="ed-band-top" x1="0" y1="0" x2="0" y2="1">
              <stop offset={Math.max(0, (band.top - 30 * k - y0) / Math.max(1, band.top - y0))} stopColor={band.color} />
              <stop offset={1} stopColor={band.color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ed-band-bottom" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor={band.color} stopOpacity={0} />
              <stop offset={Math.min(1, (30 * k) / Math.max(1, y1 - band.bottom))} stopColor={band.color} />
            </linearGradient>
          </defs>
          {band.top > y0 && <rect x={x0 - 2} y={y0 - 2} width={x1 - x0 + 4} height={band.top - y0 + 2} fill="url(#ed-band-top)" />}
          {band.bottom < y1 && <rect x={x0 - 2} y={band.bottom} width={x1 - x0 + 4} height={y1 - band.bottom + 2} fill="url(#ed-band-bottom)" />}
        </g>
      )}
      {/* Slate */}
      {kicker && (
        <g>
          <rect x={x0 + m} y={y0 + 24 * k} width={10 * k} height={10 * k} fill={PS_VOLT} stroke={ink === "#000000" ? ink : "none"} strokeWidth={1.2} />
          <text ref={kickRef} x={x0 + m + 20 * k} y={y0 + 34 * k} fill={ink} fillOpacity={0.78} fontSize={15 * k} fontWeight={700} style={{ ...font, letterSpacing: "0.22em", textTransform: "uppercase" }}>{kicker}</text>
        </g>
      )}
      {step && (
        <StepTag x={kicker ? x0 + m + 20 * k + (kickW || kicker.length * 10.5 * k) + 18 * k : x0 + m} y={y0 + 15.5 * k} k={k * 0.9} n={step.n} of={step.of} note={step.note} fade={step.fade} />
      )}
      {title && (
        <text x={x0 + m} y={titleY} fill={ink} fontSize={46 * k} fontWeight={800} style={{ ...font, letterSpacing: "0.01em", textTransform: "uppercase" }}>
          {cut(title, narrow ? 26 : 40)}
        </text>
      )}
      {strip && (
        <g transform={`translate(${cx},0)`}>
          <g transform="translate(0,0)">{side(strip.home, -1, "h")}</g>
          <text x={0} y={stripY + 10 * k} textAnchor="middle" fill={ink} fillOpacity={0.55} fontSize={34 * ks} fontWeight={600} style={font}>{strip.home.score || strip.away.score ? "–" : "v"}</text>
          <g>{side(strip.away, 1, "a")}</g>
          {note && <text x={0} y={stripY + 40 * k} textAnchor="middle" fill={ink} fillOpacity={0.7} fontSize={14 * k} fontWeight={700} style={{ ...font, letterSpacing: "0.24em", textTransform: "uppercase" }}>{note}</text>}
        </g>
      )}
      {/* Caption, then the legend */}
      {caption.map((line, i) => (
        <text key={i} x={x0 + m} y={y1 - 62 * k - (caption.length - 1 - i) * 22 * k} fill={ink} fillOpacity={0.88} fontSize={15 * k} style={{ fontFamily: "'Inter',sans-serif" }}>{line}</text>
      ))}
      <g transform={`translate(0,${y1 - 28 * k})`}>
        {legend.map(it => {
          const x = lx
          lx += (it.label.length * 8.2 + 62) * k
          const w = (it.kind === "shot" ? 4 : 2.6) * k
          return (
            <g key={it.kind}>
              {it.kind === "ghost" ? (
                <g transform={`translate(${x + 8 * k},0)`}><circle r={7 * k} fill={it.color} fillOpacity={0.45} stroke={ink} strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray="3,2" /></g>
              ) : (
                <g>
                  {it.kind === "shot" && <line x1={x} x2={x + 26 * k} y1={0} y2={0} stroke="rgba(0,0,0,0.45)" strokeWidth={w + 2} strokeLinecap="round" />}
                  {it.kind === "dribble"
                    ? <path d={wavyPath(x, 0, x + 26 * k, 0, x + 13 * k, 0, 3.5 * k, 9 * k)} fill="none" stroke={it.color} strokeWidth={w} strokeLinecap="round" />
                    : <line x1={x} x2={x + 26 * k} y1={0} y2={0} stroke={it.color} strokeWidth={w} strokeLinecap="round" strokeDasharray={it.kind === "run" ? `${6 * k},${4 * k}` : undefined} />}
                  {it.kind !== "line" && <polygon points={`${x + 31 * k},0 ${x + 23 * k},${-4.6 * k} ${x + 23 * k},${4.6 * k}`} fill={it.color} />}
                </g>
              )}
              <text x={x + 40 * k} y={5 * k} fill={ink} fillOpacity={0.82} fontSize={15 * k} fontWeight={600} style={{ ...font, letterSpacing: "0.12em", textTransform: "uppercase" }}>{it.label}</text>
            </g>
          )
        })}
      </g>
      {/* Edition number */}
      {edition && <text x={x1 - (crop ? 24 : 14) * k} y={y1 - (crop ? 62 : 52) * k} textAnchor="end" fill={ink} fillOpacity={0.62} fontSize={14 * k} fontWeight={600} style={{ ...font, letterSpacing: "0.16em" }}>{edition}</text>}
      {/* Crop marks */}
      {crop && (
        <g stroke={ink} strokeOpacity={0.6} strokeWidth={1.4} fill="none" strokeLinecap="square">
          {([[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const).map(([px, py, sx, sy], i) => (
            <path key={i} d={`M ${px + sx * 8 * k} ${py + sy * 30 * k} V ${py + sy * 8 * k} H ${px + sx * 30 * k}`} />
          ))}
          <path d={`M ${(x0 + x1) / 2 - 8 * k} ${y0 + 8 * k} h ${16 * k} M ${(x0 + x1) / 2 - 8 * k} ${y1 - 8 * k} h ${16 * k} M ${x0 + 8 * k} ${(y0 + y1) / 2 - 8 * k} v ${16 * k} M ${x1 - 8 * k} ${(y0 + y1) / 2 - 8 * k} v ${16 * k}`} />
        </g>
      )}
    </g>
  )
}

/* ─────────────────────────── Shape renderer ────────────────── */
function renderShapePath(s: Shape, extra?: React.SVGProps<SVGElement>) {
  const shared = {
    fill: s.fill, fillOpacity: s.fillOpacity,
    stroke: s.stroke, strokeWidth: s.strokeW,
    strokeDasharray: s.strokeDash ? "8,4" : undefined,
    ...extra,
  }
  if (s.kind === "polygon") {
    if (!s.pts || s.pts.length === 0) return null
    const points = s.pts.map(([x, y]) => `${x},${y}`).join(" ")
    if (s.closed === false) return <polyline points={points} {...shared as React.SVGProps<SVGPolylineElement>} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    return <polygon points={points} {...shared as React.SVGProps<SVGPolygonElement>} />
  }
  if (s.kind === "rect") {
    return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={2} {...shared as React.SVGProps<SVGRectElement>} />
  }
  if (s.kind === "circle") {
    const r = Math.min(s.w, s.h) / 2
    return <circle cx={s.x + s.w / 2} cy={s.y + s.h / 2} r={r} {...shared as React.SVGProps<SVGCircleElement>} />
  }
  if (s.kind === "ellipse") {
    return <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} {...shared as React.SVGProps<SVGEllipseElement>} />
  }
  return null
}

/* ─────────────────────────── Steps and animation ───────────── */
/** One step of a move: where everything is at that moment. Pieces keep their ids from step to step, so the animation knows who goes where. */
interface BoardStep { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; customZones: CustomZone[]; note: string }
const MAX_STEPS = 8
/** What stays the same about a player in every step (who they are and their kit); where they stand is up to each step */
const IDENTITY_KEYS = ["name", "num", "bg", "fg", "ring", "pat", "bg2", "outline", "glow", "scale", "kind", "team"] as const
/** Brings a stored step in line with the step on screen, so a renamed player or a new kit shows in every step. Gives the same step back when nothing changed. */
function syncIdentity(f: BoardStep, live: Map<string, Player>): BoardStep {
  let changed = false
  const players = f.players.map(p => {
    const q = live.get(p.id)
    if (!q || IDENTITY_KEYS.every(k => p[k] === q[k])) return p
    changed = true
    const out = { ...p } as Record<string, unknown>
    for (const k of IDENTITY_KEYS) out[k] = q[k]
    return out as unknown as Player
  })
  return changed ? { ...f, players } : f
}
type XY = { x: number; y: number }
/** A line attached to pieces, moved to where those pieces are (the bend moves half as far), as on the board */
const followLine = (a: Arrow, at: Map<string, XY>, ends: "both" | "end" = "both") => {
  const P = a.fromId && ends === "both" ? at.get(a.fromId) : undefined, Q = a.toId ? at.get(a.toId) : undefined
  const dx1 = P ? P.x - a.x1 : 0, dy1 = P ? P.y - a.y1 : 0, dx2 = Q ? Q.x - a.x2 : 0, dy2 = Q ? Q.y - a.y2 : 0
  if (!dx1 && !dy1 && !dx2 && !dy2) return a
  return { ...a, x1: a.x1 + dx1, y1: a.y1 + dy1, x2: a.x2 + dx2, y2: a.y2 + dy2, cpx: a.cpx + (dx1 + dx2) / 2, cpy: a.cpy + (dy1 + dy2) / 2 }
}
/** A team shape's points sit on the pieces they're attached to */
const followShape = (s: Shape, at: Map<string, XY>) => {
  if (!s.ids) return s
  let moved = false
  const pts = s.pts.map((pt, i) => {
    const P = s.ids![i] ? at.get(s.ids![i]) : undefined
    if (!P || (P.x === pt[0] && P.y === pt[1])) return pt
    moved = true
    return [P.x, P.y] as [number, number]
  })
  return moved ? { ...s, pts } : s
}
/** A point on a line's curve, bent so it starts at a and ends at b (a piece that isn't exactly on its line still follows the line's shape) */
const alongLine = (l: Arrow, t: number, a: XY, b: XY) => {
  const p = curveAt(l.x1, l.y1, l.cpx, l.cpy, l.x2, l.y2, t)
  return { x: p.x + (a.x - l.x1) * (1 - t) + (b.x - l.x2) * t, y: p.y + (a.y - l.y1) * (1 - t) + (b.y - l.y2) * t }
}
/** One movement in a step: a piece goes along a line from one spot to another, between two moments of the step (0 = its start, 1 = its end) */
type Move = { line: Arrow; t0: number; t1: number; from: XY; to: XY; ball?: boolean }
/** What happens between a step and the next one */
type Plan = { moves: Map<string, Move[]>; ends: Map<string, XY>; used: Map<string, [number, number]>; gone: Set<string>; phases: number }
// Works out a step's movement. Runs and dribbles take their player to where the line ends (onto the ghost there, if there is one);
// the ball goes with a dribbling player and then along each pass from whoever has it. Numbered lines play in order (1, then 2…);
// lines without a number take the whole step. A ghost showing where someone was is gone in the next step.
function planStep(f: BoardStep): Plan {
  const byId = new Map(f.players.map(p => [p.id, p]))
  const moves = new Map<string, Move[]>(), ends = new Map<string, XY>(), used = new Map<string, [number, number]>(), gone = new Set<string>()
  const acts = f.arrows.filter(a => a.fromId && byId.has(a.fromId) && (a.kind === "run" || a.kind === "dribble" || a.kind === "pass" || a.kind === "shot"))
  const phases = Math.max(0, ...acts.map(a => a.step || 0))
  const win = (a: Arrow): [number, number] => (a.step && phases ? [(a.step - 1) / phases, a.step / phases] : [0, 1])
  const byStep = (a: Arrow, b: Arrow) => (a.step || 99) - (b.step || 99)
  for (const a of acts) {
    const G = byId.get(a.fromId!)!, Q = a.toId ? byId.get(a.toId) : undefined
    if (G.ghost && a.kind === "run" && Q && !Q.ghost) { gone.add(G.id); used.set(a.id, [0, 0.35]) }
  }
  for (const a of [...acts].sort(byStep)) {
    if (a.kind !== "run" && a.kind !== "dribble") continue
    const P = byId.get(a.fromId!)!
    if (P.ghost || P.kind || moves.has(P.id) || used.has(a.id)) continue
    const Q = a.toId ? byId.get(a.toId) : undefined
    const to = Q ? { x: Q.x, y: Q.y } : { x: a.x2, y: a.y2 }
    if (Q?.ghost) gone.add(Q.id)
    const [t0, t1] = win(a)
    moves.set(P.id, [{ line: a, t0, t1, from: { x: P.x, y: P.y }, to }]); ends.set(P.id, to); used.set(a.id, [t0, t1])
  }
  // A second line from a player to the ghost where they end up anyway is done too, and the ghost goes
  for (const a of acts) {
    const Q = a.toId ? byId.get(a.toId) : undefined, e = ends.get(a.fromId!), m = moves.get(a.fromId!)?.[0]
    if (used.has(a.id) || !Q?.ghost || !e || !m || Math.hypot(e.x - Q.x, e.y - Q.y) > 40) continue
    gone.add(Q.id); used.set(a.id, [m.t0, m.t1])
  }
  const ball = f.players.find(p => p.kind === "ball")
  if (ball) {
    let pos: XY = { x: ball.x, y: ball.y }
    const dist = (p: XY) => Math.hypot(p.x - pos.x, p.y - pos.y)
    // Who has it: of the players at the ball, the one with a pass, a shot or a dribble to make (else the nearest)
    const plays = (p: Player) => acts.some(a => a.fromId === p.id && (a.kind === "pass" || a.kind === "shot" || a.kind === "dribble"))
    let owner: Player | undefined = f.players.filter(p => !p.kind && !p.ghost && dist(p) <= pieceBase(p) * (p.scale || 1) + 26)
      .sort((p, q) => Number(plays(q)) - Number(plays(p)) || dist(p) - dist(q))[0]
    let last = 0
    const segs: Move[] = []
    for (let guard = 0; guard < 8; guard++) {
      const run = owner ? moves.get(owner.id)?.[0] : undefined
      if (owner && run && run.line.kind === "dribble" && !segs.some(s => s.line === run.line) && (run.line.step || 0) >= last) {
        const off = { x: pos.x - owner.x, y: pos.y - owner.y } // the ball stays at the dribbler's feet
        const to = { x: run.to.x + off.x, y: run.to.y + off.y }
        segs.push({ ...run, from: pos, to, ball: true }); pos = to; last = run.line.step || last
        continue
      }
      const from: Player | undefined = owner
      const pass: Arrow | undefined = f.arrows.filter(a => !segs.some(s => s.line === a) && (a.kind === "pass" || a.kind === "shot") && (a.fromId === ball.id || (from && a.fromId === from.id)) && (a.step || 0) >= last).sort(byStep)[0]
      if (!pass) break
      // The receiver: the player it's passed to, or a team-mate who gets to where it's played
      const R: Player | undefined = (pass.toId ? byId.get(pass.toId) : undefined) ?? f.players
        .filter(p => !p.kind && !p.ghost && p.id !== from?.id)
        .map(p => ({ p, d: Math.hypot((ends.get(p.id) ?? p).x - pass.x2, (ends.get(p.id) ?? p).y - pass.y2) }))
        .filter(x => x.d < 45).sort((a, b) => a.d - b.d)[0]?.p
      let to: XY = { x: pass.x2, y: pass.y2 }
      if (R && !R.kind) {
        // Where they take it: at the end of their own run if they make it before or while the ball travels, otherwise where they stand
        const rm = moves.get(R.id)?.[0], arrives = pass.step && phases ? win(pass)[1] : 1
        const e = rm && rm.t0 < arrives ? rm.to : { x: R.x, y: R.y }, d = Math.hypot(e.x - pos.x, e.y - pos.y) || 1, r = pieceBase(R) * (R.scale || 1) * 0.8
        to = { x: e.x - ((e.x - pos.x) / d) * r, y: e.y - ((e.y - pos.y) / d) * r } // at the receiver's feet, on the side it came from
      }
      segs.push({ line: pass, t0: 0, t1: 1, from: pos, to, ball: true }); pos = to; last = pass.step || last
      owner = R && !R.kind ? R : undefined
      if (!owner) break
    }
    if (segs.length) {
      // When: a numbered line in its turn; otherwise one after another
      segs.forEach((s, j) => {
        if (s.line.step && phases) [s.t0, s.t1] = win(s.line)
        else if (!phases) { s.t0 = j / segs.length; s.t1 = (j + 1) / segs.length }
        else { s.t0 = j ? segs[j - 1].t1 : 0; const nx = segs.slice(j + 1).find(x => x.line.step); s.t1 = Math.max(s.t0, nx ? win(nx.line)[0] : 1) }
        used.set(s.line.id, [s.t0, s.t1])
        // a dribbler moves exactly as long as the ball does
        if (s.line.kind === "dribble") for (const ms of moves.values()) for (const m of ms) if (m.line === s.line) { m.t0 = s.t0; m.t1 = s.t1 }
      })
      moves.set(ball.id, segs); ends.set(ball.id, pos)
    }
  }
  // A pass or shot with no ball to carry still plays out: the line runs to its end
  for (const a of acts) if ((a.kind === "pass" || a.kind === "shot") && !used.has(a.id)) used.set(a.id, win(a))
  return { moves, ends, used, gone, phases }
}
/** The next step: everyone who had a run or a dribble is where it ended, the ball is where its passes took it, and those lines are done */
function nextStep(f: BoardStep): BoardStep {
  const plan = planStep(f)
  const players = f.players.filter(p => !plan.gone.has(p.id)).map(p => { const e = plan.ends.get(p.id); return e ? { ...p, x: e.x, y: e.y } : p })
  const at = new Map<string, XY>(players.map(p => [p.id, p]))
  const arrows = f.arrows
    .filter(a => !plan.used.has(a.id) && !(a.fromId && plan.gone.has(a.fromId)) && !(a.toId && plan.gone.has(a.toId)))
    .map(a => followLine(a, at))
  return { players, arrows, texts: f.texts, shapes: f.shapes.map(s => followShape(s, at)), customZones: f.customZones, note: "" }
}
/** How long the parts of an animation last, at normal speed (seconds) */
const SPEEDS = { slow: 1.4, normal: 1, fast: 0.7 } as const
const END_CARD_SECONDS = 2.6, END_CARD_ANIM = 1.7
type Timeline = { frames: BoardStep[]; plans: Plan[]; parts: { kind: "hold" | "move" | "end"; i: number; t: number; d: number }[]; total: number }
function makeTimeline(frames: BoardStep[], speed: BoardSettings["animSpeed"], endCard: boolean): Timeline {
  const k = SPEEDS[speed], plans = frames.slice(0, -1).map(planStep), parts: Timeline["parts"] = []
  let t = 0
  const push = (kind: "hold" | "move" | "end", i: number, d: number) => { parts.push({ kind, i, t, d }); t += d }
  frames.forEach((_, i) => {
    push("hold", i, (i === 0 ? 1.2 : i === frames.length - 1 ? 1.6 : 0.9) * k)
    if (i < frames.length - 1) push("move", i, Math.max(1.5, 0.95 * plans[i].phases) * k)
  })
  if (endCard) push("end", frames.length - 1, END_CARD_SECONDS)
  return { frames, plans, parts, total: t }
}
/** What's on the board at one moment of an animation, with how faded each thing is */
type MotionView = { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; customZones: CustomZone[]; fade: Map<string, number>; step: number; note: string; noteFade: number; end: number | null }
const c01 = (x: number) => Math.max(0, Math.min(1, x))
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOut = (x: number) => 1 - (1 - x) * (1 - x)
const mixN = (a: number, b: number, k: number) => a + (b - a) * k
/** The board part of the way (u, 0 to 1) from step A to step B */
function tween(A: BoardStep, B: BoardStep, plan: Plan, u: number) {
  const fade = new Map<string, number>()
  const out = () => 1 - c01(u / 0.35), inn = () => c01((u - 0.65) / 0.35)
  const local = (t0: number, t1: number) => (t1 > t0 ? c01((u - t0) / (t1 - t0)) : u >= t1 ? 1 : 0)
  const k = easeInOut(u)
  const allMoves = [...plan.moves.values()].flat()
  const Bp = new Map(B.players.map(p => [p.id, p])), Ap = new Set(A.players.map(p => p.id))
  const players: Player[] = []
  for (const p of A.players) {
    const q = Bp.get(p.id)
    if (!q) {
      players.push(p)
      const arrive = allMoves.find(m => m.line.toId === p.id) // a ghost goes as the runner reaches it
      fade.set(p.id, arrive ? 1 - local(arrive.t1 - (arrive.t1 - arrive.t0) * 0.3, arrive.t1) : out())
      continue
    }
    const ms = plan.moves.get(p.id), planned = plan.ends.get(p.id)
    let pos: XY
    if (ms && planned && Math.hypot(planned.x - q.x, planned.y - q.y) < 40) {
      pos = { x: p.x, y: p.y }
      for (const m of ms) {
        if (u < m.t0) break
        const v = local(m.t0, m.t1)
        pos = alongLine(m.line, m.ball ? easeOut(v) : easeInOut(v), m.from, m.to)
      }
      pos = { x: pos.x + (q.x - planned.x) * k, y: pos.y + (q.y - planned.y) * k } // the next step may have nudged where they end up
    } else pos = { x: mixN(p.x, q.x, k), y: mixN(p.y, q.y, k) }
    const look = u < 0.5 ? p : q
    players.push(pos.x === look.x && pos.y === look.y ? look : { ...look, x: pos.x, y: pos.y })
  }
  for (const q of B.players) if (!Ap.has(q.id)) { players.push(q); fade.set(q.id, inn()) }
  const at = new Map<string, XY>(players.map(p => [p.id, p]))
  const Ba = new Map(B.arrows.map(a => [a.id, a])), Aa = new Set(A.arrows.map(a => a.id))
  const arrows: Arrow[] = []
  for (const a of A.arrows) {
    const w = plan.used.get(a.id)
    if (w && !Ba.has(a.id)) {
      // A line being played out: what's left of it gets shorter as the player or the ball goes along it
      const v = local(w[0], w[1])
      if (v >= 1) continue
      const m = allMoves.find(x => x.line.id === a.id)
      const s = m?.ball ? easeOut(v) : easeInOut(v)
      const b = followLine(a, at, "end")
      if (s <= 0) { arrows.push(followLine(a, at)); continue }
      const p0 = curveAt(b.x1, b.y1, b.cpx, b.cpy, b.x2, b.y2, s)
      arrows.push({ ...b, x1: p0.x, y1: p0.y, cpx: mixN(b.cpx, b.x2, s), cpy: mixN(b.cpy, b.y2, s), fromId: undefined, step: undefined, label: "", dist: undefined })
      continue
    }
    const q = Ba.get(a.id)
    if (!q) { arrows.push(followLine(a, at)); fade.set(a.id, out()); continue }
    const same = q.x1 === a.x1 && q.y1 === a.y1 && q.x2 === a.x2 && q.y2 === a.y2 && q.cpx === a.cpx && q.cpy === a.cpy
    const g = same ? a : { ...(u < 0.5 ? a : q), x1: mixN(a.x1, q.x1, k), y1: mixN(a.y1, q.y1, k), x2: mixN(a.x2, q.x2, k), y2: mixN(a.y2, q.y2, k), cpx: mixN(a.cpx, q.cpx, k), cpy: mixN(a.cpy, q.cpy, k) }
    arrows.push(followLine(g, at))
  }
  for (const q of B.arrows) if (!Aa.has(q.id)) { arrows.push(followLine(q, at)); fade.set(q.id, inn()) }
  const Bt = new Map(B.texts.map(t => [t.id, t])), At = new Set(A.texts.map(t => t.id))
  const texts: TextBox[] = []
  for (const t of A.texts) {
    const q = Bt.get(t.id)
    if (!q) { texts.push(t); fade.set(t.id, out()); continue }
    if (q.text !== t.text || q.fg !== t.fg || q.size !== t.size || q.width !== t.width) { texts.push(u < 0.5 ? t : q); fade.set(t.id, Math.abs(1 - 2 * u)); continue }
    texts.push(q.x === t.x && q.y === t.y ? t : { ...t, x: mixN(t.x, q.x, k), y: mixN(t.y, q.y, k) })
  }
  for (const q of B.texts) if (!At.has(q.id)) { texts.push(q); fade.set(q.id, inn()) }
  const Bs = new Map(B.shapes.map(s => [s.id, s])), As = new Set(A.shapes.map(s => s.id))
  const shapes: Shape[] = []
  for (const s of A.shapes) {
    const q = Bs.get(s.id)
    if (!q) { shapes.push(followShape(s, at)); fade.set(s.id, out()); continue }
    const fits = s.kind === q.kind && s.pts.length === q.pts.length
    if (!fits) fade.set(s.id, Math.abs(1 - 2 * u))
    shapes.push(followShape(!fits ? (u < 0.5 ? s : q) : {
      ...q, x: mixN(s.x, q.x, k), y: mixN(s.y, q.y, k), w: mixN(s.w, q.w, k), h: mixN(s.h, q.h, k),
      pts: s.pts.map(([x, y], i) => [mixN(x, q.pts[i][0], k), mixN(y, q.pts[i][1], k)] as [number, number]),
    }, at))
  }
  for (const q of B.shapes) if (!As.has(q.id)) { shapes.push(followShape(q, at)); fade.set(q.id, inn()) }
  const Bz = new Map(B.customZones.map(z => [z.id, z])), Az = new Set(A.customZones.map(z => z.id))
  const customZones: CustomZone[] = []
  for (const z of A.customZones) {
    const q = Bz.get(z.id)
    if (!q) { customZones.push(z); fade.set(z.id, out()); continue }
    customZones.push(q.x === z.x && q.y === z.y && q.w === z.w && q.h === z.h ? (u < 0.5 ? z : q) : { ...(u < 0.5 ? z : q), x: mixN(z.x, q.x, k), y: mixN(z.y, q.y, k), w: mixN(z.w, q.w, k), h: mixN(z.h, q.h, k) })
  }
  for (const q of B.customZones) if (!Az.has(q.id)) { customZones.push(q); fade.set(q.id, inn()) }
  return { players, arrows, texts, shapes, customZones, fade }
}
/** The board t seconds into an animation */
function viewAt(tl: Timeline, t: number): MotionView {
  const part = tl.parts.find(p => t < p.t + p.d) ?? tl.parts[tl.parts.length - 1]
  if (part.kind === "move") {
    const u = c01((t - part.t) / part.d), to = part.i + (u >= 0.5 ? 1 : 0)
    return { ...tween(tl.frames[part.i], tl.frames[part.i + 1], tl.plans[part.i], u), step: to, note: tl.frames[to].note, noteFade: Math.abs(1 - 2 * u), end: null }
  }
  const f = tl.frames[part.i]
  return { players: f.players, arrows: f.arrows, texts: f.texts, shapes: f.shapes, customZones: f.customZones, fade: new Map(), step: part.i, note: f.note, noteFade: 1, end: part.kind === "end" ? t - part.t : null }
}
/** "2/3" and the step's note, in the top corner of the pitch */
function StepTag({ x, y, k, n, of, note, fade }: { x: number; y: number; k: number; n: number; of: number; note: string; fade: number }) {
  // The note's backing fits its text
  const ref = useRef<SVGTextElement>(null)
  const [tw, setTw] = useState(0)
  useLayoutEffect(() => {
    const measure = () => { let v = 0; try { v = ref.current?.getBBox().width ?? 0 } catch { /* not drawn yet */ } setTw(v) }
    measure()
    document.fonts?.ready.then(measure)
  }, [note, k])
  const w = 52 * k, h = 30 * k, nw = note ? (tw || note.length * 7.6 * k) + 24 * k : 0
  const font = { fontFamily: "'Barlow Condensed',sans-serif" }
  return (
    <g transform={`translate(${x},${y})`} style={{ pointerEvents: "none" }}>
      {note && <rect width={w + nw} height={h} rx={4 * k} fill="rgba(10,12,15,0.86)" opacity={fade} />}
      <rect width={w} height={h} rx={4 * k} fill={PS_VOLT} />
      <text x={w / 2} y={h / 2 + 0.5 * k} textAnchor="middle" dominantBaseline="central" fill="#0a0c0f" fontSize={18 * k} fontWeight={800} style={{ ...font, letterSpacing: "0.04em" }}>{n}/{of}</text>
      {note && <text ref={ref} x={w + 12 * k} y={h / 2 + 0.5 * k} dominantBaseline="central" fill="#ffffff" opacity={fade} fontSize={16 * k} fontWeight={700} style={{ ...font, letterSpacing: "0.06em", textTransform: "uppercase" }}>{note}</text>}
    </g>
  )
}
/** The end card on GIF and video exports: your crest or logo stamps down, then the handle and PITCHSTUDIO come up, like a broadcaster's sting */
function EndCard({ frame, k, t, handle, brand, logo, bg, ink, edition }: { frame: { x: number; y: number; w: number; h: number }; k: number; t: number; handle: string; brand: Brand; logo: string | null; bg: string; ink: string; edition: string | null }) {
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2 - 34 * k, R = 66 * k
  const back = (x: number) => { const y = x - 1; return 1 + y * y * (2.7 * y + 1.7) } // a stamp that lands with a little bounce
  const p = c01((t - 0.25) / 0.45), ring = c01((t - 0.62) / 0.55)
  const h = c01((t - 0.8) / 0.4), w = c01((t - 1.0) / 0.4), ed = c01((t - 1.2) / 0.4)
  const font = { fontFamily: "'Barlow Condensed',sans-serif" }
  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={frame.x - 4} y={frame.y - 4} width={frame.w + 8} height={frame.h + 8} fill={bg} opacity={c01(t / 0.3)} />
      {ring > 0 && ring < 1 && <circle cx={cx} cy={cy} r={R * (1 + 0.9 * easeOut(ring))} fill="none" stroke={PS_VOLT} strokeWidth={5 * k * (1 - ring)} opacity={0.85 * (1 - ring)} />}
      {p > 0 && (
        <g transform={`translate(${cx},${cy}) rotate(${-14 * (1 - easeOut(p))}) scale(${2.4 - 1.4 * back(p)})`} opacity={c01(p * 3)}>
          <circle r={R + 12 * k} fill="none" stroke={ink} strokeOpacity={0.25} strokeWidth={1.5 * k} strokeDasharray={`${3 * k},${5 * k}`} />
          <SealDisc cx={0} cy={0} r={R} brand={brand} logo={logo} clipId="psendlogo" />
        </g>
      )}
      {handle && (
        <text x={cx} y={cy + R + 66 * k + 16 * k * (1 - easeOut(h))} textAnchor="middle" fill={ink} opacity={h} fontSize={44 * k} fontWeight={700} style={{ ...font, letterSpacing: "0.04em" }}>@{handle}</text>
      )}
      {brand.madeWith && <text x={cx} y={cy + R + (handle ? 108 : 70) * k + 12 * k * (1 - easeOut(w))} textAnchor="middle" fill={ink} fillOpacity={0.88} opacity={w} fontSize={(handle ? 21 : 30) * k} fontWeight={700} style={{ ...font, letterSpacing: "0.42em" }}>PITCHSTUDIO</text>}
      {edition && <text x={cx} y={frame.y + frame.h - 40 * k} textAnchor="middle" fill={ink} fillOpacity={0.6} opacity={ed} fontSize={15 * k} fontWeight={600} style={{ ...font, letterSpacing: "0.16em" }}>{edition}</text>}
    </g>
  )
}
/* ── Making GIF and MP4 files (no outside libraries) ── */
/** A growing list of bytes */
function byteSink() {
  let buf = new Uint8Array(1 << 20), n = 0
  const room = (k: number) => { if (n + k > buf.length) { const b = new Uint8Array(Math.max(buf.length * 2, n + k)); b.set(buf); buf = b } }
  return {
    byte(v: number) { room(1); buf[n++] = v },
    bytes(a: ArrayLike<number>) { room(a.length); buf.set(a, n); n += a.length },
    u16(v: number) { room(2); buf[n++] = v & 255; buf[n++] = (v >> 8) & 255 },
    done: () => buf.slice(0, n),
  }
}
type ByteSink = ReturnType<typeof byteSink>
/** GIF picture data: LZW-compressed colour numbers in blocks of up to 255 bytes */
function gifLzw(s: ByteSink, idx: Uint8Array) {
  s.byte(8)
  const block = new Uint8Array(255)
  let bn = 0, acc = 0, bits = 0, size = 9, next = 258
  const flush = () => { if (bn) { s.byte(bn); s.bytes(block.subarray(0, bn)); bn = 0 } }
  const emit = (code: number) => {
    acc |= code << bits; bits += size
    while (bits >= 8) { block[bn++] = acc & 255; acc >>>= 8; bits -= 8; if (bn === 255) flush() }
  }
  const table = new Map<number, number>()
  emit(256)
  let cur = idx[0]
  for (let i = 1; i < idx.length; i++) {
    const c = idx[i], key = (cur << 8) | c, hit = table.get(key)
    if (hit !== undefined) { cur = hit; continue }
    emit(cur)
    if (next === 4096) { emit(256); next = 258; size = 9; table.clear() }
    else { if (next >= 1 << size) size++; table.set(key, next++) }
    cur = c
  }
  emit(cur); emit(257)
  if (bits > 0) { block[bn++] = acc & 255; if (bn === 255) flush() }
  flush(); s.byte(0)
}
/** Up to 256 colours that best cover some sample pictures (flat graphics have few colours, so the commonest ones cover them) */
function gifPalette(samples: Uint8ClampedArray[]): Uint8Array {
  const count = new Uint32Array(32768), sum = new Float64Array(32768 * 3)
  for (const d of samples) for (let i = 0; i < d.length; i += 4) {
    const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)
    count[key]++; sum[key * 3] += d[i]; sum[key * 3 + 1] += d[i + 1]; sum[key * 3 + 2] += d[i + 2]
  }
  const keys: number[] = []
  for (let key = 0; key < 32768; key++) if (count[key]) keys.push(key)
  keys.sort((a, b) => count[b] - count[a])
  const pal = new Uint8Array(768), picked: number[][] = []
  for (const key of keys) {
    if (picked.length === 256) break
    const c = [0, 1, 2].map(j => Math.round(sum[key * 3 + j] / count[key]))
    if (picked.length < 200 || !picked.some(q => Math.abs(q[0] - c[0]) + Math.abs(q[1] - c[1]) + Math.abs(q[2] - c[2]) < 12)) picked.push(c)
  }
  picked.forEach((c, i) => pal.set(c, i * 3))
  return pal
}
/** Turns RGBA pixels into palette numbers (each colour is looked up once) */
function gifIndexer(pal: Uint8Array) {
  const cache = new Int16Array(32768).fill(-1)
  return (d: Uint8ClampedArray, out: Uint8Array) => {
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)
      let c = cache[key]
      if (c < 0) {
        let best = 1e9
        for (let q = 0; q < 256; q++) {
          const dr = pal[q * 3] - d[i], dg = pal[q * 3 + 1] - d[i + 1], db = pal[q * 3 + 2] - d[i + 2], e = 2 * dr * dr + 4 * dg * dg + 3 * db * db
          if (e < best) { best = e; c = q }
        }
        cache[key] = c
      }
      out[j] = c
    }
  }
}
/** A looping GIF written one frame at a time. Each frame keeps only the box that changed; a frame that changes nothing makes the one before last longer. */
function gifWriter(w: number, h: number, pal: Uint8Array) {
  const s = byteSink()
  s.bytes([71, 73, 70, 56, 57, 97]); s.u16(w); s.u16(h); s.byte(0xf7); s.byte(0); s.byte(0); s.bytes(pal)
  s.bytes([0x21, 0xff, 11, 78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48, 3, 1, 0, 0, 0]) // NETSCAPE2.0: loop for ever
  let prev: Uint8Array | null = null, pending: { x: number; y: number; w: number; h: number; idx: Uint8Array; cs: number } | null = null
  const write = () => {
    if (!pending) return
    const p = pending
    s.bytes([0x21, 0xf9, 4, 4]); s.u16(Math.max(2, Math.round(p.cs))); s.byte(0); s.byte(0)
    s.byte(0x2c); s.u16(p.x); s.u16(p.y); s.u16(p.w); s.u16(p.h); s.byte(0)
    gifLzw(s, p.idx)
    pending = null
  }
  return {
    /** A frame shown for cs hundredths of a second */
    add(idx: Uint8Array, cs: number) {
      let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1
      if (prev) {
        x0 = w; y0 = h; x1 = -1; y1 = -1
        for (let y = 0; y < h; y++) {
          const o = y * w
          for (let x = 0; x < w; x++) if (idx[o + x] !== prev[o + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y }
        }
        if (x1 < 0) { if (pending) pending.cs += cs; return }
      }
      write()
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, sub = new Uint8Array(bw * bh)
      for (let y = 0; y < bh; y++) sub.set(idx.subarray((y0 + y) * w + x0, (y0 + y) * w + x0 + bw), y * bw)
      pending = { x: x0, y: y0, w: bw, h: bh, idx: sub, cs }
      prev = idx
    },
    finish() { write(); s.byte(0x3b); return s.done() },
  }
}
/** An MP4 file around encoded video frames (one track, frames in order, the index at the front so it starts playing straight away) */
function mp4File(o: { w: number; h: number; fps: number; codec: string; config: Uint8Array | null; frames: { data: Uint8Array; key: boolean }[] }): Blob {
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
  const u16 = (v: number) => [(v >> 8) & 255, v & 255]
  const str = (t: string) => Array.from(t, c => c.charCodeAt(0))
  const zeros = (n: number) => new Array(n).fill(0)
  const box = (type: string, ...parts: ArrayLike<number>[]) => {
    const len = 8 + parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(len)
    out.set(u32(len)); out.set(str(type), 4)
    let at = 8
    for (const p of parts) { out.set(p, at); at += p.length }
    return out
  }
  const full = (type: string, version: number, flags: number, ...parts: ArrayLike<number>[]) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts)
  const avc = o.codec.startsWith("avc1"), n = o.frames.length, scale = o.fps * 1000, ms = Math.round((n * 1000) / o.fps)
  const matrix = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(u32)
  const ftyp = box("ftyp", str("isom"), u32(512), str("isom"), str("iso2"), str(avc ? "avc1" : "mp42"), str("mp41"))
  const mvhd = full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(ms), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2))
  const tkhd = full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(ms), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(o.w * 65536), u32(o.h * 65536))
  const mdhd = full("mdhd", 0, 0, u32(0), u32(0), u32(scale), u32(n * 1000), u16(0x55c4), u16(0))
  const hdlr = full("hdlr", 0, 0, u32(0), str("vide"), zeros(12), str("PitchStudio"), [0])
  const vmhd = full("vmhd", 0, 1, zeros(8))
  const dinf = box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1)))
  const colr = box("colr", str("nclx"), u16(1), u16(1), u16(1), [0]) // BT.709, limited range
  const conf = avc ? box("avcC", o.config ?? []) : full("vpcC", 1, 0, [0, 40, 0x82, 1, 1, 1], u16(0))
  const entry = box(avc ? "avc1" : "vp09", zeros(6), u16(1), zeros(16), u16(o.w), u16(o.h), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), conf, colr)
  const keys = o.frames.flatMap((f, i) => (f.key ? [i + 1] : []))
  const table = [
    full("stsd", 0, 0, u32(1), entry),
    full("stts", 0, 0, u32(1), u32(n), u32(1000)),
    full("stss", 0, 0, u32(keys.length), keys.flatMap(u32)),
    full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
    full("stsz", 0, 0, u32(0), u32(n), o.frames.flatMap(f => u32(f.data.length))),
  ]
  const moov = (offset: number) => box("moov", mvhd, box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", vmhd, dinf, box("stbl", ...table, full("stco", 0, 0, u32(1), u32(offset)))))))
  const head = moov(ftyp.length + moov(0).length + 8)
  const size = o.frames.reduce((a, f) => a + f.data.length, 0)
  return new Blob([ftyp, head, new Uint8Array([...u32(size + 8), ...str("mdat")]), ...o.frames.map(f => f.data)] as BlobPart[], { type: "video/mp4" })
}
/** A file name from the board's title (no characters a file name can't have) */
const safeFileName = (t: string) => Array.from(t.trim() || "PitchStudio board").filter(c => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 92 && !'/:*?"<>|'.includes(c)).join("").slice(0, 80) || "PitchStudio board"

/* ─────────────────────────── Template Modal ────────────────── */
/* ─────────────────────────── The drop library ───────────────── */
// Numbered, ready-made boards: a real situation, drawn once, to open and make your own. Each one opens in the editorial frame.
type DropCat = "Build-up" | "Pressing" | "Defence" | "Attack" | "Transition" | "Set piece"
const DROP_CATS: DropCat[] = ["Build-up", "Pressing", "Defence", "Attack", "Transition", "Set piece"]
type Pt = [number, number] // a spot on the pitch: x along it (home attacks towards 1050), y across it (0 = home's left touchline), 10 units to the metre
interface DropApi {
  home: (f: string, dx?: number) => Record<number, Player>
  away: (f: string, dx?: number) => Record<number, Player>
  only: (ps: Record<number, Player>, nums: number[]) => void
  mv: (p: Player, x: number, y: number) => void
  ball: (x: number, y: number) => Player
  pass: (a: Player, b: Player | Pt, o?: { bend?: number; step?: number }) => void
  run: (a: Player, b: Player | Pt, o?: { bend?: number; step?: number }) => void
  dribble: (a: Player, b: Player | Pt, o?: { bend?: number; step?: number }) => void
  shot: (a: Player, b: Player | Pt, o?: { bend?: number; step?: number }) => void
  ghost: (p: Player, x: number, y: number, ahead?: boolean) => Player
  label: (x: number, y: number, text: string, w?: number) => void
  zone: (x: number, y: number, w: number, h: number, label?: string) => void
  link: (ps: Player[], closed?: boolean) => void
  gap: (a: Player, b: Player) => void
  small: (k: number) => void
  note: (text: string) => void // the note for the step being drawn
  next: (note?: string) => void // starts the next step: the runs and passes drawn so far play out, then draw what happens next
}
interface Drop { no: number; name: string; cat: DropCat; blurb: string; style: "night" | "paper"; make: (d: DropApi) => void; view?: Partial<BoardSettings>; crop?: [number, number, number, number] } // view: the part of the pitch it opens on; crop: the part shown on its card (pitch coordinates)
/** Draws a drop on a fresh board (new ids every time) */
function buildDrop(drop: Drop): CanvasState {
  const g = pitchGeo(drop.view?.vertical === true, 1, 0, 0)
  const paper = drop.style === "paper"
  const ink = paper ? "#1d1b16" : "#ffffff", hot = paper ? "#b45309" : PS_VOLT
  const players: Player[] = [], arrows: Arrow[] = [], texts: TextBox[] = [], shapes: Shape[] = [], zones: CustomZone[] = []
  const frames: BoardStep[] = [] // the steps drawn so far, when the drop is a move
  let stepNote = ""
  const snap = (): BoardStep => ({
    players: players.map(p => ({ ...p })), arrows: arrows.map(a => ({ ...a })), texts: texts.map(t => ({ ...t })),
    shapes: shapes.map(s => ({ ...s, pts: s.pts.map(q => [q[0], q[1]] as [number, number]) })), customZones: zones.map(z => ({ ...z })), note: stepNote,
  })
  const cv = (x: number, y: number) => toCanvas(g, x, y)
  const squad = (side: "home" | "away", f: string, dx = 0) => {
    const form = FORMATIONS.find(x => x.name === f)!
    const out: Record<number, Player> = {}
    for (const pos of form.positions) {
      const c = cv((side === "home" ? pos.x : PW - pos.x) + dx, side === "home" ? pos.y : PH - pos.y)
      const p: Player = { id: uid(), x: c.x, y: c.y, name: pos.pos, num: String(pos.num), ...(side === "home" ? HOME_COLORS : AWAY_COLORS), glow: false, team: side }
      players.push(p); out[pos.num] = p
    }
    return out
  }
  const mv = (p: Player, x: number, y: number) => { const c = cv(x, y); p.x = c.x; p.y = c.y }
  const joint = (a: Player, b: Player | Pt, kind: LineKind, o: { bend?: number; step?: number } = {}) => {
    const B = Array.isArray(b) ? cv(b[0], b[1]) : { x: b.x, y: b.y }
    const dx = B.x - a.x, dy = B.y - a.y, L = Math.hypot(dx, dy) || 1, bend = o.bend ?? 0
    const run = kind === "run" || kind === "shot"
    arrows.push({
      id: uid(), x1: a.x, y1: a.y, x2: B.x, y2: B.y, cpx: (a.x + B.x) / 2 - (dy / L) * bend, cpy: (a.y + B.y) / 2 + (dx / L) * bend,
      color: run ? hot : ink, strokeW: LINE_PRESET[kind].strokeW, dash: LINE_PRESET[kind].dash, label: "", twoWay: false, kind,
      ...(o.step ? { step: o.step } : {}), fromId: a.id, ...(Array.isArray(b) ? {} : { toId: b.id }),
    })
  }
  const api: DropApi = {
    home: (f, dx = 0) => squad("home", f, dx),
    away: (f, dx = 0) => squad("away", f, dx),
    only: (ps, nums) => { for (const [n, p] of Object.entries(ps)) if (!nums.includes(+n)) { const i = players.indexOf(p); if (i >= 0) players.splice(i, 1) } },
    mv,
    ball: (x, y) => { const c = cv(x, y); const p: Player = { id: uid(), x: c.x, y: c.y, kind: "ball", name: "", num: "", bg: "#ffffff", fg: "#000000", ring: "#000000", glow: false, scale: 1 }; players.push(p); return p },
    pass: (a, b, o) => joint(a, b, "pass", o), run: (a, b, o) => joint(a, b, "run", o),
    dribble: (a, b, o) => joint(a, b, "dribble", o), shot: (a, b, o) => joint(a, b, "shot", o),
    ghost: (p, x, y, ahead = false) => {
      const c = cv(x, y), gh: Player = { ...p, id: uid(), x: c.x, y: c.y, ghost: true, glow: false }
      players.splice(players.indexOf(p), 0, gh)
      const [from, end] = ahead ? [p, gh] : [gh, p]
      arrows.push({ id: uid(), x1: from.x, y1: from.y, x2: end.x, y2: end.y, cpx: (from.x + end.x) / 2, cpy: (from.y + end.y) / 2, color: ink, strokeW: 3, dash: "dashed", label: "", twoWay: false, kind: "run", fromId: from.id, toId: end.id })
      return gh
    },
    // a label can also mark a new line with a backslash and n (drop 03 was written that way)
    label: (x, y, text, w = 260) => { const c = cv(x, y); texts.push({ id: uid(), x: c.x, y: c.y, text: text.split(String.fromCharCode(92, 110)).join(String.fromCharCode(10)), fg: ink, bg: "transparent", border: "transparent", dash: false, size: 15, bold: true, width: w, layer: "foreground", noBox: true }) },
    zone: (x, y, w, h, label = "") => { zones.push({ id: uid(), x, y, w, h, color: hot, opacity: 0.16, label }) },
    link: (ps, closed = false) => {
      shapes.push({ id: uid(), kind: "polygon", pts: ps.map(p => [p.x, p.y] as [number, number]), closed, ids: ps.map(p => p.id), x: 0, y: 0, w: 0, h: 0, fill: hot, fillOpacity: closed ? 0.16 : 0, stroke: hot, strokeW: closed ? 2 : 3, strokeDash: closed, label: "" })
    },
    small: k => { for (const p of players) if (!p.kind) p.scale = k },
    gap: (a, b) => { arrows.push({ id: uid(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, cpx: (a.x + b.x) / 2, cpy: (a.y + b.y) / 2, color: ink, strokeW: 2, dash: "dotted", label: "", twoWay: false, kind: "line", fromId: a.id, toId: b.id, dist: true }) },
    note: text => { stepNote = text },
    next: (note = "") => {
      const done = snap()
      frames.push(done)
      const nx = nextStep(done), at = new Map(nx.players.map(p => [p.id, p]))
      for (let i = players.length - 1; i >= 0; i--) { const q = at.get(players[i].id); if (!q) players.splice(i, 1); else { players[i].x = q.x; players[i].y = q.y } }
      arrows.splice(0, arrows.length, ...nx.arrows.map(a => ({ ...a })))
      shapes.splice(0, shapes.length, ...nx.shapes.map(s => ({ ...s, pts: s.pts.map(q => [q[0], q[1]] as [number, number]) })))
      stepNote = note
    },
  }
  drop.make(api)
  const settings = settingsFrom({
    pitchStyle: drop.style, bgColor: PITCH_LOOKS[drop.style].bg, editorial: true,
    kicker: `Drop ${String(drop.no).padStart(2, "0")} · ${drop.cat}`, caption: drop.blurb, ...drop.view,
  })
  const all = frames.length ? [...frames, snap()] : null // a move opens on its first step
  const first = all ? all[0] : snap()
  return {
    players: first.players, arrows: first.arrows, texts: first.texts, shapes: first.shapes, images: [], title: drop.name, bgColor: settings.bgColor, showPitch: true,
    customZones: first.customZones, settings, ...(all ? { steps: all, step: 0 } : {}),
  }
}
const DROPS: Drop[] = [
  {
    no: 1, name: "Full-backs step inside", cat: "Build-up", style: "night",
    blurb: "Both full-backs tuck into midfield, so three hold the middle and five attack the last line: a 2-3-5 on the ball.",
    make: d => {
      const h = d.home("4-3-3")
      d.mv(h[5], 255, 255); d.mv(h[4], 255, 425); d.mv(h[3], 440, 225); d.mv(h[8], 440, 340); d.mv(h[2], 440, 455)
      d.mv(h[11], 790, 95); d.mv(h[6], 700, 235); d.mv(h[9], 840, 340); d.mv(h[7], 700, 445); d.mv(h[10], 790, 585)
      d.ghost(h[3], 270, 105); d.ghost(h[2], 270, 575)
      d.pass(h[1], h[5], { step: 1 }); d.pass(h[5], h[3], { step: 2, bend: 24 }); d.pass(h[3], h[6], { step: 3 })
      d.link([h[3], h[8], h[2]])
      d.label(300, 20, "Full-backs step inside: three in midfield", 420)
    },
  },
  {
    no: 2, name: "The 3-2 box", cat: "Build-up", style: "night",
    blurb: "Three at the back, two pivots and two tens: a box in midfield that always offers a pass between the lines.",
    make: d => {
      const h = d.home("3-2-4-1")
      d.mv(h[5], 255, 150); d.mv(h[3], 255, 530); d.mv(h[6], 410, 270); d.mv(h[8], 410, 410)
      d.pass(h[1], h[4], { step: 1 }); d.pass(h[4], h[6], { step: 2 }); d.pass(h[6], h[10], { step: 3, bend: -30 }); d.pass(h[10], h[9], { step: 4 })
      d.link([h[5], h[4], h[3]]); d.link([h[6], h[8], h[7], h[10]], true)
      d.label(200, 40, "Back three", 200); d.label(330, 610, "The box: two pivots, two tens", 360)
    },
  },
  {
    no: 3, name: "Goalkeeper as the extra man", cat: "Build-up", style: "paper",
    blurb: "Against two strikers, the keeper and two centre-backs make it three against two. Play round the press.",
    make: d => {
      const h = d.home("4-3-3"); d.away("4-4-2", 60)
      d.mv(h[5], 190, 175); d.mv(h[4], 190, 505); d.mv(h[3], 320, 62); d.mv(h[2], 320, 618); d.mv(h[8], 440, 340)
      d.pass(h[1], h[5], { step: 1, bend: 18 }); d.pass(h[5], h[3], { step: 2, bend: 20 }); d.pass(h[3], h[6], { step: 3 })
      d.link([h[1], h[5], h[4]], true)
      d.label(30, 560, "Keeper + 2 centre-backs\\nv 2 strikers: 3 v 2", 240)
    },
  },
  {
    no: 4, name: "High press trap", cat: "Pressing", style: "night",
    blurb: "Let them play to the full-back, then close the pass back and squeeze the touchline.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-2-3-1")
      d.only(a, [1, 5, 4, 3, 2, 6, 8])
      d.mv(h[1], 470, 340); d.mv(h[3], 560, 95); d.mv(h[5], 575, 245); d.mv(h[4], 575, 435); d.mv(h[2], 560, 585)
      d.mv(h[6], 690, 230); d.mv(h[8], 690, 340); d.mv(h[7], 705, 450)
      d.mv(h[11], 870, 160); d.mv(h[9], 890, 345); d.mv(h[10], 880, 520)
      d.mv(a[1], 975, 340); d.mv(a[5], 860, 250); d.mv(a[4], 860, 430); d.mv(a[2], 840, 85); d.mv(a[3], 795, 590); d.mv(a[6], 745, 300); d.mv(a[8], 745, 405)
      d.ball(768, 612)
      d.pass(a[4], a[3], { bend: 40 })
      d.run(h[10], [800, 600], { step: 1, bend: -10 }); d.run(h[9], [840, 415], { step: 2 }); d.run(h[7], [750, 500], { step: 3, bend: -20 })
      d.zone(790, 490, 260, 190, "Trap")
      d.label(450, 30, "Trigger: the pass to the full-back", 380)
    },
  },
  {
    no: 5, name: "Mid-block 4-4-2", cat: "Defence", style: "night",
    blurb: "Two banks of four, close together, strikers set to send them wide. Nothing through the middle.",
    make: d => {
      const h = d.home("4-4-2"), a = d.away("4-3-3")
      d.only(a, [2, 8, 6, 9, 5])
      d.mv(h[3], 330, 150); d.mv(h[5], 330, 270); d.mv(h[4], 330, 410); d.mv(h[2], 330, 530)
      d.mv(h[11], 475, 170); d.mv(h[8], 475, 285); d.mv(h[6], 475, 395); d.mv(h[7], 475, 510)
      d.mv(h[9], 620, 270); d.mv(h[10], 620, 410)
      d.mv(a[2], 720, 70); d.mv(a[8], 760, 250); d.mv(a[6], 760, 440); d.mv(a[9], 880, 340); d.mv(a[5], 860, 190)
      d.ball(690, 70)
      d.link([h[3], h[5], h[4], h[2]]); d.link([h[11], h[8], h[6], h[7]]); d.link([h[9], h[10]])
      d.gap(h[5], h[8]); d.gap(h[8], h[9])
      d.zone(540, 0, 220, 150, "Send them wide")
      d.label(470, 610, "Two compact banks of four", 330)
    },
  },
  {
    no: 6, name: "Low block 5-4-1", cat: "Defence", style: "paper",
    blurb: "Five across the box, four in front of them, one up top. Hold the line, and protect the edge of the area.",
    make: d => {
      const h = d.home("5-4-1")
      d.mv(h[3], 235, 90); d.mv(h[5], 190, 215); d.mv(h[4], 180, 340); d.mv(h[6], 190, 465); d.mv(h[2], 235, 590)
      d.mv(h[11], 360, 150); d.mv(h[8], 340, 275); d.mv(h[7], 340, 405); d.mv(h[10], 360, 530)
      d.mv(h[9], 520, 340)
      d.link([h[3], h[5], h[4], h[6], h[2]]); d.link([h[11], h[8], h[7], h[10]])
      d.zone(165, 138, 125, 404)
      d.label(30, 20, "5 + 4 + 1: the box stays closed", 330)
    },
  },
  {
    no: 7, name: "Overlap on the wing", cat: "Attack", style: "night",
    blurb: "The winger cuts inside, the full-back runs past on the outside: two against one on the touchline.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(a, [3, 5, 4, 8, 6, 11])
      d.mv(h[10], 720, 505); d.mv(h[2], 600, 600); d.mv(h[7], 610, 410); d.mv(h[9], 850, 350)
      d.mv(a[11], 700, 580); d.mv(a[3], 850, 545); d.mv(a[5], 920, 430); d.mv(a[4], 920, 260); d.mv(a[8], 780, 330); d.mv(a[6], 780, 430)
      d.dribble(h[10], [800, 500], { step: 1 }); d.run(h[2], [920, 630], { step: 2, bend: -14 }); d.pass(h[10], [920, 630], { step: 3, bend: -30 })
      d.ghost(h[2], 920, 630, true)
      d.label(380, 20, "The winger drives in, the full-back goes round", 440)
      d.ball(740, 522)
      d.note("The winger drives in")
      d.next("Overlap: cross it in")
      d.mv(a[3], 880, 570); d.mv(a[5], 965, 400)
      d.run(h[9], [990, 300], { step: 1, bend: 12 }); d.pass(h[2], h[9], { step: 2, bend: -60 })
      d.next("Finish at the near post")
      d.mv(a[4], 950, 240)
      d.shot(h[9], [1050, 318])
      d.next()
    },
  },
  {
    no: 8, name: "Underlap into the half-space", cat: "Attack", style: "night",
    blurb: "The full-back runs inside the winger, between centre-back and full-back. The half-space is where defences break.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(a, [3, 2, 5, 4, 8, 6])
      d.mv(h[11], 770, 60); d.mv(h[3], 640, 215); d.mv(h[6], 590, 340); d.mv(h[9], 870, 345)
      d.mv(a[2], 850, 85); d.mv(a[5], 830, 275); d.mv(a[4], 830, 400); d.mv(a[3], 810, 540); d.mv(a[8], 720, 280); d.mv(a[6], 720, 410)
      d.zone(740, 140, 310, 120, "Half-space")
      d.run(h[3], [900, 200], { step: 1, bend: 12 }); d.pass(h[6], [900, 200], { step: 2, bend: 22 })
      d.ghost(h[3], 900, 200, true)
      d.label(380, 590, "Run between centre-back and full-back", 420)
    },
  },
  {
    no: 9, name: "Half-space overload", cat: "Attack", style: "paper",
    blurb: "Three players in a triangle on one side. Keep the distances short and the passes quick.",
    make: d => {
      const h = d.home("4-3-3")
      d.mv(h[11], 740, 80); d.mv(h[3], 600, 175); d.mv(h[6], 700, 230); d.mv(h[8], 640, 340); d.mv(h[9], 840, 300)
      d.link([h[11], h[6], h[3]], true); d.gap(h[6], h[3])
      d.pass(h[3], h[6], { step: 1 }); d.pass(h[6], h[11], { step: 2, bend: 14 }); d.pass(h[11], h[9], { step: 3, bend: 24 })
      d.label(380, 590, "Triangle: short passes, short distances", 420)
    },
  },
  {
    no: 10, name: "Switch of play", cat: "Attack", style: "night",
    blurb: "Draw them to one side, then change the point of attack. The far winger has the whole flank.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(a, [3, 5, 4, 2, 8, 6])
      d.mv(h[3], 560, 90); d.mv(h[11], 700, 85); d.mv(h[6], 640, 195); d.mv(h[8], 600, 330); d.mv(h[7], 560, 460); d.mv(h[5], 430, 250); d.mv(h[4], 430, 430); d.mv(h[2], 500, 590)
      d.mv(h[10], 780, 610); d.mv(h[9], 840, 380)
      d.mv(a[8], 740, 150); d.mv(a[6], 740, 260); d.mv(a[3], 880, 560); d.mv(a[5], 900, 190); d.mv(a[4], 900, 300); d.mv(a[2], 860, 90)
      d.pass(h[11], h[6], { step: 1 }); d.pass(h[6], h[8], { step: 2 }); d.pass(h[8], h[10], { step: 3, bend: -40 }); d.dribble(h[10], [930, 600], { step: 4 })
      d.label(360, 20, "Overload on the left, then switch right", 420)
      d.ball(718, 104)
      d.note("Draw them to the left")
      d.next("Switch: one v one on the right")
    },
  },
  {
    no: 11, name: "False nine drop", cat: "Attack", style: "night",
    blurb: "The striker drops deep. The centre-back must follow or leave a gap, and the wingers run in behind.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(a, [5, 4, 3, 2, 8, 6])
      d.mv(h[9], 700, 340); d.mv(h[11], 740, 95); d.mv(h[10], 740, 585); d.mv(h[6], 520, 230); d.mv(h[7], 520, 450); d.mv(h[8], 470, 340)
      d.mv(a[5], 780, 285); d.mv(a[4], 780, 395); d.mv(a[3], 820, 180); d.mv(a[2], 820, 500); d.mv(a[8], 620, 285); d.mv(a[6], 620, 395)
      d.ghost(h[9], 890, 340, false)
      d.pass(h[8], h[9], { step: 1 }); d.run(h[11], [920, 230], { step: 2, bend: -14 }); d.run(h[10], [920, 450], { step: 2, bend: 14 }); d.pass(h[9], [920, 230], { step: 3, bend: 28 })
      d.label(380, 590, "Striker drops: who follows?", 360)
    },
  },
  {
    no: 12, name: "Counter-attack 3 v 2", cat: "Transition", style: "night",
    blurb: "Win it, go forward at once. Three runners against two defenders, and the middle man decides.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(h, [8, 11, 9, 10, 5, 4]); d.only(a, [5, 4])
      d.mv(h[8], 470, 340); d.mv(h[11], 640, 130); d.mv(h[9], 650, 340); d.mv(h[10], 640, 550); d.mv(h[5], 300, 250); d.mv(h[4], 300, 430)
      d.mv(a[5], 860, 295); d.mv(a[4], 860, 385)
      d.dribble(h[8], [600, 340], { step: 1 }); d.run(h[11], [900, 130], { step: 2 }); d.run(h[10], [900, 550], { step: 2 }); d.run(h[9], [800, 340], { step: 2 })
      d.label(250, 20, "Win it, then run: three v two", 360)
      d.ball(492, 362)
      d.note("Win it and go")
      d.next("Draw a defender, slip it through")
      d.mv(a[5], 690, 330); d.mv(a[4], 830, 420)
      d.run(h[10], [960, 470], { step: 1, bend: 10 }); d.pass(h[8], h[10], { step: 1, bend: 24 }); d.run(h[9], [990, 250], { step: 1, bend: -10 })
      d.next("Finish across the keeper")
      d.shot(h[10], [1050, 315])
      d.next()
    },
  },
  {
    no: 13, name: "Rest defence 3-2", cat: "Transition", style: "paper",
    blurb: "While five attack, five stay back in a 3-2 shape, ready for the moment the ball is lost.",
    make: d => {
      const h = d.home("4-3-3")
      d.mv(h[1], 100, 340); d.mv(h[5], 430, 190); d.mv(h[4], 430, 340); d.mv(h[2], 430, 490); d.mv(h[8], 540, 270); d.mv(h[3], 540, 410)
      d.mv(h[6], 760, 150); d.mv(h[7], 780, 530); d.mv(h[11], 840, 90); d.mv(h[10], 840, 590); d.mv(h[9], 900, 340)
      d.link([h[5], h[4], h[2]]); d.link([h[8], h[3]]); d.zone(380, 120, 220, 440, "Rest defence")
      d.label(250, 20, "3 + 2 stay back; 5 attack", 340)
    },
  },
  {
    no: 14, name: "Gegenpress trigger", cat: "Pressing", style: "night",
    blurb: "The ball is lost. Everyone near it closes at once, and the passes out are cut before they start.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-3-3")
      d.only(h, [8, 6, 7, 9, 11, 10, 5, 4]); d.only(a, [8, 6, 7, 5, 4])
      d.mv(h[8], 580, 340); d.mv(h[6], 600, 215); d.mv(h[7], 610, 465); d.mv(h[9], 810, 290); d.mv(h[11], 690, 90); d.mv(h[10], 690, 590)
      d.mv(h[5], 440, 260); d.mv(h[4], 440, 420)
      d.mv(a[8], 710, 340); d.mv(a[6], 790, 235); d.mv(a[7], 790, 445); d.mv(a[5], 880, 300); d.mv(a[4], 880, 380)
      d.ball(690, 340)
      d.run(h[8], [655, 340], { step: 1 }); d.run(h[6], [665, 285], { step: 1 }); d.run(h[7], [670, 395], { step: 1 }); d.run(h[9], [760, 305], { step: 2 })
      d.zone(620, 230, 160, 220)
      d.label(250, 590, "Everyone near the ball closes in five seconds", 420)
    },
  },
  {
    no: 15, name: "Zone 14", cat: "Attack", style: "night",
    blurb: "The pocket in front of the box, between the lines. Find the player there and the defence has to choose.",
    make: d => {
      const h = d.home("4-2-3-1"), a = d.away("4-4-2")
      d.only(a, [5, 4, 3, 2, 11, 8, 6, 7])
      d.mv(h[10], 830, 340); d.mv(h[11], 760, 90); d.mv(h[7], 760, 590); d.mv(h[9], 940, 340); d.mv(h[6], 580, 270); d.mv(h[8], 580, 410)
      d.mv(a[5], 920, 280); d.mv(a[4], 920, 400); d.mv(a[3], 900, 150); d.mv(a[2], 900, 530)
      d.mv(a[8], 750, 205); d.mv(a[6], 750, 475); d.mv(a[11], 810, 160); d.mv(a[7], 810, 520)
      d.zone(780, 250, 120, 180, "Zone 14")
      d.pass(h[6], h[10], { step: 1, bend: 20 }); d.pass(h[10], h[9], { step: 2 }); d.run(h[11], [960, 210], { step: 2 })
      d.label(400, 20, "Between the lines, in front of the box", 400)
    },
  },
  {
    no: 16, name: "Corner: near-post flick", cat: "Set piece", style: "paper",
    blurb: "A fast ball to the near post, a flick on, and runners attacking the space at the back.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(h, [3, 9, 5, 4, 6, 8]); d.only(a, [1, 3, 2, 5, 4, 8, 6])
      d.mv(h[3], 1040, 12); d.mv(h[9], 985, 282); d.mv(h[5], 930, 340); d.mv(h[4], 900, 440); d.mv(h[6], 890, 190); d.mv(h[8], 860, 350)
      d.mv(a[1], 1040, 340); d.mv(a[3], 1040, 255); d.mv(a[2], 1040, 425); d.mv(a[5], 990, 340); d.mv(a[4], 990, 400); d.mv(a[8], 950, 225); d.mv(a[6], 935, 490)
      d.ball(1050, 0)
      d.pass(h[3], h[9], { step: 1, bend: 20 }); d.pass(h[9], [965, 455], { step: 2, bend: -18 }); d.run(h[4], [985, 440], { step: 2, bend: 8 })
      d.label(760, 40, "Near-post flick, then attack the back post", 320)
      d.small(0.7)
      d.note("Near-post ball, flick it on")
      d.next("Back post: finish")
      d.shot(h[4], [1050, 374])
      d.next()
    },
    view: { vertical: true, focus: "third", focusEnd: "attack" }, crop: [736, 0, 314, 480],
  },
  {
    no: 17, name: "Free kick: wall and decoy", cat: "Set piece", style: "night",
    blurb: "One runs over the ball, another runs past it. The wall has to decide, and the real shot goes the other way.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(h, [10, 8, 7, 9, 6]); d.only(a, [1, 5, 4, 8, 6, 7])
      d.mv(h[10], 805, 322); d.mv(h[8], 790, 400); d.mv(h[7], 800, 262); d.mv(h[9], 975, 245); d.mv(h[6], 960, 435)
      d.mv(a[1], 1040, 340); d.mv(a[5], 995, 290); d.mv(a[4], 995, 395)
      d.mv(a[8], 926, 282); d.mv(a[6], 926, 334); d.mv(a[7], 926, 386)
      d.ball(840, 334)
      d.run(h[8], [850, 355], { step: 1, bend: 10 }); d.shot(h[10], [1050, 405], { step: 2, bend: -70 })
      d.link([a[8], a[6], a[7]])
      d.label(740, 40, "A wall of three, nine metres back", 320)
      d.small(0.7)
    },
    view: { vertical: true, focus: "third", focusEnd: "attack" }, crop: [736, 100, 314, 480],
  },
  {
    no: 18, name: "Throw-in triangle", cat: "Set piece", style: "paper",
    blurb: "Never throw it down the line. Make a triangle: one short, one in behind, and the thrower back in the game.",
    make: d => {
      const h = d.home("4-3-3"), a = d.away("4-4-2")
      d.only(h, [3, 6, 11, 8, 5]); d.only(a, [2, 11, 8, 5])
      d.mv(h[3], 600, 18); d.mv(h[6], 640, 125); d.mv(h[11], 770, 65); d.mv(h[8], 530, 190); d.mv(h[5], 470, 330)
      d.mv(a[2], 705, 130); d.mv(a[11], 610, 225); d.mv(a[8], 700, 270); d.mv(a[5], 770, 350)
      d.ball(600, 0)
      d.pass(h[3], h[6], { step: 1, bend: -16 }); d.pass(h[6], h[11], { step: 2, bend: -10 }); d.run(h[3], [700, 45], { step: 3, bend: 14 })
      d.link([h[3], h[6], h[11]], true)
      d.label(880, 40, "Short, in behind, thrower supports", 320)
      d.small(0.8)
    },
    view: { vertical: true, focus: "half", focusEnd: "attack" }, crop: [440, 0, 314, 480],
  },
]
const dropCache = new Map<number, CanvasState>()
/** A drop as it looks when nothing has been changed (for the picture on its card) */
const dropPreview = (drop: Drop) => { let s = dropCache.get(drop.no); if (!s) { s = buildDrop(drop); dropCache.set(drop.no, s) } return s }
/** The picture on a drop's card: the pitch, the zones, lines and pieces */
function DropThumb({ data, crop }: { data: CanvasState; crop?: [number, number, number, number] }) {
  const st = data.settings?.pitchStyle ?? "classic"
  const geo = pitchGeo(data.settings?.vertical === true, 1, 0, 0)
  const box = crop ? pitchRect(geo, crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]) : null
  const pieces = new Map(data.players.map(p => [p.id, p]))
  return (
    <svg viewBox={box ? `${box.x} ${box.y} ${box.w} ${box.h}` : "150 90 1100 720"} width="100%" style={{ display: "block", background: data.bgColor }} aria-hidden="true">
      <g transform={pitchTransformAttr(geo)}>
        {data.settings?.canvasMode !== "blank" && <PitchSVG pitchColor={data.settings?.pitchColor ?? "green"} look={st} upright={geo.v} />}
        {(data.customZones ?? []).map(z => <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} rx={4} fill={z.color} fillOpacity={z.opacity * 1.6} />)}
      </g>
      {data.shapes.map(s => <g key={s.id}>{renderShapePath(s)}</g>)}
      {data.arrows.map(a => {
        const e = lineEnds(a, pieces)
        return (
          <g key={a.id}>
            <path d={arrowPath(e.x1, e.y1, e.x2, e.y2, a.cpx, a.cpy)} fill="none" stroke={a.color} strokeWidth={a.strokeW * 1.7} strokeDasharray={dashArr(a.dash)} strokeLinecap="round" />
            {a.kind !== "line" && <polygon points={arrowHead(e.x2, e.y2, a.cpx, a.cpy, 26)} fill={a.color} />}
          </g>
        )
      })}
      {data.players.map(p => p.kind === "ball"
        ? <circle key={p.id} cx={p.x} cy={p.y} r={13} fill="#ffffff" stroke="#111" strokeWidth={3} />
        : <circle key={p.id} cx={p.x} cy={p.y} r={26 * (p.scale || 1)} fill={p.bg} stroke={p.ring} strokeWidth={3} opacity={p.ghost ? 0.45 : 1} strokeDasharray={p.ghost ? "6,4" : undefined} />)}
    </svg>
  )
}

function TemplateModal({
  templates, onClose, onLoad, onSave, onDelete,
}: {
  templates: Template[]
  onClose: () => void
  onLoad: (t: Template) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
}) {
  const [tab, setTab] = useState<"drops" | "my">("drops")
  const [cat, setCat] = useState<DropCat | "All">("All")
  const [newName, setNewName] = useState("")
  const mine = templates // every template saved in this browser (ones once marked "published" included)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}>
      <div className="relative w-full max-h-[80vh] flex flex-col rounded-lg border overflow-hidden"
        style={{ background: SURFACE_1, borderColor: DS_BORDER_STRONG, maxWidth: 760 }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: DS_BORDER_STRONG }}>
          <div className="flex items-center gap-2">
            <BookOpen size={16} style={{ color: ACCENT_SOLID }} />
            <span className="font-semibold" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", fontSize: 16 }}>
              TEMPLATES
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--ps-hover)]"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: DS_BORDER_STRONG }}>
          {(["drops", "my"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-2.5 text-xs font-semibold uppercase transition-colors"
              style={{
                letterSpacing: "0.08em",
                borderBottom: tab === t ? `2px solid ${ACCENT_SOLID}` : "2px solid transparent",
                color: tab === t ? ACCENT_SOLID : TEXT_MUTED,
              }}>
              {t === "drops" ? `Drops (${DROPS.length})` : `My Templates (${mine.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "drops" && (
            <>
              <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>Numbered boards, each a real situation in the editorial frame. Open one and make it your own: it starts a new board, so nothing you've saved changes.</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {(["All", ...DROP_CATS] as const).map(c => (
                  <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                    style={{ background: cat === c ? PS_VOLT : SURFACE_2, color: cat === c ? "#0a0c0f" : TEXT_MUTED }}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {DROPS.filter(x => cat === "All" || x.cat === cat).map(x => (
                  <div key={x.no} className="rounded-lg border overflow-hidden flex flex-col" style={{ borderColor: DS_BORDER_STRONG, background: SURFACE_2 }}>
                    <DropThumb data={dropPreview(x)} crop={x.crop} />
                    <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: PS_VOLT, letterSpacing: "0.12em", fontFamily: "'Barlow Condensed', sans-serif" }}>
                          DROP {String(x.no).padStart(2, "0")} · {x.cat.toUpperCase()}
                        </span>
                        {(dropPreview(x).steps?.length ?? 0) > 1 && (
                          <span className="ml-auto flex items-center gap-1 px-1.5 rounded text-xs font-semibold" title="This drop is a move: open it and press Play"
                            style={{ background: "rgba(215,255,60,0.14)", color: PS_VOLT, letterSpacing: "0.08em", fontFamily: "'Barlow Condensed', sans-serif" }}>
                            <Play size={9} fill="currentColor" /> {dropPreview(x).steps!.length} STEPS
                          </span>
                        )}
                      </div>
                      <span className="font-semibold leading-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em", fontSize: 16 }}>{x.name}</span>
                      <p className="text-xs flex-1" style={{ color: TEXT_MUTED }}>{x.blurb}</p>
                      <button onClick={() => onLoad({ id: `drop-${x.no}`, name: x.name, data: buildDrop(x), published: false, createdAt: Date.now() })}
                        className="py-1 rounded text-xs font-semibold transition-colors hover:brightness-125" style={{ background: SURFACE_1, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>
                        Use drop
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {tab === "my" && (
            <>
              {/* Save new template */}
              <div className="flex gap-2 mb-4">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Template name..."
                  className="flex-1 rounded px-3 py-1.5 text-sm outline-none"
                  style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER_STRONG}` }}
                  onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { onSave(newName.trim()); setNewName("") } }}
                />
                <button onClick={() => { if (newName.trim()) { onSave(newName.trim()); setNewName("") } }}
                  className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
                  style={{ background: ACCENT_GRADIENT, color: ACCENT_INK }}>
                  Save Current
                </button>
              </div>

              {mine.length === 0 && (
                <p className="text-center py-6 text-sm" style={{ color: TEXT_MUTED }}>No saved templates. Save your current layout above.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {mine.map(t => (
                  <div key={t.id} className="rounded-lg border p-3 flex flex-col gap-2"
                    style={{ borderColor: DS_BORDER_STRONG, background: SURFACE_2 }}>
                    <span className="font-semibold text-sm truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {t.name}
                    </span>
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>
                      {t.data.players.length} players · {t.data.arrows.length} arrows
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      <button onClick={() => onLoad(t)}
                        className="flex-1 py-1 rounded text-xs font-semibold transition-colors hover:brightness-125"
                        style={{ background: SURFACE_1, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>
                        Load
                      </button>
                      <button onClick={() => onDelete(t.id)}
                        className="p-1 rounded transition-colors hover:bg-red-500/20"
                        style={{ color: "#f85149" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── Tactics Board ─────────────────── */
function TacticsBoard() {
  const navigateBoard = useNavigate()

  /* ── Canvas elements ── */
  const [players, setPlayers] = useState<Player[]>([])
  const [arrows, setArrows] = useState<Arrow[]>([])
  const [texts, setTexts] = useState<TextBox[]>([])
  const [shapes, setShapes] = useState<Shape[]>([])
  const [images, setImages] = useState<UploadedImage[]>([])

  /* ── UI state ── */
  const [tool, setTool] = useState<Tool>("select")
  const [shapeKind, setShapeKind] = useState<ShapeKind>("polygon")
  /* ── Multi-selection: source of truth ── */
  const [selection, setSelection] = useState<SelItem[]>([])
  const sel: Sel = selection.length === 1 ? selection[0] : null
  const setSel = useCallback((s: Sel) => setSelection(s ? [s] : []), [])
  const [view3d, setView3d] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [title, setTitle] = useState("Untitled board")
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [bgColor, setBgColor] = useState(DEFAULT_BOARD_SETTINGS.bgColor)
  const [showPitch, setShowPitch] = useState(true)
  const [canvasMode, setCanvasMode] = useState<"full" | "half" | "blank">("full")
  const [pitchColor, setPitchColor] = useState<"green" | "white">("green")
  const [pitchScale, setPitchScale] = useState(1)
  const [pitchOffX, setPitchOffX] = useState(0)
  const [pitchOffY, setPitchOffY] = useState(0)
  const pitchOffXRef = useRef(0)
  const pitchOffYRef = useRef(0)
  const [hoveredPitch, setHoveredPitch] = useState(false)
  const [homeColor, setHomeColor] = useState("#fbbf24")
  const [awayColor, setAwayColor] = useState("#1d4ed8")
  const [homePat, setHomePat] = useState<KitPattern>("solid")
  const [homeC2, setHomeC2] = useState("#fbbf24")
  const [homeNum, setHomeNum] = useState("#000000")
  const [homeName, setHomeName] = useState("")
  const [awayPat, setAwayPat] = useState<KitPattern>("solid")
  const [awayC2, setAwayC2] = useState("#1d4ed8")
  const [awayNum, setAwayNum] = useState("#ffffff")
  const [awayName, setAwayName] = useState("")
  const [labelSize, setLabelSize] = useState<BoardSettings["labelSize"]>("standard")
  const [nameStyle, setNameStyle] = useState<BoardSettings["nameStyle"]>("halo")
  const [tokenStyle, setTokenStyle] = useState<BoardSettings["tokenStyle"]>("classic")
  const [vertical, setVertical] = useState(false)
  const [focus, setFocus] = useState<BoardSettings["focus"]>("board")
  const [focusEnd, setFocusEnd] = useState<BoardSettings["focusEnd"]>("attack")
  const [frameRatio, setFrameRatio] = useState<BoardSettings["frameRatio"]>("auto")
  const [pitchStyle, setPitchStyle] = useState<BoardSettings["pitchStyle"]>("classic")
  const [psMark, setPsMark] = useState(false)
  const [editorial, setEditorial] = useState(false)
  const [kicker, setKicker] = useState("")
  const [homeScore, setHomeScore] = useState(""); const [awayScore, setAwayScore] = useState(""); const [scoreNote, setScoreNote] = useState("")
  const [caption, setCaption] = useState("")
  const [showLegend, setShowLegend] = useState(true); const [cropMarks, setCropMarks] = useState(true); const [showEdition, setShowEdition] = useState(true)
  const [editionNo, setEditionNo] = useState(() => readEdition() + 1) // the number the next export will carry
  const [exportNote, setExportNote] = useState("") // a short word after Copy: "Copied" or why it didn't work
  const [animSpeed, setAnimSpeed] = useState<BoardSettings["animSpeed"]>("normal")
  const [endCard, setEndCard] = useState(true)
  /* ── Steps: a move shown one moment at a time. The step on screen is the live board; the others wait in steps ── */
  const [steps, setSteps] = useState<BoardStep[]>([]) // every step, once there are 2 or more (the one on screen may be out of date in here)
  const [stepIdx, setStepIdx] = useState(0) // the step on screen
  const [play, setPlay] = useState<null | { t: number }>(null) // the moment of the move on screen, while it plays or is being exported
  const [making, setMaking] = useState<null | { fmt: "gif" | "mp4"; done: number }>(null) // a GIF or a video being made
  const [kitEditor, setKitEditor] = useState<Record<"home" | "away", "" | "more" | "own">>({ home: "", away: "" }) // a team's kits: the few, all of them, or your own
  const [namesFor, setNamesFor] = useState<"home" | "away" | null>(null) // the team whose names are open
  const [kitMode, setKitMode] = useState<null | "gk" | "own">(null) // the kit choice open for the selected player
  useEffect(() => { setKitMode(null) }, [sel?.id])
  const [showPlayerLabels, setShowPlayerLabels] = useState(true)
  const [showTemplates, setShowTemplates] = useState(false)
  const [sideTab, setSideTab] = useState<"selected" | "board">("board")
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 900 : true)
  const [boardGroups, setBoardGroups] = useState({ frame: true, teams: true, pitch: false, editorial: false, animation: false })
  const [textLayer, setTextLayer] = useState<"foreground" | "background">("foreground")
  const [homeFormation, setHomeFormation] = useState("")
  const [homeShape, setHomeShape] = useState<TeamShape>("base")
  const [awayFormation, setAwayFormation] = useState("")
  const [awayShape, setAwayShape] = useState<TeamShape>("base")
  const [lineupText, setLineupText] = useState("")
  const [squads, setSquads] = useState<Squad[]>(readSquads)
  const [squadId, setSquadId] = useState("")

  /* ── Auth ── */
  const [authUser, setAuthUser] = useState<import("@supabase/supabase-js").User | null>(null)
  const [showTour, setShowTour] = useState(false)
  const { theme, toggle: toggleTheme } = useTheme()
  const [showMyBoards, setShowMyBoards] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null)

  /* ── Narrative: the written story that goes with the board ── */
  const [narrative, setNarrative] = useState("")
  const [narrativeOpen, setNarrativeOpen] = useState(false)

  /* ── Saving: what's open, what was last saved, and whether a save is running ── */
  const currentBoardIdRef = useRef<string | null>(null) // same as currentBoardId, but readable straight after a save
  const boardEpochRef = useRef(0) // goes up every time a different board is opened or the board is cleared
  const renderEpoch = boardEpochRef.current // the board this render belongs to
  const lastSavedRef = useRef("") // fingerprint of the version last saved or opened
  const loadedUpdatedAtRef = useRef<string | null>(null) // the row's updated_at when we last read or wrote it
  const conflictRef = useRef(false) // the board changed (or was deleted) somewhere else: autosave pauses
  const failedSaveRef = useRef("") // the version that last failed to save; autosave waits for a new change before retrying
  const savePromiseRef = useRef<Promise<boolean> | null>(null)
  const savedPartsRef = useRef<unknown[]>([]) // the pieces the board was made of when last saved or opened
  const unsureRef = useRef<{ title: string; narrative: string; canon: string }[]>([]) // updates that got no answer: they may still have landed
  const copyRef = useRef<Promise<boolean> | null>(null) // a "Save as new board" that's on its way (one copy per click burst)
  const draftKeyRef = useRef<string | null>(null) // where this new board's unsaved draft is kept on this device
  const keepDraftRef = useRef(true) // false once you've chosen to leave a new board without saving it
  const [saveTick, setSaveTick] = useState(0) // bumps after every save so the autosave check runs again
  const [, setSyncTick] = useState(0) // redraws the Save button when the board turns out to match what's saved
  const [noticeHidden, setNoticeHidden] = useState(false) // the save problem notice was closed
  const [draftNotice, setDraftNotice] = useState(false) // "We kept your unsaved board"
  const bindBoard = (id: string | null) => { currentBoardIdRef.current = id; setCurrentBoardId(id) }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Name shown on the account button: display name, else handle (never the email)
  const [accountName, setAccountName] = useState("")
  const [creatorHandle, setCreatorHandle] = useState("") // shown in the watermark, once you've chosen a handle yourself
  const [creatorBrand, setCreatorBrand] = useState<Brand>(DEFAULT_BRAND) // your Creator Card: the crest and look that sign your exports
  const [creatorLogo, setCreatorLogo] = useState<string | null>(null) // your logo as a data address, so exports never wait on the network
  useEffect(() => {
    let off = false
    setCreatorLogo(null)
    if (creatorBrand.logo) logoToDataUrl(creatorBrand.logo).then(d => { if (!off) setCreatorLogo(d) })
    return () => { off = true }
  }, [creatorBrand.logo])
  useEffect(() => {
    if (!authUser) { setAccountName(""); setCreatorHandle(""); setCreatorBrand(DEFAULT_BRAND); return }
    let cancelled = false
    supabase.from("profiles").select("display_name, handle, brand").eq("id", authUser.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const raw = (data as any)?.display_name || (data as any)?.handle || ""
        setAccountName(stripHandleSuffix(raw, authUser.id, authUser.email))
        const handle: string = (data as any)?.handle || ""
        setCreatorHandle(handle && stripHandleSuffix(handle, authUser.id, authUser.email) === handle ? handle : "")
        setCreatorBrand(readBrand((data as any)?.brand))
      })
    return () => { cancelled = true }
  }, [authUser?.id])

  // Opening as Braindump: set by the "/braindump" page before the board mounts
  const entryRef = useRef<"board" | "braindump" | "opened">("board") // how you got here (decides which unsaved draft comes back)
  useEffect(() => {
    if (boardHandoff.braindump) {
      boardHandoff.braindump = false
      entryRef.current = "braindump"
      setWorkspaceMode("brainstorm")
      setCanvasMode("blank")
      setBgColor(DEFAULT_BOARD_SETTINGS.bgColor)
      setShowPitch(false)
      return
    }
  }, [])

  useEffect(() => {
    if (!authUser) return
    try { if (localStorage.getItem(TOUR_KEY)) return } catch { /* no storage: treat as not seen */ }
    if (Date.now() - new Date(authUser.created_at).getTime() < 15 * 60 * 1000) setShowTour(true)
  }, [authUser?.id])

  const [saveError, setSaveError] = useState("")
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const [headerMenu, setHeaderMenu] = useState<null | "export" | "more">(null) // the header menu that's open

  /** Saves the whole board: elements, zones, pitch settings, title and narrative.
   *  forceNew = "Save as new board". auto = the quiet background save (no sign-in prompt, no analytics event).
   *  Resolves true once saved, false if it couldn't be. Never waits longer than saveTimeoutFor() allows. */
  const saveBoard = (forceNew = false, auto = false): Promise<boolean> => {
    if (!authUser) { if (!auto) navigateBoard("/signin"); return Promise.resolve(false) }
    if (renderEpoch !== boardEpochRef.current) return Promise.resolve(false) // left over from a board that's no longer open
    setShowSaveMenu(false)
    if (forceNew && copyRef.current) return copyRef.current // a copy is already on its way
    const running = savePromiseRef.current
    if (running && !forceNew) return running // one save at a time
    // What gets saved is decided now, even when it has to wait for a save that's already running
    const snap: SaveSnap = { epoch: boardEpochRef.current, uid: authUser.id, title, narrative, data: collectBoard() }
    // "Save as new board" waits for the running save, then makes its copy
    const p = running ? running.then(() => startSave(snap, true, auto)) : startSave(snap, forceNew, auto)
    if (forceNew) {
      copyRef.current = p
      const clear = () => { if (copyRef.current === p) copyRef.current = null }
      p.then(clear, clear)
    }
    return p
  }
  /** Runs one save and keeps track of it until it's finished. */
  const startSave = (snap: SaveSnap, forceNew: boolean, auto: boolean): Promise<boolean> => {
    const target = forceNew ? null : currentBoardIdRef.current // the saved board this writes to (none for a first save or a copy)
    const p: Promise<boolean> = runSave(snap, forceNew, auto)
      .catch(err => {
        console.error("Save board error:", err)
        if (snap.epoch === boardEpochRef.current) { setSaveError("Couldn't save your latest changes."); setSaveStatus("error") }
        return false
      })
      .finally(() => {
        if (savePromiseRef.current === p) savePromiseRef.current = null
        savesInFlight.delete(p)
        if (target && boardSavesInFlight.get(target) === p) boardSavesInFlight.delete(target)
        setSaveTick(t => t + 1)
      })
    savePromiseRef.current = p
    savesInFlight.add(p)
    if (target) boardSavesInFlight.set(target, p)
    return p
  }
  const runSave = async (snap: SaveSnap, forceNew: boolean, auto: boolean): Promise<boolean> => {
    const { epoch, uid, title: t, narrative: n, data } = snap
    const here = () => epoch === boardEpochRef.current // is this still the board on screen?
    const savedAs = boardFingerprint(t, n, data)
    const ms = saveTimeoutFor(savedAs.length) // boards with photos get longer
    const row = { title: t, canvas_data: data, narrative: n }
    if (here()) { setSaveStatus("saving"); setSaveError(""); setNoticeHidden(false) }
    const boardId = forceNew ? null : currentBoardIdRef.current
    let newId: string | null = null
    let failed = false
    let conflict = false
    let newUpdatedAt: string | null = null
    let slowUpdate: Promise<any> | null = null // an update we stopped waiting for (it's left to finish)
    if (boardId) {
      // Only overwrite the version we last read or wrote. If it changed somewhere else (another tab or device)
      // or was deleted, nothing is overwritten and we say so.
      // A slow update is left to finish even after we stop waiting: it only lands if nothing newer was saved first.
      const id = boardId
      const update = (after: string | null): Promise<any> => {
        let q = (supabase as any).from("boards")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", uid)
        if (after) q = q.eq("updated_at", after)
        return Promise.resolve(q.select("updated_at"))
      }
      let request = update(loadedUpdatedAtRef.current)
      let res = await withTimeout(() => request, ms, false)
      if (res && !res.error && !res.data?.length && unsureRef.current.length) {
        // Nothing matched. If that's because an earlier save of ours landed after all (its answer was lost), carry on from it.
        const landed = await ourEarlierSave(id, ms)
        if (landed) { request = update(landed); res = await withTimeout(() => request, ms, false) }
      }
      if (!res) slowUpdate = request
      if (!res || res.error) { failed = true; console.error("Save board error:", res ? res.error.message : "no answer yet") }
      else if (!res.data?.length) conflict = true
      else newUpdatedAt = res.data[0].updated_at ?? null
    } else {
      const res = await withTimeout<any>(signal => (supabase as any).from("boards")
        .insert({ user_id: uid, ...row })
        .select("id, updated_at")
        .abortSignal(signal)
        .single(), ms)
      if (!res || res.error) { failed = true; console.error("Save board error:", res ? res.error.message : "no answer") }
      else { newId = res.data?.id ?? null; newUpdatedAt = res.data?.updated_at ?? null }
    }
    // Another board was opened (or the board was cleared) while this save ran: the save itself is done,
    // but it must not touch the board that's open now.
    if (!here()) return !failed && !conflict
    if (failed) {
      failedSaveRef.current = savedAs
      setSaveError("Couldn't save your latest changes.")
      setSaveStatus("error")
      if (!boardId) return false
      // An update may still have landed: remember it, so the next save can tell our own change from someone else's
      const attempt = { title: t, narrative: n, canon: canonicalJson(data) }
      unsureRef.current = [...unsureRef.current.slice(-3), attempt]
      // An update that was only slow: if it lands after all, and nothing else has saved since, the board counts as saved
      slowUpdate?.then(late => {
        if (!late || late.error || !late.data?.length) return
        if (!here() || savePromiseRef.current || !unsureRef.current.includes(attempt)) return
        loadedUpdatedAtRef.current = late.data[0].updated_at ?? null
        conflictRef.current = false
        failedSaveRef.current = ""
        unsureRef.current = []
        lastSavedRef.current = savedAs
        savedPartsRef.current = boardParts(t, n, data)
        setSaveStatus("idle"); setSaveError(""); setSaveTick(x => x + 1)
      }, () => { /* never landed */ })
      return false
    }
    if (conflict) {
      conflictRef.current = true
      setSaveError("This board was changed somewhere else.")
      setSaveStatus("error")
      return false
    }
    if (newId) { bindBoard(newId); removeDraft(); setDraftNotice(false) }
    loadedUpdatedAtRef.current = newUpdatedAt
    conflictRef.current = false
    failedSaveRef.current = ""
    unsureRef.current = []
    lastSavedRef.current = savedAs
    savedPartsRef.current = boardParts(t, n, data)
    setSaveStatus("idle")
    if (!auto) (window as any).posthog?.capture("board_saved")
    return true
  }
  /** A save matched nothing: was that because one of our own earlier saves to this board landed after all? Gives its updated_at if so. */
  const ourEarlierSave = async (boardId: string, ms: number): Promise<string | null> => {
    const res = await withTimeout<any>(signal => (supabase as any).from("boards")
      .select("updated_at, title, narrative, canvas_data").eq("id", boardId).abortSignal(signal).maybeSingle(), ms)
    const row = res && !res.error ? res.data : null
    if (!row) return null
    const canon = canonicalJson(row.canvas_data)
    const ours = unsureRef.current.some(u => u.title === row.title && u.narrative === (row.narrative ?? "") && u.canon === canon)
    return ours ? row.updated_at ?? null : null
  }
  const removeDraft = () => {
    if (!draftKeyRef.current) return
    try { localStorage.removeItem(draftKeyRef.current) } catch { /* storage blocked */ }
    draftKeyRef.current = null
  }
  const saveBoardRef = useRef(saveBoard)
  saveBoardRef.current = saveBoard

  /* ── Templates ── */
  const [templates, setTemplates] = useState<Template[]>(() => {
    try { return JSON.parse(localStorage.getItem("tactics-templates") || "[]") }
    catch { return [] }
  })
  const saveTemplates = (t: Template[]) => {
    setTemplates(t)
    try { localStorage.setItem("tactics-templates", JSON.stringify(t)) }
    catch { console.warn("Templates couldn't be kept on this device: browser storage is full") }
  }

  /* ── Workspace mode ── */
  const [workspaceMode, setWorkspaceMode] = useState<"tactics" | "brainstorm">("tactics")

  /* ── Zone overlays ── */
  const [show18Zones, setShow18Zones] = useState(false)
  const [pitchVisible, setPitchVisible] = useState(true)
  const [showLanes, setShowLanes] = useState(false)
  const [customZones, setCustomZones] = useState<CustomZone[]>([])
  const [zoneColor, setZoneColor] = useState("#4ade80")
  const [zoneOpacity, setZoneOpacity] = useState(0.25)
  const zoneColorRef = useRef("#3fb950")
  const zoneOpacityRef = useRef(0.25)
  useEffect(() => { zoneColorRef.current = zoneColor }, [zoneColor])
  useEffect(() => { zoneOpacityRef.current = zoneOpacity }, [zoneOpacity])
  const zoneDrawRef = useRef<{ x: number; y: number } | null>(null)
  const [zoneDraft, setZoneDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  // Keep a ref to pitchScale so mouse handlers always read the latest value
  const pitchScaleRef = useRef(1)
  useEffect(() => { pitchScaleRef.current = pitchScale }, [pitchScale])
  useEffect(() => { pitchOffXRef.current = pitchOffX }, [pitchOffX])
  useEffect(() => { pitchOffYRef.current = pitchOffY }, [pitchOffY])
  /** Every step as it is now: the one on screen from the live board, and names and kits the same in all of them. Empty for a board without steps. */
  const stepList = useMemo(() => {
    if (steps.length < 2) return [] as BoardStep[]
    const live = new Map(players.map(p => [p.id, p]))
    return steps.map((f, i) => (i === stepIdx ? { players, arrows, texts, shapes, customZones, note: f.note } : syncIdentity(f, live)))
  }, [steps, stepIdx, players, arrows, texts, shapes, customZones])
  /** The move, timed: each step held, then played into the next, then the end card */
  const timeline = useMemo(() => (stepList.length > 1 ? makeTimeline(stepList, animSpeed, endCard) : null), [stepList, animSpeed, endCard])

  /* ── Whole-board save and restore ── */
  /** Everything about the board right now, in the format it's saved in. */
  const collectBoard = (): BoardData => ({
    v: 2,
    players, arrows, texts, shapes, images, customZones,
    settings: settingsFrom({
      workspaceMode, canvasMode, showPitch, pitchColor, bgColor, pitchScale, pitchOffX, pitchOffY,
      view3d, rotation, homeColor, awayColor, showPlayerLabels, textLayer, showLanes, show18Zones, pitchVisible,
      homePat, homeC2, homeNum, homeName, awayPat, awayC2, awayNum, awayName, labelSize, nameStyle, tokenStyle,
      vertical, focus, focusEnd, frameRatio, homeFormation, homeShape, awayFormation, awayShape,
      pitchStyle, psMark, editorial, kicker, homeScore, awayScore, scoreNote, caption, showLegend, cropMarks, showEdition, animSpeed, endCard,
    }),
    ...(stepList.length > 1 ? { steps: stepList, step: stepIdx } : {}),
  })
  /** Puts a saved board's elements, zones and settings back on screen. */
  const applyBoardData = (d: BoardData) => {
    setPlayers(d.players); setArrows(d.arrows); setTexts(d.texts); setShapes(d.shapes); setImages(d.images)
    setCustomZones(d.customZones)
    const st = d.settings
    setWorkspaceMode(st.workspaceMode); setCanvasMode(st.canvasMode); setShowPitch(st.showPitch)
    setPitchColor(st.pitchColor); setBgColor(st.bgColor)
    setPitchScale(st.pitchScale); setPitchOffX(st.pitchOffX); setPitchOffY(st.pitchOffY)
    setView3d(st.view3d); setRotation(st.rotation)
    setHomeColor(st.homeColor); setAwayColor(st.awayColor)
    setShowPlayerLabels(st.showPlayerLabels); setTextLayer(st.textLayer)
    setShowLanes(st.showLanes); setShow18Zones(st.show18Zones); setPitchVisible(st.pitchVisible)
    setHomePat(st.homePat); setHomeC2(st.homeC2); setHomeNum(st.homeNum); setHomeName(st.homeName)
    setAwayPat(st.awayPat); setAwayC2(st.awayC2); setAwayNum(st.awayNum); setAwayName(st.awayName)
    setLabelSize(st.labelSize); setNameStyle(st.nameStyle); setTokenStyle(st.tokenStyle)
    setVertical(st.vertical); setFocus(st.focus); setFocusEnd(st.focusEnd); setFrameRatio(st.frameRatio)
    setHomeFormation(st.homeFormation); setHomeShape(st.homeShape); setAwayFormation(st.awayFormation); setAwayShape(st.awayShape)
    setPitchStyle(st.pitchStyle); setPsMark(st.psMark); setEditorial(st.editorial); setKicker(st.kicker)
    setHomeScore(st.homeScore); setAwayScore(st.awayScore); setScoreNote(st.scoreNote); setCaption(st.caption)
    setShowLegend(st.showLegend); setCropMarks(st.cropMarks); setShowEdition(st.showEdition)
    setAnimSpeed(st.animSpeed); setEndCard(st.endCard)
    setSteps(d.steps ?? []); setStepIdx(d.step ?? 0)
  }
  /** Opens a board exactly as it was saved. Older boards get today's defaults for anything they didn't store.
   *  boardId = null starts a new, unsaved board (used for templates). */
  const openBoard = (raw: unknown, boardTitle: string | null, boardId: string | null, boardNarrative: string | null, boardUpdatedAt: string | null) => {
    const d = normalizeBoardData(raw)
    const t = boardTitle || "Untitled board"
    const n = boardNarrative ?? ""
    boardEpochRef.current += 1 // anything still saving belongs to the previous board
    histRef.current = []; histIdx.current = -1; editRef.current = null // undo can't bring back another board's content
    applyBoardData(d)
    setTitle(t); setNarrative(n); setNarrativeOpen(false)
    setSelection([])
    bindBoard(boardId)
    loadedUpdatedAtRef.current = boardUpdatedAt
    conflictRef.current = false
    failedSaveRef.current = ""
    unsureRef.current = []
    keepDraftRef.current = true
    lastSavedRef.current = boardFingerprint(t, n, d)
    savedPartsRef.current = boardParts(t, n, d)
    setSaveStatus("idle"); setSaveError(""); setDraftNotice(false)
  }
  const boardIsEmpty = () =>
    players.length + arrows.length + texts.length + shapes.length + images.length + customZones.length === 0 && !narrative.trim()
  /** True when leaving now would lose work: a saved board with newer changes, or a new board you've added to. */
  const hasUnsavedWork = () =>
    (currentBoardIdRef.current !== null || !boardIsEmpty()) && boardFingerprint(title, narrative, collectBoard()) !== lastSavedRef.current
  const hasUnsavedWorkRef = useRef(hasUnsavedWork)
  hasUnsavedWorkRef.current = hasUnsavedWork
  // The Save button only says "Saved" when nothing has changed since the last save
  const changedSinceSave = !sameParts(boardParts(title, narrative, collectBoard()), savedPartsRef.current)
  const savedNow = !!currentBoardId && !changedSinceSave // nothing new to save
  /** Keeps an unsaved new board on this device, and removes that copy once it's saved, emptied or thrown away. */
  const writeDraft = () => {
    if (!authUser) return
    try {
      if (!currentBoardIdRef.current && keepDraftRef.current && hasUnsavedWork()) {
        const key = draftKey(authUser.id, workspaceMode)
        const json = JSON.stringify({ title, narrative, data: collectBoard() })
        if (json.length > DRAFT_MAX_CHARS) return // too big to keep on this device (photos): the last smaller copy stays
        localStorage.setItem(key, json)
        if (draftKeyRef.current && draftKeyRef.current !== key) localStorage.removeItem(draftKeyRef.current)
        draftKeyRef.current = key
      } else removeDraft()
    } catch { /* storage full or blocked: the board itself is still on screen */ }
  }
  const flushSaveRef = useRef(() => {})
  flushSaveRef.current = () => {
    writeDraft()
    if (currentBoardIdRef.current && authUser && !conflictRef.current && hasUnsavedWork()) void saveBoard(false, true)
  }

  // Autosave: a board that's already saved saves itself after you stop editing
  // (1.5 s, or 6 s when it has images, because those make every save bigger). New boards are kept on this device until you save them.
  useEffect(() => {
    const timer = setTimeout(() => {
      writeDraft()
      if (!currentBoardIdRef.current) return
      const data = collectBoard()
      const now = boardFingerprint(title, narrative, data)
      if (now === lastSavedRef.current) {
        // Back to exactly what's saved (after an undo, say): the button can say "Saved" again
        const parts = boardParts(title, narrative, data)
        if (!sameParts(parts, savedPartsRef.current)) { savedPartsRef.current = parts; setSyncTick(t => t + 1) }
        return
      }
      if (authUser && !savePromiseRef.current && !conflictRef.current && now !== failedSaveRef.current) void saveBoard(false, true)
    }, images.length ? 6000 : 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, narrative, players, arrows, texts, shapes, images, customZones, workspaceMode, canvasMode, showPitch,
      pitchColor, bgColor, pitchScale, pitchOffX, pitchOffY, view3d, rotation, homeColor, awayColor,
      showPlayerLabels, textLayer, showLanes, show18Zones, pitchVisible, homePat, homeC2, homeNum, homeName, awayPat, awayC2, awayNum, awayName,
      labelSize, nameStyle, tokenStyle, vertical, focus, focusEnd, frameRatio, homeFormation, homeShape, awayFormation, awayShape,
      pitchStyle, psMark, editorial, kicker, homeScore, awayScore, scoreNote, caption, showLegend, cropMarks, showEdition, animSpeed, endCard, steps, stepIdx,
      currentBoardId, authUser, saveTick])

  // "/board?open=ID": Home's "Continue" opens that saved board
  const openParam = new URLSearchParams(useLocation().search).get("open")
  const openParamDone = useRef(false)
  useEffect(() => {
    if (!authUser || !openParam || openParamDone.current) return
    openParamDone.current = true
    entryRef.current = "opened"
    waitForBoardSave(openParam).then(async () => {
      const { data } = await supabase.from("boards").select("canvas_data, title, narrative, updated_at").eq("id", openParam).eq("user_id", authUser.id).maybeSingle()
      if (data) openBoard((data as any).canvas_data, (data as any).title, openParam, (data as any).narrative ?? null, (data as any).updated_at ?? null)
      window.history.replaceState(null, "", "/board") // the address goes back to plain /board (no remount)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id])

  // Opening a fresh board: bring back the unsaved board from last time, if there is one
  const restoreCheckedRef = useRef(false)
  useEffect(() => {
    if (!authUser || restoreCheckedRef.current) return
    restoreCheckedRef.current = true
    const key = draftKey(authUser.id, entryRef.current === "braindump" ? "brainstorm" : "tactics")
    // A save from the board you just left may still be on its way (if it lands, that board is saved and its draft is gone)
    waitForSaves(8000).then(() => {
      if (entryRef.current === "opened" || boardEpochRef.current !== 0 || hasUnsavedWorkRef.current()) return
      const draft = readDraft(key)
      if (!draft) return
      openBoard(draft.data, draft.title, null, draft.narrative, null)
      lastSavedRef.current = "" // still not saved
      draftKeyRef.current = key
      setDraftNotice(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id])
  useEffect(() => {
    if (!draftNotice) return
    const t = setTimeout(() => setDraftNotice(false), 10000)
    return () => clearTimeout(t)
  }, [draftNotice])
  /** "Discard" on the restored-board notice: throw the draft away and start with an empty board */
  const discardDraft = () => {
    removeDraft()
    openBoard(workspaceMode === "brainstorm" ? { settings: { workspaceMode: "brainstorm", canvasMode: "blank", bgColor: DEFAULT_BOARD_SETTINGS.bgColor, showPitch: false } } : null, null, null, null, null)
  }

  // Closing or reloading the tab with unsaved work: the browser asks first.
  // Switching to another app on a phone: save straight away, because phones can close tabs without asking.
  // Leaving the board inside the app (for example the browser's Back button): save the last changes on the way out.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWorkRef.current()) { e.preventDefault(); e.returnValue = "" }
    }
    const onHide = () => { if (document.visibilityState === "hidden") flushSaveRef.current() }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("visibilitychange", onHide)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("visibilitychange", onHide)
      flushSaveRef.current()
    }
  }, [])

  /* ── Leaving the board (hub, sign out, opening another board or a template) ── */
  const leaveResolveRef = useRef<((answer: "leave" | "stay" | "save") => void) | null>(null)
  const [leaveAsk, setLeaveAsk] = useState<null | LeaveReason>(null)
  const askLeave = (reason: LeaveReason) => new Promise<"leave" | "stay" | "save">(resolve => {
    leaveResolveRef.current = resolve
    setLeaveAsk(reason)
  })
  const answerLeave = (answer: "leave" | "stay" | "save") => {
    leaveResolveRef.current?.(answer)
    leaveResolveRef.current = null
    setLeaveAsk(null)
  }
  /** Waits for a save to finish. If it takes more than a second, "Saving your changes…" appears, so you can still leave or stay. */
  const waitForSave = async (p: Promise<boolean>): Promise<"saved" | "failed" | "leave" | "stay"> => {
    const done = p.then(ok => (ok ? "saved" : "failed") as "saved" | "failed")
    const first = await Promise.race([done, new Promise<"slow">(r => setTimeout(() => r("slow"), 1000))])
    if (first !== "slow") return first
    const answer = await Promise.race([askLeave("saving"), done])
    if (answer === "saved" || answer === "failed") answerLeave("stay") // the save finished first: close the dialog and carry on
    return answer === "save" ? "stay" : answer
  }
  /** Saved boards save their last changes first; new boards you've added to ask first. Resolves true when it's fine to leave. */
  const confirmLeave = async (): Promise<boolean> => {
    let quietTries = 0 // a saved board retries quietly (twice at most) before asking
    let lastFailed = false
    for (;;) {
      const running = savePromiseRef.current
      if (running) {
        const r = await waitForSave(running)
        if (r === "leave") return true
        if (r === "stay") return false
        lastFailed = r === "failed"
        continue // look again: a copy may have been waiting for that save
      }
      if (!hasUnsavedWorkRef.current()) return true
      if (currentBoardIdRef.current && !conflictRef.current && quietTries < 2) {
        quietTries++
        void saveBoardRef.current(false, true)
        if (savePromiseRef.current) continue // it's running: wait for it above
      }
      const answer = await askLeave(conflictRef.current ? "conflict" : currentBoardIdRef.current || lastFailed ? "failed" : "new")
      if (answer === "stay") return false
      if (answer === "leave") { keepDraftRef.current = false; return true }
      quietTries = 2 // you pressed Save: if it fails, ask again rather than retrying quietly
      void saveBoardRef.current(conflictRef.current, false) // a board changed elsewhere is kept as a new copy
      if (!savePromiseRef.current) return false
    }
  }

  /* ── isSel: true if the given id is in the selection ── */
  const isSel = useCallback((id: string) => selection.some(s => s.id === id), [selection])

  /* ── Moving, box-select, the right-click menu and locked pieces ── */
  // Moving the selection: where the press started and where everything selected was at that moment
  const moveRef = useRef<null | { x: number; y: number; sx: number; sy: number; live: boolean; item: SelItem; keep: boolean; base: MoveBase }>(null)
  // Box-select: press on an empty part of the board and drag
  const marqueeRef = useRef<null | { x: number; y: number; sx: number; sy: number; add: boolean }>(null)
  const [marquee, setMarquee] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null)
  // Right-click menu: acts on the selection, or offers Unlock for a locked piece
  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number; lockedItem: SelItem | null }>(null)
  const menuActionsRef = useRef({ duplicate: () => {}, copy: () => {} })
  // Pressing on a locked piece explains why nothing happens
  const [lockHint, setLockHint] = useState(false)
  const lockHintTimer = useRef(0)
  const flashLockHint = () => { setLockHint(true); window.clearTimeout(lockHintTimer.current); lockHintTimer.current = window.setTimeout(() => setLockHint(false), 2500) }
  /** Moves pieces by (dx, dy) from where they were in `base`. Zones live in pitch coordinates, so they move by the pitch's scale.
   *  Only uses setters and refs, so it's safe to call from any handler. */
  const moveBy = (base: MoveBase, dx: number, dy: number) => {
    const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(v => [v.id, v]))
    const P = byId(base.players), A = byId(base.arrows), Tx = byId(base.texts), S = byId(base.shapes), I = byId(base.images), Z = byId(base.zones)
    const { x: zdx, y: zdy } = pitchDelta(geoRef.current, dx, dy)
    if (P.size) setPlayers(list => list.map(p => { const o = P.get(p.id); return o ? { ...p, x: o.x + dx, y: o.y + dy } : p }))
    if (A.size) setArrows(list => list.map(a => { const o = A.get(a.id); return o ? { ...a, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy, cpx: o.cpx + dx, cpy: o.cpy + dy, fromId: o.fromId && P.has(o.fromId) ? o.fromId : undefined, toId: o.toId && P.has(o.toId) ? o.toId : undefined } : a }))
    if (Tx.size) setTexts(list => list.map(t => { const o = Tx.get(t.id); return o ? { ...t, x: o.x + dx, y: o.y + dy } : t }))
    if (S.size) setShapes(list => list.map(sh => { const o = S.get(sh.id); return o ? { ...sh, x: o.x + dx, y: o.y + dy, pts: o.pts.map(([px, py]) => [px + dx, py + dy] as [number, number]) } : sh }))
    if (I.size) setImages(list => list.map(im => { const o = I.get(im.id); return o ? { ...im, x: o.x + dx, y: o.y + dy } : im }))
    if (Z.size) setCustomZones(list => list.map(z => { const o = Z.get(z.id); return o ? { ...z, x: o.x + zdx, y: o.y + zdy } : z }))
  }
  /** Shifts the selected pieces by (dx, dy) from wherever they are right now (arrow keys, so fast key repeats never get lost). */
  const nudge = (items: SelItem[], dx: number, dy: number) => {
    const ids = new Set(items.map(s => s.id)), has = (k: SelItem["kind"]) => items.some(s => s.kind === k)
    const on = (v: { id: string; locked?: boolean }) => ids.has(v.id) && !v.locked
    const { x: zdx, y: zdy } = pitchDelta(geoRef.current, dx, dy)
    if (has("player")) setPlayers(l => l.map(p => on(p) ? { ...p, x: p.x + dx, y: p.y + dy } : p))
    if (has("arrow")) setArrows(l => l.map(a => on(a) ? { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy, cpx: a.cpx + dx, cpy: a.cpy + dy, fromId: a.fromId && ids.has(a.fromId) ? a.fromId : undefined, toId: a.toId && ids.has(a.toId) ? a.toId : undefined } : a))
    if (has("text")) setTexts(l => l.map(t => on(t) ? { ...t, x: t.x + dx, y: t.y + dy } : t))
    if (has("shape")) setShapes(l => l.map(sh => on(sh) ? { ...sh, x: sh.x + dx, y: sh.y + dy, pts: sh.pts.map(([px, py]) => [px + dx, py + dy] as [number, number]) } : sh))
    if (has("image")) setImages(l => l.map(im => on(im) ? { ...im, x: im.x + dx, y: im.y + dy } : im))
    if (has("zone")) setCustomZones(l => l.map(z => on(z) ? { ...z, x: z.x + zdx, y: z.y + zdy } : z))
  }
  /** The selected pieces as they are now (locked ones never move). */
  const selectedBase = (items: SelItem[]): MoveBase => {
    const ids = new Set(items.map(s => s.id))
    return {
      players: players.filter(p => ids.has(p.id) && !p.locked), arrows: arrows.filter(a => ids.has(a.id) && !a.locked),
      texts: texts.filter(t => ids.has(t.id) && !t.locked), shapes: shapes.filter(sh => ids.has(sh.id) && !sh.locked),
      images: images.filter(im => ids.has(im.id) && !im.locked), zones: customZones.filter(z => ids.has(z.id) && !z.locked),
    }
  }

  /* ── Clipboard for copy/paste ── */
  type ClipSnap = { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[]; zones: CustomZone[] }
  const clipboardRef = useRef<ClipSnap | null>(null)

  /* ── Auto-switch panel tab when selection changes empty↔non-empty ── */
  const prevSelEmptyRef = useRef<boolean>(true)
  useEffect(() => {
    const wasEmpty = prevSelEmptyRef.current
    const isEmpty = selection.length === 0
    if (wasEmpty && !isEmpty) {
      setSideTab("selected")
    } else if (!wasEmpty && isEmpty) {
      setSideTab("board")
    }
    prevSelEmptyRef.current = isEmpty
  }, [selection])

  /* ── Drawing drafts ── */
  const [arrowDefaultDash, setArrowDefaultDash] = useState<"none" | "dashed" | "dotted">("none")
  const [arrowDefaultColor, setArrowDefaultColor] = useState("#ffffff")
  const [arrowDefaultW, setArrowDefaultW] = useState(3)
  const [arrowDraft, setArrowDraft] = useState<{ x1: number; y1: number; fromId?: string } | null>(null)
  const [arrowDefaultKind, setArrowDefaultKind] = useState<LineKind>("pass")
  const [arrowNumbering, setArrowNumbering] = useState(false) // each new line gets the next step number
  const [polyDraft, setPolyDraft] = useState<[number, number][] | null>(null)
  const shapeDrawRef = useRef<{ x1: number; y1: number } | null>(null)
  const [shapeDraftPreview, setShapeDraftPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const drawingRef = useRef(false)

  /* ── Refs ── */
  const svgRef = useRef<SVGSVGElement>(null)
  const pitchRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasDraggedRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })

  /* ── Drag refs ── */
  const dragRef = useRef<{
    kind: "move" | "player" | "text" | "image" | "arrowCp" | "arrowP1" | "arrowP2" | "resizeShape" | "resizeText" | "resizeImage" | "resizePlayer" | "resizePitch" | "zone" | "movePitch"
    id: string; ox: number; oy: number
  } | null>(null)
  const panDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const dragStartedRef = useRef(false) // the current drag has already marked its undo point

  /* ── History ── */
  // Each entry is the whole board just before one change (pieces and board settings), so one undo takes back exactly one action
  type Snap = BoardData
  const histRef = useRef<Snap[]>([])
  const histIdx = useRef(-1)
  const editRef = useRef<{ key: string; at: number } | null>(null) // a change still in progress (typing, a slider): it stays one step
  const boardNowRef = useRef(collectBoard)
  boardNowRef.current = collectBoard
  const copySnap = (d: BoardData): Snap => ({
    ...d,
    players: d.players.map(x => ({ ...x })), arrows: d.arrows.map(x => ({ ...x })), texts: d.texts.map(x => ({ ...x })),
    shapes: d.shapes.map(x => ({ ...x, pts: [...x.pts] })), images: d.images.map(x => ({ ...x })),
    customZones: d.customZones.map(x => ({ ...x })), settings: { ...d.settings },
    ...(d.steps ? { steps: d.steps.map(f => ({ ...f, players: f.players.map(x => ({ ...x })), arrows: f.arrows.map(x => ({ ...x })), texts: f.texts.map(x => ({ ...x })), shapes: f.shapes.map(x => ({ ...x, pts: [...x.pts] })), customZones: f.customZones.map(x => ({ ...x })) })) } : {}),
  })
  /** Call just before changing the board, so undo can come back to this point.
   *  Changes with the same key less than a second apart (typing a name, dragging a slider) count as one step. */
  const undoPoint = (key?: string) => {
    const now = Date.now(), last = editRef.current
    if (key && last && last.key === key && now - last.at < 1000) { last.at = now; return }
    histRef.current = histRef.current.slice(0, histIdx.current + 1)
    histRef.current.push(copySnap(boardNowRef.current()))
    if (histRef.current.length > 100) histRef.current.shift() // undo goes back 100 steps, so a long session doesn't keep growing
    histIdx.current = histRef.current.length - 1
    editRef.current = key ? { key, at: now } : null
  }
  const undoPointRef = useRef(undoPoint)
  undoPointRef.current = undoPoint
  const snapshot = useCallback(() => undoPointRef.current(), [players, arrows, texts, shapes, images, customZones])
  // Undo and redo leave the view alone (rotation, 3D) and the default layer for new text
  const restoreSnap = (s: Snap) => applyBoardData(copySnap({ ...s, settings: { ...s.settings, view3d, rotation, textLayer } }))

  const undo = () => {
    if (histIdx.current < 0) return
    const live = copySnap(boardNowRef.current())
    const target = histRef.current[histIdx.current]
    const redoIdx = histIdx.current + 1
    if (redoIdx < histRef.current.length) {
      histRef.current[redoIdx] = live
    } else {
      histRef.current.push(live)
    }
    histIdx.current--
    editRef.current = null
    restoreSnap(target); setSelection([])
  }
  const redo = () => {
    if (histIdx.current + 2 >= histRef.current.length) return
    histIdx.current++
    editRef.current = null
    restoreSnap(histRef.current[histIdx.current + 1])
  }

  /* ── SVG coordinate helper (handles all CSS transforms) ── */
  const svgXY = useCallback((e: React.PointerEvent | PointerEvent) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    try {
      const ctm = svg.getScreenCTM()
      if (!ctm) return { x: 0, y: 0 }
      const pt = svg.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      return pt.matrixTransform(ctm.inverse())
    } catch {
      return { x: 0, y: 0 }
    }
  }, [])

  /* ── Zoom ── */
  // The board fits the space it has (smaller laptops, the narrative opening) until you zoom or pan yourself
  const userViewRef = useRef(false)
  const fitZoom = () => {
    const box = canvasRef.current?.getBoundingClientRect()
    if (!box || !box.width || !box.height) return 1
    // the canvas is shown 980 × 630 at 100%; never zoom in past that, and keep a small gap around it
    return Math.max(0.2, Math.min(1, (box.width - 24) / dispRef.current.w, (box.height - 24) / dispRef.current.h))
  }
  useEffect(() => {
    const el = canvasRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const fit = () => { if (!userViewRef.current) { setZoom(fitZoom()); setPanX(0); setPanY(0) } }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const applyZoom = useCallback((delta: number, cx?: number, cy?: number) => {
    userViewRef.current = true
    setZoom(z => {
      const nz = Math.min(6, Math.max(0.2, z * delta))
      if (cx !== undefined && cy !== undefined) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) {
          const mx = cx - rect.left - rect.width / 2
          const my = cy - rect.top - rect.height / 2
          setPanX(px => mx - (mx - px) * (nz / z))
          setPanY(py => my - (my - py) * (nz / z))
        }
      }
      return nz
    })
  }, [])

  const fitToView = () => { userViewRef.current = false; setZoom(fitZoom()); setPanX(0); setPanY(0) }

  /* ── Mouse wheel zoom ── */
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 1.12 : 0.89
      applyZoom(delta, e.clientX, e.clientY)
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [applyZoom])

  /* ── Global mouseup for shape draw (catches mouseup outside SVG) ── */
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (shapeDrawRef.current && shapeDraftPreview && shapeKind !== "polygon") {
        const { x1, y1, x2, y2 } = shapeDraftPreview
        const bx = Math.min(x1, x2), by = Math.min(y1, y2)
        const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1)
        if (bw > 5 && bh > 5) {
          snapshot()
          const newS: Shape = {
            id: uid(), kind: shapeKind, pts: [], closed: true,
            x: bx, y: by, w: bw, h: bh,
            fill: SHAPE_FILLS[shapes.length % SHAPE_FILLS.length],
            fillOpacity: 0.35, stroke: "#fbbf24", strokeW: 2, strokeDash: false, label: ""
          }
          setShapes(s => [...s, newS])
          setSel({ kind: "shape", id: newS.id })
        }
        shapeDrawRef.current = null
        setShapeDraftPreview(null)
      }
    }
    window.addEventListener("pointerup", handleGlobalMouseUp)
    return () => window.removeEventListener("pointerup", handleGlobalMouseUp)
  }, [shapeDraftPreview, shapeKind, shapes.length, snapshot])

  /* ── Global mouseup for zone draw ── */
  useEffect(() => {
    const handleZoneMouseUp = () => {
      if (zoneDrawRef.current && zoneDraft) {
        const bx = Math.min(zoneDraft.x1, zoneDraft.x2)
        const by = Math.min(zoneDraft.y1, zoneDraft.y2)
        const bw = Math.abs(zoneDraft.x2 - zoneDraft.x1)
        const bh = Math.abs(zoneDraft.y2 - zoneDraft.y1)
        if (bw > 8 && bh > 8) {
          const newZ: CustomZone = {
            id: uid(),
            x: Math.max(0, bx), y: Math.max(0, by),
            w: Math.min(bw, PW - Math.max(0, bx)),
            h: Math.min(bh, PH - Math.max(0, by)),
            color: zoneColorRef.current,
            opacity: zoneOpacityRef.current,
            label: "",
          }
          undoPointRef.current()
          setCustomZones(z => [...z, newZ])
          setSel({ kind: "zone", id: newZ.id })
        }
        zoneDrawRef.current = null
        setZoneDraft(null)
      }
    }
    window.addEventListener("pointerup", handleZoneMouseUp)
    return () => window.removeEventListener("pointerup", handleZoneMouseUp)
  }, [zoneDraft])

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const del = () => {
      if (selection.length === 0) return
      snapshot()
      const pIds = new Set(selection.filter(s => s.kind === "player").map(s => s.id))
      const aIds = new Set(selection.filter(s => s.kind === "arrow").map(s => s.id))
      const tIds = new Set(selection.filter(s => s.kind === "text").map(s => s.id))
      const sIds = new Set(selection.filter(s => s.kind === "shape").map(s => s.id))
      const iIds = new Set(selection.filter(s => s.kind === "image").map(s => s.id))
      const zIds = new Set(selection.filter(s => s.kind === "zone").map(s => s.id))
      if (pIds.size > 0) setPlayers(p => p.filter(x => !pIds.has(x.id)))
      if (aIds.size > 0) setArrows(a => a.filter(x => !aIds.has(x.id)))
      if (tIds.size > 0) setTexts(t => t.filter(x => !tIds.has(x.id)))
      if (sIds.size > 0) setShapes(sh => sh.filter(x => !sIds.has(x.id)))
      if (iIds.size > 0) setImages(i => i.filter(x => !iIds.has(x.id)))
      if (zIds.size > 0) setCustomZones(z => z.filter(x => !zIds.has(x.id)))
      setSelection([])
    }
    const sw = (t: Tool) => { setTool(t); setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null; setShapeDraftPreview(null) }

    const buildDuplicates = (src: SelItem[], dx: number, dy: number) => {
      const pIds = new Set(src.filter(s => s.kind === "player").map(s => s.id))
      const aIds = new Set(src.filter(s => s.kind === "arrow").map(s => s.id))
      const tIds = new Set(src.filter(s => s.kind === "text").map(s => s.id))
      const sIds = new Set(src.filter(s => s.kind === "shape").map(s => s.id))
      const iIds = new Set(src.filter(s => s.kind === "image").map(s => s.id))
      const zIds = new Set(src.filter(s => s.kind === "zone").map(s => s.id))
      const idMap = new Map<string, string>() // a copied line stays attached to the copied pieces, never to the originals
      const newPlayers = players.filter(p => pIds.has(p.id)).map(p => { const id = uid(); idMap.set(p.id, id); return { ...p, id, x: p.x + dx, y: p.y + dy } })
      const newArrows = arrows.filter(a => aIds.has(a.id)).map(a => ({ ...a, id: uid(), x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy, cpx: a.cpx + dx, cpy: a.cpy + dy, fromId: a.fromId ? idMap.get(a.fromId) : undefined, toId: a.toId ? idMap.get(a.toId) : undefined }))
      const newTexts = texts.filter(t => tIds.has(t.id)).map(t => ({ ...t, id: uid(), x: t.x + dx, y: t.y + dy }))
      const newShapes = shapes.filter(s => sIds.has(s.id)).map(s => ({ ...s, id: uid(), x: s.x + dx, y: s.y + dy, pts: s.pts.map(([px, py]: [number, number]) => [px + dx, py + dy] as [number, number]), ids: remapIds(s.ids, idMap) }))
      const newImages = images.filter(i => iIds.has(i.id)).map(i => ({ ...i, id: uid(), x: i.x + dx, y: i.y + dy }))
      const newZones = customZones.filter(z => zIds.has(z.id)).map(z => ({ ...z, id: uid(), x: z.x + dx, y: z.y + dy }))
      return { newPlayers, newArrows, newTexts, newShapes, newImages, newZones }
    }

    const applyDuplicates = (dupes: ReturnType<typeof buildDuplicates>) => {
      const { newPlayers, newArrows, newTexts, newShapes, newImages, newZones } = dupes
      if (newPlayers.length) setPlayers(p => [...p, ...newPlayers])
      if (newArrows.length) setArrows(a => [...a, ...newArrows])
      if (newTexts.length) setTexts(t => [...t, ...newTexts])
      if (newShapes.length) setShapes(s => [...s, ...newShapes])
      if (newImages.length) setImages(i => [...i, ...newImages])
      if (newZones.length) setCustomZones(z => [...z, ...newZones])
      const newSel: SelItem[] = [
        ...newPlayers.map(p => ({ kind: "player" as const, id: p.id })),
        ...newArrows.map(a => ({ kind: "arrow" as const, id: a.id })),
        ...newTexts.map(t => ({ kind: "text" as const, id: t.id })),
        ...newShapes.map(s => ({ kind: "shape" as const, id: s.id })),
        ...newImages.map(i => ({ kind: "image" as const, id: i.id })),
        ...newZones.map(z => ({ kind: "zone" as const, id: z.id })),
      ]
      setSelection(newSel)
    }

    const duplicate = () => {
      if (selection.length === 0) return
      snapshot()
      applyDuplicates(buildDuplicates(selection, 24, 24))
    }

    const copy = () => {
      if (selection.length === 0) return
      const pIds = new Set(selection.filter(s => s.kind === "player").map(s => s.id))
      const aIds = new Set(selection.filter(s => s.kind === "arrow").map(s => s.id))
      const tIds = new Set(selection.filter(s => s.kind === "text").map(s => s.id))
      const sIds = new Set(selection.filter(s => s.kind === "shape").map(s => s.id))
      const iIds = new Set(selection.filter(s => s.kind === "image").map(s => s.id))
      const zIds = new Set(selection.filter(s => s.kind === "zone").map(s => s.id))
      clipboardRef.current = {
        players: players.filter(p => pIds.has(p.id)).map(p => ({ ...p })),
        arrows: arrows.filter(a => aIds.has(a.id)).map(a => ({ ...a })),
        texts: texts.filter(t => tIds.has(t.id)).map(t => ({ ...t })),
        shapes: shapes.filter(s => sIds.has(s.id)).map(s => ({ ...s, pts: [...s.pts] })),
        images: images.filter(i => iIds.has(i.id)).map(i => ({ ...i })),
        zones: customZones.filter(z => zIds.has(z.id)).map(z => ({ ...z })),
      }
    }

    const paste = () => {
      const cb = clipboardRef.current
      if (!cb) return
      snapshot()
      const idMap = new Map<string, string>()
      const newPlayers = cb.players.map(p => { const id = uid(); idMap.set(p.id, id); return { ...p, id, x: p.x + 24, y: p.y + 24 } })
      const newArrows = cb.arrows.map(a => ({ ...a, id: uid(), x1: a.x1 + 24, y1: a.y1 + 24, x2: a.x2 + 24, y2: a.y2 + 24, cpx: a.cpx + 24, cpy: a.cpy + 24, fromId: a.fromId ? idMap.get(a.fromId) : undefined, toId: a.toId ? idMap.get(a.toId) : undefined }))
      const newTexts = cb.texts.map(t => ({ ...t, id: uid(), x: t.x + 24, y: t.y + 24 }))
      const newShapes = cb.shapes.map(s => ({ ...s, id: uid(), x: s.x + 24, y: s.y + 24, pts: s.pts.map(([px, py]: [number, number]) => [px + 24, py + 24] as [number, number]), ids: remapIds(s.ids, idMap) }))
      const newImages = cb.images.map(i => ({ ...i, id: uid(), x: i.x + 24, y: i.y + 24 }))
      const newZones = cb.zones.map(z => ({ ...z, id: uid(), x: z.x + 24, y: z.y + 24 }))
      applyDuplicates({ newPlayers, newArrows, newTexts, newShapes, newImages, newZones })
    }
    menuActionsRef.current = { duplicate, copy } // the right-click menu uses the same actions as the shortcuts

    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const tag = el.tagName
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") el.blur()
        return
      }
      // While the move plays or is being made, keys don't change the board: a key stops the playing instead
      const sk = stepKeysRef.current
      if (sk.busy()) { e.preventDefault(); sk.stop(); return }
      if (e.key === "Delete" || e.key === "Backspace") del()
      if (e.key === "Escape") {
        setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null
        setShapeDraftPreview(null); setSel(null); setCtxMenu(null)
        if (tool !== "select") setTool("select")
      }
      // With Shift (or Caps Lock) the key arrives as "Z". preventDefault stops the browser also undoing the last text you typed in a box.
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === "z") { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && k === "z" || k === "y")) { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); if (!typing) duplicate() }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); if (!typing) copy() }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") { e.preventDefault(); if (!typing) paste() }
      // Select everything that isn't locked
      if ((e.ctrlKey || e.metaKey) && k === "a" && !typing) {
        e.preventDefault()
        setSelection([
          ...players.filter(x => !x.locked).map(x => ({ kind: "player" as const, id: x.id })),
          ...arrows.filter(x => !x.locked).map(x => ({ kind: "arrow" as const, id: x.id })),
          ...texts.filter(x => !x.locked).map(x => ({ kind: "text" as const, id: x.id })),
          ...shapes.filter(x => !x.locked).map(x => ({ kind: "shape" as const, id: x.id })),
          ...images.filter(x => !x.locked).map(x => ({ kind: "image" as const, id: x.id })),
          ...customZones.filter(x => !x.locked).map(x => ({ kind: "zone" as const, id: x.id })),
        ])
      }
      // Arrow keys nudge the selection (Shift = 10 at a time); a burst of presses is one undo step
      if (!typing && !e.ctrlKey && !e.metaKey && e.key.startsWith("Arrow") && selection.length > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
        undoPoint("nudge:" + selection.map(s => s.id).join())
        nudge(withLinked(selection), dx, dy)
      }
      if (e.key === "+" || e.key === "=") applyZoom(1.15)
      if (e.key === "-") applyZoom(0.87)
      if (e.key === "0") fitToView()
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") sw("select")
        if (e.key === "h" || e.key === "H") sw("pan")
        if (e.key === "1") sw("homePlayer")
        if (e.key === "2") sw("awayPlayer")
        if (e.key === "x" || e.key === "X") sw("marker")
        if (e.key === "b" || e.key === "B") sw("ball")
        if (e.key === "a" || e.key === "A") sw("arrow")
        if (e.key === "t" || e.key === "T") sw("text")
        if (e.key === "s" || e.key === "S") sw("shape")
        if (e.key === "z" || e.key === "Z") sw("zone")
        if (e.key === "i" || e.key === "I") fileInputRef.current?.click()
        if (e.key === "p" || e.key === "P") sk.play()
        if (e.key === "[") sk.go(-1)
        if (e.key === "]") sk.go(1)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, tool, snapshot, applyZoom]) // the whole selection, so Delete/Duplicate/Copy always act on everything selected

  /* ── Delete selected ── */
  const deleteSelected = useCallback(() => {
    if (selection.length === 0) return
    snapshot()
    const pIds = new Set(selection.filter(s => s.kind === "player").map(s => s.id))
    const aIds = new Set(selection.filter(s => s.kind === "arrow").map(s => s.id))
    const tIds = new Set(selection.filter(s => s.kind === "text").map(s => s.id))
    const sIds = new Set(selection.filter(s => s.kind === "shape").map(s => s.id))
    const iIds = new Set(selection.filter(s => s.kind === "image").map(s => s.id))
    const zIds = new Set(selection.filter(s => s.kind === "zone").map(s => s.id))
    if (pIds.size > 0) setPlayers(p => p.filter(x => !pIds.has(x.id)))
    if (aIds.size > 0) setArrows(a => a.filter(x => !aIds.has(x.id)))
    if (tIds.size > 0) setTexts(t => t.filter(x => !tIds.has(x.id)))
    if (sIds.size > 0) setShapes(sh => sh.filter(x => !sIds.has(x.id)))
    if (iIds.size > 0) setImages(i => i.filter(x => !iIds.has(x.id)))
    if (zIds.size > 0) setCustomZones(z => z.filter(x => !zIds.has(x.id)))
    setSelection([])
  }, [selection, snapshot])

  /* ── Right-click menu actions ── */
  /** Right-click on a piece: select it (or keep the selection it's part of) and open the menu where you clicked.
   *  A locked piece isn't selected; its menu just offers Unlock. */
  const openMenu = (e: React.MouseEvent, item: SelItem, locked?: boolean) => {
    e.preventDefault(); e.stopPropagation()
    if (!locked && !isSel(item.id)) setSelection([item])
    setCtxMenu({ x: e.clientX, y: e.clientY, lockedItem: locked ? item : null })
  }
  /** Puts the selection in front of (or behind) the other pieces of the same kind. */
  const reorder = (to: "front" | "back") => {
    const ids = new Set(selection.map(s => s.id))
    const move = <T extends { id: string }>(list: T[]) => {
      const picked = list.filter(v => ids.has(v.id))
      if (!picked.length) return list
      const rest = list.filter(v => !ids.has(v.id))
      return to === "front" ? [...rest, ...picked] : [...picked, ...rest]
    }
    undoPoint()
    setPlayers(move); setArrows(move); setTexts(move); setShapes(move); setImages(move); setCustomZones(move)
  }
  /** Locks or unlocks pieces. Locked pieces ignore clicks, drags, box-select and the arrow keys. */
  const setLocked = (items: SelItem[], locked: boolean) => {
    const ids = new Set(items.map(s => s.id))
    const lock = <T extends { id: string; locked?: boolean }>(list: T[]) =>
      list.some(v => ids.has(v.id)) ? list.map(v => ids.has(v.id) ? { ...v, locked: locked || undefined } : v) : list
    undoPoint()
    setPlayers(lock); setArrows(lock); setTexts(lock); setShapes(lock); setImages(lock); setCustomZones(lock)
  }

  /* ── Align / Distribute ── */
  const alignSelectedPlayers = useCallback((axis: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    const selIds = new Set(selection.filter(s => s.kind === "player").map(s => s.id))
    if (selIds.size < 2) return
    const targets = players.filter(p => selIds.has(p.id))
    snapshot()
    let anchor: number
    if (axis === "left") anchor = Math.min(...targets.map(p => p.x))
    else if (axis === "center") anchor = (Math.min(...targets.map(p => p.x)) + Math.max(...targets.map(p => p.x))) / 2
    else if (axis === "right") anchor = Math.max(...targets.map(p => p.x))
    else if (axis === "top") anchor = Math.min(...targets.map(p => p.y))
    else if (axis === "middle") anchor = (Math.min(...targets.map(p => p.y)) + Math.max(...targets.map(p => p.y))) / 2
    else anchor = Math.max(...targets.map(p => p.y))
    setPlayers(prev => prev.map(p => {
      if (!selIds.has(p.id)) return p
      if (axis === "left" || axis === "center" || axis === "right") return { ...p, x: anchor }
      return { ...p, y: anchor }
    }))
  }, [selection, players, snapshot])

  const distributeSelectedPlayers = useCallback((axis: "horizontal" | "vertical") => {
    const selIds = new Set(selection.filter(s => s.kind === "player").map(s => s.id))
    if (selIds.size < 3) return
    const targets = players.filter(p => selIds.has(p.id))
    snapshot()
    if (axis === "horizontal") {
      const sorted = [...targets].sort((a, b) => a.x - b.x)
      const minX = sorted[0].x
      const maxX = sorted[sorted.length - 1].x
      const step = (maxX - minX) / (sorted.length - 1)
      setPlayers(prev => prev.map(p => {
        const idx = sorted.findIndex(s => s.id === p.id)
        return idx >= 0 ? { ...p, x: minX + idx * step } : p
      }))
    } else {
      const sorted = [...targets].sort((a, b) => a.y - b.y)
      const minY = sorted[0].y
      const maxY = sorted[sorted.length - 1].y
      const step = (maxY - minY) / (sorted.length - 1)
      setPlayers(prev => prev.map(p => {
        const idx = sorted.findIndex(s => s.id === p.id)
        return idx >= 0 ? { ...p, y: minY + idx * step } : p
      }))
    }
  }, [selection, players, snapshot])

  /** Where the pitch is, and the part of the board you see and export (what you see is what you export) */
  const geo = pitchGeo(vertical, pitchScale, pitchOffX, pitchOffY)
  const geoRef = useRef(geo)
  geoRef.current = geo
  const edBoard = title.trim() === "Untitled board" ? "" : title.trim() // an unnamed board has no headline
  const edStrip = editorial && (homeName.trim() !== "" || awayName.trim() !== "" || homeScore !== "" || awayScore !== "")
  const edLines = editorial ? wrapCaption(caption) : []
  const frame = frameRect(geo, canvasMode === "blank" ? "board" : focus, focusEnd, frameRatio, editorial ? { strip: edStrip, lines: edLines.length, pitch: canvasMode !== "blank" } : null)
  const sealK = Math.min(1, Math.min(frame.w, frame.h) / CH) // the seal and the legend shrink with a small frame
  const dispW = Math.min(SVG_DISPLAY_W, (SVG_DISPLAY_W * CH / CW) * frame.w / frame.h)
  const dispRef = useRef({ w: dispW, h: dispW * frame.h / frame.w })
  dispRef.current = { w: dispW, h: dispW * frame.h / frame.w }
  // A new frame fits the screen again
  useEffect(() => { fitToView() }, [vertical, focus, focusEnd, frameRatio, canvasMode, editorial, edStrip, edLines.length]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Turns the pitch upright (or back). Everything on it moves with it, so every piece keeps its place on the pitch. One undo step. */
  const setOrientation = (v: boolean) => {
    if (v === vertical) return
    undoPoint()
    const from = pitchGeo(vertical, pitchScale, pitchOffX, pitchOffY)
    const to = pitchGeo(v, pitchScale, 0, 0)
    const T = (x: number, y: number) => { const p = toPitch(from, x, y); return toCanvas(to, p.x, p.y) }
    const k = to.sc / from.sc
    const turnP = (p: Player) => ({ ...p, ...T(p.x, p.y) })
    const turnA = (a: Arrow) => {
      const a1 = T(a.x1, a.y1), a2 = T(a.x2, a.y2), c = T(a.cpx, a.cpy)
      return { ...a, x1: a1.x, y1: a1.y, x2: a2.x, y2: a2.y, cpx: c.x, cpy: c.y }
    }
    const turnT = (tb: TextBox) => { const h = textBoxH(tb), c = T(tb.x + tb.width / 2, tb.y + h / 2); return { ...tb, x: c.x - tb.width / 2, y: c.y - h / 2 } }
    const turnS = (sh: Shape): Shape => {
      if (sh.kind === "polygon") return { ...sh, pts: sh.pts.map(([x, y]) => { const q = T(x, y); return [q.x, q.y] as [number, number] }) }
      const c = T(sh.x + sh.w / 2, sh.y + sh.h / 2), w = sh.h * k, h = sh.w * k
      return { ...sh, x: c.x - w / 2, y: c.y - h / 2, w, h }
    }
    setPlayers(l => l.map(turnP)); setArrows(l => l.map(turnA)); setTexts(l => l.map(turnT)); setShapes(l => l.map(turnS))
    setSteps(l => l.map(f => ({ ...f, players: f.players.map(turnP), arrows: f.arrows.map(turnA), texts: f.texts.map(turnT), shapes: f.shapes.map(turnS) }))) // every step turns with it
    setImages(l => l.map(im => { if (im.layer === "background") return im; const c = T(im.x + im.width / 2, im.y + im.height / 2); return { ...im, x: c.x - im.width / 2, y: c.y - im.height / 2 } }))
    setPitchOffX(0); setPitchOffY(0)
    setVertical(v)
    if (v && focus === "board") setFocus("pitch") // an upright pitch is usually wanted on its own
  }

  /** Every piece by id, for lines attached to pieces */
  const pieceMap = new Map(players.map(p => [p.id, p]))
  const piecesRef = useRef(players)
  piecesRef.current = players
  // A line attached to a piece follows it: when the piece moves, that end moves with it (and the bend moves half as far)
  useEffect(() => {
    setArrows(prev => {
      let changed = false
      const next = prev.map(a => {
        if (!a.fromId && !a.toId) return a
        const P = a.fromId ? pieceMap.get(a.fromId) : undefined, Q = a.toId ? pieceMap.get(a.toId) : undefined
        const dx1 = P ? P.x - a.x1 : 0, dy1 = P ? P.y - a.y1 : 0, dx2 = Q ? Q.x - a.x2 : 0, dy2 = Q ? Q.y - a.y2 : 0
        if (!dx1 && !dy1 && !dx2 && !dy2) return a
        changed = true
        return { ...a, x1: a.x1 + dx1, y1: a.y1 + dy1, x2: a.x2 + dx2, y2: a.y2 + dy2, cpx: a.cpx + (dx1 + dx2) / 2, cpy: a.cpy + (dy1 + dy2) / 2 }
      })
      return changed ? next : prev
    })
    // A team shape's points follow the pieces they're attached to, so it stretches as they move
    setShapes(prev => {
      let changed = false
      const next = prev.map(sh => {
        if (!sh.ids) return sh
        let moved = false
        const pts = sh.pts.map((pt, i) => {
          const P = sh.ids![i] ? pieceMap.get(sh.ids![i]) : undefined
          if (!P || (P.x === pt[0] && P.y === pt[1])) return pt
          moved = true
          return [P.x, P.y] as [number, number]
        })
        if (!moved) return sh
        changed = true
        return { ...sh, pts }
      })
      return changed ? next : prev
    })
  }, [players]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Dragging or nudging a team shape takes the pieces it's attached to along with it (reads the latest board, so the arrow keys never use an old one) */
  const shapesRef = useRef(shapes)
  shapesRef.current = shapes
  const withLinked = (items: SelItem[]): SelItem[] => {
    const have = new Set(items.map(s => s.id)), add: SelItem[] = []
    for (const it of items) {
      if (it.kind !== "shape") continue
      for (const id of shapesRef.current.find(s => s.id === it.id)?.ids ?? []) {
        if (id && !have.has(id) && piecesRef.current.some(p => p.id === id)) { have.add(id); add.push({ kind: "player", id }) }
      }
    }
    return add.length ? [...items, ...add] : items
  }

  /* ── Team shapes, distances and ghosts ── */
  /** Joins the selected pieces with a line (or, from 3 pieces, a closed shape) attached to them, so it stretches as they move. One undo step. */
  const connectPieces = (closed: boolean) => {
    const ids = new Set(selection.map(s => s.id))
    const pcs = players.filter(p => ids.has(p.id) && !p.locked)
    if (pcs.length < (closed ? 3 : 2)) return
    const order = shapeOrder(pcs, closed).map(i => pcs[i])
    undoPoint()
    const sh: Shape = {
      id: uid(), kind: "polygon", pts: order.map(p => [p.x, p.y] as [number, number]), closed, ids: order.map(p => p.id),
      x: 0, y: 0, w: 0, h: 0, fill: PS_VOLT, fillOpacity: closed ? 0.18 : 0, stroke: PS_VOLT, strokeW: closed ? 2 : 3, strokeDash: closed, label: "",
    }
    setShapes(prev => [...prev, sh])
    setSelection([{ kind: "shape", id: sh.id }])
  }
  /** A dotted line between two pieces showing how far apart they are in metres. It follows them. One undo step. */
  const measurePieces = () => {
    const ids = new Set(selection.map(s => s.id))
    const [P, Q] = players.filter(p => ids.has(p.id) && !p.locked)
    if (!P || !Q) return
    undoPoint()
    const a: Arrow = {
      id: uid(), x1: P.x, y1: P.y, x2: Q.x, y2: Q.y, cpx: (P.x + Q.x) / 2, cpy: (P.y + Q.y) / 2,
      color: "#ffffff", strokeW: 2, dash: "dotted", label: "", twoWay: false, kind: "line", fromId: P.id, toId: Q.id, dist: true,
    }
    setArrows(prev => [...prev, a])
    setSelection([{ kind: "arrow", id: a.id }])
  }
  /** A faded copy of a player a few metres ahead (where they'll be) or behind (where they were), joined to them by a run. One undo step. */
  const addGhost = (p: Player, ahead: boolean) => {
    const away = teamOf(p) === "away" // the away team attacks the other way
    const g = geoRef.current, at = toPitch(g, p.x, p.y)
    const to = toCanvas(g, Math.max(0, Math.min(PW, at.x + (away ? -1 : 1) * (ahead ? 1 : -1) * 120)), at.y)
    const ghost: Player = { ...p, id: uid(), x: to.x, y: to.y, ghost: true, glow: false, locked: undefined }
    const [from, end] = ahead ? [p, ghost] : [ghost, p]
    const run: Arrow = {
      id: uid(), x1: from.x, y1: from.y, x2: end.x, y2: end.y, cpx: (from.x + end.x) / 2, cpy: (from.y + end.y) / 2,
      color: "#ffffff", strokeW: 3, dash: "dashed", label: "", twoWay: false, kind: "run", fromId: from.id, toId: end.id,
    }
    undoPoint()
    setPlayers(prev => { const i = prev.findIndex(x => x.id === p.id); return [...prev.slice(0, i), ghost, ...prev.slice(i)] }) // drawn under the player
    setArrows(prev => [...prev, run])
    setSelection([{ kind: "player", id: ghost.id }])
  }

  /** How much bigger the names and numbers on the pieces are drawn */
  const labelScale = labelSize === "xl" ? 1.7 : labelSize === "large" ? 1.35 : 1

  /* ── Team kits ── */
  const kitOf = (team: "home" | "away") =>
    team === "home" ? { pat: homePat, c1: homeColor, c2: homeC2, num: homeNum } : { pat: awayPat, c1: awayColor, c2: awayC2, num: awayNum }
  /** What a new player on this team wears (a plain colour adds nothing extra, so those boards save exactly as before) */
  const teamKit = (team: "home" | "away") => {
    const k = kitOf(team)
    return k.pat === "solid" ? { bg: k.c1, fg: k.num } : { bg: k.c1, fg: k.num, pat: k.pat, bg2: k.c2, outline: true }
  }
  /** Gives a team a new kit; everyone on that team changes with it. One undo step. */
  const applyTeamKit = (team: "home" | "away", k: { pat: KitPattern; c1: string; c2: string; num: string }, key?: string) => {
    const cur = kitOf(team)
    const base = team === "home" ? HOME_COLORS.bg : AWAY_COLORS.bg
    undoPoint(key)
    if (team === "home") { setHomeColor(k.c1); setHomePat(k.pat); setHomeC2(k.c2); setHomeNum(k.num) }
    else { setAwayColor(k.c1); setAwayPat(k.pat); setAwayC2(k.c2); setAwayNum(k.num) }
    setPlayers(prev => prev.map(p => wearsKit(p, cur, base) ? { ...p, ...kitProps(k) } : p))
  }
  /** One team in the Teams group: its name, formation, kit and names */
  const teamBlock = (team: "home" | "away") => {
    const k = kitOf(team)
    const label = team === "home" ? "Home" : "Away"
    const name = team === "home" ? homeName : awayName
    const call = name.trim() || label // what the buttons call the team
    const there = players.some(p => teamOf(p) === team)
    const view = kitEditor[team]
    const match = KITS.find(x => x.pat === k.pat && x.c1 === k.c1 && (k.pat === "solid" || x.c2 === k.c2))
    const shown = view === "more" ? KITS : [...KITS.filter(x => TOP_KITS.includes(x.id)), ...(match && !TOP_KITS.includes(match.id) ? [match] : [])]
    const link = (text: string, v: "more" | "own") => (
      <button onClick={() => setKitEditor(e => ({ ...e, [team]: e[team] === v ? "" : v }))} aria-expanded={view === v}
        className="text-xs font-semibold hover:underline" style={{ color: view === v ? TEXT_PRIMARY : TEXT_MUTED, background: "transparent", border: "none", padding: 0 }}>{text}</button>
    )
    return (
      <div key={team} className="flex flex-col gap-2 pb-3" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
        <div className="flex items-center gap-2">
          <KitDisc id={`${team}-head`} size={24} pat={k.pat} c1={k.c1} c2={k.c2} />
          <input value={name} maxLength={30} aria-label={`${label} team name`} placeholder={`${label} team name`}
            onChange={e => { undoPoint(`${team}Name`); (team === "home" ? setHomeName : setAwayName)(e.target.value) }}
            className="flex-1 min-w-0 rounded px-2 py-1 text-xs outline-none"
            style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
        </div>
        <div className="flex gap-1.5">
          <div className="flex-1 min-w-0">
            <FormationPicker label={label} value={(team === "home" ? homeFormation : awayFormation) || "4-3-3"} onChange={v => setTeamFormation(team, v)} />
          </div>
          {there ? (
            <button onClick={() => openNames(team)} aria-pressed={namesFor === team}
              className="px-3 rounded text-xs font-semibold transition-colors"
              style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${namesFor === team ? ACCENT_SOLID : DS_BORDER}` }}>Names</button>
          ) : (
            <button onClick={() => addTeam(team)} title={`Add the ${label.toLowerCase()} team`}
              className="px-3 rounded text-xs font-semibold hover:brightness-110"
              style={{ background: k.c1, color: inkOn(k.c1), border: `1px solid ${DS_BORDER}` }}>+ {label}</button>
          )}
        </div>
        {!there && squads.length > 0 && (
          <select value="" aria-label="Saved squad"
            onChange={e => { const q = squads.find(x => x.id === e.target.value); if (q) { applyLineup(team, q.players, q); setSquadId(q.id) } }}
            className="rounded px-2 py-1 text-xs outline-none"
            style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>
            <option value="">Or add a saved squad…</option>
            {squads.map(q => <option key={q.id} value={q.id}>{q.name} ({q.players.length})</option>)}
          </select>
        )}
        <p className="text-xs" style={{ color: TEXT_MUTED }}>Kit · {match ? match.name : "Your own"}</p>
        <div className="flex flex-wrap" style={{ gap: 3 }}>
          {shown.map(x => {
            const on = match?.id === x.id
            return (
              <button key={x.id} title={x.name} aria-label={`${label} kit: ${x.name}`} aria-pressed={on} onClick={() => applyTeamKit(team, x)}
                className="rounded-full transition-transform hover:scale-110"
                style={{ padding: 2, border: `2px solid ${on ? ACCENT_SOLID : "transparent"}`, background: "transparent" }}>
                <KitDisc id={`${team}-${x.id}`} size={20} pat={x.pat} c1={x.c1} c2={x.c2} />
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5">
          {link(view === "more" ? "Fewer kits" : `More kits (${KITS.length})`, "more")}
          <span className="text-xs" style={{ color: TEXT_MUTED }}>·</span>
          {link("Make your own", "own")}
        </div>
        {view === "own" && (
          <div className="flex flex-col gap-2.5">
            <ColorPicker label="Main colour" colors={SWATCHES} selected={k.c1}
              onSelect={c => applyTeamKit(team, { ...k, c1: c, num: k.pat === "solid" ? inkOn(c) : k.num }, `${team}Colour`)} />
            <PatternRow value={k.pat}
              onChange={pt => applyTeamKit(team, { ...k, pat: pt, c2: pt !== "solid" && k.c2 === k.c1 ? (k.c1 === "#ffffff" ? "#111111" : "#ffffff") : k.c2 })} />
            {k.pat !== "solid" && (
              <ColorPicker label="Second colour" colors={SWATCHES} selected={k.c2} onSelect={c => applyTeamKit(team, { ...k, c2: c }, `${team}Second`)} />
            )}
            <ColorPicker label="Number colour" colors={SWATCHES} selected={k.num} onSelect={c => applyTeamKit(team, { ...k, num: c }, `${team}Number`)} />
          </div>
        )}
        {namesFor === team && there && (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>Names · {call}</p>
            <textarea value={lineupText} onChange={e => setLineupText(e.target.value)} rows={7} aria-label="Lineup names"
              placeholder={"One per line or with commas: goalkeeper first, then each line right to left. A shirt number next to a name is used too."}
              className="rounded px-2 py-1.5 text-xs outline-none resize-y"
              style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
            <button disabled={!lineupText.trim()} onClick={() => applyLineup(team, parseLineup(lineupText))}
              className="py-1.5 rounded text-xs font-semibold hover:brightness-110"
              style={{ background: ACCENT_SOLID, color: ACCENT_INK, opacity: lineupText.trim() ? 1 : 0.4 }}>Name {call}</button>
            {squads.length > 0 && (
              <div className="flex gap-1.5">
                <select value="" aria-label="Saved squad"
                  onChange={e => { const q = squads.find(x => x.id === e.target.value); if (q) { applyLineup(team, q.players, q); setSquadId(q.id); setNamesFor(null) } }}
                  className="flex-1 min-w-0 rounded px-2 py-1 text-xs outline-none"
                  style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>
                  <option value="">Use a saved squad…</option>
                  {squads.map(q => <option key={q.id} value={q.id}>{q.name} ({q.players.length})</option>)}
                </select>
                <button onClick={() => squadId && deleteSquad(squadId)} disabled={!squadId} aria-label="Delete the last squad used" title={squadId ? `Delete ${squads.find(x => x.id === squadId)?.name ?? "squad"}` : "Use a squad first"}
                  className="p-1 rounded hover:bg-red-500/20 transition-colors" style={{ color: DS_ERROR, opacity: squadId ? 1 : 0.4 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            )}
            <button onClick={() => saveSquad(team)}
              className="text-xs font-semibold text-left hover:underline" style={{ color: TEXT_MUTED, background: "transparent", border: "none", padding: 0 }}>
              Save {call} as a squad
            </button>
            <p className="text-xs" style={{ color: TEXT_MUTED }}>A squad keeps the names, numbers and kit in this browser, for any board.</p>
          </div>
        )}
      </div>
    )
  }

  /* ── Formations, lineups and squads ── */
  /** Which team a piece plays for: its team, or on a board made before teams were kept, the kit it wears. Markers, the ball and ghosts play for no one. */
  const teamOf = (p: Player): "home" | "away" | null =>
    p.kind || p.ghost ? null : p.team ?? (wearsKit(p, kitOf("home"), HOME_COLORS.bg) ? "home" : wearsKit(p, kitOf("away"), AWAY_COLORS.bg) ? "away" : null)
  /** A board point as the team sees the pitch (attacking to the right); the away team is turned round */
  const teamPt = (team: "home" | "away", p: { x: number; y: number }) => {
    const q = toPitch(geoRef.current, p.x, p.y)
    return team === "away" ? { x: PW - q.x, y: PH - q.y } : q
  }
  const fromTeamPt = (team: "home" | "away", q: { x: number; y: number }) =>
    toCanvas(geoRef.current, team === "away" ? PW - q.x : q.x, team === "away" ? PH - q.y : q.y)
  const formationOf = (team: "home" | "away") =>
    ({ f: FORMATIONS.find(x => x.name === (team === "home" ? homeFormation : awayFormation)), shape: team === "home" ? homeShape : awayShape })
  const recordFormation = (team: "home" | "away", name: string, shape: TeamShape) => {
    if (team === "home") { setHomeFormation(name); setHomeShape(shape) } else { setAwayFormation(name); setAwayShape(shape) }
  }
  /** Puts a team into a formation. The players already there move to the spot that suits them (the left-back stays the left-back),
   *  keep their names and numbers, and anyone still named after a position takes the new one. Missing players are added. Gives the new piece list. */
  const placeTeam = (list: Player[], f: Formation, team: "home" | "away", shape: TeamShape, fill = true): Player[] => { // fill = false: only move the players already there
    const target = shapePositions(f, shape)
    const mine = list.filter(p => teamOf(p) === team && !p.locked)
    const at = mine.map(p => teamPt(team, p))
    const from = formationOf(team)
    // Where each player stands now in the team's last formation, then that spot's place in the new one; without one, the nearest spot
    const slotOf = from.f
      ? (() => { const map = matchSlots(from.f.positions, f.positions); return matchPoints(at, shapePositions(from.f, from.shape)).map(i => (i < 0 ? -1 : map[i])) })()
      : matchPoints(at, f.positions)
    const slot = new Map(mine.map((p, i) => [p.id, slotOf[i]]))
    const used = new Set(mine.map(p => p.num))
    const freeNum = (n: number) => { let k = n; while (used.has(String(k))) k++; used.add(String(k)); return String(k) }
    const added: Player[] = f.positions.flatMap((pos, j) => {
      if (!fill || slotOf.includes(j)) return []
      const t = fromTeamPt(team, target[j])
      return [{ id: uid(), x: t.x, y: t.y, name: pos.pos, num: freeNum(pos.num), ...(team === "home" ? HOME_COLORS : AWAY_COLORS), ...teamKit(team), glow: false, team }]
    })
    return [...list.map(p => {
      const j = slot.get(p.id)
      if (j === undefined || j < 0) return p
      const t = fromTeamPt(team, target[j]), name = p.name.trim()
      return { ...p, x: t.x, y: t.y, team, ...(name === "" || POS_CODES.has(name) ? { name: f.positions[j].pos } : {}) }
    }), ...added]
  }
  /** Who has the ball, read from the two teams' shapes: the side on the ball is in possession, the other out of it */
  const ballSide: "home" | "away" | "none" = homeShape === "in" || awayShape === "out" ? "home" : awayShape === "in" || homeShape === "out" ? "away" : "none"
  const shapeFor = (team: "home" | "away", ball: "home" | "away" | "none"): TeamShape => (ball === "none" ? "base" : ball === team ? "in" : "out")
  const formationFor = (team: "home" | "away") => formationOf(team).f ?? FORMATIONS.find(x => x.name === "4-3-3")!
  /** Players that land on top of each other (two teams in the same lines) are eased apart across the pitch, so nobody's depth changes */
  const easeApart = (list: Player[]): Player[] => {
    const g = geoRef.current, out = list.map(p => ({ ...p }))
    const live = out.filter(p => !p.locked && teamOf(p))
    for (let round = 0; round < 12; round++) {
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j]
        const pa = toPitch(g, a.x, a.y), pb = toPitch(g, b.x, b.y), need = 76 / g.sc // two pieces and the name under one, in pitch units
        const dx = pa.x - pb.x
        if (Math.hypot(dx, pa.y - pb.y) >= need) continue
        const room = Math.sqrt(need * need - dx * dx) // how far apart across the pitch they need to be
        const side = pa.y === pb.y ? (teamOf(a) === "home" ? -1 : 1) : Math.sign(pa.y - pb.y), mid = (pa.y + pb.y) / 2
        const ya = Math.max(20, Math.min(PH - 20, mid + (side * room) / 2)), yb = Math.max(20, Math.min(PH - 20, mid - (side * room) / 2))
        const ca = toCanvas(g, pa.x, ya), cb = toCanvas(g, pb.x, yb)
        a.x = ca.x; a.y = ca.y; b.x = cb.x; b.y = cb.y
      }
    }
    return out
  }
  /** Who has the ball: both teams set out in a formation move into their shapes at once. Players placed by hand stay put, and nobody is added. One undo step. */
  const setBall = (ball: "home" | "away" | "none") => {
    undoPoint()
    let list = players
    for (const team of ["home", "away"] as const) {
      const shape = shapeFor(team, ball), f = formationOf(team).f
      if (f && list.some(p => teamOf(p) === team)) {
        list = placeTeam(list, f, team, shape, false)
        recordFormation(team, f.name, shape)
      } else if (team === "home") setHomeShape(shape)
      else setAwayShape(shape)
    }
    setPlayers(ball === "none" ? list : easeApart(list))
    ;(window as any).posthog?.capture("possession_set", { ball })
  }
  /** A team's formation: a team on the board moves into it straight away. One undo step. */
  const setTeamFormation = (team: "home" | "away", name: string) => {
    const f = FORMATIONS.find(x => x.name === name)
    if (!f) return
    undoPoint()
    const shape = shapeFor(team, ballSide)
    if (players.some(p => teamOf(p) === team)) {
      const list = placeTeam(players, f, team, shape)
      setPlayers(shape === "base" ? list : easeApart(list))
    }
    recordFormation(team, f.name, shape)
    ;(window as any).posthog?.capture("formation_used", { formation: f.name, shape })
  }
  /** Adds a whole team in its formation, in the shape that suits who has the ball. One undo step. */
  const addTeam = (team: "home" | "away") => {
    const f = formationFor(team), shape = shapeFor(team, ballSide)
    undoPoint()
    const list = placeTeam(players, f, team, shape)
    setPlayers(shape === "base" ? list : easeApart(list))
    recordFormation(team, f.name, shape)
    ;(window as any).posthog?.capture("formation_used", { formation: f.name, shape })
  }
  /** A team in team-sheet order: goalkeeper, then each line from the back, right to left */
  const lineupOf = (list: Player[], team: "home" | "away", f: Formation | undefined, shape: TeamShape): Player[] => {
    const mine = list.filter(p => teamOf(p) === team)
    const at = mine.map(p => teamPt(team, p))
    if (!f) return sheetOrder(at).map(i => mine[i])
    const spot = matchPoints(at, shapePositions(f, shape)), rank = new Map(sheetOrder(f.positions).map((j, k) => [j, k]))
    return mine.map((p, i) => ({ p, k: spot[i] < 0 ? 100 + i : rank.get(spot[i])! })).sort((a, b) => a.k - b.k).map(e => e.p)
  }
  /** Names a team from a pasted list or a saved squad (a squad also brings its kit and team name). A team that isn't on the board yet is added first. One undo step. */
  const applyLineup = (team: "home" | "away", entries: { name: string; num?: string }[], squad?: Squad) => {
    if (!entries.length) return
    undoPoint()
    let list = players, { f, shape } = formationOf(team)
    if (!list.some(p => teamOf(p) === team)) {
      f = formationFor(team); shape = shapeFor(team, ballSide)
      list = placeTeam(list, f, team, shape)
      recordFormation(team, f.name, shape)
    }
    const order = lineupOf(list, team, f, shape)
    const named = new Map(order.slice(0, entries.length).map((p, i) => [p.id, entries[i]]))
    const cur = kitOf(team), base = team === "home" ? HOME_COLORS.bg : AWAY_COLORS.bg
    setPlayers(list.map(p => {
      const e = named.get(p.id)
      const kitted = squad && teamOf(p) === team && wearsKit(p, cur, base) ? { ...p, ...kitProps(squad.kit) } : p // a goalkeeper's own kit stays
      return e ? { ...kitted, name: e.name, ...(e.num ? { num: e.num } : {}) } : kitted
    }))
    if (squad) {
      const k = squad.kit
      if (team === "home") { setHomeColor(k.c1); setHomePat(k.pat); setHomeC2(k.c2); setHomeNum(k.num); setHomeName(squad.teamName) }
      else { setAwayColor(k.c1); setAwayPat(k.pat); setAwayC2(k.c2); setAwayNum(k.num); setAwayName(squad.teamName) }
    }
  }
  /** Keeps a team's names, numbers, kit and name as a squad in this browser, to use on any board. Saving under the same name replaces it. */
  const saveSquad = (team: "home" | "away") => {
    const { f, shape } = formationOf(team)
    const order = lineupOf(players, team, f, shape)
    if (!order.length) return
    const teamName = (team === "home" ? homeName : awayName).trim()
    const sq: Squad = { id: uid(), name: teamName || (team === "home" ? "Home squad" : "Away squad"), teamName, kit: kitOf(team), players: order.map(p => ({ name: p.name, num: p.num })) }
    const next = [...squads.filter(x => x.name !== sq.name), sq]
    setSquads(next); writeSquads(next); setSquadId(sq.id)
  }
  const deleteSquad = (id: string) => {
    const next = squads.filter(x => x.id !== id)
    setSquads(next); writeSquads(next); setSquadId("")
  }
  /** Opens a team's names, filled in with the team as it stands: number and name, goalkeeper first */
  const openNames = (team: "home" | "away") => {
    if (namesFor === team) { setNamesFor(null); return }
    const { f, shape } = formationOf(team)
    setLineupText(lineupOf(players, team, f, shape).map(p => `${p.num} ${p.name}`.trim()).join(String.fromCharCode(10))) // one player per line
    setNamesFor(team)
  }

  /* ── SVG pointer events (unifies mouse, touch, and pen) ── */
  const onSVGMouseMove = useCallback((e: React.PointerEvent) => {
    const { x, y } = svgXY(e)
    if (drawingRef.current) setMouse({ x, y })

    // Track drag distance
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 3) hasDraggedRef.current = true

    if (shapeDrawRef.current && shapeKind !== "polygon") {
      setShapeDraftPreview({ x1: shapeDrawRef.current.x1, y1: shapeDrawRef.current.y1, x2: x, y2: y })
    }
    if (zoneDrawRef.current) {
      const { x: px, y: py } = toPitch(geoRef.current, x, y)
      setZoneDraft({ x1: zoneDrawRef.current.x, y1: zoneDrawRef.current.y, x2: px, y2: py })
    }

    // Box-select: the box appears once you've dragged a few pixels on an empty part of the board
    const mq = marqueeRef.current
    if (mq && Math.hypot(e.clientX - mq.sx, e.clientY - mq.sy) > 4) setMarquee({ x1: mq.x, y1: mq.y, x2: x, y2: y })

    if (!dragRef.current) { dragStartedRef.current = false; return }
    const d = dragRef.current
    const m = moveRef.current
    if (d.kind === "move") {
      if (!m) return
      // A few pixels' dead zone, so clicking a piece never nudges it
      if (!m.live) { if (Math.hypot(e.clientX - m.sx, e.clientY - m.sy) < 4) return; m.live = true }
    }
    // The first move of a drag marks the undo point, so one undo puts everything back where it was before the drag
    if (!dragStartedRef.current) { dragStartedRef.current = true; undoPointRef.current() }
    if (d.kind === "move" && m) moveBy(m.base, x - m.x, y - m.y) // everything selected moves together
    else if (d.kind === "arrowCp") setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, cpx: x, cpy: y } : ar))
    else if (d.kind === "arrowP1") { const P = pieceAt(piecesRef.current, x, y); const px = P ? P.x : x, py = P ? P.y : y; setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, x1: px, y1: py, cpx: (px + ar.x2) / 2, cpy: (py + ar.y2) / 2, fromId: P?.id } : ar)) }
    else if (d.kind === "arrowP2") { const Q = pieceAt(piecesRef.current, x, y); const qx = Q ? Q.x : x, qy = Q ? Q.y : y; setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, x2: qx, y2: qy, cpx: (ar.x1 + qx) / 2, cpy: (ar.y1 + qy) / 2, toId: Q?.id } : ar)) }
    else if (d.kind === "resizeShape") setShapes(s => s.map(sh => sh.id === d.id ? { ...sh, w: Math.max(10, x - sh.x), h: Math.max(10, y - sh.y) } : sh))
    else if (d.kind === "resizeText") setTexts(t => t.map(tb => {
      if (tb.id !== d.id) return tb
      const lH = tb.size * 1.45
      const autoH = tb.text.split("\n").length * lH + 16
      return { ...tb, width: Math.max(60, x - tb.x), manualH: Math.max(autoH, y - tb.y) }
    }))
    else if (d.kind === "resizePlayer") setPlayers(p => p.map(pl => pl.id === d.id ? { ...pl, scale: Math.max(0.5, (Math.hypot(x - pl.x, y - pl.y) - d.ox) / pieceBase(pl)) } : pl)) // the handle stays under the cursor (ox = where on the handle you grabbed it)
    else if (d.kind === "resizeImage") setImages(i => i.map(im => im.id === d.id ? { ...im, width: Math.max(20, x - im.x), height: Math.max(20, y - im.y) } : im))
    else if (d.kind === "resizePitch") {
      const g = geoRef.current, wide = g.v ? PH * VERT_SCALE : PW // the pitch's width on the board at 100%
      if (d.id === "pitch-tr" || d.id === "pitch-br") {
        setPitchScale(Math.max(0.3, Math.min(2.5, (x - g.ox) / wide)))
      } else {
        setPitchScale(prev => Math.max(0.3, Math.min(2.5, (g.ox + wide * prev - x) / wide)))
      }
    }
    else if (d.kind === "movePitch") {
      setPitchOffX(x - d.ox - PX)
      setPitchOffY(y - d.oy - PY)
    }
  }, [svgXY, shapeKind])

  // Ends a move, a drag or a box-select wherever you let go, even off the board (it used to leave the piece stuck to the pointer)
  const endDrag = () => {
    const m = moveRef.current
    if (dragRef.current?.kind === "move" && m && !m.live && m.keep) setSelection([m.item]) // a plain click on one of several selected pieces selects just that one
    dragRef.current = null; moveRef.current = null; dragStartedRef.current = false
    const mq = marqueeRef.current
    marqueeRef.current = null
    if (mq && marquee) {
      const x1 = Math.min(marquee.x1, marquee.x2), x2 = Math.max(marquee.x1, marquee.x2)
      const y1 = Math.min(marquee.y1, marquee.y2), y2 = Math.max(marquee.y1, marquee.y2)
      const inBox = (x: number, y: number) => x >= x1 && x <= x2 && y >= y1 && y <= y2
      const fits = (bx: number, by: number, bw: number, bh: number) => bx >= x1 && by >= y1 && bx + bw <= x2 && by + bh <= y2
      const zoneBox = (z: CustomZone) => { const r = pitchRect(geoRef.current, z.x, z.y, z.x + z.w, z.y + z.h); return fits(r.x, r.y, r.w, r.h) }
      // Pieces, arrows and text are picked when the box touches them; shapes, zones and images only when they're fully inside it
      const hits: SelItem[] = [
        ...players.filter(p => !p.locked && Math.hypot(p.x - Math.max(x1, Math.min(p.x, x2)), p.y - Math.max(y1, Math.min(p.y, y2))) <= pieceBase(p) * (p.scale || 1)).map(p => ({ kind: "player" as const, id: p.id })),
        ...arrows.filter(a => !a.locked && arrowPoints(a).some(([x, y]) => inBox(x, y))).map(a => ({ kind: "arrow" as const, id: a.id })),
        ...texts.filter(t => !t.locked && t.x < x2 && t.x + t.width > x1 && t.y < y2 && t.y + textBoxH(t) > y1).map(t => ({ kind: "text" as const, id: t.id })),
        ...shapes.filter(sh => !sh.locked && (sh.kind === "polygon" ? sh.pts.length > 0 && sh.pts.every(([x, y]) => inBox(x, y)) : fits(sh.x, sh.y, sh.w, sh.h))).map(sh => ({ kind: "shape" as const, id: sh.id })),
        ...images.filter(im => !im.locked && im.layer === "overlay" && fits(im.x, im.y, im.width, im.height)).map(im => ({ kind: "image" as const, id: im.id })),
        ...(canvasMode === "blank" ? [] : customZones.filter(z => !z.locked && zoneBox(z)).map(z => ({ kind: "zone" as const, id: z.id }))),
      ]
      setSelection(mq.add ? [...selection, ...hits.filter(h => !selection.some(s => s.id === h.id))] : hits)
    }
    setMarquee(null)
  }
  const endDragRef = useRef(endDrag)
  endDragRef.current = endDrag
  useEffect(() => {
    const up = () => endDragRef.current()
    window.addEventListener("pointerup", up)
    return () => window.removeEventListener("pointerup", up)
  }, [])
  const onSVGMouseUp = useCallback(() => endDragRef.current(), [])

  const onSVGMouseDown = useCallback((e: React.PointerEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    hasDraggedRef.current = false
    // Pressing on an empty part of the board with the select tool can start a box-select (Shift adds to the selection)
    if (tool === "select" && e.button === 0 && !e.altKey) { const p = svgXY(e); marqueeRef.current = { x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, add: e.shiftKey } }
    if (tool === "shape" && shapeKind !== "polygon") {
      const { x, y } = svgXY(e)
      shapeDrawRef.current = { x1: x, y1: y }
    }
    if (tool === "zone") {
      const { x, y } = svgXY(e)
      const { x: px, y: py } = toPitch(geoRef.current, x, y)
      zoneDrawRef.current = { x: px, y: py }
    }
  }, [tool, shapeKind, svgXY])

  const onSVGClick = useCallback((e: React.PointerEvent) => {
    if (hasDraggedRef.current) return
    const { x, y } = svgXY(e)

    // A new player gets the lowest shirt number their own team isn't using yet
    const nextNum = (team: "home" | "away") => {
      const used = new Set(players.filter(q => teamOf(q) === team).map(q => q.num))
      let n = 1; while (used.has(String(n))) n++
      return String(n)
    }
    if (tool === "homePlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "", num: nextNum("home"), ...HOME_COLORS, ...teamKit("home"), glow: false, scale: 1, team: "home" }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id }); setTool("select")
    } else if (tool === "awayPlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "", num: nextNum("away"), ...AWAY_COLORS, ...teamKit("away"), glow: false, scale: 1, team: "away" }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id }); setTool("select")
    } else if (tool === "marker" || tool === "ball") {
      snapshot()
      const p: Player = tool === "marker"
        ? { id: uid(), x, y, kind: "marker", name: "", num: "", bg: MARKER_COLOR, fg: "#ffffff", ring: "#000000", glow: false, scale: 1 }
        : { id: uid(), x, y, kind: "ball", name: "", num: "", bg: "#ffffff", fg: "#000000", ring: "#000000", glow: false, scale: 1 }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id }); setTool("select")
    } else if (tool === "arrow") {
      if (!arrowDraft) {
        const P = pieceAt(players, x, y) // start on a piece and the line follows it
        setArrowDraft(P ? { x1: P.x, y1: P.y, fromId: P.id } : { x1: x, y1: y })
      } else {
        snapshot()
        const Q = pieceAt(players, x, y)
        const end = Q && Q.id !== arrowDraft.fromId ? Q : null
        const x2 = end ? end.x : x, y2 = end ? end.y : y
        const mx = (arrowDraft.x1 + x2) / 2
        const my = (arrowDraft.y1 + y2) / 2
        const a: Arrow = {
          id: uid(), x1: arrowDraft.x1, y1: arrowDraft.y1, x2, y2,
          cpx: mx, cpy: my,
          color: arrowDefaultColor, strokeW: arrowDefaultW, dash: arrowDefaultDash, label: "", twoWay: false,
          kind: arrowDefaultKind, ...(arrowNumbering ? { step: Math.max(0, ...arrows.map(o => o.step || 0)) + 1 } : {}),
          ...(arrowDraft.fromId ? { fromId: arrowDraft.fromId } : {}), ...(end ? { toId: end.id } : {}),
        }
        setArrows(prev => [...prev, a]); setSel({ kind: "arrow", id: a.id }); setArrowDraft(null)
      }
    } else if (tool === "text") {
      snapshot()
      const t: TextBox = {
        id: uid(), x, y, text: "",
        fg: "#ffffff", bg: "transparent", border: "transparent",
        dash: false, size: 15, bold: false, width: 300, layer: textLayer, noBox: true
      }
      setTexts(prev => [...prev, t]); setSel({ kind: "text", id: t.id }); setEditingText(t.id)
      setTool("select") // auto-switch so click-away doesn't spawn another text box
    } else if (tool === "shape" && shapeKind === "polygon") {
      if (e.detail === 2) {
        if (polyDraft && polyDraft.length >= 3) {
          snapshot()
          const s: Shape = {
            id: uid(), kind: "polygon", pts: polyDraft, closed: true,
            x: 0, y: 0, w: 0, h: 0,
            fill: SHAPE_FILLS[shapes.length % SHAPE_FILLS.length],
            fillOpacity: 0.35, stroke: "#fbbf24", strokeW: 2, strokeDash: false, label: ""
          }
          setShapes(prev => [...prev, s]); setSel({ kind: "shape", id: s.id })
        }
        setPolyDraft(null)
      } else {
        setPolyDraft(prev => [...(prev ?? []), [x, y]])
      }
    } else if (tool === "select") {
      setSel(null)
    }
  }, [tool, shapeKind, players, arrowDraft, polyDraft, shapes.length, textLayer, svgXY, snapshot, arrowDefaultDash, arrowDefaultColor, arrowDefaultW, arrowDefaultKind, arrowNumbering, arrows,
      homeColor, homePat, homeC2, homeNum, awayColor, awayPat, awayC2, awayNum])

  /* ── Canvas pan (alt+drag, middle-button, or pan tool) ── */
  const onCanvasMouseDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.altKey && e.button === 0) || tool === "pan") {
      e.preventDefault()
      userViewRef.current = true
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY }
    }
  }
  const onCanvasMouseMove = (e: React.PointerEvent) => {
    if (panDragRef.current) {
      const d = panDragRef.current
      setPanX(d.startPanX + (e.clientX - d.startX))
      setPanY(d.startPanY + (e.clientY - d.startY))
    }
  }
  const onCanvasMouseUp = () => { panDragRef.current = null }

  /* ── Element drag starts ── */
  // Pressing on a piece selects it (or keeps the selection it's part of); dragging then moves everything selected together.
  // With another tool picked, the press goes through to the board, so a zone or shape can start on top of a piece.
  const startDrag = (e: React.PointerEvent, kind: SelItem["kind"], id: string, _ex?: number, _ey?: number) => {
    if ((kind !== "text" && tool !== "select") || e.button !== 0) return
    e.stopPropagation()
    if (e.shiftKey) return // Shift+click adds or removes it (the piece handles that itself)
    const keep = isSel(id)
    const items: SelItem[] = keep ? selection : [{ kind, id }]
    if (!keep) setSelection(items)
    const { x, y } = svgXY(e)
    moveRef.current = { x, y, sx: e.clientX, sy: e.clientY, live: false, item: { kind, id }, keep: keep && selection.length > 1, base: selectedBase(withLinked(items)) }
    dragRef.current = { kind: "move", id, ox: 0, oy: 0 }
  }

  /* ── Image upload ── */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      if (!src) return
      const img = new Image()
      img.onload = () => {
        snapshot()
        const aspect = img.naturalWidth / img.naturalHeight
        const w = Math.min(400, img.naturalWidth)
        const h = w / aspect
        const newImg: UploadedImage = {
          id: uid(), x: frame.x + frame.w / 2 - w / 2, y: frame.y + frame.h / 2 - h / 2,
          width: w, height: h, src,
          opacity: 1, layer: "overlay",
          naturalW: img.naturalWidth, naturalH: img.naturalHeight
        }
        setImages(prev => [...prev, newImg])
        setSel({ kind: "image", id: newImg.id })
      }
      img.src = src
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  /* ── Export ── */
  const doExport = async (fmt: "png" | "jpeg" | "pdf" | "copy") => {
    if (!pitchRef.current) return
    const node = pitchRef.current
    const keepSelection = selection
    const name = (title.trim() || "PitchStudio board").replace(/[\\/:*?"<>|]+/g, "").slice(0, 80) // the file is named after the board
    try {
      // No selection rings or handles in the picture
      setSelection([])
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      // The board's fonts go into the picture too, otherwise numbers and names come out in a fallback font (fetched once)
      if (!exportFontCSS) exportFontCSS = getFontEmbedCSS(document.body).catch(() => { exportFontCSS = null; return "" })
      const fontEmbedCSS = await exportFontCSS
      // What you see is what you export: the frame, at its export size, tilted if 3D is on
      const size = FRAME_SIZES[frameRatio]
      const opts = {
        fontEmbedCSS,
        ...(size ? { canvasWidth: size[0], canvasHeight: size[1], pixelRatio: 1 } : { pixelRatio: 2 }),
        // 3D: the tilt as on screen, a little smaller so the near edge stays in the picture, with the corners in the canvas colour
        ...(view3d ? { backgroundColor: bgColor, style: { transform: `${UPRIGHT_3D} scale(0.86)`, transformOrigin: "center center" } } : {}),
      }
      if (fmt === "copy") {
        const blob = await toBlob(node, opts)
        if (!blob) throw new Error("no image")
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
        setExportNote("Copied to the clipboard")
      } else if (fmt === "png") {
        const url = await toPng(node, opts)
        const a = document.createElement("a"); a.href = url; a.download = `${name}.png`; a.click()
      } else if (fmt === "jpeg") {
        const url = await toJpeg(node, { ...opts, quality: 0.95, backgroundColor: bgColor })
        const a = document.createElement("a"); a.href = url; a.download = `${name}.jpg`; a.click()
      } else {
        const url = await toPng(node, opts)
        const img = new Image(); img.src = url
        await new Promise(r => { img.onload = r })
        const { default: jsPDF } = await import("jspdf") // the PDF maker is only downloaded when someone exports a PDF
        const pdf = new jsPDF({ orientation: img.width >= img.height ? "landscape" : "portrait", unit: "px", format: [img.width, img.height] })
        pdf.addImage(url, "PNG", 0, 0, img.width, img.height)
        pdf.save(`${name}.pdf`)
      }
      // The next export carries the next number
      if (editorial && showEdition) { try { localStorage.setItem(EDITION_KEY, String(editionNo)) } catch { /* storage blocked */ } setEditionNo(editionNo + 1) }
      ;(window as any).posthog?.capture("board_exported", { format: fmt })
    } catch (err) {
      console.error(err)
      setExportNote(fmt === "copy" ? "Couldn't copy: your browser didn't allow it. Use PNG instead." : `Couldn't export the ${fmt.toUpperCase()}. Try again.`)
    }
    finally { setSelection(keepSelection) }
  }
  useEffect(() => { if (!exportNote) return; const t = setTimeout(() => setExportNote(""), 3200); return () => clearTimeout(t) }, [exportNote])

  /* ── Steps ── */
  const playRaf = useRef(0) // the animation frame while the move plays on the board
  const cancelMakeRef = useRef(false)
  /** Puts a step on the board */
  const loadStep = (f: BoardStep) => { setPlayers(f.players); setArrows(f.arrows); setTexts(f.texts); setShapes(f.shapes); setCustomZones(f.customZones) }
  const stopPlay = () => { cancelAnimationFrame(playRaf.current); playRaf.current = 0; setPlay(null) }
  useEffect(() => () => cancelAnimationFrame(playRaf.current), [])
  /** Shows another step (the one on screen is kept just as it is) */
  const goStep = (i: number) => {
    if (playRaf.current) stopPlay()
    if (stepList.length < 2 || i === stepIdx || i < 0 || i >= stepList.length) return
    setSteps(stepList); loadStep(stepList[i]); setStepIdx(i)
    setSelection([]); setArrowDraft(null); setPolyDraft(null); editRef.current = null
  }
  /** Adds the next step after the one on screen: everyone makes the runs drawn for them and the ball follows its passes. One undo step. */
  const addStep = () => {
    const list = stepList.length > 1 ? stepList : [{ players, arrows, texts, shapes, customZones, note: "" }]
    if (list.length >= MAX_STEPS) return
    if (playRaf.current) stopPlay()
    undoPoint()
    const at = stepList.length > 1 ? stepIdx : 0, next = nextStep(list[at])
    setSteps([...list.slice(0, at + 1), next, ...list.slice(at + 1)]); loadStep(next); setStepIdx(at + 1)
    setSelection([]); setArrowDraft(null); setPolyDraft(null)
  }
  /** Deletes the step on screen; with one step left the board has no steps any more. One undo step. */
  const deleteStep = () => {
    if (stepList.length < 2) return
    undoPoint()
    const list = stepList.filter((_, i) => i !== stepIdx), i = Math.min(stepIdx, list.length - 1)
    loadStep(list[i]); setSteps(list.length > 1 ? list : []); setStepIdx(list.length > 1 ? i : 0); setSelection([])
  }
  const setStepNote = (note: string) => { undoPoint("stepNote" + stepIdx); setSteps(l => l.map((f, i) => (i === stepIdx ? { ...f, note } : f))) }
  /** Plays the move on the board, once */
  const startPlay = () => {
    if (!timeline || making) return
    setSelection([]); setArrowDraft(null); setPolyDraft(null)
    const t0 = performance.now(), total = timeline.total
    const tick = () => {
      const t = (performance.now() - t0) / 1000
      if (t >= total) { playRaf.current = 0; setPlay(null); return }
      setPlay({ t }); playRaf.current = requestAnimationFrame(tick)
    }
    playRaf.current = requestAnimationFrame(tick)
  }
  // The keyboard reads these when a key is pressed, so it always has the latest
  const stepKeysRef = useRef<{ busy: () => boolean; stop: () => void; play: () => void; go: (d: number) => void }>({ busy: () => false, stop: () => {}, play: () => {}, go: () => {} })
  stepKeysRef.current = {
    busy: () => !!playRaf.current || !!making,
    stop: () => { if (playRaf.current) stopPlay() },
    play: () => (playRaf.current ? stopPlay() : startPlay()),
    go: d => goStep(stepIdx + d),
  }
  /** Makes the move into a looping GIF or an MP4 video, frame by frame, exactly as the board shows it (the end card too) */
  const exportMotion = async (fmt: "gif" | "mp4") => {
    const tl = timeline, node = pitchRef.current
    if (!tl || !node || making) return
    if (fmt === "mp4" && typeof VideoEncoder === "undefined") { setExportNote("Video needs Chrome, Edge or Safari. GIF works everywhere."); return }
    if (playRaf.current) stopPlay()
    const keepSelection = selection
    setSelection([]); setArrowDraft(null); setPolyDraft(null)
    cancelMakeRef.current = false
    setMaking({ fmt, done: 0 })
    try {
      if (!exportFontCSS) exportFontCSS = getFontEmbedCSS(document.body).catch(() => { exportFontCSS = null; return "" })
      const fontEmbedCSS = await exportFontCSS
      // The size: the export size, or the frame's own shape inside 1920 × 1080 (1080 × 1920 upright). A GIF is at most 1200 across.
      const size = FRAME_SIZES[frameRatio]
      const fit = frame.w >= frame.h ? Math.min(1920 / frame.w, 1080 / frame.h) : Math.min(1080 / frame.w, 1920 / frame.h)
      let W = size ? size[0] : 2 * Math.round((frame.w * fit) / 2), H = size ? size[1] : 2 * Math.round((frame.h * fit) / 2)
      if (fmt === "gif") { const g = Math.min(1, 1200 / Math.max(W, H)); W = Math.round(W * g); H = Math.round(H * g) }
      const shot = async (t: number) => {
        setPlay({ t })
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        return nodeToCanvas(node, {
          fontEmbedCSS, canvasWidth: W, canvasHeight: H, pixelRatio: 1,
          ...(view3d ? { backgroundColor: bgColor, style: { transform: `${UPRIGHT_3D} scale(0.86)`, transformOrigin: "center center" } } : {}),
        })
      }
      const pixels = (c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, W, H).data
      let blob: Blob
      if (fmt === "gif") {
        // When each frame shows: a step that stands still is one frame; movement and the end card are 20 frames a second
        const times: { t: number; d: number }[] = []
        for (const p of tl.parts) {
          const moving = p.kind === "move" ? p.d : p.kind === "end" ? Math.min(p.d, END_CARD_ANIM) : 0, n = Math.round(moving * 20)
          for (let j = 0; j < n; j++) times.push({ t: p.t + (j / n) * moving, d: moving / n })
          if (p.d > moving) times.push({ t: p.t + moving + 0.001, d: p.d - moving })
        }
        // One palette for the whole GIF, from every step, the middle of every move and the end card
        const samples: Uint8ClampedArray[] = []
        for (const p of tl.parts) {
          if (cancelMakeRef.current) throw new Error("cancelled")
          samples.push(pixels(await shot(p.kind === "move" ? p.t + p.d / 2 : p.t + p.d - 0.001)))
        }
        const pal = gifPalette(samples), index = gifIndexer(pal), gif = gifWriter(W, H, pal)
        let clock = 0
        for (let j = 0; j < times.length; j++) {
          if (cancelMakeRef.current) throw new Error("cancelled")
          const idx = new Uint8Array(W * H)
          index(pixels(await shot(times[j].t)), idx)
          gif.add(idx, Math.round((clock + times[j].d) * 100) - Math.round(clock * 100)) // hundredths of a second, without rounding drift
          clock += times[j].d
          setMaking({ fmt, done: (j + 1) / times.length })
        }
        blob = new Blob([gif.finish()] as BlobPart[], { type: "image/gif" })
      } else {
        // H.264 where the browser has it (what X, Instagram and TikTok want), otherwise VP9
        let config: VideoEncoderConfig | null = null
        for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.420028", "vp09.00.40.08"]) {
          const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate: 8000000, framerate: 30, ...(codec.startsWith("avc1") ? { avc: { format: "avc" as const } } : {}) }
          try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break } } catch { /* try the next one */ }
        }
        if (!config) throw new Error("no video codec")
        const frames: { data: Uint8Array; key: boolean }[] = []
        let desc: Uint8Array | null = null, failed: unknown = null
        const enc = new VideoEncoder({
          output: (chunk, meta) => {
            const d = meta?.decoderConfig?.description
            if (d && !desc) desc = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)) : new Uint8Array(d)
            const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); frames.push({ data, key: chunk.type === "key" })
          },
          error: e => { failed = e },
        })
        enc.configure(config)
        const n = Math.ceil(tl.total * 30)
        // A moment where nothing moves is drawn once and repeated
        const still = (t: number) => { const p = tl.parts.find(x => t < x.t + x.d) ?? tl.parts[tl.parts.length - 1]; return p.kind === "hold" || (p.kind === "end" && t - p.t >= END_CARD_ANIM) ? p : null }
        let canvas: HTMLCanvasElement | null = null, held: unknown = null
        for (let j = 0; j < n; j++) {
          if (cancelMakeRef.current || failed) break
          const t = j / 30, st = still(t)
          if (!canvas || !st || st !== held) canvas = await shot(t)
          held = st
          const vf = new VideoFrame(canvas, { timestamp: Math.round((j * 1000000) / 30), duration: Math.round(1000000 / 30) })
          enc.encode(vf, { keyFrame: j % 60 === 0 }); vf.close()
          while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5))
          setMaking({ fmt, done: (j + 1) / n })
        }
        if (!cancelMakeRef.current && !failed) await enc.flush()
        enc.close()
        if (cancelMakeRef.current) throw new Error("cancelled")
        if (failed || frames.length === 0) throw failed ?? new Error("no frames")
        blob = mp4File({ w: W, h: H, fps: 30, codec: config.codec, config: desc, frames })
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = `${safeFileName(title)}.${fmt}`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      // The next export carries the next number
      if (editorial && showEdition) { try { localStorage.setItem(EDITION_KEY, String(editionNo)) } catch { /* storage blocked */ } setEditionNo(editionNo + 1) }
      ;(window as any).posthog?.capture("board_exported", { format: fmt, steps: tl.frames.length })
    } catch (err) {
      if (!cancelMakeRef.current) { console.error(err); setExportNote(fmt === "mp4" ? "Couldn't make the video in this browser. Try GIF." : "Couldn't make the GIF. Try again.") }
    } finally {
      setPlay(null); setMaking(null); setSelection(keepSelection)
    }
  }
  /* ── Templates ── */
  const getCanvasState = (): CanvasState => ({
    players, arrows, texts, shapes, images, title, bgColor, showPitch,
    customZones, settings: collectBoard().settings,
    ...(stepList.length > 1 ? { steps: stepList, step: stepIdx } : {}),
  })
  const saveTemplate = (name: string) => {
    const t: Template = { id: uid(), name, data: getCanvasState(), published: false, createdAt: Date.now() }
    saveTemplates([...templates, t])
  }
  const loadTemplate = async (t: Template) => {
    if (!(await confirmLeave())) return
    const d = t.data
    // Older templates only stored the background and pitch visibility: keep today's look for everything else
    const current = collectBoard().settings
    const settings = d.settings ?? { ...current, bgColor: d.bgColor ?? current.bgColor, showPitch: d.showPitch ?? current.showPitch }
    // A template starts a new board, so it can never overwrite a board you've already saved
    openBoard({ ...d, settings }, d.title ?? null, null, null, null)
    setShowTemplates(false)
  }
  const deleteTemplate = (id: string) => saveTemplates(templates.filter(t => t.id !== id))

  drawingRef.current = !!arrowDraft || !!polyDraft
  /* ── Selected element refs ── */
  const selP = sel?.kind === "player" ? players.find(p => p.id === sel.id) : null
  const selA = sel?.kind === "arrow" ? arrows.find(a => a.id === sel.id) : null
  const selT = sel?.kind === "text" ? texts.find(t => t.id === sel.id) : null
  const selS = sel?.kind === "shape" ? shapes.find(s => s.id === sel.id) : null
  const selI = sel?.kind === "image" ? images.find(i => i.id === sel.id) : null

  // Every edit in the side panel is its own undo step (typing a name or sliding a slider stays one step)
  const editKey = (patch: object) => `${sel!.kind}:${sel!.id}:${Object.keys(patch).sort().join(",")}`
  const updP = (patch: Partial<Player>) => { undoPoint(editKey(patch)); setPlayers(p => p.map(x => x.id === sel!.id ? { ...x, ...patch } : x)) }
  const updA = (patch: Partial<Arrow>) => { undoPoint(editKey(patch)); setArrows(a => a.map(x => x.id === sel!.id ? { ...x, ...patch } : x)) }
  const updT = (patch: Partial<TextBox>) => { undoPoint(editKey(patch)); setTexts(t => t.map(x => x.id === sel!.id ? { ...x, ...patch } : x)) }
  const updS = (patch: Partial<Shape>) => { undoPoint(editKey(patch)); setShapes(s => s.map(x => x.id === sel!.id ? { ...x, ...patch } : x)) }
  const updI = (patch: Partial<UploadedImage>) => { undoPoint(editKey(patch)); setImages(i => i.map(x => x.id === sel!.id ? { ...x, ...patch } : x)) }

  /* ── Transform string ── */
  const pitchTransform = [
    `translate(${panX}px, ${panY}px)`,
    `scale(${zoom})`,
  ].join(" ")

  const pitchInnerTransform = view3d ? UPRIGHT_3D : "none"

  /* ── Layer splits ── */
  const bgImages = images.filter(i => i.layer === "background")
  const ovImages = images.filter(i => i.layer === "overlay")
  /* ── What the board shows: the live board, or one moment of the move while it plays or is exported ── */
  const view = play && timeline ? viewAt(timeline, play.t) : null
  const shown = view ?? { players, arrows, texts, shapes, customZones, fade: new Map<string, number>() }
  const legendArrows = stepList.length > 1 ? stepList.flatMap(f => f.arrows) : arrows // the legend covers every step, so it stays put while the move plays
  const legendGhosts = (stepList.length > 1 ? stepList.flatMap(f => f.players) : players).some(p => p.ghost)
  /** The part of the pitch in view: all of it, a half or a third */
  const partRect = (() => {
    const part = focus === "half" ? PW / 2 : focus === "third" ? PW / 3 : PW
    const [x1, x2] = focusEnd === "attack" ? [PW - part, PW] : [0, part]
    return pitchRect(geo, x1, 0, x2, PH)
  })()

  /* ─────────── RENDER ─────────── */
  return (
    <div className="flex flex-col h-screen overflow-hidden select-none"
      style={{ fontFamily: "'Inter', sans-serif", background: SURFACE_BASE, color: TEXT_PRIMARY }}>

      {/* ── Top Header ── (on narrower screens Templates, My Boards, undo and redo move into the ⋯ menu) */}
      <header className="flex items-center gap-2 lg:gap-3 px-2 sm:px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: DS_BORDER, background: SURFACE_1, minHeight: 48 }}>
        {headerMenu && <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(null)} />}
        {/* Logo (goes Home) + title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button className="flex-shrink-0 rounded" aria-label="Home" title="Home"
            onClick={async () => { if (await confirmLeave()) navigateBoard("/") }}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex" }}><Mark size={28} color={ACCENT_SOLID} /></button>
          {editingTitle ? (
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => { if (e.key === "Enter") setEditingTitle(false) }}
              className="bg-transparent outline-none font-bold text-sm min-w-0"
              style={{ borderBottom: `1px solid ${ACCENT_SOLID}`, color: TEXT_PRIMARY, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", width: 200 }} />
          ) : (
            <button onClick={() => setEditingTitle(true)}
              className="flex items-center gap-1.5 group px-2 py-1 rounded hover:bg-[var(--ps-hover)] transition-colors min-w-0"
              title="Click to rename">
              <span className="font-bold text-sm truncate max-w-40 xl:max-w-72"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em" }}>{title}</span>
              <Pencil size={11} className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" style={{ color: ACCENT_SOLID }} />
            </button>
          )}
        </div>


        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Templates */}
          <button onClick={() => setShowTemplates(true)} title="Templates"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
            style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
            <BookOpen size={13} /> <span className="hidden xl:inline">Templates</span>
          </button>
          {/* My Boards */}
          {authUser && (
            <button onClick={() => setShowMyBoards(true)} title="My Boards"
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
              <FolderOpen size={13} /> <span className="hidden xl:inline">My Boards</span>
            </button>
          )}
          {/* Undo/Redo */}
          <button onClick={undo} className="hidden lg:block p-1.5 rounded hover:bg-[var(--ps-hover)] transition-colors" title="Undo (Ctrl+Z)"><RotateCcw size={14} /></button>
          <button onClick={redo} className="hidden lg:block p-1.5 rounded hover:bg-[var(--ps-hover)] transition-colors" title="Redo"><RotateCw size={14} /></button>
          <div className="hidden lg:flex self-stretch items-center mx-1" style={{ width: 1, background: DS_BORDER }} />
          {/* Save: outlined while there's something to save, quiet once it's saved */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-stretch">
              <button onClick={() => saveBoard()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: saveStatus === "error" ? DS_ERROR : SURFACE_2,
                  color: saveStatus === "error" ? "#ffffff" : savedNow ? TEXT_MUTED : TEXT_PRIMARY,
                  boxShadow: saveStatus !== "error" && !savedNow ? `inset 0 0 0 1px ${ACCENT_SOLID}` : "none",
                  opacity: saveStatus === "saving" ? 0.7 : 1,
                  borderRadius: currentBoardId ? "6px 0 0 6px" : 6,
                }}>
                {saveStatus === "error" ? <AlertCircle size={13} /> : currentBoardId && !changedSinceSave && saveStatus === "idle" ? <Check size={13} /> : <Save size={13} />}
                {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Save failed" : currentBoardId && !changedSinceSave ? "Saved" : "Save"}
              </button>
              {currentBoardId && (
                <div className="relative">
                  <button
                    onClick={() => setShowSaveMenu(v => !v)}
                    className="flex items-center px-1.5 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: saveStatus === "error" ? DS_ERROR : SURFACE_2,
                      color: saveStatus === "error" ? "#ffffff" : TEXT_MUTED,
                      borderLeft: `1px solid ${DS_BORDER}`,
                      borderRadius: "0 6px 6px 0",
                    }}
                    title="Save as new board">
                    <ChevronDown size={12} />
                  </button>
                  {showSaveMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSaveMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 rounded-lg border shadow-xl z-50 overflow-hidden"
                        style={{ background: SURFACE_1, borderColor: DS_BORDER, minWidth: 148 }}>
                        <button
                          onClick={() => saveBoard(true)}
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors hover:bg-[var(--ps-hover)]"
                          style={{ color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
                          <Save size={12} /> Save as new board
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {!authUser && (
            <button onClick={() => navigateBoard("/signin")}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
              <LogIn size={13} /> Sign In
            </button>
          )}
          {/* Export: the one solid button */}
          <div className="relative">
            <button data-tour="export" onClick={() => setHeaderMenu(m => (m === "export" ? null : "export"))} aria-expanded={headerMenu === "export"} title="Export"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors hover:brightness-110"
              style={{ background: ACCENT_SOLID, color: ACCENT_INK }}>
              <Download size={13} /> <span className="hidden sm:inline">Export</span> <ChevronDown size={11} />
            </button>
            {headerMenu === "export" && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded shadow-xl border z-50 flex flex-col"
                style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
                {(["png", "jpeg", "pdf", "gif", "mp4", "copy"] as const).map(f => {
                  const off = (f === "gif" || f === "mp4") && stepList.length < 2 // a GIF or a video needs a move: 2 steps or more
                  return (
                    <button key={f} title={off ? "Add a step first, with + Step under the board" : undefined}
                      onClick={() => { setHeaderMenu(null); if (off) setExportNote("Add a step first: + Step under the board."); else if (f === "gif" || f === "mp4") exportMotion(f); else doExport(f) }}
                      className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-[var(--ps-hover)] transition-colors text-left uppercase font-semibold"
                      style={{ letterSpacing: "0.06em", opacity: off ? 0.45 : 1, ...(f === "gif" || f === "copy" ? { borderTop: `1px solid ${DS_BORDER}` } : {}) }}>
                      {f === "copy" ? <Copy size={12} /> : f === "mp4" ? <Video size={12} /> : <FileImage size={12} />} {f === "copy" ? "Copy image" : f === "mp4" ? "Video (MP4)" : f}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {/* ⋯ More: clearing the board, your account, and on narrower screens what doesn't fit in the bar */}
          <div className="relative">
            <button onClick={() => setHeaderMenu(m => (m === "more" ? null : "more"))} aria-expanded={headerMenu === "more"}
              aria-label="More" title="More"
              className="p-1.5 rounded hover:bg-[var(--ps-hover)] transition-colors" style={{ color: TEXT_PRIMARY }}>
              <MoreHorizontal size={16} />
            </button>
            {headerMenu === "more" && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-lg shadow-xl border z-50 flex flex-col py-1"
                style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
                {authUser && (
                  <p className="px-3 py-2 text-xs truncate" style={{ color: TEXT_MUTED, borderBottom: `1px solid ${DS_BORDER}` }}>
                    Signed in as <span style={{ color: TEXT_PRIMARY }}>{accountName || authUser.email?.split("@")[0]}</span>
                  </p>
                )}
                {([
                  { label: "Templates", icon: <BookOpen size={13} />, run: () => setShowTemplates(true), narrow: true },
                  ...(authUser ? [{ label: "My Boards", icon: <FolderOpen size={13} />, run: () => setShowMyBoards(true), narrow: true }] : []),
                  { label: "Undo", icon: <RotateCcw size={13} />, run: undo, narrow: true },
                  { label: "Redo", icon: <RotateCw size={13} />, run: redo, narrow: true },
                  ...(authUser ? [
                    { label: "New board", icon: <Plus size={13} />, run: async () => { if (await confirmLeave()) navigateBoard("/board") } },
                    { label: "Braindump", icon: <Pencil size={13} />, run: async () => { if (await confirmLeave()) navigateBoard("/braindump") } },
                    { label: "Creator profile", icon: <Settings size={13} />, run: async () => { if (await confirmLeave()) navigateBoard("/profile") } },
                  ] : []),
                  { label: theme === "night" ? "Day mode" : "Night mode", icon: theme === "night" ? <Sun size={13} /> : <Moon size={13} />, run: toggleTheme },
                  ...(authUser ? [{ label: "Take the tour", icon: <HelpCircle size={13} />, run: () => setShowTour(true) }] : []),
                  { label: "Clear board", icon: <Trash2 size={13} />, run: () => setShowClearConfirm(true), danger: true },
                  authUser
                    ? { label: "Sign Out", icon: <LogOut size={13} />, run: async () => { if (await confirmLeave()) supabase.auth.signOut() }, danger: true }
                    : { label: "Sign In", icon: <LogIn size={13} />, run: () => navigateBoard("/signin") },
                ] as { label: string; icon: React.ReactNode; run: () => void; danger?: boolean; narrow?: boolean }[]).map(item => (
                  <button key={item.label} onClick={() => { setHeaderMenu(null); item.run() }}
                    className={`${item.narrow ? "lg:hidden " : ""}flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--ps-hover)]`}
                    style={{ color: item.danger ? DS_ERROR : TEXT_PRIMARY }}>
                    {item.icon} {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Icon Rail ── */}
        <div style={{ width: 52, flexShrink: 0, height: "100%", background: SURFACE_1, borderRight: `1px solid ${DS_BORDER}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8, paddingBottom: 8 }}>
          <style>{`
            .rl-wrap { position: relative; width: 100%; display: flex; justify-content: center; margin-bottom: 2px; }
            .rl-tip { display: none; position: absolute; left: calc(100% + 6px); top: 50%; transform: translateY(-50%); background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; border-radius: 6px; padding: 5px 9px; font-size: 11px; color: ${TEXT_PRIMARY}; white-space: nowrap; z-index: 200; pointer-events: none; font-family: 'Inter', sans-serif; }
            .rl-wrap:hover .rl-tip { display: block; }
            @media (max-height: 640px) { .rl-wrap { margin-bottom: 0; } .rl-wrap > button { height: 32px !important; } }
          `}</style>

          {([
            { id: "select" as Tool, ic: <MousePointer2 size={17} />, lbl: "Select", sc: "V", tint: TEXT_MUTED as string },
            { id: "pan" as Tool, ic: <Hand size={17} />, lbl: "Pan", sc: "H", tint: TEXT_MUTED as string },
          ]).map(btn => (
            <div key={btn.id} className="rl-wrap">
              <button aria-label={btn.lbl} aria-pressed={tool === btn.id}
                onClick={() => { setTool(btn.id); setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null; setShapeDraftPreview(null) }}
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: tool === btn.id ? ACCENT_GRADIENT : "transparent", color: tool === btn.id ? ACCENT_INK : btn.tint, transition: "background 0.12s, color 0.12s" }}
                onMouseEnter={e => { if (tool !== btn.id) { (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2; (e.currentTarget as HTMLButtonElement).style.color = TEXT_PRIMARY } }}
                onMouseLeave={e => { if (tool !== btn.id) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = btn.tint } }}>
                {btn.ic}
              </button>
              <div className="rl-tip">{btn.lbl} <span style={{ opacity: 0.5 }}>{btn.sc}</span></div>
            </div>
          ))}

          <div style={{ width: 24, height: 1, background: DS_BORDER, margin: "6px auto" }} />

          {([
            { id: "homePlayer" as Tool, ic: <UserPlus size={17} />, lbl: "Home player", sc: "1", tint: homeColor },
            { id: "awayPlayer" as Tool, ic: <UserPlus size={17} />, lbl: "Away player", sc: "2", tint: awayColor },
            { id: "marker" as Tool, ic: <X size={17} strokeWidth={3} />, lbl: "✕ marker", sc: "X", tint: MARKER_COLOR },
            { id: "ball" as Tool, ic: <svg width={17} height={17} viewBox="-12 -12 24 24"><BallGlyph r={10} icon /></svg>, lbl: "Ball", sc: "B", tint: TEXT_PRIMARY },
          ]).map(btn => (
            <div key={btn.id} className="rl-wrap">
              <button aria-label={btn.lbl} aria-pressed={tool === btn.id}
                onClick={() => { setTool(btn.id); setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null; setShapeDraftPreview(null) }}
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: tool === btn.id ? ACCENT_GRADIENT : "transparent", color: tool === btn.id ? ACCENT_INK : btn.tint, transition: "background 0.12s, color 0.12s" }}
                onMouseEnter={e => { if (tool !== btn.id) { (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2; (e.currentTarget as HTMLButtonElement).style.color = TEXT_PRIMARY } }}
                onMouseLeave={e => { if (tool !== btn.id) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = btn.tint } }}>
                {btn.ic}
              </button>
              <div className="rl-tip">{btn.lbl} <span style={{ opacity: 0.5 }}>{btn.sc}</span></div>
            </div>
          ))}

          <div style={{ width: 24, height: 1, background: DS_BORDER, margin: "6px auto" }} />

          {([
            { id: "arrow" as Tool, ic: <ArrowUpRight size={17} />, lbl: "Arrow", sc: "A" },
            { id: "text" as Tool, ic: <Type size={17} />, lbl: "Text", sc: "T" },
            { id: "shape" as Tool, ic: <Pentagon size={17} />, lbl: "Shapes", sc: "S" },
            { id: "zone" as Tool, ic: <Square size={17} />, lbl: "Zone", sc: "Z" },
          ]).map(btn => (
            <div key={btn.id} className="rl-wrap">
              <button aria-label={btn.lbl} aria-pressed={tool === btn.id}
                onClick={() => { setTool(btn.id); setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null; setShapeDraftPreview(null) }}
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: tool === btn.id ? ACCENT_GRADIENT : "transparent", color: tool === btn.id ? ACCENT_INK : TEXT_MUTED, transition: "background 0.12s, color 0.12s" }}
                onMouseEnter={e => { if (tool !== btn.id) { (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2; (e.currentTarget as HTMLButtonElement).style.color = TEXT_PRIMARY } }}
                onMouseLeave={e => { if (tool !== btn.id) { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED } }}>
                {btn.ic}
              </button>
              <div className="rl-tip">{btn.lbl} <span style={{ opacity: 0.5 }}>{btn.sc}</span></div>
            </div>
          ))}

          <div style={{ width: 24, height: 1, background: DS_BORDER, margin: "6px auto" }} />

          <div className="rl-wrap">
            <button aria-label="Upload image"
              onClick={() => fileInputRef.current?.click()}
              style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: TEXT_MUTED, transition: "background 0.12s, color 0.12s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2; (e.currentTarget as HTMLButtonElement).style.color = TEXT_PRIMARY }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED }}>
              <ImagePlus size={17} />
            </button>
            <div className="rl-tip">Upload image <span style={{ opacity: 0.5 }}>I</span></div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />

          <div style={{ flex: 1 }} />

          <div className="rl-wrap" style={{ marginBottom: 0 }}>
            <button aria-label={panelOpen ? "Collapse panel" : "Expand panel"}
              onClick={() => setPanelOpen(v => !v)}
              style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: TEXT_MUTED, transition: "background 0.12s, color 0.12s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2; (e.currentTarget as HTMLButtonElement).style.color = TEXT_PRIMARY }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED }}>
              {panelOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
            </button>
            <div className="rl-tip">{panelOpen ? "Collapse panel" : "Expand panel"}</div>
          </div>

          <div style={{ width: 24, height: 1, background: DS_BORDER, margin: "6px auto" }} />

          <div className="rl-wrap" style={{ marginBottom: 0 }}>
            <button aria-label="Keyboard shortcuts"
              onClick={() => setShowShortcuts(true)}
              style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: TEXT_MUTED, transition: "background 0.12s, color 0.12s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2; (e.currentTarget as HTMLButtonElement).style.color = TEXT_PRIMARY }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED }}>
              <HelpCircle size={17} />
            </button>
            <div className="rl-tip">Keyboard shortcuts</div>
          </div>
        </div>

        {panelOpen && (
        <aside style={{ width: 248, flexShrink: 0, height: "100%", background: SURFACE_BASE, borderRight: `1px solid ${DS_BORDER}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${DS_BORDER}`, flexShrink: 0 }}>
            {(["board", "selected"] as const).map(t => (
              <button key={t} onClick={() => setSideTab(t)}
                style={{ flex: 1, height: 36, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", border: "none", cursor: "pointer", background: "transparent", color: sideTab === t ? TEXT_PRIMARY : TEXT_MUTED, borderBottom: sideTab === t ? `2px solid ${ACCENT_SOLID}` : "2px solid transparent", fontFamily: "'Inter', sans-serif", transition: "color 0.12s" }}>
                {t === "selected" ? "EDIT" : "BOARD"}
              </button>
            ))}
          </div>

          {/* ── SELECTED TAB ── */}
          {sideTab === "selected" && <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {selection.length > 1 ? (
              (() => {
                const selPlayerIds = selection.filter(s => s.kind === "player").map(s => s.id)
                const selPlayerCount = selPlayerIds.length
                return (
                  <div className="p-3 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>
                        {selection.length} selected
                      </p>
                      <button onClick={deleteSelected} className="p-1 rounded hover:bg-red-500/20 transition-colors" style={{ color: DS_ERROR }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Align</p>
                      {selPlayerCount >= 2 ? (
                        <>
                          <div className="flex gap-1.5">
                            <AlignBtn icon={AlignHorizontalJustifyStart} title="Same depth — deepest player" onClick={() => alignSelectedPlayers("left")} />
                            <AlignBtn icon={AlignHorizontalJustifyCenter} title="Same depth — average" onClick={() => alignSelectedPlayers("center")} />
                            <AlignBtn icon={AlignHorizontalJustifyEnd} title="Same depth — highest player" onClick={() => alignSelectedPlayers("right")} />
                            <AlignBtn icon={AlignVerticalJustifyStart} title="Same lane — top" onClick={() => alignSelectedPlayers("top")} />
                            <AlignBtn icon={AlignVerticalJustifyCenter} title="Same lane — middle" onClick={() => alignSelectedPlayers("middle")} />
                            <AlignBtn icon={AlignVerticalJustifyEnd} title="Same lane — bottom" onClick={() => alignSelectedPlayers("bottom")} />
                          </div>
                          {selPlayerCount >= 3 && (
                            <>
                              <p className="text-xs font-semibold uppercase mt-1" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Distribute</p>
                              <div className="flex gap-1.5">
                                <AlignBtn icon={AlignHorizontalDistributeCenter} title="Even spacing across the pitch width" onClick={() => distributeSelectedPlayers("horizontal")} />
                                <AlignBtn icon={AlignVerticalDistributeCenter} title="Even spacing up the pitch" onClick={() => distributeSelectedPlayers("vertical")} />
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <p className="text-xs" style={{ color: TEXT_MUTED }}>Select 2 or more players to align them.</p>
                      )}
                    </div>
                    {(() => {
                      const ids = new Set(selPlayerIds)
                      const pcs = players.filter(p => ids.has(p.id) && !p.locked)
                      if (pcs.length < 2) return null
                      return (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Team shape</p>
                          <div className="flex gap-1.5">
                            <button onClick={() => connectPieces(false)} title="Join them with a line"
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-colors hover:brightness-110"
                              style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>
                              <Waypoints size={12} /> Line
                            </button>
                            <button onClick={() => connectPieces(true)} disabled={pcs.length < 3} title={pcs.length < 3 ? "Select 3 or more to make a shape" : "Join them in a shape"}
                              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-semibold transition-colors hover:brightness-110"
                              style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}`, opacity: pcs.length < 3 ? 0.4 : 1 }}>
                              <Pentagon size={12} /> Shape
                            </button>
                          </div>
                          <p className="text-xs" style={{ color: TEXT_MUTED }}>It stretches as they move. Drag it to move them together.</p>
                          {pcs.length === 2 && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs" style={{ color: TEXT_MUTED }}>Distance <span style={{ color: TEXT_PRIMARY, fontWeight: 700 }}>{metres(geo, Math.hypot(pcs[0].x - pcs[1].x, pcs[0].y - pcs[1].y))} m</span></span>
                              <button onClick={measurePieces} className="px-2 py-1 rounded text-xs hover:brightness-110" style={{ background: SURFACE_2, color: TEXT_MUTED }}>Show on board</button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })()
            ) : sel ? (
              <div className="p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>
                    {selP ? (selP.kind === "marker" ? "✕ marker" : selP.kind === "ball" ? "Ball" : selP.ghost ? "Ghost" : "Player") : selA ? "Arrow" : selT ? "Text" : selS ? (selS.ids ? (selS.closed === false ? "Team line" : "Team shape") : "Shape") : selI ? "Image" : sel.kind === "zone" ? "Zone" : "Element"}
                  </p>
                  <button onClick={deleteSelected} className="p-1 rounded hover:bg-red-500/20 transition-colors" style={{ color: DS_ERROR }}>
                    <Trash2 size={13} />
                  </button>
                </div>

                {selP && selP.kind === "marker" && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Label — shown below</span>
                      <input value={selP.name} onChange={e => updP({ name: e.target.value })}
                        placeholder="e.g. Space"
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    <ColorPicker label="Colour" colors={SWATCHES} selected={selP.bg} onSelect={c => updP({ bg: c })} />
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                      <input type="checkbox" checked={selP.glow || false} onChange={e => updP({ glow: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Glow highlight</span>
                    </label>
                  </div>
                )}

                {selP && selP.kind === "ball" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>Drag to move it. Drag the round handle to resize it.</p>
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                      <input type="checkbox" checked={selP.glow || false} onChange={e => updP({ glow: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Glow highlight</span>
                    </label>
                  </div>
                )}

                {selP && selP.kind !== "marker" && selP.kind !== "ball" && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Name — shown below</span>
                      <input value={selP.name} onChange={e => updP({ name: e.target.value })}
                        placeholder="e.g. Cubarsí"
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Number — shown in circle</span>
                      <input value={selP.num} onChange={e => updP({ num: e.target.value })}
                        placeholder="e.g. 4"
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    {(() => {
                      // The kit: the team's, a goalkeeper's, or the player's own. Colours only show for their own kit.
                      const team = teamOf(selP), tk = team ? kitOf(team) : null
                      const gk = GK_KITS.find(x => (selP.pat ?? "solid") === x.pat && selP.bg === x.c1 && (x.pat === "solid" || selP.bg2 === x.c2))
                      const mode = kitMode ?? (tk && wearsKit(selP, tk, team === "home" ? HOME_COLORS.bg : AWAY_COLORS.bg) ? "team" : gk ? "gk" : "own")
                      const row = (m: "team" | "gk" | "own", disc: React.ReactNode, text: string, note: string, run: () => void) => (
                        <button key={m} onClick={run} aria-pressed={mode === m}
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors"
                          style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${mode === m ? ACCENT_SOLID : DS_BORDER}` }}>
                          {disc}<span className="flex-1 font-semibold">{text}</span><span className="truncate" style={{ color: TEXT_MUTED, maxWidth: 80 }}>{note}</span>
                        </button>
                      )
                      const g0 = gk ?? GK_KITS[0]
                      return (
                        <>
                          <div className="flex flex-col gap-1">
                            <p className="text-xs" style={{ color: TEXT_MUTED }}>Kit</p>
                            {tk && team && row("team", <KitDisc id="sel-team" size={18} pat={tk.pat} c1={tk.c1} c2={tk.c2} />, "Team kit", (team === "home" ? homeName : awayName).trim() || (team === "home" ? "Home" : "Away"),
                              () => { setKitMode(null); updP(kitProps(tk)) })}
                            {row("gk", <KitDisc id="sel-gk" size={18} pat={g0.pat} c1={g0.c1} c2={g0.c2} />, "Goalkeeper kit", gk ? gk.name : "",
                              () => { setKitMode("gk"); if (!gk) updP(kitProps(GK_KITS[0])) })}
                            {row("own", <span className="flex items-center justify-center rounded-full" style={{ width: 18, height: 18, border: "1px dashed rgba(255,255,255,0.4)" }}><Plus size={10} /></span>, "Own kit", "",
                              () => setKitMode("own"))}
                          </div>
                          {mode === "gk" && (
                            <div className="flex flex-wrap" style={{ gap: 3 }}>
                              {GK_KITS.map(x => (
                                <button key={x.id} title={x.name} aria-label={`Goalkeeper kit: ${x.name}`} aria-pressed={gk?.id === x.id} onClick={() => updP(kitProps(x))}
                                  className="rounded-full transition-transform hover:scale-110" style={{ padding: 2, border: `2px solid ${gk?.id === x.id ? ACCENT_SOLID : "transparent"}`, background: "transparent" }}>
                                  <KitDisc id={`sel-${x.id}`} size={20} pat={x.pat} c1={x.c1} c2={x.c2} />
                                </button>
                              ))}
                            </div>
                          )}
                          {mode === "own" && (
                            <div className="flex flex-col gap-2">
                              <ColorPicker label="Kit colour" colors={SWATCHES} selected={selP.bg}
                                onSelect={c => updP({ bg: c, ...((selP.pat ?? "solid") === "solid" ? { fg: inkOn(c) } : {}) })} />
                              <PatternRow value={selP.pat ?? "solid"}
                                onChange={pt => updP(pt === "solid" ? { pat: undefined, bg2: undefined, outline: false } : { pat: pt, bg2: selP.bg2 ?? (selP.bg === "#ffffff" ? "#111111" : "#ffffff"), outline: true })} />
                              {(selP.pat ?? "solid") !== "solid" && (
                                <ColorPicker label="Second colour" colors={SWATCHES} selected={selP.bg2 ?? "#ffffff"} onSelect={c => updP({ bg2: c })} />
                              )}
                              <ColorPicker label="Number colour" colors={SWATCHES} selected={selP.fg} onSelect={c => updP({ fg: c })} />
                              <label className="flex items-center gap-2 text-xs cursor-pointer">
                                <input type="checkbox" checked={selP.outline || false} onChange={e => updP({ outline: e.target.checked })} className="accent-green-400" />
                                <span style={{ color: TEXT_PRIMARY }}>Number outline</span>
                              </label>
                              <ColorPicker label="Ring colour" colors={SWATCHES} selected={selP.ring} onSelect={c => updP({ ring: c })} allowTransparent={true} />
                            </div>
                          )}
                        </>
                      )
                    })()}
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                      <input type="checkbox" checked={selP.glow || false} onChange={e => updP({ glow: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Glow highlight</span>
                    </label>
                    <div className="flex flex-col gap-1.5 mt-1">
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>Ghost — where they were or will be</p>
                      {!selP.ghost && (
                        <div className="flex gap-1.5">
                          <button onClick={() => addGhost(selP, false)} className="flex-1 py-1.5 rounded text-xs font-semibold hover:brightness-110"
                            style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>+ Was here</button>
                          <button onClick={() => addGhost(selP, true)} className="flex-1 py-1.5 rounded text-xs font-semibold hover:brightness-110"
                            style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>+ Will be</button>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={selP.ghost || false} onChange={e => updP({ ghost: e.target.checked || undefined })} className="accent-green-400" />
                        <span style={{ color: TEXT_PRIMARY }}>Faded ghost</span>
                      </label>
                    </div>
                  </div>
                )}

                {selA && (
                  <div className="flex flex-col gap-2">
                    <Segmented label="Type" value={selA.kind ?? (selA.dash === "dashed" ? "run" : "pass")} options={LINE_KINDS}
                      onChange={k => updA({ kind: k, dash: LINE_PRESET[k].dash, strokeW: LINE_PRESET[k].strokeW })} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Step number</span>
                      <input type="number" min={1} value={selA.step ?? ""} placeholder="None"
                        onChange={e => updA({ step: e.target.value === "" ? undefined : Math.max(1, Math.round(+e.target.value)) })}
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    {(selA.fromId || selA.toId) && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>Follows {selA.fromId && selA.toId ? "two players" : "a player"}</span>
                        <button onClick={() => updA({ fromId: undefined, toId: undefined })}
                          className="px-2 py-1 rounded text-xs hover:brightness-110" style={{ background: SURFACE_2, color: TEXT_MUTED }}>Detach</button>
                      </div>
                    )}
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Label</span>
                      <input value={selA.label} onChange={e => updA({ label: e.target.value })}
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    <ColorPicker label="Colour" colors={SWATCHES} selected={selA.color} onSelect={c => updA({ color: c })} />
                    <div>
                      <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Style</p>
                      <div className="flex gap-1">
                        {(["none","dashed","dotted"] as const).map(s => (
                          <button key={s} onClick={() => updA({ dash: s })}
                            className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                            style={{ background: selA.dash === s ? ACCENT_GRADIENT : SURFACE_2, color: selA.dash === s ? ACCENT_INK : TEXT_MUTED }}>
                            {s === "none" ? "Solid" : s === "dashed" ? "Dashed" : "Dotted"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Width {selA.strokeW}px</span>
                      <input type="range" min={1} max={8} value={selA.strokeW}
                        onChange={e => updA({ strokeW: +e.target.value })} className="w-full accent-green-400" />
                    </label>
                    <div className="flex justify-between items-center mt-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={selA.twoWay} onChange={e => updA({ twoWay: e.target.checked })} className="accent-green-400" />
                        <span style={{ color: TEXT_PRIMARY }}>Two-way</span>
                      </label>
                      <button onClick={() => {
                        const mx = (selA.x1 + selA.x2) / 2; const my = (selA.y1 + selA.y2) / 2
                        const dx = selA.x2 - selA.x1; const dy = selA.y2 - selA.y1
                        const len = Math.sqrt(dx * dx + dy * dy) || 1
                        updA({ cpx: mx - (dy / len) * len * 0.25, cpy: my + (dx / len) * len * 0.25 })
                      }} className="px-2 py-1 rounded text-xs hover:brightness-110"
                        style={{ background: SURFACE_2, color: TEXT_MUTED }}>Curve</button>
                    </div>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={selA.dist || false} onChange={e => updA({ dist: e.target.checked || undefined })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Show length · {metres(geo, curveLen(selA))} m</span>
                    </label>
                    <p className="text-[10px] italic mt-1" style={{ color: TEXT_MUTED }}>Drag the handle on the arrow to curve manually.</p>
                  </div>
                )}

                {selT && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1.5">
                      <button onClick={() => updT({ noBox: false, bg: "rgba(13,17,23,0.85)", border: ACCENT_SOLID })}
                        className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                        style={{ background: !selT.noBox ? ACCENT_GRADIENT : SURFACE_2, color: !selT.noBox ? ACCENT_INK : TEXT_MUTED }}>
                        ▣ With Box
                      </button>
                      <button onClick={() => updT({ noBox: true, bg: "transparent", border: "transparent" })}
                        className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                        style={{ background: selT.noBox ? ACCENT_GRADIENT : SURFACE_2, color: selT.noBox ? ACCENT_INK : TEXT_MUTED }}>
                        T Free Text
                      </button>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Text (dbl-click to edit)</span>
                      <textarea value={selT.text} rows={3} onChange={e => updT({ text: e.target.value })}
                        className="rounded px-2 py-1 text-xs outline-none resize-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Font size {selT.size}px</span>
                      <input type="range" min={10} max={48} value={selT.size}
                        onChange={e => updT({ size: +e.target.value })} className="w-full accent-green-400" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Width {selT.width}px</span>
                      <input type="range" min={80} max={500} value={selT.width}
                        onChange={e => updT({ width: +e.target.value })} className="w-full accent-green-400" />
                    </label>
                    <ColorPicker label="Text colour" colors={SWATCHES} selected={selT.fg} onSelect={c => updT({ fg: c })} />
                    <ColorPicker label="Background" colors={SWATCHES} selected={selT.bg} onSelect={c => updT({ bg: c })} allowTransparent={true} />
                    <ColorPicker label="Border" colors={SWATCHES} selected={selT.border} onSelect={c => updT({ border: c })} allowTransparent={true} />
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={selT.bold} onChange={e => updT({ bold: e.target.checked })} className="accent-green-400" />
                        <span style={{ color: TEXT_PRIMARY }}>Bold</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={selT.dash} onChange={e => updT({ dash: e.target.checked })} className="accent-green-400" />
                        <span style={{ color: TEXT_PRIMARY }}>Dashed</span>
                      </label>
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Layer</p>
                      <div className="flex gap-1">
                        {(["foreground","background"] as const).map(l => (
                          <button key={l} onClick={() => updT({ layer: l })}
                            className="flex-1 py-1 rounded text-xs transition-colors"
                            style={{ background: selT.layer === l ? ACCENT_GRADIENT : SURFACE_2, color: selT.layer === l ? ACCENT_INK : TEXT_MUTED }}>
                            {l === "foreground" ? "Front" : "Behind"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {selS && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Label</span>
                      <input value={selS.label} onChange={e => updS({ label: e.target.value })}
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    {selS.ids && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>Follows {selS.ids.filter(Boolean).length} players</span>
                        <button onClick={() => updS({ ids: undefined })}
                          className="px-2 py-1 rounded text-xs hover:brightness-110" style={{ background: SURFACE_2, color: TEXT_MUTED }}>Detach</button>
                      </div>
                    )}
                    {selS.kind === "polygon" && (
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={selS.dist || false} onChange={e => updS({ dist: e.target.checked || undefined })} className="accent-green-400" />
                        <span style={{ color: TEXT_PRIMARY }}>Show distances in metres</span>
                      </label>
                    )}
                    {selS.closed !== false && (
                      <>
                        <ColorPicker label="Fill" colors={SWATCHES} selected={selS.fill} onSelect={c => updS({ fill: c })} />
                        <label className="flex flex-col gap-1">
                          <span className="text-xs" style={{ color: TEXT_MUTED }}>Opacity {Math.round(selS.fillOpacity * 100)}%</span>
                          <input type="range" min={5} max={95} value={Math.round(selS.fillOpacity * 100)}
                            onChange={e => updS({ fillOpacity: +e.target.value / 100 })} className="w-full accent-green-400" />
                        </label>
                      </>
                    )}
                    <ColorPicker label={selS.closed === false ? "Colour" : "Border"} colors={SWATCHES} selected={selS.stroke} onSelect={c => updS({ stroke: c })} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>{selS.closed === false ? "Width" : "Border width"} {selS.strokeW}px</span>
                      <input type="range" min={1} max={6} value={selS.strokeW}
                        onChange={e => updS({ strokeW: +e.target.value })} className="w-full accent-green-400" />
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={selS.strokeDash} onChange={e => updS({ strokeDash: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>{selS.closed === false ? "Dashed" : "Dashed border"}</span>
                    </label>
                  </div>
                )}

                {selI && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Width {Math.round(selI.width)}px</span>
                      <input type="range" min={50} max={CW} value={selI.width}
                        onChange={e => { const w = +e.target.value; updI({ width: w, height: w * (selI.naturalH / selI.naturalW) }) }}
                        className="w-full accent-green-400" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Opacity {Math.round(selI.opacity * 100)}%</span>
                      <input type="range" min={10} max={100} value={Math.round(selI.opacity * 100)}
                        onChange={e => updI({ opacity: +e.target.value / 100 })} className="w-full accent-green-400" />
                    </label>
                    <div>
                      <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Layer</p>
                      <div className="flex gap-1">
                        {(["background","overlay"] as const).map(l => (
                          <button key={l} onClick={() => l === "background" ? updI({ layer: l, x: 0, y: 0, width: CW, height: CH }) : updI({ layer: l })}
                            className="flex-1 py-1 rounded text-xs transition-colors"
                            style={{ background: selI.layer === l ? ACCENT_GRADIENT : SURFACE_2, color: selI.layer === l ? ACCENT_INK : TEXT_MUTED }}>
                            {l === "background" ? "Behind Pitch" : "Over Pitch"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {selI.layer === "background" && (
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>Background image fills the full canvas.</p>
                    )}
                  </div>
                )}

                {sel.kind === "zone" && (() => {
                  const z = customZones.find(x => x.id === sel.id)
                  if (!z) return null
                  const updZ = (patch: Partial<CustomZone>) => {
                    undoPoint(editKey(patch))
                    setCustomZones(zones => zones.map(x => x.id === sel.id ? { ...x, ...patch } : x))
                  }
                  return (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>Label</span>
                        <input value={z.label} onChange={e => updZ({ label: e.target.value })} placeholder="e.g. Press zone"
                          className="rounded px-2 py-1 text-xs outline-none"
                          style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                      </label>
                      <ColorPicker label="Colour" colors={SWATCHES} selected={z.color} onSelect={c => updZ({ color: c })} />
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>Opacity {Math.round(z.opacity * 100)}%</span>
                        <input type="range" min={5} max={80} value={Math.round(z.opacity * 100)}
                          onChange={e => updZ({ opacity: +e.target.value / 100 })} className="w-full accent-orange-400" />
                      </label>
                    </div>
                  )
                })()}
              </div>
            ) : tool === "arrow" ? (
              <div className="p-3 flex flex-col gap-2.5">
                <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Line defaults</p>
                <Segmented label="Type" value={arrowDefaultKind} options={LINE_KINDS}
                  onChange={k => { setArrowDefaultKind(k); setArrowDefaultDash(LINE_PRESET[k].dash); setArrowDefaultW(LINE_PRESET[k].strokeW) }} />
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={arrowNumbering} onChange={e => setArrowNumbering(e.target.checked)} className="accent-green-400" />
                  <span style={{ color: TEXT_PRIMARY }}>Number the steps</span>
                </label>
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Start or end a line on a player and it follows them when they move.</p>
                <div>
                  <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Line</p>
                  <div className="flex gap-1.5">
                    {(["none","dashed","dotted"] as const).map(d => (
                      <button key={d} onClick={() => setArrowDefaultDash(d)}
                        className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                        style={{ background: arrowDefaultDash === d ? ACCENT_GRADIENT : SURFACE_2, color: arrowDefaultDash === d ? ACCENT_INK : TEXT_MUTED }}>
                        {d === "none" ? "—" : d === "dashed" ? "- -" : "···"}
                      </button>
                    ))}
                  </div>
                </div>
                <ColorPicker label="Colour" colors={SWATCHES} selected={arrowDefaultColor} onSelect={setArrowDefaultColor} />
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: TEXT_MUTED }}>Width {arrowDefaultW}px</span>
                  <input type="range" min={1} max={8} value={arrowDefaultW}
                    onChange={e => setArrowDefaultW(+e.target.value)} className="w-full accent-green-400" />
                </label>
              </div>
            ) : tool === "text" ? (
              <div className="p-3 flex flex-col gap-2.5">
                <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Text defaults</p>
                <div>
                  <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Place new text in</p>
                  <div className="flex gap-1.5">
                    {(["foreground","background"] as const).map(l => (
                      <button key={l} onClick={() => setTextLayer(l)}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{ background: textLayer === l ? ACCENT_GRADIENT : SURFACE_2, color: textLayer === l ? ACCENT_INK : TEXT_MUTED }}>
                        {l === "foreground" ? "In Front" : "Behind Pitch"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : tool === "shape" ? (
              <div className="p-3 flex flex-col gap-2.5">
                <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Shape type</p>
                <div className="flex gap-1.5">
                  {([
                    { k: "polygon" as ShapeKind, icon: <Pentagon size={13} />, tip: "Polygon" },
                    { k: "rect" as ShapeKind, icon: <Square size={13} />, tip: "Rectangle" },
                    { k: "circle" as ShapeKind, icon: <Circle size={13} />, tip: "Circle" },
                    { k: "ellipse" as ShapeKind, icon: <Circle size={13} style={{ transform: "scaleX(1.4)" }} />, tip: "Ellipse" },
                  ]).map(({ k, icon, tip }) => (
                    <button key={k} onClick={() => setShapeKind(k)} title={tip}
                      className="flex-1 flex items-center justify-center py-2 rounded text-xs transition-colors"
                      style={{ background: shapeKind === k ? ACCENT_GRADIENT : SURFACE_2, color: shapeKind === k ? ACCENT_INK : TEXT_MUTED }}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ) : tool === "zone" ? (
              <div className="p-3 flex flex-col gap-2.5">
                <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Zone defaults</p>
                <ColorPicker label="Colour for new zones" colors={SWATCHES} selected={zoneColor} onSelect={setZoneColor} />
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: TEXT_MUTED }}>Fill opacity {Math.round(zoneOpacity * 100)}%</span>
                  <input type="range" min={5} max={80} value={Math.round(zoneOpacity * 100)}
                    onChange={e => setZoneOpacity(+e.target.value / 100)} className="w-full accent-orange-400" />
                </label>
              </div>
            ) : (
              <div className="p-4 text-center text-xs" style={{ color: TEXT_MUTED }}>
                Select an element on the pitch to edit it.
              </div>
            )}
          </div>}

          {/* ── BOARD TAB ── (five groups: Frame, Teams, Pitch, Editorial, Animation) */}
          {sideTab === "board" && <div style={{ flex: 1, overflowY: "auto" }}>

            <button aria-expanded={boardGroups.frame}
              onClick={() => setBoardGroups(g => ({ ...g, frame: !g.frame }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.frame ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Frame
            </button>
            {boardGroups.frame && (
              <div className="p-3 flex flex-col gap-3" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <Segmented label="View" value={view3d ? "3d" : "2d"} onChange={v => setView3d(v === "3d")}
                  options={[["2d", "2D"], ["3d", "3D"]]} />
                {canvasMode !== "blank" ? (
                  <>
                    <Segmented label="Pitch" value={vertical ? "v" : "h"} onChange={v => setOrientation(v === "v")}
                      options={[["h", "Horizontal"], ["v", "Vertical"]]} />
                    <Segmented label="Show" value={focus} onChange={v => { undoPoint(); setFocus(v) }}
                      options={[["board", "Whole board"], ["pitch", "Pitch"], ["half", "Half"], ["third", "Third"]]} />
                    {(focus === "half" || focus === "third") && (
                      <Segmented label="End" value={focusEnd} onChange={v => { undoPoint(); setFocusEnd(v) }}
                        options={[["attack", "Attacking"], ["defend", "Own"]]} />
                    )}
                  </>
                ) : (
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>A blank canvas always shows the whole board.</p>
                )}
                <Segmented label="Size" value={frameRatio} onChange={v => { undoPoint(); setFrameRatio(v) }}
                  options={[["auto", "Fit"], ["16:9", "16:9"], ["4:5", "4:5"], ["1:1", "1:1"], ["9:16", "9:16"]]} />
                <p className="text-xs" style={{ color: TEXT_MUTED }}>What you see is what you export. 16:9 exports 1920×1080, 4:5 1080×1350, 1:1 1080×1080 and 9:16 1080×1920.</p>
              </div>
            )}

            <button data-tour="teams" aria-expanded={boardGroups.teams}
              onClick={() => setBoardGroups(g => ({ ...g, teams: !g.teams }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.teams ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Teams
            </button>
            {boardGroups.teams && (
              <div className="p-3 flex flex-col gap-3" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <div>
                  <Segmented label="Who has the ball?" value={ballSide} onChange={setBall}
                    options={[["home", "Home"], ["away", "Away"], ["none", "Neither"]]} />
                  <p className="text-xs mt-1.5" style={{ color: TEXT_MUTED }}>The team on the ball spreads out and the other drops into its block. Neither shows both lineups as written.</p>
                </div>
                {teamBlock("home")}
                {teamBlock("away")}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={showPlayerLabels} onChange={e => { undoPoint(); setShowPlayerLabels(e.target.checked) }} className="accent-green-400" />
                  <span style={{ color: TEXT_PRIMARY }}>Show names and numbers</span>
                </label>
                <Segmented label="Label size" value={labelSize} onChange={v => { undoPoint(); setLabelSize(v) }}
                  options={[["standard", "Standard"], ["large", "Large"], ["xl", "Extra large"]]} />
                <Segmented label="Names" value={nameStyle} onChange={v => { undoPoint(); setNameStyle(v) }}
                  options={[["halo", "Outline"], ["chip", "Chip"]]} />
                <Segmented label="Pieces" value={tokenStyle} onChange={v => { undoPoint(); setTokenStyle(v) }}
                  options={[["classic", "Detailed"], ["minimal", "Minimal"]]} />
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Kits are named by colour only. PitchStudio is not affiliated with any club, league or player.</p>
              </div>
            )}

            <button aria-expanded={boardGroups.pitch}
              onClick={() => setBoardGroups(g => ({ ...g, pitch: !g.pitch }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.pitch ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Pitch
            </button>
            {boardGroups.pitch && (
              <div className="p-3 flex flex-col gap-3" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <Segmented label="Canvas" value={canvasMode} onChange={v => { undoPoint(); setCanvasMode(v) }}
                  options={[["full", "Full pitch"], ["half", "Half pitch"], ["blank", "Blank"]]} />
                {canvasMode !== "blank" && (
                  <Segmented label="Pitch style" value={pitchStyle}
                    onChange={v => { undoPoint(); setPitchStyle(v); setBgColor(v === "classic" ? DEFAULT_BOARD_SETTINGS.bgColor : PITCH_LOOKS[v].bg) }}
                    options={[["classic", "Classic"], ["night", "Night"], ["paper", "Paper"]]} />
                )}
                {canvasMode !== "blank" && pitchStyle === "classic" && (
                  <Segmented label="Pitch colour" value={pitchColor} onChange={v => { undoPoint(); setPitchColor(v) }}
                    options={[["green", "Green"], ["white", "White lines"]]} />
                )}
                <ColorPicker label="Canvas colour" colors={BG_PRESETS} selected={bgColor} onSelect={c => { undoPoint("bgColor"); setBgColor(c) }} />
                {canvasMode !== "blank" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs" style={{ color: TEXT_MUTED }}>Pitch size</p>
                      <button onClick={() => { undoPoint(); setPitchScale(1); setPitchOffX(0); setPitchOffY(0) }}
                        className="text-xs px-2 py-0.5 rounded hover:bg-[var(--ps-hover)] transition-colors"
                        style={{ color: TEXT_MUTED }}>Reset</button>
                    </div>
                    <input type="range" min={30} max={200} value={Math.round(pitchScale * 100)}
                      onChange={e => { undoPoint("pitchScale"); setPitchScale(+e.target.value / 100) }} className="w-full accent-green-400" />
                    <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>{Math.round(pitchScale * 100)}% · or drag a corner of the pitch</p>
                    {(pitchOffX !== 0 || pitchOffY !== 0) && (
                      <button onClick={() => { undoPoint(); setPitchOffX(0); setPitchOffY(0) }}
                        className="mt-1.5 w-full py-1 rounded text-xs hover:bg-[var(--ps-hover)] transition-colors"
                        style={{ color: TEXT_MUTED }}>Re-centre pitch</button>
                    )}
                  </div>
                )}
                {canvasMode !== "blank" ? (
                  <div className="flex flex-col gap-1.5">
                    <button onClick={() => { undoPoint(); setPitchVisible(v => !v) }} aria-pressed={pitchVisible}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition-colors"
                      style={{ background: pitchVisible ? ACCENT_SOFT : SURFACE_2, borderColor: pitchVisible ? ACCENT_SOLID : DS_BORDER, color: pitchVisible ? ACCENT_SOLID : TEXT_PRIMARY }}>
                      <span className="flex items-center gap-2">{pitchVisible ? <Eye size={14} /> : <EyeOff size={14} />}Show pitch</span>
                      <span className="px-1.5 py-0.5 rounded font-bold"
                        style={{ background: pitchVisible ? ACCENT_SOLID : SURFACE_1, color: pitchVisible ? ACCENT_INK : TEXT_MUTED, fontSize: 10 }}>
                        {pitchVisible ? "ON" : "OFF"}
                      </span>
                    </button>
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>Turn it off to see a photo behind the board. Zones and lanes stay.</p>
                    <Segmented label="PS mark in the grass" value={psMark ? "on" : "off"} onChange={v => { undoPoint(); setPsMark(v === "on") }}
                      options={[["off", "Off"], ["on", "On"]]} />
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: TEXT_MUTED }}>A blank canvas has no pitch. Pick Full or Half pitch to draw one.</p>
                )}
                <button onClick={() => { undoPoint(); setShow18Zones(v => !v) }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition-colors"
                  style={{ background: show18Zones ? ACCENT_SOFT : SURFACE_2, borderColor: show18Zones ? ACCENT_SOLID : DS_BORDER, color: show18Zones ? ACCENT_SOLID : TEXT_PRIMARY }}>
                  <span className="flex items-center gap-2"><Grid3x3 size={14} />18 zones</span>
                  <span className="px-1.5 py-0.5 rounded font-bold"
                    style={{ background: show18Zones ? ACCENT_SOLID : SURFACE_1, color: show18Zones ? ACCENT_INK : TEXT_MUTED, fontSize: 10 }}>
                    {show18Zones ? "ON" : "OFF"}
                  </span>
                </button>
                <button onClick={() => { undoPoint(); setShowLanes(v => !v) }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition-colors"
                  style={{ background: showLanes ? ACCENT_SOFT : SURFACE_2, borderColor: showLanes ? ACCENT_SOLID : DS_BORDER, color: showLanes ? ACCENT_SOLID : TEXT_PRIMARY }}>
                  <span className="flex items-center gap-2"><Rows3 size={14} />Lanes</span>
                  <span className="px-1.5 py-0.5 rounded font-bold"
                    style={{ background: showLanes ? ACCENT_SOLID : SURFACE_1, color: showLanes ? ACCENT_INK : TEXT_MUTED, fontSize: 10 }}>
                    {showLanes ? "ON" : "OFF"}
                  </span>
                </button>
                {customZones.length > 0 && (
                  <button onClick={() => { snapshot(); setCustomZones([]); setSel(null) }}
                    className="w-full py-1 rounded text-xs hover:bg-red-500/20 transition-colors"
                    style={{ color: DS_ERROR }}>
                    Clear all zones ({customZones.length})
                  </button>
                )}
                {images.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase mb-2" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>Images ({images.length})</p>
                    <div className="flex flex-col gap-1.5">
                      {images.map(img => (
                        <div key={img.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs"
                          style={{ background: SURFACE_2, border: sel?.id === img.id ? `1px solid ${ACCENT_SOLID}` : "1px solid transparent" }}>
                          <span style={{ color: TEXT_PRIMARY }} className="truncate">{img.layer === "background" ? "BG Image" : "Overlay"}</span>
                          <button onClick={() => { snapshot(); setImages(i => i.filter(x => x.id !== img.id)) }}
                            className="p-0.5 rounded hover:bg-red-500/20 ml-1 flex-shrink-0" style={{ color: DS_ERROR }}>
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button aria-expanded={boardGroups.editorial}
              onClick={() => setBoardGroups(g => ({ ...g, editorial: !g.editorial }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.editorial ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Editorial
              {editorial && <span className="ml-auto px-1.5 py-0.5 rounded font-bold" style={{ background: PS_VOLT, color: "#0a0c0f", fontSize: 9, letterSpacing: "0.08em" }}>ON</span>}
            </button>
            {boardGroups.editorial && (
              <div className="p-3 flex flex-col gap-3" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <Segmented label="Editorial frame" value={editorial ? "on" : "off"} onChange={v => { undoPoint(); setEditorial(v === "on") }}
                  options={[["off", "Off"], ["on", "On"]]} />
                <p className="text-xs" style={{ color: TEXT_MUTED }}>A headline, score strip, caption, legend, crop marks and an edition number around the board. It's in every export. The headline is the board's title.</p>
                {editorial && (
                  <>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: TEXT_MUTED }}>Kicker
                      <input value={kicker} maxLength={40} placeholder="TACTICAL BREAKDOWN" onChange={e => { undoPoint("kicker"); setKicker(e.target.value) }}
                        className="rounded px-2 py-1 text-xs outline-none" style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    <div>
                      <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Score · {homeName.trim() || "Home"} v {awayName.trim() || "Away"}</p>
                      <div className="flex gap-1.5">
                        <input value={homeScore} maxLength={3} aria-label="Home score" placeholder="0" onChange={e => { undoPoint("homeScore"); setHomeScore(e.target.value.replace(/[^0-9]/g, "")) }}
                          className="w-12 rounded px-2 py-1 text-xs outline-none text-center" style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                        <input value={awayScore} maxLength={3} aria-label="Away score" placeholder="0" onChange={e => { undoPoint("awayScore"); setAwayScore(e.target.value.replace(/[^0-9]/g, "")) }}
                          className="w-12 rounded px-2 py-1 text-xs outline-none text-center" style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                        <input value={scoreNote} maxLength={12} aria-label="Score note" placeholder="FT" onChange={e => { undoPoint("scoreNote"); setScoreNote(e.target.value) }}
                          className="flex-1 min-w-0 rounded px-2 py-1 text-xs outline-none" style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                      </div>
                      <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>Name the teams under Teams to show them in the strip.</p>
                    </div>
                    <label className="flex flex-col gap-1 text-xs" style={{ color: TEXT_MUTED }}>Caption · {caption.length}/160
                      <textarea value={caption} maxLength={160} rows={3} placeholder="One or two lines that say what to look at." onChange={e => { undoPoint("caption"); setCaption(e.target.value) }}
                        className="rounded px-2 py-1 text-xs outline-none resize-none" style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    <Segmented label="Legend" value={showLegend ? "on" : "off"} onChange={v => { undoPoint(); setShowLegend(v === "on") }} options={[["on", "On"], ["off", "Off"]]} />
                    <Segmented label="Crop marks" value={cropMarks ? "on" : "off"} onChange={v => { undoPoint(); setCropMarks(v === "on") }} options={[["on", "On"], ["off", "Off"]]} />
                    <Segmented label={`Edition number · next is ${editionStamp(editionNo)}`} value={showEdition ? "on" : "off"} onChange={v => { undoPoint(); setShowEdition(v === "on") }} options={[["on", "On"], ["off", "Off"]]} />
                  </>
                )}
              </div>
            )}

            <button aria-expanded={boardGroups.animation}
              onClick={() => setBoardGroups(g => ({ ...g, animation: !g.animation }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.animation ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Animation
              {stepList.length > 1 && <span className="ml-auto px-1.5 py-0.5 rounded font-bold" style={{ background: PS_VOLT, color: "#0a0c0f", fontSize: 9, letterSpacing: "0.08em" }}>{stepList.length} STEPS</span>}
            </button>
            {boardGroups.animation && (
              <div className="p-3 flex flex-col gap-3" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <Segmented label="Speed" value={animSpeed} onChange={v => { undoPoint(); setAnimSpeed(v) }}
                  options={[["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]]} />
                <Segmented label="End card" value={endCard ? "on" : "off"} onChange={v => { undoPoint(); setEndCard(v === "on") }}
                  options={[["on", "On"], ["off", "Off"]]} />
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Build a move with Steps under the board. + Step plays the runs and passes you've drawn, so the next step starts where they end. Numbered lines play in order. Play shows the move here; Export makes it a GIF or an MP4 video, with your seal and handle on the end card.</p>
              </div>
            )}
          </div>}

          <div style={{ padding: "9px 12px", borderTop: `1px solid ${DS_BORDER}`, fontSize: 11, color: TEXT_MUTED, flexShrink: 0, lineHeight: 1.4 }}>
            {lockHint ? "That's locked. Right-click it to unlock." : <>
            {tool === "select" && "Click or drag a box to select · Shift adds · Arrow keys nudge · Right-click for more"}
            {tool === "pan" && "Drag to move · Alt+drag or middle-click also pans · Scroll to zoom"}
            {tool === "homePlayer" && "Click the pitch to place a home player"}
            {tool === "awayPlayer" && "Click the pitch to place an away player"}
            {tool === "marker" && "Click anywhere to place a ✕ marker"}
            {tool === "ball" && "Click anywhere to place the ball, even at a player's feet"}
            {tool === "arrow" && "Click once to start, click again to finish"}
            {tool === "text" && "Click anywhere to add a text box"}
            {tool === "shape" && shapeKind === "polygon" && "Click to add points · Double-click to finish · Esc to cancel"}
            {tool === "shape" && shapeKind !== "polygon" && "Click and drag to draw a shape"}
            {tool === "zone" && "Drag on pitch to draw a zone · Esc to cancel"}
            </>}
          </div>
        </aside>
        )}


        {/* ── Main Canvas, with the narrative underneath ── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <main
          ref={canvasRef} data-tour="canvas"
          className="flex-1 min-h-0 overflow-hidden relative flex items-center justify-center"
          style={{
            background: bgColor,
            cursor: tool === "pan" ? "grab" : panDragRef.current ? "grabbing" : "default",
          }}
          onPointerDown={onCanvasMouseDown}
          onPointerMove={onCanvasMouseMove}
          onPointerUp={onCanvasMouseUp}
        >
          {/* Empty state overlay */}
          {players.length === 0 && arrows.length === 0 && texts.length === 0 && shapes.length === 0 && images.length === 0 && customZones.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 10 }}>
              <div style={{ textAlign: "center", background: GLASS, border: `1px solid ${DS_BORDER}`, borderRadius: 12, padding: "22px 20px 16px", boxShadow: "0 12px 40px rgba(0,0,0,0.35)" }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, margin: 0 }}>Start your board</p>
                <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6, margin: "6px 0 0" }}>Add a full team, place players one at a time, or draw a zone.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, padding: "0 12px", justifyContent: "center", pointerEvents: "auto" }}>
                  {([
                    { label: "Start from a drop", action: () => setShowTemplates(true) },
                    { label: "Add formation", action: () => addTeam("home") },
                    { label: "Place a player", action: () => setTool("homePlayer") },
                    { label: "Draw a zone", action: () => setTool("zone") },
                  ] as { label: string; action: () => void }[]).map(({ label, action }) => (
                    <button key={label} onClick={action}
                      style={{ background: SURFACE_2, border: `1px solid ${DS_BORDER}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: TEXT_PRIMARY, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = ACCENT_SOLID}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = DS_BORDER}>
                      {label}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 14 }}>Tip: hold Shift and click to select more than one player.</p>
              </div>
            </div>
          )}

          {/* Polygon floating hint */}
          {tool === "shape" && shapeKind === "polygon" && polyDraft && polyDraft.length >= 1 && (
            <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", background: GLASS, border: `1px solid ${DS_BORDER}`, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: TEXT_PRIMARY, pointerEvents: "none", zIndex: 20, whiteSpace: "nowrap" }}>
              Double-click to finish the shape
            </div>
          )}

          {/* Pitch + all layers */}
          <div style={{ transform: pitchTransform, transformOrigin: "center center" }}>
            <div style={{ transform: pitchInnerTransform, transformOrigin: "center center", transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)" }}>
              <div ref={pitchRef} style={{ position: "relative" }}>
                <svg
                  ref={svgRef}
                  viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`}
                  width={dispW}
                  style={{ display: "block", userSelect: "none", aspectRatio: `${frame.w}/${frame.h}`, touchAction: "none" }}
                  onPointerMove={onSVGMouseMove}
                  onPointerUp={onSVGMouseUp}
                  onPointerDown={onSVGMouseDown}
                  onClick={onSVGClick}
                  // ✕ markers and the ball go exactly where you click, even on top of a player, zone, shape or arrow
                  onPointerDownCapture={e => { if (tool === "marker" || tool === "ball") { mouseDownPosRef.current = { x: e.clientX, y: e.clientY }; hasDraggedRef.current = false } }}
                  onClickCapture={e => { if (tool === "marker" || tool === "ball") { e.stopPropagation(); onSVGClick(e as unknown as React.PointerEvent) } }}
                >
                  {(() => {
                  // While the move plays, everything below draws that moment of it, with the same drawing code as the board
                  const { players, arrows, shapes, customZones, fade: fadeOf } = shown
                  const pieceMap = new Map(players.map(p => [p.id, p]))
                  const bgTexts = shown.texts.filter(t => t.layer === "background"), fgTexts = shown.texts.filter(t => t.layer === "foreground")
                  return (<>
                  {/* 1. Canvas background (it also fills a frame that reaches past the canvas) */}
                  <rect x={Math.min(0, frame.x)} y={Math.min(0, frame.y)}
                    width={Math.max(CW, frame.x + frame.w) - Math.min(0, frame.x)} height={Math.max(CH, frame.y + frame.h) - Math.min(0, frame.y)} fill={bgColor} />

                  {/* 2. Background images (full-canvas fill) */}
                  {bgImages.map(img => (
                    <image key={img.id} href={img.src}
                      x={0} y={0} width={CW} height={CH}
                      opacity={img.opacity} preserveAspectRatio="xMidYMid slice"
                      // A photo behind the pitch fills the canvas, so pressing on it starts a box-select; a plain click selects it
                      onClick={e => {
                        if (img.locked) return
                        if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "image", id: img.id }); setTool("select"); return }
                        if (tool !== "select" || hasDraggedRef.current) return
                        e.stopPropagation()
                        if (e.shiftKey) setSelection(prev => isSel(img.id) ? prev.filter(s => s.id !== img.id) : [...prev, { kind: "image", id: img.id }])
                        else setSel({ kind: "image", id: img.id })
                      }}
                      onContextMenu={e => openMenu(e, { kind: "image", id: img.id }, img.locked)}
                      style={{ cursor: "default" }} />
                  ))}

                  {/* 3. Background texts (behind pitch, in margins) */}
                  {bgTexts.map(t => (
                    <g key={t.id} opacity={fadeOf.get(t.id)}><TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      startResize={(e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = { kind: "resizeText", id: t.id, ox: 0, oy: 0 } }}
                      setSel={setSel} tool={tool} updT={updT} setTool={setTool}
                      isSel={isSel}
                      onShiftClick={() => setSelection(prev => isSel(t.id) ? prev.filter(s => s.id !== t.id) : [...prev, { kind: "text", id: t.id }])}
                      onMenu={e => openMenu(e, { kind: "text", id: t.id }, t.locked)} /></g>
                  ))}

                  {/* 4. Pitch group (translated to canvas offset + user drag offset) */}
                  {canvasMode !== "blank" && (
                    <g transform={pitchTransformAttr(geo)}
                      onMouseEnter={() => setHoveredPitch(true)}
                      onMouseLeave={() => setHoveredPitch(false)}>
                      <g style={{ clipPath: canvasMode === "half" ? `url(#half-pitch-clip)` : undefined }}>
                        {pitchVisible && <PitchSVG pitchColor={pitchColor} look={pitchStyle} mark={psMark} upright={vertical} />}
                        {/* ── Zone overlays (pitch-local coords) ── */}
                        {show18Zones && <EighteenZonesOverlay upright={vertical} />}
                        {showLanes && <LanesOverlay upright={vertical} />}
                        {/* Custom drawn zones */}
                        {customZones.map(z => {
                          const isSelZ = isSel(z.id)
                          return (
                            <g key={z.id} opacity={fadeOf.get(z.id)}
                              style={{ cursor: tool === "select" && !z.locked ? "move" : "default" }}
                              onClick={e => {
                                if (tool !== "select" || z.locked) return // other tools draw on top of the zone
                                e.stopPropagation()
                                if (e.shiftKey) setSelection(prev => isSel(z.id) ? prev.filter(s => s.id !== z.id) : [...prev, { kind: "zone", id: z.id }])
                              }}
                              onPointerDown={e => {
                                if (tool !== "select") return
                                if (z.locked) { if (e.button === 0) flashLockHint(); return }
                                startDrag(e, "zone", z.id)
                              }}
                              onContextMenu={e => openMenu(e, { kind: "zone", id: z.id }, z.locked)}>
                              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={4}
                                fill={z.color} fillOpacity={z.opacity}
                                stroke={isSelZ ? "#ffffff" : z.color}
                                strokeWidth={isSelZ ? 2 : 1}
                                strokeOpacity={isSelZ ? 1 : 0.5}
                                strokeDasharray={isSelZ ? "6,3" : undefined} />
                              {z.label && (
                                <text x={vertical ? z.x + z.w - 18 : z.x + 10} y={vertical ? z.y + 10 : z.y + 18}
                                  transform={vertical ? `rotate(90 ${z.x + z.w - 18} ${z.y + 10})` : undefined}
                                  textAnchor="start" dominantBaseline="auto"
                                  fill="#ffffff" fontSize={14} fontWeight="700"
                                  stroke="rgba(0,0,0,0.9)" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round"
                                  style={{ fontFamily: "'Barlow Condensed',sans-serif", pointerEvents: "none", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                  {z.label}
                                </text>
                              )}
                            </g>
                          )
                        })}
                        {/* Zone draw draft preview */}
                        {zoneDraft && (() => {
                          const bx = Math.min(zoneDraft.x1, zoneDraft.x2)
                          const by = Math.min(zoneDraft.y1, zoneDraft.y2)
                          const bw = Math.abs(zoneDraft.x2 - zoneDraft.x1)
                          const bh = Math.abs(zoneDraft.y2 - zoneDraft.y1)
                          return (
                            <rect x={bx} y={by} width={bw} height={bh} rx={4}
                              fill={zoneColor} fillOpacity={zoneOpacity * 0.7}
                              stroke={zoneColor} strokeWidth={1.5} strokeDasharray="8,4"
                              strokeOpacity={0.9} style={{ pointerEvents: "none" }} />
                          )
                        })()}
                      </g>
                    </g>
                  )}

                  {/* Pitch handles — only on hover so they don't show in screenshots */}
                  {canvasMode !== "blank" && tool === "select" && hoveredPitch && (() => {
                    const pb = pitchRect(geo, 0, 0, PW, PH)
                    const ox = pb.x
                    const oy = pb.y
                    const pR = ox + pb.w
                    const pB = oy + pb.h
                    const hS = 9
                    const midX = (ox + pR) / 2
                    const corners = [
                      { id: "pitch-tl", x: ox, y: oy,  cursor: "nwse-resize" },
                      { id: "pitch-tr", x: pR, y: oy,  cursor: "nesw-resize" },
                      { id: "pitch-bl", x: ox, y: pB,  cursor: "nesw-resize" },
                      { id: "pitch-br", x: pR, y: pB,  cursor: "nwse-resize" },
                    ]
                    return (
                      <>
                        {corners.map(c => (
                          <g key={c.id} style={{ cursor: c.cursor }}
                            onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizePitch", id: c.id, ox: 0, oy: 0 } }}>
                            <rect x={c.x - hS} y={c.y - hS} width={hS * 2} height={hS * 2} rx={3}
                              fill="#fbbf24" stroke="#0d1117" strokeWidth={2} opacity={0.9} />
                          </g>
                        ))}
                        {/* Move pitch grip — top-centre bar, drag to reposition pitch */}
                        <g style={{ cursor: "grab" }}
                          onPointerDown={e => {
                            e.stopPropagation()
                            const { x: mx, y: my } = svgXY(e)
                            dragRef.current = { kind: "movePitch", id: "pitch", ox: mx - pitchOffX - PX, oy: my - pitchOffY - PY }
                          }}>
                          <rect x={midX - 30} y={oy - 20} width={60} height={15} rx={7}
                            fill={ACCENT_SOLID} stroke="#ffffff" strokeWidth={1.5} opacity={0.92} />
                          {[-12, -4, 4, 12].map(dx => (
                            <circle key={dx} cx={midX + dx} cy={oy - 12} r={2} fill="#ffffff" opacity={0.65} />
                          ))}
                        </g>
                      </>
                    )
                  })()}

                  <defs>
                    <clipPath id="half-pitch-clip">
                      <rect x={0} y={0} width={PW / 2} height={PH} />
                    </clipPath>
                  </defs>

                  {/* 5. Shapes */}
                  {shapes.map(s => (
                    <g key={s.id} opacity={fadeOf.get(s.id)}
                      onPointerDown={e => { if (s.locked) { if (tool === "select" && e.button === 0) flashLockHint(); return } startDrag(e, "shape", s.id) }}
                      onClick={e => {
                        if (s.locked) return
                        if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "shape", id: s.id }); setTool("select"); return }
                        if (tool !== "select") return // other tools draw on top of the shape
                        e.stopPropagation()
                        if (e.shiftKey) setSelection(prev => isSel(s.id) ? prev.filter(x => x.id !== s.id) : [...prev, { kind: "shape", id: s.id }])
                      }}
                      onContextMenu={e => openMenu(e, { kind: "shape", id: s.id }, s.locked)}
                      style={{ cursor: tool === "select" && !s.locked ? "move" : "default" }}>
                      {renderShapePath(s)}
                      {/* An open line is easy to grab, and can show the distance along each side */}
                      {s.kind === "polygon" && s.closed === false && (
                        <polyline points={s.pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="transparent" strokeWidth={16} />
                      )}
                      {s.dist && s.kind === "polygon" && s.pts.map((pt, i) => {
                        if (i === s.pts.length - 1 && (s.closed === false || s.pts.length < 3)) return null
                        const q = s.pts[(i + 1) % s.pts.length]
                        return <DistTag key={i} x={(pt[0] + q[0]) / 2} y={(pt[1] + q[1]) / 2} m={metres(geo, Math.hypot(q[0] - pt[0], q[1] - pt[1]))} />
                      })}
                      {s.label && (() => {
                        const lx = s.kind === "polygon" && s.pts && s.pts.length > 0
                          ? s.pts.reduce((a, [px]) => a + px, 0) / s.pts.length
                          : s.x + s.w / 2
                        const ly = s.kind === "polygon" && s.pts && s.pts.length > 0
                          ? s.pts.reduce((a, [, py]) => a + py, 0) / s.pts.length
                          : s.y + s.h / 2
                        return (
                          <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                            fill={s.stroke} fontSize={20} fontWeight="800"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif", pointerEvents: "none" }}>
                            {s.label}
                          </text>
                        )
                      })()}
                      {isSel(s.id) && s.kind === "polygon" && s.pts && s.pts.length >= 2 && (
                        <rect
                          x={Math.min(...s.pts.map(([px]) => px)) - 4}
                          y={Math.min(...s.pts.map(([, py]) => py)) - 4}
                          width={Math.max(...s.pts.map(([px]) => px)) - Math.min(...s.pts.map(([px]) => px)) + 8}
                          height={Math.max(...s.pts.map(([, py]) => py)) - Math.min(...s.pts.map(([, py]) => py)) + 8}
                          fill="none" stroke={ACCENT_SOLID} strokeWidth={1.5} strokeDasharray="4,2" rx={3}
                          style={{ pointerEvents: "none" }} />
                      )}
                      {isSel(s.id) && s.kind !== "polygon" && (
                        <>
                          <rect
                            x={s.x - 4} y={s.y - 4}
                            width={s.w + 8} height={s.h + 8}
                            fill="none" stroke={ACCENT_SOLID} strokeWidth={1.5} strokeDasharray="4,2" rx={3}
                            style={{ pointerEvents: "none" }} />
                          <circle cx={s.x + s.w} cy={s.y + s.h} r={6} fill="#fbbf24" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "nwse-resize" }}
                            onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizeShape", id: s.id, ox: 0, oy: 0 } }} />
                        </>
                      )}
                    </g>
                  ))}

                  {/* 6. Polygon draft */}
                  {polyDraft && (
                    <g>
                      <polygon
                        points={[...polyDraft, [mouse.x, mouse.y]].map(([x, y]) => `${x},${y}`).join(" ")}
                        fill={SHAPE_FILLS[shapes.length % SHAPE_FILLS.length]}
                        fillOpacity={0.2} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="6,3" />
                      {polyDraft.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={y} r={5} fill="#fbbf24" stroke="#0d1117" strokeWidth={1} />
                      ))}
                      <circle cx={mouse.x} cy={mouse.y} r={4} fill="#fbbf24" fillOpacity={0.6} />
                    </g>
                  )}

                  {/* 7. Shape bounding-box draft */}
                  {shapeDraftPreview && shapeKind !== "polygon" && (() => {
                    const { x1, y1, x2, y2 } = shapeDraftPreview
                    const bx = Math.min(x1, x2), by = Math.min(y1, y2)
                    const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1)
                    const fill = SHAPE_FILLS[shapes.length % SHAPE_FILLS.length]
                    const shared = { fill, fillOpacity: 0.25, stroke: "#fbbf24", strokeWidth: 1.5, strokeDasharray: "6,3" }
                    if (shapeKind === "rect") return <rect x={bx} y={by} width={bw} height={bh} rx={2} {...shared} />
                    if (shapeKind === "circle") {
                      const r = Math.min(bw, bh) / 2
                      return <circle cx={bx + bw / 2} cy={by + bh / 2} r={r} {...shared} />
                    }
                    return <ellipse cx={bx + bw / 2} cy={by + bh / 2} rx={bw / 2} ry={bh / 2} {...shared} />
                  })()}

                  {/* 8. Arrows */}
                  {arrows.map(a => {
                    const isSelected = isSel(a.id)
                    const hs = (a.strokeW * 4 + 6) * (a.kind === "shot" ? 1.25 : 1)
                    const e = lineEnds(a, pieceMap)
                    const d = arrowPath(e.x1, e.y1, e.x2, e.y2, a.cpx, a.cpy)
                    const mid = curveAt(e.x1, e.y1, a.cpx, a.cpy, e.x2, e.y2, 0.5)
                    return (
                      <g key={a.id} opacity={fadeOf.get(a.id)}
                        onPointerDown={e => { if (a.locked) { if (tool === "select" && e.button === 0) flashLockHint(); return } startDrag(e, "arrow", a.id) }}
                        onClick={e => {
                          if (a.locked) return
                          if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "arrow", id: a.id }); setTool("select"); return }
                          if (tool !== "select") return // other tools draw on top of the arrow
                          e.stopPropagation()
                          if (e.shiftKey) setSelection(prev => isSel(a.id) ? prev.filter(s => s.id !== a.id) : [...prev, { kind: "arrow", id: a.id }])
                        }}
                        onContextMenu={e => openMenu(e, { kind: "arrow", id: a.id }, a.locked)}
                        style={{ cursor: tool === "select" && !a.locked ? "move" : "default" }}>
                        <path d={d}
                          fill="none" stroke="transparent" strokeWidth={16} />
                        {/* A shot is a heavy line with a dark edge, so it stands out from a pass */}
                        {a.kind === "shot" && <path d={d} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={a.strokeW + 3} strokeLinecap="round" />}
                        <path d={a.kind === "dribble" ? wavyPath(e.x1, e.y1, e.x2, e.y2, a.cpx, a.cpy, 3 + a.strokeW, 26) : d}
                          fill="none" stroke={a.color} strokeWidth={a.strokeW}
                          strokeDasharray={dashArr(a.dash)} strokeLinecap="round" strokeLinejoin="round" />
                        {a.kind !== "line" && <polygon points={arrowHead(e.x2, e.y2, a.cpx, a.cpy, hs)} fill={a.color} />}
                        {a.twoWay && a.kind !== "line" && <polygon points={arrowHeadRev(e.x1, e.y1, a.cpx, a.cpy, hs)} fill={a.color} />}
                        {/* Step number: the order of play */}
                        {!!a.step && (
                          <g style={{ pointerEvents: "none" }}>
                            <circle cx={mid.x} cy={mid.y} r={11} fill={a.color} stroke="rgba(0,0,0,0.55)" strokeWidth={1.5} />
                            <text x={mid.x} y={mid.y + 0.5} textAnchor="middle" dominantBaseline="central" fill={inkOn(a.color)} fontSize={14} fontWeight={800}
                              style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>{a.step}</text>
                          </g>
                        )}
                        {a.dist && (() => {
                          const at = a.step ? curveAt(e.x1, e.y1, a.cpx, a.cpy, e.x2, e.y2, 0.3) : mid // clear of the step number
                          return <DistTag x={at.x} y={at.y} m={metres(geo, curveLen(a))} />
                        })()}
                        {a.label && (
                          <text x={(a.x1 + a.x2) / 2} y={(a.y1 + a.y2) / 2 - (a.step ? 22 : 8)}
                            textAnchor="middle" fill={a.color} fontSize={12} fontWeight="600"
                            style={{ fontFamily: "'Inter', sans-serif", pointerEvents: "none" }}>
                            {a.label}
                          </text>
                        )}
                        {isSelected && (
                          <>
                            <line x1={e.x1} y1={e.y1} x2={a.cpx} y2={a.cpy} stroke={ACCENT_SOLID} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                            <line x1={e.x2} y1={e.y2} x2={a.cpx} y2={a.cpy} stroke={ACCENT_SOLID} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                            <circle cx={e.x1} cy={e.y1} r={7} fill={ACCENT_SOLID} stroke="#ffffff" strokeWidth={1.5} style={{ cursor: "grab" }}
                              onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowP1", id: a.id, ox: 0, oy: 0 } }} />
                            <circle cx={e.x2} cy={e.y2} r={7} fill={ACCENT_SOLID} stroke="#ffffff" strokeWidth={1.5} style={{ cursor: "grab" }}
                              onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowP2", id: a.id, ox: 0, oy: 0 } }} />
                            <circle cx={a.cpx} cy={a.cpy} r={6} fill="#fbbf24" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "grab" }}
                              onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowCp", id: a.id, ox: 0, oy: 0 } }} />
                          </>
                        )}
                      </g>
                    )
                  })}

                  {/* 9. Arrow draft preview — shows actual style pre-selected */}
                  {arrowDraft && (
                    <g>
                      {/* Wide invisible hit area */}
                      <path d={arrowPath(arrowDraft.x1, arrowDraft.y1, mouse.x, mouse.y,
                        (arrowDraft.x1 + mouse.x) / 2, (arrowDraft.y1 + mouse.y) / 2)}
                        fill="none" stroke="transparent" strokeWidth={16} />
                      {/* Styled preview path */}
                      <path d={arrowDefaultKind === "dribble"
                        ? wavyPath(arrowDraft.x1, arrowDraft.y1, mouse.x, mouse.y, (arrowDraft.x1 + mouse.x) / 2, (arrowDraft.y1 + mouse.y) / 2, 3 + arrowDefaultW, 26)
                        : arrowPath(arrowDraft.x1, arrowDraft.y1, mouse.x, mouse.y, (arrowDraft.x1 + mouse.x) / 2, (arrowDraft.y1 + mouse.y) / 2)}
                        fill="none" stroke={arrowDefaultColor} strokeWidth={arrowDefaultW}
                        strokeOpacity={0.65}
                        strokeDasharray={arrowDefaultDash === "dashed" ? "12,6" : arrowDefaultDash === "dotted" ? "4,4" : undefined}
                        strokeLinecap="round" />
                      <circle cx={arrowDraft.x1} cy={arrowDraft.y1} r={6} fill={ACCENT_SOLID} />
                      {arrowDefaultKind !== "line" && (
                        <polygon points={arrowHead(mouse.x, mouse.y,
                          (arrowDraft.x1 + mouse.x) / 2, (arrowDraft.y1 + mouse.y) / 2, 14)}
                          fill={arrowDefaultColor} fillOpacity={0.65} />
                      )}
                    </g>
                  )}

                  {/* 10. Foreground texts (on top of everything) */}
                  {fgTexts.map(t => (
                    <g key={t.id} opacity={fadeOf.get(t.id)}><TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      startResize={(e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = { kind: "resizeText", id: t.id, ox: 0, oy: 0 } }}
                      setSel={setSel} tool={tool} updT={updT} setTool={setTool}
                      isSel={isSel}
                      onShiftClick={() => setSelection(prev => isSel(t.id) ? prev.filter(s => s.id !== t.id) : [...prev, { kind: "text", id: t.id }])}
                      onMenu={e => openMenu(e, { kind: "text", id: t.id }, t.locked)} /></g>
                  ))}

                  {/* 11. Players, ✕ markers and the ball */}
                  {players.map(p => {
                    const isSelected = isSel(p.id)
                    const s = p.scale || 1
                    const r = pieceBase(p) * s
                    const cross = `M${-r * 0.6},${-r * 0.6}L${r * 0.6},${r * 0.6}M${-r * 0.6},${r * 0.6}L${r * 0.6},${-r * 0.6}` // a ✕ marker's two strokes
                    // p.num = shirt number (inside circle), p.name = player name (below circle, halo text)
                    const numberText = p.num.toUpperCase()
                    const numFontSize = Math.max(10 * s, Math.min(18 * s * labelScale, r * (labelScale > 1 ? 0.9 : 0.8)) * Math.min(1, 3 / Math.max(3, numberText.length)))
                    const ringW = (tokenStyle === "minimal" ? 1.5 : 3) * s // minimal pieces are flat: a thin ring and no drop shadow
                    return (
                      <g key={p.id} transform={`translate(${p.x},${p.y})`} opacity={p.ghost ? 0.45 * (fadeOf.get(p.id) ?? 1) : fadeOf.get(p.id)}
                        onPointerDown={e => {
                          if (p.locked) { if (tool === "select" && e.button === 0) flashLockHint(); return } // locked: the press goes through to the board
                          if (tool === "homePlayer" || tool === "awayPlayer") {
                            e.stopPropagation()
                            setSel({ kind: "player", id: p.id })
                            setTool("select")
                            return
                          }
                          if (tool === "select" && e.shiftKey) {
                            e.stopPropagation()
                            setSelection(prev => isSel(p.id) ? prev.filter(s => s.id !== p.id) : [...prev, { kind: "player", id: p.id }])
                            return
                          }
                          startDrag(e, "player", p.id, p.x, p.y)
                        }}
                        onClick={e => { if (!p.locked && (tool === "select" || tool === "homePlayer" || tool === "awayPlayer")) e.stopPropagation() }}
                        onContextMenu={e => openMenu(e, { kind: "player", id: p.id }, p.locked)}
                        style={{ cursor: tool === "select" && !p.locked ? "grab" : "default" }}>
                        {p.glow && (
                          <circle r={r + 15} fill={p.bg} fillOpacity={0.4} filter="blur(8px)" />
                        )}
                        {/* Drop shadow (a ✕ marker also gets an invisible circle, so it's easy to grab) */}
                        {p.kind === "marker" ? (
                          <>
                            <circle r={r} fill="transparent" />
                            <path d={cross} transform="translate(1.5,2.5)" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={r * 0.3} strokeLinecap="round" />
                          </>
                        ) : tokenStyle === "minimal" ? null : (
                          <circle r={r + 1} fill="rgba(0,0,0,0.45)" cx={1.5} cy={2.5} />
                        )}
                        {p.kind === "marker" ? (
                          <>
                            {/* ✕ marker: a dark edge, then the colour */}
                            <path d={cross} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={r * 0.3 + 2.5} strokeLinecap="round" />
                            <path d={cross} fill="none" stroke={p.bg} strokeWidth={r * 0.3} strokeLinecap="round" />
                          </>
                        ) : p.kind === "ball" ? (
                          <BallGlyph r={r} />
                        ) : (
                          <>
                            {/* Main circle (a patterned kit lays its second colour on top, then the ring) */}
                            {(p.pat ?? "solid") === "solid" ? (
                              <circle r={r} fill={p.bg} stroke={p.ring} strokeWidth={ringW} strokeDasharray={p.ghost ? `${4 * s},${3 * s}` : undefined} />
                            ) : (
                              <>
                                <KitFill cid={`kc-${p.id}`} r={r} pat={p.pat!} c1={p.bg} c2={p.bg2 ?? "#ffffff"} />
                                <circle r={r} fill="none" stroke={p.ring} strokeWidth={ringW} strokeDasharray={p.ghost ? `${4 * s},${3 * s}` : undefined} />
                              </>
                            )}
                            {/* Number inside circle */}
                            {showPlayerLabels && numberText.trim() !== "" && (
                              <text textAnchor="middle" dominantBaseline="central" y={-1}
                                fill={p.fg} fontSize={numFontSize} fontWeight="800"
                                stroke={p.outline ? inkOn(p.fg) : undefined} strokeWidth={p.outline ? 3 * s : undefined}
                                paintOrder={p.outline ? "stroke" : undefined} strokeLinejoin="round"
                                overflow="visible"
                                style={{ fontFamily: "'Barlow Condensed',sans-serif", pointerEvents: "none" }}>
                                {numberText}
                              </text>
                            )}
                          </>
                        )}
                        {/* Selection ring + resize handle at bottom-right (on top, so the whole handle can be grabbed) */}
                        {isSelected && (
                          <>
                            <circle r={r + 7} fill="none" stroke={ACCENT_SOLID} strokeWidth={2.5} strokeDasharray="5,3" />
                            <circle cx={r * 0.707} cy={r * 0.707} r={6}
                              fill={ACCENT_SOLID} stroke="#ffffff" strokeWidth={1.5} style={{ cursor: "nwse-resize" }}
                              onPointerDown={e => { e.stopPropagation(); const q = svgXY(e); dragRef.current = { kind: "resizePlayer", id: p.id, ox: Math.hypot(q.x - p.x, q.y - p.y) - r, oy: 0 } }} />
                          </>
                        )}
                        {/* Name below circle — on a dark outline or a chip, never shrinks, free overflow */}
                        {showPlayerLabels && p.name.trim() !== "" && (
                          <NameLabel text={p.name} y={r + 6 * s + 13 * s * labelScale} size={13 * s * labelScale}
                            halo={3 * s * labelScale} pad={6 * s * labelScale} chip={nameStyle === "chip"} />
                        )}
                      </g>
                    )
                  })}

                  {/* 12. Overlay images */}
                  {ovImages.map(img => (
                    <image key={img.id} href={img.src}
                      x={img.x} y={img.y} width={img.width} height={img.height}
                      opacity={img.opacity} preserveAspectRatio="xMidYMid meet"
                      onPointerDown={e => { if (img.locked) { if (tool === "select" && e.button === 0) flashLockHint(); return } startDrag(e, "image", img.id, img.x, img.y) }}
                      onClick={e => {
                        if (img.locked) return
                        if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "image", id: img.id }); setTool("select"); return }
                        if (tool !== "select") return
                        e.stopPropagation()
                        if (e.shiftKey) setSelection(prev => isSel(img.id) ? prev.filter(s => s.id !== img.id) : [...prev, { kind: "image", id: img.id }])
                      }}
                      onContextMenu={e => openMenu(e, { kind: "image", id: img.id }, img.locked)}
                      style={{ cursor: tool === "select" && !img.locked ? "move" : "default" }} />
                  ))}

                  {/* Selected image border */}
                  {selI && (
                    <>
                      <rect
                        x={selI.layer === "background" ? 0 : selI.x}
                        y={selI.layer === "background" ? 0 : selI.y}
                        width={selI.layer === "background" ? CW : selI.width}
                        height={selI.layer === "background" ? CH : selI.height}
                        fill="none" stroke={ACCENT_SOLID} strokeWidth={2} strokeDasharray="6,3"
                        style={{ pointerEvents: "none" }} />
                      {selI.layer !== "background" && (
                        <circle cx={selI.x + selI.width} cy={selI.y + selI.height} r={6} fill="#fbbf24" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "nwse-resize" }}
                          onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizeImage", id: selI.id, ox: 0, oy: 0 } }} />
                      )}
                    </>
                  )}

                  {/* Box-select */}
                  {marquee && (
                    <rect x={Math.min(marquee.x1, marquee.x2)} y={Math.min(marquee.y1, marquee.y2)}
                      width={Math.abs(marquee.x2 - marquee.x1)} height={Math.abs(marquee.y2 - marquee.y1)}
                      fill="rgba(215,255,60,0.1)" stroke={ACCENT_SOLID} strokeWidth={1.5} strokeDasharray="5,3" style={{ pointerEvents: "none" }} />
                  )}

                  {/* The step on screen, "2/3" with its note, in the top corner (the editorial frame puts it in its slate) */}
                  {stepList.length > 1 && !editorial && (
                    <StepTag x={frame.x + 12 * sealK} y={frame.y + 8 * sealK} k={sealK * 0.85}
                      n={(view ? view.step : stepIdx) + 1} of={stepList.length} note={(view ? view.note : stepList[stepIdx]?.note ?? "").trim()} fade={view ? view.noteFade : 1} />
                  )}

                  {/* Team legend: the kit and name of each named team, bottom left */}
                  {!editorial && (homeName.trim() !== "" || awayName.trim() !== "") && (
                    <g style={{ pointerEvents: "none" }} transform={`translate(${frame.x},${frame.y + frame.h}) scale(${sealK})`}>
                      {(["home", "away"] as const).filter(team => (team === "home" ? homeName : awayName).trim() !== "").map((team, i, arr) => {
                        const k = kitOf(team)
                        return (
                          <g key={team} transform={`translate(30,${-26 - (arr.length - 1 - i) * 28})`}>
                            <KitFill cid={`kl-${team}`} r={10} pat={k.pat} c1={k.c1} c2={k.c2} />
                            <circle r={10} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
                            <text x={19} y={1} dominantBaseline="central" fill="#ffffff" fontSize={17} fontWeight={700}
                              stroke="rgba(0,0,0,0.85)" strokeWidth={3.5} paintOrder="stroke" strokeLinejoin="round"
                              style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                              {(team === "home" ? homeName : awayName).trim()}
                            </text>
                          </g>
                        )
                      })}
                    </g>
                  )}

                  {/* 12. Editorial frame */}
                  {editorial && (() => {
                    const hk = kitOf("home"), ak = kitOf("away")
                    const kinds = new Map<string, LegendItem>()
                    for (const a of legendArrows) {
                      const kd: LineKind = a.kind ?? (a.dash === "dashed" ? "run" : "pass")
                      if (!kinds.has(kd)) kinds.set(kd, { kind: kd, color: a.color, label: LINE_KINDS.find(([v]) => v === kd)?.[1] ?? kd })
                    }
                    const legend: LegendItem[] = [...kinds.values()]
                    if (legendGhosts) legend.push({ kind: "ghost", color: "#9ca3af", label: "Was / will be" })
                    return (
                      <EditorialFrame frame={frame} k={sealK} ink={inkOn(bgColor)} title={edBoard} kicker={kicker.trim()}
                        strip={edStrip ? { home: { name: homeName, score: homeScore, pat: hk.pat, c1: hk.c1, c2: hk.c2 }, away: { name: awayName, score: awayScore, pat: ak.pat, c1: ak.c1, c2: ak.c2 } } : null}
                        note={scoreNote.trim()} caption={edLines} legend={showLegend ? legend : []} crop={cropMarks} edition={showEdition ? editionStamp(editionNo) : null}
                        step={stepList.length > 1 ? { n: (view ? view.step : stepIdx) + 1, of: stepList.length, note: (view ? view.note : stepList[stepIdx]?.note ?? "").trim(), fade: view ? view.noteFade : 1 } : null}
                        band={canvasMode !== "blank" && (focus === "half" || focus === "third") ? { color: bgColor, top: Math.min(frame.y + (edStrip && frame.w < 1100 ? 196 : 112) * sealK, partRect.y - 2), bottom: Math.max(frame.y + frame.h - (edLines.length ? 92 + (edLines.length - 1) * 22 : 60) * sealK, partRect.y + partRect.h + 2) } : null} />
                    )
                  })()}

                  {/* 13. Creator seal — always last, always visible: your crest or logo, your handle (once you've chosen one) and PITCHSTUDIO (if you keep it on) */}
                  <g style={{ pointerEvents: "none" }} transform={`translate(${frame.x + frame.w - (editorial && cropMarks ? 10 * sealK : 0)},${frame.y + frame.h - (editorial && cropMarks ? 10 * sealK : 0)}) scale(${sealK})`}>
                    <CreatorSeal brand={creatorBrand} handle={creatorHandle} logo={creatorLogo} pill={inkOn(bgColor) === "#000000" ? "#1d1b16" : "rgba(0,0,0,0.62)"} />
                  </g>
                  {/* 14. The end card, at the end of a move */}
                  {view && view.end !== null && (
                    <EndCard frame={frame} k={sealK} t={view.end} handle={creatorHandle} brand={creatorBrand} logo={creatorLogo} bg={bgColor} ink={inkOn(bgColor)} edition={editorial && showEdition ? editionStamp(editionNo) : null} />
                  )}
                  </>)
                  })()}
                </svg>
              </div>
            </div>
          </div>

          {/* ── Zoom controls ── */}
          <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg px-2 py-1.5 border"
            style={{ background: SURFACE_1, borderColor: DS_BORDER_STRONG, zIndex: 10 }}>
            <button onClick={() => applyZoom(0.87)} className="p-1 rounded hover:bg-[var(--ps-hover)] transition-colors"><Minus size={13} /></button>
            <span className="text-xs font-mono w-12 text-center" style={{ color: TEXT_PRIMARY }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => applyZoom(1.15)} className="p-1 rounded hover:bg-[var(--ps-hover)] transition-colors"><Plus size={13} /></button>
            <div className="w-px h-4 mx-1" style={{ background: DS_BORDER_STRONG }} />
            <button onClick={fitToView} className="px-1.5 py-0.5 rounded text-xs hover:bg-[var(--ps-hover)] transition-colors"
              style={{ color: TEXT_MUTED }}>Fit</button>
          </div>
          {/* ── Steps: build a move one step at a time, and play it ── */}
          {workspaceMode !== "brainstorm" && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg px-1.5 py-1 border"
              style={{ background: SURFACE_1, borderColor: DS_BORDER_STRONG, zIndex: 31 }} onPointerDown={e => e.stopPropagation()}>
              {stepList.length > 1 && (
                <>
                  <button onClick={() => (play ? stopPlay() : startPlay())} disabled={!!making} title={play ? "Stop (P)" : "Play the move (P)"}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors"
                    style={{ background: play ? PS_VOLT : ACCENT_SOLID, color: play ? "#0a0c0f" : ACCENT_INK }}>
                    {play ? <Square size={10} fill="currentColor" /> : <Play size={11} fill="currentColor" />} {play ? "Stop" : "Play"}
                  </button>
                  <div className="w-px h-4 mx-1" style={{ background: DS_BORDER_STRONG }} />
                </>
              )}
              <span className="text-[10px] font-semibold uppercase px-1" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Steps</span>
              {(stepList.length > 1 ? stepList : [null]).map((_, i) => {
                const on = (view ? view.step : stepIdx) === i
                return (
                  <button key={i} onClick={() => goStep(i)} aria-pressed={on} aria-label={`Step ${i + 1}`} title={`Step ${i + 1}`}
                    className="w-6 h-6 rounded text-xs font-bold transition-colors"
                    style={{ background: on ? ACCENT_SOLID : SURFACE_2, color: on ? ACCENT_INK : TEXT_PRIMARY }}>
                    {i + 1}
                  </button>
                )
              })}
              <button onClick={addStep} disabled={stepList.length >= MAX_STEPS || !!play}
                title="Add the next step: everyone makes the runs you've drawn and the ball follows its passes"
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors hover:brightness-110"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, opacity: stepList.length >= MAX_STEPS || play ? 0.4 : 1 }}>
                <Plus size={11} /> Step
              </button>
              {stepList.length > 1 && (
                <>
                  <input value={stepList[stepIdx]?.note ?? ""} maxLength={48} aria-label="Step note" placeholder={`Note for step ${stepIdx + 1}`}
                    onChange={e => setStepNote(e.target.value)}
                    className="w-40 rounded px-2 py-1 text-xs outline-none" style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                  <button onClick={deleteStep} aria-label="Delete this step" title="Delete this step"
                    className="p-1 rounded hover:bg-red-500/20 transition-colors" style={{ color: DS_ERROR }}>
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          )}
          {/* While the move plays, a click anywhere on the board stops it */}
          {play && !making && <div className="absolute inset-0" style={{ zIndex: 30, cursor: "pointer" }} onPointerDown={e => { e.stopPropagation(); stopPlay() }} />}
          {/* Making a GIF or a video: the board plays it frame by frame underneath */}
          {making && (
            <div className="fixed inset-0 flex items-center justify-center px-4" style={{ zIndex: 60, background: "rgba(0,0,0,0.5)" }}>
              <div role="status" aria-live="polite" className="rounded-lg border shadow-xl w-72" style={{ background: SURFACE_1, borderColor: DS_BORDER, padding: "14px 16px" }}>
                <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY, margin: 0 }}>Making your {making.fmt === "gif" ? "GIF" : "video"}…</p>
                <div className="mt-3 rounded-full overflow-hidden" style={{ height: 6, background: SURFACE_2 }}>
                  <div style={{ width: `${Math.round(making.done * 100)}%`, height: "100%", background: PS_VOLT, transition: "width 0.2s" }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs" style={{ color: TEXT_MUTED }}>
                  <span>{Math.round(making.done * 100)}%</span>
                  <button onClick={() => { cancelMakeRef.current = true }} className="px-2 py-1 rounded hover:bg-[var(--ps-hover)] transition-colors" style={{ color: TEXT_PRIMARY }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Save problems, and the unsaved board that came back: shown over the canvas so they're visible on every screen size.
              The status region always stays in place, so screen readers announce whatever appears in it. */}
          <div role="status" aria-live="polite" className="absolute top-3 left-1/2 -translate-x-1/2"
            style={{ zIndex: 20, width: "max-content", maxWidth: "calc(100% - 24px)" }}
            onPointerDown={e => e.stopPropagation()}>
            {exportNote && (
              <div className="flex items-center gap-2 rounded-lg border shadow-xl text-xs mb-2" style={{ background: SURFACE_1, borderColor: DS_BORDER, padding: "6px 12px", color: TEXT_PRIMARY }}>
                <Copy size={13} style={{ color: ACCENT_SOLID }} />{exportNote}
              </div>
            )}
            {((saveStatus === "error" && saveError && !noticeHidden) || draftNotice) && (() => {
              const problem = saveStatus === "error" && !!saveError && !noticeHidden
              const conflict = problem && conflictRef.current
              return (
                <div className="flex items-center gap-2 rounded-lg border shadow-xl text-xs"
                  style={{ background: SURFACE_1, borderColor: problem ? "rgba(248,81,73,0.45)" : DS_BORDER, padding: "6px 6px 6px 12px" }}>
                  {problem
                    ? <AlertCircle size={14} style={{ color: DS_ERROR, flexShrink: 0 }} />
                    : <RotateCcw size={14} style={{ color: ACCENT_SOLID, flexShrink: 0 }} />}
                  <span style={{ color: TEXT_PRIMARY }}>{problem ? saveError : "We kept your unsaved board."}</span>
                  <button onClick={() => (problem ? saveBoard(conflict) : discardDraft())}
                    className="px-2 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors hover:bg-[var(--ps-hover)]"
                    style={{ color: problem ? ACCENT_SOLID : TEXT_MUTED }}>
                    {problem ? (conflict ? "Save as new board" : "Try again") : "Discard"}
                  </button>
                  <button onClick={() => (problem ? setNoticeHidden(true) : setDraftNotice(false))} aria-label="Close"
                    className="p-1 rounded transition-colors hover:bg-[var(--ps-hover)]" style={{ color: TEXT_MUTED }}>
                    <X size={13} />
                  </button>
                </div>
              )
            })()}
          </div>

          {/* Brainstorm watermark */}
          {workspaceMode === "brainstorm" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
              <p style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "clamp(28px, 4vw, 52px)",
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.055)",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}>
                don&apos;t think, just write
              </p>
            </div>
          )}
        </main>

        {/* ── Narrative: the written story that goes under the pitch (not on Braindump boards) ── */}
        {workspaceMode !== "brainstorm" && (
        <section aria-label="Narrative" className="flex-shrink-0 border-t" style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
          <style>{`.ps-narrative:focus { border-color: ${ACCENT_SOLID} !important; } input.accent-green-400, input.accent-orange-400 { accent-color: ${ACCENT_SOLID}; }`}</style>
          <button type="button" onClick={() => setNarrativeOpen(o => !o)} aria-expanded={narrativeOpen} aria-controls="ps-narrative-text"
            className="w-full flex items-center gap-2 px-4 text-left hover:bg-[var(--ps-hover)] transition-colors" style={{ height: 40 }}>
            <AlignLeft size={14} style={{ color: TEXT_MUTED, flexShrink: 0 }} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: TEXT_PRIMARY, flexShrink: 0 }}>
              NARRATIVE
            </span>
            {!narrativeOpen && (
              <span className="truncate text-xs min-w-0" style={{ color: TEXT_MUTED }}>
                {narrative.trim() ? narrative.trim().split("\n")[0] : "Add the story behind this board"}
              </span>
            )}
            <span className="ml-auto flex items-center gap-3 flex-shrink-0" style={{ color: TEXT_MUTED }}>
              {narrativeOpen && <span id="ps-narrative-count" className="text-[11px] tabular-nums">{narrative.length.toLocaleString()} / 2,000</span>}
              {narrativeOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </span>
          </button>
          {narrativeOpen && (
            <div className="px-4 pb-3">
              <textarea
                value={narrative}
                onChange={e => setNarrative(e.target.value.slice(0, 2000))}
                maxLength={2000}
                autoFocus
                id="ps-narrative-text"
                aria-label="Narrative"
                aria-describedby="ps-narrative-count"
                placeholder="What's the idea? Who presses, where the space opens, how the ball gets there…"
                className="ps-narrative w-full resize-none rounded-lg px-3 py-2.5 text-[16px] sm:text-sm leading-relaxed outline-none"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}`, height: "clamp(88px, 18vh, 160px)", fontFamily: "'Inter', sans-serif" }}
              />
            </div>
          )}
        </section>
        )}
        </div>
      </div>

      {/* ── Template modal ── */}
      {showTemplates && (
        <TemplateModal
          templates={templates} onClose={() => setShowTemplates(false)}
          onLoad={loadTemplate} onSave={saveTemplate}
          onDelete={deleteTemplate} />
      )}

      {/* ── First-visit tour ── */}
      {showTour && <Tour onDone={() => setShowTour(false)} />}

      {/* ── My Boards modal ── */}
      {showMyBoards && authUser && (
        <MyBoardsModal
          userId={authUser.id}
          currentBoardId={currentBoardId}
          onClose={() => setShowMyBoards(false)}
          onLoad={async (canvasData, boardTitle, boardId, boardNarrative, boardUpdatedAt) => {
            const ok = await confirmLeave()
            // The board that's already open: keep what's on screen (it's newer than what the list fetched)
            if (boardId === currentBoardIdRef.current) { setShowMyBoards(false); return }
            if (!ok) return
            openBoard(canvasData, boardTitle, boardId, boardNarrative, boardUpdatedAt)
            setShowMyBoards(false)
          }}
          onBoardDeleted={(id) => {
            // The open board was deleted: what's on screen stays, and only changes you make from now on count as unsaved
            if (id === currentBoardIdRef.current) { bindBoard(null); loadedUpdatedAtRef.current = null; conflictRef.current = false; unsureRef.current = [] }
          }}
          onBoardRenamed={(id, t) => { if (id === currentBoardIdRef.current) setTitle(t) }}
        />
      )}

      {/* ── Right-click menu ── */}
      {ctxMenu && (
        <div className="fixed inset-0 z-50" onPointerDown={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null) }}>
          <div className="absolute w-52 rounded-lg shadow-xl border flex flex-col py-1"
            style={{ left: Math.min(ctxMenu.x, window.innerWidth - 216), top: Math.min(ctxMenu.y, window.innerHeight - 250), background: SURFACE_1, borderColor: DS_BORDER }}
            onPointerDown={e => e.stopPropagation()}>
            {(ctxMenu.lockedItem
              ? [{ label: "Unlock", icon: <Unlock size={13} />, run: () => { setLocked([ctxMenu.lockedItem!], false); setSelection([ctxMenu.lockedItem!]) } }]
              : [
                { label: "Duplicate", hint: "Ctrl+D", icon: <Plus size={13} />, run: () => menuActionsRef.current.duplicate() },
                { label: "Copy", hint: "Ctrl+C", icon: <Copy size={13} />, run: () => menuActionsRef.current.copy() },
                { label: "Bring to front", icon: <BringToFront size={13} />, run: () => reorder("front") },
                { label: "Send to back", icon: <SendToBack size={13} />, run: () => reorder("back") },
                { label: "Lock", icon: <Lock size={13} />, run: () => { setLocked(selection, true); setSelection([]) } },
                { label: "Delete", hint: "Del", icon: <Trash2 size={13} />, run: deleteSelected, danger: true },
              ]
            ).map((item: { label: string; hint?: string; icon: React.ReactNode; run: () => void; danger?: boolean }) => (
              <button key={item.label} onClick={() => { setCtxMenu(null); item.run() }}
                className="flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-[var(--ps-hover)]"
                style={{ color: item.danger ? DS_ERROR : TEXT_PRIMARY }}>
                {item.icon}<span className="flex-1">{item.label}</span>
                {item.hint && <span style={{ color: TEXT_MUTED }}>{item.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Keyboard shortcuts modal ── */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setShowShortcuts(false)}>
          <div style={{ background: SURFACE_1, border: `1px solid ${DS_BORDER}`, borderRadius: 10, maxWidth: 380, width: "100%", padding: "20px 24px", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>Keyboard shortcuts</p>
              <button onClick={() => setShowShortcuts(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT_MUTED, padding: 2 }}><X size={16} /></button>
            </div>
            {([
              { header: "TOOLS", rows: [["Select","V"],["Pan","H"],["Home player","1"],["Away player","2"],["✕ marker","X"],["Ball","B"],["Arrow","A"],["Text","T"],["Shapes","S"],["Zone","Z"],["Upload image","I"]] },
              { header: "EDIT", rows: [["Undo","Ctrl+Z"],["Redo","Ctrl+Shift+Z"],["Duplicate","Ctrl+D"],["Copy","Ctrl+C"],["Paste","Ctrl+V"],["Delete","Del"]] },
              { header: "VIEW", rows: [["Zoom in","+"],["Zoom out","−"],["Fit to view","0"],["Deselect / cancel","Esc"]] },
              { header: "SELECTION", rows: [["Add to selection","Shift+click"],["Box-select","Drag on empty board"],["Select all","Ctrl+A"],["Nudge","Arrow keys"],["Nudge further","Shift+Arrow keys"],["More actions","Right-click"],["Pan canvas","Alt+drag"]] },
              { header: "STEPS", rows: [["Play the move / stop","P"],["Previous step","["],["Next step","]"]] },
            ] as { header: string; rows: [string, string][] }[]).map(group => (
              <div key={group.header} style={{ marginBottom: 14 }}>
                <p style={{ margin: "0 0 6px", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: TEXT_MUTED, textTransform: "uppercase", fontFamily: "'Inter', sans-serif" }}>{group.header}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 12px" }}>
                  {group.rows.map(([action, key]) => (
                    <React.Fragment key={action}>
                      <span style={{ fontSize: 12, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>{action}</span>
                      <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: "monospace", textAlign: "right", whiteSpace: "nowrap" }}>{key}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Leave without saving? ── */}
      {leaveAsk && (
        <LeaveConfirmModal key={leaveAsk} reason={leaveAsk} onAnswer={answerLeave} />
      )}

      {/* ── Clear All confirmation ── */}
      {showClearConfirm && (
        <ClearConfirmModal
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            snapshot()
            boardEpochRef.current += 1 // anything still saving belongs to the previous board
            setPlayers([]); setArrows([]); setTexts([])
            setShapes([]); setImages([]); setCustomZones([])
            setSteps([]); setStepIdx(0)
            setNarrative("")
            setSel(null)
            bindBoard(null)
            loadedUpdatedAtRef.current = null
            conflictRef.current = false
            unsureRef.current = []
            lastSavedRef.current = ""
            setSaveStatus("idle"); setSaveError(""); setDraftNotice(false)
            setShowClearConfirm(false)
          }}
        />
      )}
    </div>
  )
}

function hubRelTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 2) return "just now"
  if (diffMin < 60) return `${diffMin} minutes ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} hour${diffH > 1 ? "s" : ""} ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `${diffD} day${diffD > 1 ? "s" : ""} ago`
  const diffMo = Math.floor(diffD / 30)
  return `${diffMo} month${diffMo > 1 ? "s" : ""} ago`
}

/* ─────────────────────── Your boards: My Boards ─────────────── */
interface BoardCardRow { id: string; title: string; updated_at: string; thumb: CanvasState }
/** What a board's card needs. The picture is drawn from its pieces, lines and zones, never its photos (they can be large). */
const BOARD_CARD_COLS = "id, title, updated_at, players:canvas_data->players, arrows:canvas_data->arrows, shapes:canvas_data->shapes, zones:canvas_data->customZones, settings:canvas_data->settings, bg:canvas_data->bgColor"
const boardCardOf = (r: any): BoardCardRow => {
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  const settings = settingsFrom(r.settings && typeof r.settings === "object" ? r.settings : { bgColor: typeof r.bg === "string" ? r.bg : "#0d1117" })
  return {
    id: r.id, title: r.title || "Untitled board", updated_at: r.updated_at,
    thumb: { players: list(r.players), arrows: list(r.arrows), shapes: list(r.shapes), customZones: list(r.zones), texts: [], images: [], settings, title: "", bgColor: settings.bgColor, showPitch: true },
  }
}

/** Every board you've saved, as cards with a picture: click one to open it; ⋯ renames, duplicates or deletes it */
function BoardGrid({ userId, currentId = null, onOpen, onDeleted, onRenamed, empty, min = 220 }: {
  userId: string
  currentId?: string | null
  onOpen: (b: BoardCardRow) => Promise<void> | void
  onDeleted?: (id: string) => void
  onRenamed?: (id: string, title: string) => void
  empty: string
  min?: number
}) {
  const [boards, setBoards] = useState<BoardCardRow[] | null>(null)
  const [note, setNote] = useState("")
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchBoards = async () => {
    setNote("")
    await waitForSaves(5000) // a save still on its way would make the list out of date
    const { data, error } = await supabase.from("boards").select(BOARD_CARD_COLS)
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(60)
    if (error) { setNote("Couldn't load your boards. Check your connection."); setBoards(b => b ?? []); return }
    setBoards((data ?? []).map(boardCardOf))
  }
  useEffect(() => { fetchBoards() }, [userId])
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 5000); return () => clearTimeout(t) }, [note])

  const open = async (b: BoardCardRow) => {
    if (openingId || renaming?.id === b.id) return // one at a time
    setOpeningId(b.id)
    try { await onOpen(b) } finally { setOpeningId(null) }
  }
  const rename = async () => {
    if (!renaming) return
    const b = boards?.find(x => x.id === renaming.id), text = renaming.text.trim().slice(0, 80)
    setRenaming(null)
    if (!b || !text || text === b.title) return
    const { data, error } = await (supabase as any).from("boards").update({ title: text }).eq("id", b.id).eq("user_id", userId).select("id")
    if (error || !data?.length) { setNote(`Couldn't rename "${b.title}". Try again.`); return }
    setBoards(list => (list ?? []).map(x => (x.id === b.id ? { ...x, title: text } : x)))
    onRenamed?.(b.id, text)
  }
  const duplicate = async (b: BoardCardRow) => {
    setBusyId(b.id)
    await waitForBoardSave(b.id)
    const { data: src } = await supabase.from("boards").select("canvas_data, narrative").eq("id", b.id).single()
    const title = `${b.title} (copy)`.slice(0, 80)
    const res = src ? await (supabase as any).from("boards").insert({ user_id: userId, title, canvas_data: (src as any).canvas_data, narrative: (src as any).narrative ?? "" }).select("id, updated_at").single() : null
    setBusyId(null)
    if (!res || res.error || !res.data?.id) { setNote(`Couldn't duplicate "${b.title}". Try again.`); return }
    setBoards(list => [{ ...b, id: res.data.id, title, updated_at: res.data.updated_at ?? new Date().toISOString() }, ...(list ?? [])])
  }
  const remove = async (b: BoardCardRow) => {
    setBusyId(b.id)
    const { error } = await supabase.from("boards").delete().eq("id", b.id).eq("user_id", userId)
    setBusyId(null); setConfirmId(null)
    if (error) { setNote(`Couldn't delete "${b.title}". Check your connection and try again.`); return }
    setBoards(list => (list ?? []).filter(x => x.id !== b.id))
    onDeleted?.(b.id)
  }

  const item = (text: string, run: () => void, danger = false) => (
    <button key={text} onClick={() => { setMenuId(null); run() }}
      className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-[var(--ps-hover)]" style={{ color: danger ? DS_ERROR : TEXT_PRIMARY }}>{text}</button>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.1em", margin: 0 }}>
          Your boards{boards ? ` · ${boards.length}` : ""}
        </p>
        <p className="text-xs" style={{ color: TEXT_MUTED, margin: 0 }}>Newest first</p>
      </div>
      {note && (
        <div className="flex items-center gap-2 rounded px-3 py-2 text-xs" style={{ background: "rgba(248,81,73,0.12)", color: TEXT_PRIMARY }}>
          <AlertCircle size={13} style={{ color: DS_ERROR, flexShrink: 0 }} /> <span className="flex-1">{note}</span>
          <button onClick={fetchBoards} className="font-semibold hover:underline" style={{ color: TEXT_PRIMARY }}>Reload</button>
        </div>
      )}
      {boards === null && (
        <div className="flex items-center justify-center py-12 gap-2 text-sm" style={{ color: TEXT_MUTED }}>
          <Clock size={14} className="animate-spin" /> Loading boards…
        </div>
      )}
      {boards?.length === 0 && <p className="text-center py-10 text-sm" style={{ color: TEXT_MUTED }}>{empty}</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 12 }}>
        {(boards ?? []).map(b => {
          const here = b.id === currentId
          return (
            <div key={b.id} className="rounded-lg border relative" style={{ background: SURFACE_1, borderColor: here ? ACCENT_SOLID : DS_BORDER }}>
              <button onClick={() => open(b)} aria-label={`Open ${b.title}`} title={`Open ${b.title}`}
                className="block w-full overflow-hidden transition-opacity hover:opacity-90" style={{ borderRadius: "8px 8px 0 0", padding: 0, border: "none", cursor: "pointer" }}>
                <DropThumb data={b.thumb} />
              </button>
              <div className="flex items-start gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  {renaming?.id === b.id ? (
                    <input autoFocus value={renaming.text} maxLength={80} aria-label="Board name"
                      onChange={e => setRenaming({ id: b.id, text: e.target.value })} onBlur={rename}
                      onKeyDown={e => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null) }}
                      className="w-full rounded px-1.5 py-0.5 text-sm font-semibold outline-none"
                      style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${ACCENT_SOLID}` }} />
                  ) : (
                    <button onClick={() => setRenaming({ id: b.id, text: b.title })} title="Click to rename"
                      className="block max-w-full truncate text-left text-sm font-semibold" style={{ color: TEXT_PRIMARY, background: "transparent", border: "none", padding: 0 }}>{b.title}</button>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: here ? ACCENT_SOLID : TEXT_MUTED, margin: 0 }}>
                    {renaming?.id === b.id ? "Press Enter to save" : openingId === b.id ? "Opening…" : busyId === b.id ? "Working…" : here ? "Open now" : `Edited ${hubRelTime(b.updated_at)}`}
                  </p>
                </div>
                <div className="relative flex-shrink-0">
                  <button onClick={() => setMenuId(m => (m === b.id ? null : b.id))} aria-label={`More for ${b.title}`} aria-expanded={menuId === b.id} title="Rename, duplicate or delete"
                    className="p-1 rounded hover:bg-[var(--ps-hover)]" style={{ color: TEXT_MUTED }}><MoreHorizontal size={16} /></button>
                  {menuId === b.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
                      <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border shadow-xl z-50 py-1" style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
                        {item("Rename", () => setRenaming({ id: b.id, text: b.title }))}
                        {item("Duplicate", () => duplicate(b))}
                        {item("Delete…", () => setConfirmId(b.id), true)}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {confirmId === b.id && (
                <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center gap-3 p-4 text-center" style={{ background: "rgba(20,21,24,0.94)", zIndex: 5 }}>
                  <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY, margin: 0 }}>Delete “{b.title}”?</p>
                  <p className="text-xs" style={{ color: TEXT_MUTED, margin: 0 }}>This can't be undone.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmId(null)} className="px-3 py-1.5 rounded text-xs font-semibold" style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>Cancel</button>
                    <button onClick={() => remove(b)} disabled={busyId === b.id} className="px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-60" style={{ background: DS_ERROR, color: "#ffffff" }}>
                      {busyId === b.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────────── My Boards Modal ───────────────── */
function MyBoardsModal({ userId, currentBoardId, onClose, onLoad, onBoardDeleted, onBoardRenamed }: {
  userId: string
  currentBoardId: string | null
  onClose: () => void
  onLoad: (canvasData: unknown, title: string, id: string, narrative: string | null, updatedAt: string | null) => Promise<void> | void
  onBoardDeleted: (id: string) => void
  onBoardRenamed: (id: string, title: string) => void
}) {
  const open = async (b: BoardCardRow) => {
    await waitForBoardSave(b.id) // a save to this board that's still on its way lands first
    const { data } = await supabase.from("boards").select("canvas_data, title, narrative, updated_at").eq("id", b.id).single()
    if (data) await onLoad((data as any).canvas_data, (data as any).title, b.id, (data as any).narrative ?? null, (data as any).updated_at ?? null)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: SCRIM }}
      onClick={onClose}>
      <div className="relative w-full max-h-[80vh] flex flex-col rounded-xl border overflow-hidden"
        style={{ background: SURFACE_BASE, borderColor: DS_BORDER_STRONG, maxWidth: 760 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: DS_BORDER, background: SURFACE_1 }}>
          <div className="flex items-center gap-2">
            <FolderOpen size={16} style={{ color: ACCENT_SOLID }} />
            <span className="font-semibold" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", fontSize: 16 }}>
              MY BOARDS
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--ps-hover)]"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <BoardGrid userId={userId} currentId={currentBoardId} onOpen={open} onDeleted={onBoardDeleted} onRenamed={onBoardRenamed} min={200}
            empty="No saved boards yet. Press Save to keep your work." />
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── Lanes Overlay ─────────────────── */
// Renders in pitch-local coords (0..PW, 0..PH) — place inside scaled pitch group
function LanesOverlay({ upright = false }: { upright?: boolean }) {
  const laneH = PH / 5
  const orange = "#f97316"
  const lanes = [
    { label: "WIDE AREA",   fill: `rgba(249,115,22,0.08)`,  stroke: orange, y: 0 },
    { label: "HALF-SPACE",  fill: `rgba(249,115,22,0.18)`,  stroke: orange, y: laneH },
    { label: "CENTRE",      fill: `rgba(249,115,22,0.04)`,  stroke: orange, y: laneH * 2 },
    { label: "HALF-SPACE",  fill: `rgba(249,115,22,0.18)`,  stroke: orange, y: laneH * 3 },
    { label: "WIDE AREA",   fill: `rgba(249,115,22,0.08)`,  stroke: orange, y: laneH * 4 },
  ]
  return (
    <g style={{ pointerEvents: "none" }}>
      {lanes.map((ln, i) => (
        <g key={i}>
          <rect x={0} y={ln.y} width={PW} height={laneH}
            fill={ln.fill} stroke={ln.stroke} strokeWidth={1} strokeOpacity={0.5} />
          <text x={PW / 2} y={ln.y + laneH / 2} transform={upright ? `rotate(90 ${PW / 2} ${ln.y + laneH / 2})` : undefined}
            textAnchor="middle" dominantBaseline="middle"
            fill={orange} fontSize={14} fontWeight="700" fillOpacity={0.75}
            style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.12em" }}>
            {ln.label}
          </text>
        </g>
      ))}
      {/* Orange border around whole pitch */}
      <rect x={0} y={0} width={PW} height={PH} fill="none" stroke={orange} strokeWidth={2} />
      {/* Corner marks */}
      {[[0,0],[PW,0],[0,PH],[PW,PH]].map(([cx,cy], i) => (
        <g key={i}>
          <line x1={cx} y1={cy + (cy === 0 ? 30 : -30)} x2={cx} y2={cy} stroke={orange} strokeWidth={2.5} />
          <line x1={cx + (cx === 0 ? 30 : -30)} y1={cy} x2={cx} y2={cy} stroke={orange} strokeWidth={2.5} />
        </g>
      ))}
    </g>
  )
}

/* ──────────────────────── 18 Zones Overlay ─────────────────── */
function EighteenZonesOverlay({ upright = false }: { upright?: boolean }) {
  const cols = 6, rows = 3
  const cw = PW / cols   // 175
  const rh = PH / rows   // ≈ 226.67
  const orange = "#f97316"
  // Alternating zone shades — (col+row)%2
  const darkFill  = "rgba(30,30,40,0.55)"
  const lightFill = "rgba(60,60,75,0.45)"
  const zones: { zoneNum: number; col: number; row: number }[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      zones.push({ zoneNum: c * rows + r + 1, col: c, row: r })
    }
  }
  const thirds = [
    { label: "DEFENSIVE THIRD", x: 0 },
    { label: "MIDDLE THIRD",    x: cw * 2 },
    { label: "FINAL THIRD",     x: cw * 4 },
  ]
  return (
    <g style={{ pointerEvents: "none" }}>
      {zones.map(({ zoneNum, col, row }) => {
        const x = col * cw, y = row * rh
        const fill = (col + row) % 2 === 0 ? lightFill : darkFill
        return (
          <g key={zoneNum}>
            <rect x={x} y={y} width={cw} height={rh} fill={fill} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
            <text x={upright ? x + cw - 18 : x + 10} y={upright ? y + 10 : y + 18}
              transform={upright ? `rotate(90 ${x + cw - 18} ${y + 10})` : undefined}
              fill="rgba(255,255,255,0.55)" fontSize={16} fontWeight="700"
              style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>
              {zoneNum}
            </text>
          </g>
        )
      })}
      {/* Dashed dividers between thirds */}
      {[2, 4].map(c => (
        <line key={c} x1={c * cw} y1={0} x2={c * cw} y2={PH}
          stroke={orange} strokeWidth={1.5} strokeDasharray="10,6" strokeOpacity={0.8} />
      ))}
      {/* Third labels at bottom */}
      {thirds.map((t, i) => (
        <text key={i} x={t.x + cw} y={PH - 8} transform={upright ? `rotate(90 ${t.x + cw} ${PH - 8})` : undefined}
          textAnchor={upright ? "end" : "middle"} fill={orange} fontSize={11} fontWeight="700" fillOpacity={0.9}
          style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.08em" }}>
          {t.label}
        </text>
      ))}
      {/* Orange border */}
      <rect x={0} y={0} width={PW} height={PH} fill="none" stroke={orange} strokeWidth={2} />
      {/* Corner marks */}
      {([[0,0],[PW,0],[0,PH],[PW,PH]] as [number,number][]).map(([cx,cy], i) => (
        <g key={i}>
          <line x1={cx} y1={cy + (cy === 0 ? 30 : -30)} x2={cx} y2={cy} stroke={orange} strokeWidth={2.5} />
          <line x1={cx + (cx === 0 ? 30 : -30)} y1={cy} x2={cx} y2={cy} stroke={orange} strokeWidth={2.5} />
        </g>
      ))}
    </g>
  )
}

/* ─────────────────────────── Sub-components ────────────────── */
function FormationPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <button aria-label={label ? `${label} formation` : undefined} aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", background: SURFACE_2, border: `1px solid ${DS_BORDER}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, color: TEXT_PRIMARY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'Inter', sans-serif" }}>
        <span>{value}</span>
        <ChevronDown size={13} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: SURFACE_1, border: `1px solid ${DS_BORDER}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", zIndex: 101 }}>
            {FORMATIONS.map(f => (
              <button key={f.name}
                onClick={() => { onChange(f.name); setOpen(false) }}
                style={{ width: "100%", height: 32, padding: "0 10px", fontSize: 13, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", color: f.name === value ? ACCENT_SOLID : TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2 }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}>
                {f.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AlignBtn({ icon: Icon, title, onClick }: { icon: React.ElementType; title: string; onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: 28, height: 28,
        background: SURFACE_2,
        border: `1px solid ${hov ? ACCENT_SOLID : DS_BORDER}`,
        color: hov ? TEXT_PRIMARY : TEXT_MUTED,
      }}>
      <Icon size={14} />
    </button>
  )
}

const isHexColour = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v)
const RECENT_COLOURS_KEY = "ps-recent-colours"
const readRecentColours = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_COLOURS_KEY) || "[]")
    return Array.isArray(v) ? v.filter((c: unknown): c is string => typeof c === "string" && isHexColour(c)).slice(0, 10) : []
  } catch { return [] }
}
const rememberColour = (hex: string) => {
  try { localStorage.setItem(RECENT_COLOURS_KEY, JSON.stringify([hex.toLowerCase(), ...readRecentColours().filter(c => c !== hex.toLowerCase())].slice(0, 10))) }
  catch { /* private window: recent colours just aren't kept */ }
}

/** The fill of a kit circle: the main colour, with the second colour laid over it in the kit's pattern. Clipped to the circle. */
function KitFill({ cid, r, pat, c1, c2 }: { cid: string; r: number; pat: KitPattern; c1: string; c2: string }) {
  const w = (2 * r) / 5
  return (
    <>
      <clipPath id={cid}><circle r={r} /></clipPath>
      <circle r={r} fill={c1} />
      {pat !== "solid" && (
        <g clipPath={`url(#${cid})`} fill={c2}>
          {pat === "stripes" && <><rect x={-r + w} y={-r} width={w} height={2 * r} /><rect x={-r + 3 * w} y={-r} width={w} height={2 * r} /></>}
          {pat === "hoops" && <><rect x={-r} y={-r + w} width={2 * r} height={w} /><rect x={-r} y={-r + 3 * w} width={2 * r} height={w} /></>}
          {pat === "halves" && <rect x={0} y={-r} width={r} height={2 * r} />}
          {pat === "sash" && <rect x={-1.5 * r} y={-r * 0.3} width={3 * r} height={r * 0.6} transform="rotate(45)" />}
          {pat === "band" && <rect x={-r} y={-r * 0.3} width={2 * r} height={r * 0.6} />}
          {pat === "sleeves" && <><rect x={-r} y={-r} width={r * 0.42} height={2 * r} /><rect x={r * 0.58} y={-r} width={r * 0.42} height={2 * r} /></>}
        </g>
      )}
    </>
  )
}

/** A player's name under the piece: on a dark outline (halo) or on a small dark chip that fits the name */
function NameLabel({ text, y, size, halo, pad, chip }: { text: string; y: number; size: number; halo: number; pad: number; chip: boolean }) {
  const ref = useRef<SVGTextElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!chip) return
    const measure = () => { const tw = ref.current?.getComputedTextLength(); if (tw) setW(Math.ceil(tw)) }
    measure()
    document.fonts?.ready.then(measure)
  }, [chip, text, size])
  return (
    <>
      {chip && w > 0 && (
        <rect x={-w / 2 - pad} y={y - size * 0.925} width={w + pad * 2} height={size * 1.15} rx={size * 0.3}
          fill="rgba(10,12,15,0.86)" stroke="rgba(255,255,255,0.16)" strokeWidth={1} style={{ pointerEvents: "none" }} />
      )}
      <text ref={ref} textAnchor="middle" x={0} y={y}
        fill="#ffffff" fontSize={size} fontWeight={700}
        stroke={chip ? undefined : "rgba(0,0,0,0.9)"} strokeWidth={chip ? undefined : halo}
        paintOrder={chip ? undefined : "stroke"} strokeLinejoin="round"
        overflow="visible"
        style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.03em", pointerEvents: "none", textTransform: "uppercase" }}>
        {text}
      </text>
    </>
  )
}

/** A row of choices where exactly one is on */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map(([v, text]) => (
          <button key={v} onClick={() => onChange(v)} aria-pressed={value === v}
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{ background: value === v ? ACCENT_GRADIENT : SURFACE_2, color: value === v ? ACCENT_INK : TEXT_MUTED }}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A small round preview of a kit, for the pickers */
function KitDisc({ id, size, pat, c1, c2 }: { id: string; size: number; pat: KitPattern; c1: string; c2: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" style={{ display: "block" }}>
      <KitFill cid={`kd-${id}`} r={11} pat={pat} c1={c1} c2={c2} />
      <circle r={11} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
    </svg>
  )
}

const PATTERN_LABELS: Record<KitPattern, string> = { solid: "Solid", stripes: "Stripes", hoops: "Hoops", halves: "Halves", sash: "Sash", band: "Band", sleeves: "Sleeves" }
/** Pick how the second colour sits on the shirt */
function PatternRow({ value, onChange }: { value: KitPattern; onChange: (p: KitPattern) => void }) {
  return (
    <div>
      <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Pattern</p>
      <div className="flex flex-wrap gap-1">
        {KIT_PATTERNS.map(p => (
          <button key={p} onClick={() => onChange(p)} aria-pressed={value === p}
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{ background: value === p ? ACCENT_GRADIENT : SURFACE_2, color: value === p ? ACCENT_INK : TEXT_MUTED }}>
            {PATTERN_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Swatches plus a "+" for any colour: pick it, type its hex, or reuse one of your last ten. */
function ColorPicker({ label, colors, selected, onSelect, allowTransparent }: {
  label: string; colors: string[]; selected: string; onSelect: (c: string) => void; allowTransparent?: boolean
}) {
  const [pop, setPop] = useState<null | { x: number; y: number }>(null)
  const [hex, setHex] = useState("")
  const [recent, setRecent] = useState<string[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const selRef = useRef(selected)
  selRef.current = selected
  const startRef = useRef(selected)
  const custom = isHexColour(selected) && !colors.includes(selected)
  const openPop = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const box = rootRef.current?.getBoundingClientRect() ?? r
    startRef.current = selected
    setHex(isHexColour(selected) ? selected : "#ffffff"); setRecent(readRecentColours())
    // beside the panel, so the swatches stay visible while you try colours
    setPop({ x: Math.max(8, Math.min(box.right + 10, window.innerWidth - 232)), y: Math.max(8, Math.min(r.top - 40, window.innerHeight - 250)) })
  }
  const closePop = () => {
    if (isHexColour(selRef.current) && selRef.current !== startRef.current) rememberColour(selRef.current)
    setPop(null)
  }
  const dot = (c: string) => (
    <button key={c} title={c} aria-label={c} onClick={() => onSelect(c)}
      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
      style={{ background: c, borderColor: selected === c ? ACCENT_SOLID : "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }} />
  )
  return (
    <div ref={rootRef}>
      <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {allowTransparent && (
          <button title="No colour" aria-label="No colour" onClick={() => onSelect("transparent")}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center relative overflow-hidden"
            style={{ borderColor: selected === "transparent" ? ACCENT_SOLID : "transparent" }}>
            <div className="absolute inset-0 bg-white" />
            <div className="absolute inset-0 w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,0,0,0.5)_3px,rgba(255,0,0,0.5)_4px)]" />
          </button>
        )}
        {colors.map(c => dot(c))}
        {custom && dot(selected)}
        <button title="Any colour" aria-label="Any colour" onClick={openPop}
          className="w-5 h-5 rounded-full border transition-transform hover:scale-110 flex items-center justify-center"
          style={{ borderStyle: "dashed", borderColor: "rgba(255,255,255,0.35)", color: TEXT_MUTED, background: "transparent" }}>
          <Plus size={11} />
        </button>
      </div>
      {pop && (
        <div className="fixed inset-0 z-50" onPointerDown={closePop}>
          <div className="absolute rounded-lg border shadow-xl p-3 flex flex-col gap-3" onPointerDown={e => e.stopPropagation()}
            style={{ left: pop.x, top: pop.y, width: 216, background: SURFACE_1, borderColor: DS_BORDER }}>
            <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>{label}</p>
            <div className="flex items-center gap-2">
              <input type="color" aria-label="Pick a colour" value={isHexColour(hex) ? hex : "#ffffff"}
                onChange={e => { setHex(e.target.value); onSelect(e.target.value) }}
                className="rounded cursor-pointer flex-shrink-0"
                style={{ width: 36, height: 36, padding: 2, border: `1px solid ${DS_BORDER}`, background: "transparent" }} />
              <input type="text" aria-label="Hex colour" value={hex} maxLength={7} spellCheck={false} placeholder="#ffffff"
                onChange={e => {
                  let v = e.target.value.trim()
                  if (v && v[0] !== "#") v = "#" + v
                  v = v.slice(0, 7)
                  setHex(v)
                  if (isHexColour(v)) onSelect(v.toLowerCase())
                }}
                onKeyDown={e => { if (e.key === "Enter") closePop() }}
                className="flex-1 min-w-0 rounded px-2 py-1.5 text-xs font-mono outline-none"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
            </div>
            <div>
              <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Recent</p>
              {recent.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {recent.map(c => (
                    <button key={c} title={c} aria-label={`Recent ${c}`} onClick={() => { setHex(c); onSelect(c) }}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: selected === c ? ACCENT_SOLID : "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)" }} />
                  ))}
                </div>
              ) : (
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Colours you pick appear here.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TextSVG({ t, sel, editingText, setEditingText, startDrag, startResize, setSel, tool, updT, setTool, isSel: isSelfSel, onShiftClick, onMenu }: {
  t: TextBox; sel: Sel; editingText: string | null
  setEditingText: (id: string | null) => void
  startDrag: (e: React.PointerEvent) => void
  startResize?: (e: React.PointerEvent) => void
  setSel: (s: Sel) => void
  tool: Tool
  updT: (patch: Partial<TextBox>) => void
  setTool?: (t: Tool) => void
  isSel?: (id: string) => boolean
  onShiftClick?: () => void
  onMenu?: (e: React.MouseEvent) => void
}) {
  const isSelected = isSelfSel ? isSelfSel(t.id) : sel?.id === t.id
  const isEditing = editingText === t.id
  const lineH = t.size * 1.45
  const lines = t.text.split("\n")
  const autoH = lines.length * lineH + 20
  const boxH = Math.max(autoH, t.manualH || 0)
  const noBox = t.noBox === true
  // Ref-based focus — autoFocus is unreliable inside SVG foreignObject
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (isEditing && taRef.current) {
      taRef.current.focus()
      // Place cursor at end
      const len = taRef.current.value.length
      taRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  // Editing area is much larger than the display box so users can type freely
  const editW = Math.max(t.width, 400)
  const editH = Math.max(boxH, 300)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      const val = taRef.current?.value ?? t.text
      const cursorPos = taRef.current?.selectionStart ?? val.length
      const linesBefore = val.slice(0, cursorPos).split("\n")
      const currentLine = linesBefore[linesBefore.length - 1]
      // Auto-continue bullet on Enter
      if (currentLine.match(/^[•\-]\s/)) {
        e.preventDefault()
        const bullet = currentLine.startsWith("•") ? "• " : "- "
        const before = val.slice(0, cursorPos)
        const after = val.slice(cursorPos)
        const newVal = before + "\n" + bullet + after
        updT({ text: newVal })
        // Move cursor after inserted bullet
        setTimeout(() => {
          if (taRef.current) {
            const pos = cursorPos + 1 + bullet.length
            taRef.current.setSelectionRange(pos, pos)
          }
        }, 0)
      }
    }
    // Tab inserts spaces
    if (e.key === "Tab") {
      e.preventDefault()
      const val = taRef.current?.value ?? t.text
      const pos = taRef.current?.selectionStart ?? val.length
      const newVal = val.slice(0, pos) + "    " + val.slice(pos)
      updT({ text: newVal })
      setTimeout(() => { if (taRef.current) taRef.current.setSelectionRange(pos + 4, pos + 4) }, 0)
    }
    if (e.key === "Escape") setEditingText(null)
  }

  return (
    <g
      onContextMenu={onMenu}
      onPointerDown={e => {
        if (t.locked) return // locked: the press goes through to the board
        if (tool === "homePlayer" || tool === "awayPlayer") {
          e.stopPropagation()
          setSel({ kind: "text", id: t.id })
          setTool?.("select")
          return
        }
        if (tool === "select" && e.shiftKey && onShiftClick) {
          e.stopPropagation()
          onShiftClick()
          return
        }
        if (isEditing) { e.stopPropagation(); return } // selecting words while typing mustn't start a box-select
        startDrag(e) // selects it (or keeps the selection it's part of) and lets you move everything selected
      }}
      onClick={e => { if (!t.locked && (tool === "select" || tool === "homePlayer" || tool === "awayPlayer")) e.stopPropagation() }}
      onDoubleClick={e => { if (t.locked) return; e.stopPropagation(); setEditingText(t.id) }}
      style={{ cursor: tool === "select" ? (isEditing ? "text" : "move") : "default" }}>
      {/* Background box — hidden in free-text / no-box mode */}
      {!noBox && !isEditing && (
        <rect x={t.x} y={t.y} width={t.width} height={boxH}
          fill={t.bg} stroke={t.border}
          strokeWidth={t.border === "transparent" ? 0 : 1}
          strokeDasharray={t.dash ? "6,3" : undefined} rx={4} />
      )}
      {/* Selection outline */}
      {isSelected && !isEditing && (
        <rect x={t.x - 2} y={t.y - 2} width={t.width + 4} height={boxH + 4}
          fill="none" stroke={ACCENT_SOLID} strokeWidth={1.5} strokeDasharray="5,3" rx={5}
          style={{ pointerEvents: "none" }} />
      )}
      {/* Resize handle — bottom-right corner */}
      {isSelected && !isEditing && startResize && (
        <rect x={t.x + t.width - 6} y={t.y + boxH - 6} width={11} height={11} rx={2}
          fill="#fbbf24" stroke="#0d1117" strokeWidth={1.5}
          style={{ cursor: "nwse-resize" }}
          onPointerDown={e => { e.stopPropagation(); startResize(e) }} />
      )}
      {/* Inline editing — large open area so typing feels unrestricted */}
      {isEditing ? (
        <foreignObject x={t.x} y={t.y} width={editW} height={editH}>
          <textarea
            ref={taRef}
            value={t.text}
            placeholder="Start typing… use - or • for bullets"
            onChange={e => updT({ text: e.target.value })}
            onBlur={() => setEditingText(null)}
            onKeyDown={handleKeyDown}
            style={{
              width: "100%", height: "100%",
              background: "transparent",
              border: "none", outline: "none", resize: "none",
              color: t.fg, fontSize: t.size,
              fontWeight: t.bold ? "bold" : "normal",
              fontFamily: "'Inter', sans-serif", lineHeight: 1.45,
              caretColor: t.fg,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              padding: "4px 8px",
            }} />
        </foreignObject>
      ) : (
        /* Display — render each line as SVG text */
        lines.map((line, i) => (
          <text key={i} x={t.x + 8} y={t.y + 10 + (i + 0.85) * lineH}
            fill={t.fg} fontSize={t.size} fontWeight={t.bold ? "700" : "400"}
            style={{ fontFamily: "'Inter', sans-serif", pointerEvents: "none", whiteSpace: "pre" }}>
            {line || " "}
          </text>
        ))
      )}
    </g>
  )
}

/* ────────────────────────── Leave Confirm Modal ────────────── */
function LeaveConfirmModal({ reason, onAnswer }: { reason: LeaveReason; onAnswer: (answer: "leave" | "stay" | "save") => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  // When the dialog closes, focus goes back to where it was (read before the dialog takes focus)
  const [returnFocusTo] = useState(() => document.activeElement as HTMLElement | null)
  useEffect(() => () => {
    const now = document.activeElement
    if ((!now || now === document.body) && returnFocusTo?.isConnected) returnFocusTo.focus?.()
  }, [returnFocusTo])
  // While this is open, keys belong to the dialog: Esc = cancel, Tab stays inside, board shortcuts are paused
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation()
      if (e.key === "Escape") { e.preventDefault(); onAnswer("stay"); return }
      if (e.key === "Tab") {
        const items = Array.from(boxRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])
        if (!items.length) return
        const i = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === items.length - 1 ? 0 : i + 1)
        e.preventDefault(); items[next].focus()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onAnswer])
  const copy = {
    new: { title: "Save this board before you go?", body: "It hasn't been saved yet. If you leave without saving, it's gone.", leave: "Don't save", save: "Save" },
    failed: { title: "Your latest changes didn't save", body: "Check your connection and try again, or leave and lose them.", leave: "Leave anyway", save: "Try again" },
    conflict: { title: "This board changed somewhere else", body: "It was edited or deleted in another tab or on another device. Keep your version as a new board, or leave without it.", leave: "Leave anyway", save: "Save as new" },
    saving: { title: "Saving your changes…", body: "This usually takes a second. If you leave now, your latest changes may not be saved.", leave: "Leave anyway", save: "Saving…" },
  }[reason]
  const saving = reason === "saving"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={() => onAnswer("stay")}>
      <div ref={boxRef} role="alertdialog" aria-modal="true" aria-labelledby="ps-leave-title" aria-describedby="ps-leave-desc"
        className="rounded-xl border flex flex-col gap-5 p-6 w-full"
        style={{ background: SURFACE_1, borderColor: DS_BORDER, maxWidth: 380 }}
        onClick={e => e.stopPropagation()}>
        <div>
          <p id="ps-leave-title" style={{ color: TEXT_PRIMARY, fontSize: 15, fontWeight: 600, margin: 0, fontFamily: "'Inter', sans-serif" }}>
            {copy.title}
          </p>
          <p id="ps-leave-desc" style={{ color: TEXT_MUTED, fontSize: 13, margin: "6px 0 0", fontFamily: "'Inter', sans-serif" }}>
            {copy.body}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onAnswer("leave")}
            className="px-2 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--ps-hover)]"
            style={{ color: DS_ERROR }}>
            {copy.leave}
          </button>
          <div className="flex-1" />
          <button onClick={() => onAnswer("stay")} autoFocus={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:brightness-110"
            style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
            Cancel
          </button>
          <button onClick={() => onAnswer("save")} autoFocus={!saving} disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${saving ? "" : "hover:brightness-110"}`}
            style={{ background: ACCENT_GRADIENT, color: ACCENT_INK, opacity: saving ? 0.7 : 1, cursor: saving ? "default" : "pointer" }}>
            {saving && <RefreshCw size={13} className="motion-safe:animate-spin" />}
            {copy.save}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────── Clear Confirm Modal ────────────── */
function ClearConfirmModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onCancel}>
      <div className="rounded-xl border flex flex-col gap-5 p-6 w-full"
        style={{ background: SURFACE_1, borderColor: DS_BORDER, maxWidth: 360 }}
        onClick={e => e.stopPropagation()}>
        <div>
          <p style={{ color: TEXT_PRIMARY, fontSize: 15, fontWeight: 600, margin: 0, fontFamily: "'Inter', sans-serif" }}>
            Clear the board?
          </p>
          <p style={{ color: TEXT_MUTED, fontSize: 13, margin: "6px 0 0", fontFamily: "'Inter', sans-serif" }}>
            You start a fresh board. What you've saved stays in My Boards, and Undo brings this back.
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:brightness-110"
            style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:brightness-110"
            style={{ background: DS_ERROR, color: "#ffffff" }}>
            Clear board
          </button>
        </div>
      </div>
    </div>
  )
}

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

  componentDidCatch(error: Error) {
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
  return signedIn ? <HomePage /> : <LandingPage />
}

/** "/board" is the Tactics Board (sign-in only). A new visit opens a fresh board; "/board?open=ID" opens a saved one. */
function BoardRoute({ signedIn }: { signedIn: boolean }) {
  const loc = useLocation()
  if (!signedIn) return <Navigate to="/" replace />
  return <TacticsBoard key={loc.key} />
}

/** "/analysis" is Live Game Analysis (sign-in only). A new visit starts a new analysis; "/analysis?open=ID" opens a saved one. */
function AnalysisRoute({ signedIn }: { signedIn: boolean }) {
  const loc = useLocation()
  if (!signedIn) return <Navigate to="/" replace />
  return <Suspense fallback={<div style={{ minHeight: "100vh", background: SURFACE_BASE }} />}><AnalysisPage key={loc.key} /></Suspense>
}

/** "/braindump" opens the board as Braindump (a blank page to think on) */
function BraindumpRoute({ signedIn }: { signedIn: boolean }) {
  const loc = useLocation()
  if (!signedIn) return <Navigate to="/" replace />
  boardHandoff.braindump = true
  return <TacticsBoard key={loc.key} />
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
          <Route path="/" element={<HomeRoute signedIn={!!authUser} />} />
          <Route path="/board" element={<BoardRoute signedIn={!!authUser} />} />
          <Route path="/braindump" element={<BraindumpRoute signedIn={!!authUser} />} />
          <Route path="/analysis" element={<AnalysisRoute signedIn={!!authUser} />} />
          <Route path="/signin" element={authUser ? <Navigate to="/" replace /> : <AuthPage mode="signin" />} />
          <Route path="/signup" element={authUser ? <Navigate to="/" replace /> : <AuthPage mode="signup" />} />
          <Route path="/profile" element={authUser ? <ProfilePage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
