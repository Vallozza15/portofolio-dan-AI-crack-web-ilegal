import type { ProjectArtwork as ArtworkKind } from "@/types";
import { cn } from "@/lib/utils";

export function ProjectArtwork({
  kind,
  className,
}: {
  kind: ArtworkKind;
  className?: string;
}) {
  const prefix = `art-${kind}`;

  if (kind === "intelligence") {
    return (
      <svg
        viewBox="0 0 800 500"
        role="img"
        aria-label="Karya seni abstrak jaringan saraf yang mewakili AI dan deteksi ancaman siber"
        className={cn("h-full w-full", className)}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${prefix}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0b0714" />
            <stop offset="1" stopColor="#221138" />
          </linearGradient>
          <radialGradient id={`${prefix}-glow`} cx="50%" cy="40%" r="60%">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
          </radialGradient>
          <pattern id={`${prefix}-grid`} width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="#d8b4fe" strokeOpacity="0.1" />
          </pattern>
        </defs>
        <rect width="800" height="500" fill={`url(#${prefix}-bg)`} />
        <rect width="800" height="500" fill={`url(#${prefix}-glow)`} />
        <rect width="800" height="500" fill={`url(#${prefix}-grid)`} />
        <g fill="none" stroke="#c4b5fd" strokeOpacity="0.35">
          <circle cx="470" cy="245" r="70" />
          <circle cx="470" cy="245" r="118" strokeDasharray="2 8" />
          <circle cx="470" cy="245" r="170" strokeOpacity="0.18" />
          <circle cx="470" cy="245" r="215" strokeOpacity="0.1" />
        </g>
        <g stroke="#a78bfa" strokeOpacity="0.5">
          <path d="M168 330 320 205 470 245 604 152 690 250" fill="none" />
          <path d="M168 330 310 390 470 245 560 360 690 250" fill="none" />
          <path d="M320 205 310 390M604 152 560 360" fill="none" />
        </g>
        <g fill="#c4b5fd">
          <circle cx="168" cy="330" r="5" />
          <circle cx="320" cy="205" r="6" />
          <circle cx="470" cy="245" r="9" />
          <circle cx="604" cy="152" r="5" />
          <circle cx="690" cy="250" r="4" />
          <circle cx="310" cy="390" r="4" />
          <circle cx="560" cy="360" r="4" />
        </g>
        <circle cx="470" cy="245" r="32" fill="#8b5cf6" fillOpacity="0.22" />
        <circle cx="470" cy="245" r="14" fill="#8b5cf6" fillOpacity="0.7" />
        <text
          x="52"
          y="92"
          fill="#f5f3ff"
          fillOpacity="0.12"
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fontSize="138"
        >
          AI
        </text>
        <text
          x="52"
          y="444"
          fill="#c4b5fd"
          fillOpacity="0.7"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          letterSpacing="4"
        >
          DETEKSI / ANALISIS / RESPONS
        </text>
        <text
          x="748"
          y="92"
          textAnchor="end"
          fill="#c4b5fd"
          fillOpacity="0.45"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          letterSpacing="3"
        >
          RISET 01
        </text>
        <rect x="16" y="16" width="768" height="468" fill="none" stroke="#c4b5fd" strokeOpacity="0.16" />
      </svg>
    );
  }

  if (kind === "heritage") {
    return (
      <svg
        viewBox="0 0 800 500"
        role="img"
        aria-label="Karya seni abstrak siluet candi yang mewakili warisan budaya Prambanan"
        className={cn("h-full w-full", className)}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${prefix}-bg`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1108" />
            <stop offset="1" stopColor="#080604" />
          </linearGradient>
          <linearGradient id={`${prefix}-sun`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fde68a" />
            <stop offset="1" stopColor="#d97706" />
          </linearGradient>
          <pattern id={`${prefix}-lines`} width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M0 26 26 0" stroke="#fcd9a0" strokeOpacity="0.07" />
          </pattern>
        </defs>
        <rect width="800" height="500" fill={`url(#${prefix}-bg)`} />
        <rect width="800" height="500" fill={`url(#${prefix}-lines)`} />
        <circle cx="400" cy="222" r="134" fill={`url(#${prefix}-sun)`} fillOpacity="0.22" />
        <circle cx="400" cy="222" r="96" fill="none" stroke="#fcd9a0" strokeOpacity="0.3" />
        <circle cx="400" cy="222" r="64" fill={`url(#${prefix}-sun)`} fillOpacity="0.5" />
        <g fill="#e7b778" fillOpacity="0.14" stroke="#e7b778" strokeOpacity="0.55">
          <path d="M118 400 168 286 218 400Z" />
          <path d="M196 400 264 224 332 400Z" />
          <path d="M284 400 400 126 516 400Z" />
          <path d="M468 400 536 224 604 400Z" />
          <path d="M582 400 632 286 682 400Z" />
        </g>
        <g fill="#fcd9a0" fillOpacity="0.8">
          <rect x="392" y="146" width="16" height="8" />
          <rect x="388" y="164" width="24" height="6" />
          <rect x="254" y="250" width="10" height="5" />
          <rect x="256" y="264" width="6" height="16" />
          <rect x="532" y="250" width="10" height="5" />
          <rect x="538" y="264" width="6" height="16" />
        </g>
        <path d="M70 400H730" stroke="#e7b778" strokeOpacity="0.4" />
        <path d="M70 414H730" stroke="#e7b778" strokeOpacity="0.14" />
        <text
          x="52"
          y="86"
          fill="#fde3b6"
          fillOpacity="0.75"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          letterSpacing="4"
        >
          WARISAN BUDAYA / 850 M
        </text>
        <text
          x="748"
          y="86"
          textAnchor="end"
          fill="#fde3b6"
          fillOpacity="0.4"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          letterSpacing="3"
        >
          INDONESIA
        </text>
        <text
          x="52"
          y="448"
          fill="#fde3b6"
          fillOpacity="0.6"
          fontFamily="Georgia, serif"
          fontStyle="italic"
          fontSize="20"
        >
          Prambanan
        </text>
        <rect x="16" y="16" width="768" height="468" fill="none" stroke="#e7b778" strokeOpacity="0.18" />
      </svg>
    );
  }

  if (kind === "code") {
    return (
      <svg
        viewBox="0 0 800 500"
        role="img"
        aria-label="Karya seni abstrak editor kode yang mewakili dasar-dasar pemrograman"
        className={cn("h-full w-full", className)}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={`${prefix}-bg`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#04100f" />
            <stop offset="1" stopColor="#0a2622" />
          </linearGradient>
          <pattern id={`${prefix}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#5eead4" strokeOpacity="0.08" />
          </pattern>
        </defs>
        <rect width="800" height="500" fill={`url(#${prefix}-bg)`} />
        <rect width="800" height="500" fill={`url(#${prefix}-grid)`} />
        <rect x="74" y="72" width="652" height="356" rx="12" fill="#061715" stroke="#5eead4" strokeOpacity="0.28" />
        <path d="M74 118H726" stroke="#5eead4" strokeOpacity="0.2" />
        <circle cx="102" cy="95" r="4" fill="#5eead4" fillOpacity="0.8" />
        <circle cx="120" cy="95" r="4" fill="#5eead4" fillOpacity="0.4" />
        <circle cx="138" cy="95" r="4" fill="#5eead4" fillOpacity="0.2" />
        <g fontFamily="ui-monospace, monospace" fontSize="13">
          <text x="108" y="158" fill="#5eead4" fillOpacity="0.8">01</text>
          <text x="142" y="158" fill="#d9f99d" fillOpacity="0.75">int main() {"{"}</text>
          <text x="108" y="190" fill="#5eead4" fillOpacity="0.8">02</text>
          <text x="172" y="190" fill="#a7f3d0" fillOpacity="0.6">string name = &quot;Vallozza&quot;;</text>
          <text x="108" y="222" fill="#5eead4" fillOpacity="0.8">03</text>
          <text x="172" y="222" fill="#a7f3d0" fillOpacity="0.6">int score = 90;</text>
          <text x="108" y="254" fill="#5eead4" fillOpacity="0.8">04</text>
          <text x="172" y="254" fill="#a7f3d0" fillOpacity="0.6">if (score &gt;= 80) {"{"}</text>
          <text x="108" y="286" fill="#5eead4" fillOpacity="0.8">05</text>
          <text x="202" y="286" fill="#d9f99d" fillOpacity="0.85">print(&quot;keep building&quot;);</text>
          <text x="108" y="318" fill="#5eead4" fillOpacity="0.8">06</text>
          <text x="172" y="318" fill="#a7f3d0" fillOpacity="0.6">{"}"}</text>
          <text x="108" y="350" fill="#5eead4" fillOpacity="0.8">07</text>
          <text x="142" y="350" fill="#d9f99d" fillOpacity="0.75">{"}"}</text>
          <text x="512" y="350" fill="#5eead4" fillOpacity="0.35">C++ / PYTHON</text>
        </g>
        <rect x="508" y="152" width="156" height="88" rx="8" fill="#5eead4" fillOpacity="0.05" stroke="#5eead4" strokeOpacity="0.16" />
        <text x="528" y="188" fill="#d9f99d" fillOpacity="0.6" fontFamily="Georgia, serif" fontStyle="italic" fontSize="30">
          logika.
        </text>
        <rect x="528" y="204" width="72" height="3" fill="#5eead4" fillOpacity="0.35" />
        <text
          x="52"
          y="46"
          fill="#a7f3d0"
          fillOpacity="0.55"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          letterSpacing="4"
        >
          LATIHAN / 03
        </text>
        <text
          x="748"
          y="46"
          textAnchor="end"
          fill="#a7f3d0"
          fillOpacity="0.4"
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          letterSpacing="3"
        >
          DASAR-DASAR
        </text>
        <rect x="16" y="16" width="768" height="468" fill="none" stroke="#5eead4" strokeOpacity="0.14" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 800 500"
      role="img"
      aria-label="Karya seni abstrak basis data yang mewakili latihan MySQL"
      className={cn("h-full w-full", className)}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${prefix}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#050c16" />
          <stop offset="1" stopColor="#0b2038" />
        </linearGradient>
        <radialGradient id={`${prefix}-glow`} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#60a5fa" stopOpacity="0.35" />
          <stop offset="1" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="800" height="500" fill={`url(#${prefix}-bg)`} />
      <rect width="800" height="500" fill={`url(#${prefix}-glow)`} />
      <g stroke="#93c5fd" strokeOpacity="0.12">
        {Array.from({ length: 12 }).map((_, index) => (
          <line key={`v-${index}`} x1={index * 72} y1="0" x2={index * 72} y2="500" />
        ))}
        {Array.from({ length: 7 }).map((_, index) => (
          <line key={`h-${index}`} x1="0" y1={index * 72} x2="800" y2={index * 72} />
        ))}
      </g>
      <g transform="translate(262 50)">
        {[0, 1, 2, 3].map((index) => (
          <g key={index} transform={`translate(0 ${index * 82})`}>
            <ellipse cx="138" cy="30" rx="138" ry="30" fill="#60a5fa" fillOpacity={0.07 + index * 0.02} stroke="#93c5fd" strokeOpacity="0.4" />
            <path
              d="M0 30v52a138 30 0 0 0 276 0V30"
              fill="#60a5fa"
              fillOpacity="0.04"
              stroke="#93c5fd"
              strokeOpacity="0.22"
            />
          </g>
        ))}
      </g>
      <text
        x="52"
        y="78"
        fill="#bfdbfe"
        fillOpacity="0.55"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
        letterSpacing="2"
      >
        SELECT * FROM practice;
      </text>
      <text
        x="748"
        y="78"
        textAnchor="end"
        fill="#bfdbfe"
        fillOpacity="0.4"
        fontFamily="ui-monospace, monospace"
        fontSize="9"
        letterSpacing="3"
      >
        MYSQL / 04
      </text>
      <text
        x="52"
        y="440"
        fill="#bfdbfe"
        fillOpacity="0.35"
        fontFamily="Georgia, serif"
        fontStyle="italic"
        fontSize="48"
      >
        data.
      </text>
      <rect x="16" y="16" width="768" height="468" fill="none" stroke="#93c5fd" strokeOpacity="0.14" />
    </svg>
  );
}
