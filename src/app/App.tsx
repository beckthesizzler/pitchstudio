import { useState, useRef, useCallback, useEffect } from "react"
import { toPng, toJpeg } from "html-to-image"
import jsPDF from "jspdf"
import {
  MousePointer2, UserPlus, ArrowUpRight, Type, Pentagon,
  Trash2, Download, Layers, RotateCcw, RotateCw,
  ChevronDown, FileImage, Move,
  ImagePlus, Square, Circle, Minus, Plus, BookOpen,
  Lock, Star, X, RefreshCw, Magnet, ChevronRight
} from "lucide-react"

/* ─────────────────────────── Types ─────────────────────────── */
type Tool =
  | "select" | "pan"
  | "homePlayer" | "awayPlayer"
  | "arrow" | "text" | "shape" | "image"

type ShapeKind = "polygon" | "circle" | "ellipse" | "rect"

interface Player {
  id: string; x: number; y: number
  name: string; num: string
  bg: string; fg: string; ring: string
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

type Sel = null | { kind: "player" | "arrow" | "text" | "shape" | "image"; id: string }

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
function PitchSVG() {
  const L = "rgba(255,255,255,0.85)", W = 2.5
  return (
    <g>
      {Array.from({ length: 13 }, (_, i) => (
        <rect key={i} x={i * (PW / 13)} y={0} width={PW / 13 + 1} height={PH}
          fill={i % 2 === 0 ? "#1e6634" : "#1a5a2d"} />
      ))}
      <rect x={3} y={3} width={PW - 6} height={PH - 6} fill="none" stroke={L} strokeWidth={W} />
      <line x1={PCX} y1={3} x2={PCX} y2={PH - 3} stroke={L} strokeWidth={W} />
      <circle cx={PCX} cy={PCY} r={91.5} fill="none" stroke={L} strokeWidth={W} />
      <circle cx={PCX} cy={PCY} r={4.5} fill={L} />
      <rect x={3} y={PCY - 201.5} width={162} height={403} fill="none" stroke={L} strokeWidth={W} />
      <rect x={3} y={PCY - 91.5} width={53} height={183} fill="none" stroke={L} strokeWidth={W} />
      <rect x={-14} y={PCY - 37} width={14} height={74} fill="rgba(255,255,255,0.12)" stroke={L} strokeWidth={1.5} />
      <circle cx={110} cy={PCY} r={4} fill={L} />
      <path d={`M 165 ${PCY - 73.1} A 91.5 91.5 0 0 1 165 ${PCY + 73.1}`} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW - 165} y={PCY - 201.5} width={162} height={403} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW - 56} y={PCY - 91.5} width={53} height={183} fill="none" stroke={L} strokeWidth={W} />
      <rect x={PW} y={PCY - 37} width={14} height={74} fill="rgba(255,255,255,0.12)" stroke={L} strokeWidth={1.5} />
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
  const [showTemplates, setShowTemplates] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sideTab, setSideTab] = useState<"tools" | "background">("tools")
  const [textLayer, setTextLayer] = useState<"foreground" | "background">("foreground")
  const [selectedFormation, setSelectedFormation] = useState("4-3-3")

  /* ── Templates ── */
  const [templates, setTemplates] = useState<Template[]>(() => {
    try { return JSON.parse(localStorage.getItem("tactics-templates") || "[]") }
    catch { return [] }
  })
  const saveTemplates = (t: Template[]) => {
    setTemplates(t)
    localStorage.setItem("tactics-templates", JSON.stringify(t))
  }

  /* ── Drawing drafts ── */
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
    kind: "player" | "text" | "image" | "arrowCp" | "arrowP1" | "arrowP2"
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
      const colors = team === "home" ? HOME_COLORS : AWAY_COLORS
      return {
        id: uid(),
        x: cx,
        y: cy,
        name: pos.pos,
        num: String(pos.num),
        ...colors,
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

    if (!dragRef.current) return
    const d = dragRef.current
    if (d.kind === "player") setPlayers(p => p.map(pl => pl.id === d.id ? { ...pl, x: x - d.ox, y: y - d.oy } : pl))
    else if (d.kind === "text") setTexts(t => t.map(tb => tb.id === d.id ? { ...tb, x: x - d.ox, y: y - d.oy } : tb))
    else if (d.kind === "image") setImages(i => i.map(im => im.id === d.id ? { ...im, x: x - d.ox, y: y - d.oy } : im))
    else if (d.kind === "arrowCp") setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, cpx: x, cpy: y } : ar))
    else if (d.kind === "arrowP1") setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, x1: x, y1: y, cpx: (x + ar.x2) / 2, cpy: (y + ar.y2) / 2 } : ar))
    else if (d.kind === "arrowP2") setArrows(a => a.map(ar => ar.id === d.id ? { ...ar, x2: x, y2: y, cpx: (ar.x1 + x) / 2, cpy: (ar.y1 + y) / 2 } : ar))
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
  }, [tool, shapeKind, svgXY])

  const onSVGClick = useCallback((e: React.MouseEvent) => {
    if (hasDraggedRef.current) return
    const { x, y } = svgXY(e)

    if (tool === "homePlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "Player", num: String(players.length + 1), ...HOME_COLORS }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id })
    } else if (tool === "awayPlayer") {
      snapshot()
      const p: Player = { id: uid(), x, y, name: "Player", num: String(players.length + 1), ...AWAY_COLORS }
      setPlayers(prev => [...prev, p]); setSel({ kind: "player", id: p.id })
    } else if (tool === "arrow") {
      if (!arrowDraft) {
        setArrowDraft({ x1: x, y1: y })
      } else {
        snapshot()
        const a: Arrow = {
          id: uid(), x1: arrowDraft.x1, y1: arrowDraft.y1, x2: x, y2: y,
          cpx: (arrowDraft.x1 + x) / 2, cpy: (arrowDraft.y1 + y) / 2,
          color: "#ffffff", strokeW: 3, dash: "none", label: "", twoWay: false
        }
        setArrows(prev => [...prev, a]); setSel({ kind: "arrow", id: a.id }); setArrowDraft(null)
      }
    } else if (tool === "text") {
      snapshot()
      const t: TextBox = {
        id: uid(), x, y, text: "Analysis note",
        fg: "#ffffff", bg: "rgba(13,17,23,0.85)", border: "#58a6ff",
        dash: false, size: 14, bold: false, width: 180, layer: textLayer
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
        {/* Logo + Title */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "#3fb950", color: "#0d1117", fontFamily: "'Barlow Condensed', sans-serif" }}>PS</div>
          {editingTitle ? (
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={e => { if (e.key === "Enter") setEditingTitle(false) }}
              className="bg-transparent outline-none font-bold text-sm"
              style={{ borderBottom: "1px solid #3fb950", color: "#e6edf3", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.08em", width: 220 }} />
          ) : (
            <span className="font-bold text-sm cursor-pointer hover:opacity-70 truncate"
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
          {/* Undo/Redo */}
          <button onClick={undo} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Undo (Ctrl+Z)"><RotateCcw size={14} /></button>
          <button onClick={redo} className="p-1.5 rounded hover:bg-white/10 transition-colors" title="Redo"><RotateCw size={14} /></button>
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
        <aside className="w-56 flex flex-col border-r overflow-y-auto flex-shrink-0"
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
                      <ColorPicker label="Ring color" colors={PALETTE} selected={selP.ring} onSelect={c => updP({ ring: c })} />
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
                              {s === "none" ? "—" : s === "dashed" ? "- -" : "···"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs" style={{ color: "#8b949e" }}>Width {selA.strokeW}px</span>
                        <input type="range" min={1} max={8} value={selA.strokeW}
                          onChange={e => updA({ strokeW: +e.target.value })} className="w-full accent-green-400" />
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={selA.twoWay} onChange={e => updA({ twoWay: e.target.checked })} className="accent-green-400" />
                        <span style={{ color: "#c9d1d9" }}>Two-way arrow</span>
                      </label>
                    </div>
                  )}

                  {/* TEXT */}
                  {selT && (
                    <div className="flex flex-col gap-2">
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
                      <ColorPicker label="Border color" colors={PALETTE} selected={selT.border} onSelect={c => updT({ border: c })} />
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

              {/* Show pitch toggle */}
              <div>
                <p className="text-xs font-semibold uppercase mb-2" style={{ color: "#8b949e", letterSpacing: "0.08em" }}>Pitch Markings</p>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div onClick={() => setShowPitch(v => !v)}
                    className="w-9 h-5 rounded-full relative transition-colors cursor-pointer"
                    style={{ background: showPitch ? "#3fb950" : "#30363d" }}>
                    <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                      style={{ transform: showPitch ? "translateX(18px)" : "translateX(2px)" }} />
                  </div>
                  <span className="text-xs" style={{ color: "#c9d1d9" }}>
                    {showPitch ? "Visible" : "Hidden"}
                  </span>
                </label>
                <p className="text-xs mt-1.5" style={{ color: "#8b949e" }}>
                  Hide pitch markings when using a background photo.
                </p>
              </div>

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
            background: `radial-gradient(ellipse at 50% 50%, #1c2128 0%, #0d1117 100%)`,
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
                      setSel={setSel} tool={tool} updT={updT} />
                  ))}

                  {/* 4. Pitch group (translated to canvas offset) */}
                  {showPitch && (
                    <g transform={`translate(${PX},${PY})`}>
                      <PitchSVG />
                    </g>
                  )}

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
                        <rect
                          x={s.x - 4} y={s.y - 4}
                          width={s.w + 8} height={s.h + 8}
                          fill="none" stroke="#3fb950" strokeWidth={1.5} strokeDasharray="4,2" rx={3}
                          style={{ pointerEvents: "none" }} />
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

                  {/* 9. Arrow draft preview */}
                  {arrowDraft && (
                    <g>
                      <line x1={arrowDraft.x1} y1={arrowDraft.y1} x2={mouse.x} y2={mouse.y}
                        stroke="rgba(255,255,255,0.5)" strokeWidth={2} strokeDasharray="8,4" />
                      <circle cx={arrowDraft.x1} cy={arrowDraft.y1} r={6} fill="#3fb950" />
                      <polygon points={arrowHead(mouse.x, mouse.y, arrowDraft.x1, arrowDraft.y1, 14)} fill="rgba(255,255,255,0.5)" />
                    </g>
                  )}

                  {/* 10. Foreground texts (on top of everything) */}
                  {fgTexts.map(t => (
                    <TextSVG key={t.id} t={t} sel={sel} editingText={editingText}
                      setEditingText={setEditingText} startDrag={(e) => startDrag(e, "text", t.id, t.x, t.y)}
                      setSel={setSel} tool={tool} updT={updT} />
                  ))}

                  {/* 11. Players — Brazil-style visible tokens */}
                  {players.map(p => {
                    const isSelected = sel?.id === p.id
                    const r = 28
                    return (
                      <g key={p.id} transform={`translate(${p.x},${p.y})`}
                        onMouseDown={e => startDrag(e, "player", p.id, p.x, p.y)}
                        style={{ cursor: tool === "select" ? "grab" : "default" }}>
                        {/* Drop shadow */}
                        <circle r={r + 1} fill="rgba(0,0,0,0.45)" cx={1.5} cy={2.5} />
                        {/* Selection ring */}
                        {isSelected && (
                          <circle r={r + 7} fill="none" stroke="#3fb950" strokeWidth={2.5} strokeDasharray="5,3" />
                        )}
                        {/* Main circle */}
                        <circle r={r} fill={p.bg} stroke={p.ring} strokeWidth={3} />
                        {/* Number */}
                        <text textAnchor="middle" dominantBaseline="central" y={-1}
                          fill={p.fg} fontSize={15} fontWeight="800"
                          style={{ fontFamily: "'Barlow Condensed',sans-serif", pointerEvents: "none" }}>
                          {p.num}
                        </text>
                        {/* Name pill background */}
                        <rect x={-32} y={r + 4} width={64} height={17} rx={3} fill="rgba(0,0,0,0.75)" />
                        {/* Name text */}
                        <text textAnchor="middle" y={r + 13.5} fill="#ffffff" fontSize={10} fontWeight="700"
                          style={{ fontFamily: "'Barlow Condensed',sans-serif", letterSpacing: "0.06em", pointerEvents: "none" }}>
                          {p.name.toUpperCase().slice(0, 10)}
                        </text>
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
                    <rect
                      x={selI.layer === "background" ? 0 : selI.x}
                      y={selI.layer === "background" ? 0 : selI.y}
                      width={selI.layer === "background" ? CW : selI.width}
                      height={selI.layer === "background" ? CH : selI.height}
                      fill="none" stroke="#3fb950" strokeWidth={2} strokeDasharray="6,3"
                      style={{ pointerEvents: "none" }} />
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
    </div>
  )
}

/* ─────────────────────────── Sub-components ────────────────── */
function ColorPicker({ label, colors, selected, onSelect }: {
  label: string; colors: string[]; selected: string; onSelect: (c: string) => void
}) {
  return (
    <div>
      <p className="text-xs mb-1.5" style={{ color: "#8b949e" }}>{label}</p>
      <div className="flex flex-wrap gap-1">
        {colors.map(c => (
          <button key={c} onClick={() => onSelect(c)}
            className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{ background: c, borderColor: selected === c ? "#3fb950" : "transparent" }} />
        ))}
      </div>
    </div>
  )
}

function TextSVG({ t, sel, editingText, setEditingText, startDrag, setSel, tool, updT }: {
  t: TextBox; sel: Sel; editingText: string | null
  setEditingText: (id: string | null) => void
  startDrag: (e: React.MouseEvent) => void
  setSel: (s: Sel) => void
  tool: Tool
  updT: (patch: Partial<TextBox>) => void
}) {
  const isSelected = sel?.id === t.id
  const lineH = t.size * 1.45
  const lines = t.text.split("\n")
  const boxH = lines.length * lineH + 16
  return (
    <g onMouseDown={e => { if (tool === "select") { e.stopPropagation(); startDrag(e); setSel({ kind: "text", id: t.id }) } }}
      onDoubleClick={e => { e.stopPropagation(); setEditingText(t.id) }}
      style={{ cursor: tool === "select" ? "move" : "default" }}>
      <rect x={t.x} y={t.y} width={t.width} height={boxH}
        fill={t.bg} stroke={isSelected ? "#3fb950" : t.border}
        strokeWidth={isSelected ? 2 : 1} strokeDasharray={t.dash ? "6,3" : undefined} rx={4} />
      {editingText === t.id ? (
        <foreignObject x={t.x + 6} y={t.y + 6} width={t.width - 12} height={boxH - 12}>
          <textarea autoFocus value={t.text} rows={lines.length}
            onChange={e => updT({ text: e.target.value })}
            onBlur={() => setEditingText(null)}
            style={{
              width: "100%", height: "100%", background: "transparent",
              border: "none", outline: "none", resize: "none",
              color: t.fg, fontSize: t.size,
              fontWeight: t.bold ? "bold" : "normal",
              fontFamily: "'Inter', sans-serif", lineHeight: 1.45,
            }} />
        </foreignObject>
      ) : (
        lines.map((line, i) => (
          <text key={i} x={t.x + 8} y={t.y + 10 + (i + 0.85) * lineH}
            fill={t.fg} fontSize={t.size} fontWeight={t.bold ? "700" : "400"}
            style={{ fontFamily: "'Inter', sans-serif", pointerEvents: "none" }}>
            {line}
          </text>
        ))
      )}
    </g>
  )
}
