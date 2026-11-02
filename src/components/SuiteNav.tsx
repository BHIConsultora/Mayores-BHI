"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileSpreadsheet, ShieldCheck, Landmark } from 'lucide-react';

export function SuiteNav() {
  const pathname = usePathname();

  const isMayores = pathname === '/' || pathname === '/mayores';
  const isCifrado = pathname?.startsWith('/cifrado-columnas');
  const isExtractos = pathname?.startsWith('/extractos-bancarios');

  return (
    <header className="border-b border-border bg-surface/90 backdrop-blur-md sticky top-0 z-50 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-main flex items-center justify-center text-on-main font-bold shadow-xs">
            <span className="font-display tracking-tight text-base">BHI</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-lg text-foreground tracking-tight">BHI Suite</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider bg-main/10 text-main px-2 py-0.5 rounded-full border border-main/20">
                Estudio & BI
              </span>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">Herramientas contables y tratamiento seguro de datos</p>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border flex-wrap justify-center">
          <Link
            href="/"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              isMayores
                ? 'bg-surface text-main shadow-xs font-bold border border-border/80'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface/50'
            }`}
          >
            <FileSpreadsheet className={`h-4 w-4 ${isMayores ? 'text-main' : 'text-muted-foreground'}`} />
            <span>Grilla de Mayores</span>
          </Link>

          <Link
            href="/cifrado-columnas"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              isCifrado
                ? 'bg-surface text-main shadow-xs font-bold border border-border/80'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface/50'
            }`}
          >
            <ShieldCheck className={`h-4 w-4 ${isCifrado ? 'text-main' : 'text-muted-foreground'}`} />
            <span>Cifrado de Columnas</span>
            <span className="text-[10px] bg-main/10 text-main px-1.5 py-0.2 rounded font-mono font-bold">MD5</span>
          </Link>

          <Link
            href="/extractos-bancarios"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              isExtractos
                ? 'bg-surface text-main shadow-xs font-bold border border-border/80'
                : 'text-muted-foreground hover:text-foreground hover:bg-surface/50'
            }`}
          >
            <Landmark className={`h-4 w-4 ${isExtractos ? 'text-main' : 'text-muted-foreground'}`} />
            <span>Extractos Bancarios</span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-700 px-1.5 py-0.2 rounded font-mono font-bold border border-emerald-500/20">
              PDF &rarr; XLSX
            </span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
