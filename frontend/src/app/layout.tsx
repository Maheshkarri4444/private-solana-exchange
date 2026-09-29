import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { Providers } from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "Private Exchange";
const DESCRIPTION =
  "Trade on Solana without showing your balances. Private AMM pools and a private order book: balances, trade sizes, pool reserves and orders stay encrypted with Arcium MPC, LPs earn fees privately, and moving tokens to a wallet uses a zero-knowledge proof.";

export const metadata: Metadata = {
  title: { default: TITLE, template: `%s · ${TITLE}` },
  description: DESCRIPTION,
  applicationName: TITLE,
  keywords: ["Solana", "Arcium", "MPC", "private exchange", "encrypted order book", "private AMM", "zero-knowledge", "devnet"],
  openGraph: { type: "website", siteName: TITLE, title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
