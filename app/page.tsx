'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const GLITCH_WORDS = ['Intelligence', 'Insight', 'Entertainment', 'Digital Asset']

// Simplified continent outlines as [lon, lat] degree pairs
const LAND: [number, number][][] = [
  // North America
  [[-168,72],[-158,60],[-150,60],[-142,58],[-134,58],[-130,50],
   [-124,46],[-124,40],[-122,36],[-118,34],[-110,24],[-106,22],
   [-96,20],[-88,16],[-84,10],[-78,8],[-76,20],[-80,26],[-80,32],
   [-76,35],[-74,40],[-70,42],[-68,46],[-64,50],[-60,52],[-60,60],
   [-68,72],[-80,72],[-100,74],[-120,72],[-140,74],[-168,72]],
  // South America
  [[-78,8],[-74,2],[-52,6],[-34,-6],[-34,-14],[-38,-18],[-44,-24],
   [-48,-28],[-52,-34],[-58,-40],[-62,-44],[-66,-50],[-68,-56],
   [-66,-44],[-58,-36],[-52,-28],[-50,-20],[-48,-8],[-50,2],
   [-58,6],[-62,10],[-68,12],[-74,10],[-78,8]],
  // Europe
  [[-8,36],[0,36],[4,44],[10,46],[14,46],[18,40],[22,38],[28,42],
   [28,46],[30,50],[24,58],[22,60],[18,66],[14,68],[10,72],[4,70],
   [-2,68],[-6,62],[-10,58],[-8,54],[-4,52],[0,50],[-4,44],
   [-8,44],[-8,36]],
  // Africa
  [[-6,36],[-14,18],[-18,14],[-14,10],[-10,6],[-4,5],[8,4],
   [10,2],[8,-2],[12,-8],[12,-22],[14,-28],[18,-34],[26,-34],
   [34,-18],[40,-2],[42,6],[52,12],[44,16],[38,24],[34,30],
   [24,34],[10,38],[0,38],[-6,36]],
  // Asia (Eurasia main body)
  [[36,36],[42,36],[50,28],[56,22],[66,22],[72,22],[76,8],[80,8],
   [84,14],[88,22],[92,22],[96,8],[100,-2],[104,-6],[110,-8],
   [116,-8],[112,-4],[106,-6],[104,-2],[108,10],[114,20],[122,22],
   [130,28],[136,32],[140,36],[136,38],[130,44],[134,50],[140,56],
   [142,62],[140,68],[130,70],[120,72],[110,74],[96,72],[80,74],
   [52,74],[32,72],[26,68],[30,64],[36,52],[36,46],[28,46],
   [26,44],[28,42],[36,36]],
  // Australia
  [[114,-22],[122,-18],[128,-15],[132,-12],[136,-12],[140,-15],
   [144,-20],[148,-22],[150,-26],[154,-30],[152,-34],[148,-38],
   [144,-38],[140,-36],[136,-36],[132,-36],[128,-34],[122,-30],
   [116,-26],[114,-24],[114,-22]],
  // Greenland
  [[-44,60],[-38,64],[-36,70],[-28,76],[-18,78],[-18,74],
   [-22,70],[-26,66],[-34,62],[-44,60]],
  // Japan (Honshu)
  [[130,32],[132,34],[134,36],[136,38],[140,40],[142,40],[142,38],
   [140,36],[136,34],[132,32],[130,32]],
  // Great Britain
  [[-6,50],[-4,50],[0,52],[0,54],[-2,56],[-4,58],[-6,58],[-8,56],
   [-6,54],[-6,52],[-8,52],[-8,50],[-6,50]],
  // New Zealand (South Island)
  [[166,-46],[168,-46],[170,-44],[172,-42],[170,-38],[168,-36],
   [166,-38],[164,-44],[166,-46]],
]

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const now = ctx.currentTime

    // Layer 1: electric zap — sawtooth buzz with rapid frequency stutter
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    const distortion = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1
      curve[i] = (Math.PI + 400) * x / (Math.PI + 400 * Math.abs(x))
    }
    distortion.curve = curve
    osc1.type = 'sawtooth'
    osc1.frequency.setValueAtTime(120, now)
    osc1.frequency.exponentialRampToValueAtTime(960, now + 0.03)
    osc1.frequency.exponentialRampToValueAtTime(240, now + 0.07)
    osc1.frequency.exponentialRampToValueAtTime(1800, now + 0.10)
    gain1.gain.setValueAtTime(0.22, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16)
    osc1.connect(distortion)
    distortion.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.16)

    // Layer 2: white noise crackle (electric static)
    const bufSize = ctx.sampleRate * 0.15
    const noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1)
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const bandpass = ctx.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.setValueAtTime(3000, now)
    bandpass.Q.value = 0.8
    const gainN = ctx.createGain()
    gainN.gain.setValueAtTime(0.3, now)
    gainN.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
    noise.connect(bandpass)
    bandpass.connect(gainN)
    gainN.connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 0.15)

    // Layer 3: high-pitched electric whine
    const osc3 = ctx.createOscillator()
    const gain3 = ctx.createGain()
    osc3.type = 'square'
    osc3.frequency.setValueAtTime(2200, now)
    osc3.frequency.exponentialRampToValueAtTime(4400, now + 0.05)
    osc3.frequency.exponentialRampToValueAtTime(3300, now + 0.12)
    gain3.gain.setValueAtTime(0.06, now)
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.14)
    osc3.connect(gain3)
    gain3.connect(ctx.destination)
    osc3.start(now)
    osc3.stop(now + 0.14)

    setTimeout(() => ctx.close(), 300)
  } catch {}
}

