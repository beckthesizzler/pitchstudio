import { useState, useRef, useCallback, useEffect, useLayoutEffect, Component } from "react"
import type { ReactNode } from "react"
import React from "react"
import { toPng, toJpeg, getFontEmbedCSS } from "html-to-image"
import jsPDF from "jspdf"
import {
  MousePointer2, UserPlus, ArrowUpRight, Type, Pentagon,
  Trash2, Download, Layers, RotateCcw, RotateCw,
  ChevronDown, FileImage, Move, Hand, PanelLeftClose, PanelLeftOpen,
  ImagePlus, Square, Circle, Minus, Plus, BookOpen,
  Lock, Star, X, RefreshCw, Magnet, ChevronRight,
  Save, FolderOpen, LogIn, LogOut, User, AlertCircle, Check, Clock, MoreHorizontal,
  LayoutGrid, StickyNote, Video, FileText, UserSquare, Archive,
  Settings, ArrowLeft, HelpCircle, Mail, AlignLeft, ChevronUp,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from "lucide-react"
import { createClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey } from "../../utils/supabase/info"
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router"

const _sbKey = `sb-client-${projectId}`
// @ts-expect-error global singleton to survive HMR re-execution
const supabase: ReturnType<typeof createClient> = (globalThis[_sbKey] ??= createClient(`https://${projectId}.supabase.co`, publicAnonKey))

/* ─────────────────────────── Types ─────────────────────────── */
type Tool =
  | "select" | "pan"
  | "homePlayer" | "awayPlayer" | "marker" | "ball"
  | "arrow" | "text" | "shape" | "image" | "zone"

type ShapeKind = "polygon" | "circle" | "ellipse" | "rect"

interface Player {
  id: string; x: number; y: number
  name: string; num: string
  bg: string; fg: string; ring: string
  glow?: boolean
  scale?: number
  kind?: "marker" | "ball" // a ✕ marker or the ball; no kind = a player (every board saved before this)
}
interface Arrow {
  id: string
  x1: number; y1: number; x2: number; y2: number
  cpx: number; cpy: number
  color: string; strokeW: number
  dash: "none" | "dashed" | "dotted"
  label: string; twoWay: boolean
}
interface TextBox {
  id: string; x: number; y: number
  text: string; fg: string; bg: string
  border: string; dash: boolean
  size: number; bold: boolean; width: number
  layer: "foreground" | "background"
  manualH?: number
  noBox?: boolean
}
interface Shape {
  id: string; kind: ShapeKind
  pts: [number, number][]
  closed: boolean
  x: number; y: number; w: number; h: number
  fill: string; fillOpacity: number
  stroke: string; strokeW: number; strokeDash: boolean
  label: string
}
interface CustomZone {
  id: string
  x: number; y: number; w: number; h: number  // pitch-local coordinates (0..PW, 0..PH)
  color: string; opacity: number; label: string
}
interface UploadedImage {
  id: string; x: number; y: number
  width: number; height: number
  src: string; opacity: number
  layer: "background" | "overlay"
  naturalW: number; naturalH: number
}
interface CanvasState {
  players: Player[]; arrows: Arrow[]; texts: TextBox[]
  shapes: Shape[]; images: UploadedImage[]
  title: string; bgColor: string; showPitch: boolean
  customZones?: CustomZone[]; settings?: BoardSettings
}
interface Template {
  id: string; name: string
  data: CanvasState
  published: boolean
  createdAt: number
}

/** How a board looks. Saved with the board so it reopens exactly the same. */
interface BoardSettings {
  workspaceMode: "tactics" | "report" | "brainstorm"
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
}
/** What a saved board keeps in canvas_data (version 2). Version 1 boards only had the five element lists. */
interface BoardData {
  v: 2
  players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[]
  customZones: CustomZone[]
  settings: BoardSettings
}
const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  workspaceMode: "tactics", canvasMode: "full", showPitch: true, pitchColor: "green", bgColor: "#0d1117",
  pitchScale: 1, pitchOffX: 0, pitchOffY: 0, view3d: false, rotation: 0,
  homeColor: "#fbbf24", awayColor: "#1d4ed8", showPlayerLabels: true, textLayer: "foreground",
  showLanes: false, show18Zones: false,
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
    workspaceMode: oneOf(v.workspaceMode, ["tactics", "report", "brainstorm"] as const, d.workspaceMode),
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
  }
}
/** A short way to compare "what's on screen" with "what was last saved". */
const boardFingerprint = (title: string, narrative: string, data: BoardData) => JSON.stringify([title, narrative, data])
/** The pieces a board is made of, in a fixed order. Lists are compared as objects, so an edit shows up the moment it happens. */
const boardParts = (title: string, narrative: string, d: BoardData): unknown[] =>
  [title, narrative, d.players, d.arrows, d.texts, d.shapes, d.images, d.customZones, ...Object.values(d.settings)]
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
/** Hands a board (or Braindump) from the hub to the board page. Kept in memory: a board with photos can be too big for browser storage. */
const boardHandoff: { preload: { canvas_data: unknown; title: string | null; id: string; narrative: string | null; updated_at: string | null } | null; braindump: boolean } =
  { preload: null, braindump: false }
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
const CX = CW / 2, CY = CH / 2  // canvas center (700, 450)
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
const PALETTE = ["#ffffff","#fbbf24","#f87171","#60a5fa","#4ade80","#c084fc","#fb923c","#34d399","#f472b6","#000000"]
const SHAPE_FILLS = ["#fbbf24","#f87171","#60a5fa","#4ade80","#c084fc","#fb923c","#34d399","#f472b6"]
const BG_PRESETS = ["#0d1117","#1a1a2e","#0f2027","#1b2838","#2c2c2c","#f5f5f0","#ffffff","#1a472a"]
const SNAP_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360]

/* ── Design tokens ──────────────────────────────────────────────
   Fonts (do not mix roles):
   · Cormorant Garamond — PITCHSTUDIO wordmark only
   · Barlow Condensed   — logo badges, chrome labels, uppercase UI
   · Inter              — all body text, inputs, and buttons
──────────────────────────────────────────────────────────────── */
const SURFACE_BASE    = "#08080A"
const SURFACE_1       = "#121215"
const SURFACE_2       = "#1C1C21"
const ACCENT_GRADIENT = "linear-gradient(135deg, #7C5CFF, #B14AED)"
const ACCENT_SOLID    = "#7C5CFF"
const TEXT_PRIMARY    = "#F5F5F7"
const TEXT_MUTED      = "#8A8A94"
const DS_ERROR        = "#f85149"
const DS_BORDER       = "rgba(255,255,255,0.08)"

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

/* ─────────────────────────── Helpers ────────────────────────── */
function arrowPath(x1: number, y1: number, x2: number, y2: number, cpx: number, cpy: number) {
  return `M ${x1} ${y1} Q ${cpx} ${cpy} ${x2} ${y2}`
}
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
function snapAngle(deg: number, snap: boolean): number {
  if (!snap) return deg
  return SNAP_ANGLES.reduce((a, b) => Math.abs(b - deg) < Math.abs(a - deg) ? b : a)
}

