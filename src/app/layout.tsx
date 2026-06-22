import { ReactNode } from "react";
import { Noto_Serif, Inter, DM_Mono } from "next/font/google";
import { Metadata } from "next";
import "@/styles/global.scss";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import AdminBar from "@/components/AdminBar";

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  // @ts-ignore
  metadataBase: new URL(process.env.WEBSITE_URL),
  title: {
    default: "Tayler Carney's Portfolio",
    template: "%s | Tayler Carney"
  },
  description: "A professional portfolio of structural fashion design by Tayler Carney, showcasing the intersection of garment engineering and architectural precision through pattern-making and material research.",
  keywords: [
    "tayler carney",
    "fashion design portfolio",
    "structural design",
    "pattern making",
    "apparel production",
    "fashion architecture"
  ],
  openGraph: {
    title: "Tayler Carney | Structural Fashion Design",
    description: "Explore a portfolio of garments engineered with the precision of architecture.",
    type: "website",
    url: process.env.WEBSITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: "Tayler Carney | Structural Fashion Design",
    description: "Explore a portfolio of garments engineered with the precision of architecture.",
  },
  robots: {
    index: true,
    follow: true
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${notoSerif.variable} ${inter.variable} ${dmMono.variable}`}
    >
      <body>
        <AdminBar />
        <NavBar />
        {children}
        <Footer />
      </body>
    </html>
  );
}