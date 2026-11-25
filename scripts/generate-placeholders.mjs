import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT = path.join(process.cwd(), "public", "images", "gallery");

const works = [
  { n: 1, w: 1200, h: 1500, style: "orbit", palette: ["#0B0714", "#1A102B", "#8B5CF6", "#D8B4FE"], label: "PRIBADI / POTRET" },
  { n: 2, w: 1400, h: 900, style: "interface", palette: ["#04100F", "#08201D", "#5EEAD4", "#A7F3D0"], label: "TEKNOLOGI / RUANG KERJA" },
  { n: 3, w: 1200, h: 1500, style: "arches", palette: ["#140E07", "#2A1A0C", "#E7B778", "#FDE3B6"], label: "KAMPUS / ARSITEKTUR" },
  { n: 4, w: 1500, h: 1000, style: "signal", palette: ["#05110F", "#092420", "#34D399", "#A7F3D0"], label: "KEGIATAN / CATATAN LAPANGAN" },
  { n: 5, w: 1200, h: 1500, style: "award", palette: ["#130C04", "#2A1905", "#FBBF24", "#FDE68A"], label: "PENCAPAIAN / CATATAN" },
  { n: 6, w: 1400, h: 1050, style: "blueprint", palette: ["#080A16", "#11152B", "#8B5CF6", "#C4B5FD"], label: "PROYEK / STUDI" },
  { n: 7, w: 1200, h: 1500, style: "frame", palette: ["#0A0A0C", "#1A181C", "#A1A1AA", "#E4E4E7"], label: "FOTOGRAFI / CAHAYA" },
  { n: 8, w: 1400, h: 1050, style: "circuit", palette: ["#071006", "#12230D", "#A3E635", "#D9F99D"], label: "TEKNOLOGI / SINYAL" },
  { n: 9, w: 1500, h: 1000, style: "papers", palette: ["#0D0B09", "#211C16", "#D6C7B0", "#F5EFE4"], label: "KAMPUS / CATATAN" },
  { n: 10, w: 1200, h: 1500, style: "compass", palette: ["#120C08", "#2A1A10", "#FB923C", "#FED7AA"], label: "KEGIATAN / PRAMUKA" },
  { n: 11, w: 1500, h: 1000, style: "ribbon", palette: ["#0D0813", "#221331", "#A78BFA", "#DDD6FE"], label: "PENCAPAIAN / MOMEN" },
  { n: 12, w: 1200, h: 1500, style: "database", palette: ["#050C16", "#0B1A2E", "#60A5FA", "#BFDBFE"], label: "PROYEK / BASIS DATA" },
  { n: 13, w: 1400, h: 1050, style: "night", palette: ["#070B12", "#101A2A", "#94A3B8", "#E2E8F0"], label: "FOTOGRAFI / MALAM" },
  { n: 14, w: 1500, h: 1000, style: "soft", palette: ["#0B0910", "#20162A", "#C084FC", "#F3E8FF"], label: "PRIBADI / SANTAI" },
];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function grainFilter() {
  return `
  <filter id="grain" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer>
  </filter>
  <filter id="blurXL" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="120"/>
  </filter>
  <filter id="blurM" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="42"/>
  </filter>`;
}

function grid(w, h, color, step = 80) {
  let out = "";
  for (let x = step; x < w; x += step) {
    out += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${color}" stroke-opacity="0.09"/>`;
  }
  for (let y = step; y < h; y += step) {
    out += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${color}" stroke-opacity="0.09"/>`;
  }
  return out;
}

