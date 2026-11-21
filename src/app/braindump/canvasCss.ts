import { THREAD } from "./Wall"
import { HAND } from "./sketch"
import { PIN } from "./arrange"

/** Styles for the free wall (the page adds them to its own sheet) */
export const FREE_CSS = `
  .fw { position: relative; flex: 1; min-height: 0; overflow: hidden; border: 10px solid; border-radius: 6px; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; box-shadow: inset 0 0 40px rgba(0,0,0,.18), 0 20px 40px -24px rgba(0,0,0,.8); }
  .fw.dragging, .fw.dragging * { cursor: grabbing !important; }
  .fw-photo { position: absolute; inset: 0; pointer-events: none; }
  .fw-duo { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(135deg, #a50044, #10306a); mix-blend-mode: multiply; opacity: .88; }
  .fw-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
  .fw-threads { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; z-index: 5; filter: drop-shadow(0 1px 1px rgba(0,0,0,.3)); }
  .fw-frame { position: absolute; border-radius: 12px; border: 2px dashed rgba(27,26,23,.32); background: rgba(255,255,255,.12); transition: box-shadow .15s, background .15s; }
  .fw.dark .fw-frame { border-color: rgba(255,255,255,.26); background: rgba(255,255,255,.04); }
  .fw-frame.over { border-style: solid; border-color: #1b1a17; background: rgba(255,255,255,.26); }
  .fw.dark .fw-frame.over { border-color: #fff; background: rgba(255,255,255,.1); }
  .fw-frame.flash { box-shadow: 0 0 0 4px ${"#D7FF3C"}; }
  .fw-frame.moving { box-shadow: 0 24px 40px -18px rgba(0,0,0,.55); }
  .fw-fhead { position: absolute; left: 10px; right: 10px; top: -16px; display: flex; align-items: center; gap: 8px; cursor: grab; }
  .fw-fhead .bd-tag { flex: 1; min-width: 0; min-height: 42px; }
  .fw-fhead .bd-tag-name { font-size: 17px; }
  .fw-fhead .bd-tag-more { width: 32px; height: 32px; flex-shrink: 0; }
  .fw-fempty { position: absolute; left: 0; right: 0; top: 50%; margin: 0; text-align: center; font: 700 16px ${HAND}; color: rgba(27,26,23,.45); pointer-events: none; }
  .fw.dark .fw-fempty { color: rgba(255,255,255,.45); }
  .fw-resize { position: absolute; right: -2px; bottom: -2px; width: 22px; height: 22px; cursor: nwse-resize; border-right: 3px solid rgba(27,26,23,.4); border-bottom: 3px solid rgba(27,26,23,.4); border-bottom-right-radius: 12px; }
  .fw.dark .fw-resize { border-color: rgba(255,255,255,.4); }
  .fw-note { position: absolute; z-index: 3; transform: rotate(var(--tilt)); transform-origin: ${PIN.x}px ${PIN.y}px; transition: opacity .15s; }
  .fw-note.lifted { z-index: 6; opacity: .92; pointer-events: none; }
  .fw-note.lifted .fw-face { box-shadow: 0 26px 34px -14px rgba(0,0,0,.6); transform: rotate(2deg) scale(1.02); }
  .fw-note.dim { opacity: .28; }
  .fw-face { width: 100%; height: 100%; border: none; border-radius: 2px; padding: 8px 12px 6px 30px; text-align: left; cursor: grab; color: #1b1a17; background: var(--paper); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;
    box-shadow: 0 1px 1px rgba(0,0,0,.14), 0 10px 16px -9px rgba(0,0,0,.5); transition: transform .15s, box-shadow .15s; touch-action: none; -webkit-touch-callout: none; }
  .fw-face:hover { box-shadow: 0 1px 1px rgba(0,0,0,.14), 0 16px 22px -10px rgba(0,0,0,.6); }
  .fw-face:focus-visible { outline: 3px solid #1b1a17; outline-offset: 3px; }
  .fw.dark .fw-face:focus-visible { outline-color: #fff; }
  .fw-note.sel .fw-face { outline: 3px solid #7cc4ff; outline-offset: 3px; }
  .fw-note.over .fw-face { outline: 3px solid ${THREAD}; outline-offset: 3px; transform: translateY(-2px); }
  .fw-face .t { font: 700 16.5px/1.12 ${HAND}; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .fw-face .m { display: flex; align-items: center; gap: 6px; font: 600 12px 'JetBrains Mono', monospace; letter-spacing: .14em; color: rgba(27,26,23,.8); }
  .fw-face .m b { font: 600 12px 'Inter', sans-serif; letter-spacing: 0; background: #1b1a17; color: #fff; padding: 1px 7px; border-radius: 999px; }
  .fw .fw-note.walled .fw-face { background: #2b2c31; color: #f5f5f7; border-radius: 8px; box-shadow: 0 0 0 1px rgba(255,255,255,.12), 5px -5px 0 -1px #3d3e44, 10px -10px 0 -2px #4a4b52, 0 14px 22px -10px rgba(0,0,0,.6); }
  .fw .fw-note.walled .fw-face .m { color: #c4c6cc; }
  .fw-go { position: absolute; right: 8px; top: 8px; z-index: 5; height: 26px; padding: 0 9px; border: none; border-radius: 7px; background: rgba(215,255,60,.14); color: #D7FF3C; font: 700 12px 'Inter', sans-serif; cursor: pointer; }
  .fw-go:hover { background: rgba(215,255,60,.24); }
  .fw-go:focus-visible { outline: 2px solid #D7FF3C; outline-offset: 2px; }
  .fw-note.walled .fw-face .t { padding-right: 58px; }
  .fw-pin { position: absolute; left: ${PIN.x - 5}px; top: ${PIN.y - 5}px; width: 10px; height: 10px; border-radius: 50%; background: var(--pin); box-shadow: inset -1.5px -1.5px 0 rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.45); pointer-events: none; z-index: 4; }
  .fw.p-tape .fw-pin { left: 50%; top: -8px; width: 58px; height: 18px; margin-left: -29px; border-radius: 1px; background: rgba(244,238,220,.72); box-shadow: 0 1px 2px rgba(0,0,0,.18); transform: rotate(-2deg); }
  .fw.p-none .fw-pin { display: none; }
  .fw.p-tape .fw-face, .fw.p-none .fw-face { padding-left: 14px; }
  .fw.n-card .fw-face { background: #fff; border-radius: 8px; box-shadow: inset 5px 0 0 var(--pin), 0 1px 2px rgba(0,0,0,.12), 0 10px 16px -10px rgba(0,0,0,.45); }
  .fw.n-plain .fw-face { background: color-mix(in srgb, var(--paper) 22%, transparent); border: 2px solid var(--pin); border-radius: 10px; box-shadow: none; }
  .fw.dark.n-plain .fw-face { color: #fff; }
  .fw-banner { position: absolute; transform: translateX(-50%); z-index: 1; cursor: default; }
  .fw-banner .bd-banner-row { padding: 0; }
  .fw-banner .bd-banner { white-space: nowrap; max-width: none; }
  .fw-zoom { position: absolute; right: 14px; bottom: 14px; z-index: 8; display: flex; align-items: center; gap: 2px; padding: 4px; border-radius: 12px; background: rgba(24,26,31,.94); border: 1px solid rgba(255,255,255,.12); color: #e6e7ea; font: 600 12.5px 'Inter', sans-serif; cursor: default; }
  .fw-zoom button { height: 32px; min-width: 32px; padding: 0 8px; border: none; border-radius: 8px; background: none; color: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 5px; font: inherit; cursor: pointer; }
  .fw-zoom button:hover { background: rgba(255,255,255,.1); }
  .fw-zoom span { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
  .fw-hello { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0; max-width: 360px; text-align: center; font: 700 22px/1.3 ${HAND}; color: rgba(27,26,23,.55); pointer-events: none; }
  .fw.dark .fw-hello { color: rgba(255,255,255,.6); }
  @media (max-width: 700px) { .fw { border-width: 6px; } .fw-zoom span { display: none; } .fw-zoom button { min-width: 40px; height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) { .fw-face, .fw-note, .fw-frame { transition: none; } }
`
