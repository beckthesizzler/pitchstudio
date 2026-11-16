import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_1, SURFACE_2, DS_BORDER, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT } from "../theme"

/* The landing page's styles: theme variables for surfaces and text; the pitches, felt wall and paper keep their own colours. */
export const LANDING_CSS = `
.ls * { box-sizing: border-box; }
.ls-w { max-width: 1240px; margin: 0 auto; padding: 0 24px; }
.ls-cap { font: 500 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .18em; color: ${ACCENT_TEXT}; }
.ls-nav { display: flex; align-items: center; gap: 22px; padding: 22px 0; }
.ls-brand { display: flex; align-items: center; gap: 10px; margin-right: auto; background: none; border: none; color: ${TEXT_PRIMARY}; cursor: pointer; padding: 0; }
.ls-brand span { font: 500 14px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .22em; }
.ls-link { background: none; border: none; color: ${TEXT_MUTED}; font: 500 14px 'Inter', sans-serif; cursor: pointer; padding: 6px 0; }
.ls-link:hover { color: ${TEXT_PRIMARY}; }
.ls-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 999px; font: 700 16px 'Inter', sans-serif; cursor: pointer; height: 52px; padding: 0 24px; white-space: nowrap; }
.ls-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border: none; }
.ls-btn.pri:hover { filter: brightness(1.06); }
.ls-btn.sec { background: transparent; color: ${TEXT_PRIMARY}; border: 1px solid ${DS_BORDER}; font-weight: 600; }
.ls-btn.sec:hover { border-color: ${TEXT_MUTED}; }
.ls-btn.sm { height: 42px; padding: 0 18px; font-size: 14px; }
.ls-hero { display: flex; flex-wrap: wrap; gap: 48px; align-items: center; padding: 40px 0 64px; }
.ls-hero-l { flex: 1 1 440px; display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.ls-h1 { margin: 0; font-family: Anton, 'Barlow Condensed', sans-serif; font-weight: 400; font-size: 84px; line-height: .98; letter-spacing: .005em; }
.ls-lead { margin: 0; font-size: 19px; line-height: 1.55; color: ${TEXT_MUTED}; max-width: 520px; }
.ls-row { display: flex; flex-wrap: wrap; gap: 12px; }
.ls-small { font-size: 13px; color: ${TEXT_MUTED}; }
.ls-hero-r { flex: 1 1 520px; display: flex; flex-direction: column; gap: 14px; align-items: center; min-width: 0; }
.ls-panel { background: ${SURFACE_1}; border-radius: 20px; border: 1px solid ${DS_BORDER}; }
.ls-stage { width: 100%; height: 470px; display: flex; align-items: center; justify-content: center; }
.ls-frame { position: relative; overflow: hidden; border-radius: 10px; background: #1d5a2c; transition: width .4s ease; }
.ls-frame svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ls-tag { position: absolute; border-radius: 999px; background: rgba(18,19,22,.8); color: #f5f5f7; padding: 5px 10px; font-size: 11px; font-weight: 700; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.ls-tag i { font-style: normal; font-weight: 400; color: #c7c7cc; }
.ls-fmt { height: 40px; padding: 0 14px; border-radius: 999px; font: 600 13px 'Inter', sans-serif; cursor: pointer; background: transparent; color: ${TEXT_PRIMARY}; border: 1px solid ${DS_BORDER}; }
.ls-fmt[aria-pressed="true"] { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; }
.ls-strip { border-top: 1px solid ${DS_BORDER}; border-bottom: 1px solid ${DS_BORDER}; }
.ls-strip .ls-w { padding-top: 22px; padding-bottom: 22px; display: flex; flex-wrap: wrap; gap: 14px 40px; justify-content: space-between; font: 500 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .14em; color: ${TEXT_MUTED}; }
.ls-sec { display: flex; flex-wrap: wrap; gap: 48px; align-items: center; padding: 96px 0 40px; }
.ls-sec.rev { flex-wrap: wrap-reverse; padding-top: 72px; }
.ls-txt { flex: 1 1 380px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ls-h2 { margin: 0; font-size: 44px; line-height: 1.08; font-weight: 800; letter-spacing: -.01em; }
.ls-p { margin: 0; font-size: 17px; line-height: 1.6; color: ${TEXT_MUTED}; }
.ls-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; font-size: 15px; }
.ls-list li { display: flex; gap: 10px; } .ls-list li span { color: ${ACCENT_TEXT}; }
.ls-art { flex: 1 1 560px; min-width: 0; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.ls-frames { display: flex; gap: 10px; }
.ls-fr { flex: 1; aspect-ratio: 16 / 10; border-radius: 8px; background: #1d5a2c; position: relative; }
.ls-fr.on { border: 2px solid #d7ff3c; }
.ls-fr b { position: absolute; left: 8px; top: 6px; font: 500 10px 'JetBrains Mono', monospace; color: rgba(255,255,255,.7); }
.ls-fr.on b { color: #d7ff3c; }
.ls-fr i { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: #a11d48; border: 2px solid #fff; }
.ls-fr i.blue { background: #1f4ba0; }
.ls-bar { height: 6px; border-radius: 3px; background: ${SURFACE_2}; position: relative; overflow: hidden; }
.ls-bar span { position: absolute; left: 0; top: 0; height: 6px; width: 62%; border-radius: 3px; background: ${ACCENT_SOLID}; animation: lsPlay 6s ease-in-out infinite; }
@keyframes lsPlay { 0% { width: 4%; } 90%, 100% { width: 100%; } }
.ls-chip { height: 34px; padding: 0 14px; border-radius: 999px; background: ${SURFACE_2}; font-size: 13px; display: inline-flex; align-items: center; }
.ls-live { flex: 1 1 560px; min-width: 0; padding: 20px; display: flex; flex-wrap: wrap; gap: 16px; }
.ls-screen { flex: 1 1 300px; aspect-ratio: 16 / 9; border-radius: 10px; background: #0e0f11; position: relative; overflow: hidden; }
.ls-moments { flex: 1 1 180px; display: flex; flex-direction: column; gap: 8px; }
.ls-moments > span:first-child { font: 500 11px 'JetBrains Mono', monospace; letter-spacing: .14em; color: ${TEXT_MUTED}; }
.ls-mo { background: ${SURFACE_2}; border-radius: 10px; padding: 10px 12px; font-size: 13px; display: flex; gap: 8px; border: 1px solid transparent; }
.ls-mo b { color: ${ACCENT_TEXT}; } .ls-mo.now { border-color: ${ACCENT_SOLID}; }
.ls-head { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; justify-content: space-between; }
.ls-more { background: none; border: none; padding: 0; min-height: 44px;color: ${ACCENT_TEXT}; font: 600 15px 'Inter', sans-serif; cursor: pointer; text-decoration: underline; text-underline-offset: 4px; }
.ls-tpls { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x proximity; scrollbar-width: thin; }
.ls-tpl { margin: 0; flex: 0 0 260px; display: flex; flex-direction: column; gap: 10px; scroll-snap-align: start; }
.ls-tpl .th { width: 260px; height: 328px; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${SURFACE_2}; }
.ls-tpl .th > svg, .ls-tpl .th > div { width: 100%; }
.ls-tpl figcaption { font-size: 14px; line-height: 1.45; } .ls-tpl figcaption span { color: ${TEXT_MUTED}; }
.ls-journal { width: 100%; height: 100%; background-color: #f7f3ea; background-image: radial-gradient(#d8d0bf 1px, transparent 1.2px); background-size: 14px 14px; color: #1f3e8c; padding: 18px; display: flex; flex-direction: column; gap: 8px; font-family: Kalam, cursive; }
.ls-journal small { font: 500 9px 'JetBrains Mono', monospace; letter-spacing: .16em; color: #8a8172; }
.ls-journal > span { font-size: 15px; border-bottom: 1px solid #d8d0bf; } .ls-journal b { color: #b3261e; }
.ls-own { border: 2px dashed var(--ps-bd2); background: transparent !important; flex-direction: column; gap: 10px; color: ${TEXT_MUTED}; cursor: pointer; font: 500 15px 'Inter', sans-serif; }
.ls-own b { font-size: 40px; line-height: 1; color: ${ACCENT_TEXT}; font-weight: 400; }
.ls-wall { flex: 1 1 560px; min-width: 0; height: 340px; border-radius: 14px; border: 10px solid #3a332d; background: #cbc6bc; position: relative; overflow: hidden; }
.ls-slip { position: absolute; box-shadow: 0 2px 3px rgba(0,0,0,.2); font: 700 16px/1.15 Kalam, cursive; color: #1b1c20; padding: 14px 12px 0; }
.ls-cards { flex: 1 1 400px; min-width: 0; display: flex; justify-content: center; gap: 18px; flex-wrap: wrap; padding: 10px 0; }
.ls-card { width: 200px; height: 280px; border-radius: 16px; position: relative; overflow: hidden; }
.ls-card div { position: absolute; border-radius: 10px; }
.ls-card b { position: absolute; font: 400 22px Anton, sans-serif; }
.ls-card small { position: absolute; font: 500 9px 'JetBrains Mono', monospace; letter-spacing: .16em; }
.ls-end { display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center; padding: 110px 0 120px; }
.ls-end h2 { margin: 0; font-family: Anton, 'Barlow Condensed', sans-serif; font-weight: 400; font-size: 76px; line-height: 1; }
.ls-foot { border-top: 1px solid ${DS_BORDER}; }
.ls-foot .ls-w { padding-top: 28px; padding-bottom: 28px; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; font-size: 13px; color: ${TEXT_MUTED}; }
.ls-sticky { display: none; }
.ls-rise { opacity: 0; transform: translateY(16px); transition: opacity .5s ease, transform .5s ease; }
.ls-rise.in { opacity: 1; transform: none; }
@keyframes lpA { 0%, 15% { transform: translate(0,0) } 45%, 60% { transform: translate(120px,-70px) } 90%, 100% { transform: translate(0,0) } }
@keyframes lpB { 0%, 20% { transform: translate(0,0) } 50%, 65% { transform: translate(-60px,-110px) } 95%, 100% { transform: translate(0,0) } }
@keyframes lpC { 0%, 25% { transform: translate(0,0) } 55%, 70% { transform: translate(90px,40px) } 100% { transform: translate(0,0) } }
@keyframes lpBall { 0%, 15% { transform: translate(0,0) } 35% { transform: translate(118px,-68px) } 55% { transform: translate(58px,-178px) } 75%, 100% { transform: translate(0,0) } }
@keyframes lpDash { to { stroke-dashoffset: -60 } }
@keyframes lpRec { 0%, 100% { opacity: 1 } 50% { opacity: .25 } }
@keyframes lpSway { 0%, 100% { transform: rotate(-2deg) } 50% { transform: rotate(2deg) } }
.lp-a { animation: lpA 6s ease-in-out infinite } .lp-b { animation: lpB 6s ease-in-out infinite } .lp-c { animation: lpC 6s ease-in-out infinite }
.lp-ball { animation: lpBall 6s ease-in-out infinite } .lp-dash { stroke-dasharray: 6 6; animation: lpDash 1.4s linear infinite }
.lp-rec { animation: lpRec 1.2s ease-in-out infinite } .lp-sway { transform-origin: 50% 100%; animation: lpSway 3s ease-in-out infinite }
@media (max-width: 900px) { .ls-nav .ls-sec-link { display: none; } }
@media (max-width: 700px) {
  .ls-brand, .ls-nav .ls-link { min-height: 44px; }
  .ls-w { padding: 0 18px; } .ls-nav { gap: 12px; padding: 16px 0; } .ls-nav .ls-btn { display: none; }
  .ls-hero { padding: 16px 0 44px; gap: 30px; } .ls-h1 { font-size: 54px; } .ls-lead { font-size: 17px; }
  .ls-stage { height: 360px; } .ls-h2 { font-size: 32px; } .ls-sec { padding: 64px 0 24px; gap: 28px; } .ls-sec.rev { padding-top: 48px; }
  .ls-hero-l, .ls-hero-r, .ls-txt, .ls-art, .ls-live, .ls-wall, .ls-cards { flex-basis: 100%; }
  .ls-wall { height: 300px; } .ls-slip { font-size: 14px; padding: 10px 10px 0; }
  .ls-end { padding: 72px 0 110px; } .ls-end h2 { font-size: 46px; }
  .ls-card { width: 150px; height: 210px; } .ls-card b { font-size: 17px; }
  .ls-sticky { display: block; position: fixed; left: 16px; right: 16px; bottom: calc(14px + env(safe-area-inset-bottom)); z-index: 20; } .ls-sticky .ls-btn { width: 100%; box-shadow: 0 12px 30px -10px rgba(0,0,0,.6); }
}
@media (prefers-reduced-motion: reduce) {
  .ls-rise { opacity: 1; transform: none; transition: none; } .ls-frame { transition: none; } .ls-bar span { animation: none; }
  .lp-a, .lp-b, .lp-c, .lp-ball, .lp-dash, .lp-rec, .lp-sway { animation: none; }
}
`
