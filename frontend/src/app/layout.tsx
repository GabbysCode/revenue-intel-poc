import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/nlp/ChatPanel";

export const metadata: Metadata = {
  title: "RevIntel - Revenue Intelligence Platform",
  description: "Professional revenue analytics and intelligence dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f0f0f] text-[#e5e5e5] antialiased">
        <div className="flex min-h-screen w-full">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 pt-14 pl-14 lg:pt-0 lg:pl-0">
            {children}
          </main>
        </div>
        <ChatPanel />
      </body>
    </html>
  );
}
