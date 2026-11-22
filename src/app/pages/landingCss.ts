import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_1, DS_BORDER, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT } from "../theme"

/* The landing page: one screen to say it, one screen to show the five tools, one line to close. Big words, few of them. */
export const LANDING_CSS = `
.ls * { box-sizing: border-box; }
.ls button { font-family: inherit; }
.ls-w { width: 100%; max-width: 1240px; margin: 0 auto; padding: 0 32px; }
.ls-cap { font: 500 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .22em; color: ${ACCENT_TEXT}; }

.ls-nav { display: flex; align-items: center; justify-content: space-between; height: 76px; }
.ls-brand { display: inline-flex; align-items: center; gap: 11px; background: none; border: none; cursor: pointer; color: ${TEXT_PRIMARY}; font: 500 14px 'JetBrains Mono', monospace; letter-spacing: .24em; padding: 0; }
.ls-in { background: none; border: 1px solid ${DS_BORDER}; color: ${TEXT_PRIMARY}; height: 40px; padding: 0 18px; border-radius: 999px; font-size: 14px; font-weight: 600; cursor: pointer; }
.ls-in:hover { border-color: ${TEXT_MUTED}; }

.ls-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 58px; padding: 0 34px; border-radius: 999px; font-size: 17px; font-weight: 700; cursor: pointer; border: none; transition: transform .15s ease; }
.ls-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; }
.ls-btn:hover { transform: translateY(-1px) scale(1.02); }
.ls-btn:focus-visible, .ls-tile:focus-visible, .ls-in:focus-visible, .ls-verbs button:focus-visible { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 3px; }

.ls-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 6vh; }
.ls-h1 { margin: 18px 0 0; font: 400 clamp(64px, 9.4vw, 136px)/.9 Anton, 'Barlow Condensed', sans-serif; letter-spacing: .004em; }
.ls-h1 em { font-style: normal; color: ${ACCENT_TEXT}; }
.ls-lead { margin: 22px 0 30px; font-size: 20px; line-height: 1.4; color: ${TEXT_MUTED}; }
.ls-verbs { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 22px; margin-top: 34px; }
.ls-verbs button { background: none; border: none; cursor: pointer; color: ${TEXT_MUTED}; font: 500 13px 'JetBrains Mono', monospace; letter-spacing: .2em; padding: 6px 0; }
.ls-verbs button:hover { color: ${TEXT_PRIMARY}; }
.ls-verbs b { color: ${ACCENT_TEXT}; font-weight: 500; margin-right: 8px; }

.ls-stage { position: relative; width: min(100%, 1040px); aspect-ratio: 16 / 9; margin-top: 48px; border-radius: 22px; overflow: hidden; border: 1px solid ${DS_BORDER}; box-shadow: 0 50px 120px -40px rgba(0,0,0,.7); }
.ls-stage svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ls-tag { position: absolute; border-radius: 999px; background: rgba(18,19,22,.82); color: #f5f5f7; padding: 6px 12px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.ls-tag i { font-style: normal; font-weight: 400; color: #c7c7cc; }

.ls-bento { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding-top: 120px; }
.ls-tile { position: relative; display: flex; flex-direction: column; text-align: left; min-height: 0; padding: 30px 30px 0; border-radius: 24px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: ${TEXT_PRIMARY}; cursor: pointer; overflow: hidden; scroll-margin-top: 24px; transition: border-color .2s ease; }
.ls-tile:hover { border-color: ${TEXT_MUTED}; }
.ls-tile.wide { grid-column: span 2; }
.ls-tile .n { font: 500 12px 'JetBrains Mono', monospace; letter-spacing: .2em; color: ${TEXT_MUTED}; }
.ls-tile h2 { margin: 10px 0 0; font: 400 clamp(48px, 5vw, 68px)/.95 Anton, 'Barlow Condensed', sans-serif; letter-spacing: .01em; }
.ls-tile h2 i { font-style: normal; color: ${ACCENT_TEXT}; }
.ls-tile p { margin: 12px 0 0; font-size: 18px; line-height: 1.4; color: ${TEXT_MUTED}; max-width: 340px; }
.ls-tile p b { color: ${TEXT_PRIMARY}; font-weight: 600; }
.ls-vis { position: relative; flex: 1; min-height: 190px; margin: 26px -30px 0; }
.ls-tt { display: block; }
.ls-film { margin: 24px 0 30px; }
.ls-clip { display: block; width: 100%; height: 100%; object-fit: cover; background: #15161a; }
.ls-film .ls-clip { aspect-ratio: 16 / 10; height: auto; border-radius: 14px; box-shadow: inset 0 0 0 1px ${DS_BORDER}; }
.ls-stage .ls-clip { position: absolute; inset: 0; }
.ls-tile.wide { display: grid; grid-template-columns: minmax(0, .62fr) minmax(0, 1.5fr); gap: 26px; align-items: center; padding-bottom: 30px; }
.ls-tile.wide .ls-film { margin: 0; }

.ls-frames { position: absolute; left: 30px; right: 30px; bottom: 30px; top: 24px; align-content: end; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.ls-fr { position: relative; aspect-ratio: 3 / 2; border-radius: 10px; background: #1d5a2c; border: 1px solid rgba(255,255,255,.14); }
.ls-fr::before { content: ""; position: absolute; inset: 8% 6%; border: 1.5px solid rgba(255,255,255,.4); }
.ls-fr::after { content: ""; position: absolute; left: 50%; top: 8%; bottom: 8%; border-left: 1.5px solid rgba(255,255,255,.4); }
.ls-fr b { position: absolute; left: 10px; top: -24px; font: 500 11px 'JetBrains Mono', monospace; letter-spacing: .16em; color: ${TEXT_MUTED}; }
.ls-fr i { position: absolute; width: 14px; height: 14px; margin: -7px; border-radius: 50%; background: #a11d48; border: 2px solid #fff; z-index: 1; }
.ls-fr i.blue { background: #1f4ba0; }
.ls-fr.on { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 3px; }

.ls-shot { position: absolute; left: 30px; right: 30px; bottom: 30px; top: 0; border-radius: 14px; overflow: hidden; background: linear-gradient(170deg, #2f7a3e 0%, #24632f 55%, #1b4d25 100%); }
.ls-shot::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 40px, transparent 40px 80px); }
.ls-sig { position: absolute; display: flex; align-items: stretch; transform: translate(-50%, -100%); }
.ls-sig span { background: #121316; color: #fff; font: 700 12px 'Inter', sans-serif; letter-spacing: .08em; padding: 5px 9px; clip-path: polygon(0 0, 100% 0, 100% 70%, 88% 100%, 0 100%); }
.ls-sig s { width: 6px; background: #a11d48; text-decoration: none; }
.ls-ring { position: absolute; width: 46px; height: 16px; margin: -8px -23px; border-radius: 50%; border: 2.5px solid ${ACCENT_SOLID}; }
.ls-min { position: absolute; left: 12px; top: 12px; background: #e53935; color: #fff; font: 700 12px 'Inter', sans-serif; padding: 4px 9px; border-radius: 999px; }

.ls-tpl { position: absolute; left: 50%; top: 6px; width: min(66%, 300px); transform: translateX(-50%) rotate(-3deg); border-radius: 10px; overflow: hidden; box-shadow: 0 30px 60px -20px rgba(0,0,0,.7); background: #f4efe2; aspect-ratio: 4 / 5; }

.ls-wall { position: absolute; left: 30px; right: 30px; bottom: 30px; top: 0; border-radius: 14px; background: #c9c4b8; background-image: radial-gradient(rgba(0,0,0,.08) 1px, transparent 1.4px); background-size: 14px 14px; box-shadow: inset 0 0 0 8px #3a352e; }
.ls-slip { position: absolute; padding: 9px 11px; font: 700 15px/1.15 Kalam, cursive; color: #1b1b1b; box-shadow: 0 6px 14px -6px rgba(0,0,0,.4); display: flex; align-items: flex-start; }

.ls-cards { position: absolute; inset: 0 30px 0; }
.ls-card { position: absolute; width: 46%; aspect-ratio: 5 / 7; border-radius: 14px; overflow: hidden; box-shadow: 0 24px 50px -18px rgba(0,0,0,.7); }
.ls-card > * { position: absolute; }
.ls-card b { font: 400 18px Anton, sans-serif; letter-spacing: .04em; }
.ls-card small { font: 500 10px 'JetBrains Mono', monospace; letter-spacing: .14em; }
.ls-card .face { left: 50%; top: 18%; width: 34%; aspect-ratio: 1; margin-left: -17%; border-radius: 50%; background: ${ACCENT_SOLID}; }

.ls-end { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 150px 0 120px; }
.ls-end h2 { margin: 0; font: 400 clamp(64px, 9vw, 128px)/.9 Anton, 'Barlow Condensed', sans-serif; }
.ls-end h2 em { font-style: normal; color: ${ACCENT_TEXT}; }
.ls-end p { margin: 22px 0 32px; font-size: 20px; color: ${TEXT_MUTED}; }
.ls-foot { border-top: 1px solid ${DS_BORDER}; }
.ls-foot .ls-w { display: flex; justify-content: space-between; gap: 16px; padding-top: 26px; padding-bottom: 30px; font-size: 13px; color: ${TEXT_MUTED}; }
.ls-sticky { display: none; }

@keyframes lpA { 0%, 15% { transform: translate(0,0) } 45%, 60% { transform: translate(120px,-70px) } 90%, 100% { transform: translate(0,0) } }
@keyframes lpB { 0%, 20% { transform: translate(0,0) } 50%, 65% { transform: translate(-60px,-110px) } 95%, 100% { transform: translate(0,0) } }
@keyframes lpC { 0%, 25% { transform: translate(0,0) } 55%, 70% { transform: translate(90px,40px) } 100% { transform: translate(0,0) } }
@keyframes lpBall { 0%, 15% { transform: translate(0,0) } 35% { transform: translate(118px,-68px) } 55% { transform: translate(58px,-178px) } 75%, 100% { transform: translate(0,0) } }
@keyframes lpDash { to { stroke-dashoffset: -60 } }
.lp-a { animation: lpA 6s ease-in-out infinite } .lp-b { animation: lpB 6s ease-in-out infinite } .lp-c { animation: lpC 6s ease-in-out infinite }
.lp-ball { animation: lpBall 6s ease-in-out infinite } .lp-dash { stroke-dasharray: 6 6; animation: lpDash 1.4s linear infinite }

@media (max-width: 980px) {
  .ls-bento { grid-template-columns: 1fr 1fr; }
  .ls-tile.wide { grid-column: span 2; }
}
@media (max-width: 760px) { .ls-tile.wide { display: flex; } .ls-tile.wide .ls-film { margin: 22px 0 22px; } }
@media (max-width: 680px) {
  .ls-w { padding: 0 18px; }
  .ls-nav { height: 64px; }
  .ls-brand span { display: none; }
  .ls-hero { padding-top: 4vh; }
  .ls-lead { font-size: 17px; margin: 16px 0 24px; }
  .ls-verbs { gap: 4px 16px; margin-top: 26px; }
  .ls-stage { margin-top: 32px; border-radius: 16px; }
  .ls-tag { font-size: 11px; padding: 4px 9px; }
  .ls-bento { grid-template-columns: 1fr; gap: 12px; padding-top: 72px; }
  .ls-tile.wide { grid-column: auto; }
  .ls-tile { padding: 24px 22px 0; border-radius: 20px; }
  .ls-film { margin: 20px 0 22px; }
  .ls-vis { margin: 22px -22px 0; }
  .ls-frames, .ls-shot, .ls-wall { left: 22px; right: 22px; bottom: 22px; }
    .ls-cards { inset: 0 22px 0; }
  .ls-end { padding: 96px 0 120px; }
  .ls-end p { font-size: 17px; }
  .ls-foot .ls-w { flex-direction: column; padding-bottom: 100px; }
  .ls-sticky { display: block; position: fixed; left: 16px; right: 16px; bottom: calc(14px + env(safe-area-inset-bottom)); z-index: 20; transition: opacity .2s ease, transform .2s ease; }
  .ls-sticky.off { opacity: 0; transform: translateY(20px); pointer-events: none; }
  .ls-sticky .ls-btn { width: 100%; box-shadow: 0 12px 30px -10px rgba(0,0,0,.6); }
}
@media (prefers-reduced-motion: reduce) {
  .lp-a, .lp-b, .lp-c, .lp-ball, .lp-dash { animation: none; }
  .ls-btn, .ls-tile { transition: none; } .ls-btn:hover { transform: none; }
}
`
