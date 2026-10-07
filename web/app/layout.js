import './globals.css';
import ChatDrawerProvider from '@/components/ChatDrawerProvider';
import GlobalBotFab from '@/components/GlobalBotFab';
import ThemeProvider from '@/components/ThemeProvider';

export const metadata = {
  title: 'Kenya Re — Casta4',
  description: 'Pluvial flood catastrophe modelling and ReAgent document intelligence for Kenya Re',
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
