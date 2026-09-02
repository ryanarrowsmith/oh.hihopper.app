'use client'
import { useEffect, useRef, useState } from 'react'
import Signature from '@/components/Signature'

/* Lines that are actually hers. One per load, so the card is never quite the
   same twice and never a rotation you can predict. */
const LINES = [
  "Storms make trees take deeper roots.",
  "The way I see it, if you want the rainbow, you gotta put up with the rain.",
  "Find out who you are. And do it on purpose.",
  "If you see someone without a smile today, give ‘em yours.",
  "If you don’t like the road you’re walking, start paving another one.",
  "I have a strict policy that nobody cries alone in my presence.",
  "We cannot direct the wind, but we can adjust the sails.",
  "Don’t get so busy making a living that you forget to make a life.",
  "When someone shows you their true colors, believe them.",
  "You’ll never do a whole lot unless you’re brave enough to try.",
  "Every single diet I ever fell off of was because of potatoes and gravy of some sort.",
  "My songs are like my children—I expect them to support me when I’m old.",
  "Smile, it increases your face value.",
  "A loose tongue can lead to broken teeth.",
  "I make a point to appreciate all the little things in my life. I go out and smell the air after a good, hard rain. These small actions help remind me that there are so many great, glorious pieces of good in the world.",
  "I’ve had heartaches, headaches, toothaches, earaches, and I’ve had a few pains in the ass, but I’ve survived to tell about it.",
  "When I wake up, I expect things to be good. If they’re not, then I try to set about trying to make them as good as I can ‘cause I know I’m gonna have to live that day anyway. So why not try to make the most of it if you can?",
  "You can wish your life away. But if you’re going to dream, you’re going to have to get out and, like I always say, you have to put some wings on them dreams, and some feet and fingers and some hands. They gotta get into some stuff. You can’t just sit around and think of all the things you want to do. You’ve got to think of what you want to do, and then you’ve got to get out and make that happen.",
  "I’m not going to limit myself just because people won’t accept the fact that I can do something else.",
  "People say, ‘how you stay looking so young?’ I say, well, good lighting, good doctors, and good makeup.",
  "I think everybody should be allowed to be who they are, and to love who they love.",
  "A rhinestone shines just as good as a diamond.",
  "The magic is inside you, there ain’t no crystal ball.",
  "Being a star just means that you just find your own special place, and that you shine where you are.",
  "I’m the little engine that did.",
  "I’ve always tried to never step on anybody to get where I am. I’ve had to walk around a few people, jump over a few of ‘em now and then, but I think you’re a true success when you’ve seen your dreams come true and you can take pride in how you did it, and take pride in and respect and appreciate the people that helped you get there.",
  "Above everything else I’ve done, I’ve always said I’ve had more guts than I’ve got talent.",
  "You always want your people to be proud of what you have accomplished.",
]

const PORTRAIT = 'data:image/jpeg;base64,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'