function orbit(w, h, [bg1, bg2, a, b], rand) {
  const cx = w * 0.52;
  const cy = h * 0.42;
  let rings = "";
  for (let i = 1; i <= 7; i++) {
    rings += `<ellipse cx="${cx}" cy="${cy}" rx="${i * w * 0.075}" ry="${i * h * 0.072}" fill="none" stroke="${i % 2 ? a : b}" stroke-opacity="${0.34 - i * 0.02}" stroke-width="${i === 2 ? 1.6 : 1}"/>`;
  }
  const dots = Array.from({ length: 22 }, () => {
    const angle = rand() * Math.PI * 2;
    const radius = w * (0.12 + rand() * 0.36);
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius * 0.95;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + rand() * 3).toFixed(1)}" fill="${rand() > 0.5 ? a : b}" fill-opacity="${(0.25 + rand() * 0.5).toFixed(2)}"/>`;
  }).join("");
  return `
    ${rings}${dots}
    <path d="M ${cx - 100} ${cy + 300} C ${cx - 190} ${cy - 120}, ${cx + 210} ${cy - 260}, ${cx + 60} ${cy - 330}" fill="none" stroke="${b}" stroke-opacity="0.5" stroke-width="1.4"/>
    <circle cx="${cx + 60}" cy="${cy - 330}" r="6" fill="${b}"/>
    <text x="${w / 2}" y="${h * 0.72}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${w * 0.16}" fill="${b}" fill-opacity="0.14" font-style="italic">01</text>
  `;
}

function interface_ (w, h, [bg1, bg2, a, b], rand) {
  let bars = "";
  for (let i = 0; i < 7; i++) {
    const y = h * 0.2 + i * h * 0.085;
    const width = w * (0.16 + rand() * 0.55);
    bars += `<rect x="${w * 0.12}" y="${y}" width="${width}" height="${h * 0.024}" rx="${h * 0.012}" fill="${i % 3 === 0 ? a : b}" fill-opacity="${0.16 + rand() * 0.34}"/>`;
  }
  let dots = "";
  for (let i = 0; i < 18; i++) {
    dots += `<circle cx="${w * 0.72 + rand() * w * 0.2}" cy="${h * 0.2 + rand() * h * 0.6}" r="${1.5 + rand() * 5}" fill="${a}" fill-opacity="${0.15 + rand() * 0.6}"/>`;
  }
  return `
    <rect x="${w * 0.07}" y="${h * 0.12}" width="${w * 0.86}" height="${h * 0.76}" rx="18" fill="none" stroke="${a}" stroke-opacity="0.28"/>
    <line x1="${w * 0.07}" y1="${h * 0.22}" x2="${w * 0.93}" y2="${h * 0.22}" stroke="${a}" stroke-opacity="0.24"/>
    <circle cx="${w * 0.105}" cy="${h * 0.17}" r="4" fill="${a}"/><circle cx="${w * 0.125}" cy="${h * 0.17}" r="4" fill="${b}" fill-opacity="0.5"/>
    ${bars}${dots}
    <path d="M ${w * 0.12} ${h * 0.78} C ${w * 0.3} ${h * 0.56}, ${w * 0.5} ${h * 0.9}, ${w * 0.86} ${h * 0.42}" fill="none" stroke="${a}" stroke-opacity="0.7" stroke-width="2"/>
    <circle cx="${w * 0.86}" cy="${h * 0.42}" r="7" fill="${a}"/>
    <text x="${w * 0.12}" y="${h * 0.32}" font-family="ui-monospace, monospace" font-size="${w * 0.015}" letter-spacing="5" fill="${b}" fill-opacity="0.55">SINYAL / 02</text>
  `;
}

