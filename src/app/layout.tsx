import { ReactNode } from "react";
import { Noto_Serif, Inter, DM_Mono } from "next/font/google";
import { Metadata } from "next";
import "@/styles/global.scss";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import AdminBar from "@/components/AdminBar";
import MotionProvider from "@/components/MotionProvider";
import getSiteData from "@/components/SiteData";

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

// SEO metadata is driven by the SiteData `seo` JSON field (editable in admin
// settings), with DEFAULT_SEO as the fallback when the entry is empty.
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSiteData();

  return {
    // @ts-ignore
    metadataBase: new URL(process.env.WEBSITE_URL),
    title: {
      default: seo.title,
      template: seo.titleTemplate,
    },
    description: seo.description,
    keywords: seo.keywords,
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
      type: "website",
      url: process.env.WEBSITE_URL,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.ogDescription,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

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
        <a href="#main-content" className="skipLink">
          Skip to main content
        </a>
        <AdminBar />
        <NavBar />
        <MotionProvider>
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
        </MotionProvider>
        <Footer />
      </body>
    </html>
  );
}