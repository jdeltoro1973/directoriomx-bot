import React from "react";

export interface MarcaCorporativa {
  idCorporativo: string;
  nombre: string;
  razonSocial?: string;
  totalUnidades: number;
  totalSucursales: number;
  totalMatrices: number;
}

interface BrandBadgeProps {
  marca: MarcaCorporativa;
}

export function BrandBadge({ marca }: BrandBadgeProps) {
  const { nombre, razonSocial, totalUnidades, totalSucursales, totalMatrices } = marca;

  // Clasificación visual según escala de red
  const getEscala = (unidades: number) => {
    if (unidades >= 50) {
      return {
        label: "Cadena Nacional",
        badgeBg: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
      };
    }
    if (unidades >= 6) {
      return {
        label: "Red Regional Consolidada",
        badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
      };
    }
    return {
      label: "Comercio en Expansión (Red Local)",
      badgeBg: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
    };
  };

  const escala = getEscala(totalUnidades);
  const mostrarRazonSocial =
    razonSocial &&
    razonSocial.trim().toUpperCase() !== nombre.trim().toUpperCase();

  return (
    <div className="w-full mb-6 p-4 md:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Lado izquierdo: Identidad y razón social */}
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {nombre}
              </h2>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${escala.badgeBg}`}
              >
                {escala.label}
              </span>
            </div>

            {mostrarRazonSocial && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                Razón Social: {razonSocial}
              </p>
            )}
          </div>
        </div>

        {/* Lado derecho: Métricas de unidades registradas */}
        <div className="flex items-center gap-2 sm:gap-4 border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-800 pt-3 sm:pt-0 sm:pl-5 text-center">
          <div className="flex-1 sm:flex-none">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Total Red
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {totalUnidades.toLocaleString("es-MX")}
            </p>
          </div>

          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex-1 sm:flex-none">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Sucursales
            </p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {totalSucursales.toLocaleString("es-MX")}
            </p>
          </div>

          {totalMatrices > 0 && (
            <>
              <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 hidden sm:block" />
              <div className="flex-1 sm:flex-none">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Matrices
                </p>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {totalMatrices.toLocaleString("es-MX")}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
