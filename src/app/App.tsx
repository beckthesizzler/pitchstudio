import { useState, useRef, useCallback, useEffect } from "react"
import { toPng, toJpeg } from "html-to-image"
import jsPDF from "jspdf"
import {
  MousePointer2, UserPlus, ArrowUpRight, Type, Pentagon,
  Trash2, Download, Layers, RotateCcw, RotateCw,
  ChevronDown, FileImage, Move,
  ImagePlus, Square, Circle, Minus, Plus, BookOpen,
  Lock, Star, X, RefreshCw, Magnet, ChevronRight,
  Save, FolderOpen, LogIn, LogOut, User, AlertCircle, Check, Clock
} from "lucide-react"
import { createClient } from "@supabase/supabase-js"
import { projectId, publicAnonKey } from "../../utils/supabase/info"

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
const SNAP_ANGLES = [0,30,45,60,90,120,135,150,180,210,225,240,270,300,315,330,360]

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
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}>
      <div className="relative w-[640px] max-h-[80vh] flex flex-col rounded-lg border overflow-hidden"
        style={{ background: "#161b22", borderColor: "rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2">
            <BookOpen size={16} style={{ color: "#3fb950" }} />
            <span className="font-semibold" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", fontSize: 16 }}>
              TEMPLATE LIBRARY
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onAdminToggle}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors"
              style={{ background: isAdmin ? "#fbbf24" : "#21262d", color: isAdmin ? "#0d1117" : "#8b949e" }}>
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
                borderBottom: tab === t ? "2px solid #3fb950" : "2px solid transparent",
                color: tab === t ? "#3fb950" : "#8b949e",
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
                      <Star size={12} style={{ color: "#fbbf24", flexShrink: 0 }} />
                    </div>
                    <p className="text-xs" style={{ color: "#8b949e" }}>
                      {t.data.players.length} players · {t.data.arrows.length} arrows · {t.data.shapes.length} shapes
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      <button onClick={() => onLoad(t)}
                        className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                        style={{ background: "#3fb950", color: "#0d1117" }}>
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
                  style={{ background: "#3fb950", color: "#0d1117" }}>
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
                        style={{ background: "#58a6ff", color: "#0d1117" }}>
                        Load
                      </button>
                      {isAdmin && (
                        <button onClick={() => onTogglePublish(t.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
                          style={{ background: "#fbbf2420", color: "#fbbf24" }}>
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

/* ─────────────────────────── Main App ──────────────────────── */
export default function App() {
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
  const [title, setTitle] = useState("TACTICAL ANALYSIS")
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [bgColor, setBgColor] = useState("#0d1117")
  const [showPitch, setShowPitch] = useState(true)
  const [canvasMode, setCanvasMode] = useState<"full" | "half" | "blank">("full")
  const [pitchColor, setPitchColor] = useState<"green" | "white">("green")
  const [pitchScale, setPitchScale] = useState(1)
  const [homeColor, setHomeColor] = useState("#fbbf24")
  const [awayColor, setAwayColor] = useState("#1d4ed8")
  const [showPlayerLabels, setShowPlayerLabels] = useState(true)
  const [showTemplates, setShowTemplates] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sideTab, setSideTab] = useState<"tools" | "background">("tools")
  const [textLayer, setTextLayer] = useState<"foreground" | "background">("foreground")
  const [selectedFormation, setSelectedFormation] = useState("4-3-3")

  /* ── Auth ── */
  const [authUser, setAuthUser] = useState<import("@supabase/supabase-js").User | null>(null)
  const [showAuth, setShowAuth] = useState(false)
  const [showMyBoards, setShowMyBoards] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const u = session?.user ?? null
      setAuthUser(u)
      if (u && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        const { data } = await supabase.from("profiles").select("id").eq("id", u.id).maybeSingle()
        if (!data) {
          const handle = (u.email ?? "user").split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase() || "user"
          await supabase.from("profiles").insert({ id: u.id, handle, display_name: "", bio: "" })
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const [saveError, setSaveError] = useState("")

  const saveBoard = async () => {
    if (!authUser) { setShowAuth(true); return }
    setSaveStatus("saving"); setSaveError("")
    const canvasData = { players, arrows, texts, shapes, images }
    const { error } = await supabase.from("boards").insert({
      user_id: authUser.id,
      title,
      canvas_data: canvasData,
    })
    if (error) {
      console.error("Save board error:", error)
      setSaveError(error.message)
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 6000)
    } else {
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
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
    kind: "player" | "text" | "image" | "arrowCp" | "arrowP1" | "arrowP2" | "resizeShape" | "resizeText" | "resizeImage" | "resizePlayer" | "resizePitch" | "zone"
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
  const svgXY = useCallback((e: React.MouseEvent | MouseEvent) => {
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
    window.addEventListener("mouseup", handleGlobalMouseUp)
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp)
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
    window.addEventListener("mouseup", handleZoneMouseUp)
    return () => window.removeEventListener("mouseup", handleZoneMouseUp)
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
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
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

  /* ── SVG mouse events ── */
  const onSVGMouseMove = useCallback((e: React.MouseEvent) => {
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
      const px = (x - PX) / pitchScaleRef.current
      const py = (y - PY) / pitchScaleRef.current
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
      const px = (x - PX) / pitchScaleRef.current
      const py = (y - PY) / pitchScaleRef.current
      setCustomZones(z => z.map(zone => zone.id === d.id ? { ...zone, x: px - d.ox, y: py - d.oy } : zone))
    }
    else if (d.kind === "resizePitch") {
      if (d.id === "pitch-tr" || d.id === "pitch-br") {
        // Right-side corners: scale from left anchor (PX)
        setPitchScale(Math.max(0.3, Math.min(2.5, (x - PX) / PW)))
      } else {
        // Left-side corners: right edge stays fixed, functional update avoids stale closure
        setPitchScale(prev => Math.max(0.3, Math.min(2.5, (PX + PW * prev - x) / PW)))
      }
    }
  }, [svgXY, shapeKind])

  const onSVGMouseUp = useCallback(() => {
    if (dragRef.current) { snapshot(); dragRef.current = null }
  }, [snapshot])

  const onSVGMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
    hasDraggedRef.current = false
    if (tool === "shape" && shapeKind !== "polygon") {
      const { x, y } = svgXY(e)
      shapeDrawRef.current = { x1: x, y1: y }
    }
    if (tool === "zone") {
      const { x, y } = svgXY(e)
      const px = (x - PX) / pitchScaleRef.current
      const py = (y - PY) / pitchScaleRef.current
      zoneDrawRef.current = { x: px, y: py }
    }
  }, [tool, shapeKind, svgXY])

  const onSVGClick = useCallback((e: React.MouseEvent) => {
    if (hasDraggedRef.current) return
    const { x, y } = svgXY(e)

    if (tool === "homePlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "Player", num: String(players.length + 1), ...HOME_COLORS, bg: homeColor, glow: false, scale: 1 }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id })
    } else if (tool === "awayPlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "Player", num: String(players.length + 1), ...AWAY_COLORS, bg: awayColor, glow: false, scale: 1 }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id })
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
  }, [tool, shapeKind, players.length, arrowDraft, polyDraft, shapes.length, textLayer, svgXY, snapshot])

  /* ── Canvas pan (alt+drag or middle mouse or pan tool) ── */
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.altKey && e.button === 0) || tool === "pan") {
      e.preventDefault()
      panDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY }
    }
  }
  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (panDragRef.current) {
      const d = panDragRef.current
      setPanX(d.startPanX + (e.clientX - d.startX))
      setPanY(d.startPanY + (e.clientY - d.startY))
    }
  }
  const onCanvasMouseUp = () => { panDragRef.current = null }

  /* ── Element drag starts ── */
  const startDrag = (e: React.MouseEvent, kind: "player" | "text" | "image", id: string, ex: number, ey: number) => {
    e.stopPropagation()
    if (tool !== "select") return
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
    setImages(d.images ?? []); setTitle(d.title ?? "TACTICAL ANALYSIS")
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
      style={{ fontFamily: "'Inter', sans-serif", background: "#0d1117", color: "#e6edf3" }}>

      {/* ── Top Header ── */}
      <header className="flex items-center gap-3 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#161b22", minHeight: 48 }}>
        {/* Logo + Workspace Mode Selector + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "#3fb950", color: "#0d1117", fontFamily: "'Barlow Condensed', sans-serif" }}>PS</div>
          <WorkspaceModeSelector mode={workspaceMode} onChange={m => {
            setWorkspaceMode(m)
            if (m === "report") { setCanvasMode("blank"); setBgColor("#f5f5f0"); setShowPitch(false) }
            else if (m === "brainstorm") { setCanvasMode("blank"); setBgColor("#0d1117"); setShowPitch(false) }
            else { setCanvasMode("full"); setBgColor("#0d1117"); setShowPitch(true) }
          }} />
          <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: "rgba(255,255,255,0.12)" }} />
          {editingTitle ? (
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => { if (e.key === "Enter") setEditingTitle(false) }}
              className="bg-transparent outline-none font-bold text-sm"
              style={{ borderBottom: "1px solid #3fb950", color: "#e6edf3", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", width: 180 }} />
          ) : (
            <span className="font-bold text-sm cursor-pointer hover:opacity-70 truncate max-w-40"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em" }}
              onClick={() => setEditingTitle(true)}>{title}</span>
          )}
        </div>

        <div className="flex-1 flex items-center gap-2 justify-center">
          {/* Rotation control */}
          <div className="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: "#21262d" }}>
            <RefreshCw size={13} style={{ color: "#8b949e" }} />
            <input type="range" min={0} max={360} value={rotation}
              onChange={e => handleRotation(+e.target.value)}
              className="w-24 accent-green-400" style={{ height: 4 }} />
            <span className="text-xs font-mono w-8 text-right" style={{ color: "#c9d1d9" }}>{Math.round(rotation)}°</span>
            <button onClick={() => setSnapRot(s => !s)} title="Snap rotation"
              className="p-0.5 rounded transition-colors"
              style={{ color: snapRot ? "#fbbf24" : "#8b949e" }}>
              <Magnet size={13} />
            </button>
            <button onClick={() => setRotation(0)} title="Reset rotation"
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              style={{ color: "#8b949e" }}>
              <RotateCcw size={13} />
            </button>
          </div>

          {/* 3D toggle */}
          <button onClick={() => setView3d(v => !v)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
            style={{ background: view3d ? "#3fb950" : "#21262d", color: view3d ? "#0d1117" : "#c9d1d9" }}>
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
            <button onClick={saveBoard}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{
                background: saveStatus === "saved" ? "#3fb950" : saveStatus === "error" ? "#f85149" : "#238636",
                color: "#ffffff",
                opacity: saveStatus === "saving" ? 0.7 : 1,
              }}>
              {saveStatus === "saved" ? <Check size={13} /> : saveStatus === "error" ? <AlertCircle size={13} /> : <Save size={13} />}
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved!" : saveStatus === "error" ? "Save failed" : "Save"}
            </button>
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
                style={{ background: "#1c2128", borderColor: "rgba(255,255,255,0.1)" }}>
                <button onClick={() => supabase.auth.signOut()}
                  className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/10 transition-colors text-left"
                  style={{ color: "#f85149" }}>
                  <LogOut size={12} /> Sign Out
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold transition-colors"
              style={{ background: "#21262d", color: "#c9d1d9" }}>
              <LogIn size={13} /> Sign In
            </button>
          )}
          {/* Undo/Redo */}
          <button onClick={undo} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Undo (Ctrl+Z)"><RotateCcw size={14} /></button>
          <button onClick={redo} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Redo"><RotateCw size={14} /></button>
          {/* Clear All */}
          <button
            onClick={() => {
              if (!window.confirm("Clear everything on the canvas? This cannot be undone.")) return
              snapshot()
              setPlayers([]); setArrows([]); setTexts([])
              setShapes([]); setImages([]); setCustomZones([])
              setSel(null)
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium transition-colors hover:bg-red-500/20"
            style={{ color: "#f85149" }}
            title="Clear all canvas elements">
            <Trash2 size={13} /> Clear All
          </button>
          {/* Export */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold"
              style={{ background: "#58a6ff", color: "#0d1117" }}>
              <Download size={13} /> Export <ChevronDown size={11} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-28 rounded shadow-xl border z-50 hidden group-hover:flex flex-col"
              style={{ background: "#1c2128", borderColor: "rgba(255,255,255,0.1)" }}>
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
        {/* ── Left Sidebar ── */}
        <aside className="w-72 flex flex-col border-r overflow-y-auto flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "#161b22" }}>
          {/* Tab bar */}
          <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {(["tools", "background"] as const).map(t => (
              <button key={t} onClick={() => setSideTab(t)}
                className="flex-1 py-2 text-xs font-semibold uppercase transition-colors"
                style={{
                  letterSpacing: "0.07em",
                  borderBottom: sideTab === t ? "2px solid #3fb950" : "2px solid transparent",
                  color: sideTab === t ? "#3fb950" : "#8b949e",
                }}>
                {t}
              </button>
            ))}
          </div>

          {sideTab === "tools" && (
            <>
              {/* Global Team Colors */}
              <div className="p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Team Options</p>
                <div className="flex gap-4 mb-3">
                  <div className="flex-1">
                    <ColorPicker label="Home Color" colors={PALETTE.slice(0, 5)} selected={homeColor} onSelect={c => {
                      setHomeColor(c)
                      setPlayers(prev => prev.map(p => p.bg === homeColor || p.bg === HOME_COLORS.bg ? { ...p, bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" } : p))
                    }} />
                  </div>
                  <div className="flex-1">
                    <ColorPicker label="Away Color" colors={PALETTE.slice(2, 7)} selected={awayColor} onSelect={c => {
                      setAwayColor(c)
                      setPlayers(prev => prev.map(p => p.bg === awayColor || p.bg === AWAY_COLORS.bg ? { ...p, bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" } : p))
                    }} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={showPlayerLabels} onChange={e => setShowPlayerLabels(e.target.checked)} className="accent-green-400" />
                  <span style={{ color: "#c9d1d9" }}>Show Player Names/Numbers</span>
                </label>
              </div>

              {/* Tool grid */}
              <div className="p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                <div className="grid grid-cols-2 gap-1.5">
                  {([
                    { id: "select", icon: <MousePointer2 size={15} />, label: "Select" },
                    { id: "pan", icon: <Move size={15} />, label: "Pan" },
                    { id: "homePlayer", icon: <UserPlus size={15} />, label: "Home" },
                    { id: "awayPlayer", icon: <UserPlus size={15} />, label: "Away" },
                    { id: "arrow", icon: <ArrowUpRight size={15} />, label: "Arrow" },
                    { id: "text", icon: <Type size={15} />, label: "Text" },
                  ] as { id: Tool; icon: React.ReactNode; label: string }[]).map(t => (
                    <button key={t.id} onClick={() => { setTool(t.id); setArrowDraft(null); setPolyDraft(null); shapeDrawRef.current = null; setShapeDraftPreview(null) }}
                      className="flex flex-col items-center gap-1 py-2 rounded text-xs font-medium transition-colors"
                      style={{ background: tool === t.id ? "#3fb950" : "#21262d", color: tool === t.id ? "#0d1117" : "#c9d1d9" }}>
                      {t.icon}<span>{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* Shape tool with sub-kinds */}
                <div className="mt-1.5">
                  <button onClick={() => { setTool("shape"); setArrowDraft(null); setPolyDraft(null) }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-colors"
                    style={{ background: tool === "shape" ? "#3fb950" : "#21262d", color: tool === "shape" ? "#0d1117" : "#c9d1d9" }}>
                    <Pentagon size={15} /> Shapes
                  </button>
                  {tool === "shape" && (
                    <div className="flex gap-1 mt-1.5">
                      {([
                        { k: "polygon" as ShapeKind, icon: <Pentagon size={13} />, tip: "Polygon" },
                        { k: "rect" as ShapeKind, icon: <Square size={13} />, tip: "Rectangle" },
                        { k: "circle" as ShapeKind, icon: <Circle size={13} />, tip: "Circle" },
                        { k: "ellipse" as ShapeKind, icon: <Circle size={13} style={{ transform: "scaleX(1.4)" }} />, tip: "Ellipse" },
                      ]).map(({ k, icon, tip }) => (
                        <button key={k} onClick={() => setShapeKind(k)} title={tip}
                          className="flex-1 flex items-center justify-center py-1.5 rounded text-xs transition-colors"
                          style={{ background: shapeKind === k ? "#fbbf24" : "#2d333b", color: shapeKind === k ? "#0d1117" : "#c9d1d9" }}>
                          {icon}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Image upload */}
                <div className="mt-1.5">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded text-xs font-medium transition-colors"
                    style={{ background: "#21262d", color: "#c9d1d9" }}>
                    <ImagePlus size={15} /> Upload Image
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </div>
              </div>

              {/* Text layer toggle */}
              {tool === "text" && (
                <div className="px-3 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <p className="text-xs mb-1.5" style={{ color: "#8b949e" }}>Place text in</p>
                  <div className="flex gap-1.5">
                    {(["foreground", "background"] as const).map(l => (
                      <button key={l} onClick={() => setTextLayer(l)}
                        className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                        style={{ background: textLayer === l ? "#58a6ff" : "#21262d", color: textLayer === l ? "#0d1117" : "#c9d1d9" }}>
                        {l === "foreground" ? "In Front" : "Behind Pitch"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Hint */}
              <div className="px-3 py-2 text-xs border-b" style={{ borderColor: "rgba(255,255,255,0.08)", color: "#8b949e" }}>
                {tool === "select" && "Click to select. Drag to move. Del to remove."}
                {tool === "pan" && "Drag canvas to pan. Or Alt+drag in any mode."}
                {tool === "homePlayer" && "Click anywhere on the canvas to place a home player."}
                {tool === "awayPlayer" && "Click anywhere on the canvas to place an away player."}
                {tool === "arrow" && !arrowDraft && "Click to set arrow start point."}
                {tool === "arrow" && arrowDraft && "Click to set end. Drag handle to curve."}
                {tool === "text" && "Click anywhere on the canvas to place annotation."}
                {tool === "shape" && shapeKind === "polygon" && (!polyDraft ? "Click to draw polygon. Double-click to close." : `${polyDraft.length} points — double-click to close.`)}
                {tool === "shape" && shapeKind !== "polygon" && "Click-drag to draw shape."}
                <div className="mt-1 opacity-60">Scroll = zoom · Alt+drag = pan</div>
              </div>

              {/* Arrow pre-draw style picker — shown when arrow tool active, nothing drawn yet */}
              {tool === "arrow" && !sel && (
                <div className="px-3 py-3 border-b flex flex-col gap-2.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Arrow Style</p>
                  {/* Line style */}
                  <div>
                    <p className="text-xs mb-1.5" style={{ color: "#8b949e" }}>Line</p>
                    <div className="flex gap-1.5">
                      {(["none", "dashed", "dotted"] as const).map(d => (
                        <button key={d} onClick={() => setArrowDefaultDash(d)}
                          className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                          style={{ background: arrowDefaultDash === d ? "#3fb950" : "#21262d", color: arrowDefaultDash === d ? "#0d1117" : "#c9d1d9" }}>
                          {d === "none" ? "—" : d === "dashed" ? "- -" : "···"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Color */}
                  <ColorPicker label="Color" colors={PALETTE} selected={arrowDefaultColor} onSelect={setArrowDefaultColor} />
                  {/* Width */}
                  <label className="flex flex-col gap-1">
                    <span className="text-xs" style={{ color: "#8b949e" }}>Width {arrowDefaultW}px</span>
                    <input type="range" min={1} max={8} value={arrowDefaultW}
                      onChange={e => setArrowDefaultW(+e.target.value)} className="w-full accent-green-400" />
                  </label>
                  <p className="text-xs" style={{ color: "#8b949e" }}>
                    {arrowDraft ? "Click to place end point. Drag yellow handle to curve." : "Click on canvas to start drawing."}
                  </p>
                </div>
              )}

              {/* Properties */}
              {sel && (
                <div className="p-3 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Properties</p>
                    <button onClick={deleteSelected} className="p-1 rounded hover:bg-red-500/20 transition-colors" style={{ color: "#f85149" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* PLAYER */}
                  {selP && (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Name</span>
                        <input value={selP.name} onChange={e => updP({ name: e.target.value })}
                          className="rounded px-2 py-1 text-xs outline-none"
                          style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Number</span>
                        <input value={selP.num} onChange={e => updP({ num: e.target.value })}
                          className="rounded px-2 py-1 text-xs outline-none"
                          style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </label>
                      <ColorPicker label="Kit color" colors={PALETTE} selected={selP.bg}
                        onSelect={c => updP({ bg: c, fg: c === "#ffffff" || c === "#fbbf24" ? "#000000" : "#ffffff" })} />
                      <ColorPicker label="Ring color" colors={PALETTE} selected={selP.ring} onSelect={c => updP({ ring: c })} allowTransparent={true} />
                      <label className="flex items-center gap-2 text-xs cursor-pointer mt-1">
                        <input type="checkbox" checked={selP.glow || false} onChange={e => updP({ glow: e.target.checked })} className="accent-green-400" />
                        <span style={{ color: "#c9d1d9" }}>Glow Highlight</span>
                      </label>
                    </div>
                  )}

                  {/* ARROW */}
                  {selA && (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Label</span>
                        <input value={selA.label} onChange={e => updA({ label: e.target.value })}
                          className="rounded px-2 py-1 text-xs outline-none"
                          style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </label>
                      <ColorPicker label="Color" colors={PALETTE} selected={selA.color} onSelect={c => updA({ color: c })} />
                      <div>
                        <p className="text-xs mb-1" style={{ color: "#8b949e" }}>Style</p>
                        <div className="flex gap-1">
                          {(["none","dashed","dotted"] as const).map(s => (
                            <button key={s} onClick={() => updA({ dash: s })}
                              className="flex-1 py-1 rounded text-xs font-medium transition-colors"
                              style={{ background: selA.dash === s ? "#3fb950" : "#21262d", color: selA.dash === s ? "#0d1117" : "#c9d1d9" }}>
                              {s === "none" ? "Solid" : s === "dashed" ? "Dashed" : "Dotted"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Width {selA.strokeW}px</span>
                        <input type="range" min={1} max={8} value={selA.strokeW}
                          onChange={e => updA({ strokeW: +e.target.value })} className="w-full accent-green-400" />
                      </label>
                      <div className="flex justify-between items-center mt-1">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={selA.twoWay} onChange={e => updA({ twoWay: e.target.checked })} className="accent-green-400" />
                          <span style={{ color: "#c9d1d9" }}>Two-way</span>
                        </label>
                        <button onClick={() => {
                          // offset control point perpendicularly from the midpoint
                          const mx = (selA.x1 + selA.x2) / 2
                          const my = (selA.y1 + selA.y2) / 2
                          const dx = selA.x2 - selA.x1
                          const dy = selA.y2 - selA.y1
                          const len = Math.sqrt(dx * dx + dy * dy) || 1
                          // perpendicular unit vector, offset by 20% of arrow length
                          const offset = len * 0.25
                          updA({ cpx: mx - (dy / len) * offset, cpy: my + (dx / len) * offset })
                        }} className="px-2 py-1 bg-[#21262d] rounded text-xs text-[#c9d1d9] hover:bg-[#3fb950] hover:text-[#0d1117]">
                          Curve
                        </button>
                      </div>
                      <p className="text-[10px] italic text-[#8b949e] mt-1">Drag the yellow handle on the arrow to curve it manually.</p>
                    </div>
                  )}

                  {/* TEXT */}
                  {selT && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-1.5">
                        <button onClick={() => updT({ noBox: false, bg: "rgba(13,17,23,0.85)", border: "#58a6ff" })}
                          className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                          style={{ background: !selT.noBox ? "#58a6ff" : "#21262d", color: !selT.noBox ? "#0d1117" : "#c9d1d9" }}>
                          ▣ With Box
                        </button>
                        <button onClick={() => updT({ noBox: true, bg: "transparent", border: "transparent" })}
                          className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                          style={{ background: selT.noBox ? "#58a6ff" : "#21262d", color: selT.noBox ? "#0d1117" : "#c9d1d9" }}>
                          T Free Text
                        </button>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Text (dbl-click to edit)</span>
                        <textarea value={selT.text} rows={3} onChange={e => updT({ text: e.target.value })}
                          className="rounded px-2 py-1 text-xs outline-none resize-none"
                          style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Font size {selT.size}px</span>
                        <input type="range" min={10} max={48} value={selT.size}
                          onChange={e => updT({ size: +e.target.value })} className="w-full accent-green-400" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Width {selT.width}px</span>
                        <input type="range" min={80} max={500} value={selT.width}
                          onChange={e => updT({ width: +e.target.value })} className="w-full accent-green-400" />
                      </label>
                      <ColorPicker label="Text color" colors={PALETTE} selected={selT.fg} onSelect={c => updT({ fg: c })} />
                      <ColorPicker label="Background color" colors={PALETTE} selected={selT.bg} onSelect={c => updT({ bg: c })} allowTransparent={true} />
                      <ColorPicker label="Border color" colors={PALETTE} selected={selT.border} onSelect={c => updT({ border: c })} allowTransparent={true} />
                      <div className="flex gap-2">
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked={selT.bold} onChange={e => updT({ bold: e.target.checked })} className="accent-green-400" />
                          <span style={{ color: "#c9d1d9" }}>Bold</span>
                        </label>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked={selT.dash} onChange={e => updT({ dash: e.target.checked })} className="accent-green-400" />
                          <span style={{ color: "#c9d1d9" }}>Dashed</span>
                        </label>
                      </div>
                      <div>
                        <p className="text-xs mb-1" style={{ color: "#8b949e" }}>Layer</p>
                        <div className="flex gap-1">
                          {(["foreground","background"] as const).map(l => (
                            <button key={l} onClick={() => updT({ layer: l })}
                              className="flex-1 py-1 rounded text-xs transition-colors"
                              style={{ background: selT.layer === l ? "#58a6ff" : "#21262d", color: selT.layer === l ? "#0d1117" : "#c9d1d9" }}>
                              {l === "foreground" ? "Front" : "Behind"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SHAPE */}
                  {selS && (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Label</span>
                        <input value={selS.label} onChange={e => updS({ label: e.target.value })}
                          className="rounded px-2 py-1 text-xs outline-none"
                          style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }} />
                      </label>
                      <ColorPicker label="Fill" colors={SHAPE_FILLS} selected={selS.fill} onSelect={c => updS({ fill: c })} />
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Opacity {Math.round(selS.fillOpacity * 100)}%</span>
                        <input type="range" min={5} max={95} value={Math.round(selS.fillOpacity * 100)}
                          onChange={e => updS({ fillOpacity: +e.target.value / 100 })} className="w-full accent-green-400" />
                      </label>
                      <ColorPicker label="Border" colors={PALETTE} selected={selS.stroke} onSelect={c => updS({ stroke: c })} />
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Border width {selS.strokeW}px</span>
                        <input type="range" min={1} max={6} value={selS.strokeW}
                          onChange={e => updS({ strokeW: +e.target.value })} className="w-full accent-green-400" />
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={selS.strokeDash} onChange={e => updS({ strokeDash: e.target.checked })} className="accent-green-400" />
                        <span style={{ color: "#c9d1d9" }}>Dashed border</span>
                      </label>
                    </div>
                  )}

                  {/* IMAGE */}
                  {selI && (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Width {Math.round(selI.width)}px</span>
                        <input type="range" min={50} max={CW} value={selI.width}
                          onChange={e => {
                            const w = +e.target.value
                            const h = w * (selI.naturalH / selI.naturalW)
                            updI({ width: w, height: h })
                          }} className="w-full accent-green-400" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Opacity {Math.round(selI.opacity * 100)}%</span>
                        <input type="range" min={10} max={100} value={Math.round(selI.opacity * 100)}
                          onChange={e => updI({ opacity: +e.target.value / 100 })} className="w-full accent-green-400" />
                      </label>
                      <div>
                        <p className="text-xs mb-1" style={{ color: "#8b949e" }}>Layer</p>
                        <div className="flex gap-1">
                          {(["background","overlay"] as const).map(l => (
                            <button key={l} onClick={() => {
                              if (l === "background") {
                                updI({ layer: l, x: 0, y: 0, width: CW, height: CH })
                              } else {
                                updI({ layer: l })
                              }
                            }}
                              className="flex-1 py-1 rounded text-xs transition-colors"
                              style={{ background: selI.layer === l ? "#58a6ff" : "#21262d", color: selI.layer === l ? "#0d1117" : "#c9d1d9" }}>
                              {l === "background" ? "Behind Pitch" : "Over Pitch"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {selI.layer === "background" && (
                        <p className="text-xs" style={{ color: "#8b949e" }}>
                          Background image fills the full canvas. Hide pitch markings for a clean photo overlay.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Activate Zones ── */}
              {!sel && (
                <div className="p-3 border-t flex flex-col gap-3" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Activate Zones</p>

                  {/* 18 Zones toggle */}
                  <button
                    onClick={() => setShow18Zones(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-semibold transition-colors"
                    style={{
                      background: show18Zones ? "rgba(249,115,22,0.15)" : "#21262d",
                      borderColor: show18Zones ? "#f97316" : "rgba(255,255,255,0.1)",
                      color: show18Zones ? "#f97316" : "#c9d1d9",
                    }}>
                    <span>⬛ Activate 18 Zones</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                      style={{ background: show18Zones ? "#f97316" : "#30363d", color: show18Zones ? "#fff" : "#8b949e", fontSize: 10 }}>
                      {show18Zones ? "ON" : "OFF"}
                    </span>
                  </button>

                  {/* 5 Lanes toggle */}
                  <button
                    onClick={() => setShowLanes(v => !v)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-semibold transition-colors"
                    style={{
                      background: showLanes ? "rgba(249,115,22,0.15)" : "#21262d",
                      borderColor: showLanes ? "#f97316" : "rgba(255,255,255,0.1)",
                      color: showLanes ? "#f97316" : "#c9d1d9",
                    }}>
                    <span>≡ Activate Lanes</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                      style={{ background: showLanes ? "#f97316" : "#30363d", color: showLanes ? "#fff" : "#8b949e", fontSize: 10 }}>
                      {showLanes ? "ON" : "OFF"}
                    </span>
                  </button>

                  {/* Custom zone draw */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Custom Zones</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {["#3fb950","#f97316","#58a6ff","#f85149","#fbbf24","#c084fc","#34d399","#ffffff"].map(c => (
                        <button key={c} onClick={() => setZoneColor(c)}
                          className="w-6 h-6 rounded border-2 transition-transform hover:scale-110 flex-shrink-0"
                          style={{ background: c, borderColor: zoneColor === c ? "#fff" : "transparent" }} />
                      ))}
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: "#8b949e" }}>Fill opacity {Math.round(zoneOpacity * 100)}%</span>
                      <input type="range" min={5} max={80} value={Math.round(zoneOpacity * 100)}
                        onChange={e => setZoneOpacity(+e.target.value / 100)} className="w-full accent-orange-400" />
                    </label>
                    <button
                      onClick={() => { setTool("zone"); setSel(null) }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors"
                      style={{ background: tool === "zone" ? "#f97316" : "#21262d", color: tool === "zone" ? "#fff" : "#c9d1d9", border: `1px solid ${tool === "zone" ? "#f97316" : "rgba(255,255,255,0.1)"}` }}>
                      {tool === "zone" ? "🖊 Drawing zone…" : "+ Draw Custom Zone"}
                    </button>
                    {tool === "zone" && (
                      <p className="text-xs text-center" style={{ color: "#8b949e" }}>
                        Click-drag on the pitch to draw a zone. Press Esc to cancel.
                      </p>
                    )}
                    {customZones.length > 0 && (
                      <button onClick={() => { setCustomZones([]); setSel(null) }}
                        className="w-full py-1 rounded text-xs transition-colors hover:bg-red-500/20"
                        style={{ color: "#f85149" }}>
                        Clear all zones ({customZones.length})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Zone properties panel when a zone is selected */}
              {sel?.kind === "zone" && (() => {
                const z = customZones.find(x => x.id === sel.id)
                if (!z) return null
                const updZ = (patch: Partial<CustomZone>) =>
                  setCustomZones(zones => zones.map(x => x.id === sel.id ? { ...x, ...patch } : x))
                return (
                  <div className="p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Zone Properties</p>
                      <button onClick={deleteSelected} className="p-1 rounded hover:bg-red-500/20" style={{ color: "#f85149" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: "#8b949e" }}>Label</span>
                      <input value={z.label} onChange={e => updZ({ label: e.target.value })}
                        placeholder="e.g. Press zone"
                        className="rounded px-2 py-1 text-xs outline-none"
                        style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }} />
                    </label>
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: "#8b949e" }}>Color</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {["#3fb950","#f97316","#58a6ff","#f85149","#fbbf24","#c084fc","#34d399","#ffffff"].map(c => (
                          <button key={c} onClick={() => updZ({ color: c })}
                            className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                            style={{ background: c, borderColor: z.color === c ? "#fff" : "transparent" }} />
                        ))}
                      </div>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs" style={{ color: "#8b949e" }}>Opacity {Math.round(z.opacity * 100)}%</span>
                      <input type="range" min={5} max={80} value={Math.round(z.opacity * 100)}
                        onChange={e => updZ({ opacity: +e.target.value / 100 })} className="w-full accent-orange-400" />
                    </label>
                  </div>
                )
              })()}

              {/* Quick formation */}
              {!sel && (
                <div className="p-3 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Quick Add Formation</p>
                  <select
                    value={selectedFormation}
                    onChange={e => setSelectedFormation(e.target.value)}
                    className="w-full rounded px-2 py-1.5 text-xs outline-none mb-2"
                    style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {FORMATIONS.map(f => (
                      <option key={f.name} value={f.name}>{f.name} — {f.description}</option>
                    ))}
                  </select>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => addFormation(selectedFormation, "home")}
                      className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                      style={{ background: "#fbbf24", color: "#000000" }}>
                      + Home
                    </button>
                    <button
                      onClick={() => addFormation(selectedFormation, "away")}
                      className="flex-1 py-1.5 rounded text-xs font-semibold transition-colors"
                      style={{ background: "#1d4ed8", color: "#ffffff" }}>
                      + Away
                    </button>
                  </div>
                  <div className="flex gap-1 mt-1.5">
                    <ChevronRight size={11} style={{ color: "#8b949e", flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: "#8b949e" }}>
                      Elements can be placed anywhere on canvas — in margins too.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {sideTab === "background" && (
            <div className="p-3 flex flex-col gap-4">
              {/* BG Color */}
              <div>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Canvas Color</p>
                {/* Full color picker + hex input */}
                <div className="flex items-center gap-2 mb-3">
                  <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer"
                    style={{ padding: 2, border: "1px solid rgba(255,255,255,0.15)", background: "transparent" }} />
                  <input type="text" value={bgColor}
                    onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setBgColor(e.target.value) }}
                    className="flex-1 rounded px-2 py-1 text-xs font-mono outline-none"
                    style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }} />
                </div>
                {/* Presets */}
                <p className="text-xs mb-1.5" style={{ color: "#8b949e" }}>Presets</p>
                <div className="flex flex-wrap gap-1.5">
                  {BG_PRESETS.map(c => (
                    <button key={c} onClick={() => setBgColor(c)}
                      className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                      style={{ background: c, borderColor: bgColor === c ? "#3fb950" : "rgba(255,255,255,0.15)" }} />
                  ))}
                </div>
              </div>

              {/* Canvas Mode */}
              <div>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Canvas Mode</p>
                <div className="flex flex-col gap-2 mb-3">
                  {(["full", "half", "blank"] as const).map(mode => (
                    <button key={mode} onClick={() => setCanvasMode(mode)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-colors text-left"
                      style={{ background: canvasMode === mode ? "#3fb950" : "#21262d", color: canvasMode === mode ? "#0d1117" : "#c9d1d9" }}>
                      {mode === "full" ? "Full Pitch" : mode === "half" ? "Half Pitch (Vertical)" : "Blank Whiteboard / Custom"}
                    </button>
                  ))}
                </div>
                {canvasMode !== "blank" && (
                  <>
                    <p className="text-xs font-semibold uppercase mb-2 mt-4" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Pitch Color</p>
                    <div className="flex gap-2">
                      <button onClick={() => setPitchColor("green")}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition-colors"
                        style={{ background: pitchColor === "green" ? "#3fb950" : "#21262d", color: pitchColor === "green" ? "#0d1117" : "#c9d1d9" }}>
                        Green Grass
                      </button>
                      <button onClick={() => setPitchColor("white")}
                        className="flex-1 py-1.5 rounded text-xs font-medium transition-colors border"
                        style={{ background: pitchColor === "white" ? "#ffffff" : "#21262d", color: pitchColor === "white" ? "#0d1117" : "#c9d1d9", borderColor: "rgba(255,255,255,0.1)" }}>
                        White Lines
                      </button>
                    </div>
                  </>
                )}
                <p className="text-xs mt-3" style={{ color: "#8b949e" }}>
                  Hide pitch markings when using a live game background photo.
                </p>
              </div>

              {/* Pitch size */}
              {canvasMode !== "blank" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Pitch Size</p>
                    <button onClick={() => setPitchScale(1)}
                      className="text-xs px-2 py-0.5 rounded hover:bg-white/10 transition-colors"
                      style={{ color: "#8b949e" }}>Reset</button>
                  </div>
                  <input type="range" min={30} max={200} value={Math.round(pitchScale * 100)}
                    onChange={e => setPitchScale(+e.target.value / 100)}
                    className="w-full accent-green-400" />
                  <p className="text-xs mt-1" style={{ color: "#8b949e" }}>
                    {Math.round(pitchScale * 100)}% — or drag the yellow handles on the pitch edges
                  </p>
                </div>
              )}

              {/* Canvas info */}
              <div>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Canvas Info</p>
                <div className="rounded p-2 text-xs" style={{ background: "#21262d", color: "#8b949e" }}>
                  <p>Canvas: {CW} × {CH}px</p>
                  <p>Pitch: {PW} × {PH}px</p>
                  <p>Offset: ({PX}, {PY})</p>
                  <p className="mt-1 text-xs opacity-70">Elements can be placed anywhere, including margins outside the pitch.</p>
                </div>
              </div>

              {/* Uploaded images info */}
              {images.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>
                    Images ({images.length})
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {images.map(img => (
                      <div key={img.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs"
                        style={{ background: "#21262d", border: sel?.id === img.id ? "1px solid #3fb950" : "1px solid transparent" }}>
                        <span style={{ color: "#c9d1d9" }} className="truncate">
                          {img.layer === "background" ? "BG Image" : "Overlay"}
                        </span>
                        <button onClick={() => {
                          snapshot()
                          setImages(i => i.filter(x => x.id !== img.id))
                        }} className="p-0.5 rounded hover:bg-red-500/20 ml-1 flex-shrink-0" style={{ color: "#f85149" }}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Main Canvas ── */}
        <main
          ref={canvasRef}
          className="flex-1 overflow-hidden relative flex items-center justify-center"
          style={{
            background: bgColor,
            cursor: tool === "pan" ? "grab" : panDragRef.current ? "grabbing" : "default",
          }}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
        >
          {/* Pitch + all layers */}
          <div style={{ transform: pitchTransform, transformOrigin: "center center" }}>
            <div style={{ transform: pitchInnerTransform, transformOrigin: "center center", transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1)" }}>
              <div ref={pitchRef} style={{ position: "relative" }}>
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${CW} ${CH}`}
                  width={SVG_DISPLAY_W}
                  style={{ display: "block", userSelect: "none", aspectRatio: `${CW}/${CH}` }}
                  onMouseMove={onSVGMouseMove}
                  onMouseUp={onSVGMouseUp}
                  onMouseDown={onSVGMouseDown}
                  onClick={onSVGClick}
                >
                  {/* 1. Canvas background */}
                  <rect x={0} y={0} width={CW} height={CH} fill={bgColor} />

                  {/* 2. Background images (full-canvas fill) */}
                  {bgImages.map(img => (
                    <image key={img.id} href={img.src}
                      x={0} y={0} width={CW} height={CH}
                      opacity={img.opacity} preserveAspectRatio="xMidYMid slice"
                      onMouseDown={e => startDrag(e, "image", img.id, img.x, img.y)}
                      style={{ cursor: tool === "select" ? "move" : "default" }} />
                  ))}

                  {/* 3. Background texts (behind pitch, in margins) */}
                  {bgTexts.map(t => (
                    <TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      startResize={(e) => { e.stopPropagation(); dragRef.current = { kind: "resizeText", id: t.id, ox: 0, oy: 0 } }}
                      setSel={setSel} tool={tool} updT={updT} />
                  ))}

                  {/* 4. Pitch group (translated to canvas offset) */}
                  {canvasMode !== "blank" && (
                    <g transform={`translate(${PX},${PY}) scale(${pitchScale})`}>
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
                              onMouseDown={e => {
                                if (tool !== "select") return
                                e.stopPropagation()
                                const svgPt = svgXY(e)
                                const px = (svgPt.x - PX) / pitchScaleRef.current
                                const py = (svgPt.y - PY) / pitchScaleRef.current
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

                  {/* Pitch resize handles — 4 corner squares, only in select mode */}
                  {canvasMode !== "blank" && showPitch && tool === "select" && (() => {
                    const pR = PX + PW * pitchScale
                    const pB = PY + PH * pitchScale
                    const hS = 10 // handle half-size
                    const corners = [
                      { id: "pitch-tl", x: PX,  y: PY,  cursor: "nwse-resize" },
                      { id: "pitch-tr", x: pR,   y: PY,  cursor: "nesw-resize" },
                      { id: "pitch-bl", x: PX,   y: pB,  cursor: "nesw-resize" },
                      { id: "pitch-br", x: pR,   y: pB,  cursor: "nwse-resize" },
                    ]
                    return corners.map(c => (
                      <g key={c.id} style={{ cursor: c.cursor }}
                        onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizePitch", id: c.id, ox: 0, oy: 0 } }}>
                        <rect x={c.x - hS} y={c.y - hS} width={hS * 2} height={hS * 2} rx={3}
                          fill="#fbbf24" stroke="#0d1117" strokeWidth={2} />
                      </g>
                    ))
                  })()}

                  <defs>
                    <clipPath id="half-pitch-clip">
                      <rect x={0} y={0} width={PW / 2} height={PH} />
                    </clipPath>
                  </defs>

                  {/* 5. Shapes */}
                  {shapes.map(s => (
                    <g key={s.id}
                      onClick={e => { e.stopPropagation(); if (tool === "select") setSel({ kind: "shape", id: s.id }) }}
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
                            onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizeShape", id: s.id, ox: 0, oy: 0 } }} />
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
                        onClick={e => { e.stopPropagation(); if (tool === "select") setSel({ kind: "arrow", id: a.id }) }}
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
                              onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowP1", id: a.id, ox: 0, oy: 0 } }} />
                            <circle cx={a.x2} cy={a.y2} r={7} fill="#3fb950" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "grab" }}
                              onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowP2", id: a.id, ox: 0, oy: 0 } }} />
                            <circle cx={a.cpx} cy={a.cpy} r={6} fill="#fbbf24" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "grab" }}
                              onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: "arrowCp", id: a.id, ox: 0, oy: 0 } }} />
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
                      <circle cx={arrowDraft.x1} cy={arrowDraft.y1} r={6} fill="#3fb950" />
                      <polygon points={arrowHead(mouse.x, mouse.y,
                        (arrowDraft.x1 + mouse.x) / 2, (arrowDraft.y1 + mouse.y) / 2, 14)}
                        fill={arrowDefaultColor} fillOpacity={0.65} />
                    </g>
                  )}

                  {/* 10. Foreground texts (on top of everything) */}
                  {fgTexts.map(t => (
                    <TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      startResize={(e) => { e.stopPropagation(); dragRef.current = { kind: "resizeText", id: t.id, ox: 0, oy: 0 } }}
                      setSel={setSel} tool={tool} updT={updT} />
                  ))}

                  {/* 11. Players */}
                  {players.map(p => {
                    const isSelected = sel?.id === p.id
                    const s = p.scale || 1
                    const r = 28 * s
                    const nameUpper = p.name.toUpperCase()
                    // Pill always grows to fit the FULL name — no truncation ever
                    // 6.2 SVG units per char is accurate for Barlow Condensed 10px in this viewBox
                    const pillW = Math.max(r * 2, nameUpper.length * 6.2 + 14)
                    const pillH = 17
                    const numFontSize = Math.min(15 * s, r * 0.58)
                    return (
                      <g key={p.id} transform={`translate(${p.x},${p.y})`}
                        onMouseDown={e => startDrag(e, "player", p.id, p.x, p.y)}
                        style={{ cursor: tool === "select" ? "grab" : "default" }}>
                        {p.glow && (
                          <circle r={r + 15} fill="#fbbf24" fillOpacity={0.4} filter="blur(8px)" />
                        )}
                        {/* Drop shadow */}
                        <circle r={r + 1} fill="rgba(0,0,0,0.45)" cx={1.5} cy={2.5} />
                        {/* Selection ring + resize handle at bottom-right of circle */}
                        {isSelected && (
                          <>
                            <circle r={r + 7} fill="none" stroke="#3fb950" strokeWidth={2.5} strokeDasharray="5,3" />
                            <circle cx={r * 0.707} cy={r * 0.707} r={6}
                              fill="#fbbf24" stroke="#0d1117" strokeWidth={1.5} style={{ cursor: "nwse-resize" }}
                              onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizePlayer", id: p.id, ox: 0, oy: 0 } }} />
                          </>
                        )}
                        {/* Main circle */}
                        <circle r={r} fill={p.bg} stroke={p.ring} strokeWidth={3 * s} />
                        {/* Number — capped font so it never overflows the circle */}
                        {showPlayerLabels && (
                          <text textAnchor="middle" dominantBaseline="central" y={-1}
                            fill={p.fg} fontSize={numFontSize} fontWeight="800"
                            style={{ fontFamily: "'Barlow Condensed',sans-serif", pointerEvents: "none" }}>
                            {p.num.slice(0, 4)}
                          </text>
                        )}
                        {/* Name pill — grows to fit full name, never truncates */}
                        {showPlayerLabels && (
                          <>
                            <rect x={-pillW / 2} y={r + 4} width={pillW} height={pillH} rx={3} fill="rgba(0,0,0,0.78)" />
                            <text textAnchor="middle" x={0} y={r + 4 + pillH * 0.68}
                              fill="#ffffff" fontSize={10} fontWeight="700"
                              style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.05em", pointerEvents: "none" }}>
                              {nameUpper}
                            </text>
                          </>
                        )}
                      </g>
                    )
                  })}

                  {/* 12. Overlay images */}
                  {ovImages.map(img => (
                    <image key={img.id} href={img.src}
                      x={img.x} y={img.y} width={img.width} height={img.height}
                      opacity={img.opacity} preserveAspectRatio="xMidYMid meet"
                      onMouseDown={e => startDrag(e, "image", img.id, img.x, img.y)}
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
                          onMouseDown={e => { e.stopPropagation(); dragRef.current = { kind: "resizeImage", id: selI.id, ox: 0, oy: 0 } }} />
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
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ── My Boards modal ── */}
      {showMyBoards && authUser && (
        <MyBoardsModal
          userId={authUser.id}
          onClose={() => setShowMyBoards(false)}
          onLoad={(canvasData, boardTitle) => {
            snapshot()
            setPlayers(canvasData.players ?? [])
            setArrows(canvasData.arrows ?? [])
            setTexts(canvasData.texts ?? [])
            setShapes(canvasData.shapes ?? [])
            setImages(canvasData.images ?? [])
            setTitle(boardTitle)
            setSel(null)
            setShowMyBoards(false)
          }}
        />
      )}
    </div>
  )
}

/* ─────────────────────────── Auth Modal ────────────────────── */
function AuthModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const submit = async () => {
    setError(""); setMessage(""); setLoading(true)
    if (tab === "signup") {
      const { error: e } = await supabase.auth.signUp({ email, password })
      if (e) setError(e.message)
      else { setMessage("Check your email to confirm your account."); }
    } else {
      const { error: e } = await supabase.auth.signInWithPassword({ email, password })
      if (e) setError(e.message)
      else onClose()
    }
    setLoading(false)
  }

  const signInWithGoogle = async () => {
    setError("")
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    })
    if (e) setError(e.message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}>
      <div className="relative w-[400px] rounded-xl border overflow-hidden flex flex-col"
        style={{ background: "#161b22", borderColor: "rgba(255,255,255,0.12)" }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: "#3fb950", color: "#0d1117", fontFamily: "'Barlow Condensed', sans-serif" }}>PS</div>
            <span className="font-semibold text-sm" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em" }}>
              PITCHSTUDIO ACCOUNT
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          {(["signin", "signup"] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError(""); setMessage("") }}
              className="flex-1 py-2.5 text-xs font-semibold uppercase transition-colors"
              style={{
                letterSpacing: "0.08em",
                borderBottom: tab === t ? "2px solid #3fb950" : "2px solid transparent",
                color: tab === t ? "#3fb950" : "#8b949e",
              }}>
              {t === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        <div className="p-5 flex flex-col gap-3">
          {/* Google */}
          <button onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-white/5"
            style={{ borderColor: "rgba(255,255,255,0.15)", color: "#e6edf3" }}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
            <span className="text-xs" style={{ color: "#8b949e" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />
          </div>

          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }}
            onKeyDown={e => e.key === "Enter" && submit()} />

          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: "#21262d", color: "#e6edf3", border: "1px solid rgba(255,255,255,0.1)" }}
            onKeyDown={e => e.key === "Enter" && submit()} />

          {error && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "#f8514920", color: "#f85149" }}>
              <AlertCircle size={13} /> {error}
            </div>
          )}
          {message && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "#3fb95020", color: "#3fb950" }}>
              <Check size={13} /> {message}
            </div>
          )}

          <button onClick={submit} disabled={loading || !email || !password}
            className="w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
            style={{ background: "#3fb950", color: "#0d1117" }}>
            {loading ? "Please wait…" : tab === "signin" ? "Sign In" : "Create Account"}
          </button>

          <p className="text-center text-xs" style={{ color: "#8b949e" }}>
            Save boards to your account and access them anywhere.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────── My Boards Modal ───────────────── */
interface BoardRow { id: string; title: string; created_at: string }

function MyBoardsModal({ userId, onClose, onLoad }: {
  userId: string
  onClose: () => void
  onLoad: (canvasData: { players: Player[]; arrows: Arrow[]; texts: TextBox[]; shapes: Shape[]; images: UploadedImage[] }, title: string) => void
}) {
  const [boards, setBoards] = useState<BoardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from("boards")
      .select("id, title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => { setBoards(data ?? []); setLoading(false) })
  }, [userId])

  const loadBoard = async (b: BoardRow) => {
    setLoadingId(b.id)
    const { data } = await supabase.from("boards").select("canvas_data, title").eq("id", b.id).single()
    if (data) onLoad(data.canvas_data, data.title)
    setLoadingId(null)
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) + " · " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}>
      <div className="relative w-[560px] max-h-[75vh] flex flex-col rounded-xl border overflow-hidden"
        style={{ background: "#161b22", borderColor: "rgba(255,255,255,0.12)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2">
            <FolderOpen size={16} style={{ color: "#58a6ff" }} />
            <span className="font-semibold" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em", fontSize: 16 }}>
              MY BOARDS
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-sm" style={{ color: "#8b949e" }}>
              <Clock size={14} className="animate-spin" /> Loading boards…
            </div>
          )}
          {!loading && boards.length === 0 && (
            <div className="text-center py-12 text-sm" style={{ color: "#8b949e" }}>
              No saved boards yet. Use the Save button to save your work.
            </div>
          )}
          <div className="flex flex-col gap-2">
            {boards.map(b => (
              <div key={b.id}
                className="flex items-center justify-between rounded-lg px-4 py-3 border transition-colors cursor-pointer hover:border-white/20"
                style={{ background: "#21262d", borderColor: "rgba(255,255,255,0.08)" }}
                onClick={() => loadBoard(b)}>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold text-sm truncate" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
                    {b.title || "Untitled Board"}
                  </span>
                  <span className="text-xs" style={{ color: "#8b949e" }}>{fmt(b.created_at)}</span>
                </div>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors flex-shrink-0 ml-3"
                  style={{ background: loadingId === b.id ? "#21262d" : "#58a6ff", color: loadingId === b.id ? "#8b949e" : "#0d1117" }}
                  disabled={loadingId === b.id}>
                  {loadingId === b.id ? "Loading…" : "Load"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
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
          borderColor: open ? "#3fb950" : "rgba(255,255,255,0.15)",
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
            style={{ background: "#1c2128", borderColor: "rgba(255,255,255,0.12)", width: 280 }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-bold uppercase" style={{ color: "#8b949e", letterSpacing: "0.1em" }}>What are you building?</p>
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
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#3fb950", color: "#0d1117", fontSize: 9, fontWeight: 700 }}>ACTIVE</span>
                    )}
                  </div>
                  <span className="text-xs leading-snug" style={{ color: "#8b949e" }}>{m.desc}</span>
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
      <p className="text-xs mb-1.5" style={{ color: "#8b949e" }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {allowTransparent && (
          <button onClick={() => onSelect("transparent")}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center relative overflow-hidden"
            style={{ borderColor: selected === "transparent" ? "#3fb950" : "transparent" }}>
            <div className="absolute inset-0 bg-white" />
            <div className="absolute inset-0 w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,0,0,0.5)_3px,rgba(255,0,0,0.5)_4px)]" />
          </button>
        )}
        {colors.map(c => (
          <button key={c} onClick={() => onSelect(c)}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{ background: c, borderColor: selected === c ? "#3fb950" : "transparent" }} />
        ))}
      </div>
    </div>
  )
}

function TextSVG({ t, sel, editingText, setEditingText, startDrag, startResize, setSel, tool, updT }: {
  t: TextBox; sel: Sel; editingText: string | null
  setEditingText: (id: string | null) => void
  startDrag: (e: React.MouseEvent) => void
  startResize?: (e: React.MouseEvent) => void
  setSel: (s: Sel) => void
  tool: Tool
  updT: (patch: Partial<TextBox>) => void
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
      onMouseDown={e => {
        if (tool === "select") { e.stopPropagation(); startDrag(e); setSel({ kind: "text", id: t.id }) }
      }}
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
          onMouseDown={e => { e.stopPropagation(); startResize(e) }} />
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
