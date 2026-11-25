import type { Metadata, Viewport } from "next";
import { asset } from "@/lib/assets";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { MotionProvider } from "@/components/motion-provider";
import { siteUrl } from "@/lib/site";

const instrumentSerif = localFont({
  src: [
    {
      path: "../../fonts/instrument-serif-regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../fonts/instrument-serif-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
  preload: true,
});

const themeScript = `(function(){try{var stored=localStorage.getItem('vallozza-theme');if(stored==='light'||stored==='dark'){document.documentElement.dataset.theme=stored;}var meta=document.querySelector('meta[name="theme-color"]');if(meta){meta.setAttribute('content',stored==='light'?'#f4f1ea':'#080808');}}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Vallozza — Portofolio Pribadi",
    template: "%s — Vallozza",
  },
  description:
    "Mahasiswa Informatika yang mendalami keamanan siber, jaringan komputer, pemrograman, AI, dan sistem di balik layar.",
  applicationName: "Vallozza",
  authors: [{ name: "Muhammad Vallozza Vito" }],
  creator: "Muhammad Vallozza Vito",
  publisher: "Muhammad Vallozza Vito",
  category: "technology",
  keywords: [
    "Muhammad Vallozza Vito",
    "Vallozza",
    "Mahasiswa Informatika",
    "Keamanan Siber",
    "Jaringan Komputer",
    "C++",
    "Python",
    "MySQL",
    "Portofolio",
    "Universitas Pamulang",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  formatDetection: { email: false, address: false, telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: "#080808",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="author" href={asset("/llms.txt")} />
      </head>
      <body className="font-sans antialiased">
        <noscript>
          <style>{`[data-reveal]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
