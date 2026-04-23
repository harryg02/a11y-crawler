import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import "./globals.css";

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