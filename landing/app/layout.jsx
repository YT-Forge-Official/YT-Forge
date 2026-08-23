import { Geist, Geist_Mono, Poppins } from 'next/font/google';
import './globals.css';
import { REPO_URL } from '@/lib/site';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

// Matches the wordmark in the Photoshop banner.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL('https://yt-forge.vercel.app'),
  title: 'YT-FORGE — YouTube video downloader, finally done right',
  description:
    'A fast, open-source desktop YouTube downloader that prefers H.264 + AAC, so your files drop straight onto a Premiere, Final Cut or Resolve timeline. macOS, Windows and Linux.',
  keywords: [
    'youtube downloader',
    'yt-dlp gui',
    'h264 youtube download',
    'video downloader for editors',
    'premiere pro youtube download',
    'open source youtube downloader',
  ],
  authors: [{ name: 'Suja', url: REPO_URL }],
  openGraph: {
    title: 'YT-FORGE — YouTube video downloader, finally done right',
    description:
      'Editor-friendly YouTube downloads. H.264 + AAC by default, built-in conversion, playlist batching. Open source, no ads, no tracking.',
    type: 'website',
    images: [{ url: '/banner.png', width: 1024, height: 848, alt: 'YT-FORGE' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'YT-FORGE — YouTube video downloader, finally done right',
    description: 'Editor-friendly YouTube downloads. H.264 + AAC by default. Open source.',
    images: ['/banner.png'],
  },
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export const viewport = {
  themeColor: '#08090a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${poppins.variable}`}>
      <body className="font-[family-name:var(--font-geist)] antialiased">{children}</body>
    </html>
  );
}
