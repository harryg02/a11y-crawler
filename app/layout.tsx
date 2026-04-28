import type { Metadata } from 'next';
import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import "./globals.css";

export const metadata: Metadata = {
  title: 'A11y Crawler',
  description: 'Automated web accessibility crawler and scanner',
};

const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-atkinson',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body className="font-sans">
        {children}
      </body>
    </html>
  )
}