function arches(w, h, [bg1, bg2, a, b], rand) {
  let out = "";
  const count = 5;
  for (let i = 0; i < count; i++) {
    const x = w * 0.1 + i * w * 0.17;
    const top = h * 0.18 + (i % 2) * h * 0.08;
    const width = w * 0.23;
    const height = h * 0.62;
    out += `<path d="M ${x} ${top + height} L ${x} ${top + width / 2} A ${width / 2} ${width / 2} 0 0 1 ${x + width} ${top + width / 2} L ${x + width} ${top + height} Z" fill="${i % 2 ? b : a}" fill-opacity="${0.05 + (i % 3) * 0.04}" stroke="${i % 2 ? a : b}" stroke-opacity="${0.26 + rand() * 0.2}"/>`;
  }
  return `${out}
    <rect x="${w * 0.12}" y="${h * 0.83}" width="${w * 0.76}" height="1" fill="${b}" fill-opacity="0.4"/>
    <circle cx="${w * 0.72}" cy="${h * 0.24}" r="${w * 0.045}" fill="${a}" fill-opacity="0.2"/>
    <text x="${w * 0.1}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.014}" letter-spacing="5" fill="${b}" fill-opacity="0.5">03 / STUDI WARISAN</text>
  `;
}

function signal(w, h, [bg1, bg2, a, b], rand) {
  let lines = "";
  for (let i = 0; i < 5; i++) {
    const y = h * (0.3 + i * 0.1);
    const amp = 40 + i * 22;
    let d = `M 0 ${y}`;
    for (let x = 0; x <= w; x += 20) {
      d += ` L ${x} ${(y + Math.sin((x / w) * Math.PI * (4 + i) + rand()) * amp).toFixed(1)}`;
    }
    lines += `<path d="${d}" fill="none" stroke="${i % 2 ? a : b}" stroke-opacity="${0.15 + i * 0.1}" stroke-width="${i === 2 ? 2.2 : 1}"/>`;
  }
  return `${lines}
    <circle cx="${w * 0.82}" cy="${h * 0.32}" r="${w * 0.055}" fill="none" stroke="${a}" stroke-opacity="0.35"/>
    <circle cx="${w * 0.82}" cy="${h * 0.32}" r="${w * 0.02}" fill="${a}" fill-opacity="0.3"/>
    <text x="${w * 0.06}" y="${h * 0.88}" font-family="ui-monospace, monospace" font-size="${w * 0.013}" letter-spacing="6" fill="${b}" fill-opacity="0.55">CATATAN LAPANGAN — 04</text>
  `;
}

function award(w, h, [bg1, bg2, a, b], rand) {
  return `
    <circle cx="${w / 2}" cy="${h * 0.4}" r="${w * 0.23}" fill="${a}" fill-opacity="0.08"/>
    <circle cx="${w / 2}" cy="${h * 0.4}" r="${w * 0.17}" fill="none" stroke="${a}" stroke-opacity="0.5" stroke-width="1.5"/>
    <circle cx="${w / 2}" cy="${h * 0.4}" r="${w * 0.12}" fill="none" stroke="${b}" stroke-opacity="0.25"/>
    <path d="M ${w * 0.44} ${h * 0.54} L ${w * 0.4} ${h * 0.72} L ${w * 0.5} ${h * 0.67} L ${w * 0.6} ${h * 0.72} L ${w * 0.56} ${h * 0.54} Z" fill="${a}" fill-opacity="0.16" stroke="${a}" stroke-opacity="0.4"/>
    <path d="M ${w / 2} ${h * 0.33} L ${w * 0.54} ${h * 0.4} L ${w / 2} ${h * 0.47} L ${w * 0.46} ${h * 0.4} Z" fill="${b}" fill-opacity="0.5"/>
    ${Array.from({ length: 28 }, () => `<circle cx="${rand() * w}" cy="${rand() * h}" r="${rand() * 1.8}" fill="${b}" fill-opacity="${rand() * 0.5}"/>`).join("")}
    <text x="${w * 0.08}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.013}" letter-spacing="5" fill="${b}" fill-opacity="0.5">05 / PENGHARGAAN</text>
  `;
}

