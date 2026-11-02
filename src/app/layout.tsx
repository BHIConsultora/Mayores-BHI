import type { Metadata } from 'next';
import { Lexend, Nunito } from 'next/font/google';
import './globals.css';
import { SuiteNav } from '@/components/SuiteNav';

const lexend = Lexend({
  subsets: ['latin'],
  variable: '--font-lexend',
});

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
});

export const metadata: Metadata = {
  title: 'BHI Suite - Herramientas Contables y Tratamiento de Datos',
  description: 'Suite integral para estudios contables: Procesador inteligente de mayores y encriptador/hasheador de columnas.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${lexend.variable} ${nunito.variable}`}>
      <body className="antialiased font-sans bg-background text-foreground min-h-screen flex flex-col">
        <SuiteNav />
        <div className="flex-1">
          {children}
        </div>
        <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border mt-auto">
          Desarrollado por Martin Lasserre y Gerónimo Giggi
        </footer>
      </body>
    </html>
  );
}
