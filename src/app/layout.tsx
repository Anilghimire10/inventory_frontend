import type { Metadata } from 'next';
import '../index.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Inventory Manager',
  description: 'Multi-business inventory, POS, and reporting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