/* ─────────────────────────── Pitch SVG ─────────────────────── */
// Renders in pitch-local coords (0..PW, 0..PH)
function PitchSVG({ pitchColor }: { pitchColor: "green" | "white" }) {
  const L = pitchColor === "white" ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.85)", W = 2.5
  return (
    <g>
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={i * (PW / 13)} y={0} width={PW / 13 + 1} height={PH}
          fill={pitchColor === "white" ? "#ffffff" : i % 2 === 0 ? "#1e6634" : "#1a5a2d"} />
      ))}
      <rect x={3} y={3} width={PW - 6} height={PH - 6} fill="none" stroke={L} strokeWidth={W} />
      <line x1={PCX} y1={3} x2={PCX} y2={PH - 3} stroke={L} strokeWidth={W} />
      <circle cx={PCX} cy={PCY} r={91.5} fill="none" stroke={L} strokeWidth={W} />
      <circle cx={PCX} cy={PCY} r={4.5} fill={L} />
      <rect x={3} y={PCY - 201.5} width={162} height={403} fill="none" stroke={L} strokeWidth={W} />
      <rect x={3} y={PCY - 91.5} width={53} height={183} fill="none" stroke={L} strokeWidth={W} />
      <rect x={-14} y={PCY - 37} width={14} height={74} fill={pitchColor === "white" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"} stroke={L} strokeWidth={1.5} />
      <circle cx={110} cy={PCY} r={4} fill={L} />
      <path d={`M 165 ${PCY - 73.1} A 91.5 91.5 0 0 1 165 ${PCY + 73.1}`} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW - 165} y={PCY - 201.5} width={162} height={403} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW - 56} y={PCY - 91.5} width={53} height={183} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW} y={PCY - 37} width={14} height={74} fill={pitchColor === "white" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"} stroke={L} strokeWidth={1.5} />
      <circle cx={PW - 110} cy={PCY} r={4} fill={L} />
      <path d={`M ${PW - 165} ${PCY - 73.1} A 91.5 91.5 0 0 0 ${PW - 165} ${PCY + 73.1}`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M 13 3 A 10 10 0 0 1 3 13`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M ${PW - 13} 3 A 10 10 0 0 0 ${PW - 3} 13`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M 3 ${PH - 13} A 10 10 0 0 1 13 ${PH - 3}`} fill="none" stroke={L} strokeWidth={W} />
      <path d={`M ${PW - 3} ${PH - 13} A 10 10 0 0 0 ${PW - 13} ${PH - 3}`} fill="none" stroke={L} strokeWidth={W} />
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
    return <polygon points={s.pts.map(([x, y]) => `${x},${y}`).join(" ")} {...shared as React.SVGProps<SVGPolygonElement>} />
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

/* ─────────────────────────── Template Modal ────────────────── */
function TemplateModal({
  templates, onClose, onLoad, onSave, onDelete, onTogglePublish, isAdmin, onAdminToggle,
}: {
  templates: Template[]
  onClose: () => void
  onLoad: (t: Template) => void
  onSave: (name: string) => void
  onDelete: (id: string) => void
  onTogglePublish: (id: string) => void
  isAdmin: boolean
  onAdminToggle: () => void
}) {
  const [tab, setTab] = useState<"my" | "library">("library")
  const [newName, setNewName] = useState("")
  const published = templates.filter(t => t.published)
  const mine = templates.filter(t => !t.published)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}>
      <div className="relative w-full max-h-[80vh] flex flex-col rounded-lg border overflow-hidden"
        style={{ background: SURFACE_1, borderColor: "rgba(255,255,255,0.1)", maxWidth: 640 }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2">
            <BookOpen size={16} style={{ color: ACCENT_SOLID }} />
            <span className="font-semibold" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", fontSize: 16 }}>
              TEMPLATE LIBRARY
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onAdminToggle}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors"
              style={{ background: isAdmin ? ACCENT_GRADIENT : SURFACE_2, color: isAdmin ? "#ffffff" : TEXT_MUTED }}>
              {isAdmin ? <Lock size={12} /> : <Lock size={12} />}
              {isAdmin ? "Admin" : "Viewer"}
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          {(["library", "my"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-5 py-2.5 text-xs font-semibold uppercase transition-colors"
              style={{
                letterSpacing: "0.08em",
                borderBottom: tab === t ? `2px solid ${ACCENT_SOLID}` : "2px solid transparent",
                color: tab === t ? ACCENT_SOLID : TEXT_MUTED,
              }}>
              {t === "library" ? `Published Library (${published.length})` : `My Templates (${mine.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "library" && (
            <>
              {published.length === 0 && (
                <p className="text-center py-8 text-sm" style={{ color: "#8b949e" }}>
                  No published templates yet.{isAdmin ? " Publish one from My Templates." : ""}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {published.map(t => (
                  <div key={t.id} className="rounded-lg border p-3 flex flex-col gap-2"
                    style={{ borderColor: "rgba(255,255,255,0.1)", background: "#21262d" }}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {t.name}
                      </span>
                      <Star size={12} style={{ color: ACCENT_SOLID, flexShrink: 0 }} />
                    </div>
                    <p className="text-xs" style={{ color: "#8b949e" }}>
                      {t.data.players.length} players · {t.data.arrows.length} arrows · {t.data.shapes.length} shapes
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      <button onClick={() => onLoad(t)}
                        className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                        style={{ background: ACCENT_GRADIENT, color: "#ffffff" }}>
                        Use Template
                      </button>
                      {isAdmin && (
                        <button onClick={() => onDelete(t.id)}
                          className="p-1 rounded transition-colors hover:bg-red-500/20"
                          style={{ color: "#f85149" }}>
                          <Trash2 size={13} />
                        </button>
                      )}
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
                  style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.12)" }}
                  onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { onSave(newName.trim()); setNewName("") } }}
                />
                <button onClick={() => { if (newName.trim()) { onSave(newName.trim()); setNewName("") } }}
                  className="px-3 py-1.5 rounded text-sm font-medium transition-colors"
                  style={{ background: ACCENT_GRADIENT, color: "#ffffff" }}>
                  Save Current
                </button>
              </div>

              {mine.length === 0 && (
                <p className="text-center py-6 text-sm" style={{ color: "#8b949e" }}>No saved templates. Save your current layout above.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {mine.map(t => (
                  <div key={t.id} className="rounded-lg border p-3 flex flex-col gap-2"
                    style={{ borderColor: "rgba(255,255,255,0.1)", background: "#21262d" }}>
                    <span className="font-semibold text-sm truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                      {t.name}
                    </span>
                    <p className="text-xs" style={{ color: "#8b949e" }}>
                      {t.data.players.length} players · {t.data.arrows.length} arrows
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      <button onClick={() => onLoad(t)}
                        className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                        style={{ background: ACCENT_GRADIENT, color: "#ffffff" }}>
                        Load
                      </button>
                      {isAdmin && (
                        <button onClick={() => onTogglePublish(t.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
                          style={{ background: `${ACCENT_SOLID}20`, color: ACCENT_SOLID }}>
                          <Star size={11} /> Publish
                        </button>
                      )}
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
  const [snapRot, setSnapRot] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [title, setTitle] = useState("Untitled board")
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [bgColor, setBgColor] = useState("#0d1117")
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
  const [showPlayerLabels, setShowPlayerLabels] = useState(true)
  const [showTemplates, setShowTemplates] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sideTab, setSideTab] = useState<"selected" | "board">("board")
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 900 : true)
  const [boardGroups, setBoardGroups] = useState({ formation: true, teams: true, zones: false, pitch: false, canvas: false })
  const [textLayer, setTextLayer] = useState<"foreground" | "background">("foreground")
  const [selectedFormation, setSelectedFormation] = useState("4-3-3")

  /* ── Auth ── */
  const [authUser, setAuthUser] = useState<import("@supabase/supabase-js").User | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [authInitialTab, setAuthInitialTab] = useState<"signin" | "signup">("signin")
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
  useEffect(() => {
    if (!authUser) { setAccountName(""); setCreatorHandle(""); return }
    let cancelled = false
    supabase.from("profiles").select("display_name, handle").eq("id", authUser.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const raw = (data as any)?.display_name || (data as any)?.handle || ""
        setAccountName(stripHandleSuffix(raw, authUser.id, authUser.email))
        const handle: string = (data as any)?.handle || ""
        setCreatorHandle(handle && stripHandleSuffix(handle, authUser.id, authUser.email) === handle ? handle : "")
      })
    return () => { cancelled = true }
  }, [authUser?.id])

  // Deep-link handlers: set by HubPage before navigating to "/"
  const entryRef = useRef<"board" | "braindump" | "opened">("board") // how you got here (decides which unsaved draft comes back)
  useEffect(() => {
    if (boardHandoff.braindump) {
      boardHandoff.braindump = false
      entryRef.current = "braindump"
      setWorkspaceMode("brainstorm")
      setCanvasMode("blank")
      setBgColor("#08080A")
      setShowPitch(false)
      return
    }
    const preload = boardHandoff.preload
    if (preload) {
      boardHandoff.preload = null
      openBoard(preload.canvas_data, preload.title, preload.id, preload.narrative, preload.updated_at)
      entryRef.current = "opened"
    }
  }, [])

  const [saveError, setSaveError] = useState("")
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const [headerMenu, setHeaderMenu] = useState<null | "export" | "account" | "more">(null) // the header menu that's open

  /** Saves the whole board: elements, zones, pitch settings, title and narrative.
   *  forceNew = "Save as new board". auto = the quiet background save (no sign-in prompt, no analytics event).
   *  Resolves true once saved, false if it couldn't be. Never waits longer than saveTimeoutFor() allows. */
  const saveBoard = (forceNew = false, auto = false): Promise<boolean> => {
    if (!authUser) { if (!auto) setShowAuth(true); return Promise.resolve(false) }
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
  const [workspaceMode, setWorkspaceMode] = useState<"tactics" | "report" | "brainstorm">("tactics")

  /* ── Zone overlays ── */
  const [show18Zones, setShow18Zones] = useState(false)
  const [showLanes, setShowLanes] = useState(false)
  const [customZones, setCustomZones] = useState<CustomZone[]>([])
  const [zoneColor, setZoneColor] = useState("#3fb950")
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

  /* ── Whole-board save and restore ── */
  /** Everything about the board right now, in the format it's saved in. */
  const collectBoard = (): BoardData => ({
    v: 2,
    players, arrows, texts, shapes, images, customZones,
    settings: settingsFrom({
      workspaceMode, canvasMode, showPitch, pitchColor, bgColor, pitchScale, pitchOffX, pitchOffY,
      view3d, rotation, homeColor, awayColor, showPlayerLabels, textLayer, showLanes, show18Zones,
    }),
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
    setShowLanes(st.showLanes); setShow18Zones(st.show18Zones)
  }
  /** Opens a board exactly as it was saved. Older boards get today's defaults for anything they didn't store.
   *  boardId = null starts a new, unsaved board (used for templates). */
  const openBoard = (raw: unknown, boardTitle: string | null, boardId: string | null, boardNarrative: string | null, boardUpdatedAt: string | null) => {
    const d = normalizeBoardData(raw)
    const t = boardTitle || "Untitled board"
    const n = boardNarrative ?? ""
    boardEpochRef.current += 1 // anything still saving belongs to the previous board
    histRef.current = []; histIdx.current = -1 // undo can't bring back another board's content
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
      showPlayerLabels, textLayer, showLanes, show18Zones, currentBoardId, authUser, saveTick])

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
    openBoard(workspaceMode === "brainstorm" ? { settings: { workspaceMode: "brainstorm", canvasMode: "blank", bgColor: "#08080A", showPitch: false } } : null, null, null, null, null)
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

  /* ── Multi-player drag start positions ── */
  const multiDragStartRef = useRef<{ startCursorX: number; startCursorY: number; players: { id: string; x: number; y: number }[] } | null>(null)

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
  const [arrowDraft, setArrowDraft] = useState<{ x1: number; y1: number } | null>(null)
  const [polyDraft, setPolyDraft] = useState<[number, number][] | null>(null)
  const shapeDrawRef = useRef<{ x1: number; y1: number } | null>(null)
  const [shapeDraftPreview, setShapeDraftPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  /* ── Refs ── */
  const svgRef = useRef<SVGSVGElement>(null)
  const pitchRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasDraggedRef = useRef(false)
  const mouseDownPosRef = useRef({ x: 0, y: 0 })

  /* ── Drag refs ── */
  const dragRef = useRef<{
    kind: "player" | "text" | "image" | "arrowCp" | "arrowP1" | "arrowP2" | "resizeShape" | "resizeText" | "resizeImage" | "resizePlayer" | "resizePitch" | "zone" | "movePitch"
    id: string; ox: number; oy: number
  } | null>(null)
  const panDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)

  /* ── History ── */
  type Snap = { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[]; customZones: CustomZone[] }
  const histRef = useRef<Snap[]>([])
  const histIdx = useRef(-1)

  const snapshot = useCallback(() => {
    const s: Snap = {
      players: players.map(x => ({ ...x })),
      arrows: arrows.map(x => ({ ...x })),
      texts: texts.map(x => ({ ...x })),
      shapes: shapes.map(x => ({ ...x, pts: [...x.pts] })),
      images: images.map(x => ({ ...x })),
      customZones: customZones.map(x => ({ ...x })),
    }
    histRef.current = histRef.current.slice(0, histIdx.current + 1)
    histRef.current.push(s)
    histIdx.current = histRef.current.length - 1
  }, [players, arrows, texts, shapes, images, customZones])

  const undo = () => {
    if (histIdx.current < 0) return
    const live: Snap = {
      players: players.map(x => ({ ...x })),
      arrows: arrows.map(x => ({ ...x })),
      texts: texts.map(x => ({ ...x })),
      shapes: shapes.map(x => ({ ...x, pts: [...x.pts] })),
      images: images.map(x => ({ ...x })),
      customZones: customZones.map(x => ({ ...x })),
    }
    const target = histRef.current[histIdx.current]
    const redoIdx = histIdx.current + 1
    if (redoIdx < histRef.current.length) {
      histRef.current[redoIdx] = live
    } else {
      histRef.current.push(live)
    }
    histIdx.current--
    setPlayers(target.players); setArrows(target.arrows); setTexts(target.texts)
    setShapes(target.shapes); setImages(target.images); setCustomZones(target.customZones); setSelection([])
  }
  const redo = () => {
    if (histIdx.current + 2 >= histRef.current.length) return
    histIdx.current++
    const s = histRef.current[histIdx.current + 1]
    setPlayers(s.players); setArrows(s.arrows); setTexts(s.texts)
    setShapes(s.shapes); setImages(s.images); setCustomZones(s.customZones)
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
    return Math.max(0.2, Math.min(1, (box.width - 24) / SVG_DISPLAY_W, (box.height - 24) / (SVG_DISPLAY_W * CH / CW)))
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
      const newPlayers = players.filter(p => pIds.has(p.id)).map(p => ({ ...p, id: uid(), x: p.x + dx, y: p.y + dy }))
      const newArrows = arrows.filter(a => aIds.has(a.id)).map(a => ({ ...a, id: uid(), x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy, cpx: a.cpx + dx, cpy: a.cpy + dy }))
      const newTexts = texts.filter(t => tIds.has(t.id)).map(t => ({ ...t, id: uid(), x: t.x + dx, y: t.y + dy }))
      const newShapes = shapes.filter(s => sIds.has(s.id)).map(s => ({ ...s, id: uid(), x: s.x + dx, y: s.y + dy, pts: s.pts.map(([px, py]: [number, number]) => [px + dx, py + dy] as [number, number]) }))
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
      const newPlayers = cb.players.map(p => ({ ...p, id: uid(), x: p.x + 24, y: p.y + 24 }))
      const newArrows = cb.arrows.map(a => ({ ...a, id: uid(), x1: a.x1 + 24, y1: a.y1 + 24, x2: a.x2 + 24, y2: a.y2 + 24, cpx: a.cpx + 24, cpy: a.cpy + 24 }))
      const newTexts = cb.texts.map(t => ({ ...t, id: uid(), x: t.x + 24, y: t.y + 24 }))
      const newShapes = cb.shapes.map(s => ({ ...s, id: uid(), x: s.x + 24, y: s.y + 24, pts: s.pts.map(([px, py]: [number, number]) => [px + 24, py + 24] as [number, number]) }))
      const newImages = cb.images.map(i => ({ ...i, id: uid(), x: i.x + 24, y: i.y + 24 }))
      const newZones = cb.zones.map(z => ({ ...z, id: uid(), x: z.x + 24, y: z.y + 24 }))
      applyDuplicates({ newPlayers, newArrows, newTexts, newShapes, newImages, newZones })
    }

    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const tag = el.tagName
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") el.blur()
        return
      }
      if (e.key === "Delete" || e.key === "Backspace") del()
      if (e.key === "Escape") {
        setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null
        setShapeDraftPreview(null); setSel(null)
        if (tool !== "select") setTool("select")
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") undo()
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === "z" || e.key === "y")) redo()
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); if (!typing) duplicate() }
      if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); if (!typing) copy() }
      if ((e.ctrlKey || e.metaKey) && e.key === "v") { e.preventDefault(); if (!typing) paste() }
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
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, tool, snapshot, applyZoom])

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

  /* ── Add formation ── */
  const addFormation = useCallback((formationName: string, team: "home" | "away") => {
    const formation = FORMATIONS.find(f => f.name === formationName)
    if (!formation) return
    snapshot()
    const newPlayers: Player[] = formation.positions.map(pos => {
      // Convert pitch-local to canvas coords
      const cx = team === "home"
        ? PX + pos.x
        : PX + (PW - pos.x)
      const cy = PY + pos.y
      const colors = team === "home" ? { ...HOME_COLORS, bg: homeColor } : { ...AWAY_COLORS, bg: awayColor }
      return {
        id: uid(),
        x: cx,
        y: cy,
        name: pos.pos,
        num: String(pos.num),
        ...colors,
        glow: false
      }
    })
    setPlayers(prev => [...prev, ...newPlayers])
  }, [snapshot])

  /* ── SVG pointer events (unifies mouse, touch, and pen) ── */
  const onSVGMouseMove = useCallback((e: React.PointerEvent) => {
    const { x, y } = svgXY(e)
    setMouse({ x, y })

    // Track drag distance
    const dx = e.clientX - mouseDownPosRef.current.x
    const dy = e.clientY - mouseDownPosRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 3) hasDraggedRef.current = true

    if (shapeDrawRef.current && shapeKind !== "polygon") {
      setShapeDraftPreview({ x1: shapeDrawRef.current.x1, y1: shapeDrawRef.current.y1, x2: x, y2: y })
    }
    if (zoneDrawRef.current) {
      const px = (x - PX - pitchOffXRef.current) / pitchScaleRef.current
      const py = (y - PY - pitchOffYRef.current) / pitchScaleRef.current
      setZoneDraft({ x1: zoneDrawRef.current.x, y1: zoneDrawRef.current.y, x2: px, y2: py })
    }

    if (!dragRef.current) return
    const d = dragRef.current
    if (d.kind === "player" && multiDragStartRef.current) {
      const md = multiDragStartRef.current
      const dx2 = x - md.startCursorX
      const dy2 = y - md.startCursorY
      setPlayers(p => p.map(pl => {
        const origin = md.players.find(mp => mp.id === pl.id)
        return origin ? { ...pl, x: origin.x + dx2, y: origin.y + dy2 } : pl
      }))
    } else if (d.kind === "player") setPlayers(p => p.map(pl => pl.id === d.id ? { ...pl, x: x - d.ox, y: y - d.oy } : pl))
    else if (d.kind === "text") setTexts(t => t.map(tb => tb.id === d.id ? { ...tb, x: x - d.ox, y: y - d.oy } : tb))
    else if (d.kind === "image") setImages(i => i.map(im => im.id === d.id ? { ...im, x: x - d.ox, y: y - d.oy } : im))
    else if (d.kind === "arrowCp") setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, cpx: x, cpy: y } : ar))
    else if (d.kind === "arrowP1") setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, x1: x, y1: y, cpx: (x + ar.x2) / 2, cpy: (y + ar.y2) / 2 } : ar))
    else if (d.kind === "arrowP2") setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, x2: x, y2: y, cpx: (ar.x1 + x) / 2, cpy: (ar.y1 + y) / 2 } : ar))
    else if (d.kind === "resizeShape") setShapes(s => s.map(sh => sh.id === d.id ? { ...sh, w: Math.max(10, x - sh.x), h: Math.max(10, y - sh.y) } : sh))
    else if (d.kind === "resizeText") setTexts(t => t.map(tb => {
      if (tb.id !== d.id) return tb
      const lH = tb.size * 1.45
      const autoH = tb.text.split("\n").length * lH + 16
      return { ...tb, width: Math.max(60, x - tb.x), manualH: Math.max(autoH, y - tb.y) }
    }))
    else if (d.kind === "resizePlayer") setPlayers(p => p.map(pl => pl.id === d.id ? { ...pl, scale: Math.max(0.5, (Math.hypot(x - pl.x, y - pl.y) - d.ox) / pieceBase(pl)) } : pl)) // the handle stays under the cursor (ox = where on the handle you grabbed it)
    else if (d.kind === "resizeImage") setImages(i => i.map(im => im.id === d.id ? { ...im, width: Math.max(20, x - im.x), height: Math.max(20, y - im.y) } : im))
    else if (d.kind === "zone") {
      const px = (x - PX - pitchOffXRef.current) / pitchScaleRef.current
      const py = (y - PY - pitchOffYRef.current) / pitchScaleRef.current
      setCustomZones(z => z.map(zone => zone.id === d.id ? { ...zone, x: px - d.ox, y: py - d.oy } : zone))
    }
    else if (d.kind === "resizePitch") {
      const offX = pitchOffXRef.current
      if (d.id === "pitch-tr" || d.id === "pitch-br") {
        setPitchScale(Math.max(0.3, Math.min(2.5, (x - PX - offX) / PW)))
      } else {
        setPitchScale(prev => Math.max(0.3, Math.min(2.5, (PX + offX + PW * prev - x) / PW)))
      }
    }
    else if (d.kind === "movePitch") {
      setPitchOffX(x - d.ox - PX)
      setPitchOffY(y - d.oy - PY)
    }
  }, [svgXY, shapeKind])

  const onSVGMouseUp = useCallback(() => {
    if (dragRef.current) { snapshot(); dragRef.current = null; multiDragStartRef.current = null }
  }, [snapshot])

  const onSVGMouseDown = useCallback((e: React.PointerEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    hasDraggedRef.current = false
    if (tool === "shape" && shapeKind !== "polygon") {
      const { x, y } = svgXY(e)
      shapeDrawRef.current = { x1: x, y1: y }
    }
    if (tool === "zone") {
      const { x, y } = svgXY(e)
      const px = (x - PX - pitchOffXRef.current) / pitchScaleRef.current
      const py = (y - PY - pitchOffYRef.current) / pitchScaleRef.current
      zoneDrawRef.current = { x: px, y: py }
    }
  }, [tool, shapeKind, svgXY])

  const onSVGClick = useCallback((e: React.PointerEvent) => {
    if (hasDraggedRef.current) return
    const { x, y } = svgXY(e)

    // A new player's number counts players only, not ✕ markers or the ball
    const nextNum = String(players.filter(q => !q.kind).length + 1)
    if (tool === "homePlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "", num: nextNum, ...HOME_COLORS, bg: homeColor, glow: false, scale: 1 }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id }); setTool("select")
    } else if (tool === "awayPlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "", num: nextNum, ...AWAY_COLORS, bg: awayColor, glow: false, scale: 1 }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id }); setTool("select")
    } else if (tool === "marker" || tool === "ball") {
      snapshot()
      const p: Player = tool === "marker"
        ? { id: uid(), x, y, kind: "marker", name: "", num: "", bg: MARKER_COLOR, fg: "#ffffff", ring: "#000000", glow: false, scale: 1 }
        : { id: uid(), x, y, kind: "ball", name: "", num: "", bg: "#ffffff", fg: "#000000", ring: "#000000", glow: false, scale: 1 }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id }); setTool("select")
    } else if (tool === "arrow") {
      if (!arrowDraft) {
        setArrowDraft({ x1: x, y1: y })
      } else {
        snapshot()
        const mx = (arrowDraft.x1 + x) / 2
        const my = (arrowDraft.y1 + y) / 2
        const a: Arrow = {
          id: uid(), x1: arrowDraft.x1, y1: arrowDraft.y1, x2: x, y2: y,
          cpx: mx, cpy: my,
          color: arrowDefaultColor, strokeW: arrowDefaultW, dash: arrowDefaultDash, label: "", twoWay: false
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
  }, [tool, shapeKind, players, arrowDraft, polyDraft, shapes.length, textLayer, svgXY, snapshot, arrowDefaultDash, arrowDefaultColor, arrowDefaultW])

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
  const startDrag = (e: React.PointerEvent, kind: "player" | "text" | "image", id: string, ex: number, ey: number) => {
    e.stopPropagation()
    if (kind !== "text" && tool !== "select") return
    const { x, y } = svgXY(e)
    if (kind === "player" && selection.length > 1 && isSel(id)) {
      // Multi-player drag: capture start cursor + all selected player positions
      const selPlayers = players.filter(p => isSel(p.id))
      multiDragStartRef.current = {
        startCursorX: x,
        startCursorY: y,
        players: selPlayers.map(p => ({ id: p.id, x: p.x, y: p.y })),
      }
      dragRef.current = { kind: "player", id, ox: x - ex, oy: y - ey }
    } else {
      dragRef.current = { kind, id, ox: x - ex, oy: y - ey }
      setSel({ kind: kind === "image" ? "image" : kind, id })
    }
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
          id: uid(), x: CX - w / 2, y: CY - h / 2,
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
  const doExport = async (fmt: "png" | "jpeg" | "pdf") => {
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
      if (fmt === "png") {
        const url = await toPng(node, { pixelRatio: 2, fontEmbedCSS })
        const a = document.createElement("a"); a.href = url; a.download = `${name}.png`; a.click()
      } else if (fmt === "jpeg") {
        const url = await toJpeg(node, { quality: 0.95, pixelRatio: 2, backgroundColor: bgColor, fontEmbedCSS })
        const a = document.createElement("a"); a.href = url; a.download = `${name}.jpg`; a.click()
      } else {
        const url = await toPng(node, { pixelRatio: 2, fontEmbedCSS })
        const img = new Image(); img.src = url
        await new Promise(r => { img.onload = r })
        const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [img.width, img.height] })
        pdf.addImage(url, "PNG", 0, 0, img.width, img.height)
        pdf.save(`${name}.pdf`)
      }
      ;(window as any).posthog?.capture("board_exported", { format: fmt })
    } catch (err) { console.error(err) }
    finally { setSelection(keepSelection) }
  }
  // The watermark's background fits its text (a handle can be any length)
  const wmTextRef = useRef<SVGTextElement>(null)
  const [wmWidth, setWmWidth] = useState(92)
  useLayoutEffect(() => {
    const measure = () => { const w = wmTextRef.current?.getComputedTextLength(); if (w) setWmWidth(Math.ceil(w)) }
    measure()
    document.fonts?.ready.then(measure)
  }, [creatorHandle])

  /* ── Templates ── */
  const getCanvasState = (): CanvasState => ({
    players, arrows, texts, shapes, images, title, bgColor, showPitch,
    customZones, settings: collectBoard().settings,
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
  const togglePublish = (id: string) => saveTemplates(templates.map(t => t.id === id ? { ...t, published: !t.published } : t))

  /* ── Selected element refs ── */
  const selP = sel?.kind === "player" ? players.find(p => p.id === sel.id) : null
  const selA = sel?.kind === "arrow" ? arrows.find(a => a.id === sel.id) : null
  const selT = sel?.kind === "text" ? texts.find(t => t.id === sel.id) : null
  const selS = sel?.kind === "shape" ? shapes.find(s => s.id === sel.id) : null
  const selI = sel?.kind === "image" ? images.find(i => i.id === sel.id) : null

  const updP = (patch: Partial<Player>) => setPlayers(p => p.map(x => x.id === sel!.id ? { ...x, ...patch } : x))
  const updA = (patch: Partial<Arrow>) => setArrows(a => a.map(x => x.id === sel!.id ? { ...x, ...patch } : x))
  const updT = (patch: Partial<TextBox>) => setTexts(t => t.map(x => x.id === sel!.id ? { ...x, ...patch } : x))
  const updS = (patch: Partial<Shape>) => setShapes(s => s.map(x => x.id === sel!.id ? { ...x, ...patch } : x))
  const updI = (patch: Partial<UploadedImage>) => setImages(i => i.map(x => x.id === sel!.id ? { ...x, ...patch } : x))

  /* ── Rotation ── */
  const handleRotation = (val: number) => {
    const r = ((val % 360) + 360) % 360
    setRotation(snapRot ? snapAngle(r, true) : r)
  }

  /* ── Transform string ── */
  const pitchTransform = [
    `translate(${panX}px, ${panY}px)`,
    `scale(${zoom})`,
    `rotate(${rotation}deg)`,
  ].join(" ")

  const pitchInnerTransform = view3d
    ? "perspective(1400px) rotateX(38deg) scaleY(0.95)"
    : "none"

  /* ── Layer splits ── */
  const bgTexts = texts.filter(t => t.layer === "background")
  const fgTexts = texts.filter(t => t.layer === "foreground")
  const bgImages = images.filter(i => i.layer === "background")
  const ovImages = images.filter(i => i.layer === "overlay")

  // SVG display width — we use a fixed display width; viewBox handles scaling
  const SVG_DISPLAY_W = 980

  /* ─────────── RENDER ─────────── */
  return (
    <div className="flex flex-col h-screen overflow-hidden select-none"
      style={{ fontFamily: "'Inter', sans-serif", background: SURFACE_BASE, color: TEXT_PRIMARY }}>

      {/* ── Top Header ── (on narrower screens the less-used controls move into the ⋯ menu) */}
      <header className="flex items-center gap-2 lg:gap-3 px-2 sm:px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#161b22", minHeight: 48 }}>
        {headerMenu && <div className="fixed inset-0 z-40" onClick={() => setHeaderMenu(null)} />}
        {/* Logo + Workspace Mode Selector + Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
            title="Back to Hub"
            onClick={async () => { if (await confirmLeave()) navigateBoard("/hub") }}
            style={{ background: ACCENT_SOLID, color: "#ffffff", fontFamily: "'Barlow Condensed', sans-serif", cursor: "pointer" }}>PS</div>
          <div className="hidden sm:block flex-shrink-0">
            <WorkspaceModeSelector mode={workspaceMode} onChange={m => {
              setWorkspaceMode(m)
              if (m === "report") { setCanvasMode("blank"); setBgColor("#f5f5f0"); setShowPitch(false) }
              else if (m === "brainstorm") { setCanvasMode("blank"); setBgColor("#0d1117"); setShowPitch(false) }
              else { setCanvasMode("full"); setBgColor("#0d1117"); setShowPitch(true) }
            }} />
          </div>
          <div className="hidden sm:block w-px h-5 mx-1 xl:mx-3 flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }} />
          {editingTitle ? (
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => { if (e.key === "Enter") setEditingTitle(false) }}
              className="bg-transparent outline-none font-bold text-sm min-w-0"
              style={{ borderBottom: `1px solid ${ACCENT_SOLID}`, color: TEXT_PRIMARY, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", width: 200 }} />
          ) : (
            <button onClick={() => setEditingTitle(true)}
              className="flex items-center gap-1.5 group px-2 py-1 rounded hover:bg-white/8 transition-colors min-w-0"
              title="Click to rename">
              <span className="font-bold text-sm truncate max-w-28 xl:max-w-44"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em" }}>{title}</span>
              <span className="text-xs opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" style={{ color: ACCENT_SOLID }}>✏</span>
            </button>
          )}
        </div>

        <div className="flex-1 hidden lg:flex items-center gap-2 justify-center">
          {/* Rotation control */}
          <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: "#21262d" }}>
            <RefreshCw size={13} style={{ color: TEXT_MUTED }} />
            <input type="range" min={0} max={360} value={rotation}
              onChange={e => handleRotation(+e.target.value)}
              className="hidden xl:block w-20 accent-green-400" style={{ height: 4 }} />
            <input
              type="number" min={0} max={360} value={Math.round(rotation)}
              onChange={e => handleRotation(+e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
              className="w-12 rounded px-1 py-0.5 text-xs font-mono text-center outline-none"
              style={{ background: "#161b22", color: "#c9d1d9", border: "1px solid rgba(255,255,255,0.1)" }}
              title="Type exact angle" />
            <span className="text-xs" style={{ color: "#555e6b" }}>°</span>
            <button onClick={() => setSnapRot(s => !s)} title={snapRot ? "45° snap ON — click to disable" : "Enable 45° snap"}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-colors"
              style={{ background: snapRot ? "#fbbf2420" : "transparent", color: snapRot ? "#fbbf24" : TEXT_MUTED }}>
              <Magnet size={12} />{snapRot && <span style={{ fontSize: 9, fontWeight: 700 }}>45°</span>}
            </button>
            <button onClick={() => setRotation(0)} title="Reset to 0°"
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: TEXT_MUTED }}>
              <RotateCcw size={13} />
            </button>
          </div>

          {/* 3D toggle */}
          <button onClick={() => setView3d(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
            style={{ background: view3d ? ACCENT_SOLID : SURFACE_2, color: view3d ? "#ffffff" : "#c9d1d9" }}>
            <Layers size={13} />
            {view3d ? "3D" : "2D"}
          </button>
        </div>
        <div className="flex-1 lg:hidden" />

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Templates */}
          <button onClick={() => setShowTemplates(true)} title="Templates"
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
            style={{ background: "#21262d", color: "#c9d1d9" }}>
            <BookOpen size={13} /> <span className="hidden xl:inline">Templates</span>
          </button>
          {/* My Boards */}
          {authUser && (
            <button onClick={() => setShowMyBoards(true)} title="My Boards"
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ background: "#21262d", color: "#c9d1d9" }}>
              <FolderOpen size={13} /> <span className="hidden xl:inline">My Boards</span>
            </button>
          )}
          {/* Save */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-stretch">
              <button onClick={() => saveBoard()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: saveStatus === "error" ? DS_ERROR : ACCENT_GRADIENT,
                  color: "#ffffff",
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
                      background: saveStatus === "error" ? DS_ERROR : ACCENT_GRADIENT,
                      color: "#ffffff",
                      borderLeft: "1px solid rgba(255,255,255,0.25)",
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
                          className="flex items-center gap-2 w-full text-left px-3 py-2 text-xs transition-colors hover:bg-white/5"
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
          {/* Auth */}
          {authUser ? (
            <div className="relative hidden lg:block">
              <button onClick={() => setHeaderMenu(m => (m === "account" ? null : "account"))} aria-expanded={headerMenu === "account"}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
                style={{ background: "#21262d", color: "#c9d1d9" }}>
                <User size={13} />
                <span className="max-w-20 truncate hidden xl:inline">{accountName || authUser.email?.split("@")[0]}</span>
                <ChevronDown size={11} />
              </button>
              {headerMenu === "account" && (
                <div className="absolute right-0 top-full mt-1 w-36 rounded shadow-xl border z-50 flex flex-col"
                  style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
                  <button onClick={async () => { setHeaderMenu(null); if (await confirmLeave()) supabase.auth.signOut() }}
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/10 transition-colors text-left"
                    style={{ color: "#f85149" }}>
                    <LogOut size={12} /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => { setAuthInitialTab("signin"); setShowAuth(true) }}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
              <LogIn size={13} /> Sign In
            </button>
          )}
          {/* Undo/Redo */}
          <button onClick={undo} className="hidden lg:block p-1.5 rounded hover:bg-white/10 transition-colors" title="Undo (Ctrl+Z)"><RotateCcw size={14} /></button>
          <button onClick={redo} className="hidden lg:block p-1.5 rounded hover:bg-white/10 transition-colors" title="Redo"><RotateCw size={14} /></button>
          {/* Clear All — visually separated by a divider so it reads as destructive/distinct */}
          <div className="hidden lg:flex self-stretch items-center mx-2" style={{ width: 1, background: DS_BORDER }} />
          <button
            onClick={() => setShowClearConfirm(true)}
            className="hidden lg:flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors hover:bg-red-500/20 ml-1"
            style={{ color: DS_ERROR }}
            title="Clear all canvas elements">
            <Trash2 size={13} /> <span className="hidden xl:inline">Clear All</span>
          </button>
          {/* Export */}
          <div className="relative">
            <button onClick={() => setHeaderMenu(m => (m === "export" ? null : "export"))} aria-expanded={headerMenu === "export"} title="Export"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{ background: "transparent", color: ACCENT_SOLID, border: `1px solid ${ACCENT_SOLID}` }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${ACCENT_SOLID}26` }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}>
              <Download size={13} /> <span className="hidden sm:inline">Export</span> <ChevronDown size={11} />
            </button>
            {headerMenu === "export" && (
              <div className="absolute right-0 top-full mt-1 w-28 rounded shadow-xl border z-50 flex flex-col"
                style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
                {(["png", "jpeg", "pdf"] as const).map(f => (
                  <button key={f} onClick={() => { setHeaderMenu(null); doExport(f) }}
                    className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/10 transition-colors text-left uppercase font-semibold"
                    style={{ letterSpacing: "0.06em" }}>
                    <FileImage size={12} /> {f}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* ⋯ More: everything that doesn't fit in the bar on narrower screens */}
          <div className="relative lg:hidden">
            <button onClick={() => setHeaderMenu(m => (m === "more" ? null : "more"))} aria-expanded={headerMenu === "more"}
              aria-label="More" title="More"
              className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: "#c9d1d9" }}>
              <MoreHorizontal size={16} />
            </button>
            {headerMenu === "more" && (
              <div className="absolute right-0 top-full mt-1 w-48 rounded-lg shadow-xl border z-50 flex flex-col py-1"
                style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
                {([
                  { label: "Templates", icon: <BookOpen size={13} />, run: () => setShowTemplates(true) },
                  ...(authUser ? [{ label: "My Boards", icon: <FolderOpen size={13} />, run: () => setShowMyBoards(true) }] : []),
                  { label: "Undo", icon: <RotateCcw size={13} />, run: undo },
                  { label: "Redo", icon: <RotateCw size={13} />, run: redo },
                  { label: view3d ? "Switch to 2D" : "Switch to 3D", icon: <Layers size={13} />, run: () => setView3d(v => !v) },
                  { label: "Clear All", icon: <Trash2 size={13} />, run: () => setShowClearConfirm(true), danger: true },
                  authUser
                    ? { label: "Sign Out", icon: <LogOut size={13} />, run: async () => { if (await confirmLeave()) supabase.auth.signOut() }, danger: true }
                    : { label: "Sign In", icon: <LogIn size={13} />, run: () => { setAuthInitialTab("signin"); setShowAuth(true) } },
                ] as { label: string; icon: React.ReactNode; run: () => void; danger?: boolean }[]).map(item => (
                  <button key={item.label} onClick={() => { setHeaderMenu(null); item.run() }}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-white/10"
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
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: tool === btn.id ? ACCENT_GRADIENT : "transparent", color: tool === btn.id ? "#fff" : btn.tint, transition: "background 0.12s, color 0.12s" }}
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
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: tool === btn.id ? ACCENT_GRADIENT : "transparent", color: tool === btn.id ? "#fff" : btn.tint, transition: "background 0.12s, color 0.12s" }}
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
                style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: tool === btn.id ? ACCENT_GRADIENT : "transparent", color: tool === btn.id ? "#fff" : TEXT_MUTED, transition: "background 0.12s, color 0.12s" }}
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
        <aside style={{ width: 230, flexShrink: 0, height: "100%", background: SURFACE_BASE, borderRight: `1px solid ${DS_BORDER}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${DS_BORDER}`, flexShrink: 0 }}>
            {(["board", "selected"] as const).map(t => (
              <button key={t} onClick={() => setSideTab(t)}
                style={{ flex: 1, height: 36, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", border: "none", cursor: "pointer", background: "transparent", color: sideTab === t ? TEXT_PRIMARY : TEXT_MUTED, borderBottom: sideTab === t ? `2px solid ${ACCENT_SOLID}` : "2px solid transparent", fontFamily: "'Inter', sans-serif", transition: "color 0.12s" }}>
                {t === "selected" ? "EDIT" : "BOARD"}
              </button>
            ))}
          </div>

          {/* ── SELECTED TAB ── */}
          <div style={{ flex: 1, overflowY: "auto", display: sideTab === "selected" ? "flex" : "none", flexDirection: "column" }}>
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
                  </div>
                )
              })()
            ) : sel ? (
              <div className="p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>
                    {selP ? (selP.kind === "marker" ? "✕ marker" : selP.kind === "ball" ? "Ball" : "Player") : selA ? "Arrow" : selT ? "Text" : selS ? "Shape" : selI ? "Image" : sel.kind === "zone" ? "Zone" : "Element"}
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
                    <ColorPicker label="Color" colors={PALETTE} selected={selP.bg} onSelect={c => updP({ bg: c })} />
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                      <input type="checkbox" checked={selP.glow || false} onChange={e => updP({ glow: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Glow Highlight</span>
                    </label>
                  </div>
                )}

                {selP && selP.kind === "ball" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs" style={{ color: TEXT_MUTED }}>Drag to move it. Drag the round handle to resize it.</p>
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                      <input type="checkbox" checked={selP.glow || false} onChange={e => updP({ glow: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Glow Highlight</span>
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
                    <ColorPicker label="Kit color" colors={PALETTE} selected={selP.bg}
                      onSelect={c => updP({ bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" })} />
                    <ColorPicker label="Ring color" colors={PALETTE} selected={selP.ring} onSelect={c => updP({ ring: c })} allowTransparent={true} />
                    <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                      <input type="checkbox" checked={selP.glow || false} onChange={e => updP({ glow: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Glow Highlight</span>
                    </label>
                  </div>
                )}

                {selA && (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Label</span>
                      <input value={selA.label} onChange={e => updA({ label: e.target.value })}
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                    </label>
                    <ColorPicker label="Color" colors={PALETTE} selected={selA.color} onSelect={c => updA({ color: c })} />
                    <div>
                      <p className="text-xs mb-1" style={{ color: TEXT_MUTED }}>Style</p>
                      <div className="flex gap-1">
                        {(["none","dashed","dotted"] as const).map(s => (
                          <button key={s} onClick={() => updA({ dash: s })}
                            className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                            style={{ background: selA.dash === s ? ACCENT_GRADIENT : SURFACE_2, color: selA.dash === s ? "#fff" : TEXT_MUTED }}>
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
                    <p className="text-[10px] italic mt-1" style={{ color: TEXT_MUTED }}>Drag the handle on the arrow to curve manually.</p>
                  </div>
                )}

                {selT && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1.5">
                      <button onClick={() => updT({ noBox: false, bg: "rgba(13,17,23,0.85)", border: ACCENT_SOLID })}
                        className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                        style={{ background: !selT.noBox ? ACCENT_GRADIENT : SURFACE_2, color: !selT.noBox ? "#fff" : TEXT_MUTED }}>
                        ▣ With Box
                      </button>
                      <button onClick={() => updT({ noBox: true, bg: "transparent", border: "transparent" })}
                        className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                        style={{ background: selT.noBox ? ACCENT_GRADIENT : SURFACE_2, color: selT.noBox ? "#fff" : TEXT_MUTED }}>
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
                    <ColorPicker label="Text color" colors={PALETTE} selected={selT.fg} onSelect={c => updT({ fg: c })} />
                    <ColorPicker label="Background" colors={PALETTE} selected={selT.bg} onSelect={c => updT({ bg: c })} allowTransparent={true} />
                    <ColorPicker label="Border" colors={PALETTE} selected={selT.border} onSelect={c => updT({ border: c })} allowTransparent={true} />
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
                            style={{ background: selT.layer === l ? ACCENT_GRADIENT : SURFACE_2, color: selT.layer === l ? "#fff" : TEXT_MUTED }}>
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
                    <ColorPicker label="Fill" colors={SHAPE_FILLS} selected={selS.fill} onSelect={c => updS({ fill: c })} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Opacity {Math.round(selS.fillOpacity * 100)}%</span>
                      <input type="range" min={5} max={95} value={Math.round(selS.fillOpacity * 100)}
                        onChange={e => updS({ fillOpacity: +e.target.value / 100 })} className="w-full accent-green-400" />
                    </label>
                    <ColorPicker label="Border" colors={PALETTE} selected={selS.stroke} onSelect={c => updS({ stroke: c })} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: TEXT_MUTED }}>Border width {selS.strokeW}px</span>
                      <input type="range" min={1} max={6} value={selS.strokeW}
                        onChange={e => updS({ strokeW: +e.target.value })} className="w-full accent-green-400" />
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={selS.strokeDash} onChange={e => updS({ strokeDash: e.target.checked })} className="accent-green-400" />
                      <span style={{ color: TEXT_PRIMARY }}>Dashed border</span>
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
                            style={{ background: selI.layer === l ? ACCENT_GRADIENT : SURFACE_2, color: selI.layer === l ? "#fff" : TEXT_MUTED }}>
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
                  const updZ = (patch: Partial<CustomZone>) =>
                    setCustomZones(zones => zones.map(x => x.id === sel.id ? { ...x, ...patch } : x))
                  return (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: TEXT_MUTED }}>Label</span>
                        <input value={z.label} onChange={e => updZ({ label: e.target.value })} placeholder="e.g. Press zone"
                          className="rounded px-2 py-1 text-xs outline-none"
                          style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                      </label>
                      <div>
                        <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Color</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {["#3fb950","#f97316","#58a6ff","#f85149","#fbbf24","#c084fc","#34d399","#ffffff"].map(c => (
                            <button key={c} onClick={() => updZ({ color: c })}
                              className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                              style={{ background: c, borderColor: z.color === c ? "#fff" : "transparent" }} />
                          ))}
                        </div>
                      </div>
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
                <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>Arrow defaults</p>
                <div>
                  <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>Line</p>
                  <div className="flex gap-1.5">
                    {(["none","dashed","dotted"] as const).map(d => (
                      <button key={d} onClick={() => setArrowDefaultDash(d)}
                        className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                        style={{ background: arrowDefaultDash === d ? ACCENT_GRADIENT : SURFACE_2, color: arrowDefaultDash === d ? "#fff" : TEXT_MUTED }}>
                        {d === "none" ? "—" : d === "dashed" ? "- -" : "···"}
                      </button>
                    ))}
                  </div>
                </div>
                <ColorPicker label="Color" colors={PALETTE} selected={arrowDefaultColor} onSelect={setArrowDefaultColor} />
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
                        style={{ background: textLayer === l ? ACCENT_GRADIENT : SURFACE_2, color: textLayer === l ? "#fff" : TEXT_MUTED }}>
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
                      style={{ background: shapeKind === k ? ACCENT_GRADIENT : SURFACE_2, color: shapeKind === k ? "#fff" : TEXT_MUTED }}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-xs" style={{ color: TEXT_MUTED }}>
                Select an element on the pitch to edit it.
              </div>
            )}
          </div>

          {/* ── BOARD TAB ── */}
          <div style={{ flex: 1, overflowY: "auto", display: sideTab === "board" ? "block" : "none" }}>

            <button aria-expanded={boardGroups.formation}
              onClick={() => setBoardGroups(g => ({ ...g, formation: !g.formation }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.formation ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Formation
            </button>
            {boardGroups.formation && (
              <div className="p-3 flex flex-col gap-2" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <FormationPicker value={selectedFormation} onChange={setSelectedFormation} />
                <div className="flex gap-1.5">
                  <button onClick={() => { addFormation(selectedFormation, "home"); (window as any).posthog?.capture("formation_used", { formation: selectedFormation }) }}
                    className="flex-1 py-1.5 rounded text-xs font-semibold"
                    style={{ background: homeColor, color: homeColor === "#ffffff" || homeColor === "#fbbf24" ? "#000" : "#fff" }}>
                    + Home
                  </button>
                  <button onClick={() => { addFormation(selectedFormation, "away"); (window as any).posthog?.capture("formation_used", { formation: selectedFormation }) }}
                    className="flex-1 py-1.5 rounded text-xs font-semibold"
                    style={{ background: awayColor, color: awayColor === "#ffffff" || awayColor === "#fbbf24" ? "#000" : "#fff" }}>
                    + Away
                  </button>
                </div>
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Elements can be placed anywhere, including canvas margins.</p>
              </div>
            )}

            <button aria-expanded={boardGroups.teams}
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
                <div className="flex flex-col gap-3">
                  <ColorPicker label="Home Color" colors={PALETTE.slice(0, 5)} selected={homeColor} onSelect={c => {
                    setHomeColor(c)
                    setPlayers(prev => prev.map(p => !p.kind && (p.bg === homeColor || p.bg === HOME_COLORS.bg) ? { ...p, bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" } : p))
                  }} />
                  <ColorPicker label="Away Color" colors={PALETTE.slice(2, 7)} selected={awayColor} onSelect={c => {
                    setAwayColor(c)
                    setPlayers(prev => prev.map(p => !p.kind && (p.bg === awayColor || p.bg === AWAY_COLORS.bg) ? { ...p, bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" } : p))
                  }} />
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={showPlayerLabels} onChange={e => setShowPlayerLabels(e.target.checked)} className="accent-green-400" />
                  <span style={{ color: TEXT_PRIMARY }}>Show Player Names / Numbers</span>
                </label>
              </div>
            )}

            <button aria-expanded={boardGroups.zones}
              onClick={() => setBoardGroups(g => ({ ...g, zones: !g.zones }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.zones ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Zones &amp; Lanes
            </button>
            {boardGroups.zones && (
              <div className="p-3 flex flex-col gap-3" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <button onClick={() => setShow18Zones(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition-colors"
                  style={{ background: show18Zones ? "rgba(249,115,22,0.15)" : SURFACE_2, borderColor: show18Zones ? "#f97316" : DS_BORDER, color: show18Zones ? "#f97316" : TEXT_PRIMARY }}>
                  <span>⬛ 18 Zones</span>
                  <span className="px-1.5 py-0.5 rounded font-bold"
                    style={{ background: show18Zones ? "#f97316" : SURFACE_1, color: show18Zones ? "#fff" : TEXT_MUTED, fontSize: 10 }}>
                    {show18Zones ? "ON" : "OFF"}
                  </span>
                </button>
                <button onClick={() => setShowLanes(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition-colors"
                  style={{ background: showLanes ? "rgba(249,115,22,0.15)" : SURFACE_2, borderColor: showLanes ? "#f97316" : DS_BORDER, color: showLanes ? "#f97316" : TEXT_PRIMARY }}>
                  <span>≡ Lanes</span>
                  <span className="px-1.5 py-0.5 rounded font-bold"
                    style={{ background: showLanes ? "#f97316" : SURFACE_1, color: showLanes ? "#fff" : TEXT_MUTED, fontSize: 10 }}>
                    {showLanes ? "ON" : "OFF"}
                  </span>
                </button>
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>Custom Zones</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {["#3fb950","#f97316","#58a6ff","#f85149","#fbbf24","#c084fc","#34d399","#ffffff"].map(c => (
                      <button key={c} onClick={() => setZoneColor(c)}
                        className="w-6 h-6 rounded border-2 transition-transform hover:scale-110 flex-shrink-0"
                        style={{ background: c, borderColor: zoneColor === c ? "#fff" : "transparent" }} />
                    ))}
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: TEXT_MUTED }}>Fill opacity {Math.round(zoneOpacity * 100)}%</span>
                    <input type="range" min={5} max={80} value={Math.round(zoneOpacity * 100)}
                      onChange={e => setZoneOpacity(+e.target.value / 100)} className="w-full accent-orange-400" />
                  </label>
                  <button onClick={() => { setTool("zone"); setSel(null) }}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors"
                    style={{ background: tool === "zone" ? "#f97316" : SURFACE_2, color: tool === "zone" ? "#fff" : TEXT_PRIMARY, border: `1px solid ${tool === "zone" ? "#f97316" : DS_BORDER}` }}>
                    {tool === "zone" ? "🖊 Drawing zone…" : "+ Draw Custom Zone"}
                  </button>
                  {customZones.length > 0 && (
                    <button onClick={() => { setCustomZones([]); setSel(null) }}
                      className="w-full py-1 rounded text-xs hover:bg-red-500/20 transition-colors"
                      style={{ color: DS_ERROR }}>
                      Clear all zones ({customZones.length})
                    </button>
                  )}
                </div>
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
                <div>
                  <p className="text-xs font-semibold uppercase mb-2" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>Canvas Mode</p>
                  <div className="flex flex-col gap-1.5">
                    {(["full","half","blank"] as const).map(mode => (
                      <button key={mode} onClick={() => setCanvasMode(mode)}
                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors text-left"
                        style={{ background: canvasMode === mode ? ACCENT_GRADIENT : SURFACE_2, color: canvasMode === mode ? "#fff" : TEXT_MUTED }}>
                        {mode === "full" ? "Full Pitch" : mode === "half" ? "Half Pitch" : "Blank / Custom"}
                      </button>
                    ))}
                  </div>
                </div>
                {canvasMode !== "blank" && (
                  <div>
                    <p className="text-xs font-semibold uppercase mb-2" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>Pitch Color</p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPitchColor("green")}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{ background: pitchColor === "green" ? ACCENT_GRADIENT : SURFACE_2, color: pitchColor === "green" ? "#fff" : TEXT_MUTED }}>
                        Green
                      </button>
                      <button onClick={() => setPitchColor("white")}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{ background: pitchColor === "white" ? ACCENT_GRADIENT : SURFACE_2, color: pitchColor === "white" ? "#fff" : TEXT_MUTED }}>
                        White Lines
                      </button>
                    </div>
                  </div>
                )}
                {canvasMode !== "blank" && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>Pitch Size</p>
                      <button onClick={() => { setPitchScale(1); setPitchOffX(0); setPitchOffY(0) }}
                        className="text-xs px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                        style={{ color: TEXT_MUTED }}>Reset</button>
                    </div>
                    <input type="range" min={30} max={200} value={Math.round(pitchScale * 100)}
                      onChange={e => setPitchScale(+e.target.value / 100)} className="w-full accent-green-400" />
                    <p className="text-xs mt-1" style={{ color: TEXT_MUTED }}>{Math.round(pitchScale * 100)}% · hover pitch → corners to resize</p>
                    {(pitchOffX !== 0 || pitchOffY !== 0) && (
                      <button onClick={() => { setPitchOffX(0); setPitchOffY(0) }}
                        className="mt-1.5 w-full py-1 rounded text-xs hover:bg-white/10 transition-colors"
                        style={{ color: TEXT_MUTED }}>Re-center pitch</button>
                    )}
                  </div>
                )}
                <p className="text-xs" style={{ color: TEXT_MUTED }}>Hide pitch markings when using a game background photo.</p>
              </div>
            )}

            <button aria-expanded={boardGroups.canvas}
              onClick={() => setBoardGroups(g => ({ ...g, canvas: !g.canvas }))}
              className="w-full flex items-center gap-2 px-3 text-xs font-semibold uppercase transition-colors"
              style={{ height: 36, background: "transparent", border: "none", borderBottom: `1px solid ${DS_BORDER}`, cursor: "pointer", color: TEXT_PRIMARY, letterSpacing: "0.07em" }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = SURFACE_2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
              {boardGroups.canvas ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Canvas
            </button>
            {boardGroups.canvas && (
              <div className="p-3 flex flex-col gap-4" style={{ borderBottom: `1px solid ${DS_BORDER}` }}>
                <div>
                  <p className="text-xs font-semibold uppercase mb-2" style={{ color: TEXT_MUTED, letterSpacing: "0.07em" }}>Canvas Color</p>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                      className="w-9 h-9 rounded cursor-pointer"
                      style={{ padding: 2, border: `1px solid ${DS_BORDER}`, background: "transparent" }} />
                    <input type="text" value={bgColor}
                      onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setBgColor(e.target.value) }}
                      className="flex-1 rounded px-2 py-1 text-xs font-mono outline-none"
                      style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {BG_PRESETS.map(c => (
                      <button key={c} onClick={() => setBgColor(c)}
                        className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                        style={{ background: c, borderColor: bgColor === c ? ACCENT_SOLID : DS_BORDER }} />
                    ))}
                  </div>
                </div>
                <div className="rounded p-2 text-xs" style={{ background: SURFACE_2, color: TEXT_MUTED }}>
                  <p>Canvas: {CW} × {CH}px</p>
                  <p>Pitch: {PW} × {PH}px at ({PX}, {PY})</p>
                </div>
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
          </div>

          <div style={{ padding: "9px 12px", borderTop: `1px solid ${DS_BORDER}`, fontSize: 11, color: TEXT_MUTED, flexShrink: 0, lineHeight: 1.4 }}>
            {tool === "select" && "Click to select · Shift+click for multiple · Del to remove"}
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
          </div>
        </aside>
        )}


        {/* ── Main Canvas, with the narrative underneath ── */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <main
          ref={canvasRef}
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
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: TEXT_PRIMARY, margin: 0 }}>Start your board</p>
                <p style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 6, margin: "6px 0 0" }}>Add a full team, place players one at a time, or draw a zone.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, padding: "0 12px", justifyContent: "center", pointerEvents: "auto" }}>
                  {([
                    { label: "Add formation", action: () => addFormation(selectedFormation, "home") },
                    { label: "Place a player", action: () => setTool("homePlayer") },
                    { label: "Draw a zone", action: () => setTool("zone") },
                  ] as { label: string; action: () => void }[]).map(({ label, action }) => (
                    <button key={label} onClick={action}
                      style={{ background: SURFACE_1, border: `1px solid ${DS_BORDER}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: TEXT_PRIMARY, cursor: "pointer" }}
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
            <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)", background: `${SURFACE_1}e6`, border: `1px solid ${DS_BORDER}`, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: TEXT_PRIMARY, pointerEvents: "none", zIndex: 20, whiteSpace: "nowrap" }}>
              Double-click to finish the shape
            </div>
          )}

          {/* Pitch + all layers */}
          <div style={{ transform: pitchTransform, transformOrigin: "center center" }}>
            <div style={{ transform: pitchInnerTransform, transformOrigin: "center center", transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)" }}>
              <div ref={pitchRef} style={{ position: "relative" }}>
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${CW} ${CH}`}
                  width={SVG_DISPLAY_W}
                  style={{ display: "block", userSelect: "none", aspectRatio: `${CW}/${CH}`, touchAction: "none" }}
                  onPointerMove={onSVGMouseMove}
                  onPointerUp={onSVGMouseUp}
                  onPointerDown={onSVGMouseDown}
                  onClick={onSVGClick}
                  // ✕ markers and the ball go exactly where you click, even on top of a player, zone, shape or arrow
                  onPointerDownCapture={e => { if (tool === "marker" || tool === "ball") { mouseDownPosRef.current = { x: e.clientX, y: e.clientY }; hasDraggedRef.current = false } }}
                  onClickCapture={e => { if (tool === "marker" || tool === "ball") { e.stopPropagation(); onSVGClick(e as unknown as React.PointerEvent) } }}
                >
                  {/* 1. Canvas background */}
                  <rect x={0} y={0} width={CW} height={CH} fill={bgColor} />

                  {/* 2. Background images (full-canvas fill) */}
                  {bgImages.map(img => (
                    <image key={img.id} href={img.src}
                      x={0} y={0} width={CW} height={CH}
                      opacity={img.opacity} preserveAspectRatio="xMidYMid slice"
                      onPointerDown={e => startDrag(e, "image", img.id, img.x, img.y)}
                      onClick={e => {
                        if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "image", id: img.id }); setTool("select"); return }
                        if (tool === "select" && e.shiftKey) {
                          e.stopPropagation()
                          setSelection(prev => isSel(img.id) ? prev.filter(s => s.id !== img.id) : [...prev, { kind: "image", id: img.id }])
                        }
                      }}
                      style={{ cursor: tool === "select" ? "move" : "default" }} />
                  ))}

                  {/* 3. Background texts (behind pitch, in margins) */}
                  {bgTexts.map(t => (
                    <TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      startResize={(e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = { kind: "resizeText", id: t.id, ox: 0, oy: 0 } }}
                      setSel={setSel} tool={tool} updT={updT} setTool={setTool}
                      isSel={isSel}
                      onShiftClick={() => setSelection(prev => isSel(t.id) ? prev.filter(s => s.id !== t.id) : [...prev, { kind: "text", id: t.id }])} />
                  ))}

                  {/* 4. Pitch group (translated to canvas offset + user drag offset) */}
                  {canvasMode !== "blank" && (
                    <g transform={`translate(${PX + pitchOffX},${PY + pitchOffY}) scale(${pitchScale})`}
                      onMouseEnter={() => setHoveredPitch(true)}
                      onMouseLeave={() => setHoveredPitch(false)}>
                      <g style={{ clipPath: canvasMode === "half" ? `url(#half-pitch-clip)` : undefined }}>
                        <PitchSVG pitchColor={pitchColor} />
                        {/* ── Zone overlays (pitch-local coords) ── */}
                        {show18Zones && <EighteenZonesOverlay />}
                        {showLanes && <LanesOverlay />}
                        {/* Custom drawn zones */}
                        {customZones.map(z => {
                          const isSelZ = isSel(z.id)
                          return (
                            <g key={z.id}
                              style={{ cursor: tool === "select" ? "move" : "default" }}
                              onClick={e => {
                                e.stopPropagation()
                                if (tool !== "select") return
                                if (e.shiftKey) {
                                  setSelection(prev => isSel(z.id) ? prev.filter(s => s.id !== z.id) : [...prev, { kind: "zone", id: z.id }])
                                } else {
                                  setSel({ kind: "zone", id: z.id })
                                }
                              }}
                              onPointerDown={e => {
                                if (tool !== "select") return
                                e.stopPropagation()
                                const svgPt = svgXY(e)
                                const px = (svgPt.x - PX - pitchOffXRef.current) / pitchScaleRef.current
                                const py = (svgPt.y - PY - pitchOffYRef.current) / pitchScaleRef.current
                                dragRef.current = { kind: "zone", id: z.id, ox: px - z.x, oy: py - z.y }
                                if (!e.shiftKey) setSel({ kind: "zone", id: z.id })
                              }}>
                              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={4}
                                fill={z.color} fillOpacity={z.opacity}
                                stroke={isSelZ ? "#ffffff" : z.color}
                                strokeWidth={isSelZ ? 2 : 1}
                                strokeOpacity={isSelZ ? 1 : 0.5}
                                strokeDasharray={isSelZ ? "6,3" : undefined} />
                              {z.label && (
                                <text x={z.x + 10} y={z.y + 18}
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
                    const ox = PX + pitchOffX
                    const oy = PY + pitchOffY
                    const pR = ox + PW * pitchScale
                    const pB = oy + PH * pitchScale
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
                    <g key={s.id}
                      onClick={e => {
                        e.stopPropagation()
                        if (tool === "homePlayer" || tool === "awayPlayer") { setSel({ kind: "shape", id: s.id }); setTool("select"); return }
                        if (tool === "select") {
                          if (e.shiftKey) {
                            setSelection(prev => isSel(s.id) ? prev.filter(x => x.id !== s.id) : [...prev, { kind: "shape", id: s.id }])
                          } else {
                            setSel({ kind: "shape", id: s.id })
                          }
                        }
                      }}
                      style={{ cursor: tool === "select" ? "pointer" : "default" }}>
                      {renderShapePath(s)}
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
                    const hs = a.strokeW * 4 + 6
                    return (
                      <g key={a.id}
                        onClick={e => {
                          e.stopPropagation()
                          if (tool === "homePlayer" || tool === "awayPlayer") { setSel({ kind: "arrow", id: a.id }); setTool("select"); return }
                          if (tool === "select") {
                            if (e.shiftKey) {
                              setSelection(prev => isSel(a.id) ? prev.filter(s => s.id !== a.id) : [...prev, { kind: "arrow", id: a.id }])
                            } else {
                              setSel({ kind: "arrow", id: a.id })
                            }
                          }
                        }}
                        style={{ cursor: tool === "select" ? "pointer" : "default" }}>
                        <path d={arrowPath(a.x1, a.y1, a.x2, a.y2, a.cpx, a.cpy)}
                          fill="none" stroke="transparent" strokeWidth={16} />
                        <path d={arrowPath(a.x1, a.y1, a.x2, a.y2, a.cpx, a.cpy)}
                          fill="none" stroke={a.color} strokeWidth={a.strokeW}
                          strokeDasharray={dashArr(a.dash)} strokeLinecap="round" />
                        <polygon points={arrowHead(a.x2, a.y2, a.cpx, a.cpy, hs)} fill={a.color} />
                        {a.twoWay && <polygon points={arrowHeadRev(a.x1, a.y1, a.cpx, a.cpy, hs)} fill={a.color} />}
                        {a.label && (
                          <text x={(a.x1 + a.x2) / 2} y={(a.y1 + a.y2) / 2 - 8}
                            textAnchor="middle" fill={a.color} fontSize={12} fontWeight="600"
                            style={{ fontFamily: "'Inter', sans-serif", pointerEvents: "none" }}>
                            {a.label}
                          </text>
                        )}
                        {isSelected && (
                          <>
                            <line x1={a.x1} y1={a.y1} x2={a.cpx} y2={a.cpy} stroke={ACCENT_SOLID} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                            <line x1={a.x2} y1={a.y2} x2={a.cpx} y2={a.cpy} stroke={ACCENT_SOLID} strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                            <circle cx={a.x1} cy={a.y1} r={7} fill={ACCENT_SOLID} stroke="#ffffff" strokeWidth={1.5} style={{ cursor: "grab" }}
                              onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowP1", id: a.id, ox: 0, oy: 0 } }} />
                            <circle cx={a.x2} cy={a.y2} r={7} fill={ACCENT_SOLID} stroke="#ffffff" strokeWidth={1.5} style={{ cursor: "grab" }}
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
                      <path d={arrowPath(arrowDraft.x1, arrowDraft.y1, mouse.x, mouse.y,
                        (arrowDraft.x1 + mouse.x) / 2, (arrowDraft.y1 + mouse.y) / 2)}
                        fill="none" stroke={arrowDefaultColor} strokeWidth={arrowDefaultW}
                        strokeOpacity={0.65}
                        strokeDasharray={arrowDefaultDash === "dashed" ? "12,6" : arrowDefaultDash === "dotted" ? "4,4" : undefined}
                        strokeLinecap="round" />
                      <circle cx={arrowDraft.x1} cy={arrowDraft.y1} r={6} fill={ACCENT_SOLID} />
                      <polygon points={arrowHead(mouse.x, mouse.y,
                        (arrowDraft.x1 + mouse.x) / 2, (arrowDraft.y1 + mouse.y) / 2, 14)}
                        fill={arrowDefaultColor} fillOpacity={0.65} />
                    </g>
                  )}

                  {/* 10. Foreground texts (on top of everything) */}
                  {fgTexts.map(t => (
                    <TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      startResize={(e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = { kind: "resizeText", id: t.id, ox: 0, oy: 0 } }}
                      setSel={setSel} tool={tool} updT={updT} setTool={setTool}
                      isSel={isSel}
                      onShiftClick={() => setSelection(prev => isSel(t.id) ? prev.filter(s => s.id !== t.id) : [...prev, { kind: "text", id: t.id }])} />
                  ))}

                  {/* 11. Players, ✕ markers and the ball */}
                  {players.map(p => {
                    const isSelected = isSel(p.id)
                    const s = p.scale || 1
                    const r = pieceBase(p) * s
                    const cross = `M${-r * 0.6},${-r * 0.6}L${r * 0.6},${r * 0.6}M${-r * 0.6},${r * 0.6}L${r * 0.6},${-r * 0.6}` // a ✕ marker's two strokes
                    // p.num = shirt number (inside circle), p.name = player name (below circle, halo text)
                    const numberText = p.num.toUpperCase()
                    const numFontSize = Math.max(10 * s, Math.min(18 * s, r * 0.8) * Math.min(1, 3 / Math.max(3, numberText.length)))
                    return (
                      <g key={p.id} transform={`translate(${p.x},${p.y})`}
                        onPointerDown={e => {
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
                        onClick={e => { if (tool === "homePlayer" || tool === "awayPlayer") e.stopPropagation() }}
                        style={{ cursor: tool === "select" ? "grab" : "default" }}>
                        {p.glow && (
                          <circle r={r + 15} fill={p.bg} fillOpacity={0.4} filter="blur(8px)" />
                        )}
                        {/* Drop shadow (a ✕ marker also gets an invisible circle, so it's easy to grab) */}
                        {p.kind === "marker" ? (
                          <>
                            <circle r={r} fill="transparent" />
                            <path d={cross} transform="translate(1.5,2.5)" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={r * 0.3} strokeLinecap="round" />
                          </>
                        ) : (
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
                            {/* Main circle */}
                            <circle r={r} fill={p.bg} stroke={p.ring} strokeWidth={3 * s} />
                            {/* Number inside circle */}
                            {showPlayerLabels && numberText.trim() !== "" && (
                              <text textAnchor="middle" dominantBaseline="central" y={-1}
                                fill={p.fg} fontSize={numFontSize} fontWeight="800"
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
                        {/* Name below circle — halo text, never shrinks, free overflow */}
                        {showPlayerLabels && p.name.trim() !== "" && (
                          <text textAnchor="middle" x={0} y={r + 6 * s + 13 * s}
                            fill="#ffffff" fontSize={13 * s} fontWeight={700}
                            stroke="rgba(0,0,0,0.9)" strokeWidth={3 * s}
                            paintOrder="stroke" strokeLinejoin="round"
                            overflow="visible"
                            style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.03em", pointerEvents: "none", textTransform: "uppercase" }}>
                            {p.name}
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {/* 12. Overlay images */}
                  {ovImages.map(img => (
                    <image key={img.id} href={img.src}
                      x={img.x} y={img.y} width={img.width} height={img.height}
                      opacity={img.opacity} preserveAspectRatio="xMidYMid meet"
                      onPointerDown={e => startDrag(e, "image", img.id, img.x, img.y)}
                      onClick={e => {
                        if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "image", id: img.id }); setTool("select"); return }
                        if (tool === "select" && e.shiftKey) {
                          e.stopPropagation()
                          setSelection(prev => isSel(img.id) ? prev.filter(s => s.id !== img.id) : [...prev, { kind: "image", id: img.id }])
                        }
                      }}
                      style={{ cursor: tool === "select" ? "move" : "default" }} />
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

                  {/* 13. Watermark — always last, always visible: your handle (once you've chosen one) and PITCHSTUDIO */}
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={CW - 18 - wmWidth} y={CH - 26} width={wmWidth + 10} height={20} rx={3} fill="rgba(0,0,0,0.45)" />
                    <text ref={wmTextRef} x={CW - 13} y={CH - 11} textAnchor="end" fontSize={12}
                      style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>
                      {creatorHandle && <tspan fill="rgba(255,255,255,0.6)" fontWeight="600" style={{ letterSpacing: "0.04em" }}>@{creatorHandle}</tspan>}
                      <tspan dx={creatorHandle ? 7 : 0} fill="rgba(255,255,255,0.75)" fontWeight="700" style={{ letterSpacing: "0.12em" }}>PITCHSTUDIO</tspan>
                    </text>
                  </g>
                </svg>
              </div>
            </div>
          </div>

          {/* ── Zoom controls ── */}
          <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg px-2 py-1.5 border"
            style={{ background: "#161b22", borderColor: "rgba(255,255,255,0.1)", zIndex: 10 }}>
            <button onClick={() => applyZoom(0.87)} className="p-1 rounded hover:bg-white/10 transition-colors"><Minus size={13} /></button>
            <span className="text-xs font-mono w-12 text-center" style={{ color: "#c9d1d9" }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => applyZoom(1.15)} className="p-1 rounded hover:bg-white/10 transition-colors"><Plus size={13} /></button>
            <div className="w-px h-4 mx-1" style={{ background: "rgba(255,255,255,0.12)" }} />
            <button onClick={fitToView} className="px-1.5 py-0.5 rounded text-xs hover:bg-white/10 transition-colors"
              style={{ color: "#8b949e" }}>Fit</button>
          </div>

          {/* Rotation snap indicator */}
          {snapRot && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 border text-xs"
              style={{ background: "#161b22", borderColor: "rgba(255,255,255,0.1)", color: "#fbbf24", zIndex: 10 }}>
              <Magnet size={12} /> Snap: {Math.round(rotation)}°
            </div>
          )}

          {/* Save problems, and the unsaved board that came back: shown over the canvas so they're visible on every screen size.
              The status region always stays in place, so screen readers announce whatever appears in it. */}
          <div role="status" aria-live="polite" className="absolute top-3 left-1/2 -translate-x-1/2"
            style={{ zIndex: 20, width: "max-content", maxWidth: "calc(100% - 24px)" }}
            onPointerDown={e => e.stopPropagation()}>
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
                    className="px-2 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors hover:bg-white/10"
                    style={{ color: problem ? ACCENT_SOLID : TEXT_MUTED }}>
                    {problem ? (conflict ? "Save as new board" : "Try again") : "Discard"}
                  </button>
                  <button onClick={() => (problem ? setNoticeHidden(true) : setDraftNotice(false))} aria-label="Close"
                    className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: TEXT_MUTED }}>
                    <X size={13} />
                  </button>
                </div>
              )
            })()}
          </div>

          {/* Canvas dimensions badge */}
          <div className="absolute top-3 right-3 text-xs rounded px-2 py-1"
            style={{ background: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.4)", zIndex: 10, fontFamily: "monospace" }}>
            {CW}×{CH}
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
          <style>{`.ps-narrative:focus { border-color: ${ACCENT_SOLID} !important; }`}</style>
          <button type="button" onClick={() => setNarrativeOpen(o => !o)} aria-expanded={narrativeOpen} aria-controls="ps-narrative-text"
            className="w-full flex items-center gap-2 px-4 text-left hover:bg-white/5 transition-colors" style={{ height: 40 }}>
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
          onDelete={deleteTemplate} onTogglePublish={togglePublish}
          isAdmin={isAdmin} onAdminToggle={() => setIsAdmin(v => !v)} />
      )}

      {/* ── Auth modal ── */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} initialTab={authInitialTab} />}

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
        />
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
              { header: "SELECTION", rows: [["Add to selection","Shift+click"],["Pan canvas","Alt+drag"]] },
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

/* ─────────────────────────── Auth Modal ────────────────────── */
const IDENTITY_OPTIONS = [
  { label: "Content Creator", value: "creator" },
  { label: "Coach", value: "coach" },
  { label: "Analyst", value: "analyst" },
  { label: "Just Here to Play", value: "fan" },
] as const

/** Same rule as the database: lowercase letters, numbers and underscores, max 30. */
const normalizeHandle = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30)

/** Hand-off from the landing page's sign-in box to the rest of the app (memory only).
 *  toHub: send the person straight to the hub the moment they're signed in (no flash of the board).
 *  isNewUser: they just created their account, so the hub says "Welcome" instead of "Welcome back". */
const authHandoff = { toHub: false, isNewUser: false }

/** Turns Supabase auth errors into plain words. */
function friendlyAuthError(err: { message?: string; code?: string } | null): string {
  const code = err?.code ?? ""
  const msg = (err?.message ?? "").toLowerCase()
  if (code === "invalid_credentials" || msg.includes("invalid login")) return "Wrong email or password."
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return "Confirm your email first. The link is in your inbox."
  if (code === "email_address_invalid" || msg.includes("invalid format")) return "Enter a valid email address."
  if (code.includes("rate_limit") || msg.includes("rate limit")) return "Too many attempts. Wait a minute and try again."
  if (msg.includes("not authorized") || msg.includes("sending confirmation")) return "We couldn't send your confirmation email. Try again later."
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Can't reach PitchStudio. Check your connection and try again."
  return err?.message || "Something went wrong. Try again."
}

function AuthModal({ onClose, initialTab = "signin", onSignedIn }: {
  onClose: () => void
  initialTab?: "signin" | "signup"
  onSignedIn?: () => void
}) {
  const [tab, setTab] = useState<"signin" | "signup">(initialTab)
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [handle, setHandle] = useState("")
  const [identity, setIdentity] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [sentTo, setSentTo] = useState<string | null>(null) // set when Supabase must email a confirmation link

  const switchTab = (t: "signin" | "signup") => { setTab(t); setError(""); setStep(1); setSentTo(null) }

  const submit = async () => {
    if (loading) return
    setError("")
    const cleanEmail = email.trim()

    if (tab === "signup") {
      if (step === 1) {
        if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) { setError("Enter a valid email address."); return }
        if (password.length < 6) { setError("Use at least 6 characters for your password."); return }
        setStep(2); return
      }
      const h = normalizeHandle(handle)
      if (h.length < 3) { setError("Pick a name with at least 3 letters or numbers."); return }
      if (!identity) { setError("Choose how you see yourself on the pitch."); return }

      setLoading(true)
      // Is the name free? (The database also guards this when the account is created.)
      const { data: free, error: freeErr } = await (supabase as any).rpc("handle_available", { candidate: h })
      if (!freeErr && free === false) { setError("That name's taken. Try another."); setLoading(false); return }

      // The name and identity travel with the sign-up; the database saves them
      // the moment the account is created, so nothing is lost if email confirmation is on.
      authHandoff.isNewUser = true
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { handle: h, identity }, emailRedirectTo: window.location.origin },
      })
      if (signUpErr) {
        authHandoff.isNewUser = false
        const code = signUpErr.code ?? ""
        if (code === "user_already_exists" || /already registered/i.test(signUpErr.message)) {
          setTab("signin"); setStep(1)
          setError("That email already has an account. Sign in instead.")
        } else {
          if (code === "weak_password" || code === "email_address_invalid" || /password|invalid format/i.test(signUpErr.message)) setStep(1)
          setError(friendlyAuthError(signUpErr))
        }
        setLoading(false); return
      }

      // With "Confirm email" on, Supabase hides an existing email by returning a user with no identities
      if (!data.session && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        authHandoff.isNewUser = false
        setTab("signin"); setStep(1)
        setError("That email already has an account. Sign in instead.")
        setLoading(false); return
      }

      ;(window as any).posthog?.capture("sign_up", { identity, $set: { handle: h, identity } })
      setLoading(false)
      if (!data.session) { authHandoff.isNewUser = false; setSentTo(cleanEmail); return } // "Confirm email" is on: wait for the link
      // Only if the database step hasn't been set up yet (the name check above failed): save the answers directly.
      if (freeErr && data.user) void supabase.from("profiles").update({ handle: h, identity }).eq("id", data.user.id).then(() => {})
      onSignedIn?.()
      onClose()
      return
    }

    setLoading(true)
    const { error: e } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
    setLoading(false)
    if (e) { setError(friendlyAuthError(e)); return }
    onSignedIn?.()
    onClose()
  }

  const showStep1 = tab === "signin" || step === 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}>
      <div className="relative rounded-xl border overflow-hidden flex flex-col w-full"
        style={{ background: SURFACE_1, borderColor: "rgba(255,255,255,0.12)", maxWidth: 400 }}
        onClick={e => e.stopPropagation()}>
        <style>{`.ps-field:focus-within { border-color: ${ACCENT_SOLID} !important; }`}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: DS_BORDER }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: ACCENT_SOLID, color: "#ffffff", fontFamily: "'Barlow Condensed', sans-serif" }}>PS</div>
            <span className="font-semibold text-sm" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em" }}>
              PITCHSTUDIO ACCOUNT
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: DS_BORDER }}>
          {(["signin", "signup"] as const).map(t => (
            <button key={t} onClick={() => switchTab(t)}
              className="flex-1 py-2.5 text-xs font-semibold uppercase transition-colors"
              style={{
                letterSpacing: "0.08em",
                borderBottom: tab === t ? `2px solid ${ACCENT_SOLID}` : "2px solid transparent",
                color: tab === t ? ACCENT_SOLID : TEXT_MUTED,
              }}>
              {t === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* Step indicator — sign-up only */}
        {tab === "signup" && !sentTo && (
          <div className="flex items-center justify-center gap-2 pt-3 pb-0">
            {([1, 2] as const).map(s => (
              <span key={s} style={{
                display: "inline-block",
                width: 7, height: 7, borderRadius: "50%",
                background: step >= s ? ACCENT_SOLID : "rgba(255,255,255,0.18)",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        )}

        <div className="p-5 flex flex-col gap-3">
          {sentTo ? (
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: `${ACCENT_SOLID}26`, color: ACCENT_SOLID }}>
                <Mail size={20} />
              </div>
              <p className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>Check your inbox</p>
              <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
                We sent a link to <span className="break-all" style={{ color: TEXT_PRIMARY }}>{sentTo}</span>.
                Open it to finish creating your account. It signs you in automatically.
              </p>
              <button onClick={() => switchTab("signin")}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors hover:bg-white/10"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>
                Back to sign in
              </button>
            </div>
          ) : (<>
          {showStep1 ? (
            <>
              <input type="email" placeholder="Email" aria-label="Email" autoComplete="email"
                autoFocus={typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches}
                value={email} onChange={e => setEmail(e.target.value)}
                className="ps-field w-full rounded-lg px-3 py-2.5 text-[16px] sm:text-sm outline-none"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}
                onKeyDown={e => e.key === "Enter" && submit()} />

              <input type="password" placeholder="Password" aria-label="Password"
                autoComplete={tab === "signin" ? "current-password" : "new-password"}
                value={password} onChange={e => setPassword(e.target.value)}
                className="ps-field w-full rounded-lg px-3 py-2.5 text-[16px] sm:text-sm outline-none"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}
                onKeyDown={e => e.key === "Enter" && submit()} />
            </>
          ) : (
            <>
              <div>
                <label htmlFor="ps-handle" className="block text-xs mb-1.5 font-medium" style={{ color: TEXT_MUTED }}>
                  What should we call you?
                </label>
                <div className="ps-field flex items-center rounded-lg px-3"
                  style={{ background: SURFACE_2, border: `1px solid ${DS_BORDER}` }}>
                  <span className="text-[16px] sm:text-sm select-none" style={{ color: TEXT_MUTED }}>@</span>
                  <input
                    id="ps-handle"
                    type="text"
                    placeholder="tactician99"
                    value={handle}
                    maxLength={30}
                    onChange={e => setHandle(normalizeHandle(e.target.value))}
                    autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    className="flex-1 min-w-0 bg-transparent py-2.5 pl-0.5 text-[16px] sm:text-sm outline-none"
                    style={{ color: TEXT_PRIMARY }}
                    onKeyDown={e => e.key === "Enter" && submit()}
                    autoFocus
                  />
                </div>
                <p className="text-[11px] mt-1.5" style={{ color: TEXT_MUTED }}>
                  Letters, numbers and underscores. You can change it later in Creator Profile.
                </p>
              </div>

              <div>
                <label className="block text-xs mb-2 font-medium" style={{ color: TEXT_MUTED }}>
                  How do you see yourself on the pitch?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {IDENTITY_OPTIONS.map(opt => (
                    <button key={opt.value}
                      onClick={() => setIdentity(opt.value)}
                      className="py-2 px-3 rounded-lg text-xs font-medium text-center transition-all"
                      style={{
                        background: identity === opt.value ? ACCENT_GRADIENT : SURFACE_2,
                        color: identity === opt.value ? "#ffffff" : "#c9d1d9",
                        border: `1px solid ${identity === opt.value ? ACCENT_SOLID : DS_BORDER}`,
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={() => { setStep(1); setError("") }}
                className="text-xs self-start transition-colors hover:underline"
                style={{ color: TEXT_MUTED }}>
                ← Back
              </button>
            </>
          )}

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: `${DS_ERROR}20`, color: DS_ERROR }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || (showStep1 && (!email || !password))}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: ACCENT_GRADIENT, color: "#ffffff" }}>
            {loading ? (tab === "signin" ? "Signing in…" : "Creating account…") : tab === "signin" ? "Sign In" : step === 1 ? "Next →" : "Create Account"}
          </button>

          <p className="text-center text-xs" style={{ color: TEXT_MUTED }}>
            Save boards to your account and access them anywhere.
          </p>
          </>)}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── My Boards Modal ───────────────── */
interface BoardRow { id: string; title: string; created_at: string }

function MyBoardsModal({ userId, currentBoardId, onClose, onLoad, onBoardDeleted }: {
  userId: string
  currentBoardId: string | null
  onClose: () => void
  onLoad: (canvasData: unknown, title: string, id: string, narrative: string | null, updatedAt: string | null) => void
  onBoardDeleted: (id: string) => void
}) {
  const [boards, setBoards] = useState<BoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchBoards = async () => {
    await waitForSaves(5000) // a save still on its way would make the list out of date
    const { data } = await supabase
      .from("boards")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
    setBoards(data ?? []); setLoading(false)
  }

  useEffect(() => { fetchBoards() }, [userId])

  const loadBoard = async (b: BoardRow) => {
    if (loadingId) return // one at a time
    setLoadingId(b.id)
    await waitForBoardSave(b.id) // a save to this board that's still on its way lands first
    const { data } = await supabase.from("boards").select("canvas_data, title, narrative, updated_at").eq("id", b.id).single()
    if (data) onLoad((data as any).canvas_data, (data as any).title, b.id, (data as any).narrative ?? null, (data as any).updated_at ?? null)
    setLoadingId(null)
  }

  const deleteBoard = async (id: string) => {
    setDeleting(true)
    await supabase.from("boards").delete().eq("id", id).eq("user_id", userId)
    setDeleting(false)
    setConfirmDeleteId(null)
    onBoardDeleted(id)
    setBoards(prev => prev.filter(b => b.id !== id))
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " · " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }

  const boardToDelete = boards.find(b => b.id === confirmDeleteId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}>
      <div className="relative w-full max-h-[75vh] flex flex-col rounded-xl border overflow-hidden"
        style={{ background: SURFACE_1, borderColor: "rgba(255,255,255,0.12)", maxWidth: 560 }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: DS_BORDER }}>
          <div className="flex items-center gap-2">
            <FolderOpen size={16} style={{ color: ACCENT_SOLID }} />
            <span className="font-semibold" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", fontSize: 16 }}>
              MY BOARDS
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-sm" style={{ color: TEXT_MUTED }}>
              <Clock size={14} className="animate-spin" /> Loading boards…
            </div>
          )}
          {!loading && boards.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: TEXT_MUTED }}>
              No saved boards yet. Use the Save button to save your work.
            </div>
          )}
          <div className="flex flex-col gap-2">
            {boards.map(b => (
              <div key={b.id}
                className="flex items-center justify-between rounded-lg px-4 py-3 border transition-colors"
                style={{ background: SURFACE_2, borderColor: b.id === currentBoardId ? `${ACCENT_SOLID}60` : DS_BORDER }}>
                <div className="flex flex-col gap-0.5 min-w-0 flex-1 cursor-pointer" onClick={() => loadBoard(b)}>
                  <span className="font-semibold text-sm truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
                    {b.title || "Untitled board"}
                    {b.id === currentBoardId && (
                      <span className="ml-2 text-xs font-normal" style={{ color: ACCENT_SOLID, fontFamily: "'Inter', sans-serif", letterSpacing: 0 }}>
                        (open)
                      </span>
                    )}
                  </span>
                  <span className="text-xs" style={{ color: TEXT_MUTED }}>{fmt(b.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors"
                    style={{ background: loadingId === b.id ? SURFACE_2 : ACCENT_GRADIENT, color: loadingId === b.id ? TEXT_MUTED : "#ffffff" }}
                    disabled={loadingId === b.id}
                    onClick={() => loadBoard(b)}>
                    {loadingId === b.id ? "Loading…" : "Load"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(b.id)}
                    className="p-1.5 rounded transition-colors hover:bg-red-500/20"
                    style={{ color: DS_ERROR }}
                    title="Delete board">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setConfirmDeleteId(null)}>
          <div className="rounded-xl border flex flex-col gap-5 p-6 w-full"
            style={{ background: SURFACE_1, borderColor: DS_BORDER, maxWidth: 360 }}
            onClick={e => e.stopPropagation()}>
            <div>
              <p style={{ color: TEXT_PRIMARY, fontSize: 15, fontWeight: 600, margin: 0, fontFamily: "'Inter', sans-serif" }}>
                Delete this board?
              </p>
              {boardToDelete && (
                <p style={{ color: ACCENT_SOLID, fontSize: 13, margin: "4px 0 0", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
                  {boardToDelete.title || "Untitled board"}
                </p>
              )}
              <p style={{ color: TEXT_MUTED, fontSize: 13, margin: "6px 0 0", fontFamily: "'Inter', sans-serif" }}>
                This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:brightness-110"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
                Cancel
              </button>
              <button
                onClick={() => confirmDeleteId && deleteBoard(confirmDeleteId)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:brightness-110 disabled:opacity-60"
                style={{ background: DS_ERROR, color: "#ffffff" }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── Lanes Overlay ─────────────────── */
// Renders in pitch-local coords (0..PW, 0..PH) — place inside scaled pitch group
function LanesOverlay() {
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
          <text x={PW / 2} y={ln.y + laneH / 2}
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
function EighteenZonesOverlay() {
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
            <text x={x + 10} y={y + 18}
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
        <text key={i} x={t.x + cw} y={PH - 8}
          textAnchor="middle" fill={orange} fontSize={11} fontWeight="700" fillOpacity={0.9}
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

/* ─────────────────────── Workspace Mode Selector ────────────── */
const WORKSPACE_MODES = [
  {
    id: "tactics" as const,
    label: "Tactics Board",
    icon: "⬜",
    desc: "Full pitch — plan formations, movements & shapes",
  },
  {
    id: "report" as const,
    label: "Report",
    icon: "📄",
    desc: "Clean white canvas — build scouting reports & layouts",
  },
  {
    id: "brainstorm" as const,
    label: "Brainstorm",
    icon: "💡",
    desc: "Empty space — think freely without constraints",
  },
]

function WorkspaceModeSelector({
  mode, onChange,
}: { mode: "tactics" | "report" | "brainstorm"; onChange: (m: "tactics" | "report" | "brainstorm") => void }) {
  const [open, setOpen] = useState(false)
  const current = WORKSPACE_MODES.find(m => m.id === mode)!
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
        style={{
          background: open ? "#21262d" : "#161b22",
          borderColor: open ? ACCENT_SOLID : "rgba(255,255,255,0.15)",
          color: "#e6edf3",
          minWidth: 150,
        }}
      >
        <span>{current.icon}</span>
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", fontSize: 13 }}>
          {current.label.toUpperCase()}
        </span>
        <ChevronDown size={11} style={{ marginLeft: "auto", opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1.5 rounded-xl border shadow-2xl z-50 overflow-hidden flex flex-col"
            style={{ background: SURFACE_1, borderColor: "rgba(255,255,255,0.12)", width: 280 }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-bold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.1em" }}>What are you building?</p>
            </div>
            {WORKSPACE_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false) }}
                className="flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span style={{ fontSize: 20, lineHeight: 1, marginTop: 1 }}>{m.icon}</span>
                <div className="flex flex-col gap-0.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", color: "#e6edf3" }}>
                      {m.label.toUpperCase()}
                    </span>
                    {mode === m.id && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: ACCENT_SOLID, color: "#ffffff", fontSize: 9, fontWeight: 700 }}>ACTIVE</span>
                    )}
                  </div>
                  <span className="text-xs leading-snug" style={{ color: TEXT_MUTED }}>{m.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ─────────────────────────── Sub-components ────────────────── */
function FormationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <button
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

function ColorPicker({ label, colors, selected, onSelect, allowTransparent }: {
  label: string; colors: string[]; selected: string; onSelect: (c: string) => void; allowTransparent?: boolean
}) {
  return (
    <div>
      <p className="text-xs mb-1.5" style={{ color: TEXT_MUTED }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {allowTransparent && (
          <button onClick={() => onSelect("transparent")}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center relative overflow-hidden"
            style={{ borderColor: selected === "transparent" ? ACCENT_SOLID : "transparent" }}>
            <div className="absolute inset-0 bg-white" />
            <div className="absolute inset-0 w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,0,0,0.5)_3px,rgba(255,0,0,0.5)_4px)]" />
          </button>
        )}
        {colors.map(c => (
          <button key={c} onClick={() => onSelect(c)}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{ background: c, borderColor: selected === c ? ACCENT_SOLID : "transparent" }} />
        ))}
      </div>
    </div>
  )
}

function TextSVG({ t, sel, editingText, setEditingText, startDrag, startResize, setSel, tool, updT, setTool, isSel: isSelfSel, onShiftClick }: {
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
      onPointerDown={e => {
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
        if (!isEditing) { e.stopPropagation(); startDrag(e); setSel({ kind: "text", id: t.id }) }
      }}
      onClick={e => { if (tool === "homePlayer" || tool === "awayPlayer") e.stopPropagation() }}
      onDoubleClick={e => { e.stopPropagation(); setEditingText(t.id) }}
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

/* ─────────────────────────── Pitch Background ──────────────── */
function PitchBackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <style>{`
        @keyframes pitchSweep {
          0%   { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
          12%  { opacity: 1; }
          88%  { opacity: 1; }
          100% { transform: translateX(240%) skewX(-18deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pitch-sweep { animation: none !important; opacity: 0 !important; }
        }
      `}</style>
      {/* Mowed stripe background */}
      <div style={{
        position: "absolute", inset: 0,
        background: `repeating-linear-gradient(-50deg, ${SURFACE_BASE} 0px, ${SURFACE_BASE} 44px, #0C140E 44px, #0C140E 88px)`,
      }} />
      {/* SVG pitch markings */}
      <svg viewBox="0 0 1000 640" preserveAspectRatio="xMidYMid meet"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <rect x="130" y="50" width="740" height="540" fill="none" stroke="white" strokeWidth="2" opacity="0.35" />
        <line x1="500" y1="50" x2="500" y2="590" stroke="white" strokeWidth="2" opacity="0.35" />
        <circle cx="500" cy="320" r="80" fill="none" stroke="white" strokeWidth="2" opacity="0.35" />
        <circle cx="500" cy="320" r="4" fill="white" opacity="0.35" />
      </svg>
      {/* Diagonal light sweep */}
      <div className="pitch-sweep" style={{
        position: "absolute", top: 0, left: 0,
        width: "30%", height: "100%",
        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.055) 50%, transparent 100%)",
        animation: "pitchSweep 6s ease-in-out infinite alternate",
        pointerEvents: "none",
      }} />
    </div>
  )
}

/* ─────────────────────────── Landing Page ──────────────────── */
function LandingPage() {
  const navigate = useNavigate()
  const [showAuth, setShowAuth] = useState(false)
  const [authInitialTab, setAuthInitialTab] = useState<"signin" | "signup">("signup")

  const openSignUp = () => {
    ;(window as any).posthog?.capture("cta_click", { button: "sign_up" })
    authHandoff.toHub = true
    setAuthInitialTab("signup")
    setShowAuth(true)
  }

  const openSignIn = () => {
    authHandoff.toHub = true
    setAuthInitialTab("signin")
    setShowAuth(true)
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", position: "relative", background: SURFACE_BASE }}>
      <PitchBackground />

      {/* Sign In — top right */}
      <button
        onClick={openSignIn}
        style={{
          position: "absolute",
          top: 20,
          right: 28,
          color: "rgba(255,255,255,0.65)",
          fontSize: 14,
          fontFamily: "'Inter', sans-serif",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "6px 10px",
          borderRadius: 6,
          transition: "color 0.15s",
          zIndex: 10,
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.color = "rgba(255,255,255,1)" }}
        onMouseLeave={e => { (e.target as HTMLElement).style.color = "rgba(255,255,255,0.65)" }}>
        Sign in
      </button>

      {/* Centered hero content */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        zIndex: 1,
      }}>
        <h1 style={{
          fontFamily: "'Cormorant Garamond', Georgia, serif",
          fontSize: "clamp(44px, 7.5vw, 90px)",
          fontWeight: 600,
          letterSpacing: "0.12em",
          color: "#ffffff",
          margin: 0,
          lineHeight: 1,
          textAlign: "center",
        }}>
          PITCHSTUDIO
        </h1>

        <div style={{ textAlign: "center", lineHeight: 1.75, marginTop: 4 }}>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, margin: 0, fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
            Enable your creativity.
          </p>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, margin: 0, fontFamily: "'Inter', sans-serif", fontWeight: 400 }}>
            Where your genius comes to life.
          </p>
        </div>

        <button
          onClick={openSignUp}
          style={{
            marginTop: 10,
            padding: "13px 40px",
            borderRadius: 999,
            background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "'Inter', sans-serif",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 28px rgba(168,85,247,0.4)",
            letterSpacing: "0.02em",
            transition: "transform 0.12s, box-shadow 0.12s",
          }}
          onMouseEnter={e => {
            const el = e.currentTarget
            el.style.transform = "scale(1.04)"
            el.style.boxShadow = "0 6px 36px rgba(168,85,247,0.55)"
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            el.style.transform = "scale(1)"
            el.style.boxShadow = "0 4px 28px rgba(168,85,247,0.4)"
          }}>
          Sign Up
        </button>
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          initialTab={authInitialTab}
          onSignedIn={() => navigate("/hub")}
        />
      )}
    </div>
  )
}

/* ─────────────────────────── Hub Menu Item ─────────────────── */
/* ─────────────────────────── Hub Page ──────────────────────── */

/** Names the system made from the email look like "<email name>_<first 4 of user id>" (e.g. beckhamng07_826b).
 *  Show those without the suffix. Names people chose (tiki_taka, messi_8f2a) are always shown in full. */
function stripHandleSuffix(name: string, userId?: string | null, email?: string | null): string {
  if (!userId || !email) return name
  const short = userId.slice(0, 4)
  const emailName = email.split("@")[0]
  const auto = [`${emailName}_${short}`, `${normalizeHandle(emailName).slice(0, 25)}_${short}`]
  return auto.includes(name) ? name.slice(0, -(short.length + 1)) : name
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

interface HubRecentBoard { id: string; title: string; updated_at: string }

interface HubCardDef {
  id: string
  title: string
  desc: string
  icon: React.ReactNode
  available: boolean
  primary?: boolean
  span2?: boolean
}

function HubPitchSVG() {
  const stripe = (i: number) => (
    <rect key={i} x={0} y={i * 13} width={160} height={13}
      fill={i % 2 === 0 ? "#2C7A48" : "#27703F"} />
  )
  const mkLine = (x1: number, y1: number, x2: number, y2: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={1.2} opacity={0.55} />
  )
  // 4-3-3 positions (y=0 top, y=230 bottom; GK at bottom)
  const players: [number, number][] = [
    // GK
    [80, 210],
    // Back 4
    [28, 178], [60, 172], [100, 172], [132, 178],
    // Mid 3
    [38, 132], [80, 124], [122, 132],
    // Front 3
    [38, 74], [80, 62], [122, 74],
  ]
  return (
    <svg viewBox="0 0 160 230" style={{ width: "100%", borderRadius: 6, display: "block" }}>
      <style>{`
        @keyframes hubPlayers {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-12px); }
        }
        .hub-players-g { animation: hubPlayers 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .hub-players-g { animation: none; }
        }
      `}</style>
      {/* Mowed stripes — 18 bands of 13px each = 234px, covers 230 */}
      {Array.from({ length: 18 }, (_, i) => stripe(i))}
      {/* Pitch markings */}
      <g fill="none" stroke="white" strokeWidth={1.2} opacity={0.55}>
        {/* Outer boundary */}
        <rect x={10} y={12} width={140} height={206} />
        {/* Halfway line */}
        {mkLine(10, 115, 150, 115)}
        {/* Centre circle */}
        <circle cx={80} cy={115} r={22} />
        {/* Centre spot */}
        <circle cx={80} cy={115} r={1.5} fill="white" />
        {/* Top penalty box */}
        <rect x={38} y={12} width={84} height={38} />
        {/* Bottom penalty box */}
        <rect x={38} y={180} width={84} height={38} />
        {/* Top goal */}
        <rect x={60} y={12} width={40} height={10} />
        {/* Bottom goal */}
        <rect x={60} y={208} width={40} height={10} />
      </g>
      {/* Players */}
      <g className="hub-players-g">
        {players.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={6.5} fill="#F5F5F7" />
        ))}
      </g>
    </svg>
  )
}

function HubCard({ card, onClick }: { card: HubCardDef; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const isAvail = card.available
  const isPrimary = card.primary

  const borderColor = isPrimary
    ? hovered ? ACCENT_SOLID : `${ACCENT_SOLID}80`
    : isAvail
      ? hovered ? `${ACCENT_SOLID}80` : DS_BORDER
      : DS_BORDER

  return (
    <button
      style={{
        gridColumn: card.span2 ? "span 2" : "span 1",
        textAlign: "left", border: `1px solid ${borderColor}`,
        cursor: isAvail ? "pointer" : "not-allowed",
        background: SURFACE_1,
        borderRadius: 10, padding: 16, minHeight: 72,
        transform: isAvail && hovered ? "translateY(-2px)" : "none",
        transition: "transform 0.15s, border-color 0.15s",
        opacity: isAvail ? 1 : 0.55,
        position: "relative", fontFamily: "'Inter', sans-serif",
        outline: "none",
      }}
      onClick={onClick}
      aria-disabled={!isAvail ? true : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}>
      {/* Primary card gradient overlay */}
      {isPrimary && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 9,
          background: ACCENT_GRADIENT, opacity: 0.18, pointerEvents: "none",
        }} />
      )}
      {/* SOON badge */}
      {!isAvail && (
        <span style={{
          position: "absolute", top: 12, right: 12,
          fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase",
          color: TEXT_MUTED, border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 999, padding: "2px 8px", fontFamily: "'Inter', sans-serif",
        }}>
          SOON
        </span>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: TEXT_PRIMARY, position: "relative" }}>
        <span style={{ flexShrink: 0 }}>{card.icon}</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{card.title}</span>
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 12, color: TEXT_MUTED, lineHeight: 1.4, position: "relative" }}>
        {card.desc}
      </p>
    </button>
  )
}

function HubPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState("")
  const [userId, setUserId] = useState<string | null>(null)
  const [recentBoards, setRecentBoards] = useState<HubRecentBoard[] | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [ready, setReady] = useState(false) // true once we know someone is signed in
  // First visit right after sign-up says "Welcome", every later visit says "Welcome back"
  const [isNewUser] = useState(() => authHandoff.isNewUser)
  useEffect(() => { authHandoff.toHub = false; authHandoff.isNewUser = false }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/", { replace: true }); return }
      const uid = session.user.id
      setUserId(uid)
      setReady(true)
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, handle")
        .eq("id", uid)
        .maybeSingle()
      const raw = (profile as any)?.display_name || (profile as any)?.handle || session.user.email?.split("@")[0] || ""
      setDisplayName(stripHandleSuffix(raw, uid, session.user.email))
      await waitForSaves(5000) // coming straight from the board: let its last save land first
      const { data: boards } = await supabase
        .from("boards")
        .select("id, title, updated_at")
        .eq("user_id", uid)
        .order("updated_at", { ascending: false })
        .limit(3)
      setRecentBoards((boards ?? []) as HubRecentBoard[])
    })
  }, [])

  useEffect(() => {
    if (!toastMsg) return
    const t = setTimeout(() => setToastMsg(null), 3000)
    return () => clearTimeout(t)
  }, [toastMsg])

  // Opening a recent board: one at a time, and only while you're still on the hub
  const [openingId, setOpeningId] = useState<string | null>(null)
  const onHubRef = useRef(true)
  useEffect(() => {
    onHubRef.current = true
    boardHandoff.preload = null; boardHandoff.braindump = false // anything left over from earlier is out of date
    return () => { onHubRef.current = false }
  }, [])
  const handleRecentClick = async (board: HubRecentBoard) => {
    if (openingId) return
    setOpeningId(board.id)
    await waitForBoardSave(board.id) // its last save (say, from just before you pressed Back) lands first
    const { data } = await supabase.from("boards").select("canvas_data, title, narrative, updated_at").eq("id", board.id).single()
    if (!onHubRef.current) return
    if (data) boardHandoff.preload = { canvas_data: (data as any).canvas_data, title: (data as any).title ?? null, id: board.id, narrative: (data as any).narrative ?? null, updated_at: (data as any).updated_at ?? null }
    navigate("/")
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate("/")
  }

  const fireComingSoon = (title: string) => {
    ;(window as any).posthog?.capture("coming_soon_click", { feature: title })
    setToastMsg(`${title} — coming soon`)
  }

  const HUB_CARDS: HubCardDef[] = [
    { id: "tactical",  title: "Tactical Board",       desc: "Build formations, arrows and zones on a full pitch.",  icon: <LayoutGrid size={18} />,  available: true,  primary: true, span2: true },
    { id: "braindump", title: "Braindump",             desc: "A blank space to think — no pitch, no rules.",         icon: <StickyNote size={18} />,  available: true },
    { id: "live",      title: "Live Game Analysis",    desc: "Annotate real match stills and screenshots.",          icon: <Video size={18} />,       available: false },
    { id: "match",     title: "Match Report",          desc: "Publish an editorial-style match breakdown.",          icon: <FileText size={18} />,    available: false },
    { id: "player",    title: "Player Report",         desc: "Profile a single player in depth.",                   icon: <UserSquare size={18} />,  available: false },
    { id: "archive",   title: "Archive Closet",        desc: "Everything you've made, in one place.",               icon: <Archive size={18} />,     available: false },
    { id: "profile",   title: "Creator Profile",        desc: "Your name, club, country and colours.",               icon: <Settings size={18} />,    available: true },
  ]

  const handleCardClick = (card: HubCardDef) => {
    if (!card.available) { fireComingSoon(card.title); return }
    if (card.id === "tactical") { navigate("/"); return }
    if (card.id === "braindump") { boardHandoff.braindump = true; navigate("/"); return }
    if (card.id === "profile") { navigate("/profile"); return }
  }

  const hPad = { base: 32, sm: 20 }

  if (!ready) return <div style={{ width: "100vw", height: "100vh", background: SURFACE_BASE }} />

  return (
    <div style={{ display: "flex", width: "100vw", height: "100vh", overflow: "hidden", background: SURFACE_BASE, fontFamily: "'Inter', sans-serif", color: TEXT_PRIMARY, position: "relative" }}>
      <style>{`
        .hub-right { display: flex; }
        .hub-left { width: 58%; }
        @media (max-width: 1023px) {
          .hub-right { display: none !important; }
          .hub-left { width: 100% !important; }
        }
        .hub-user-chip:hover { filter: brightness(1.1); }
        @media (max-width: 639px) {
          .hub-greeting { font-size: 24px !important; }
          .hub-grid { grid-template-columns: 1fr !important; }
          .hub-card-span2 { grid-column: span 1 !important; }
          .hub-section-pad { padding-left: ${hPad.sm}px !important; padding-right: ${hPad.sm}px !important; }
          .hub-recent-row { flex-direction: column !important; }
        }
      `}</style>

      {/* ── Left content area ── */}
      <div className="hub-left" style={{ height: "100%", display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>

        {/* Top bar */}
        <div className="hub-section-pad" style={{
          height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: `1px solid ${DS_BORDER}`, flexShrink: 0, paddingLeft: hPad.base, paddingRight: hPad.base,
        }}>
          <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, letterSpacing: 1, color: TEXT_PRIMARY, userSelect: "none" }}>
            PITCHSTUDIO
          </span>
          <div style={{ position: "relative" }}>
            <button
              className="hub-user-chip"
              onClick={() => setUserMenuOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: SURFACE_2, borderRadius: 999, padding: "6px 12px",
                border: "none", cursor: "pointer", transition: "filter 0.15s",
              }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: ACCENT_GRADIENT, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>
                {displayName || "…"}
              </span>
            </button>
            {userMenuOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setUserMenuOpen(false)} />
                <div style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0,
                  background: SURFACE_1, border: `1px solid ${DS_BORDER}`, borderRadius: 8,
                  zIndex: 100, minWidth: 140, overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                }}>
                  <button
                    onClick={handleSignOut}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "10px 16px", background: "none", border: "none",
                      color: DS_ERROR, fontSize: 13, cursor: "pointer",
                      fontFamily: "'Inter', sans-serif",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,81,73,0.1)" }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "none" }}>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Greeting */}
        <div className="hub-section-pad" style={{ paddingLeft: hPad.base, paddingRight: hPad.base, paddingTop: 36 }}>
          <h1 className="hub-greeting" style={{
            margin: 0, fontSize: 32, fontWeight: 700, color: TEXT_PRIMARY,
            letterSpacing: "-0.5px", whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", maxWidth: "100%", fontFamily: "'Inter', sans-serif",
          }}>
            {isNewUser ? "Welcome" : "Welcome back"}{displayName ? `, ${displayName}` : ""}
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 15, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>
            What do you want to work on today?
          </p>
        </div>

        {/* Recent work strip */}
        {recentBoards !== null && recentBoards.length > 0 && (
          <div className="hub-section-pad" style={{ paddingLeft: hPad.base, paddingRight: hPad.base, paddingTop: 24 }}>
            <p style={{ margin: "0 0 10px", fontSize: 10, letterSpacing: 1, color: TEXT_MUTED, textTransform: "uppercase", fontFamily: "'Inter', sans-serif" }}>
              PICK UP WHERE YOU LEFT OFF
            </p>
            <div className="hub-recent-row" style={{ display: "flex", gap: 10 }}>
              {recentBoards.map(board => (
                <button
                  key={board.id}
                  className="hub-recent-card"
                  onClick={() => handleRecentClick(board)}
                  style={{
                    flex: 1, textAlign: "left", background: SURFACE_1,
                    border: `1px solid ${DS_BORDER}`, borderRadius: 8, padding: 12,
                    cursor: "pointer", transition: "border-color 0.15s, transform 0.15s",
                    fontFamily: "'Inter', sans-serif",
                  }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {board.title}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: TEXT_MUTED }}>
                    {openingId === board.id ? "Opening…" : hubRelTime(board.updated_at)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Card grid */}
        <div className="hub-section-pad hub-grid" style={{
          paddingLeft: hPad.base, paddingRight: hPad.base, paddingTop: 24, paddingBottom: 40,
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
        }}>
          {HUB_CARDS.map(card => (
            <HubCard key={card.id} card={card} onClick={() => handleCardClick(card)} />
          ))}
        </div>
      </div>

      {/* ── Right pitch panel — desktop only ── */}
      <div className="hub-right" style={{
        width: "42%", flexShrink: 0, height: "100%",
        background: SURFACE_BASE, borderLeft: `1px solid ${DS_BORDER}`,
        padding: 20, alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{ width: "100%", maxWidth: 320 }}>
          <HubPitchSVG />
        </div>
      </div>

      {/* ── Coming-soon toast ── */}
      {toastMsg && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: SURFACE_1, color: TEXT_PRIMARY, padding: "11px 22px",
          borderRadius: 8, fontSize: 14, fontFamily: "'Inter', sans-serif",
          border: `1px solid ${DS_BORDER}`, boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
          zIndex: 200, whiteSpace: "nowrap", pointerEvents: "none",
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────── Creator Profile Page ──────────── */
const WORLD_COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin",
  "Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi",
  "Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia",
  "Comoros","Congo (DRC)","Congo (Republic)","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark",
  "Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea",
  "Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana",
  "Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland",
  "India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya",
  "Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya",
  "Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta",
  "Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro",
  "Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger",
  "Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama",
  "Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda",
  "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino",
  "Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia",
  "Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan",
  "Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo",
  "Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine",
  "United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
]

const PROFILE_ACCENT_COLORS = ["#7C5CFF","#B14AED","#3FB950","#FBBF24","#58A6FF","#F85149"]

const IDENTITY_CHIPS = [
  { label: "Content Creator", value: "creator" },
  { label: "Coach",           value: "coach" },
  { label: "Analyst",         value: "analyst" },
  { label: "Just Here to Play", value: "fan" },
]

const inputStyle: React.CSSProperties = {
  width: "100%", background: SURFACE_2, border: `1px solid ${DS_BORDER}`,
  borderRadius: 6, padding: "10px 12px", color: TEXT_PRIMARY, fontSize: 14,
  fontFamily: "'Inter', sans-serif", outline: "none", boxSizing: "border-box",
  transition: "border-color 0.15s",
}

function ProfileInput({
  id, label, value, onChange, type = "text", prefix, maxLength, rows, hint,
  onFocus, onBlur, focusedId,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  type?: string; prefix?: string; maxLength?: number; rows?: number; hint?: string;
  onFocus?: () => void; onBlur?: () => void; focusedId?: string | null;
}) {
  const focused = focusedId === id
  const style: React.CSSProperties = { ...inputStyle, borderColor: focused ? ACCENT_SOLID : DS_BORDER }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>
        {label}
      </label>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {prefix && (
          <span style={{
            position: "absolute", left: 12, color: TEXT_MUTED, fontSize: 14,
            fontFamily: "'Inter', sans-serif", pointerEvents: "none", userSelect: "none",
          }}>{prefix}</span>
        )}
        {rows ? (
          <textarea
            id={id} value={value} onChange={e => onChange(e.target.value)}
            rows={rows} maxLength={maxLength}
            onFocus={onFocus} onBlur={onBlur}
            style={{ ...style, resize: "none", lineHeight: 1.5 }}
          />
        ) : (
          <input
            id={id} type={type} value={value} onChange={e => onChange(e.target.value)}
            maxLength={maxLength}
            onFocus={onFocus} onBlur={onBlur}
            style={{ ...style, paddingLeft: prefix ? 24 : 12 }}
          />
        )}
      </div>
      {hint && <span style={{ fontSize: 11, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>{hint}</span>}
    </div>
  )
}

function ProfilePage() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [displayName, setDisplayName] = useState("")
  const [handle, setHandle] = useState("")
  const [bio, setBio] = useState("")
  const [country, setCountry] = useState("")
  const [favoriteClub, setFavoriteClub] = useState("")
  const [favoritePlayer, setFavoritePlayer] = useState("")
  const [identity, setIdentity] = useState("")
  const [accentColor, setAccentColor] = useState(PROFILE_ACCENT_COLORS[0])

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<"saved" | "error" | null>(null)
  const [handleError, setHandleError] = useState("")
  const [focusedId, setFocusedId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/"); return }
      setUserId(session.user.id)
      const { data } = await supabase
        .from("profiles")
        .select("display_name, handle, bio, country, favorite_club, favorite_player, identity, accent_color")
        .eq("id", session.user.id)
        .maybeSingle()
      if (data) {
        setDisplayName((data as any).display_name ?? "")
        setHandle((data as any).handle ?? "")
        setBio((data as any).bio ?? "")
        setCountry((data as any).country ?? "")
        setFavoriteClub((data as any).favorite_club ?? "")
        setFavoritePlayer((data as any).favorite_player ?? "")
        setIdentity((data as any).identity ?? "")
        setAccentColor((data as any).accent_color ?? PROFILE_ACCENT_COLORS[0])
      }
      setLoaded(true)
    })
  }, [])

  const sanitizeHandle = normalizeHandle // same rule as sign-up and the database

  const handleSave = async () => {
    if (!userId) return
    setSaving(true); setHandleError(""); setSaveMsg(null)
    const cleanHandle = sanitizeHandle(handle)
    setHandle(cleanHandle)
    if (cleanHandle.length < 3) {
      setHandleError("Use at least 3 letters, numbers or underscores.")
      setSaving(false); return
    }
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      handle: cleanHandle,
      bio,
      country,
      favorite_club: favoriteClub,
      favorite_player: favoritePlayer,
      identity: identity || null,
      accent_color: accentColor,
    }).eq("id", userId)
    setSaving(false)
    if (error) {
      if ((error as any).code === "23505") {
        setHandleError("That handle's already taken. Try another.")
      } else {
        setSaveMsg("error")
        setTimeout(() => setSaveMsg(null), 3000)
      }
    } else {
      setSaveMsg("saved")
      ;(window as any).posthog?.capture("profile_updated")
      setTimeout(() => setSaveMsg(null), 2000)
    }
  }

  if (!loaded) return <div style={{ width: "100vw", height: "100vh", background: SURFACE_BASE }} />

  const sectionLabel = (text: string): React.ReactNode => (
    <p style={{
      margin: "32px 0 12px", fontSize: 11, letterSpacing: 1,
      color: TEXT_MUTED, textTransform: "uppercase",
      fontFamily: "'Inter', sans-serif", fontWeight: 600,
    }}>{text}</p>
  )

  const focusProps = (id: string) => ({
    onFocus: () => setFocusedId(id),
    onBlur: () => setFocusedId(null),
    focusedId,
  })

  return (
    <div style={{ minHeight: "100vh", background: SURFACE_BASE, fontFamily: "'Inter', sans-serif", color: TEXT_PRIMARY }}>
      <style>{`
        .profile-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .profile-3col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
        @media (max-width: 639px) {
          .profile-2col { grid-template-columns: 1fr !important; }
          .profile-3col { grid-template-columns: 1fr !important; }
          .profile-pad { padding-left: 20px !important; padding-right: 20px !important; }
          .profile-topbar { padding-left: 20px !important; padding-right: 20px !important; }
        }
        .profile-select:focus { border-color: ${ACCENT_SOLID} !important; outline: none; }
        .profile-input-focus:focus { border-color: ${ACCENT_SOLID} !important; outline: none; }
      `}</style>

      {/* Top bar */}
      <div className="profile-topbar" style={{
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${DS_BORDER}`, paddingLeft: 32, paddingRight: 32, flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/hub")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            color: TEXT_MUTED, fontSize: 13, fontFamily: "'Inter', sans-serif",
            padding: "4px 0", transition: "color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = TEXT_PRIMARY }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = TEXT_MUTED }}>
          <ArrowLeft size={16} /> Back to hub
        </button>
        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, letterSpacing: 1, color: TEXT_PRIMARY, userSelect: "none" }}>
          PITCHSTUDIO
        </span>
      </div>

      {/* Content */}
      <div className="profile-pad" style={{ maxWidth: 720, margin: "0 auto", paddingLeft: 32, paddingRight: 32, paddingBottom: 80 }}>

        {/* Heading */}
        <div style={{ marginTop: 32 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
            Creator Profile
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>
            How you show up in the studio.
          </p>
        </div>

        {/* IDENTITY */}
        {sectionLabel("IDENTITY")}
        <div className="profile-2col">
          <ProfileInput id="displayName" label="Display name" value={displayName} onChange={setDisplayName} {...focusProps("displayName")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="handle" style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>Handle</label>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                color: TEXT_MUTED, fontSize: 14, fontFamily: "'Inter', sans-serif",
                pointerEvents: "none", userSelect: "none",
              }}>@</span>
              <input
                id="handle"
                type="text"
                value={handle}
                maxLength={30}
                onChange={e => { setHandle(e.target.value); setHandleError("") }}
                onFocus={() => setFocusedId("handle")}
                onBlur={() => setFocusedId(null)}
                className="profile-input-focus"
                style={{ ...inputStyle, paddingLeft: 24, borderColor: handleError ? DS_ERROR : focusedId === "handle" ? ACCENT_SOLID : DS_BORDER }}
              />
            </div>
            {handleError && <span style={{ fontSize: 12, color: DS_ERROR, fontFamily: "'Inter', sans-serif" }}>{handleError}</span>}
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <ProfileInput
            id="bio" label="Bio" value={bio} onChange={setBio}
            rows={3} maxLength={160}
            hint={`${bio.length}/160`}
            {...focusProps("bio")}
          />
        </div>

        {/* FOOTBALL */}
        {sectionLabel("FOOTBALL")}
        <div className="profile-3col">
          {/* Country select */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="country" style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>Country</label>
            <select
              id="country"
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="profile-select"
              style={{ ...inputStyle, borderColor: focusedId === "country" ? ACCENT_SOLID : DS_BORDER, appearance: "none", cursor: "pointer" }}
              onFocus={() => setFocusedId("country")}
              onBlur={() => setFocusedId(null)}>
              <option value="">Select country</option>
              {WORLD_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <ProfileInput id="favoriteClub" label="Favourite club" value={favoriteClub} onChange={setFavoriteClub} {...focusProps("favoriteClub")} />
          <ProfileInput id="favoritePlayer" label="Favourite player" value={favoritePlayer} onChange={setFavoritePlayer} {...focusProps("favoritePlayer")} />
        </div>

        {/* Identity chips */}
        <div style={{ marginTop: 20 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_MUTED, fontFamily: "'Inter', sans-serif" }}>You are a…</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {IDENTITY_CHIPS.map(chip => {
              const active = identity === chip.value
              return (
                <button
                  key={chip.value}
                  aria-pressed={active}
                  onClick={() => setIdentity(active ? "" : chip.value)}
                  style={{
                    padding: "8px 16px", borderRadius: 999, border: "none", cursor: "pointer",
                    background: active ? ACCENT_GRADIENT : SURFACE_2,
                    color: active ? "#ffffff" : TEXT_MUTED,
                    fontSize: 13, fontFamily: "'Inter', sans-serif", fontWeight: active ? 600 : 400,
                    transition: "background 0.15s, color 0.15s",
                  }}>
                  {chip.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* APPEARANCE */}
        {sectionLabel("APPEARANCE")}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {PROFILE_ACCENT_COLORS.map(color => {
            const active = accentColor === color
            return (
              <button
                key={color}
                aria-pressed={active}
                onClick={() => setAccentColor(color)}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: color, border: "none", cursor: "pointer",
                  outline: active ? `2px solid ${TEXT_PRIMARY}` : "2px solid transparent",
                  outlineOffset: 2, transition: "outline-color 0.15s",
                }}
                title={color}
              />
            )
          })}
        </div>

        {/* Save row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, marginTop: 32 }}>
          {saveMsg === "saved" && (
            <span style={{ fontSize: 14, color: ACCENT_SOLID, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>Saved</span>
          )}
          {saveMsg === "error" && (
            <span style={{ fontSize: 14, color: DS_ERROR, fontFamily: "'Inter', sans-serif" }}>Something went wrong. Try again.</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 24px", borderRadius: 8,
              background: saving ? SURFACE_2 : ACCENT_GRADIENT,
              color: saving ? TEXT_MUTED : "#ffffff",
              fontSize: 14, fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "'Inter', sans-serif", transition: "opacity 0.15s",
              opacity: saving ? 0.7 : 1,
            }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
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
            className="px-2 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
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
            style={{ background: ACCENT_GRADIENT, color: "#ffffff", opacity: saving ? 0.7 : 1, cursor: saving ? "default" : "pointer" }}>
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
            Clear everything on the canvas?
          </p>
          <p style={{ color: TEXT_MUTED, fontSize: 13, margin: "6px 0 0", fontFamily: "'Inter', sans-serif" }}>
            This cannot be undone.
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
            Clear All
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
              background: ACCENT_SOLID, color: "#ffffff",
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
/** "/" shows the landing page to visitors and the Tactics Board to signed-in users.
 *  Right after signing in from the landing page it goes to the hub instead. This is decided
 *  each time the route renders, so later trips from the hub to the board open the board. */
function HomeRoute({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) return <LandingPage />
  if (authHandoff.toHub) return <Navigate to="/hub" replace />
  return <TacticsBoard />
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
          <Route path="/hub" element={<HubPage />} />
          <Route path="/profile" element={authUser ? <ProfilePage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
