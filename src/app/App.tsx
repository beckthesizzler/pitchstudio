import { useState, useRef, useCallback, useEffect, Component } from "react"
import type { ReactNode } from "react"
import React from "react"
import { toPng, toJpeg } from "html-to-image"
import jsPDF from "jspdf"
import {
  MousePointer2, UserPlus, ArrowUpRight, Type, Pentagon,
  Trash2, Download, Layers, RotateCcw, RotateCw,
  ChevronDown, FileImage, Move, Hand, PanelLeftClose, PanelLeftOpen,
  ImagePlus, Square, Circle, Minus, Plus, BookOpen,
  Lock, Star, X, RefreshCw, Magnet, ChevronRight,
  Save, FolderOpen, LogIn, LogOut, User, AlertCircle, Check, Clock,
  LayoutGrid, StickyNote, Video, FileText, UserSquare, Archive,
  Settings, ArrowLeft
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
  | "homePlayer" | "awayPlayer"
  | "arrow" | "text" | "shape" | "image" | "zone"

type ShapeKind = "polygon" | "circle" | "ellipse" | "rect"

interface Player {
  id: string; x: number; y: number
  name: string; num: string
  bg: string; fg: string; ring: string
  glow?: boolean
  scale?: number
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
}
interface Template {
  id: string; name: string
  data: CanvasState
  published: boolean
  createdAt: number
}

type Sel = null | { kind: "player" | "arrow" | "text" | "shape" | "image" | "zone"; id: string }

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
  const [sel, setSel] = useState<Sel>(null)
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
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Deep-link handlers: set by HubPage before navigating to "/"
  useEffect(() => {
    const mode = localStorage.getItem("ps_initial_mode")
    if (mode === "brainstorm") {
      localStorage.removeItem("ps_initial_mode")
      setWorkspaceMode("brainstorm")
      setCanvasMode("blank")
      setBgColor("#08080A")
      setShowPitch(false)
      return
    }
    const preload = localStorage.getItem("ps_preload_board")
    if (preload) {
      localStorage.removeItem("ps_preload_board")
      try {
        const { canvas_data, title: t, id } = JSON.parse(preload)
        setPlayers(canvas_data.players ?? [])
        setArrows(canvas_data.arrows ?? [])
        setTexts(canvas_data.texts ?? [])
        setShapes(canvas_data.shapes ?? [])
        setImages(canvas_data.images ?? [])
        setTitle(t ?? "")
        setSel(null)
        setCurrentBoardId(id ?? null)
      } catch { /* malformed, ignore */ }
    }
  }, [])

  const [saveError, setSaveError] = useState("")
  const [showSaveMenu, setShowSaveMenu] = useState(false)

  const saveBoard = async (forceNew = false) => {
    if (!authUser) { setShowAuth(true); return }
    setSaveStatus("saving"); setSaveError(""); setShowSaveMenu(false)
    const canvasData = { players, arrows, texts, shapes, images }

    if (currentBoardId && !forceNew) {
      // UPDATE existing board
      const { error } = await supabase.from("boards")
        .update({ title, canvas_data: canvasData, updated_at: new Date().toISOString() })
        .eq("id", currentBoardId)
        .eq("user_id", authUser.id)
      if (error) {
        console.error("Save board error:", error)
        setSaveError(error.message)
        setSaveStatus("error")
        setTimeout(() => setSaveStatus("idle"), 6000)
      } else {
        setSaveStatus("saved")
        ;(window as any).posthog?.capture("board_saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      }
    } else {
      // INSERT new board
      const { data, error } = await supabase.from("boards")
        .insert({ user_id: authUser.id, title, canvas_data: canvasData })
        .select("id")
        .single()
      if (error) {
        console.error("Save board error:", error)
        setSaveError(error.message)
        setSaveStatus("error")
        setTimeout(() => setSaveStatus("idle"), 6000)
      } else {
        if (data?.id) setCurrentBoardId(data.id)
        setSaveStatus("saved")
        ;(window as any).posthog?.capture("board_saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      }
    }
  }

  /* ── Templates ── */
  const [templates, setTemplates] = useState<Template[]>(() => {
    try { return JSON.parse(localStorage.getItem("tactics-templates") || "[]") }
    catch { return [] }
  })
  const saveTemplates = (t: Template[]) => {
    setTemplates(t)
    localStorage.setItem("tactics-templates", JSON.stringify(t))
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

  /* ── Auto-switch panel tab when selection changes null↔element ── */
  const prevSelNullRef = useRef<boolean>(true)
  useEffect(() => {
    const wasNull = prevSelNullRef.current
    const isNull = sel === null
    if (wasNull && !isNull) {
      setSideTab("selected")
    } else if (!wasNull && isNull) {
      setSideTab("board")
    }
    prevSelNullRef.current = isNull
  }, [sel])

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
  type Snap = { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[] }
  const histRef = useRef<Snap[]>([])
  const histIdx = useRef(-1)

  const snapshot = useCallback(() => {
    const s: Snap = {
      players: players.map(x => ({ ...x })),
      arrows: arrows.map(x => ({ ...x })),
      texts: texts.map(x => ({ ...x })),
      shapes: shapes.map(x => ({ ...x, pts: [...x.pts] })),
      images: images.map(x => ({ ...x })),
    }
    histRef.current = histRef.current.slice(0, histIdx.current + 1)
    histRef.current.push(s)
    histIdx.current = histRef.current.length - 1
  }, [players, arrows, texts, shapes, images])

  const undo = () => {
    if (histIdx.current <= 0) return
    histIdx.current--
    const s = histRef.current[histIdx.current]
    setPlayers(s.players); setArrows(s.arrows); setTexts(s.texts)
    setShapes(s.shapes); setImages(s.images); setSel(null)
  }
  const redo = () => {
    if (histIdx.current >= histRef.current.length - 1) return
    histIdx.current++
    const s = histRef.current[histIdx.current]
    setPlayers(s.players); setArrows(s.arrows); setTexts(s.texts)
    setShapes(s.shapes); setImages(s.images)
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
  const applyZoom = useCallback((delta: number, cx?: number, cy?: number) => {
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

  const fitToView = () => { setZoom(1); setPanX(0); setPanY(0) }

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
      if (!sel) return
      snapshot()
      if (sel.kind === "player") setPlayers(p => p.filter(x => x.id !== sel.id))
      else if (sel.kind === "arrow") setArrows(a => a.filter(x => x.id !== sel.id))
      else if (sel.kind === "text") setTexts(t => t.filter(x => x.id !== sel.id))
      else if (sel.kind === "shape") setShapes(s => s.filter(x => x.id !== sel.id))
      else if (sel.kind === "image") setImages(i => i.filter(x => x.id !== sel.id))
      else if (sel.kind === "zone") setCustomZones(z => z.filter(x => x.id !== sel.id))
      setSel(null)
    }
    const sw = (t: Tool) => { setTool(t); setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null; setShapeDraftPreview(null) }
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
      if (e.key === "+" || e.key === "=") applyZoom(1.15)
      if (e.key === "-") applyZoom(0.87)
      if (e.key === "0") fitToView()
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "v" || e.key === "V") sw("select")
        if (e.key === "h" || e.key === "H") sw("pan")
        if (e.key === "1") sw("homePlayer")
        if (e.key === "2") sw("awayPlayer")
        if (e.key === "a" || e.key === "A") sw("arrow")
        if (e.key === "t" || e.key === "T") sw("text")
        if (e.key === "s" || e.key === "S") sw("shape")
        if (e.key === "i" || e.key === "I") fileInputRef.current?.click()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, tool, snapshot, applyZoom])

  /* ── Delete selected ── */
  const deleteSelected = useCallback(() => {
    if (!sel) return
    snapshot()
    if (sel.kind === "player") setPlayers(p => p.filter(x => x.id !== sel.id))
    else if (sel.kind === "arrow") setArrows(a => a.filter(x => x.id !== sel.id))
    else if (sel.kind === "text") setTexts(t => t.filter(x => x.id !== sel.id))
    else if (sel.kind === "shape") setShapes(s => s.filter(x => x.id !== sel.id))
    else if (sel.kind === "image") setImages(i => i.filter(x => x.id !== sel.id))
    else if (sel.kind === "zone") setCustomZones(z => z.filter(x => x.id !== sel.id))
    setSel(null)
  }, [sel, snapshot])

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
    if (d.kind === "player") setPlayers(p => p.map(pl => pl.id === d.id ? { ...pl, x: x - d.ox, y: y - d.oy } : pl))
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
    else if (d.kind === "resizePlayer") setPlayers(p => p.map(pl => pl.id === d.id ? { ...pl, scale: Math.max(0.5, (x - pl.x) / 28) } : pl))
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
    if (dragRef.current) { snapshot(); dragRef.current = null }
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

    if (tool === "homePlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "", num: String(players.length + 1), ...HOME_COLORS, bg: homeColor, glow: false, scale: 1 }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id }); setTool("select")
    } else if (tool === "awayPlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "", num: String(players.length + 1), ...AWAY_COLORS, bg: awayColor, glow: false, scale: 1 }
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
  }, [tool, shapeKind, players.length, arrowDraft, polyDraft, shapes.length, textLayer, svgXY, snapshot, arrowDefaultDash, arrowDefaultColor, arrowDefaultW])

  /* ── Canvas pan (alt+drag, middle-button, or pan tool) ── */
  const onCanvasMouseDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.altKey && e.button === 0) || tool === "pan") {
      e.preventDefault()
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
    // Text is always draggable regardless of active tool; players/images only in select mode
    if (kind !== "text" && tool !== "select") return
    const { x, y } = svgXY(e)
    dragRef.current = { kind, id, ox: x - ex, oy: y - ey }
    setSel({ kind: kind === "image" ? "image" : kind, id })
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
    try {
      if (fmt === "png") {
        const url = await toPng(pitchRef.current, { pixelRatio: 2 })
        const a = document.createElement("a"); a.href = url; a.download = "tactics.png"; a.click()
      } else if (fmt === "jpeg") {
        const url = await toJpeg(pitchRef.current, { quality: 0.95, pixelRatio: 2, backgroundColor: bgColor })
        const a = document.createElement("a"); a.href = url; a.download = "tactics.jpg"; a.click()
      } else {
        const url = await toPng(pitchRef.current, { pixelRatio: 2 })
        const img = new Image(); img.src = url
        await new Promise(r => { img.onload = r })
        const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [img.width, img.height] })
        pdf.addImage(url, "PNG", 0, 0, img.width, img.height)
        pdf.save("tactics.pdf")
      }
      ;(window as any).posthog?.capture("board_exported", { format: fmt })
    } catch (err) { console.error(err) }
  }

  /* ── Templates ── */
  const getCanvasState = (): CanvasState => ({
    players, arrows, texts, shapes, images, title, bgColor, showPitch
  })
  const saveTemplate = (name: string) => {
    const t: Template = { id: uid(), name, data: getCanvasState(), published: false, createdAt: Date.now() }
    saveTemplates([...templates, t])
  }
  const loadTemplate = (t: Template) => {
    snapshot()
    const d = { ...t.data }
    setPlayers(d.players ?? []); setArrows(d.arrows ?? [])
    setTexts(d.texts ?? []); setShapes(d.shapes ?? [])
    setImages(d.images ?? []); setTitle(d.title ?? "Untitled board")
    setBgColor(d.bgColor ?? "#0d1117"); setShowPitch(d.showPitch ?? true)
    setSel(null); setShowTemplates(false)
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

      {/* ── Top Header ── */}
      <header className="flex items-center gap-3 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#161b22", minHeight: 48 }}>
        {/* Logo + Workspace Mode Selector + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
            title="Back to Hub"
            onClick={() => navigateBoard("/hub")}
            style={{ background: ACCENT_SOLID, color: "#ffffff", fontFamily: "'Barlow Condensed', sans-serif", cursor: "pointer" }}>PS</div>
          <WorkspaceModeSelector mode={workspaceMode} onChange={m => {
            setWorkspaceMode(m)
            if (m === "report") { setCanvasMode("blank"); setBgColor("#f5f5f0"); setShowPitch(false) }
            else if (m === "brainstorm") { setCanvasMode("blank"); setBgColor("#0d1117"); setShowPitch(false) }
            else { setCanvasMode("full"); setBgColor("#0d1117"); setShowPitch(true) }
          }} />
          <div className="w-px h-5 mx-3 flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }} />
          {editingTitle ? (
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => { if (e.key === "Enter") setEditingTitle(false) }}
              className="bg-transparent outline-none font-bold text-sm"
              style={{ borderBottom: `1px solid ${ACCENT_SOLID}`, color: TEXT_PRIMARY, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", width: 200 }} />
          ) : (
            <button onClick={() => setEditingTitle(true)}
              className="flex items-center gap-1.5 group px-2 py-1 rounded hover:bg-white/8 transition-colors"
              title="Click to rename">
              <span className="font-bold text-sm truncate max-w-44"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em" }}>{title}</span>
              <span className="text-xs opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" style={{ color: ACCENT_SOLID }}>✏</span>
            </button>
          )}
        </div>

        <div className="flex-1 flex items-center gap-2 justify-center">
          {/* Rotation control */}
          <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: "#21262d" }}>
            <RefreshCw size={13} style={{ color: TEXT_MUTED }} />
            <input type="range" min={0} max={360} value={rotation}
              onChange={e => handleRotation(+e.target.value)}
              className="w-20 accent-green-400" style={{ height: 4 }} />
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

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Templates */}
          <button onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
            style={{ background: "#21262d", color: "#c9d1d9" }}>
            <BookOpen size={13} /> Templates
          </button>
          {/* My Boards */}
          {authUser && (
            <button onClick={() => setShowMyBoards(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ background: "#21262d", color: "#c9d1d9" }}>
              <FolderOpen size={13} /> My Boards
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
                {saveStatus === "saved" ? <Check size={13} /> : saveStatus === "error" ? <AlertCircle size={13} /> : <Save size={13} />}
                {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Save failed" : "Save"}
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
            {saveStatus === "error" && saveError && (
              <span className="text-xs max-w-48 text-right" style={{ color: "#f85149" }}>{saveError}</span>
            )}
          </div>
          {/* Auth */}
          {authUser ? (
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium"
                style={{ background: "#21262d", color: "#c9d1d9" }}>
                <User size={13} />
                <span className="max-w-20 truncate">{authUser.email?.split("@")[0]}</span>
                <ChevronDown size={11} />
              </button>
              <div className="absolute right-0 top-full mt-1 w-36 rounded shadow-xl border z-50 hidden group-hover:flex flex-col"
                style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
                <button onClick={() => supabase.auth.signOut()}
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/10 transition-colors text-left"
                  style={{ color: "#f85149" }}>
                  <LogOut size={12} /> Sign Out
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setAuthInitialTab("signin"); setShowAuth(true) }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{ background: SURFACE_2, color: TEXT_PRIMARY }}>
              <LogIn size={13} /> Sign In
            </button>
          )}
          {/* Undo/Redo */}
          <button onClick={undo} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Undo (Ctrl+Z)"><RotateCcw size={14} /></button>
          <button onClick={redo} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Redo"><RotateCw size={14} /></button>
          {/* Clear All — visually separated by a divider so it reads as destructive/distinct */}
          <div className="self-stretch flex items-center mx-2" style={{ width: 1, background: DS_BORDER }} />
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors hover:bg-red-500/20 ml-1"
            style={{ color: DS_ERROR }}
            title="Clear all canvas elements">
            <Trash2 size={13} /> Clear All
          </button>
          {/* Export */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{ background: "transparent", color: ACCENT_SOLID, border: `1px solid ${ACCENT_SOLID}` }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${ACCENT_SOLID}26` }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}>
              <Download size={13} /> Export <ChevronDown size={11} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-28 rounded shadow-xl border z-50 hidden group-hover:flex flex-col"
              style={{ background: SURFACE_1, borderColor: DS_BORDER }}>
              {(["png", "jpeg", "pdf"] as const).map(f => (
                <button key={f} onClick={() => doExport(f)}
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/10 transition-colors text-left uppercase font-semibold"
                  style={{ letterSpacing: "0.06em" }}>
                  <FileImage size={12} /> {f}
                </button>
              ))}
            </div>
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
            {sel ? (
              <div className="p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase" style={{ color: TEXT_MUTED, letterSpacing: "0.08em" }}>
                    {selP ? "Player" : selA ? "Arrow" : selT ? "Text" : selS ? "Shape" : selI ? "Image" : sel.kind === "zone" ? "Zone" : "Element"}
                  </p>
                  <button onClick={deleteSelected} className="p-1 rounded hover:bg-red-500/20 transition-colors" style={{ color: DS_ERROR }}>
                    <Trash2 size={13} />
                  </button>
                </div>

                {selP && (
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
                <select value={selectedFormation} onChange={e => setSelectedFormation(e.target.value)}
                  className="w-full rounded px-2 py-1.5 text-xs outline-none"
                  style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}>
                  {FORMATIONS.map(f => (
                    <option key={f.name} value={f.name}>{f.name} — {f.description}</option>
                  ))}
                </select>
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
                    setPlayers(prev => prev.map(p => p.bg === homeColor || p.bg === HOME_COLORS.bg ? { ...p, bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" } : p))
                  }} />
                  <ColorPicker label="Away Color" colors={PALETTE.slice(2, 7)} selected={awayColor} onSelect={c => {
                    setAwayColor(c)
                    setPlayers(prev => prev.map(p => p.bg === awayColor || p.bg === AWAY_COLORS.bg ? { ...p, bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" } : p))
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
            {tool === "select" && "Click to select · Drag to move · Del to remove"}
            {tool === "pan" && "Drag to move the canvas · Scroll to zoom"}
            {tool === "homePlayer" && "Click the pitch to place a home player"}
            {tool === "awayPlayer" && "Click the pitch to place an away player"}
            {tool === "arrow" && "Click once to start, click again to finish"}
            {tool === "text" && "Click anywhere to add a text box"}
            {tool === "shape" && "Click and drag to draw a shape"}
            {tool === "zone" && "Drag on pitch to draw a zone · Esc to cancel"}
          </div>
        </aside>
        )}


        {/* ── Main Canvas ── */}
        <main
          ref={canvasRef}
          className="flex-1 overflow-hidden relative flex items-center justify-center"
          style={{
            background: bgColor,
            cursor: tool === "pan" ? "grab" : panDragRef.current ? "grabbing" : "default",
          }}
          onPointerDown={onCanvasMouseDown}
          onPointerMove={onCanvasMouseMove}
          onPointerUp={onCanvasMouseUp}
        >
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
                >
                  {/* 1. Canvas background */}
                  <rect x={0} y={0} width={CW} height={CH} fill={bgColor} />

                  {/* 2. Background images (full-canvas fill) */}
                  {bgImages.map(img => (
                    <image key={img.id} href={img.src}
                      x={0} y={0} width={CW} height={CH}
                      opacity={img.opacity} preserveAspectRatio="xMidYMid slice"
                      onPointerDown={e => startDrag(e, "image", img.id, img.x, img.y)}
                      onClick={e => { if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "image", id: img.id }); setTool("select") } }}
                      style={{ cursor: tool === "select" ? "move" : "default" }} />
                  ))}

                  {/* 3. Background texts (behind pitch, in margins) */}
                  {bgTexts.map(t => (
                    <TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      startResize={(e: React.PointerEvent) => { e.stopPropagation(); dragRef.current = { kind: "resizeText", id: t.id, ox: 0, oy: 0 } }}
                      setSel={setSel} tool={tool} updT={updT} setTool={setTool} />
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
                          const isSelZ = sel?.kind === "zone" && sel.id === z.id
                          return (
                            <g key={z.id}
                              style={{ cursor: tool === "select" ? "move" : "default" }}
                              onClick={e => { e.stopPropagation(); if (tool === "select") setSel({ kind: "zone", id: z.id }) }}
                              onPointerDown={e => {
                                if (tool !== "select") return
                                e.stopPropagation()
                                const svgPt = svgXY(e)
                                const px = (svgPt.x - PX - pitchOffXRef.current) / pitchScaleRef.current
                                const py = (svgPt.y - PY - pitchOffYRef.current) / pitchScaleRef.current
                                dragRef.current = { kind: "zone", id: z.id, ox: px - z.x, oy: py - z.y }
                                setSel({ kind: "zone", id: z.id })
                              }}>
                              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={4}
                                fill={z.color} fillOpacity={z.opacity}
                                stroke={isSelZ ? "#ffffff" : z.color}
                                strokeWidth={isSelZ ? 2 : 1}
                                strokeOpacity={isSelZ ? 1 : 0.5}
                                strokeDasharray={isSelZ ? "6,3" : undefined} />
                              {z.label && (
                                <text x={z.x + z.w / 2} y={z.y + z.h / 2}
                                  textAnchor="middle" dominantBaseline="middle"
                                  fill="#ffffff" fontSize={14} fontWeight="700"
                                  style={{ fontFamily: "'Barlow Condensed',sans-serif", pointerEvents: "none", letterSpacing: "0.06em" }}>
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
                            fill="#3fb950" stroke="#0d1117" strokeWidth={1.5} opacity={0.92} />
                          {[-12, -4, 4, 12].map(dx => (
                            <circle key={dx} cx={midX + dx} cy={oy - 12} r={2} fill="#0d1117" opacity={0.65} />
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
                        if (tool === "select") { setSel({ kind: "shape", id: s.id }) }
                        else if (tool === "homePlayer" || tool === "awayPlayer") { setSel({ kind: "shape", id: s.id }); setTool("select") }
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
                      {sel?.id === s.id && s.kind === "polygon" && s.pts && s.pts.length >= 2 && (
                        <rect
                          x={Math.min(...s.pts.map(([px]) => px)) - 4}
                          y={Math.min(...s.pts.map(([, py]) => py)) - 4}
                          width={Math.max(...s.pts.map(([px]) => px)) - Math.min(...s.pts.map(([px]) => px)) + 8}
                          height={Math.max(...s.pts.map(([, py]) => py)) - Math.min(...s.pts.map(([, py]) => py)) + 8}
                          fill="none" stroke="#3fb950" strokeWidth={1.5} strokeDasharray="4,2" rx={3}
                          style={{ pointerEvents: "none" }} />
                      )}
                      {sel?.id === s.id && s.kind !== "polygon" && (
                        <>
                          <rect
                            x={s.x - 4} y={s.y - 4}
                            width={s.w + 8} height={s.h + 8}
                            fill="none" stroke="#3fb950" strokeWidth={1.5} strokeDasharray="4,2" rx={3}
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
                    const isSelected = sel?.id === a.id
                    const hs = a.strokeW * 4 + 6
                    return (
                      <g key={a.id}
                        onClick={e => {
                          e.stopPropagation()
                          if (tool === "select") { setSel({ kind: "arrow", id: a.id }) }
                          else if (tool === "homePlayer" || tool === "awayPlayer") { setSel({ kind: "arrow", id: a.id }); setTool("select") }
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
                            <line x1={a.x1} y1={a.y1} x2={a.cpx} y2={a.cpy} stroke="#3fb950" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                            <line x1={a.x2} y1={a.y2} x2={a.cpx} y2={a.cpy} stroke="#3fb950" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                            <circle cx={a.x1} cy={a.y1} r={7} fill="#3fb950" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "grab" }}
                              onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowP1", id: a.id, ox: 0, oy: 0 } }} />
                            <circle cx={a.x2} cy={a.y2} r={7} fill="#3fb950" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "grab" }}
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
                      setSel={setSel} tool={tool} updT={updT} setTool={setTool} />
                  ))}

                  {/* 11. Players */}
                  {players.map(p => {
                    const isSelected = sel?.id === p.id
                    const s = p.scale || 1
                    const r = 28 * s
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
                          startDrag(e, "player", p.id, p.x, p.y)
                        }}
                        onClick={e => { if (tool === "homePlayer" || tool === "awayPlayer") e.stopPropagation() }}
                        style={{ cursor: tool === "select" ? "grab" : "default" }}>
                        {p.glow && (
                          <circle r={r + 15} fill={p.bg} fillOpacity={0.4} filter="blur(8px)" />
                        )}
                        {/* Drop shadow */}
                        <circle r={r + 1} fill="rgba(0,0,0,0.45)" cx={1.5} cy={2.5} />
                        {/* Selection ring + resize handle at bottom-right of circle */}
                        {isSelected && (
                          <>
                            <circle r={r + 7} fill="none" stroke={ACCENT_SOLID} strokeWidth={2.5} strokeDasharray="5,3" />
                            <circle cx={r * 0.707} cy={r * 0.707} r={6}
                              fill={ACCENT_SOLID} stroke="#ffffff" strokeWidth={1.5} style={{ cursor: "nwse-resize" }}
                              onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizePlayer", id: p.id, ox: 0, oy: 0 } }} />
                          </>
                        )}
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
                      onClick={e => { if (tool === "homePlayer" || tool === "awayPlayer") { e.stopPropagation(); setSel({ kind: "image", id: img.id }); setTool("select") } }}
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
                        fill="none" stroke="#3fb950" strokeWidth={2} strokeDasharray="6,3"
                        style={{ pointerEvents: "none" }} />
                      {selI.layer !== "background" && (
                        <circle cx={selI.x + selI.width} cy={selI.y + selI.height} r={6} fill="#fbbf24" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "nwse-resize" }}
                          onPointerDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizeImage", id: selI.id, ox: 0, oy: 0 } }} />
                      )}
                    </>
                  )}

                  {/* 13. Watermark — always last, always visible */}
                  <g>
                    <rect x={CW - 110} y={CH - 26} width={102} height={20} rx={3} fill="rgba(0,0,0,0.45)" />
                    <text x={CW - 10} y={CH - 11} textAnchor="end"
                      fill="rgba(255,255,255,0.75)" fontSize={12} fontWeight="700"
                      style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.12em", pointerEvents: "none" }}>
                      PITCHSTUDIO
                    </text>
                  </g>
                </svg>
              </div>
            </div>
          </div>

          {/* ── Zoom controls ── */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg px-2 py-1.5 border"
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
          onLoad={(canvasData, boardTitle, boardId) => {
            snapshot()
            setPlayers(canvasData.players ?? [])
            setArrows(canvasData.arrows ?? [])
            setTexts(canvasData.texts ?? [])
            setShapes(canvasData.shapes ?? [])
            setImages(canvasData.images ?? [])
            setTitle(boardTitle)
            setSel(null)
            setCurrentBoardId(boardId)
            setShowMyBoards(false)
          }}
          onBoardDeleted={(id) => {
            if (id === currentBoardId) setCurrentBoardId(null)
          }}
        />
      )}

      {/* ── Clear All confirmation ── */}
      {showClearConfirm && (
        <ClearConfirmModal
          onCancel={() => setShowClearConfirm(false)}
          onConfirm={() => {
            snapshot()
            setPlayers([]); setArrows([]); setTexts([])
            setShapes([]); setImages([]); setCustomZones([])
            setSel(null)
            setCurrentBoardId(null)
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

  const switchTab = (t: "signin" | "signup") => { setTab(t); setError(""); setStep(1) }

  const submit = async () => {
    setError(""); setLoading(true)

    if (tab === "signup") {
      if (step === 1) {
        if (!email || !password) { setError("Please fill in all fields."); setLoading(false); return }
        setStep(2); setLoading(false); return
      }
      if (!handle.trim()) { setError("Please enter a display name."); setLoading(false); return }
      if (!identity) { setError("Please choose how you see yourself on the pitch."); setLoading(false); return }

      const { data, error: signUpErr } = await supabase.auth.signUp({ email, password })
      if (signUpErr) { setError(signUpErr.message); setLoading(false); return }

      if (data.user) {
        const cleanHandle = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
        const { error: profErr } = await supabase
          .from("profiles")
          .update({ handle: cleanHandle || handle.trim(), identity })
          .eq("id", data.user.id)
        if (profErr?.code === "23505") {
          setError("That name's already taken. Try another.")
          setLoading(false); return
        }
      }

      ;(window as any).posthog?.capture("sign_up")
      onSignedIn?.()
      onClose()
      setLoading(false)
      return
    }

    const { error: e } = await supabase.auth.signInWithPassword({ email, password })
    if (e) { setError(e.message) }
    else { onSignedIn?.(); onClose() }
    setLoading(false)
  }

  const showStep1 = tab === "signin" || step === 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}>
      <div className="relative rounded-xl border overflow-hidden flex flex-col w-full"
        style={{ background: SURFACE_1, borderColor: "rgba(255,255,255,0.12)", maxWidth: 400 }}
        onClick={e => e.stopPropagation()}>

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
        {tab === "signup" && (
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
          {showStep1 ? (
            <>
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}
                onKeyDown={e => e.key === "Enter" && submit()} />

              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}
                onKeyDown={e => e.key === "Enter" && submit()} />
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs mb-1.5 font-medium" style={{ color: TEXT_MUTED }}>
                  What should we call you?
                </label>
                <input
                  type="text"
                  placeholder="e.g. tactician99"
                  value={handle}
                  onChange={e => setHandle(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: SURFACE_2, color: TEXT_PRIMARY, border: `1px solid ${DS_BORDER}` }}
                  onKeyDown={e => e.key === "Enter" && submit()}
                  autoFocus
                />
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
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: `${DS_ERROR}20`, color: DS_ERROR }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={loading || (showStep1 && (!email || !password))}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: ACCENT_GRADIENT, color: "#ffffff" }}>
            {loading ? "Please wait…" : tab === "signin" ? "Sign In" : step === 1 ? "Next →" : "Create Account"}
          </button>

          <p className="text-center text-xs" style={{ color: TEXT_MUTED }}>
            Save boards to your account and access them anywhere.
          </p>
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
  onLoad: (canvasData: { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[] }, title: string, id: string) => void
  onBoardDeleted: (id: string) => void
}) {
  const [boards, setBoards] = useState<BoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchBoards = () => {
    supabase
      .from("boards")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .then(({ data }) => { setBoards(data ?? []); setLoading(false) })
  }

  useEffect(() => { fetchBoards() }, [userId])

  const loadBoard = async (b: BoardRow) => {
    setLoadingId(b.id)
    const { data } = await supabase.from("boards").select("canvas_data, title").eq("id", b.id).single()
    if (data) onLoad(data.canvas_data, data.title, b.id)
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

function TextSVG({ t, sel, editingText, setEditingText, startDrag, startResize, setSel, tool, updT, setTool }: {
  t: TextBox; sel: Sel; editingText: string | null
  setEditingText: (id: string | null) => void
  startDrag: (e: React.PointerEvent) => void
  startResize?: (e: React.PointerEvent) => void
  setSel: (s: Sel) => void
  tool: Tool
  updT: (patch: Partial<TextBox>) => void
  setTool?: (t: Tool) => void
}) {
  const isSelected = sel?.id === t.id
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
        // Draggable in any tool — just like iPhone: grab and move without mode switching
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
          fill="none" stroke="#3fb950" strokeWidth={1.5} strokeDasharray="5,3" rx={5}
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
    setAuthInitialTab("signup")
    setShowAuth(true)
  }

  const openSignIn = () => {
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

function stripHandleSuffix(name: string): string {
  return name.replace(/_[A-Za-z0-9]{4}$/, "")
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

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return
      const uid = session.user.id
      setUserId(uid)
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, handle")
        .eq("id", uid)
        .maybeSingle()
      const raw = (profile as any)?.display_name || (profile as any)?.handle || session.user.email?.split("@")[0] || ""
      setDisplayName(stripHandleSuffix(raw))
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

  const handleRecentClick = async (board: HubRecentBoard) => {
    const { data } = await supabase.from("boards").select("canvas_data, title").eq("id", board.id).single()
    if (data) localStorage.setItem("ps_preload_board", JSON.stringify({ canvas_data: data.canvas_data, title: data.title, id: board.id }))
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
    if (card.id === "braindump") { localStorage.setItem("ps_initial_mode", "brainstorm"); navigate("/"); return }
    if (card.id === "profile") { navigate("/profile"); return }
  }

  const hPad = { base: 32, sm: 20 }

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
            Welcome back, {displayName || "…"}
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
                    {hubRelTime(board.updated_at)}
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

  const sanitizeHandle = (h: string) =>
    h.toLowerCase().replace(/\s/g, "").replace(/[^a-z0-9_-]/g, "")

  const handleSave = async () => {
    if (!userId) return
    setSaving(true); setHandleError(""); setSaveMsg(null)
    const cleanHandle = sanitizeHandle(handle)
    setHandle(cleanHandle)
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      handle: cleanHandle,
      bio,
      country,
      favorite_club: favoriteClub,
      favorite_player: favoritePlayer,
      identity,
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

/* ─────────────────────────── Root (entry) ───────────────────── */
export default function Root() {
  const [authUser, setAuthUser] = useState<import("@supabase/supabase-js").User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (authLoading) {
    return <div style={{ width: "100vw", height: "100vh", background: SURFACE_BASE }} />
  }

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={authUser ? <TacticsBoard /> : <LandingPage />} />
          <Route path="/hub" element={<HubPage />} />
          <Route path="/profile" element={authUser ? <ProfilePage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  )
}
