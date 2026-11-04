import { NextRequest, NextResponse } from "next/server";
import { turso } from "@/lib/turso";

const CATEGORIAS_KEYWORDS: Record<string, string[]> = {
  C01: ["abarrotes", "miscelanea", "tiendita", "viveres", "tienda"],
  C02: ["minisuper", "conveniencia", "oxxo", "seven", "supercito"],
  C03: ["supermercado", "mayorista", "bodega", "walmart", "soriana", "chedraui", "costco", "sams"],
  C04: ["taqueria", "tacos", "antojitos", "quesadillas", "tortas", "tamales", "gorditas", "birria"],
  C05: ["comida rapida", "hamburguesas", "pizzas", "pizza", "hot dogs", "sushi", "alitas"],
  C06: ["restaurante", "mariscos", "comedor", "cocina economica", "fondita", "buffet"],
  C07: ["cafeteria", "cafe", "pasteleria", "pasteles", "postres", "reposteria", "heladeria", "helados", "neveria"],
  C08: ["panaderia", "pan", "tortilleria", "tortillas", "molino"],
  C09: ["carniceria", "carne", "polleria", "pollo", "pescaderia", "verduleria", "fruteria", "frutas", "verduras"],
  C10: ["taller", "talleres", "mecanico", "mecanica", "hojalateria", "frenos", "suspension", "electrico automotriz"],
  C11: ["refaccionaria", "refacciones", "autolavado", "car wash", "llantas", "llantera", "vulcanizadora"],
  C12: ["estetica", "barberia", "barber", "salon de belleza", "peluqueria", "unas", "spa"],
  C13: ["consultorio", "medico", "doctor", "doctora", "dentista", "dental", "odontologo", "psicologo", "pediatra"],
  C14: ["ropa", "calzado", "zapatos", "zapateria", "boutique", "vestidos", "blancos", "telas", "muebles", "muebleria"],
  C15: ["escuela", "colegio", "universidad", "instituto", "primaria", "secundaria", "preparatoria", "kinder"],
  C16: ["papeleria", "regalos", "novedades", "libreria", "copias", "internet"],
  C17: ["ferreteria", "tlapaleria", "tornillos", "herramientas", "plomeria", "material electrico", "pinturas", "materiales"],
  C18: ["farmacia", "botica", "drogueria", "medicamentos"],
  C19: ["bar", "bares", "cantina", "cerveceria", "antro", "pub"],
  C20: ["gimnasio", "gym", "fitness", "deportes", "crossfit", "pesas"],
  C21: ["cadenas comerciales", "franquicias"],
  C22: ["hospital", "clinica", "sanatorio", "urgencias"],
  C23: ["guarderia", "asilo", "asistencia social"],
};

function normalizar(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function diceBiGrams(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;

  const bg = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2);
    bg.set(pair, (bg.get(pair) || 0) + 1);
  }

  let intersection = 0;
  for (let j = 0; j < b.length - 1; j++) {
    const pair = b.slice(j, j + 2);
    const count = bg.get(pair) || 0;
    if (count > 0) {
      intersection++;
      bg.set(pair, count - 1);
    }
  }

  return (2.0 * intersection) / (a.length - 1 + (b.length - 1));
}

function evaluarSimilitud(entrada: string, objetivo: string): number {
  if (entrada === objetivo) return 1.0;
  const scoreDirecto = diceBiGrams(entrada, objetivo);
  const entradaColapsada = entrada.replace(/(.)\1+/g, "$1");
  const objColapsado = objetivo.replace(/(.)\1+/g, "$1");
  const scoreColapsado = diceBiGrams(entradaColapsada, objColapsado);
  return Math.max(scoreDirecto, scoreColapsado);
}

function resolverCategoria(texto: string): { catId: string; palabra: string; score: number } | null {
  const q = normalizar(texto);
  let mejor: { catId: string; palabra: string; score: number } | null = null;
  let maxScore = 0;

  for (const [catId, palabras] of Object.entries(CATEGORIAS_KEYWORDS)) {
    for (const palabra of palabras) {
      const score = evaluarSimilitud(q, palabra);
      if (score > 0.55 && score > maxScore) {
        maxScore = score;
        mejor = { catId, palabra, score };
      }
    }
  }
  return mejor;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQ = (searchParams.get("q") || "").trim();
    const estado = (searchParams.get("estado") || "").trim();
    const municipio = (searchParams.get("municipio") || "").trim();
    const limit = 20;

    let categoriaDetectada: string | null = null;
    let terminoFiltroNombre = "";

    if (rawQ) {
      // 1. Probar coincidencia difusa directa sobre la frase completa
      const matchTotal = resolverCategoria(rawQ);

      if (matchTotal) {
        categoriaDetectada = matchTotal.catId;
      } else {
        // 2. Probar coincidencia por palabras ("Mueblería La Estrella")
        const palabras = rawQ.split(/\s+/);
        let palabraCatEncontrada = "";

        for (const token of palabras) {
          if (token.length >= 4) {
            const matchToken = resolverCategoria(token);
            if (matchToken && matchToken.score >= 0.6) {
              categoriaDetectada = matchToken.catId;
              palabraCatEncontrada = token;
              break;
            }
          }
        }

        if (palabraCatEncontrada) {
          terminoFiltroNombre = palabras
            .filter((p) => p.toLowerCase() !== palabraCatEncontrada.toLowerCase())
            .join(" ")
            .trim();
        } else {
          // No es categoría: buscar el texto tal cual en el nombre del negocio
          terminoFiltroNombre = rawQ;
        }
      }
    }

    const whereConditions: string[] = [];
    const args: (string | number)[] = [];

    if (categoriaDetectada) {
      whereConditions.push("dp.categoria_id = ?");
      args.push(categoriaDetectada);
    }

    if (terminoFiltroNombre.length >= 2) {
      whereConditions.push("dp.nombre LIKE ?");
      args.push(`%${terminoFiltroNombre}%`);
    }

    if (estado) {
      whereConditions.push("(dp.estado LIKE ? OR dp.slug_estado LIKE ?)");
      args.push(`%${estado}%`, `%${estado.toLowerCase()}%`);
    }

    if (municipio) {
      whereConditions.push("(dp.municipio LIKE ? OR dp.slug_municipio LIKE ?)");
      args.push(`%${municipio}%`, `%${municipio.toLowerCase()}%`);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const sql = `
      SELECT 
        dp.id,
        dp.nombre,
        dp.tipo_vial,
        dp.calle,
        dp.num_ext,
        dp.colonia,
        dp.cp,
        dp.municipio,
        dp.estado,
        dp.lat,
        dp.lon,
        dp.telefono,
        dp.email,
        dp.web,
        dc.nombre AS categoria
      FROM directorio_prod dp
      LEFT JOIN directorio_categorias dc ON dp.categoria_id = dc.id
      ${whereClause}
      LIMIT ?;
    `;
    args.push(limit);

    const rs = await turso.execute({ sql, args });

    return NextResponse.json({
      success: true,
      categoriaId: categoriaDetectada,
      data: rs.rows,
    });
  } catch (error: any) {
    console.error("Error en /api/search:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al procesar la búsqueda" },
      { status: 500 }
    );
  }
}
