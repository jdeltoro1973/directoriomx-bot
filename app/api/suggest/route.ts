import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

interface RedCorporativa {
  id: string;
  u: number;
  n: string;
}

let redesCache: RedCorporativa[] | null = null;

function getRedes(): RedCorporativa[] {
  if (!redesCache) {
    try {
      const filePath = path.join(process.cwd(), "data", "redes_corporativas.json");
      if (fs.existsSync(filePath)) {
        redesCache = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } else {
        redesCache = [];
      }
    } catch {
      redesCache = [];
    }
  }
  return redesCache ?? [];
}

function normalizar(txt: string): string {
  return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [] });
    }

    const qNorm = normalizar(q);
    const redes = getRedes();
    const matches = [];

    // Filtrar cadenas que contengan el texto, máximo 8 sugerencias
    for (const item of redes) {
      const nNorm = normalizar(item.n);
      if (nNorm.includes(qNorm)) {
        matches.push(item);
      }
    }

    // Ordenar: Priorizar si empieza exactamente con el texto, luego por tamaño de red
    matches.sort((a, b) => {
      const aNorm = normalizar(a.n);
      const bNorm = normalizar(b.n);
      const aStart = aNorm.startsWith(qNorm) ? 1 : 0;
      const bStart = bNorm.startsWith(qNorm) ? 1 : 0;
      
      if (aStart !== bStart) return bStart - aStart;
      return b.u - a.u;
    });

    const topResultados = matches.slice(0, 8).map(r => ({
      nombre: r.n,
      unidades: r.u
    }));

    return NextResponse.json({ success: true, data: topResultados });
  } catch (error) {
    return NextResponse.json({ success: false, data: [] });
  }
}
