import { HAND } from "./sketch"
import { ACCENT_INK, ACCENT_SOLID, DS_BORDER, DS_BORDER_STRONG, DS_ERROR, SURFACE_1, SURFACE_2, SURFACE_BASE, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

const MONO = "'JetBrains Mono', ui-monospace, monospace"

/** Styles for All walls */
export const ALL_WALLS_CSS = `
  .aw { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: 240px minmax(0, 1fr); grid-template-rows: 64px minmax(0, 1fr); background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; }
  .aw * { box-sizing: border-box; }
  .aw-top { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 0 18px; border-bottom: 1px solid ${DS_BORDER}; position: sticky; top: 0; z-index: 20; background: ${SURFACE_BASE}; }
  .aw-icon { width: 38px; height: 38px; border: none; border-radius: 10px; background: none; display: grid; place-items: center; cursor: pointer; color: ${TEXT_MUTED}; flex-shrink: 0; }
  .aw-icon:hover { background: ${SURFACE_2}; } .aw-icon.s { width: 26px; height: 26px; }
  .aw-name b { display: block; font-size: 15px; font-weight: 600; } .aw-name span { font-size: 12px; color: ${TEXT_MUTED}; }
  .aw-search { position: relative; flex: 1; max-width: 560px; margin: 0 auto; display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px 0 14px; border-radius: 12px; border: 1px solid ${DS_BORDER_STRONG}; background: ${SURFACE_1}; color: ${TEXT_MUTED}; }
  .aw-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: ${TEXT_PRIMARY}; font: 500 14.5px 'Inter', sans-serif; }
  .aw-search:focus-within { border-color: ${TEXT_MUTED}; }
  .aw-hits { position: absolute; left: 0; right: 0; top: calc(100% + 6px); max-height: 60vh; overflow-y: auto; padding: 6px; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; box-shadow: 0 22px 50px -18px rgba(0,0,0,.7); z-index: 30; }
  .aw-hits button { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 6px 10px; border: none; border-radius: 9px; background: none; color: ${TEXT_PRIMARY}; font: 500 14px 'Inter', sans-serif; text-align: left; cursor: pointer; }
  .aw-hits button:hover, .aw-hits button:focus-visible { background: ${SURFACE_1}; outline: none; }
  .aw-hits button span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .aw-hits small { color: ${TEXT_MUTED}; font-size: 12px; flex-shrink: 0; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aw-hits i { width: 12px; height: 9px; background: #f7e36a; flex-shrink: 0; } .aw-hits p { margin: 8px 10px; font-size: 13px; color: ${TEXT_MUTED}; }
  .aw-btn { height: 42px; padding: 0 16px; border-radius: 12px; border: 1px solid ${DS_BORDER_STRONG}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 600 14px 'Inter', sans-serif; display: inline-flex; align-items: center; gap: 7px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
  .aw-btn:hover { background: ${SURFACE_2}; } .aw-btn:disabled { opacity: .5; cursor: default; }
  .aw-btn.lime { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: transparent; } .aw-btn.big { height: 50px; padding: 0 22px; font-size: 15.5px; }
  .aw-side { padding: 18px 16px; border-right: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 64px; height: calc(100vh - 64px); height: calc(100dvh - 64px); overflow-y: auto; }
  .aw-k { margin: 14px 0 8px; font: 500 12px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; } .aw-k:first-child { margin-top: 0; } .aw-k.lime { color: ${ACCENT_SOLID}; margin: 0; }
  .aw-row { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 38px; padding: 0 10px; border: none; border-radius: 9px; background: none; color: #d6d6dc; font: 500 14px 'Inter', sans-serif; text-align: left; cursor: pointer; }
  .aw-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aw-row small { font: 500 12px ${MONO}; color: ${TEXT_MUTED}; }
  .aw-row:hover { background: ${SURFACE_2}; } .aw-row[aria-pressed="true"] { background: ${SURFACE_2}; color: #fff; }
  .aw-row.add { color: ${ACCENT_SOLID}; font-weight: 600; } .aw-row.del { color: ${DS_ERROR}; }
  .aw-row.drop { box-shadow: inset 0 0 0 2px ${ACCENT_SOLID}; }
  .aw-fdot { width: 9px; height: 9px; border-radius: 50%; background: #88dde0; flex-shrink: 0; }
  .aw-fin { height: 38px; border-radius: 9px; border: 1px solid ${ACCENT_SOLID}; background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; padding: 0 10px; font: 500 14px 'Inter', sans-serif; outline: none; }
  .aw-none { font-size: 13px; line-height: 1.5; color: ${TEXT_MUTED}; margin: 2px 10px 6px; display: flex; align-items: center; gap: 8px; }
  .aw-foot { margin: auto 0 0; padding-top: 12px; border-top: 1px solid ${DS_BORDER}; font: 500 12px ${MONO}; letter-spacing: .06em; color: ${TEXT_MUTED}; }
  .aw-main { padding: 22px 28px 60px; min-width: 0; }
  .aw-h { display: flex; align-items: baseline; gap: 12px; margin: 26px 0 14px; } .aw-h:first-child { margin-top: 4px; }
  .aw-h h2 { margin: 0; font: 400 26px/1 Anton, 'Bebas Neue', sans-serif; text-transform: uppercase; letter-spacing: .01em; } .aw-h span { font: 500 13px 'Inter', sans-serif; color: ${TEXT_MUTED}; }
  .aw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 22px 18px; }
  .aw-card { position: relative; min-width: 0; }
  .aw-card.stack::before, .aw-card.stack::after { content: ""; position: absolute; left: 7px; right: 7px; top: -6px; height: 10px; border-radius: 10px 10px 0 0; background: #55565e; border: 1px solid rgba(255,255,255,.22); border-bottom: 0; }
  .aw-card.stack::after { left: 14px; right: 14px; top: -12px; background: #44454c; }
  .aw-open { position: relative; z-index: 1; display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; border-radius: 10px; }
  .aw-open:focus-visible { outline: 3px solid ${ACCENT_SOLID}; outline-offset: 3px; }
  .aw-pv { position: relative; aspect-ratio: 16 / 10; border-radius: 10px; overflow: hidden; border: 5px solid; box-shadow: inset 0 0 20px rgba(0,0,0,.15); display: grid; place-items: center; }
  .aw-pv svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .aw-ph, .aw-duo { position: absolute; inset: 0; } .aw-duo { background: linear-gradient(135deg, #a50044, #10306a); mix-blend-mode: multiply; opacity: .88; }
  .aw-pv-empty { position: relative; font: 700 15px ${HAND}; color: rgba(27,26,23,.5); }
  .aw-card:hover .aw-pv { box-shadow: inset 0 0 20px rgba(0,0,0,.15), 0 0 0 2px rgba(255,255,255,.35); }
  .aw-pinb { position: absolute; right: 9px; top: 9px; z-index: 2; width: 24px; height: 24px; border-radius: 50%; background: rgba(12,14,18,.78); color: ${ACCENT_SOLID}; display: grid; place-items: center; pointer-events: none; }
  .aw-t { display: flex; align-items: center; gap: 8px; margin-top: 9px; min-width: 0; }
  .aw-t b { font: 600 15px 'Inter', sans-serif; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .aw-t > span { margin-left: auto; font: 500 12.5px 'Inter', sans-serif; color: ${TEXT_MUTED}; white-space: nowrap; }
  .aw-t input { flex: 1; min-width: 0; height: 30px; border-radius: 7px; border: 1px solid ${ACCENT_SOLID}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 600 14.5px 'Inter', sans-serif; padding: 0 8px; outline: none; }
  .aw-more { width: 30px; height: 30px; border: none; border-radius: 8px; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
  .aw-more:hover { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
  .aw-m { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-top: 2px; font: 500 12.5px 'Inter', sans-serif; color: ${TEXT_MUTED}; }
  .aw-m em { font-style: normal; display: inline-flex; align-items: center; gap: 4px; background: ${SURFACE_2}; color: #d6d6dc; border-radius: 6px; padding: 1px 7px; font-weight: 600; font-size: 12px; }
  .aw-m small { font-size: 12px; } .aw-m small::before { content: "· "; }
  .aw-failed { display: flex; align-items: center; gap: 14px; padding: 12px 14px; margin-bottom: 14px; border-radius: 12px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; font-size: 14px; } .aw-failed span { flex: 1; color: ${TEXT_MUTED}; }
  .aw-hero { display: grid; grid-template-columns: minmax(0, 520px) minmax(0, 1fr); gap: 26px; padding: 20px; border-radius: 18px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; }
  .aw-hero-pv { position: relative; border: none; padding: 0; background: none; cursor: pointer; border-radius: 12px; }
  .aw-hero-pv .aw-pv { aspect-ratio: auto; height: 100%; min-height: 220px; border-width: 8px; }
  .aw-hero-banner { position: absolute; left: 50%; top: 18px; transform: translateX(-50%) rotate(-1deg); background: #f3efe4; color: #1b1a17; font: 700 14px ${HAND}; letter-spacing: .25em; text-transform: uppercase; padding: 4px 18px; white-space: nowrap; }
  .aw-hero-t { display: flex; flex-direction: column; gap: 10px; }
  .aw-hero-t h2 { margin: 0; font: 400 36px/1.02 Anton, 'Bebas Neue', sans-serif; text-transform: uppercase; }
  .aw-hero-t p:not(.aw-k) { margin: 0; font-size: 15px; line-height: 1.55; color: #c9cad1; max-width: 520px; }
  .aw-hero-acts { margin-top: auto; padding-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
  .aw-ways { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
  .aw-way { background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 12px; padding: 10px; }
  .aw-way b { display: block; font: 600 14px 'Inter', sans-serif; margin-top: 8px; } .aw-way span { display: block; font: 500 12.5px 'Inter', sans-serif; color: ${TEXT_MUTED}; margin-top: 2px; }
  .aw-way-pic { position: relative; height: 84px; border-radius: 7px; background: #CBC6BC; overflow: hidden; }
  .aw-way-pic i { position: absolute; width: 30px; height: 13px; }
  .w0 i:nth-child(1) { left: 12%; top: 18%; background: #f7e36a; transform: rotate(-4deg); } .w0 i:nth-child(2) { left: 40%; top: 46%; background: #f9b27e; transform: rotate(3deg); } .w0 i:nth-child(3) { left: 68%; top: 16%; background: #88dde0; } .w0 i:nth-child(4) { left: 22%; top: 70%; background: #f58cb4; } .w0 i:nth-child(5) { left: 72%; top: 64%; background: #c8e86c; transform: rotate(-3deg); }
  .w1 i:nth-child(1) { left: 10%; top: 14%; background: #f7e36a; } .w1 i:nth-child(2) { left: 10%; top: 36%; background: #f7e36a; } .w1 i:nth-child(3) { left: 40%; top: 14%; background: #f58cb4; } .w1 i:nth-child(4) { left: 40%; top: 36%; background: #f58cb4; } .w1 i:nth-child(5) { left: 70%; top: 14%; background: #c8e86c; }
  .w2 i:nth-child(1) { left: 8%; top: 42%; background: #f3efe4; } .w2 i:nth-child(2) { left: 40%; top: 16%; background: #f7e36a; } .w2 i:nth-child(3) { left: 40%; top: 68%; background: #88dde0; } .w2 i:nth-child(4) { left: 72%; top: 16%; background: #f9b27e; } .w2 i:nth-child(5) { display: none; }
  .w2::before { content: ""; position: absolute; left: 30%; top: 22%; width: 10%; height: 56%; border: 1.5px solid #B3261E; border-right: none; border-radius: 10px 0 0 10px; }
  .w3 i:nth-child(1) { left: 12%; top: 18%; width: 58px; height: 44px; background: #f3efe4; box-shadow: 4px -4px 0 -1px #e2ddd0, 8px -8px 0 -2px #d3cdbf; } .w3 i:nth-child(2) { left: 64%; top: 22%; background: #f7e36a; } .w3 i:nth-child(3) { left: 62%; top: 58%; background: #c6b6fb; } .w3 i:nth-child(4), .w3 i:nth-child(5) { display: none; }
  .aw-starter { min-width: 0; text-align: left; border: none; background: none; padding: 0; color: inherit; cursor: pointer; }
  .aw-starter:disabled { opacity: .6; cursor: default; }
  .aw-starter b { display: flex; align-items: center; gap: 6px; font: 600 15px 'Inter', sans-serif; margin-top: 9px; } .aw-starter > span { display: block; font: 500 12.5px 'Inter', sans-serif; color: ${TEXT_MUTED}; margin-top: 2px; }
  .aw-starter em { display: inline-block; margin-top: 6px; font: 600 12px 'Inter', sans-serif; font-style: normal; background: ${SURFACE_2}; border-radius: 6px; padding: 2px 8px; color: #d6d6dc; }
  .aw-starter:focus-visible { outline: 3px solid ${ACCENT_SOLID}; outline-offset: 4px; border-radius: 10px; }
  .aw-st-pic { aspect-ratio: 16 / 9; border-radius: 10px; padding: 10px; display: flex; gap: 6px; background: #CBC6BC; border: 5px solid #3A332D; overflow: hidden; }
  .aw-st-pic.press { background: #1f3b33; border-color: #16261f; }
  .aw-st-pic span { flex: 1; min-width: 0; border: 1.5px dashed rgba(58,51,45,.35); border-radius: 5px; padding: 18px 5px 4px; position: relative; display: flex; flex-direction: column; gap: 4px; }
  .aw-st-pic.press span { border-color: rgba(255,255,255,.3); }
  .aw-st-pic u { position: absolute; top: 3px; left: 5px; font: 700 11px ${HAND}; color: #3a332d; text-decoration: none; white-space: nowrap; }
  .aw-st-pic.press u { color: #e8efe9; }
  .aw-st-pic i { height: 12px; display: block; }
  .aw-card:hover .aw-st-pic, .aw-starter:hover .aw-st-pic { box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
  .aw .bd-menu-back { position: fixed; inset: 0; z-index: 65; }
  .aw .bd-menu { position: fixed; z-index: 70; width: 248px; max-height: min(440px, calc(100vh - 16px)); overflow-y: auto; padding: 6px; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; box-shadow: 0 22px 50px -18px rgba(0,0,0,.7); }
  .aw .bd-menu p { margin: 8px 8px 4px; font: 600 12px ${MONO}; letter-spacing: .12em; text-transform: uppercase; color: ${TEXT_MUTED}; }
  .aw .bd-menu .aw-row:hover { background: ${SURFACE_1}; }
  .aw-warn { font-size: 12.5px; color: ${TEXT_MUTED}; padding: 4px 8px 8px; line-height: 1.45; }
  .aw-spin { animation: aw-spin 1s linear infinite; } @keyframes aw-spin { to { transform: rotate(360deg); } }
  .aw-live { position: fixed; left: 0; bottom: 0; width: 0; height: 0; }
  .aw-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); max-width: calc(100vw - 32px); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; padding: 10px 16px; border-radius: 999px; font: 500 13px 'Inter', sans-serif; z-index: 90; text-align: center; }
  @media (max-width: 900px) { .aw-ways { grid-template-columns: repeat(2, minmax(0, 1fr)); } .aw-hero { grid-template-columns: 1fr; } .aw-hero-pv .aw-pv { min-height: 200px; } }
  @media (max-width: 700px) {
    .aw { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr); }
    .aw-top { flex-wrap: wrap; gap: 8px 10px; padding: 8px 10px; height: auto; } .aw-name span { display: none; }
    .aw-search { order: 5; flex-basis: 100%; max-width: none; height: 44px; } .aw-search input { font-size: 16px; }
    .aw-top .aw-btn { margin-left: auto; height: 40px; } .aw-top .aw-how { width: 40px; padding: 0; justify-content: center; } .aw-how span { display: none; } .aw-top .aw-how + .aw-btn { margin-left: 0; }
    .aw-side { position: static; height: auto; flex-direction: row; flex-wrap: nowrap; overflow-x: auto; gap: 6px; padding: 8px 10px; border-right: none; border-bottom: 1px solid ${DS_BORDER}; scrollbar-width: none; }
    .aw-side::-webkit-scrollbar { display: none; }
    .aw-side .aw-k, .aw-side .aw-none, .aw-foot { display: none; }
    .aw-row { width: auto; flex-shrink: 0; min-height: 40px; border: 1px solid ${DS_BORDER}; border-radius: 999px; } .aw-row span { overflow: visible; }
    .aw-fin { flex-shrink: 0; width: 160px; }
    .aw-main { padding: 14px 12px 50px; }
    .aw-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 12px; }
    .aw-hero { padding: 14px; } .aw-hero-t h2 { font-size: 30px; }
    .aw-t b { font-size: 14px; } .aw-more { width: 40px; height: 40px; }
  }
  @media (prefers-reduced-motion: reduce) { .aw-spin { animation: none; } }
`
