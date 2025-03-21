import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import DevToolsDisabler from "./components/DevToolsDisabler";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'AI 文档审校',
  description: 'AI powered document review system',
}

interface DevTools {
  isOpen: boolean;
  orientation: 'vertical' | 'horizontal' | undefined;
}

declare global {
  interface Window {
    Firebug?: {
      chrome?: {
        isInitialized?: boolean;
      };
    };
  }

  interface WindowEventMap {
    'devtoolschange': CustomEvent<DevTools>;
  }
}

// 禁用开发工具
export const runtime = 'edge'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <DevToolsDisabler />
        {children}
      </body>
    </html>
  );
}