function blueprint(w, h, [bg1, bg2, a, b], rand) {
  let nodes = "";
  const pts = Array.from({ length: 9 }, () => ({ x: w * (0.12 + rand() * 0.76), y: h * (0.15 + rand() * 0.7) }));
  for (let i = 0; i < pts.length - 1; i++) {
    nodes += `<line x1="${pts[i].x}" y1="${pts[i].y}" x2="${pts[i + 1].x}" y2="${pts[i + 1].y}" stroke="${a}" stroke-opacity="0.22"/>`;
  }
  nodes += pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${3 + rand() * 5}" fill="${a}" fill-opacity="0.65"/>`).join("");
  return `${nodes}
    <rect x="${w * 0.1}" y="${h * 0.12}" width="${w * 0.8}" height="${h * 0.76}" fill="none" stroke="${b}" stroke-opacity="0.2" stroke-dasharray="8 8"/>
    <text x="${w * 0.1}" y="${h * 0.09}" font-family="ui-monospace, monospace" font-size="${w * 0.012}" letter-spacing="4" fill="${b}" fill-opacity="0.45">PETA PROYEK / 06</text>
    <text x="${w * 0.1}" y="${h * 0.91}" font-family="Georgia, serif" font-style="italic" font-size="${w * 0.05}" fill="${b}" fill-opacity="0.28">riset &amp; bangun</text>
  `;
}

function frame(w, h, [bg1, bg2, a, b], rand) {
  return `
    <rect x="${w * 0.14}" y="${h * 0.17}" width="${w * 0.58}" height="${h * 0.48}" fill="${a}" fill-opacity="0.08" stroke="${b}" stroke-opacity="0.28" transform="rotate(-4 ${w / 2} ${h / 2})"/>
    <rect x="${w * 0.28}" y="${h * 0.28}" width="${w * 0.58}" height="${h * 0.48}" fill="url(#soft)" stroke="${a}" stroke-opacity="0.4" transform="rotate(3 ${w / 2} ${h / 2})"/>
    <circle cx="${w * 0.58}" cy="${h * 0.45}" r="${w * 0.12}" fill="${b}" fill-opacity="0.12"/>
    <line x1="${w * 0.28}" y1="${h * 0.81}" x2="${w * 0.86}" y2="${h * 0.81}" stroke="${b}" stroke-opacity="0.3"/>
    ${Array.from({ length: 30 }, () => `<circle cx="${rand() * w}" cy="${rand() * h}" r="${rand() * 1.3}" fill="${b}" fill-opacity="${0.15 + rand() * 0.3}"/>`).join("")}
    <text x="${w * 0.2}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.013}" letter-spacing="5" fill="${b}" fill-opacity="0.5">07 / CAHAYA TERSEDIA</text>
  `;
}

function circuit(w, h, [bg1, bg2, a, b], rand) {
  let traces = "";
  for (let i = 0; i < 12; i++) {
    let x = w * 0.08;
    let y = h * (0.14 + i * 0.06);
    let d = `M ${x} ${y}`;
    for (let s = 0; s < 4; s++) {
      x += w * (0.08 + rand() * 0.14);
      d += ` L ${x} ${y}`;
      y += h * (rand() > 0.5 ? 0.06 : -0.05);
      d += ` L ${x} ${y}`;
    }
    traces += `<path d="${d}" fill="none" stroke="${i % 3 ? a : b}" stroke-opacity="${0.14 + rand() * 0.3}" stroke-width="1.2"/>`;
    traces += `<circle cx="${x}" cy="${y}" r="3.5" fill="${i % 3 ? a : b}" fill-opacity="0.6"/>`;
  }
  return `${traces}
    <circle cx="${w * 0.72}" cy="${h * 0.44}" r="${w * 0.1}" fill="${bg2}" stroke="${a}" stroke-opacity="0.4"/>
    <circle cx="${w * 0.72}" cy="${h * 0.44}" r="${w * 0.055}" fill="${a}" fill-opacity="0.1"/>
    <text x="${w * 0.08}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.012}" letter-spacing="5" fill="${b}" fill-opacity="0.5">08 / KONEKTIVITAS</text>
  `;
}

