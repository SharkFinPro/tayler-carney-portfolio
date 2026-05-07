import { ReactNode } from "react";
import { Noto_Serif, Inter, DM_Mono } from "next/font/google";
import { Metadata } from "next";
import "@/styles/global.scss";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";

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
  description: "",
  keywords: [
    "portfolio",
    "fashion"
  ],
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
        <NavBar />
        {children}
        <Footer />
      </body>
    </html>
  );
}