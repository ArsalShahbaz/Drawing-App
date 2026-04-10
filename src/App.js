import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

const TOOLS = [
  { id: "pen",     label: "Pen",     icon: "✏️" },
  { id: "brush",   label: "Brush",   icon: "🖌️" },
  { id: "eraser",  label: "Eraser",  icon: "⬜" },
  { id: "line",    label: "Line",    icon: "╱"  },
  { id: "rect",    label: "Rect",    icon: "▭"  },
  { id: "ellipse", label: "Ellipse", icon: "◯"  },
  { id: "fill",    label: "Fill",    icon: "🪣"  },
  { id: "eyedrop", label: "Pick",    icon: "💉" },
  { id: "text",    label: "Text",    icon: "T"  },
];

const PALETTES = {
  Classic: ["#1a1a1a","#ffffff","#e74c3c","#e67e22","#f1c40f","#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63","#ff5722","#795548","#607d8b","#4caf50","#00bcd4","#ff9800","#673ab7","#f06292","#aed581","#80cbc4"],
  Pastel:  ["#ffb3ba","#ffdfba","#ffffba","#baffc9","#bae1ff","#e8baff","#ffd1dc","#d4edda","#cce5ff","#fff3cd","#f8d7da","#d1ecf1","#e2e3e5","#ffeeba","#c3e6cb","#bee5eb","#b8daff","#f5c6cb","#ffc107","#28a745"],
  Neon:    ["#ff00ff","#00ffff","#ff0080","#00ff80","#8000ff","#ff8000","#0080ff","#ffff00","#ff4444","#44ff44","#4444ff","#ff44aa","#44ffaa","#aa44ff","#ffaa44","#44aaff","#ffffff","#000000","#ff6600","#00ff66"],
};

