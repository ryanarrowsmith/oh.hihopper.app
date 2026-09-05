/* The landing's own stylesheet, kept out of the app's globals.css.
   Every selector is scoped to .hl or an hl- class. */
export const LANDING_CSS = String.raw`

/* ─────────────────────────────────────────────────────────────────────
   hihopper.app — the beta landing.

   Tokens are Hopper's own, cut from hi/Brand/Hopper-Brand-Spec.txt.
   Nothing here invents a colour. The rule the spec is loudest about is
   obeyed everywhere below: AMBER IS A SHAPE, NEVER A WORD. It is the
   period, a dot, a rule, the slider's marker, a filled button carrying
   ink — never type, never a label, never the beta flag.

   The page sits on a sheet, and the Oh hi line falls under the sheet
   rather than inside it: the colophon is about who made the thing, so
   it belongs beside the thing rather than on it.
   ───────────────────────────────────────────────────────────────────── */
.hl{
  --ink:#231F20; --ink-2:#55524D; --ink-3:#8A847C;
  --ground:#EFEAE1; --sheet:#FBF9F5; --tint:#F4F0E9; --surface:#FFFFFF;
  --rule:#E8E2D8; --rule-soft:#F1ECE4;
  --amber:#F2A93B; --steel:#2D5D7B; --good:#2E8B57; --bad:#D93A2B;
  --s1:#016593; --s2:#788632; --s3:#C17299; --s4:#3B5192;
  --lift:0 1px 2px rgba(35,31,32,.05), 0 22px 54px -22px rgba(35,31,32,.28);
  --max:1140px;
}
@media (prefers-color-scheme: dark){
  .hl:not([data-theme="light"]){
    --ink:#F3EEE6; --ink-2:#ADA69C; --ink-3:#7C756C;
    --ground:#0F0E0D; --sheet:#1B1A18; --tint:#211F1D; --surface:#252220;
    --rule:#332F2B; --rule-soft:#2A2724;
    --steel:#7FB3D1; --s1:#0493D3; --s2:#859700; --s3:#B24981; --s4:#4764C2;
    --lift:0 1px 2px rgba(0,0,0,.6), 0 22px 54px -22px rgba(0,0,0,.85);
  }
}
.hl[data-theme="dark"]{
  --ink:#F3EEE6; --ink-2:#ADA69C; --ink-3:#7C756C;
  --ground:#0F0E0D; --sheet:#1B1A18; --tint:#211F1D; --surface:#252220;
  --rule:#332F2B; --rule-soft:#2A2724;
  --steel:#7FB3D1; --s1:#0493D3; --s2:#859700; --s3:#B24981; --s4:#4764C2;
  --lift:0 1px 2px rgba(0,0,0,.6), 0 22px 54px -22px rgba(0,0,0,.85);
}

/* Only the landing's own subtree, and the body it sits on. globals.css is
   shared with the whole app and is not edited by this page. */
.hl *{box-sizing:border-box}
body:has(.hl){margin:0;padding:0;background:none}
.hl{margin:0;min-height:100vh;background:var(--ground);color:var(--ink);
  font:400 17px/1.65 "Manrope",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased}
.hl img,.hl svg{max-width:100%}
.hl a{color:var(--steel);text-decoration:none;border-bottom:1px solid currentColor}
.hl a:hover{color:var(--ink)}

/* ── the sheet ────────────────────────────────────────────────────── */
.hl-sheet{width:min(var(--max),94%);margin:34px auto 0;background:var(--sheet);
  border:1px solid var(--rule);box-shadow:var(--lift);overflow:hidden}
.hl-wrap{width:min(940px,88%);margin:0 auto}
.hl-band{padding:74px 0}
.hl-band.hl-tint{background:var(--tint);border-top:1px solid var(--rule-soft);
  border-bottom:1px solid var(--rule-soft)}

/* ── the mark, and the flag under it ────────────────────────────────
   The beta word sits DIRECTLY UNDER the name, not across a corner — the
   same lockup the email envelope uses, so the page and the mail
   introduce themselves the same way. Its border and letters are Steel:
   at 6.9:1 it is allowed to be type, and amber is not. */
.hl-lockup{display:inline-flex;flex-direction:column;align-items:flex-start;gap:9px}
.hl-lockup .hl-mark{display:block;width:132px;height:auto;color:var(--ink)}
.hl-lockup .hl-mark svg{display:block;width:100%;height:auto}
.hl-flag{font:800 10px/1 "Manrope",sans-serif;letter-spacing:.18em;text-transform:uppercase;
  color:var(--steel);border:1px solid var(--steel);padding:4px 8px}

.hl nav{padding:24px 0;border-bottom:1px solid var(--rule-soft)}
.hl nav .hl-row{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
.hl nav .hl-lockup .hl-mark{width:110px}

/* ── type ───────────────────────────────────────────────────────── */
.hl h1{margin:0 0 20px;font:800 clamp(36px,5.6vw,58px)/1.06 "Manrope",sans-serif;
  letter-spacing:-.035em;text-wrap:balance;max-width:17ch}
/* Manrope ships no italic, so this is a synthesised oblique. Held to ONE
   word at display size, where the slant reads as emphasis rather than as
   a second typeface — a whole sentence of it would show the fake. */
.hl h1 em{font-style:italic;font-synthesis:style;padding-right:.07em}
.hl p{margin:0 0 18px;color:var(--ink-2);max-width:60ch}
.hl-lead{font-size:19.5px;color:var(--ink-2);max-width:48ch}
.hl-eyebrow{display:inline-flex;align-items:center;gap:9px;margin:0 0 20px;
  font:800 11px/1 "Manrope",sans-serif;letter-spacing:.16em;text-transform:uppercase;
  color:var(--ink-3)}
.hl-eyebrow::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--amber)}

.hl-hero{text-align:center;padding:96px 0 72px}
.hl-hero h1,.hl-hero .hl-lead,.hl-hero .hl-ask,.hl-hero .hl-bits{margin-left:auto;margin-right:auto}
.hl-hero .hl-fine{margin-left:auto;margin-right:auto;max-width:52ch;text-align:center}

/* What goes in it, said as a short list rather than a paragraph — five
   things in a sentence is a sentence nobody finishes. */
.hl-bits{list-style:none;margin:24px auto 0;padding:0;max-width:54ch;text-align:left;
  display:inline-block}
.hl-bits li{position:relative;padding:0 0 0 20px;margin:0 0 7px;
  font-size:16.5px;color:var(--ink-2)}
.hl-bits li::before{content:"";position:absolute;left:0;top:.62em;width:7px;height:7px;
  background:var(--amber)}
.hl-bits li:last-child{color:var(--ink-3)}
.hl-bits li:last-child::before{background:var(--rule)}

/* ── the ask ────────────────────────────────────────────────────── */
.hl-ask{margin:32px 0 0;max-width:500px}
.hl-askrow{display:flex;gap:10px}
.hl-ask input{flex:1;min-width:0;padding:15px 16px;border:1px solid var(--rule);
  background:var(--surface);color:var(--ink);font:500 16px/1 "Manrope",sans-serif}
.hl-ask input:focus{outline:2px solid var(--steel);outline-offset:-1px;border-color:var(--steel)}
.hl-ask input::placeholder{color:var(--ink-3)}
/* Amber ground, INK on top — 8.16:1. The one place amber may carry a
   word is when the word is ink and amber is the shape behind it. */
.hl-btn{padding:15px 22px;border:1px solid var(--amber);background:var(--amber);
  color:#231F20;font:800 16px/1 "Manrope",sans-serif;cursor:pointer;white-space:nowrap}
.hl-btn:hover{background:#E59B26;border-color:#E59B26}
.hl-fine{margin:12px 0 0;font-size:14px;color:var(--ink-3);max-width:46ch}
.hl-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}

/* ── the slider ─────────────────────────────────────────────────────
   One image area, three stops. The marker under the rail is the amber
   shape; the words on the rail are ink, because amber may not be a word.
   Everything is driven by [aria-selected] and [hidden] so the state is
   in the DOM rather than in a class nobody can read. */
.hl-rail{display:flex;gap:0;border-bottom:1px solid var(--rule);position:relative;
  margin:0 0 26px}
.hl-rail button{flex:1;appearance:none;background:none;border:0;cursor:pointer;
  padding:12px 6px 14px;font:800 13px/1.3 "Manrope",sans-serif;letter-spacing:.02em;
  color:var(--ink-3);border-bottom:2px solid transparent;margin-bottom:-1px}
.hl-rail button:hover{color:var(--ink-2)}
.hl-rail button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--amber)}
.hl-rail button:focus-visible{outline:2px solid var(--steel);outline-offset:-3px}

.hl-slide[hidden]{display:none!important}
.hl-slidetext{margin:22px 0 0;display:grid;gap:6px}
.hl-slidetext h2{margin:0;font:800 clamp(21px,2.6vw,26px)/1.25 "Manrope",sans-serif;
  letter-spacing:-.022em}
.hl-slidetext p{margin:0;max-width:58ch}

/* ── a screen ───────────────────────────────────────────────────── */
.hl-shot{margin:0;background:var(--surface);border:1px solid var(--rule);box-shadow:var(--lift)}
.hl-shot .hl-pane{overflow-x:auto}
.hl-shot .hl-pane > *{min-width:640px}
.hl-shot figcaption{padding:11px 15px;border-top:1px solid var(--rule-soft);
  font:500 12.5px/1.5 "Manrope",sans-serif;color:var(--ink-3)}
.hl-chrome{display:flex;align-items:center;gap:12px;padding:11px 14px;
  border-bottom:1px solid var(--rule-soft);background:var(--tint)}
.hl-chrome .hl-m{width:72px;color:var(--ink)}
.hl-chrome .hl-m svg{display:block;width:100%;height:auto}
.hl-chrome .hl-tabs{display:flex;gap:17px;margin-left:auto;font:700 12px/1 "Manrope",sans-serif;
  letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)}
.hl-chrome .hl-tabs .hl-on{color:var(--ink);position:relative}
.hl-chrome .hl-tabs .hl-on::after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:2px;background:var(--amber)}
.hl-screen{padding:24px 26px 28px}

.hl-sechead{display:flex;align-items:baseline;gap:10px;margin:0 0 4px}
.hl-sechead b{font:800 16px/1.2 "Manrope",sans-serif}
.hl-sechead span{margin-left:auto;font:600 12.5px/1 "Manrope",sans-serif;color:var(--ink-3)}
.hl-secnote{margin:0 0 15px;font:400 13.5px/1.5 "Manrope",sans-serif;color:var(--ink-3);max-width:none}

.hl-cards{display:grid;gap:11px;grid-template-columns:repeat(3,1fr)}
.hl-card{border:1px solid var(--rule);background:var(--sheet);padding:16px}
.hl-card .hl-k{font:600 12.5px/1.3 "Manrope",sans-serif;color:var(--ink-3);
  display:flex;align-items:center;gap:6px}
.hl-card .hl-v{font:800 33px/1.05 "Manrope",sans-serif;letter-spacing:-.03em;margin:7px 0 2px;
  font-variant-numeric:tabular-nums}
.hl-card .hl-d{font:500 12px/1.4 "Manrope",sans-serif;color:var(--ink-3)}
.hl-dot{width:7px;height:7px;border-radius:50%;background:var(--good);flex:0 0 auto}
.hl-dot.hl-stale{background:var(--amber)}
.hl-dot.hl-bad{background:var(--bad)}
.hl-spark{display:block;width:100%;height:36px;margin-top:11px}

.hl-rows{border-top:1px solid var(--rule-soft)}
.hl-orow{display:flex;align-items:center;gap:12px;padding:12px 2px;
  border-bottom:1px solid var(--rule-soft)}
.hl-plate{width:30px;height:30px;flex:0 0 auto;background:var(--tint);
  border:1px solid var(--rule);display:flex;align-items:center;justify-content:center;
  font:800 11px/1 "Manrope",sans-serif;color:var(--ink-2)}
.hl-ot{min-width:0;flex:1}
.hl-ot b{display:block;font:700 14.5px/1.35 "Manrope",sans-serif}
.hl-ot span{display:block;font:500 12.5px/1.4 "Manrope",sans-serif;color:var(--ink-3)}
.hl-tag{font:700 10.5px/1 "Manrope",sans-serif;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-3);border:1px solid var(--rule);padding:5px 8px;white-space:nowrap}
.hl-tag.hl-late{color:var(--bad);border-color:var(--bad)}
.hl-tag.hl-who{color:var(--steel);border-color:var(--steel)}
.hl-wgroup{margin:18px 0 0;font:800 11px/1 "Manrope",sans-serif;letter-spacing:.14em;
  text-transform:uppercase;color:var(--ink-3);display:flex;align-items:center;gap:8px}
.hl-wgroup::after{content:"";flex:1;height:1px;background:var(--rule-soft)}

/* ── the Oh hi line, under the sheet ────────────────────────────────
   Markup and rules lifted from ohhi/site (template.html and
   public/landing.css) rather than redrawn, so a change there is a change
   here and not a second copy drifting on its own. --slate maps onto this
   page's --ink-3; nothing else moved. */
.hl-colo{width:min(var(--max),94%);margin:0 auto;padding:26px 0 46px}
.foot{display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center;
  justify-content:space-between;font-size:14px;color:var(--ink-3)}
.colophon{margin:0;max-width:none;display:inline-flex;align-items:center;gap:6px;
  flex-wrap:wrap;color:var(--ink-3)}
.colophon strong{color:var(--ink);font-weight:700}

/* "Oh hi" gives a little shake when you point at it. */
.wig{display:inline-block;transform-origin:50% 75%}
.wig:hover{animation:hl-ohhi-wiggle .5s ease-in-out}
@keyframes hl-ohhi-wiggle{0%,100%{transform:rotate(0)}18%{transform:rotate(-4deg)}
  38%{transform:rotate(3.2deg)}58%{transform:rotate(-2.2deg)}78%{transform:rotate(1.4deg)}}
@media (prefers-reduced-motion:reduce){.wig:hover{animation:none}}

/* The Tulsa flag, canvas-toned by default and full colour on hover. */
.tflag{display:block;flex:none;border-radius:50%}
.tflag [class^="tf-"]{transition:fill .18s ease}
.tf-navy{fill:#8B8884}.tf-gold{fill:#B7B3AE}.tf-red{fill:#9C9995}
.tf-cream{fill:#EFEDEA}
.tf-star{fill:var(--ground)}
.tulsa{display:inline-flex;align-items:center;gap:8px}
.tulsa:hover .tf-navy{fill:#12243F}
.tulsa:hover .tf-gold{fill:#E0B24A}
.tulsa:hover .tf-red{fill:#AE2F32}
.tulsa:hover .tf-cream{fill:#F8EDD6}
.tulsa:hover .tf-star{fill:#F8EDD6}
@media (prefers-reduced-motion:reduce){.tflag [class^="tf-"]{transition:none}}

/* The dogs: canvas-toned, one warming to rust and one to brown on hover. */
.dog{display:block;flex:none;color:#A5A19B;transition:color .18s ease}
.dog-item{display:inline-flex;align-items:center;gap:8px}
.dog-item:hover .dog--a{color:#C4522F}
.dog-item:hover .dog--b{color:#6B4630}
@media (prefers-reduced-motion:reduce){.dog{transition:none}}

/* ── the phone ──────────────────────────────────────────────────── */
@media (max-width:860px){ .hl-cards{grid-template-columns:1fr} }
@media (max-width:640px){
  body{font-size:16px}
  .hl-sheet{width:100%;margin-top:0;border-left:0;border-right:0}
  .hl-wrap{width:92%}
  .hl-colo{width:92%}
  .hl-band{padding:52px 0}
  .hl-hero{padding:60px 0 48px}
  .hl-askrow{flex-direction:column}
  .hl-ask input,.hl-btn{width:100%}
  .hl-btn{text-align:center}
  .hl-rail button{font-size:12px;padding:11px 4px 13px}
  .foot{flex-direction:column;align-items:flex-start;gap:16px}
}

.hl .hl-said{margin:12px 0 0;font:600 14.5px/1.5 "Manrope",sans-serif;color:var(--steel);max-width:46ch}
.hl-hero .hl-said{margin-left:auto;margin-right:auto;text-align:center}
`
