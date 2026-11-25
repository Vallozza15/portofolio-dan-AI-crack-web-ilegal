import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";
export const ogAlt = "Vallozza — portofolio pribadi Muhammad Vallozza Vito";

export function createOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#080808",
          color: "#ffffff",
          padding: "66px",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-160px",
            right: "-100px",
            width: "560px",
            height: "560px",
            borderRadius: "9999px",
            background: "rgba(139,92,246,0.28)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: "26px",
            border: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", fontSize: "20px", letterSpacing: "7px" }}>
            VALLOZZA<span style={{ color: "#a78bfa" }}>.</span>
          </div>
          <div style={{ display: "flex", fontSize: "12px", letterSpacing: "4px", color: "#a1a1aa" }}>
            PORTOFOLIO PRIBADI / 2026
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "0 6px" }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: "74px", lineHeight: 1.02, letterSpacing: "-3px", fontWeight: 600 }}>
            <div style={{ display: "flex" }}>Membangun ide.</div>
            <div style={{ display: "flex" }}>
              Menjelajahi <span style={{ color: "#a78bfa" }}>&nbsp;teknologi.</span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "32px",
              fontSize: "19px",
              color: "#a1a1aa",
              letterSpacing: "0.2px",
            }}
          >
            Keamanan Siber · Jaringan · Pemrograman · Kecerdasan Artifisial
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            padding: "0 6px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: "18px", fontWeight: 600 }}>
              Muhammad Vallozza Vito
            </div>
            <div style={{ display: "flex", fontSize: "12px", color: "#a1a1aa", marginTop: "6px", letterSpacing: "1.5px" }}>
              MAHASISWA INFORMATIKA · PENGGEMAR KEAMANAN SIBER
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: "9999px",
              padding: "10px 18px",
              fontSize: "12px",
              color: "#d4d4d8",
            }}
          >
            Menjelajahi teknologi. Membangun kemungkinan.
          </div>
        </div>
      </div>
    ),
    ogSize,
  );
}