function papers(w, h, [bg1, bg2, a, b], rand) {
  let out = "";
  for (let i = 0; i < 4; i++) {
    const x = w * (0.16 + i * 0.13);
    const y = h * (0.18 + i * 0.07);
    out += `<rect x="${x}" y="${y}" width="${w * 0.42}" height="${h * 0.5}" rx="6" fill="${b}" fill-opacity="${0.04 + i * 0.025}" stroke="${b}" stroke-opacity="${0.24}" transform="rotate(${i * 3 - 4} ${x + w * 0.2} ${y + h * 0.2})"/>`;
    for (let l = 0; l < 5; l++) {
      out += `<line x1="${x + w * 0.04}" y1="${y + h * 0.1 + l * h * 0.06}" x2="${x + w * 0.04 + w * (0.18 + rand() * 0.14)}" y2="${y + h * 0.1 + l * h * 0.06}" stroke="${b}" stroke-opacity="0.28" transform="rotate(${i * 3 - 4} ${x + w * 0.2} ${y + h * 0.2})"/>`;
    }
  }
  return `${out}
    <text x="${w * 0.62}" y="${h * 0.82}" font-family="Georgia, serif" font-style="italic" font-size="${w * 0.06}" fill="${b}" fill-opacity="0.4">catatan.</text>
    <text x="${w * 0.62}" y="${h * 0.88}" font-family="ui-monospace, monospace" font-size="${w * 0.012}" letter-spacing="4" fill="${b}" fill-opacity="0.45">KAMPUS / 09</text>
  `;
}

function compass(w, h, [bg1, bg2, a, b], rand) {
  return `
    <circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.26}" fill="none" stroke="${a}" stroke-opacity="0.38"/>
    <circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.19}" fill="none" stroke="${b}" stroke-opacity="0.18" stroke-dasharray="2 7"/>
    <circle cx="${w / 2}" cy="${h * 0.42}" r="${w * 0.055}" fill="${a}" fill-opacity="0.18" stroke="${a}" stroke-opacity="0.5"/>
    <path d="M ${w / 2} ${h * 0.42 - w * 0.26} L ${w / 2 + w * 0.035} ${h * 0.42} L ${w / 2} ${h * 0.42 + w * 0.26} L ${w / 2 - w * 0.035} ${h * 0.42} Z" fill="${a}" fill-opacity="0.12"/>
    <line x1="${w * 0.18}" y1="${h * 0.42}" x2="${w * 0.82}" y2="${h * 0.42}" stroke="${b}" stroke-opacity="0.2"/>
    ${Array.from({ length: 20 }, () => `<circle cx="${rand() * w}" cy="${rand() * h}" r="${rand() * 1.5}" fill="${b}" fill-opacity="0.3"/>`).join("")}
    <text x="${w * 0.08}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.012}" letter-spacing="5" fill="${b}" fill-opacity="0.5">10 / TIM &amp; DISIPLIN</text>
  `;
}

function ribbon(w, h, [bg1, bg2, a, b], rand) {
  return `
    <path d="M ${w * 0.2} ${h * 0.18} L ${w * 0.44} ${h * 0.42} L ${w * 0.38} ${h * 0.62} L ${w * 0.14} ${h * 0.8} L ${w * 0.22} ${h * 0.46} Z" fill="${a}" fill-opacity="0.12" stroke="${a}" stroke-opacity="0.35"/>
    <path d="M ${w * 0.86} ${h * 0.18} L ${w * 0.62} ${h * 0.42} L ${w * 0.68} ${h * 0.62} L ${w * 0.92} ${h * 0.8} L ${w * 0.84} ${h * 0.46} Z" fill="${b}" fill-opacity="0.08" stroke="${b}" stroke-opacity="0.28"/>
    <circle cx="${w / 2}" cy="${h * 0.47}" r="${w * 0.13}" fill="${a}" fill-opacity="0.1" stroke="${a}" stroke-opacity="0.4"/>
    <text x="${w / 2}" y="${h * 0.49}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="${w * 0.055}" fill="${b}" fill-opacity="0.65">ketiga.</text>
    ${Array.from({ length: 24 }, () => `<circle cx="${rand() * w}" cy="${rand() * h}" r="${rand() * 2}" fill="${b}" fill-opacity="${rand() * 0.4}"/>`).join("")}
    <text x="${w * 0.08}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.012}" letter-spacing="5" fill="${b}" fill-opacity="0.5">11 / CATATAN KOMPETISI</text>
  `;
}

