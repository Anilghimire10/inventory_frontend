import type { Metadata } from 'next';
import '../index.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Inventory Manager',
  description: 'Multi-business inventory, POS, and reporting',
};

// Pages that work without a session. Everything else lives under app/(app),
// whose layout sends a visitor with no token to /login -- but only after the
// whole app shell has downloaded and hydrated, so a first-time visitor to `/`
// stared at a spinner for seconds (Lighthouse Speed Index 4.1s) before the
// login form, which is prerendered and paints instantly, ever started loading.
// This runs during HTML parse and skips that wait. Add new public pages here.
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/payment-return',
  '/subscription-expired',
  '/impersonate',
];

// Mirrors getToken() in lib/api.ts. Any doubt (storage blocked, a token
// present) leaves the decision to the (app) layout as before.
const redirectIfSignedOut = `(function(){try{
var p=location.pathname.replace(/\\/+$/,'')||'/';
var pub=${JSON.stringify(PUBLIC_PATHS)};
for(var i=0;i<pub.length;i++)if(p===pub[i]||p.indexOf(pub[i]+'/')===0)return;
if(sessionStorage.getItem('inv_token')||localStorage.getItem('inv_token'))return;
location.replace('/login');
}catch(e){}})();`;

// Web only: the Capacitor export serves pages as /login/index.html and keeps
// its token in localStorage, so it stays on the client-side redirect.
const isMobile = process.env.BUILD_TARGET === 'mobile';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {!isMobile && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: redirectIfSignedOut }} />
        </head>
      )}
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
