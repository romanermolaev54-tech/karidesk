import type { Metadata, Viewport } from "next";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SwUpdater } from "@/components/SwUpdater";
import "./globals.css";

export const metadata: Metadata = {
  title: "KariDesk",
  description: "Платформа управления заявками сети магазинов Кари",
  manifest: "/manifest.json",
  icons: {
    icon: "/logo-kari-icon.png",
    apple: "/logo-kari-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#E91E8C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-surface text-text-primary">
        <ThemeProvider>
          <SwUpdater />
          {children}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'rgb(var(--surface-card))',
                color: 'rgb(var(--text-primary))',
                borderRadius: '12px',
                border: '1px solid var(--border-default)',
                boxShadow: 'var(--shadow-elevated)',
                fontSize: '0.8125rem',
              },
              success: {
                iconTheme: { primary: '#34D399', secondary: '#fff' },
              },
              error: {
                iconTheme: { primary: '#F87171', secondary: '#fff' },
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