function database(w, h, [bg1, bg2, a, b], rand) {
  let cyl = "";
  for (let i = 0; i < 4; i++) {
    const y = h * 0.24 + i * h * 0.13;
    cyl += `<ellipse cx="${w / 2}" cy="${y}" rx="${w * 0.22}" ry="${h * 0.045}" fill="${a}" fill-opacity="${0.06 + i * 0.025}" stroke="${a}" stroke-opacity="0.4"/>
      <path d="M ${w / 2 - w * 0.22} ${y} L ${w / 2 - w * 0.22} ${y + h * 0.09} A ${w * 0.22} ${h * 0.045} 0 0 0 ${w / 2 + w * 0.22} ${y + h * 0.09} L ${w / 2 + w * 0.22} ${y} Z" fill="${a}" fill-opacity="0.04" stroke="${a}" stroke-opacity="0.22"/>`;
  }
  return `${cyl}
    <line x1="${w * 0.1}" y1="${h * 0.15}" x2="${w * 0.38}" y2="${h * 0.15}" stroke="${b}" stroke-opacity="0.3"/>
    <text x="${w * 0.1}" y="${h * 0.12}" font-family="ui-monospace, monospace" font-size="${w * 0.014}" letter-spacing="4" fill="${b}" fill-opacity="0.55">SELECT * FROM practice;</text>
    ${Array.from({ length: 16 }, () => `<rect x="${rand() * w}" y="${rand() * h}" width="${2 + rand() * 3}" height="${2 + rand() * 3}" fill="${b}" fill-opacity="0.2"/>`).join("")}
    <text x="${w * 0.1}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.013}" letter-spacing="5" fill="${b}" fill-opacity="0.5">12 / LATIHAN DATA</text>
  `;
}

function night(w, h, [bg1, bg2, a, b], rand) {
  let blocks = "";
  for (let i = 0; i < 7; i++) {
    const bw = w * (0.07 + rand() * 0.12);
    const bh = h * (0.2 + rand() * 0.45);
    const x = w * (0.06 + i * 0.13);
    blocks += `<rect x="${x}" y="${h * 0.82 - bh}" width="${bw}" height="${bh}" fill="${a}" fill-opacity="${0.04 + rand() * 0.06}" stroke="${a}" stroke-opacity="0.2"/>`;
    for (let wy = 0; wy < Math.floor(bh / (h * 0.06)); wy++) {
      for (let wx = 0; wx < 3; wx++) {
        if (rand() > 0.55) {
          blocks += `<rect x="${x + bw * 0.18 + wx * bw * 0.24}" y="${h * 0.82 - bh + h * 0.03 + wy * h * 0.06}" width="${bw * 0.1}" height="${h * 0.018}" fill="${b}" fill-opacity="${0.15 + rand() * 0.4}"/>`;
        }
      }
    }
  }
  return `${blocks}
    <circle cx="${w * 0.8}" cy="${h * 0.22}" r="${w * 0.045}" fill="${b}" fill-opacity="0.18"/>
    <line x1="${w * 0.06}" y1="${h * 0.82}" x2="${w * 0.94}" y2="${h * 0.82}" stroke="${b}" stroke-opacity="0.35"/>
    <text x="${w * 0.06}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.012}" letter-spacing="5" fill="${b}" fill-opacity="0.5">13 / SETELAH JAM KERJA</text>
  `;
}

