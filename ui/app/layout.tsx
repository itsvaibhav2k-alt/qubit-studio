import type { Metadata } from 'next';
import './globals.css';
import './components-list.css';
import './inspector.css';
import './dock.css';
import './requirements.css';
import './tradeoff.css';
import './comparison.css';

export const metadata: Metadata = {
  title: 'Qubit Studio',
  description: 'A CAD-style workbench for a simplified transmon model.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