const THEME_BG = { white: "#ffffff", black: "#000000", grid: "#fafafa" };

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function rgbToHex(r,g,b) {
  return "#"+[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("");
}

export default function App() {
  const canvasRef    = useRef(null);
  const overlayRef   = useRef(null);
  const wrapperRef   = useRef(null);
  const textInputRef = useRef(null);

  const [tool, setTool]               = useState("pen");
  const [color, setColor]             = useState("#1a1a1a");
  const [size, setSize]               = useState(4);
  const [opacity, setOpacity]         = useState(1);
  const [history, setHistory]         = useState([]);
  const [redoStack, setRedoStack]     = useState([]);
  const [textPos, setTextPos]         = useState(null);
  const [textVal, setTextVal]         = useState("");
  const [showPanel, setShowPanel]     = useState(false);
  const [isMobile, setIsMobile]       = useState(window.innerWidth < 700);
  const [activePalette, setActivePalette] = useState("Classic");
  const [canvasTheme, setCanvasTheme] = useState("white");
  const [savedMsg, setSavedMsg]       = useState(false);

  const drawing        = useRef(false);
  const startPos       = useRef({ x:0, y:0 });
  const canvasThemeRef = useRef(canvasTheme);
  useEffect(() => { canvasThemeRef.current = canvasTheme; }, [canvasTheme]);

  // ── RESIZE ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ── CANVAS INIT via ResizeObserver (fixes 0×0 on first render) ────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas  = canvasRef.current;
    const overlay = overlayRef.current;
    let initialized = false;

    const init = () => {
      const w = wrapper.offsetWidth;
      const h = wrapper.offsetHeight;
      if (!w || !h) return;

      let saved = null;
      if (initialized && canvas.width && canvas.height) {
        saved = canvas.toDataURL();
      }

      canvas.width  = w;  canvas.height  = h;
      overlay.width = w;  overlay.height = h;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = THEME_BG[canvasThemeRef.current];
      ctx.fillRect(0, 0, w, h);

      if (saved) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = saved;
      } else {
        setHistory([canvas.toDataURL()]);
      }
      initialized = true;
    };

    const ro = new ResizeObserver(init);
    ro.observe(wrapper);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CANVAS THEME CHANGE ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) return;
    const ctx = canvas.getContext("2d");
    const saved = canvas.toDataURL();
    ctx.fillStyle = THEME_BG[canvasTheme];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = saved;
  }, [canvasTheme]);

  // ── SAVE HISTORY ──────────────────────────────────────────────────────────────
  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snap = canvas.toDataURL();
    setHistory(h => [...h.slice(-29), snap]);
    setRedoStack([]);
  }, []);

  // ── GET POSITION (handles touch end with changedTouches, clamps to bounds) ────
  const getPos = (e, canvas) => {
    const rect   = canvas.getBoundingClientRect();
    const source = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      x: Math.max(0, Math.min(canvas.width,  source.clientX - rect.left)),
      y: Math.max(0, Math.min(canvas.height, source.clientY - rect.top)),
    };
  };

  // ── FLOOD FILL with tolerance ────────────────────────────────────────────────
  const floodFill = (ctx, x, y, fillColor) => {
    const canvas  = ctx.canvas;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data    = imgData.data;
    const ix = Math.round(Math.max(0, Math.min(canvas.width-1,  x)));
    const iy = Math.round(Math.max(0, Math.min(canvas.height-1, y)));
    const base = (iy * canvas.width + ix) * 4;
    const tr=data[base], tg=data[base+1], tb=data[base+2], ta=data[base+3];
    const [fr, fg, fb] = hexToRgb(fillColor);
    if (tr===fr && tg===fg && tb===fb && ta===255) return;

    const TOLERANCE = 32;
    const match = (i) =>
      Math.abs(data[i]  - tr) <= TOLERANCE &&
      Math.abs(data[i+1]- tg) <= TOLERANCE &&
      Math.abs(data[i+2]- tb) <= TOLERANCE &&
      Math.abs(data[i+3]- ta) <= TOLERANCE;

    const visited = new Uint8Array(canvas.width * canvas.height);
    const stack   = [[ix, iy]];
    visited[iy * canvas.width + ix] = 1;

    while (stack.length) {
      const [cx, cy] = stack.pop();
      const i = (cy * canvas.width + cx) * 4;
      if (!match(i)) continue;
      data[i]=fr; data[i+1]=fg; data[i+2]=fb; data[i+3]=255;
      const push = (nx, ny) => {
        if (nx<0||nx>=canvas.width||ny<0||ny>=canvas.height) return;
        const ni = ny * canvas.width + nx;
        if (!visited[ni]) { visited[ni]=1; stack.push([nx,ny]); }
      };
      push(cx+1,cy); push(cx-1,cy); push(cx,cy+1); push(cx,cy-1);
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // ── SHARED SHAPE DRAWING ──────────────────────────────────────────────────────
  const drawShape = useCallback((ctx, t, sx, sy, ex, ey) => {
    ctx.strokeStyle = color;
    ctx.lineWidth   = size;
    ctx.lineCap     = "round";
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    if (t==="line") {
      ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
    } else if (t==="rect") {
      ctx.strokeRect(sx, sy, ex-sx, ey-sy);
    } else if (t==="ellipse") {
      ctx.ellipse((sx+ex)/2,(sy+ey)/2,Math.abs(ex-sx)/2,Math.abs(ey-sy)/2,0,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [color, size, opacity]);

  // ── EVENT HANDLERS ────────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e, canvas);

    if (tool==="eyedrop") {
      const p = ctx.getImageData(Math.round(pos.x), Math.round(pos.y), 1, 1).data;
      setColor(rgbToHex(p[0], p[1], p[2]));
      setTool("pen");
      return;
    }
    if (tool==="fill") {
      saveHistory();
      floodFill(ctx, pos.x, pos.y, color);
      return;
    }
    if (tool==="text") {
      setTextPos(pos);
      setTextVal("");
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    saveHistory();
    drawing.current  = true;
    startPos.current = pos;

    if (tool==="pen"||tool==="brush"||tool==="eraser") {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, color, size, opacity, saveHistory]);

  const handleMouseMove = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas  = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx     = canvas.getContext("2d");
    const oc      = overlay.getContext("2d");
    const pos     = getPos(e, canvas);

    if (tool==="pen"||tool==="brush"||tool==="eraser") {
      // FIX: eraser uses background color, not transparent composite
      ctx.strokeStyle = tool==="eraser" ? THEME_BG[canvasThemeRef.current] : color;
      ctx.lineWidth   = tool==="brush" ? size*3 : tool==="eraser" ? size*2 : size;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.globalAlpha = tool==="eraser" ? 1 : opacity;
      ctx.globalCompositeOperation = "source-over";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      oc.clearRect(0, 0, overlay.width, overlay.height);
      const { x:sx, y:sy } = startPos.current;
      drawShape(oc, tool, sx, sy, pos.x, pos.y);
    }
  }, [tool, color, size, opacity, drawShape]);

  const handleMouseUp = useCallback((e) => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas  = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx     = canvas.getContext("2d");
    const oc      = overlay.getContext("2d");
    const pos     = getPos(e, canvas); // changedTouches handled in getPos
    const { x:sx, y:sy } = startPos.current;

    if (tool==="line"||tool==="rect"||tool==="ellipse") {
      drawShape(ctx, tool, sx, sy, pos.x, pos.y);
      oc.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [tool, drawShape]);

  // ── TEXT ──────────────────────────────────────────────────────────────────────
  const commitText = useCallback(() => {
    if (!textPos) return;
    if (textVal.trim()) {
      const canvas   = canvasRef.current;
      const ctx      = canvas.getContext("2d");
      const fontSize = Math.min(size * 4 + 12, 64);
      ctx.font        = `${fontSize}px 'DM Mono', monospace`;
      ctx.fillStyle   = color;
      ctx.globalAlpha = opacity;
      ctx.fillText(textVal, textPos.x, textPos.y);
      ctx.globalAlpha = 1;
      saveHistory();
    }
    setTextPos(null);
    setTextVal("");
  }, [textPos, textVal, color, size, opacity, saveHistory]);

  // ── UNDO / REDO ───────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length <= 1) return h;
      const prev = h[h.length-2];
      setRedoStack(r => [...r, h[h.length-1]]);
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current;
        c.getContext("2d").clearRect(0,0,c.width,c.height);
        c.getContext("2d").drawImage(img,0,0);
      };
      img.src = prev;
      return h.slice(0,-1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack(r => {
      if (!r.length) return r;
      const next = r[r.length-1];
      setHistory(h => [...h, next]);
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current;
        c.getContext("2d").clearRect(0,0,c.width,c.height);
        c.getContext("2d").drawImage(img,0,0);
      };
      img.src = next;
      return r.slice(0,-1);
    });
  }, []);

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.key==="z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key==="y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ── CLEAR ─────────────────────────────────────────────────────────────────────
  const clearCanvas = () => {
    saveHistory();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    ctx.fillStyle = THEME_BG[canvasTheme];
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  // ── DOWNLOAD ──────────────────────────────────────────────────────────────────
  const download = () => {
    const a = document.createElement("a");
    a.download = `artwork-${Date.now()}.png`;
    a.href = canvasRef.current.toDataURL();
    a.click();
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const cursor = tool==="eyedrop"?"crosshair":tool==="fill"?"cell":tool==="text"?"text":"crosshair";

  return (
    <div className="app-root">
      {/* TOP BAR */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="app-logo">🎨</span>
          <span className="app-title">Artboard<span className="app-title-pro">Pro</span></span>
        </div>
        <div className="topbar-center">
          <div className="canvas-theme-btns">
            {["white","black","grid"].map(t => (
              <button key={t} className={`canvas-theme-btn ${canvasTheme===t?"active":""}`}
                onClick={()=>setCanvasTheme(t)} title={`${t} canvas`}>
                {t==="white"?"☐":t==="black"?"■":"⊞"}
              </button>
            ))}
          </div>
        </div>
        <div className="topbar-right">
          <button className="action-btn" onClick={undo} title="Undo (Ctrl+Z)"><span>↩</span><label>Undo</label></button>
          <button className="action-btn" onClick={redo} title="Redo (Ctrl+Y)"><span>↪</span><label>Redo</label></button>
          <button className="action-btn danger" onClick={clearCanvas}><span>🗑</span><label>Clear</label></button>
          <button className={`action-btn success ${savedMsg?"saved":""}`} onClick={download}>
            <span>{savedMsg?"✓":"⬇"}</span><label>{savedMsg?"Saved!":"Save"}</label>
          </button>
          {isMobile && (
            <button className={`action-btn ${showPanel?"active":""}`} onClick={()=>setShowPanel(p=>!p)}>
              <span>⚙️</span>
            </button>
          )}
        </div>
      </header>

      {/* MOBILE TOOL BAR */}
      {isMobile && (
        <div className="mobile-toolbar">
          {TOOLS.map(t => (
            <button key={t.id} title={t.label}
              onClick={()=>{ setTool(t.id); setShowPanel(false); }}
              className={`tool-btn ${tool===t.id?"active":""}`}>
              {t.icon}
            </button>
          ))}
        </div>
      )}

      <div className="workspace">
        {/* DESKTOP SIDEBAR */}
        {!isMobile && (
          <div className="sidebar-tools">
            <div className="tools-group">
              {TOOLS.map(t => (
                <button key={t.id} title={t.label} onClick={()=>setTool(t.id)}
                  className={`tool-btn ${tool===t.id?"active":""}`}>
                  <span className="tool-icon">{t.icon}</span>
                  <span className="tool-label">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="current-color-preview" style={{background:color}} title="Current color" />
          </div>
        )}

        {/* CANVAS */}
        <div ref={wrapperRef} className={`canvas-wrapper ${canvasTheme}`}>
          {canvasTheme==="grid" && <div className="canvas-grid-bg" />}
          <canvas ref={canvasRef} className="main-canvas"
            style={{ cursor, touchAction:"none" }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}    onMouseLeave={handleMouseUp}
            onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp}
          />
          <canvas ref={overlayRef} className="overlay-canvas" />
          {textPos && (
            <input ref={textInputRef} value={textVal}
              onChange={e=>setTextVal(e.target.value)}
              onKeyDown={e=>{
                if (e.key==="Enter")  commitText();
                if (e.key==="Escape"){ setTextPos(null); setTextVal(""); }
              }}
              onBlur={commitText}
              className="text-input-overlay"
              placeholder="Type here…"
              style={{
                left:     textPos.x,
                top:      Math.max(0, textPos.y - 24),
                color,
                fontSize: Math.min(size*4+12, 64),
              }}
            />
          )}
        </div>

        {/* RIGHT PANEL */}
        {(!isMobile || showPanel) && (
          <div className={`right-panel ${isMobile?"mobile-drawer":""}`}>

            <div className="panel-section">
              <div className="section-title">Active Tool</div>
              <div className="active-tool-badge">
                <span className="active-tool-icon">{TOOLS.find(t=>t.id===tool)?.icon}</span>
                <span className="active-tool-name">{TOOLS.find(t=>t.id===tool)?.label}</span>
              </div>
            </div>

            <div className="panel-section">
              <div className="section-title">Palette</div>
              <div className="palette-tabs">
                {Object.keys(PALETTES).map(p => (
                  <button key={p} className={`palette-tab ${activePalette===p?"active":""}`}
                    onClick={()=>setActivePalette(p)}>{p}</button>
                ))}
              </div>
              <div className="color-grid">
                {PALETTES[activePalette].map(c=>(
                  <div key={c} className={`color-swatch ${color===c?"selected":""}`}
                    onClick={()=>setColor(c)} style={{background:c}} title={c} />
                ))}
              </div>
            </div>

            <div className="panel-section">
              <div className="section-title">Custom Color</div>
              <div className="custom-color-row">
                <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="color-picker" />
                <span className="color-hex">{color.toUpperCase()}</span>
              </div>
            </div>

            <div className="panel-section">
              <div className="section-title">
                Brush Size <span className="section-value">{size}px</span>
              </div>
              <input type="range" min={1} max={60} value={size} step={1}
                onChange={e=>setSize(Number(e.target.value))} className="slider" />
              <div className="brush-preview">
                <div style={{
                  width:  Math.max(4, Math.min(size, 52)),
                  height: Math.max(4, Math.min(size, 52)),
                  background: color, borderRadius:"50%", opacity,
                  transition:"all 0.15s",
                }} />
              </div>
            </div>

            <div className="panel-section">
              <div className="section-title">
                Opacity <span className="section-value">{Math.round(opacity*100)}%</span>
              </div>
              <input type="range" min={0.05} max={1} step={0.05} value={opacity}
                onChange={e=>setOpacity(Number(e.target.value))} className="slider opacity-slider" />
            </div>

            <div className="panel-section">
              <div className="section-title">History</div>
              <div className="history-bar">
                <div className="history-fill" style={{width:`${(history.length/30)*100}%`}} />
              </div>
              <div className="history-label">{history.length} / 30 steps</div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}