export default function Home() {
  const router = useRouter()
  const starsRef = useRef<HTMLCanvasElement>(null)
  const planetRef = useRef<HTMLCanvasElement>(null)
  const depRef = useRef<HTMLCanvasElement>(null)
  const contribRef = useRef<HTMLCanvasElement>(null)
  const heatRef = useRef<HTMLCanvasElement>(null)
  const whyCanvasRef = useRef<HTMLCanvasElement>(null)
  const expandedVizRef = useRef<HTMLCanvasElement>(null)

  const [loaded, setLoaded] = useState(false)
  const [glitchIdx, setGlitchIdx] = useState(0)
  const [isGlitching, setIsGlitching] = useState(false)
  const [activeWhy, setActiveWhy] = useState(0)
  const [whyTimerKey, setWhyTimerKey] = useState(0)
  const [expandedViz, setExpandedViz] = useState<number | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const preloaderCanvasRef = useRef<HTMLCanvasElement>(null)

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    fetch('/api/auth/github')
      .then((r) => r.json())
      .then((data) => { if (data.authenticated) router.push('/dashboard') })
      .catch(() => {})
  }, [router])

  async function handleGithubLogin() {
    setAuthLoading(true)
    try {
      const res = await fetch('/api/auth/github', { method: 'POST' })
      if (res.ok) {
        router.push('/dashboard')
      } else {
        const err = await res.json()
        alert(err.error || 'GitHub authentication failed.')
      }
    } catch {
      alert('Network error. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  // ── PRELOADER ──
  useEffect(() => {
    const c = preloaderCanvasRef.current!
    if (!c) return
    const ctx = c.getContext('2d')!
    c.width = window.innerWidth
    c.height = window.innerHeight
    const W = c.width, H = c.height
    const cx = W / 2, cy = H / 2

    const BOOT_LINES = [
      '> INITIALIZING GIT PLANET CORE...',
      '> CONNECTING TO GITHUB UNIVERSE...',
      '> LOADING INTELLIGENCE ENGINE...',
      '> CALIBRATING REPO SCANNER...',
      '> MAPPING ECOSYSTEM SIGNALS...',
      '> SYSTEMS ONLINE. WELCOME.',
    ]

    let startTime = performance.now()
    const TOTAL_MS = 2800
    let raf: number

    function draw(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / TOTAL_MS, 1)
      ctx.clearRect(0, 0, W, H)

      // Background
      ctx.fillStyle = '#050505'
      ctx.fillRect(0, 0, W, H)

      // Rotating ring
      const ringR = Math.min(W, H) * 0.14
      ctx.save()
      ctx.translate(cx, cy - 60)
      ctx.rotate(elapsed * 0.001)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const alpha = 0.15 + 0.85 * (i / 12) * progress
        ctx.beginPath()
        ctx.arc(Math.cos(a) * ringR, Math.sin(a) * ringR, 3 + (i / 12) * 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0,229,255,${alpha})`
        ctx.shadowColor = '#00E5FF'
        ctx.shadowBlur = 10
        ctx.fill()
      }
      ctx.restore()

      // Inner counter-rotating ring
      ctx.save()
      ctx.translate(cx, cy - 60)
      ctx.rotate(-elapsed * 0.0018)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const alpha = 0.12 + 0.6 * (i / 8) * progress
        ctx.beginPath()
        ctx.arc(Math.cos(a) * ringR * 0.62, Math.sin(a) * ringR * 0.62, 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(123,97,255,${alpha})`
        ctx.shadowColor = '#7B61FF'
        ctx.shadowBlur = 8
        ctx.fill()
      }
      ctx.restore()

      // Logo image at center of rings
      const logoImg = (window as any).__preloaderLogo as HTMLImageElement | undefined
      if (logoImg && logoImg.complete) {
        const s = ringR * 0.72
        ctx.drawImage(logoImg, cx - s / 2, cy - 60 - s / 2, s, s)
      }

      // Progress arc
      ctx.beginPath()
      ctx.arc(cx, cy - 60, ringR + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress)
      ctx.strokeStyle = `rgba(0,229,255,${0.4 + 0.6 * progress})`
      ctx.lineWidth = 2
      ctx.shadowColor = '#00E5FF'
      ctx.shadowBlur = 12
      ctx.stroke()
      ctx.shadowBlur = 0

      // Boot lines
      const lineH = 22
      const totalLinesH = BOOT_LINES.length * lineH
      const linesY = cy + ringR + 40
      ctx.font = '12px "JetBrains Mono", monospace'
      ctx.textAlign = 'left'
      BOOT_LINES.forEach((line, i) => {
        const lineProgress = Math.max(0, Math.min(1, (progress * BOOT_LINES.length) - i))
        if (lineProgress <= 0) return
        const chars = Math.floor(line.length * lineProgress)
        const alpha = 0.4 + 0.6 * lineProgress
        const isActive = i === Math.floor(progress * (BOOT_LINES.length - 1) + 0.5)
        ctx.fillStyle = isActive ? `rgba(0,229,255,${alpha})` : `rgba(100,180,200,${alpha * 0.7})`
        if (isActive) { ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 6 }
        ctx.fillText(line.slice(0, chars) + (isActive && Math.floor(elapsed / 300) % 2 === 0 ? '█' : ''), cx - 220, linesY + i * lineH)
        ctx.shadowBlur = 0
      })

      // Progress bar
      const barW = 440, barH = 3
      const barX = cx - barW / 2, barY = linesY + totalLinesH + 16
      ctx.fillStyle = 'rgba(0,229,255,0.08)'
      ctx.fillRect(barX, barY, barW, barH)
      const fillGrd = ctx.createLinearGradient(barX, 0, barX + barW * progress, 0)
      fillGrd.addColorStop(0, 'rgba(123,97,255,0.8)')
      fillGrd.addColorStop(1, 'rgba(0,229,255,1)')
      ctx.fillStyle = fillGrd
      ctx.shadowColor = '#00E5FF'
      ctx.shadowBlur = 8
      ctx.fillRect(barX, barY, barW * progress, barH)
      ctx.shadowBlur = 0

      // Percentage
      ctx.fillStyle = `rgba(0,229,255,${0.5 + 0.5 * progress})`
      ctx.font = '11px "Orbitron", monospace'
      ctx.textAlign = 'right'
      ctx.fillText(Math.floor(progress * 100) + '%', cx + barW / 2, barY - 6)

      if (progress < 1) {
        raf = requestAnimationFrame(draw)
      } else {
        setTimeout(() => setLoaded(true), 320)
      }
    }

    // Preload logo image for canvas draw
    const img = new Image()
    img.src = '/logo.png'
    ;(window as any).__preloaderLogo = img

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setIsGlitching(true)
      setTimeout(() => {
        setGlitchIdx((i) => (i + 1) % GLITCH_WORDS.length)
        setIsGlitching(false)
      }, 320)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  // ── STARFIELD ──
  useEffect(() => {
    const c = starsRef.current!
    if (!c) return
    const ctx = c.getContext('2d')!
    const stars: { x: number; y: number; r: number; a: number; sp: number; vx: number }[] = []

    function resize() {
      c.width = window.innerWidth
      c.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    for (let i = 0; i < 220; i++) {
      stars.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        r: Math.random() * 1.5 + 0.2,
        a: Math.random(),
        sp: Math.random() * 0.004 + 0.001,
        vx: 0.12 + Math.random() * 0.18,
      })
    }

    let raf: number
    function drawStars() {
      ctx.clearRect(0, 0, c.width, c.height)
      stars.forEach((s) => {
        s.a += s.sp
        s.x += s.vx
        if (s.x > c.width) { s.x = 0; s.y = Math.random() * c.height }
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,230,255,${0.3 + 0.7 * Math.abs(Math.sin(s.a))})`
        ctx.fill()
      })
      raf = requestAnimationFrame(drawStars)
    }
    drawStars()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // ── PLANET ──
  useEffect(() => {
    const canvas = planetRef.current!
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let W = 0, H = 0, cx = 0, cy = 0, R = 0

    function resize() {
      W = canvas.offsetWidth
      H = canvas.offsetHeight
      canvas.width = W
      canvas.height = H
      cx = W / 2
      cy = H / 2
      R = Math.min(W, H) * 0.38
    }
    resize()
    window.addEventListener('resize', resize)

    const NODES = 28
    const nodes: { lat: number; lon: number; size: number; brightness: number }[] = []
    for (let i = 0; i < NODES; i++) {
      nodes.push({
        lat: (Math.random() - 0.5) * Math.PI,
        lon: Math.random() * Math.PI * 2,
        size: Math.random() * 2.5 + 1.5,
        brightness: Math.random(),
      })
    }

    // edges store [nodeA, nodeB, arcLiftFactor] — lift pre-computed so arcs don't flicker
    const edges: [number, number, number][] = []
    for (let i = 0; i < NODES; i++) {
      const count = Math.floor(Math.random() * 3) + 1
      for (let j = 0; j < count; j++) {
        const t = Math.floor(Math.random() * NODES)
        if (t !== i) edges.push([i, t, 0.22 + Math.random() * 0.38])
      }
    }

    const particles: { edge: [number, number, number]; t: number; speed: number }[] = []
    for (let i = 0; i < 60; i++) {
      const edge = edges[Math.floor(Math.random() * edges.length)]
      particles.push({ edge, t: Math.random(), speed: Math.random() * 0.005 + 0.002 })
    }

    let rot = 0
    let tilt = 0.3      // initial tilt toward northern hemisphere
    let isDragging = false
    let lastMouseX = 0, lastMouseY = 0
    let velX = 0.003, velY = 0   // start at auto-rotation speed

    function project(lat: number, lon: number, r: number) {
      const x3 = r * Math.cos(lat) * Math.sin(lon + rot)
      const y3 = r * Math.sin(lat)
      const z3 = r * Math.cos(lat) * Math.cos(lon + rot)
      // X-axis tilt rotation
      const y4 = y3 * Math.cos(tilt) - z3 * Math.sin(tilt)
      const z4 = y3 * Math.sin(tilt) + z3 * Math.cos(tilt)
      return { x: cx + x3 * R, y: cy - y4 * R, z: z4 }
    }

    function drawGrid() {
      for (let latDeg = -75; latDeg <= 75; latDeg += 25) {
        const lat = (latDeg * Math.PI) / 180
        ctx.beginPath()
        let first = true
        for (let lonDeg = 0; lonDeg <= 360; lonDeg += 5) {
          const p = project(lat, (lonDeg * Math.PI) / 180, 1)
          if (p.z > 0) { first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); first = false }
          else { first = true }
        }
        ctx.strokeStyle = 'rgba(0,180,255,0.06)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
      for (let lonDeg = 0; lonDeg < 180; lonDeg += 22.5) {
        const lon = (lonDeg * Math.PI) / 180
        ctx.beginPath()
        let first = true
        for (let latDeg = -90; latDeg <= 90; latDeg += 5) {
          const p = project((latDeg * Math.PI) / 180, lon, 1)
          if (p.z > 0) { first ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); first = false }
          else { first = true }
        }
        ctx.strokeStyle = 'rgba(0,180,255,0.04)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }

    function drawMap() {
      LAND.forEach((contour) => {
        ctx.beginPath()
        let penDown = false
        for (let i = 0; i < contour.length - 1; i++) {
          const [lonA, latA] = contour[i]
          const [lonB, latB] = contour[i + 1]
          const steps = Math.max(4, Math.ceil((Math.abs(lonB - lonA) + Math.abs(latB - latA)) / 3))
          for (let s = 0; s <= steps; s++) {
            const t = s / steps
            const p = project(
              ((latA + (latB - latA) * t) * Math.PI) / 180,
              ((lonA + (lonB - lonA) * t) * Math.PI) / 180,
              1.002
            )
            if (p.z > 0.02) {
              penDown ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)
              penDown = true
            } else { penDown = false }
          }
        }
        ctx.strokeStyle = 'rgba(0,229,255,0.82)'
        ctx.lineWidth = 0.9
        ctx.shadowColor = '#00E5FF'
        ctx.shadowBlur = 5
        ctx.stroke()
        ctx.shadowBlur = 0
      })
    }

    // Returns quadratic bezier control point that arcs outward from sphere surface
    function arcCP(pa: { x: number; y: number }, pb: { x: number; y: number }, lift: number) {
      const midX = (pa.x + pb.x) / 2
      const midY = (pa.y + pb.y) / 2
      const dx = midX - cx
      const dy = midY - cy
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      return {
        cpX: cx + (dx / dist) * (dist + R * lift),
        cpY: cy + (dy / dist) * (dist + R * lift),
      }
    }

    function drawPlanet() {
      // ── AMBIENT CORONA ──
      const ambGrd = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.7)
      ambGrd.addColorStop(0, 'rgba(20,70,160,0.07)')
      ambGrd.addColorStop(0.5, 'rgba(0,229,255,0.025)')
      ambGrd.addColorStop(1, 'transparent')
      ctx.fillStyle = ambGrd
      ctx.fillRect(0, 0, W, H)

      // ── SOLID SPHERE — lit from top-left ──
      const spGrd = ctx.createRadialGradient(
        cx - R * 0.32, cy - R * 0.3, R * 0.015,
        cx + R * 0.14, cy + R * 0.14, R
      )
      spGrd.addColorStop(0,    '#1e3a5c')
      spGrd.addColorStop(0.18, '#102238')
      spGrd.addColorStop(0.42, '#06111f')
      spGrd.addColorStop(0.72, '#020a13')
      spGrd.addColorStop(1,    '#000204')
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fillStyle = spGrd
      ctx.fill()

      // ── LIMB DARKENING (clipped inside sphere) ──
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.clip()

      const limbGrd = ctx.createRadialGradient(cx, cy, R * 0.58, cx, cy, R)
      limbGrd.addColorStop(0,    'transparent')
      limbGrd.addColorStop(0.68, 'rgba(0,0,0,0)')
      limbGrd.addColorStop(1,    'rgba(0,0,0,0.92)')
      ctx.fillStyle = limbGrd
      ctx.fillRect(0, 0, W, H)

      // ── GRID + WORLD MAP (both respect tilt via project()) ──
      drawGrid()
      drawMap()

      // ── SPECULAR HIGHLIGHT ──
      const specGrd2 = ctx.createRadialGradient(
        cx - R * 0.42, cy - R * 0.34, 0,
        cx - R * 0.18, cy - R * 0.1, R * 0.54
      )
      specGrd2.addColorStop(0,    'rgba(200,230,255,0.22)')
      specGrd2.addColorStop(0.35, 'rgba(140,200,255,0.08)')
      specGrd2.addColorStop(1,    'transparent')
      ctx.fillStyle = specGrd2
      ctx.fillRect(0, 0, W, H)

      ctx.restore()

      // ── ATMOSPHERE RIM GLOW ──
      const atmGrd = ctx.createRadialGradient(cx, cy, R * 0.86, cx, cy, R * 1.15)
      atmGrd.addColorStop(0,    'rgba(0,229,255,0.0)')
      atmGrd.addColorStop(0.25, 'rgba(0,229,255,0.24)')
      atmGrd.addColorStop(0.52, 'rgba(0,190,255,0.12)')
      atmGrd.addColorStop(0.8,  'rgba(20,100,220,0.04)')
      atmGrd.addColorStop(1,    'transparent')
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.15, 0, Math.PI * 2)
      ctx.fillStyle = atmGrd
      ctx.fill()

      const projected = nodes.map((n) => ({ ...project(n.lat, n.lon, 1), node: n }))

      // ── COMMIT HOP ARCS (curved neon purple) ──
      edges.forEach(([a, b, lift]) => {
        const pa = projected[a], pb = projected[b]
        if (pa.z < 0 && pb.z < 0) return
        const vis = Math.max(0, (pa.z + pb.z) / 2)
        if (vis < 0.04) return
        const { cpX, cpY } = arcCP(pa, pb, lift)
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.quadraticCurveTo(cpX, cpY, pb.x, pb.y)
        ctx.strokeStyle = `rgba(123,97,255,${vis * 0.55})`
        ctx.lineWidth = 1.1
        ctx.shadowColor = '#7B61FF'
        ctx.shadowBlur = 6
        ctx.stroke()
        ctx.shadowBlur = 0
      })

      // ── PARTICLES ALONG ARCS ──
      particles.forEach((p) => {
        p.t += p.speed
        if (p.t > 1) {
          p.t = 0
          p.edge = edges[Math.floor(Math.random() * edges.length)]
        }
        const [ai, bi, lift] = p.edge
        const pa = projected[ai], pb = projected[bi]
        if (!pa || !pb) return
        const pz = pa.z + (pb.z - pa.z) * p.t
        if (pz < 0) return
        const { cpX, cpY } = arcCP(pa, pb, lift)
        const t = p.t
        const bx = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cpX + t * t * pb.x
        const by = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cpY + t * t * pb.y
        ctx.beginPath()
        ctx.arc(bx, by, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(185,150,255,${pz * 0.95})`
        ctx.shadowColor = '#a07aff'
        ctx.shadowBlur = 12
        ctx.fill()
        ctx.shadowBlur = 0
      })

      // ── NODES (purple commit points) ──
      projected.forEach((p) => {
        if (p.z < 0) return
        const alpha = p.z * 0.85 + 0.15
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.node.size * (0.5 + p.z * 0.5), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(123,97,255,${alpha * 0.85})`
        ctx.shadowColor = '#7B61FF'
        ctx.shadowBlur = p.node.size * 5
        ctx.fill()
        ctx.shadowBlur = 0

        if (p.node.brightness > 0.62) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.node.size * 0.42, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(210,190,255,${alpha})`
          ctx.shadowColor = '#d0b8ff'
          ctx.shadowBlur = 8
          ctx.fill()
          ctx.shadowBlur = 0
        }
      })

    }

    let raf: number
    function animate() {
      ctx.clearRect(0, 0, W, H)
      if (!isDragging) {
        velX += (0.003 - velX) * 0.018  // blend toward auto-rotation
        velY *= 0.92                      // tilt velocity decays to 0
      }
      rot += velX
      tilt += velY
      tilt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, tilt))
      drawPlanet()
      raf = requestAnimationFrame(animate)
    }
    animate()

    // ── MOUSE DRAG ──
    function onMouseDown(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left - cx
      const my = e.clientY - rect.top - cy
      if (Math.sqrt(mx * mx + my * my) > R) return
      isDragging = true
      lastMouseX = e.clientX
      lastMouseY = e.clientY
      velX = 0; velY = 0
      canvas.style.cursor = 'grabbing'
    }
    function onMouseMove(e: MouseEvent) {
      if (isDragging) {
        const dx = e.clientX - lastMouseX
        const dy = e.clientY - lastMouseY
        velX = dx * 0.005
        velY = dy * 0.005
        rot += velX
        tilt += velY
        tilt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, tilt))
        lastMouseX = e.clientX
        lastMouseY = e.clientY
      } else {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left - cx
        const my = e.clientY - rect.top - cy
        canvas.style.cursor = Math.sqrt(mx * mx + my * my) < R ? 'grab' : 'default'
      }
    }
    function onMouseUp() {
      if (isDragging) { isDragging = false; canvas.style.cursor = 'grab' }
    }

    // ── TOUCH DRAG ──
    let lastTouchX = 0, lastTouchY = 0
    function onTouchStart(e: TouchEvent) {
      e.preventDefault()
      isDragging = true
      lastTouchX = e.touches[0].clientX
      lastTouchY = e.touches[0].clientY
      velX = 0; velY = 0
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      if (!isDragging) return
      const dx = e.touches[0].clientX - lastTouchX
      const dy = e.touches[0].clientY - lastTouchY
      velX = dx * 0.005; velY = dy * 0.005
      rot += velX; tilt += velY
      tilt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, tilt))
      lastTouchX = e.touches[0].clientX
      lastTouchY = e.touches[0].clientY
    }
    function onTouchEnd() { isDragging = false }

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // ── DEPENDENCY GRAPH ──
  useEffect(() => {
    const c = depRef.current!
    if (!c) return
    const ctx = c.getContext('2d')!
    c.width = c.parentElement?.offsetWidth || 400
    c.height = c.parentElement?.offsetHeight || 200

    const W = c.width, H = c.height
    const nodes = [
      { x: W * 0.50, y: H * 0.50, label: 'core',   r: 12, color: '#00E5FF' },
      { x: W * 0.20, y: H * 0.28, label: 'auth',   r: 9,  color: '#7B61FF' },
      { x: W * 0.80, y: H * 0.28, label: 'api',    r: 10, color: '#00E5FF' },
      { x: W * 0.20, y: H * 0.75, label: 'db',     r: 11, color: '#7B61FF' },
      { x: W * 0.80, y: H * 0.75, label: 'cache',  r: 8,  color: '#00E5FF' },
      { x: W * 0.50, y: H * 0.88, label: 'utils',  r: 7,  color: '#00ff88' },
      { x: W * 0.36, y: H * 0.12, label: 'config', r: 6,  color: '#7B61FF' },
    ]
    const edges: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 6], [2, 4], [3, 5]]
    let pulse = 0
    let raf: number

    function drawDep() {
      ctx.clearRect(0, 0, c.width, c.height)
      pulse += 0.04

      edges.forEach(([a, b]) => {
        const na = nodes[a], nb = nodes[b]
        ctx.beginPath()
        ctx.moveTo(na.x, na.y)
        ctx.lineTo(nb.x, nb.y)
        ctx.strokeStyle = 'rgba(0,229,255,0.2)'
        ctx.lineWidth = 1
        ctx.stroke()

        const t = (Math.sin(pulse + a * 0.5) + 1) / 2
        const px = na.x + (nb.x - na.x) * t
        const py = na.y + (nb.y - na.y) * t
        ctx.beginPath()
        ctx.arc(px, py, 2, 0, Math.PI * 2)
        ctx.fillStyle = '#00E5FF'
        ctx.shadowColor = '#00E5FF'
        ctx.shadowBlur = 6
        ctx.fill()
        ctx.shadowBlur = 0
      })

      nodes.forEach((n) => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = n.color + '33'
        ctx.strokeStyle = n.color
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.stroke()

        ctx.fillStyle = '#e6edf3'
        ctx.font = '10px JetBrains Mono, monospace'
        ctx.textAlign = 'center'
        ctx.fillText(n.label, n.x, n.y + n.r + 12)
      })

      raf = requestAnimationFrame(drawDep)
    }
    drawDep()

    return () => cancelAnimationFrame(raf)
  }, [])

  // ── CONTRIBUTOR NETWORK ──
  useEffect(() => {
    const c = contribRef.current!
    if (!c) return
    const ctx = c.getContext('2d')!
    c.width = c.parentElement?.offsetWidth || 400
    c.height = c.parentElement?.offsetHeight || 200

    const names = ['alice', 'bob', 'carol', 'dave', 'eva', 'frank', 'grace']
    const nodes = names.map((name, i) => {
      const angle = (i / names.length) * Math.PI * 2
      const orbitR = Math.min(c.width, c.height) * 0.34
      const rr = i === 0 ? 0 : orbitR + Math.random() * 10
      return {
        x: c.width / 2 + (i === 0 ? 0 : Math.cos(angle) * rr),
        y: c.height / 2 + (i === 0 ? 0 : Math.sin(angle) * rr),
        name,
        r: i === 0 ? 14 : 8,
        color: i === 0 ? '#00E5FF' : '#7B61FF',
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      }
    })
    const edges: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [3, 4], [5, 6]]
    let t = 0
    let raf: number

    function drawContrib() {
      ctx.clearRect(0, 0, c.width, c.height)
      t += 0.02

      nodes.slice(1).forEach((n) => {
        n.x += n.vx
        n.y += n.vy
        if (n.x < 20 || n.x > c.width - 20) n.vx *= -1
        if (n.y < 20 || n.y > c.height - 20) n.vy *= -1
      })

      edges.forEach(([a, b]) => {
        const na = nodes[a], nb = nodes[b]
        ctx.beginPath()
        ctx.moveTo(na.x, na.y)
        ctx.lineTo(nb.x, nb.y)
        ctx.strokeStyle = 'rgba(123,97,255,0.25)'
        ctx.lineWidth = 1
        ctx.stroke()
      })

      nodes.forEach((n) => {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r + 2 * Math.sin(t + n.x), 0, Math.PI * 2)
        ctx.fillStyle = n.color + '22'
        ctx.fill()

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = n.color + '55'
        ctx.strokeStyle = n.color
        ctx.lineWidth = 1.5
        ctx.fill()
        ctx.shadowColor = n.color
        ctx.shadowBlur = 8
        ctx.stroke()
        ctx.shadowBlur = 0

        ctx.fillStyle = '#e6edf3'
        ctx.font = '9px JetBrains Mono,monospace'
        ctx.textAlign = 'center'
        ctx.fillText(n.name, n.x, n.y + n.r + 10)
      })

      raf = requestAnimationFrame(drawContrib)
    }
    drawContrib()

    return () => cancelAnimationFrame(raf)
  }, [])

  // ── HEATMAP ──
  useEffect(() => {
    const c = heatRef.current!
    if (!c) return
    const ctx = c.getContext('2d')!
    c.width = c.parentElement?.offsetWidth || 400
    c.height = c.parentElement?.offsetHeight || 200

    const files = ['auth.ts', 'api.ts', 'db.ts', 'utils.ts', 'core.ts', 'cache.ts', 'config.ts', 'routes.ts', 'models.ts', 'index.ts']
    const cols = 10
    const cellW = c.width / cols
    let t = 0
    let raf: number

    function drawHeat() {
      ctx.clearRect(0, 0, c.width, c.height)
      t += 0.02

      files.forEach((f, i) => {
        const x = i * cellW
        const complexity = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.5 + i * 0.8))
        const g = ctx.createLinearGradient(x, 0, x, c.height)
        if (complexity > 0.7) {
          g.addColorStop(0, 'rgba(255,80,80,0.8)')
          g.addColorStop(1, 'rgba(255,30,30,0.3)')
        } else if (complexity > 0.4) {
          g.addColorStop(0, 'rgba(255,165,0,0.7)')
          g.addColorStop(1, 'rgba(255,120,0,0.2)')
        } else {
          g.addColorStop(0, 'rgba(0,255,136,0.6)')
          g.addColorStop(1, 'rgba(0,200,100,0.15)')
        }
        const h = (c.height / 3) * complexity
        ctx.fillStyle = g
        ctx.fillRect(x + 1, c.height - h, cellW - 2, h)

        ctx.fillStyle = 'rgba(200,220,255,0.6)'
        ctx.font = '8px JetBrains Mono,monospace'
        ctx.textAlign = 'center'
        ctx.save()
        ctx.translate(x + cellW / 2, c.height - 4)
        ctx.rotate(-Math.PI / 4)
        ctx.fillText(f, 0, 0)
        ctx.restore()
      })

      raf = requestAnimationFrame(drawHeat)
    }
    drawHeat()

    return () => cancelAnimationFrame(raf)
  }, [])

  // ── WHY TIMER ──
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveWhy((i) => (i + 1) % 6)
      setWhyTimerKey((k) => k + 1)
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // ── WHY CANVAS ANIMATIONS ──
  useEffect(() => {
    const c = whyCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    c.width = c.offsetWidth || 600
    c.height = c.offsetHeight || 320
    const W = c.width, H = c.height
    let raf: number
    let t = 0

    if (activeWhy === 0) {
      // ── FILE TREE SCANNER ──
      const files = [
        { name: 'src/', depth: 0, type: 'dir' },
        { name: 'components/', depth: 1, type: 'dir' },
        { name: 'Button.tsx', depth: 2, type: 'file' },
        { name: 'Modal.tsx', depth: 2, type: 'file' },
        { name: 'api/', depth: 1, type: 'dir' },
        { name: 'auth.ts', depth: 2, type: 'file' },
        { name: 'utils.ts', depth: 2, type: 'file' },
        { name: 'lib/', depth: 1, type: 'dir' },
        { name: 'parser.ts', depth: 2, type: 'file' },
        { name: 'index.ts', depth: 1, type: 'file' },
        { name: 'package.json', depth: 0, type: 'file' },
        { name: 'tsconfig.json', depth: 0, type: 'file' },
      ]
      function draw0() {
        ctx.clearRect(0, 0, W, H)
        t += 0.018
        const scanY = ((Math.sin(t * 0.4) + 1) / 2) * (H - 60) + 20
        const beam = ctx.createLinearGradient(0, scanY - 24, 0, scanY + 24)
        beam.addColorStop(0, 'transparent')
        beam.addColorStop(0.5, 'rgba(0,229,255,0.10)')
        beam.addColorStop(1, 'transparent')
        ctx.fillStyle = beam
        ctx.fillRect(0, scanY - 24, W, 48)
        ctx.beginPath(); ctx.moveTo(0, scanY); ctx.lineTo(W, scanY)
        ctx.strokeStyle = 'rgba(0,229,255,0.55)'; ctx.lineWidth = 1
        ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 7; ctx.stroke(); ctx.shadowBlur = 0
        files.forEach((f, i) => {
          const fy = 30 + i * 26
          const fx = 24 + f.depth * 18
          const dist = Math.abs(fy - scanY)
          const bright = Math.max(0, 1 - dist / 55)
          const alpha = 0.22 + bright * 0.78
          if (f.depth > 0) {
            ctx.strokeStyle = `rgba(0,229,255,${alpha * 0.28})`
            ctx.lineWidth = 1; ctx.setLineDash([2, 3])
            ctx.beginPath(); ctx.moveTo(fx - 12, fy); ctx.lineTo(fx - 4, fy); ctx.stroke()
            ctx.setLineDash([])
          }
          ctx.fillStyle = f.type === 'dir' ? `rgba(180,150,255,${alpha})` : `rgba(160,220,255,${alpha})`
          ctx.font = `${10 + bright * 1.5}px JetBrains Mono, monospace`
          ctx.textAlign = 'left'
          ctx.fillText(f.type === 'dir' ? '▸ ' + f.name : '  ' + f.name, fx, fy + 4)
          if (bright > 0.65) {
            ctx.fillStyle = `rgba(0,255,160,${bright * 0.85})`
            ctx.fillText('✓', fx + 140, fy + 4)
          }
        })
        raf = requestAnimationFrame(draw0)
      }
      draw0()

    } else if (activeWhy === 1) {
      // ── ARCHITECTURE DIAGRAM ──
      const boxes = [
        { x: W * 0.50, y: H * 0.10, label: 'CLIENT',    color: '#00E5FF' },
        { x: W * 0.50, y: H * 0.33, label: 'API GW',    color: '#7B61FF' },
        { x: W * 0.22, y: H * 0.60, label: 'AUTH',      color: '#00E5FF' },
        { x: W * 0.50, y: H * 0.60, label: 'SERVICES',  color: '#7B61FF' },
        { x: W * 0.78, y: H * 0.60, label: 'CACHE',     color: '#00ff88' },
        { x: W * 0.35, y: H * 0.87, label: 'DATABASE',  color: '#ff9500' },
        { x: W * 0.65, y: H * 0.87, label: 'STORAGE',   color: '#ff9500' },
      ]
      const conns: [number, number][] = [[0,1],[1,2],[1,3],[1,4],[3,5],[3,6]]
      function draw1() {
        ctx.clearRect(0, 0, W, H)
        t += 0.022
        conns.forEach(([a, b]) => {
          const ba = boxes[a], bb = boxes[b]
          ctx.beginPath(); ctx.moveTo(ba.x, ba.y + 14); ctx.lineTo(bb.x, bb.y - 14)
          ctx.strokeStyle = 'rgba(0,229,255,0.13)'; ctx.lineWidth = 1; ctx.stroke()
          const pt = (Math.sin(t + a * 0.7) + 1) / 2
          const px = ba.x + (bb.x - ba.x) * pt
          const py = (ba.y + 14) + (bb.y - 14 - ba.y - 14) * pt
          ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = '#00E5FF'; ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 8
          ctx.fill(); ctx.shadowBlur = 0
        })
        boxes.forEach((b, i) => {
          const pulse = 0.72 + 0.28 * Math.sin(t * 1.4 + i * 0.9)
          const bw = 88, bh = 26
          ctx.fillStyle = b.color + '14'; ctx.fillRect(b.x - bw / 2, b.y - bh / 2, bw, bh)
          ctx.strokeStyle = b.color; ctx.lineWidth = 1.5
          ctx.shadowColor = b.color; ctx.shadowBlur = 9 * pulse
          ctx.strokeRect(b.x - bw / 2, b.y - bh / 2, bw, bh); ctx.shadowBlur = 0
          ctx.fillStyle = b.color; ctx.font = '9px Orbitron, monospace'
          ctx.textAlign = 'center'; ctx.fillText(b.label, b.x, b.y + 4)
        })
        raf = requestAnimationFrame(draw1)
      }
      draw1()

    } else if (activeWhy === 2) {
      // ── REPO DISCOVERY SPOTLIGHT ──
      const names = ['rust-ml','void-db','nano-ai','flux','nexus','arc','lens','prism','echo','nova','quark','beam','drift','surge','pulse','core','zap','ion']
      const repos = names.map((label, i) => ({
        x: 40 + Math.random() * (W - 80),
        y: 40 + Math.random() * (H - 80),
        label, r: 3 + Math.random() * 5,
        gem: i % 4 === 0,
      }))
      function draw2() {
        ctx.clearRect(0, 0, W, H)
        t += 0.016
        const spotX = W / 2 + Math.sin(t * 0.38) * W * 0.28
        const spotY = H / 2 + Math.cos(t * 0.28) * H * 0.28
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H)
        const spot = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, 115)
        spot.addColorStop(0, 'rgba(0,229,255,0.07)')
        spot.addColorStop(0.6, 'rgba(0,0,0,0)'); spot.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = spot; ctx.fillRect(0, 0, W, H)
        ctx.beginPath(); ctx.arc(spotX, spotY, 115, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,229,255,0.28)'; ctx.lineWidth = 1
        ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([])
        repos.forEach((r, i) => {
          const dist = Math.sqrt((r.x - spotX) ** 2 + (r.y - spotY) ** 2)
          const inSpot = dist < 115
          const alpha = inSpot ? 0.92 : 0.18 + 0.08 * Math.sin(t + i)
          const color = r.gem ? '#00ff88' : '#7B61FF'
          ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
          ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0')
          ctx.shadowColor = color; ctx.shadowBlur = inSpot ? 14 : 3
          ctx.fill(); ctx.shadowBlur = 0
          if (inSpot) {
            ctx.fillStyle = `rgba(200,240,255,${alpha})`
            ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'center'
            ctx.fillText(r.label, r.x, r.y - r.r - 5)
          }
        })
        raf = requestAnimationFrame(draw2)
      }
      draw2()

    } else if (activeWhy === 3) {
      // ── HEALTH METRICS DASHBOARD ──
      const metrics = [
        { label: 'Health Score', pct: 87, color: '#00E5FF' },
        { label: 'Bus Factor',   pct: 30, color: '#7B61FF' },
        { label: 'Community',    pct: 74, color: '#00ff88' },
        { label: 'Maintainers',  pct: 50, color: '#ff9500' },
        { label: 'Activity',     pct: 92, color: '#ff2d78' },
      ]
      function draw3() {
        ctx.clearRect(0, 0, W, H)
        t += 0.022
        const barH = 28, gap = 20
        const total = metrics.length * (barH + gap) - gap
        const startY = (H - total) / 2
        const barMaxW = W - 150
        metrics.forEach((m, i) => {
          const y = startY + i * (barH + gap)
          const fill = (m.pct / 100) * (0.55 + 0.45 * Math.min(1, t / 2.2))
          const pulse = 1 + 0.018 * Math.sin(t * 2.2 + i)
          ctx.fillStyle = 'rgba(200,220,255,0.6)'
          ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = 'left'
          ctx.fillText(m.label, 12, y + barH / 2 + 4)
          ctx.fillStyle = 'rgba(255,255,255,0.04)'
          ctx.fillRect(110, y, barMaxW, barH)
          const grd = ctx.createLinearGradient(110, y, 110 + barMaxW * fill * pulse, y)
          grd.addColorStop(0, m.color + 'aa'); grd.addColorStop(1, m.color)
          ctx.fillStyle = grd; ctx.shadowColor = m.color; ctx.shadowBlur = 10
          ctx.fillRect(110, y, barMaxW * fill * pulse, barH); ctx.shadowBlur = 0
          ctx.fillStyle = m.color; ctx.font = '10px Orbitron, monospace'; ctx.textAlign = 'right'
          ctx.fillText(Math.round(fill * 100) + '%', W - 10, y + barH / 2 + 4)
        })
        raf = requestAnimationFrame(draw3)
      }
      draw3()

    } else if (activeWhy === 4) {
      // ── CODEBASE TREE EXPANSION ──
      type TN = { label: string; x: number; y: number; children: TN[] }
      function mkNode(label: string, depth: number): TN {
        const ch: TN[] = []
        if (depth > 0) {
          const rows = [['src','lib','test','docs'],['auth','api','db','utils'],['index.ts','types.ts','hook.ts','util.ts']]
          const count = depth === 2 ? 3 : 2
          for (let i = 0; i < count; i++) ch.push(mkNode(rows[Math.min(depth - 1, 2)][i], depth - 1))
        }
        return { label, x: 0, y: 0, children: ch }
      }
      const root = mkNode('repo', 3)
      function layout(n: TN, x: number, y: number, spread: number) {
        n.x = x; n.y = y
        if (!n.children.length) return
        const step = spread / n.children.length
        n.children.forEach((ch, i) => layout(ch, x - spread / 2 + step * i + step / 2, y + 58, spread * 0.62))
      }
      layout(root, W / 2, 36, W * 0.88)
      function drawNode(n: TN, depth: number, reveal: number) {
        const alpha = Math.max(0, Math.min(1, (reveal - depth * 0.22) * 4.5))
        if (alpha <= 0) return
        const colors = ['#00E5FF','#7B61FF','#00ff88','#ff9500']
        const color = colors[depth % 4]
        n.children.forEach((ch) => {
          ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(ch.x, ch.y)
          ctx.strokeStyle = `rgba(0,229,255,${alpha * 0.2})`; ctx.lineWidth = 1
          ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([])
          drawNode(ch, depth + 1, reveal)
        })
        ctx.beginPath(); ctx.arc(n.x, n.y, depth === 0 ? 8 : 5, 0, Math.PI * 2)
        ctx.fillStyle = color + Math.round(alpha * 0.35 * 255).toString(16).padStart(2, '0')
        ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0')
        ctx.shadowColor = color; ctx.shadowBlur = 8 * alpha
        ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); ctx.shadowBlur = 0
        ctx.fillStyle = `rgba(200,220,255,${alpha * 0.85})`
        ctx.font = `${depth === 0 ? 11 : 9}px JetBrains Mono, monospace`; ctx.textAlign = 'center'
        ctx.fillText(n.label, n.x, n.y + (depth === 0 ? -13 : 16))
      }
      function draw4() {
        ctx.clearRect(0, 0, W, H)
        t += 0.009
        const reveal = (Math.sin(t * 0.5) + 1) / 2
        drawNode(root, 0, reveal)
        raf = requestAnimationFrame(draw4)
      }
      draw4()

    } else {
      // ── API FLOW NETWORK ──
      const apiNodes = [
        { x: W * 0.07,  y: H * 0.50, label: 'CLIENT',   color: '#00E5FF' },
        { x: W * 0.30,  y: H * 0.50, label: 'GATEWAY',  color: '#7B61FF' },
        { x: W * 0.55,  y: H * 0.20, label: 'AUTH',     color: '#00ff88' },
        { x: W * 0.55,  y: H * 0.50, label: 'REST API', color: '#7B61FF' },
        { x: W * 0.55,  y: H * 0.80, label: 'GQL',      color: '#ff9500' },
        { x: W * 0.82,  y: H * 0.33, label: 'SVC A',    color: '#00E5FF' },
        { x: W * 0.82,  y: H * 0.67, label: 'SVC B',    color: '#ff2d78' },
        { x: W * 0.96,  y: H * 0.50, label: 'DB',       color: '#00E5FF' },
      ]
      const apiConns: [number, number][] = [[0,1],[1,2],[1,3],[1,4],[3,5],[3,6],[4,6],[5,7],[6,7]]
      const pkts = Array.from({ length: 12 }, (_, i) => ({
        edge: apiConns[i % apiConns.length], t: Math.random(), speed: 0.008 + Math.random() * 0.012,
      }))
      function draw5() {
        ctx.clearRect(0, 0, W, H)
        t += 0.022
        apiConns.forEach(([a, b]) => {
          const na = apiNodes[a], nb = apiNodes[b]
          ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y)
          ctx.strokeStyle = 'rgba(0,229,255,0.11)'; ctx.lineWidth = 1; ctx.stroke()
        })
        pkts.forEach((p) => {
          p.t += p.speed
          if (p.t > 1) { p.t = 0; p.edge = apiConns[Math.floor(Math.random() * apiConns.length)] }
          const na = apiNodes[p.edge[0]], nb = apiNodes[p.edge[1]]
          const px = na.x + (nb.x - na.x) * p.t, py = na.y + (nb.y - na.y) * p.t
          ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = '#00E5FF'; ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 8
          ctx.fill(); ctx.shadowBlur = 0
        })
        apiNodes.forEach((n, i) => {
          const pulse = 0.78 + 0.22 * Math.sin(t * 1.4 + i * 0.8)
          const bw = Math.max(52, n.label.length * 7 + 16), bh = 26
          ctx.fillStyle = n.color + '16'; ctx.fillRect(n.x - bw / 2, n.y - bh / 2, bw, bh)
          ctx.strokeStyle = n.color; ctx.lineWidth = 1.5
          ctx.shadowColor = n.color; ctx.shadowBlur = 9 * pulse
          ctx.strokeRect(n.x - bw / 2, n.y - bh / 2, bw, bh); ctx.shadowBlur = 0
          ctx.fillStyle = n.color; ctx.font = '8px Orbitron, monospace'
          ctx.textAlign = 'center'; ctx.fillText(n.label, n.x, n.y + 3)
        })
        raf = requestAnimationFrame(draw5)
      }
      draw5()
    }

    return () => cancelAnimationFrame(raf)
  }, [activeWhy])

  // ── EXPANDED VIZ CANVAS ──
  useEffect(() => {
    if (expandedViz === null || expandedViz === 3) return
    const c = expandedVizRef.current!
    if (!c) return
    const ctx = c.getContext('2d')!
    c.width = c.offsetWidth || 820
    c.height = c.offsetHeight || 500
    const W = c.width, H = c.height
    let raf: number
    let pulse = 0, t = 0

    if (expandedViz === 0) {
      const nodes = [
        { x: W*0.50, y: H*0.50, label: 'core',   r: 16, color: '#00E5FF' },
        { x: W*0.20, y: H*0.25, label: 'auth',   r: 12, color: '#7B61FF' },
        { x: W*0.80, y: H*0.25, label: 'api',    r: 13, color: '#00E5FF' },
        { x: W*0.20, y: H*0.78, label: 'db',     r: 14, color: '#7B61FF' },
        { x: W*0.80, y: H*0.78, label: 'cache',  r: 11, color: '#00E5FF' },
        { x: W*0.50, y: H*0.90, label: 'utils',  r: 10, color: '#00ff88' },
        { x: W*0.36, y: H*0.10, label: 'config', r:  9, color: '#7B61FF' },
      ]
      const edges: [number,number][] = [[0,1],[0,2],[0,3],[0,4],[0,5],[1,6],[2,4],[3,5]]
      function drawDep() {
        ctx.clearRect(0,0,W,H); pulse += 0.04
        edges.forEach(([a,b]) => {
          const na=nodes[a], nb=nodes[b]
          ctx.beginPath(); ctx.moveTo(na.x,na.y); ctx.lineTo(nb.x,nb.y)
          ctx.strokeStyle='rgba(0,229,255,0.18)'; ctx.lineWidth=1; ctx.stroke()
          const tt=(Math.sin(pulse+a*0.5)+1)/2
          const px=na.x+(nb.x-na.x)*tt, py=na.y+(nb.y-na.y)*tt
          ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2)
          ctx.fillStyle='#00E5FF'; ctx.shadowColor='#00E5FF'; ctx.shadowBlur=8; ctx.fill(); ctx.shadowBlur=0
        })
        nodes.forEach(n => {
          ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2)
          ctx.fillStyle=n.color+'33'; ctx.strokeStyle=n.color; ctx.lineWidth=2
          ctx.shadowColor=n.color; ctx.shadowBlur=12; ctx.fill(); ctx.stroke(); ctx.shadowBlur=0
          ctx.fillStyle='#e6edf3'; ctx.font='13px JetBrains Mono,monospace'
          ctx.textAlign='center'; ctx.fillText(n.label, n.x, n.y+n.r+18)
        })
        raf = requestAnimationFrame(drawDep)
      }
      drawDep()

    } else if (expandedViz === 1) {
      const names = ['alice','bob','carol','dave','eva','frank','grace']
      const orbitR = Math.min(W,H)*0.34
      const nodes = names.map((name,i) => {
        const angle=(i/names.length)*Math.PI*2
        const rr=i===0?0:orbitR+Math.random()*10
        return { x:W/2+(i===0?0:Math.cos(angle)*rr), y:H/2+(i===0?0:Math.sin(angle)*rr),
          name, r:i===0?18:11, color:i===0?'#00E5FF':'#7B61FF',
          vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3 }
      })
      const edges: [number,number][] = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,2],[3,4],[5,6]]
      function drawContrib() {
        ctx.clearRect(0,0,W,H); t+=0.02
        nodes.slice(1).forEach(n => {
          n.x+=n.vx; n.y+=n.vy
          if(n.x<20||n.x>W-20) n.vx*=-1; if(n.y<20||n.y>H-20) n.vy*=-1
        })
        edges.forEach(([a,b]) => {
          const na=nodes[a], nb=nodes[b]
          ctx.beginPath(); ctx.moveTo(na.x,na.y); ctx.lineTo(nb.x,nb.y)
          ctx.strokeStyle='rgba(123,97,255,0.25)'; ctx.lineWidth=1; ctx.stroke()
        })
        nodes.forEach(n => {
          ctx.beginPath(); ctx.arc(n.x,n.y,n.r+2*Math.sin(t+n.x),0,Math.PI*2)
          ctx.fillStyle=n.color+'22'; ctx.fill()
          ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2)
          ctx.fillStyle=n.color+'55'; ctx.strokeStyle=n.color; ctx.lineWidth=1.5
          ctx.fill(); ctx.shadowColor=n.color; ctx.shadowBlur=10; ctx.stroke(); ctx.shadowBlur=0
          ctx.fillStyle='#e6edf3'; ctx.font='12px JetBrains Mono,monospace'
          ctx.textAlign='center'; ctx.fillText(n.name, n.x, n.y+n.r+15)
        })
        raf = requestAnimationFrame(drawContrib)
      }
      drawContrib()

    } else if (expandedViz === 2) {
      const files = ['auth.ts','api.ts','db.ts','utils.ts','core.ts','cache.ts','config.ts','routes.ts','models.ts','index.ts']
      const cellW = W/files.length
      function drawHeat() {
        ctx.clearRect(0,0,W,H); t+=0.02
        files.forEach((f,i) => {
          const x=i*cellW
          const complexity=0.3+0.7*Math.abs(Math.sin(t*0.5+i*0.8))
          const g=ctx.createLinearGradient(x,0,x,H)
          if(complexity>0.7){g.addColorStop(0,'rgba(255,80,80,0.85)');g.addColorStop(1,'rgba(255,30,30,0.3)')}
          else if(complexity>0.4){g.addColorStop(0,'rgba(255,165,0,0.75)');g.addColorStop(1,'rgba(255,120,0,0.2)')}
          else{g.addColorStop(0,'rgba(0,255,136,0.65)');g.addColorStop(1,'rgba(0,200,100,0.15)')}
          const h=(H/3)*complexity
          ctx.fillStyle=g; ctx.fillRect(x+2,H-h,cellW-4,h)
          ctx.fillStyle='rgba(200,220,255,0.75)'; ctx.font='11px JetBrains Mono,monospace'
          ctx.textAlign='center'; ctx.save()
          ctx.translate(x+cellW/2,H-12); ctx.rotate(-Math.PI/4); ctx.fillText(f,0,0); ctx.restore()
        })
        raf = requestAnimationFrame(drawHeat)
      }
      drawHeat()
    }

    return () => cancelAnimationFrame(raf)
  }, [expandedViz])

  // ── SCROLL ANIMATIONS ──
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible')
        })
      },
      { threshold: 0.1 }
    )
    document.querySelectorAll('.fade-up').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // ── COUNTER ANIMATION ──
  useEffect(() => {
    const nums = document.querySelectorAll<HTMLElement>('[data-target]')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          const el = e.target as HTMLElement
          const target = parseInt(el.dataset.target || '0')
          let cur = 0
          const step = target / 60
          const interval = setInterval(() => {
            cur = Math.min(cur + step, target)
            const v = Math.floor(cur)
            if (target === 99) el.textContent = v + '%'
            else if (target >= 1000) el.textContent = v + 'k+'
            else if (target === 200) el.textContent = v + 'ms'
            else el.textContent = v + 'M+'
            if (cur >= target) clearInterval(interval)
          }, 20)
          observer.unobserve(el)
        })
      },
      { threshold: 0.5 }
    )
    nums.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [])

  // ── CARD MOUSE TRACKING ──
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>('.cap-card')
    const handlers: [HTMLElement, (e: MouseEvent) => void][] = []
    cards.forEach((card) => {
      const handler = (e: MouseEvent) => {
        const rect = card.getBoundingClientRect()
        card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width) * 100 + '%')
        card.style.setProperty('--my', ((e.clientY - rect.top) / rect.height) * 100 + '%')
      }
      card.addEventListener('mousemove', handler)
      handlers.push([card, handler])
    })
    return () => {
      handlers.forEach(([card, handler]) => card.removeEventListener('mousemove', handler))
    }
  }, [])

  const healthMetrics = [
    { label: 'Health Score', val: 87, max: null, color: '#00E5FF' },
    { label: 'Bus Factor', val: 3, max: 10, color: '#7B61FF' },
    { label: 'Community', val: 74, max: null, color: '#00ff88' },
    { label: 'Maintainers', val: 5, max: 10, color: '#ff9500' },
  ]

  return (
    <>
      {/* Preloader */}
      {!loaded && (
        <div className="preloader">
          <canvas ref={preloaderCanvasRef} className="preloader-canvas" />
        </div>
      )}

      {/* Main content */}
      <div className={`page-wrapper${loaded ? ' page-visible' : ''}`}>

      {/* Starfield */}
      <canvas ref={starsRef} id="stars-canvas" />

      {/* NAV */}
      <nav>
        <div className="nav-logo">
          <img src="/logo.png" className="nav-logo-icon" alt="Git Planet logo" />
          GIT PLANET
        </div>
        <ul className="nav-links">
          <li><a href="#capabilities">Capabilities</a></li>
          <li><a href="#how">How It Works</a></li>
          <li><a href="#viz">Visualizations</a></li>
          <li><a href="#docs">Docs</a></li>
       
        </ul>
        <button
          className="nav-cta"
          onClick={handleGithubLogin}
          disabled={authLoading}
          style={{ opacity: authLoading ? 0.7 : 1, cursor: authLoading ? 'wait' : 'pointer' }}
        >
          {authLoading ? 'CONNECTING...' : 'GITHUB LOGIN'}
        </button>
      </nav>

      {/* HERO */}
      <section className="hero grid-bg">
        <div className="hero-text">
          <div className="hero-badge">
            <span className="badge-dot" />
            LIVE REPOSITORY INTELLIGENCE
          </div>
          <h1>
            Turn GitHub<br />
            <span className="neon">Repositories</span><br />
            Into <span className={`purple glitch-word${isGlitching ? ' glitching' : ''}`} data-text={GLITCH_WORDS[glitchIdx]}>{GLITCH_WORDS[glitchIdx]}</span>
          </h1>
          <div className="hero-buttons">
            <button className="btn-primary" onClick={playChime}>⬡ ANALYZE A REPOSITORY</button>
            <button className="btn-secondary" onClick={playChime}>◎ EXPLORE THE GIT UNIVERSE</button>
          </div>
          <div className="repo-input-wrapper">
            <div className="repo-input-box">
              <span className="repo-prefix">github.com/</span>
              <input type="text" placeholder="username" />
              <button className="repo-analyze-btn" onClick={playChime}>EXPLORE →</button>
            </div>
          </div>
        </div>
        <div className="hero-planet">
          <canvas ref={planetRef} id="planet-canvas" />
        </div>
      </section>

      {/* STATS */}
      <div style={{ padding: '0 60px', position: 'relative', zIndex: 1 }}>
        <div className="stats-row">
          <div className="stat-item">
            <span className="stat-num" data-target="50">0</span>
            <span className="stat-label">MILLION REPOS ANALYZED</span>
          </div>
          <div className="stat-item">
            <span className="stat-num" data-target="1000">0</span>
            <span className="stat-label">INTELLIGENCE SIGNALS</span>
          </div>
          <div className="stat-item">
            <span className="stat-num" data-target="200">0</span>
            <span className="stat-label">MS AVERAGE RESPONSE</span>
          </div>
          <div className="stat-item">
            <span className="stat-num" data-target="99">0</span>
            <span className="stat-label">% UPTIME SLA</span>
          </div>
        </div>
      </div>

      {/* OVERVIEW */}
      <section className="overview" id="overview">
        <div className="overview-header fade-up">
          <div className="section-label">// PLATFORM OVERVIEW</div>
          <h2 className="section-title">The Intelligence Layer<br />for Open Source</h2>
          <p className="section-sub">Git Planet transforms GitHub repositories into rich visual intelligence — revealing architecture, contributor networks, and ecosystem signals that would otherwise take weeks to understand.</p>
        </div>
        <div className="overview-grid">
          <div className="overview-card fade-up">
            <div className="card-icon">🔭</div>
            <div className="card-title">Deep Codebase Analysis</div>
            <p className="card-desc">Traverse entire repository trees, extracting dependency graphs, circular dependencies, dead code, and API surfaces automatically.</p>
          </div>
          <div className="overview-card fade-up">
            <div className="card-icon">🌐</div>
            <div className="card-title">Ecosystem Mapping</div>
            <p className="card-desc">Discover how repositories connect, who builds what, and where the emerging technologies are gaining momentum in real time.</p>
          </div>
          <div className="overview-card fade-up">
            <div className="card-icon">⚡</div>
            <div className="card-title">Instant Intelligence</div>
            <p className="card-desc">Results in milliseconds. No setup. No configuration. Paste a repo URL and receive a full intelligence dashboard immediately.</p>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section id="capabilities" className="grid-bg capabilities-section">
        <div className="fade-up">
          <div className="section-label">// CORE CAPABILITIES</div>
          <h2 className="section-title">What Git Planet Sees</h2>
          <p className="section-sub">Six dimensions of intelligence, extracted from every repository automatically.</p>
        </div>
        <div className="capabilities-grid">
          <div className="cap-card fade-up">
            <div className="cap-header">
              <div className="cap-icon blue">🏗</div>
              <span className="cap-title">Repository Intelligence</span>
            </div>
            <ul className="cap-list">
              <li>Automatic architecture diagram generator</li>
              <li>Codebase dependency graph visualization</li>
              <li>Circular dependency detection</li>
              <li>Dead code &amp; API surface extraction</li>
              <li>Repository complexity scoring</li>
              <li>Monorepo structure analysis</li>
            </ul>
          </div>
          <div className="cap-card fade-up">
            <div className="cap-header">
              <div className="cap-icon purple">👤</div>
              <span className="cap-title">Developer Intelligence</span>
            </div>
            <ul className="cap-list">
              <li>Developer skill inference from commits</li>
              <li>Coding style fingerprint</li>
              <li>Developer influence score</li>
              <li>Career growth graph</li>
              <li>File ownership inference</li>
              <li>Contributor network analysis</li>
            </ul>
          </div>
          <div className="cap-card fade-up">
            <div className="cap-header">
              <div className="cap-icon green">💚</div>
              <span className="cap-title">Open Source Health</span>
            </div>
            <ul className="cap-list">
              <li>Maintainer burnout detection</li>
              <li>Bus factor analysis</li>
              <li>Contributor churn analysis</li>
              <li>Community engagement score</li>
              <li>Issue lifecycle analytics</li>
              <li>Repository health score</li>
            </ul>
          </div>
          <div className="cap-card fade-up">
            <div className="cap-header">
              <div className="cap-icon orange">⚡</div>
              <span className="cap-title">Developer Productivity</span>
            </div>
            <ul className="cap-list">
              <li>Instant repository explanation</li>
              <li>Repo onboarding guide generator</li>
              <li>Learning path generator</li>
              <li>Automatic TODO extraction</li>
              <li>PR impact prediction</li>
              <li>Refactor opportunity detection</li>
            </ul>
          </div>
          <div className="cap-card fade-up">
            <div className="cap-header">
              <div className="cap-icon pink">🌌</div>
              <span className="cap-title">Ecosystem Discovery</span>
            </div>
            <ul className="cap-list">
              <li>Repo ecosystem map</li>
              <li>Underrated repository finder</li>
              <li>Repo similarity engine</li>
              <li>Emerging tech radar</li>
              <li>Startup ideas from repositories</li>
              <li>Duplicate project detection</li>
            </ul>
          </div>
          <div className="cap-card fade-up">
            <div className="cap-header">
              <div className="cap-icon blue">🔐</div>
              <span className="cap-title">Security &amp; Risk</span>
            </div>
            <ul className="cap-list">
              <li>Dependency vulnerability scanner</li>
              <li>Secret &amp; credential leak detection</li>
              <li>License compliance checker</li>
              <li>Outdated dependency alerts</li>
              <li>Supply chain risk scoring</li>
              <li>Security patch tracking</li>
            </ul>
          </div>
        </div>
      </section>

      {/* VISUAL INTELLIGENCE */}
      <section className="viz-section" id="viz">
        <div className="fade-up">
          <div className="section-label">// VISUAL INTELLIGENCE</div>
          <h2 className="section-title">Intelligence You Can See</h2>
          <p className="section-sub">Every repository becomes a living map of architecture, connections, and health signals.</p>
        </div>
        <div className="viz-demo fade-up">
          {[
            { title: 'DEPENDENCY GRAPH', idx: 0 },
            { title: 'CONTRIBUTOR NETWORK', idx: 1 },
            { title: 'COMPLEXITY HEATMAP', idx: 2 },
            { title: 'REPO HEALTH SCORE', idx: 3 },
          ].map(({ title, idx }) => (
            <div key={idx} className="viz-card viz-card-clickable" onClick={() => { playChime(); setExpandedViz(idx) }}>
              <div className="viz-card-header">
                <span className="viz-card-title">{title}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="viz-status"><span className="status-dot" /> LIVE</div>
                  <span className="viz-expand-hint">⤢</span>
                </div>
              </div>
              {idx === 3 ? (
                <div className="viz-body" style={{ padding: '16px 20px' }}>
                  {healthMetrics.map((m) => (
                    <div key={m.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: '#7d8590' }}>{m.label}</span>
                        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: m.color }}>{m.val}{m.max ? `/${m.max}` : ''}</span>
                      </div>
                      <div style={{ height: 6, background: '#161b22', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${m.max ? (m.val / m.max) * 100 : m.val}%`, background: m.color, borderRadius: 3, boxShadow: `0 0 8px ${m.color}88`, transition: 'width 1s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="viz-body">
                  <canvas ref={idx === 0 ? depRef : idx === 1 ? contribRef : heatRef} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* VIZ EXPAND OVERLAY */}
      {expandedViz !== null && (
        <div className="viz-overlay" onClick={() => { playChime(); setExpandedViz(null) }}>
          <div className="viz-expanded" onClick={(e) => e.stopPropagation()}>
            <div className="viz-expanded-header">
              <span className="viz-card-title">
                {['DEPENDENCY GRAPH', 'CONTRIBUTOR NETWORK', 'COMPLEXITY HEATMAP', 'REPO HEALTH SCORE'][expandedViz]}
              </span>
              <button className="viz-close-btn" onClick={() => { playChime(); setExpandedViz(null) }}>✕</button>
            </div>
            {expandedViz === 3 ? (
              <div className="viz-expanded-health">
                {healthMetrics.map((m) => (
                  <div key={m.label} style={{ marginBottom: 28 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: '#7d8590' }}>{m.label}</span>
                      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 15, color: m.color }}>{m.val}{m.max ? `/${m.max}` : '%'}</span>
                    </div>
                    <div style={{ height: 10, background: '#161b22', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${m.max ? (m.val / m.max) * 100 : m.val}%`, background: m.color, borderRadius: 5, boxShadow: `0 0 14px ${m.color}88`, transition: 'width 1.2s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <canvas ref={expandedVizRef} className="viz-expanded-canvas" />
            )}
          </div>
        </div>
      )}

      {/* HOW IT WORKS */}
      <section id="how" className="how-it-works grid-bg">
        <div className="fade-up">
          <div className="section-label">// HOW IT WORKS</div>
          <h2 className="section-title">Four Steps to Intelligence</h2>
        </div>
        <div className="steps fade-up">
          <div className="step">
            <div className="step-num">01</div>
            <div className="step-label">Enter Repository</div>
            <div className="step-desc">Paste any public GitHub URL into the analyzer</div>
          </div>
          <div className="step">
            <div className="step-num">02</div>
            <div className="step-label">Deep Scan</div>
            <div className="step-desc">Git Planet traverses the full codebase and history</div>
          </div>
          <div className="step">
            <div className="step-num">03</div>
            <div className="step-label">Intelligence Engine</div>
            <div className="step-desc">AI extracts architecture, patterns, and signals</div>
          </div>
          <div className="step">
            <div className="step-num">04</div>
            <div className="step-label">Visual Dashboard</div>
            <div className="step-desc">Interactive diagrams and intelligence ready instantly</div>
          </div>
        </div>
      </section>

      {/* WHY */}
      <section style={{ background: 'var(--surface)' }}>
        <div className="fade-up">
          <div className="section-label">// WHY GIT PLANET</div>
          <h2 className="section-title">Intelligence at the<br />Speed of Git</h2>
        </div>
        <div className="why-layout fade-up">
          <div className="why-items">
            {[
              { title: 'Instant Repository Understanding', desc: 'Understand any codebase in seconds, not weeks. No documentation needed.' },
              { title: 'Visual Intelligence for Developers', desc: 'Architecture and dependency graphs rendered as interactive visualizations.' },
              { title: 'Discover Hidden Gems', desc: 'Find underrated repositories and emerging technologies before anyone else.' },
              { title: 'Smarter Technical Decisions', desc: 'Health scores and risk signals make evaluation fast and data-driven.' },
              { title: 'Understand Complex Codebases', desc: 'Onboard to any new project with an AI-generated architecture tour.' },
              { title: 'Open Source by Design', desc: 'API-first platform with full developer access and extensibility.' },
            ].map((item, i) => (
              <div
                key={i}
                className={`why-item${activeWhy === i ? ' active' : ''}`}
                onClick={() => { playChime(); setActiveWhy(i); setWhyTimerKey((k) => k + 1) }}
              >
                <div className="why-check">{String(i + 1).padStart(2, '0')}</div>
                <div className="why-text">
                  <strong>{item.title}</strong>
                  {item.desc}
                </div>
                {activeWhy === i && <div className="why-timer-bar" key={whyTimerKey} />}
              </div>
            ))}
          </div>
          <div className="why-screen">
            <div className="why-screen-hdr">
              <span className="viz-card-title">// {['FILE TREE SCANNER','ARCHITECTURE DIAGRAM','REPO DISCOVERY','HEALTH METRICS','CODEBASE TREE','API FLOW NETWORK'][activeWhy]}</span>
              <div className="viz-status"><span className="status-dot" /> LIVE</div>
            </div>
            <canvas ref={whyCanvasRef} className="why-canvas" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="fade-up">
          <div className="section-label" style={{ textAlign: 'center' }}>// START NOW</div>
          <h2>Explore the<br /><span style={{ color: 'var(--neon)', textShadow: 'var(--neon-glow)' }}>GitHub Universe</span></h2>
          <p>Turn repositories into intelligence.</p>
          <button className="btn-primary" style={{ fontSize: 13, padding: '18px 40px' }} onClick={playChime}>⬡ START ANALYZING REPOSITORIES</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="nav-logo" style={{ position: 'static' }}>
              <img src="/logo.png" className="nav-logo-icon" alt="Git Planet logo" />
              GIT PLANET
            </div>
            <p>The intelligence layer for the GitHub ecosystem. Transforming repositories into actionable developer insights.</p>
          </div>
          <div className="footer-col">
            <h4>PLATFORM</h4>
            <ul>
              <li><a href="#">GitHub Login</a></li>
              <li><a href="#">Analyze Repo</a></li>
              <li><a href="#">Dashboard</a></li>
              <li><a href="#">Explore</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>DEVELOPER</h4>
            <ul>
              <li><a href="#" id="docs">Documentation</a></li>
              <li><a href="#" id="api">API Access</a></li>
              <li><a href="#">SDK</a></li>
              <li><a href="#">Webhooks</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>COMMUNITY</h4>
            <ul>
              <li><a href="#">Discord</a></li>
              <li><a href="#">Open Source</a></li>
              <li><a href="#">GitHub</a></li>
              <li><a href="#">Blog</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>COMPANY</h4>
            <ul>
              <li><a href="#">About</a></li>
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Terms</a></li>
              <li><a href="#">Status</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2025 GIT PLANET // ALL SYSTEMS OPERATIONAL</p>
          <p style={{ color: 'var(--neon)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>v2.4.1 // NEON BUILD</p>
        </div>
      </footer>

      </div>{/* end page-wrapper */}
    </>
  )
}