export default function Dolly() {
  const [line, setLine] = useState(LINES[0])
  const [flying, setFlying] = useState(false)
  const [shown, setShown] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const reduced = useRef(false)

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setLine(LINES[Math.floor(Math.random() * LINES.length)])
  }, [])

  // The form closes because the mail went, the same as every other save in
  // Hopper -- but not the instant it goes. "Sent to ..." is the only proof
  // anything happened, so it holds long enough to be read and then the
  // popover shuts itself. A refusal never closes: the reason stays on screen
  // beside the button that would try again.
  useEffect(() => {
    if (!sent) return
    const t = setTimeout(() => { setOpen(false); setSent(null) }, 1600)
    return () => clearTimeout(t)
  }, [sent])

  // She crosses the card when the pointer arrives on it, and she is only ever
  // inside the card -- .flutter is absolutely positioned within .dolly, so the
  // card is her containing block and its border radius is her clip. She used
  // to be position:fixed across the whole window, which read as something the
  // page was doing rather than something Dolly was doing.
  //
  // Hovering again flies her again, once the crossing she is on has finished.
  // Re-entering mid-flight does nothing, so sweeping the pointer back and
  // forth cannot stack four butterflies on top of each other.
  /**
   * Her card hangs off her own face, the way every other popover in Hopper
   * hangs off the control that raised it. It grows from the top-left corner,
   * which is the corner nearest the button, so it reads as coming out of her
   * rather than as arriving.
   */
  function openCard() { setShown(true) }

  // Escape closes it, and the page behind must not scroll while it is up.
  useEffect(() => {
    if (!shown) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShown(false) }
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!card.current?.contains(t) && !btn.current?.contains(t)) setShown(false)
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('click', away)
    return () => {
      document.removeEventListener('keydown', esc)
      document.removeEventListener('click', away)
    }
  }, [shown])

  const CROSS = 4400
  function wake() {
    if (flying || reduced.current) return
    setFlying(true)
    setTimeout(() => setFlying(false), CROSS + 120)
  }

  async function send() {
    setSending(true); setErr(null)
    try {
      const r = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote: line }),
      })
      const j = await r.json()
      if (!r.ok) setErr(j.error || 'It did not send.')
      else setSent(j.to)   // the effect below shuts the popover once it has been read
    } catch {
      setErr('It did not send — the request never left the page.')
    } finally { setSending(false) }
  }

  return (
    <>
      {/* She sits in the tools row with the other round buttons, at her
          neighbours' size so the row stays one row. Toned out at rest and full
          colour under the pointer -- in colour all the time she would be the
          brightest thing on the page every time you land on it, which is not
          what she is for. */}
      <div className="bubw dollyw">
        <button className="dbtn" type="button" ref={btn} aria-haspopup="dialog"
                aria-expanded={shown} aria-label="What would Dolly say"
                onClick={openCard}>
          <img src={PORTRAIT} alt="" />
        </button>
        <span className="bubl" aria-hidden="true">Dolly</span>

        {shown && (
        <div className="dpop" ref={card} role="dialog"
             aria-label="What would Dolly say">
      <div className="dolly" onMouseEnter={wake}>
        <div className={'flutter' + (flying ? ' flying' : '')} aria-hidden="true">
          <div className="bfly-x"><div className="bfly-y"><div className="bfly-orbit">
      <svg className="bfly" viewBox="0 0 100 100" fill="none">
          <defs>
            <g id="bw">
              <path d="M50 47C41 21 22 7 12 15 3 22 5 41 17 49c11 7 25 6 33-2z" fill="#3D7BB5" />
              <path d="M50 52c-8 13-19 27-29 23-8-4-9-17 0-24 9-6 22-5 29 1z" fill="#A9CBE8" />
              <path d="M50 47C41 21 22 7 12 15" stroke="#1F5C99" strokeWidth="2" strokeLinecap="round" />
              <path d="M50 52c-8 13-19 27-29 23" stroke="#1F5C99" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="20" cy="30" r="3.4" fill="#A9CBE8" />
              <circle cx="27" cy="64" r="2.4" fill="#3D7BB5" />
            </g>
          </defs>
          <g className="wing wing--l"><use href="#bw" /></g>
          <g className="wing wing--r"><g transform="translate(100,0) scale(-1,1)"><use href="#bw" /></g></g>
          <path d="M50 33c2.1 0 3.1 2.4 3.1 8.5S52 68 50 73c-2.1-5-3.1-25.4-3.1-31.5S47.9 33 50 33z" fill="#21201F" />
          <path d="M50 34c-2.6-6-6.4-9.5-9.4-9.5M50 34c2.6-6 6.4-9.5 9.4-9.5" stroke="#21201F" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="40.6" cy="24.5" r="2" fill="#21201F" />
          <circle cx="59.4" cy="24.5" r="2" fill="#21201F" />
        </svg>
          </div></div></div>
        </div>
        <span className="dust" aria-hidden="true">
          <span className="mote mote--star" style={{ left: '32.7%', ['--sz' as any]: '3px', ['--peak' as any]: '0.73', ['--sway' as any]: '2.32s', ['--tw' as any]: '4.7s', ['--sx' as any]: '5px', ['--dur' as any]: '4.72s', ['--dly' as any]: '-6.59s' }}><i /></span>
          <span className="mote" style={{ left: '50.7%', ['--sz' as any]: '2px', ['--peak' as any]: '0.59', ['--sway' as any]: '3.2s', ['--tw' as any]: '3.07s', ['--sx' as any]: '12px', ['--dur' as any]: '4.93s', ['--dly' as any]: '-1.21s' }}><i /></span>
          <span className="mote" style={{ left: '13.1%', ['--sz' as any]: '3px', ['--peak' as any]: '0.83', ['--sway' as any]: '3.6s', ['--tw' as any]: '2.57s', ['--sx' as any]: '13px', ['--dur' as any]: '4.83s', ['--dly' as any]: '-0.17s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '5.6%', ['--sz' as any]: '3px', ['--peak' as any]: '0.68', ['--sway' as any]: '2.55s', ['--tw' as any]: '2.73s', ['--sx' as any]: '8px', ['--dur' as any]: '5.42s', ['--dly' as any]: '-2.23s' }}><i /></span>
          <span className="mote" style={{ left: '11.1%', ['--sz' as any]: '3px', ['--peak' as any]: '0.72', ['--sway' as any]: '3.51s', ['--tw' as any]: '2.58s', ['--sx' as any]: '4px', ['--dur' as any]: '5.63s', ['--dly' as any]: '-3.53s' }}><i /></span>
          <span className="mote" style={{ left: '53.1%', ['--sz' as any]: '4px', ['--peak' as any]: '0.76', ['--sway' as any]: '4.42s', ['--tw' as any]: '3.41s', ['--sx' as any]: '7px', ['--dur' as any]: '6.26s', ['--dly' as any]: '-2.11s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '24.9%', ['--sz' as any]: '3px', ['--peak' as any]: '0.79', ['--sway' as any]: '4.3s', ['--tw' as any]: '4.44s', ['--sx' as any]: '8px', ['--dur' as any]: '5.59s', ['--dly' as any]: '-6.49s' }}><i /></span>
          <span className="mote mote--star" style={{ left: '51.2%', ['--sz' as any]: '3px', ['--peak' as any]: '0.89', ['--sway' as any]: '2.56s', ['--tw' as any]: '3.77s', ['--sx' as any]: '4px', ['--dur' as any]: '6.86s', ['--dly' as any]: '-6.46s' }}><i /></span>
          <span className="mote" style={{ left: '55.7%', ['--sz' as any]: '4px', ['--peak' as any]: '0.7', ['--sway' as any]: '3.04s', ['--tw' as any]: '3.79s', ['--sx' as any]: '11px', ['--dur' as any]: '3.65s', ['--dly' as any]: '-6.34s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '27.5%', ['--sz' as any]: '2px', ['--peak' as any]: '0.58', ['--sway' as any]: '3.88s', ['--tw' as any]: '4.21s', ['--sx' as any]: '14px', ['--dur' as any]: '6.36s', ['--dly' as any]: '-5.01s' }}><i /></span>
          <span className="mote" style={{ left: '38.8%', ['--sz' as any]: '4px', ['--peak' as any]: '0.56', ['--sway' as any]: '3.31s', ['--tw' as any]: '2.87s', ['--sx' as any]: '5px', ['--dur' as any]: '5.18s', ['--dly' as any]: '-5.47s' }}><i /></span>
          <span className="mote" style={{ left: '29.2%', ['--sz' as any]: '3px', ['--peak' as any]: '0.73', ['--sway' as any]: '4.4s', ['--tw' as any]: '3.79s', ['--sx' as any]: '6px', ['--dur' as any]: '5.02s', ['--dly' as any]: '-3.15s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '87.6%', ['--sz' as any]: '4px', ['--peak' as any]: '0.94', ['--sway' as any]: '2.87s', ['--tw' as any]: '3.56s', ['--sx' as any]: '9px', ['--dur' as any]: '5.86s', ['--dly' as any]: '-4.34s' }}><i /></span>
          <span className="mote" style={{ left: '23.6%', ['--sz' as any]: '2px', ['--peak' as any]: '0.63', ['--sway' as any]: '2.76s', ['--tw' as any]: '3.05s', ['--sx' as any]: '11px', ['--dur' as any]: '6.39s', ['--dly' as any]: '-5.72s' }}><i /></span>
          <span className="mote mote--star" style={{ left: '28.6%', ['--sz' as any]: '3px', ['--peak' as any]: '0.74', ['--sway' as any]: '3.09s', ['--tw' as any]: '3.99s', ['--sx' as any]: '6px', ['--dur' as any]: '5.89s', ['--dly' as any]: '-3.39s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '61.5%', ['--sz' as any]: '2px', ['--peak' as any]: '0.76', ['--sway' as any]: '4.29s', ['--tw' as any]: '5.07s', ['--sx' as any]: '14px', ['--dur' as any]: '6.27s', ['--dly' as any]: '-4.25s' }}><i /></span>
          <span className="mote" style={{ left: '40.1%', ['--sz' as any]: '2px', ['--peak' as any]: '0.77', ['--sway' as any]: '3.16s', ['--tw' as any]: '2.93s', ['--sx' as any]: '7px', ['--dur' as any]: '4.99s', ['--dly' as any]: '-6.23s' }}><i /></span>
          <span className="mote" style={{ left: '59.9%', ['--sz' as any]: '2px', ['--peak' as any]: '0.55', ['--sway' as any]: '2.56s', ['--tw' as any]: '2.68s', ['--sx' as any]: '9px', ['--dur' as any]: '5.61s', ['--dly' as any]: '-6.51s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '21.4%', ['--sz' as any]: '4px', ['--peak' as any]: '0.62', ['--sway' as any]: '2.81s', ['--tw' as any]: '3.37s', ['--sx' as any]: '9px', ['--dur' as any]: '5.11s', ['--dly' as any]: '-6.19s' }}><i /></span>
          <span className="mote" style={{ left: '48.8%', ['--sz' as any]: '5px', ['--peak' as any]: '0.77', ['--sway' as any]: '2.95s', ['--tw' as any]: '2.8s', ['--sx' as any]: '9px', ['--dur' as any]: '6.07s', ['--dly' as any]: '-3.65s' }}><i /></span>
          <span className="mote" style={{ left: '68.8%', ['--sz' as any]: '6px', ['--peak' as any]: '0.56', ['--sway' as any]: '4.48s', ['--tw' as any]: '3.88s', ['--sx' as any]: '6px', ['--dur' as any]: '5.88s', ['--dly' as any]: '-0.6s' }}><i /></span>
          <span className="mote mote--star" style={{ left: '75.3%', ['--sz' as any]: '3px', ['--peak' as any]: '0.99', ['--sway' as any]: '4.27s', ['--tw' as any]: '4.35s', ['--sx' as any]: '8px', ['--dur' as any]: '5.27s', ['--dly' as any]: '-0.64s' }}><i /></span>
          <span className="mote" style={{ left: '35.9%', ['--sz' as any]: '3px', ['--peak' as any]: '0.79', ['--sway' as any]: '4.07s', ['--tw' as any]: '3.32s', ['--sx' as any]: '7px', ['--dur' as any]: '5.61s', ['--dly' as any]: '-1.48s' }}><i /></span>
          <span className="mote" style={{ left: '75.3%', ['--sz' as any]: '3px', ['--peak' as any]: '0.91', ['--sway' as any]: '4.16s', ['--tw' as any]: '4.47s', ['--sx' as any]: '7px', ['--dur' as any]: '4.12s', ['--dly' as any]: '-3.55s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '72.6%', ['--sz' as any]: '2px', ['--peak' as any]: '0.91', ['--sway' as any]: '3.33s', ['--tw' as any]: '2.94s', ['--sx' as any]: '13px', ['--dur' as any]: '6.84s', ['--dly' as any]: '-3.87s' }}><i /></span>
          <span className="mote" style={{ left: '92.8%', ['--sz' as any]: '4px', ['--peak' as any]: '0.98', ['--sway' as any]: '3.08s', ['--tw' as any]: '3.02s', ['--sx' as any]: '7px', ['--dur' as any]: '5.09s', ['--dly' as any]: '-4.64s' }}><i /></span>
          <span className="mote" style={{ left: '48.3%', ['--sz' as any]: '2px', ['--peak' as any]: '0.77', ['--sway' as any]: '3.77s', ['--tw' as any]: '4.64s', ['--sx' as any]: '5px', ['--dur' as any]: '6.4s', ['--dly' as any]: '-6.16s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '39.1%', ['--sz' as any]: '3px', ['--peak' as any]: '0.77', ['--sway' as any]: '2.63s', ['--tw' as any]: '4.61s', ['--sx' as any]: '9px', ['--dur' as any]: '3.71s', ['--dly' as any]: '-0.38s' }}><i /></span>
          <span className="mote mote--star" style={{ left: '71.7%', ['--sz' as any]: '5px', ['--peak' as any]: '0.73', ['--sway' as any]: '4.47s', ['--tw' as any]: '4.43s', ['--sx' as any]: '6px', ['--dur' as any]: '6.98s', ['--dly' as any]: '-6.81s' }}><i /></span>
          <span className="mote" style={{ left: '58.9%', ['--sz' as any]: '5px', ['--peak' as any]: '0.91', ['--sway' as any]: '2.55s', ['--tw' as any]: '4.71s', ['--sx' as any]: '11px', ['--dur' as any]: '5.77s', ['--dly' as any]: '-4.55s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '54.8%', ['--sz' as any]: '3px', ['--peak' as any]: '0.56', ['--sway' as any]: '4.12s', ['--tw' as any]: '4.43s', ['--sx' as any]: '5px', ['--dur' as any]: '5.3s', ['--dly' as any]: '-0.46s' }}><i /></span>
          <span className="mote" style={{ left: '43.5%', ['--sz' as any]: '3px', ['--peak' as any]: '0.92', ['--sway' as any]: '2.71s', ['--tw' as any]: '3.11s', ['--sx' as any]: '8px', ['--dur' as any]: '5.2s', ['--dly' as any]: '-1.65s' }}><i /></span>
          <span className="mote" style={{ left: '32.9%', ['--sz' as any]: '6px', ['--peak' as any]: '0.74', ['--sway' as any]: '2.51s', ['--tw' as any]: '4.95s', ['--sx' as any]: '9px', ['--dur' as any]: '6.63s', ['--dly' as any]: '-2.36s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '80.9%', ['--sz' as any]: '6px', ['--peak' as any]: '0.74', ['--sway' as any]: '4.4s', ['--tw' as any]: '3.8s', ['--sx' as any]: '12px', ['--dur' as any]: '3.95s', ['--dly' as any]: '-3.43s' }}><i /></span>
          <span className="mote" style={{ left: '86.5%', ['--sz' as any]: '3px', ['--peak' as any]: '0.82', ['--sway' as any]: '4.06s', ['--tw' as any]: '2.82s', ['--sx' as any]: '6px', ['--dur' as any]: '5.1s', ['--dly' as any]: '-1.92s' }}><i /></span>
          <span className="mote mote--star" style={{ left: '55.5%', ['--sz' as any]: '4px', ['--peak' as any]: '0.86', ['--sway' as any]: '3.47s', ['--tw' as any]: '3.75s', ['--sx' as any]: '5px', ['--dur' as any]: '6.58s', ['--dly' as any]: '-6.6s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '19.7%', ['--sz' as any]: '2px', ['--peak' as any]: '0.9', ['--sway' as any]: '3.42s', ['--tw' as any]: '3.97s', ['--sx' as any]: '5px', ['--dur' as any]: '5.0s', ['--dly' as any]: '-2.71s' }}><i /></span>
          <span className="mote" style={{ left: '50.5%', ['--sz' as any]: '6px', ['--peak' as any]: '0.64', ['--sway' as any]: '2.87s', ['--tw' as any]: '3.82s', ['--sx' as any]: '11px', ['--dur' as any]: '5.23s', ['--dly' as any]: '-5.27s' }}><i /></span>
          <span className="mote" style={{ left: '52.3%', ['--sz' as any]: '3px', ['--peak' as any]: '0.97', ['--sway' as any]: '4.34s', ['--tw' as any]: '2.97s', ['--sx' as any]: '11px', ['--dur' as any]: '3.89s', ['--dly' as any]: '-6.15s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '44.3%', ['--sz' as any]: '2px', ['--peak' as any]: '0.85', ['--sway' as any]: '3.23s', ['--tw' as any]: '3.0s', ['--sx' as any]: '8px', ['--dur' as any]: '6.22s', ['--dly' as any]: '-0.72s' }}><i /></span>
          <span className="mote" style={{ left: '16.1%', ['--sz' as any]: '4px', ['--peak' as any]: '0.61', ['--sway' as any]: '4.32s', ['--tw' as any]: '5.11s', ['--sx' as any]: '7px', ['--dur' as any]: '6.09s', ['--dly' as any]: '-6.34s' }}><i /></span>
          <span className="mote" style={{ left: '87.7%', ['--sz' as any]: '3px', ['--peak' as any]: '1.0', ['--sway' as any]: '4.2s', ['--tw' as any]: '2.85s', ['--sx' as any]: '10px', ['--dur' as any]: '6.98s', ['--dly' as any]: '-4.17s' }}><i /></span>
          <span className="mote mote--star" style={{ left: '42.3%', ['--sz' as any]: '4px', ['--peak' as any]: '0.69', ['--sway' as any]: '3.93s', ['--tw' as any]: '2.45s', ['--sx' as any]: '12px', ['--dur' as any]: '5.05s', ['--dly' as any]: '-2.08s' }}><i /></span>
          <span className="mote" style={{ left: '38.7%', ['--sz' as any]: '6px', ['--peak' as any]: '0.83', ['--sway' as any]: '3.43s', ['--tw' as any]: '2.58s', ['--sx' as any]: '7px', ['--dur' as any]: '6.9s', ['--dly' as any]: '-6.27s' }}><i /></span>
          <span className="mote" style={{ left: '27.0%', ['--sz' as any]: '2px', ['--peak' as any]: '0.96', ['--sway' as any]: '2.64s', ['--tw' as any]: '4.52s', ['--sx' as any]: '10px', ['--dur' as any]: '6.46s', ['--dly' as any]: '-2.27s' }}><i /></span>
          <span className="mote mote--gold" style={{ left: '93.7%', ['--sz' as any]: '4px', ['--peak' as any]: '0.62', ['--sway' as any]: '4.41s', ['--tw' as any]: '4.0s', ['--sx' as any]: '9px', ['--dur' as any]: '3.72s', ['--dly' as any]: '-6.6s' }}><i /></span>
        </span>
        <img className="dolly__p" src={PORTRAIT} alt="" width={58} height={58} />
        <div>
          <span className="dolly__q">{line}</span>
          {/* Her name in her own hand. The <cite> stays for anything that is
              reading rather than looking. */}
          <Signature />
          <cite className="vh">Dolly Parton</cite>
        </div>
        <div className="dolly__acts">
        <div className="bubw">
          <button className="bub" type="button" aria-label="Email this quote"
                  aria-expanded={open}
                  onClick={() => { setOpen(!open); setSent(null); setErr(null) }}>
            <svg viewBox="0 0 24 24">
              <path d="M21 3 10.5 13.5" /><path d="M21 3l-6.8 18-3.7-7.5L3 9.8z" />
            </svg>
          </button>
          <span className="bubl" aria-hidden="true">Send</span>

          {open && (
            <div className="mailpop" onMouseLeave={() => {}}>
              <p className="mailpop__h">
                Send this to yourself
                <button type="button" className="mailpop__x" aria-label="Close"
                        onClick={() => setOpen(false)}>&times;</button>
              </p>

              {/* what actually arrives, drawn the way it will land */}
              <div className="mailprev">
                <div className="mailprev__bar">
                  <span className="mark mark--sm">hopper<span className="pd">.</span></span>
                </div>
                <div className="mailprev__body">
                  <img src={PORTRAIT} alt="" width={78} height={78} />
                  <div>
                    <p className="mailprev__q">&ldquo;{line}&rdquo;</p>
                    <p className="mailprev__c">Dolly Parton</p>
                  </div>
                </div>
                <div className="mailprev__foot">
                  <span className="mark mark--sm">hopper<span className="pd">.</span></span>
                  <span>oh.hihopper.app</span>
                </div>
              </div>

              {sent
                ? <p className="mailpop__ok">Sent to {sent}.</p>
                : err
                  ? <p className="mailpop__err">{err}</p>
                  : null}

              {!sent && (
                <button className="btn btn--amber mailpop__go" type="button"
                        onClick={send} disabled={sending}>
                  {sending ? 'Sending…' : 'Send it to me'}
                </button>
              )}
            </div>
          )}
        </div>
        <button className="bub" type="button" aria-label="Close"
                onClick={() => setShown(false)}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        </div>

      </div>
        </div>
        )}
      </div>
    </>
  )
}
