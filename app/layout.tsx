import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Courtside — College Basketball, Ranked',
  description: 'Find the best college basketball game to watch tonight, ranked by competitiveness, atmosphere, rivalry, and stakes.',
  icons: {
    icon: '/courtside-logo.png',
    shortcut: '/courtside-logo.png',
    apple: '/courtside-logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
