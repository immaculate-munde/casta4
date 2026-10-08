import './globals.css';
import ChatDrawerProvider from '@/components/ChatDrawerProvider';
import GlobalBotFab from '@/components/GlobalBotFab';
import ThemeProvider from '@/components/ThemeProvider';

export const metadata = {
  title: 'Kenya Re — Casta4',
  description:
    'Kenya Re Casta4 — Nairobi flood catastrophe modelling and underwriter decision support for risk and claims',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const themeScript = `(function(){try{var t=localStorage.getItem('casta4-theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <ChatDrawerProvider>
            {children}
            <GlobalBotFab />
          </ChatDrawerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
