import { SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, DS_ERROR, ACCENT_SOLID, ACCENT_INK, ACCENT_SOFT, ACCENT_TEXT, TEXT_PRIMARY, TEXT_MUTED } from "../theme"

/* The styles of the Live Analysis edit suite (and the mark panel it shares with the video editor) */
export const SUITE_CSS = `        .an-icon.ghost { border-color: transparent; background: none; color: ${TEXT_MUTED}; } .an-icon.ghost:not(:disabled):hover { color: ${TEXT_PRIMARY}; background: ${SURFACE_1}; }
        .an-icon { width: 36px; height: 36px; display: inline-grid; place-items: center; border-radius: 10px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; cursor: pointer; flex-shrink: 0; }
        .an-icon:disabled { opacity: .4; cursor: default; }
        .an-icon.bad { color: ${DS_ERROR}; }
        .an-btn { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 600 13px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        .an-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; border-radius: 10px; padding: 0 16px; }
        .an-btn:disabled { opacity: .45; cursor: default; }
        .an-view { position: relative; min-width: 0; min-height: 0; display: flex; padding: 12px 12px 84px; }
        .an-wrap { position: relative; margin: auto; flex-shrink: 0; box-shadow: 0 10px 40px rgba(0,0,0,.45); } /* auto margins centre it, and still let a zoomed shot scroll to every edge */
        .an-hint { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); background: rgba(12,14,18,.82); color: #f5f5f7; font: 500 12.5px 'Inter', sans-serif; padding: 7px 12px; border-radius: 999px; pointer-events: none; white-space: nowrap; max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; }
        .an-zoom { display: flex; align-items: center; gap: 6px; justify-content: flex-end; padding: 6px 12px; color: #c9ccd2; font: 500 12px 'Inter', sans-serif; }
        .an-zoom button { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #f5f5f7; display: grid; place-items: center; cursor: pointer; }
        .an-insp { border-left: 1px solid ${DS_BORDER}; padding: 16px; overflow-y: auto; min-height: 0; }
        .an-cap { font: 500 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; margin: 0 0 12px; }
        .an-head { display: flex; align-items: center; gap: 12px; margin: 0 0 20px; }
        .an-ico { width: 44px; height: 44px; border-radius: 12px; background: ${SURFACE_2}; display: grid; place-items: center; color: ${TEXT_PRIMARY}; flex-shrink: 0; }
        .an-big { margin: 4px 0 0; font: 400 28px/1.04 'Anton', 'Bebas Neue', sans-serif; letter-spacing: .01em; text-transform: uppercase; color: ${TEXT_PRIMARY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .an-looks { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .an-looks button { background: none; border: none; padding: 0; text-align: left; cursor: pointer; color: ${TEXT_MUTED}; font: 500 12.5px 'Inter', sans-serif; }
        .an-looks svg { display: block; width: 100%; height: auto; border-radius: 10px; outline: 1px solid ${DS_BORDER}; outline-offset: 0; transition: outline-color .14s; }
        .an-looks button:hover svg { outline-color: ${DS_BORDER_STRONG}; }
        .an-looks button.on svg { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .an-looks button.on span { color: ${TEXT_PRIMARY}; font-weight: 600; }
        .an-looks button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; border-radius: 10px; }
        .an-looks span { display: block; margin-top: 7px; }
        .an-row { display: flex; flex-direction: column; gap: 7px; margin-bottom: 15px; }
        .an-lab { font: 500 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .an-inp { width: 100%; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 10px; color: ${TEXT_PRIMARY}; font: 500 14px 'Inter', sans-serif; padding: 9px 11px; resize: vertical; }
        .an-inp:focus { outline: none; border-color: ${ACCENT_SOLID}; box-shadow: 0 0 0 3px ${ACCENT_SOFT}; }
        .an-cols { display: flex; flex-wrap: wrap; gap: 7px; }
        .an-sw { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(128,128,128,.4); cursor: pointer; padding: 0; }
        .an-sw.on { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .an-any { background: none; overflow: hidden; }
        .an-seg { display: inline-flex; background: ${SURFACE_2}; border-radius: 10px; padding: 3px; gap: 2px; flex-wrap: wrap; }
        .an-seg button { border: none; background: none; color: ${TEXT_MUTED}; font: 500 12.5px 'Inter', sans-serif; padding: 6px 11px; border-radius: 8px; cursor: pointer; }
        .an-seg button.on { background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .an-slide { display: flex; align-items: center; gap: 10px; } .an-slide input { flex: 1; accent-color: ${ACCENT_TEXT}; } .an-slide span { font-size: 12px; color: ${TEXT_MUTED}; width: 38px; text-align: right; }
        .an-note { font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.5; margin: 0 0 12px; }
        .an-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 20px; }
        .an-act { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 42px; border-radius: 10px; border: 1px solid ${DS_BORDER_STRONG}; background: none; color: ${TEXT_PRIMARY}; font: 600 13.5px 'Inter', sans-serif; cursor: pointer; }
        .an-act:hover { background: ${SURFACE_1}; } .an-act.bad { color: ${DS_ERROR}; }
        .an-act.sm { height: 36px; border-color: ${DS_BORDER}; color: ${TEXT_MUTED}; font-weight: 500; font-size: 12.5px; }
        .an-toast { position: fixed; left: 50%; bottom: 110px; transform: translateX(-50%); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; font: 500 13px 'Inter', sans-serif; padding: 10px 16px; border-radius: 999px; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,.3); max-width: calc(100vw - 32px); }
        .an-spin { animation: anSpin 1s linear infinite; } @keyframes anSpin { to { transform: rotate(360deg); } }
        .la-page { height: 100vh; display: grid; grid-template-rows: 56px minmax(0,1fr) var(--rh, 128px); grid-template-columns: var(--lw, 52px) minmax(0,1fr) var(--rw, 300px);
          grid-template-areas: "top top top" "left main right" "left reel reel"; background: #17181b; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; overflow: hidden; }
        .la-page * { box-sizing: border-box; }
        .la-page.over::after { content: "Drop to add to this folder"; position: fixed; inset: 10px; border: 2px dashed #d7ff3c; border-radius: 16px; background: rgba(215,255,60,.06); display: grid; place-items: center; font: 800 28px 'Barlow Condensed', sans-serif; letter-spacing: .04em; text-transform: uppercase; color: #d7ff3c; z-index: 60; pointer-events: none; }
        .la-top { grid-area: top; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid ${DS_BORDER}; background: ${SURFACE_BASE}; min-width: 0; }
        .la-home { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; border: none; background: none; cursor: pointer; }
        .la-crumb { display: flex; flex-direction: column; min-width: 0; flex: 0 1 460px; }
        .la-title { background: none; border: 1px solid transparent; border-radius: 7px; color: ${TEXT_PRIMARY}; font: 600 15px 'Inter', sans-serif; padding: 2px 6px; margin-left: -6px; min-width: 0; text-overflow: ellipsis; }
        .la-title:hover { border-color: ${DS_BORDER}; } .la-title:focus { outline: none; border-color: ${ACCENT_SOLID}; background: ${SURFACE_1}; }
        .la-sub { font-size: 12px; color: ${TEXT_MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 6px; align-items: center; }
        .la-sub a, .la-sub button { color: ${TEXT_MUTED}; background: none; border: none; padding: 0; font: inherit; cursor: pointer; } .la-sub a:hover, .la-sub button:hover { color: ${TEXT_PRIMARY}; }
        .la-saved { color: #d7ff3c; font-weight: 600; } .la-saving { color: ${TEXT_MUTED}; } .la-err { color: #ff8fa3; font-weight: 600; }
        .la-sp { flex: 1; }
        .la-seg { display: inline-flex; padding: 3px; border-radius: 10px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; }
        .la-seg button { border: none; background: none; color: ${TEXT_MUTED}; font: 600 13px 'Inter', sans-serif; padding: 6px 13px; border-radius: 8px; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
        .la-seg button.on { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
        .la-seg button:disabled { opacity: .4; cursor: default; }
        .la-left { grid-area: left; border-right: 1px solid ${DS_BORDER}; background: #1c1d21; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        .la-left .la-strip { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-top: 12px; }
        .la-vert { writing-mode: vertical-rl; transform: rotate(180deg); font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .28em; color: ${TEXT_MUTED}; background: none; border: none; cursor: pointer; padding: 6px 0; }
        .la-tree { padding: 12px 10px; overflow-y: auto; }
        .la-tree h4 { margin: 4px 8px 8px; font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .26em; text-transform: uppercase; color: ${TEXT_MUTED}; display: flex; justify-content: space-between; align-items: center; }
        .la-fi { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border-radius: 8px; border: none; background: none; color: #d6d6dc; font: 500 13px 'Inter', sans-serif; cursor: pointer; text-align: left; }
        .la-fi:hover { background: ${SURFACE_1}; } .la-fi.on { background: rgba(215,255,60,.12); color: #fff; } .la-fi.on svg { color: #d7ff3c; }
        .la-fi em { margin-left: auto; font-style: normal; color: ${TEXT_MUTED}; font-size: 12px; }
        .la-main { grid-area: main; display: flex; flex-direction: column; min-width: 0; min-height: 0; background: #121316; }
        .la-chips { display: flex; align-items: center; gap: 8px; padding: 10px 16px 0; flex-wrap: wrap; }
        .la-chip { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: #d6d6dc; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; }
        .la-chip:hover { border-color: ${DS_BORDER_STRONG}; }
        .la-chip.v { background: rgba(215,255,60,.13); color: #d7ff3c; border-color: rgba(215,255,60,.35); }
        .la-chip.on { border-color: #d7ff3c; color: #fff; }
        .la-chip i { width: 11px; height: 11px; border-radius: 50%; display: block; box-shadow: 0 0 0 1px rgba(0,0,0,.4); }
        .la-stagebox { position: relative; flex: 1; min-height: 0; display: flex; }
        .la-stagebox > .an-view, .la-stagebox > .vs { flex: 1; }
        .la-stagebox .an-view { padding: 12px 16px 76px; }
        .la-dock { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 7; display: flex; gap: 2px; padding: 5px; border-radius: 14px; background: rgba(22,23,27,.94); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 10px 30px rgba(0,0,0,.45); }
        .la-dock .sep { width: 1px; margin: 6px 3px; background: rgba(255,255,255,.1); }
        .la-tool { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 54px; padding: 6px 0 5px; border: none; border-radius: 10px; background: none; color: #d6d6dc; font: 600 10.5px 'Inter', sans-serif; cursor: pointer; position: relative; }
        .la-tool:hover { background: rgba(255,255,255,.07); color: #fff; }
        .la-tool.on { background: #d7ff3c; color: #0a0c0f; }
        .la-tool:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
        .la-notes { margin: 0 16px 12px; background: #0f1013; border: 1px solid ${DS_BORDER}; border-top: 3px solid #d7ff3c; border-radius: 0 0 10px 10px; padding: 10px 14px 12px; display: flex; gap: 16px; align-items: flex-end; }
        .la-notes.off { border-top-color: ${DS_BORDER_STRONG}; padding: 8px 14px; align-items: center; }
        .la-narroff { flex: 1; margin: 0; font: 400 13px/1.4 'Inter', sans-serif; color: #8e929b; }
        .la-switch { display: inline-flex; align-items: center; gap: 9px; height: 30px; padding: 0 4px 0 10px; border-radius: 15px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; flex: none; flex-direction: row-reverse; }
        .la-switch i { position: relative; width: 30px; height: 18px; border-radius: 9px; background: #3a3e46; transition: background .15s; }
        .la-switch i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
        .la-switch.on i { background: #d7ff3c; } .la-switch.on i::after { transform: translateX(12px); background: #0f1013; }
        .la-switch:focus-visible { outline: 2px solid #d7ff3c; outline-offset: 2px; }
        .la-notes input, .la-notes textarea { background: none; border: 1px solid transparent; border-radius: 6px; color: ${TEXT_PRIMARY}; width: 100%; padding: 2px 6px; margin-left: -6px; resize: none; }
        .la-notes input:hover, .la-notes textarea:hover { border-color: ${DS_BORDER}; }
        .la-notes input:focus, .la-notes textarea:focus { outline: none; border-color: rgba(215,255,60,.5); background: rgba(255,255,255,.03); }
        .la-kick { font: 600 13px 'Barlow Condensed', sans-serif !important; letter-spacing: .26em; text-transform: uppercase; color: #d7ff3c !important; }
        .la-head { font: 800 30px/1.05 'Barlow Condensed', sans-serif !important; text-transform: uppercase; letter-spacing: .02em; }
        .la-body { font: 400 14px/1.5 'Inter', sans-serif !important; color: #c3c6cd !important; }
        .la-right { grid-area: right; position: relative; background: #1c1d21; border-left: 1px solid ${DS_BORDER}; min-height: 0; display: flex; flex-direction: column; }
        .la-right .an-insp { border-left: none; flex: 1; }
        .la-edge { position: absolute; left: -4px; top: 0; bottom: 0; width: 8px; cursor: ew-resize; z-index: 5; }
        .la-edge:hover, .la-edge:focus-visible { background: rgba(215,255,60,.35); outline: none; }
        .la-rhead { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 0 16px; }
        .la-reel { grid-area: reel; background: #1c1d21; border-top: 1px solid ${DS_BORDER}; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        .la-reelbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; min-height: 40px; }
        .la-reelbar .lab { font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .26em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .la-tiny { height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid transparent; background: none; color: ${TEXT_MUTED}; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .la-tiny:hover { color: ${TEXT_PRIMARY}; background: ${SURFACE_1}; } .la-tiny.on { color: #0a0c0f; background: #d7ff3c; } .la-tiny.bad { color: #ff8fa3; }
        .la-tiny:disabled { opacity: .4; cursor: default; }
        .la-tiles { display: flex; gap: 10px; padding: 2px 16px 12px; overflow-x: auto; align-items: center; }
        .la-tile { position: relative; flex: none; width: 116px; height: 66px; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: #0e0f12 center/cover no-repeat; cursor: pointer; padding: 0; }
        .la-tile.on { outline: 2px solid #d7ff3c; outline-offset: 2px; }
        .la-tile.over { box-shadow: -4px 0 0 #d7ff3c; }
        .la-tile b { position: absolute; left: 5px; top: 4px; font: 700 10px 'Inter', sans-serif; color: #fff; background: rgba(10,12,15,.78); padding: 1px 5px; border-radius: 4px; }
        .la-tile .vid { position: absolute; right: 4px; bottom: 4px; font: 700 9.5px 'Inter', sans-serif; color: #d7ff3c; background: rgba(10,12,15,.82); padding: 1px 5px; border-radius: 3px; }
        .la-tile.sel { outline: 3px solid #d7ff3c; outline-offset: 2px; box-shadow: inset 0 0 0 999px rgba(215,255,60,.18); }
        .la-tile .tick { position: absolute; right: 5px; top: 5px; width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid #fff; background: rgba(10,12,15,.6); display: grid; place-items: center; color: #0a0c0f; }
        .la-tile .tick.on { background: #d7ff3c; border-color: #d7ff3c; }
        .la-add { flex: none; width: 66px; height: 66px; border-radius: 8px; border: 1.5px dashed rgba(255,255,255,.22); background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
        .la-add:hover { color: #d7ff3c; border-color: #d7ff3c; }
        .la-empty { margin: auto; text-align: center; max-width: 520px; padding: 30px; color: #c9ccd2; }
        .la-empty h2 { font: 800 34px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; color: #fff; margin: 10px 0 8px; }
        .la-keys { position: fixed; inset: 0; background: rgba(8,9,12,.7); z-index: 50; display: grid; place-items: center; }
        .la-keys > div { width: min(640px, 92vw); background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 16px; padding: 20px 22px; box-shadow: 0 30px 80px rgba(0,0,0,.6); }
        .la-keys h3 { margin: 0 0 14px; font: 800 26px 'Barlow Condensed', sans-serif; text-transform: uppercase; }
        .la-keys .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; }
        .la-keys .grid div { display: flex; gap: 10px; align-items: center; font-size: 13px; color: #d6d6dc; }
        .la-keys kbd { min-width: 30px; text-align: center; font: 600 12px 'Inter', sans-serif; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 6px; padding: 3px 7px; color: #fff; }
        .la-pop { position: absolute; z-index: 40; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 12px; padding: 6px; min-width: 220px; box-shadow: 0 14px 40px rgba(0,0,0,.45); }
        .la-pop button { display: flex; width: 100%; align-items: center; gap: 10px; background: none; border: none; color: ${TEXT_PRIMARY}; font: 500 13px 'Inter', sans-serif; padding: 8px 10px; border-radius: 8px; cursor: pointer; text-align: left; }
        .la-pop button:hover { background: ${SURFACE_2}; } .la-pop small { color: ${TEXT_MUTED}; margin-left: auto; }
        .an-sep { height: 1px; background: ${DS_BORDER}; margin: 16px 0 12px; }
        .an-layers { display: flex; flex-direction: column; gap: 2px; }
        .an-layer { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 4px; border-radius: 8px; cursor: pointer; font-size: 13px; color: #d6d6dc; border: 1px solid transparent; }
        .an-layer:hover { background: ${SURFACE_1}; } .an-layer.on { background: rgba(215,255,60,.1); color: #fff; } .an-layer.over { border-top-color: #d7ff3c; }
        .an-layer.joined { margin-top: -2px; }
        .an-grip { color: #6f7079; cursor: grab; flex: none; }
        .an-stepno { width: 20px; height: 20px; border-radius: 6px; background: ${SURFACE_2}; display: grid; place-items: center; font: 700 11px 'Inter', sans-serif; color: ${TEXT_MUTED}; flex: none; }
        .an-layer.joined .an-stepno { background: none; border-left: 2px solid rgba(215,255,60,.45); border-radius: 0; width: 12px; margin-left: 4px; margin-right: 4px; }
        .an-lname { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .an-lkind { font-size: 11px; color: ${TEXT_MUTED}; }
        .an-link { width: 24px; height: 24px; border-radius: 6px; border: none; background: none; color: #6f7079; display: grid; place-items: center; cursor: pointer; flex: none; }
        .an-link:hover { color: #fff; background: ${SURFACE_2}; } .an-link.on { color: #d7ff3c; }
        .an-teams { display: grid; gap: 8px; margin-bottom: 8px; }
        .an-team { display: flex; gap: 8px; align-items: center; }
        .an-team input[type=color] { width: 34px; height: 34px; border-radius: 9px; border: 1px solid ${DS_BORDER}; padding: 2px; background: none; flex: none; cursor: pointer; }
        .an-cal .an-mini { width: 100%; height: auto; display: block; margin: 10px 0 12px; }
        .an-cal .an-mini g:focus-visible circle:last-of-type { stroke: #fff; stroke-width: 2; }
        .an-pins { list-style: none; padding: 0; margin: 0 0 10px; display: grid; gap: 4px; }
        .an-pins li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #d6d6dc; }
        .an-pins li b { width: 20px; height: 20px; border-radius: 50%; background: #d7ff3c; color: #0a0c0f; display: grid; place-items: center; font-size: 11px; flex: none; }
        .an-pins li span { flex: 1; min-width: 0; }
        .an-x { width: 24px; height: 24px; border-radius: 6px; border: none; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
        .an-x:hover { color: #fff; background: ${SURFACE_2}; }
        .an-act.pri { background: #d7ff3c; color: #0a0c0f; border-color: #d7ff3c; }
        .an-act:disabled { opacity: .4; cursor: default; }
        @media (max-width: 1100px) { .la-tool { width: 46px; font-size: 9.5px; } }
`
void ACCENT_INK; void DS_ERROR; void ACCENT_SOFT; void ACCENT_TEXT
