import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, DS_ERROR, ACCENT_SOLID, ACCENT_INK } from "../theme"

/* The look of the Match reports canvas (Library.tsx), and the sizes it lays reports out by */
export const CW = 132, CH = 165, GAP = 14, PAD = 16, HEAD = 40 // a card, the space between, a frame's padding and its name row
const MONO = "'JetBrains Mono', ui-monospace, monospace"

export const LIBRARY_CSS = `
    .lb-body { position: relative; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }
    .lb-start { border-bottom: 1px solid ${DS_BORDER}; padding: 14px 22px 16px; background: ${SURFACE_BASE}; overflow-x: auto; }
    .lb-k { margin: 0 0 10px; font: 500 12px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; }
    .lb-scroll { position: relative; overflow: auto; background: #141518; background-image: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px); background-size: 22px 22px; }
    .lb-world { position: relative; transform-origin: 0 0; }
    .lb-group { position: absolute; border-radius: 16px; background: rgba(255,255,255,.025); border: 1px solid ${DS_BORDER}; transition: border-color .14s, background .14s; }
    .lb-newg { border-style: dashed; border-color: ${DS_BORDER_STRONG}; background: none; display: flex; align-items: center; justify-content: center; gap: 8px; font: 600 13px 'Inter', sans-serif; color: ${TEXT_MUTED}; }
    .lb-group.over { border-color: ${ACCENT_SOLID}; background: rgba(215,255,60,.06); }
    .lb-gh { height: ${HEAD}px; display: flex; align-items: center; gap: 10px; padding: 0 10px 0 ${PAD}px; cursor: grab; user-select: none; }
    .lb-gh b { font: 500 13px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_PRIMARY}; background: none; border: none; padding: 0; cursor: text; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lb-gh small { font: 500 12px ${MONO}; color: ${TEXT_MUTED}; }
    .lb-gh input { font: 500 13px ${MONO}; letter-spacing: .12em; text-transform: uppercase; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; border: 1px solid ${ACCENT_SOLID}; border-radius: 6px; padding: 3px 6px; width: 220px; outline: none; }
    .lb-gh .lb-gx { margin-left: auto; width: 28px; height: 28px; border-radius: 8px; border: none; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
    .lb-gh .lb-gx:hover { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
    .lb-grid { position: relative; margin: 0 ${PAD}px ${PAD}px; }
    .lb-card { position: absolute; width: ${CW}px; height: ${CH}px; }
    .lb-card.lifted { opacity: .3; } .lb-card.dim { opacity: .18; }
    .lb-face { width: 100%; height: 100%; padding: 0; border: none; border-radius: 6px; overflow: hidden; background: transparent; cursor: pointer; display: block; box-shadow: 0 6px 16px -8px rgba(0,0,0,.7); transition: transform .14s; }
    .lb-face:hover { transform: translateY(-2px); }
    .lb-face:focus-visible { outline: 3px solid ${ACCENT_SOLID}; outline-offset: 2px; }
    .lb-face svg { width: 100%; height: 100%; }
    .lb-stub { width: 100%; height: 100%; padding: 12px; display: flex; align-items: flex-start; }
    .lb-stub b { font: 400 22px/1.02 Anton, 'Bebas Neue', sans-serif; text-transform: uppercase; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
    .lb-name { position: absolute; left: 0; right: 0; bottom: 0; padding: calc(18px * var(--iz, 1)) calc(8px * var(--iz, 1)) calc(6px * var(--iz, 1)); font: 600 calc(12px * var(--iz, 1)) 'Inter', sans-serif; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,.78)); border-radius: 0 0 6px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0; transition: opacity .14s; pointer-events: none; }
    .lb-card:hover .lb-name, .lb-card:focus-within .lb-name { opacity: 1; }
    /* the delete button and the name keep their real size at any zoom, so they stay readable and a full 24-pixel target */
    .lb-x { position: absolute; top: 5px; right: 5px; width: 24px; height: 24px; transform: scale(var(--iz, 1)); transform-origin: top right; border-radius: 7px; border: none; background: rgba(12,13,16,.8); color: #fff; display: grid; place-items: center; cursor: pointer; opacity: 0; transition: opacity .14s; }
    .lb-card:hover .lb-x, .lb-x:focus-visible { opacity: 1; }
    @media (hover: none) { .lb-x, .lb-name { opacity: 1; } }
    .lb-ask { position: absolute; left: 6px; top: 6px; width: calc((100% - 12px) / var(--iz, 1)); transform: scale(var(--iz, 1)); transform-origin: top left; display: flex; gap: 4px; }
    .lb-ask button { flex: 1; height: 28px; border: none; border-radius: 7px; background: rgba(12,13,16,.9); color: #fff; font: 600 12px 'Inter', sans-serif; cursor: pointer; } .lb-ask .bad { background: ${DS_ERROR}; }
    .lb-drop { width: ${CW * 3 + GAP * 2}px; height: ${CH}px; border: 1.5px dashed ${DS_BORDER_STRONG}; border-radius: 8px; display: grid; place-items: center; color: ${TEXT_MUTED}; font: 600 13px 'Inter', sans-serif; text-align: center; padding: 10px; }
    .lb-ghost { position: fixed; z-index: 90; width: ${CW * 0.8}px; height: ${CH * 0.8}px; border-radius: 6px; overflow: hidden; pointer-events: none; transform: translate(-50%, -50%) rotate(-4deg); box-shadow: 0 20px 40px -12px rgba(0,0,0,.8); background: #0f1114; }
    .lb-dock { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 5; display: flex; align-items: center; gap: 2px; padding: 6px; border-radius: 16px; background: rgba(32,33,38,.94); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 16px 34px -12px rgba(0,0,0,.7); }
    .lb-dock button { height: 38px; min-width: 38px; padding: 0 10px; border: none; border-radius: 10px; background: none; color: #d9dbe0; font: 600 13px 'Inter', sans-serif; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
    .lb-dock button:hover { background: rgba(255,255,255,.08); }
    .lb-dock span.z { min-width: 46px; text-align: center; font: 600 13px 'Inter', sans-serif; color: #d9dbe0; }
    .lb-dock i { width: 1px; height: 22px; background: rgba(255,255,255,.12); margin: 0 4px; }
    .lb-map { position: absolute; right: 18px; bottom: 18px; z-index: 5; width: 160px; height: 100px; border-radius: 10px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; padding: 8px; cursor: pointer; }
    .lb-map > div { position: relative; width: 100%; height: 100%; }
    .lb-map b { position: absolute; background: rgba(255,255,255,.16); border-radius: 2px; }
    .lb-map em { position: absolute; border: 1.5px solid ${ACCENT_SOLID}; border-radius: 3px; }
    .lb-list { overflow-y: auto; padding: 18px 22px 40px; }
    .lb-row { display: grid; grid-template-columns: 52px minmax(0, 1fr) 180px 130px auto; align-items: center; gap: 14px; padding: 8px 6px; border-bottom: 1px solid ${DS_BORDER}; }
    .lb-row .t { font: 600 14px 'Inter', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
    .lb-row .m { font: 500 12px ${MONO}; letter-spacing: .1em; text-transform: uppercase; color: ${TEXT_MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .lb-row .th { width: 52px; height: 64px; display: grid; align-items: center; cursor: pointer; } .lb-row .th svg { width: 100%; height: auto; max-height: 64px; border-radius: 3px; }
    .lb-row select { height: 32px; border-radius: 8px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 500 13px 'Inter', sans-serif; padding: 0 6px; max-width: 100%; }
    .lb-icon { width: 32px; height: 32px; border-radius: 9px; border: none; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; } .lb-icon:hover { background: ${SURFACE_2}; color: ${DS_ERROR}; }
    .lb-search { display: flex; align-items: center; gap: 8px; height: 38px; width: 240px; padding: 0 11px; border-radius: 11px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: ${TEXT_MUTED}; }
    .lb-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: ${TEXT_PRIMARY}; font: 500 14px 'Inter', sans-serif; }
    .lb-new { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 16px; border-radius: 10px; border: none; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font: 700 14px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; }
    .lb-modes { display: flex; padding: 3px; gap: 2px; border-radius: 12px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; }
    .lb-modes button { height: 32px; padding: 0 16px; border: none; border-radius: 9px; background: none; color: ${TEXT_MUTED}; font: 600 13px 'Inter', sans-serif; cursor: pointer; }
    .lb-modes button[aria-pressed="true"] { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
    @media (min-width: 1000px) { .lb-modes { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); } }
    @media (max-width: 700px) { .lb-search, .lb-map { display: none; } .lb-row { grid-template-columns: 44px minmax(0, 1fr) auto; } .lb-row .m, .lb-row select { display: none; } .lb-start { padding: 12px 12px 14px; } .lb-new span { display: none; } }
`
