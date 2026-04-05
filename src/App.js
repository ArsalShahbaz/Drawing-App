import { useState, useRef, useEffect, useCallback } from "react";

const TOOLS = [
  { id: "pen",     label: "Pen",     icon: "✏️" },
  { id: "brush",   label: "Brush",   icon: "🖌️" },
  { id: "eraser",  label: "Eraser",  icon: "⬜" },
  { id: "line",    label: "Line",    icon: "╱"  },
  { id: "rect",    label: "Rect",    icon: "▭"  },
  { id: "ellipse", label: "Ellipse", icon: "◯"  },
  { id: "fill",    label: "Fill",    icon: "🪣"  },
  { id: "eyedrop", label: "Eyedrop", icon: "💉" },
  { id: "text",    label: "Text",    icon: "T"  },
];

const COLORS = [
  "#1a1a1a","#ffffff","#e74c3c","#e67e22","#f1c40f",
  "#2ecc71","#1abc9c","#3498db","#9b59b6","#e91e63",
  "#ff5722","#795548","#607d8b","#4caf50","#00bcd4",
  "#ff9800","#673ab7","#f06292","#aed581","#80cbc4",
];

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const textInputRef = useRef(null);

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#1a1a1a");
  const [size, setSize] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [textPos, setTextPos] = useState(null);
  const [textVal, setTextVal] = useState("");

  const drawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory((h) => [...h.slice(-29), canvas.toDataURL()]);
    setRedoStack([]);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHistory([canvas.toDataURL()]);
  }, []);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const floodFill = (ctx, x, y, fillColor) => {
    const canvas = ctx.canvas;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const idx = (Math.round(y) * canvas.width + Math.round(x)) * 4;
    const tr = data[idx], tg = data[idx + 1], tb = data[idx + 2];
    const [fr, fg, fb] = hexToRgb(fillColor);
    if (tr === fr && tg === fg && tb === fb) return;
    const stack = [[Math.round(x), Math.round(y)]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cx >= canvas.width || cy < 0 || cy >= canvas.height) continue;
      const i = (cy * canvas.width + cx) * 4;
      if (data[i] === tr && data[i + 1] === tg && data[i + 2] === tb) {
        data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = 255;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);

    if (tool === "eyedrop") {
      const p = ctx.getImageData(Math.round(pos.x), Math.round(pos.y), 1, 1).data;
      setColor(rgbToHex(p[0], p[1], p[2]));
      setTool("pen");
      return;
    }
    if (tool === "fill") {
      saveHistory();
      floodFill(ctx, pos.x, pos.y, color);
      return;
    }
    if (tool === "text") {
      setTextPos(pos);
      setTextVal("");
      setTimeout(() => textInputRef.current && textInputRef.current.focus(), 50);
      return;
    }
    saveHistory();
    drawing.current = true;
    startPos.current = pos;

    if (tool === "pen" || tool === "brush" || tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    }
  }, [tool, color, saveHistory]);

  const handleMouseMove = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx = canvas.getContext("2d");
    const oc = overlay.getContext("2d");
    const pos = getPos(e, canvas);

    if (tool === "pen" || tool === "brush" || tool === "eraser") {
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
      ctx.lineWidth = tool === "brush" ? size * 3 : size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    } else {
      oc.clearRect(0, 0, overlay.width, overlay.height);
      const { x: sx, y: sy } = startPos.current;
      oc.globalAlpha = opacity;
      oc.strokeStyle = color;
      oc.lineWidth = size;
      oc.lineCap = "round";
      if (tool === "line") {
        oc.beginPath(); oc.moveTo(sx, sy); oc.lineTo(pos.x, pos.y); oc.stroke();
      } else if (tool === "rect") {
        oc.strokeRect(sx, sy, pos.x - sx, pos.y - sy);
      } else if (tool === "ellipse") {
        oc.beginPath();
        oc.ellipse((sx + pos.x) / 2, (sy + pos.y) / 2, Math.abs(pos.x - sx) / 2, Math.abs(pos.y - sy) / 2, 0, 0, Math.PI * 2);
        oc.stroke();
      }
    }
  }, [tool, color, size, opacity]);

  const handleMouseUp = useCallback((e) => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx = canvas.getContext("2d");
    const oc = overlay.getContext("2d");
    const pos = getPos(e, canvas);
    const { x: sx, y: sy } = startPos.current;

    if (tool === "line" || tool === "rect" || tool === "ellipse") {
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      if (tool === "line") {
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(pos.x, pos.y); ctx.stroke();
      } else if (tool === "rect") {
        ctx.strokeRect(sx, sy, pos.x - sx, pos.y - sy);
      } else if (tool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse((sx + pos.x) / 2, (sy + pos.y) / 2, Math.abs(pos.x - sx) / 2, Math.abs(pos.y - sy) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      oc.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [tool, color, size, opacity]);

  const commitText = () => {
    if (!textVal || !textPos) { setTextPos(null); return; }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.font = `${size * 5 + 10}px sans-serif`;
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.fillText(textVal, textPos.x, textPos.y);
    ctx.globalAlpha = 1;
    setTextPos(null);
    setTextVal("");
  };

  const undo = () => {
    if (history.length <= 1) return;
    const prev = history[history.length - 2];
    setRedoStack((r) => [...r, history[history.length - 1]]);
    setHistory((h) => h.slice(0, -1));
    const img = new Image();
    img.onload = () => {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  };

  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setHistory((h) => [...h, next]);
    const img = new Image();
    img.onload = () => {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = next;
  };

  const clearCanvas = () => {
    saveHistory();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const download = () => {
    const a = document.createElement("a");
    a.download = "drawing.png";
    a.href = canvasRef.current.toDataURL();
    a.click();
  };

  const cursor =
    tool === "eyedrop" ? "crosshair"
    : tool === "fill"  ? "cell"
    : tool === "text"  ? "text"
    : "crosshair";

  return (
    <div style={styles.app}>
      {/* TOP BAR */}
      <header style={styles.header}>
        <span style={styles.logo}>🎨 Drawing App</span>
        <div style={styles.headerActions}>
          <button style={styles.btn} onClick={undo}>↩ Undo</button>
          <button style={styles.btn} onClick={redo}>↪ Redo</button>
          <button style={{ ...styles.btn, color: "#e74c3c" }} onClick={clearCanvas}>🗑 Clear</button>
          <button style={{ ...styles.btn, fontWeight: 600 }} onClick={download}>⬇ Save</button>
        </div>
      </header>

      <div style={styles.workspace}>
        {/* LEFT TOOLBAR */}
        <div style={styles.toolbar}>
          {TOOLS.map((t) => (
            <button
              key={t.id}
              title={t.label}
              onClick={() => setTool(t.id)}
              style={{
                ...styles.toolBtn,
                background: tool === t.id ? "#e8f0fe" : "transparent",
                color: tool === t.id ? "#1a73e8" : "#333",
                border: tool === t.id ? "1px solid #1a73e8" : "1px solid transparent",
              }}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* CANVAS AREA */}
        <div style={styles.canvasWrapper}>
          <canvas
            ref={canvasRef}
            style={{ ...styles.canvas, cursor }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
          />
          <canvas
            ref={overlayRef}
            style={{ ...styles.canvas, pointerEvents: "none", position: "absolute", top: 0, left: 0 }}
          />
          {textPos && (
            <input
              ref={textInputRef}
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" ? commitText() : e.key === "Escape" && setTextPos(null)}
              onBlur={commitText}
              style={{
                position: "absolute",
                left: textPos.x,
                top: textPos.y - 20,
                background: "transparent",
                border: "1px dashed #aaa",
                color,
                fontSize: size * 5 + 10,
                outline: "none",
                minWidth: 80,
                fontFamily: "sans-serif",
                padding: "0 4px",
                zIndex: 10,
              }}
            />
          )}
        </div>

        {/* RIGHT PANEL */}
        <div style={styles.panel}>
          {/* Color Palette */}
          <div>
            <p style={styles.label}>Color</p>
            <div style={styles.colorGrid}>
              {COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    ...styles.colorSwatch,
                    background: c,
                    outline: color === c ? "2px solid #333" : "1px solid #ccc",
                    outlineOffset: 1,
                  }}
                />
              ))}
            </div>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={styles.colorPicker}
            />
          </div>

          {/* Brush Size */}
          <div>
            <p style={styles.label}>Size: {size}px</p>
            <input
              type="range" min={1} max={40} value={size} step={1}
              onChange={(e) => setSize(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Opacity */}
          <div>
            <p style={styles.label}>Opacity: {Math.round(opacity * 100)}%</p>
            <input
              type="range" min={0.05} max={1} step={0.05} value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Preview */}
          <div>
            <p style={styles.label}>Preview</p>
            <div
              style={{
                width: "100%", height: 44, borderRadius: 8,
                border: "1px solid #ddd", backgroundColor: "#f9f9f9",
                backgroundImage: `radial-gradient(circle, ${color} ${Math.min(size * 2, 44)}px, transparent ${Math.min(size * 2, 44)}px)`,
                backgroundPosition: "center", backgroundRepeat: "no-repeat",
                opacity,
              }}
            />
          </div>

          {/* Active Tool */}
          <div>
            <p style={styles.label}>Active Tool</p>
            <div style={styles.activeTool}>
              {TOOLS.find((t) => t.id === tool)?.icon}{" "}
              {TOOLS.find((t) => t.id === tool)?.label}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  app: {
    display: "flex", flexDirection: "column", height: "100vh",
    fontFamily: "sans-serif", background: "#f0f0f0",
  },
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 16px", height: 50, background: "#ffffff",
    borderBottom: "1px solid #ddd", flexShrink: 0,
  },
  logo: { fontWeight: 700, fontSize: 16 },
  headerActions: { display: "flex", gap: 8 },
  btn: {
    background: "#fff", border: "1px solid #ddd", borderRadius: 6,
    padding: "6px 12px", fontSize: 12, cursor: "pointer", fontFamily: "sans-serif",
  },
  workspace: { display: "flex", flex: 1, overflow: "hidden" },
  toolbar: {
    width: 56, background: "#ffffff", borderRight: "1px solid #ddd",
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "8px 0", gap: 4, overflowY: "auto", flexShrink: 0,
  },
  toolBtn: {
    width: 40, height: 40, borderRadius: 8, cursor: "pointer",
    fontSize: 16, display: "flex", alignItems: "center",
    justifyContent: "center", transition: "all 0.1s",
  },
  canvasWrapper: {
    flex: 1, position: "relative", overflow: "hidden",
  },
  canvas: {
    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
  },
  panel: {
    width: 180, background: "#ffffff", borderLeft: "1px solid #ddd",
    padding: "14px 12px", display: "flex", flexDirection: "column",
    gap: 16, overflowY: "auto", flexShrink: 0,
  },
  label: {
    fontSize: 11, color: "#888", marginBottom: 6, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.4px",
  },
  colorGrid: {
    display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 8,
  },
  colorSwatch: {
    width: "100%", paddingBottom: "100%", borderRadius: 4, cursor: "pointer",
  },
  colorPicker: {
    width: "100%", height: 32, border: "1px solid #ddd",
    borderRadius: 6, cursor: "pointer", padding: 2,
  },
  activeTool: {
    fontSize: 13, padding: "6px 10px", background: "#f5f5f5",
    borderRadius: 6, border: "1px solid #ddd",
  },
};