function soft(w, h, [bg1, bg2, a, b], rand) {
  return `
    <ellipse cx="${w * 0.38}" cy="${h * 0.42}" rx="${w * 0.34}" ry="${h * 0.4}" fill="${a}" fill-opacity="0.14" filter="url(#blurM)"/>
    <ellipse cx="${w * 0.68}" cy="${h * 0.6}" rx="${w * 0.25}" ry="${h * 0.3}" fill="${b}" fill-opacity="0.09" filter="url(#blurM)"/>
    <rect x="${w * 0.16}" y="${h * 0.18}" width="${w * 0.68}" height="${h * 0.64}" fill="none" stroke="${b}" stroke-opacity="0.22"/>
    <line x1="${w * 0.16}" y1="${h * 0.82}" x2="${w * 0.84}" y2="${h * 0.82}" stroke="${b}" stroke-opacity="0.35"/>
    ${Array.from({ length: 40 }, () => `<circle cx="${rand() * w}" cy="${rand() * h}" r="${rand() * 1.4}" fill="${b}" fill-opacity="${0.12 + rand() * 0.25}"/>`).join("")}
    <text x="${w * 0.16}" y="${h * 0.9}" font-family="ui-monospace, monospace" font-size="${w * 0.012}" letter-spacing="5" fill="${b}" fill-opacity="0.5">14 / BINGKAI TENANG</text>
  `;
}

const renderers = {
  orbit,
  interface: interface_,
  arches,
  signal,
  award,
  blueprint,
  frame,
  circuit,
  papers,
  compass,
  ribbon,
  database,
  night,
  soft,
};

function buildSvg(work, seed) {
  const rand = mulberry32(seed * 7919);
  const [bg1, bg2, a, b] = work.palette;
  const { w, h } = work;
  const art = renderers[work.style](w, h, work.palette, rand);
  const num = String(work.n).padStart(2, "0");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Karya seni gambar contoh abstrak ${num}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="${a}" stop-opacity="0.32"/><stop offset="1" stop-color="${a}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="soft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${b}" stop-opacity="0.16"/><stop offset="1" stop-color="${a}" stop-opacity="0.02"/>
    </linearGradient>
    ${grainFilter()}
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <ellipse cx="${w * 0.15}" cy="${h * 0.12}" rx="${w * 0.4}" ry="${h * 0.3}" fill="${a}" fill-opacity="0.08" filter="url(#blurXL)"/>
  <g>${grid(w, h, b, Math.round(w / 12))}</g>
  <g>${art}</g>
  <g font-family="ui-monospace, 'SFMono-Regular', Menlo, monospace" fill="${b}" fill-opacity="0.55">
    <text x="${w * 0.06}" y="${h * 0.07}" font-size="${Math.max(10, w * 0.011)}" letter-spacing="6">VALLOZZA / ARSIP VISUAL</text>
    <text x="${w * 0.94}" y="${h * 0.07}" text-anchor="end" font-size="${Math.max(10, w * 0.011)}" letter-spacing="4">GAMBAR CONTOH ${num}</text>
    <text x="${w * 0.94}" y="${h * 0.955}" text-anchor="end" font-size="${Math.max(10, w * 0.01)}" letter-spacing="4">${work.label}</text>
  </g>
  <rect x="${w * 0.02}" y="${h * 0.02}" width="${w * 0.96}" height="${h * 0.96}" fill="none" stroke="${b}" stroke-opacity="0.12"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.55"/>
</svg>
`;
}

await mkdir(OUT, { recursive: true });
for (const work of works) {
  const filename = `placeholder-${String(work.n).padStart(2, "0")}.svg`;
  await writeFile(path.join(OUT, filename), buildSvg(work, work.n), "utf8");
  console.log(`✓ ${filename} (${work.w}×${work.h})`);
}
