import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import path from "path";
import fs from "fs";

// 1. Configuración de la conexión a PostgreSQL
const sql = postgres({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
});

// --- LÓGICA EN MEMORIA (Marcas y Categorías) ---
interface RedCorporativa {
  id: string;
  u: number;
  m: number;
  s: number;
  n: string;
  r: string;
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

const CATEGORIAS_KEYWORDS: Record<string, string[]> = {
  C01: ["abarrotes", "miscelanea", "tiendita", "viveres", "tienda"],
  C02: ["minisuper", "conveniencia", "oxxo", "seven", "supercito"],
  C03: ["supermercado", "mayorista", "bodega", "walmart", "soriana", "chedraui", "costco", "sams"],
  C04: ["taqueria", "tacos", "antojitos", "quesadillas", "tortas", "tamales", "gorditas", "birria"],
  C05: ["comida rapida", "hamburguesas", "pizzas", "pizza", "hot dogs", "sushi", "alitas"],
  C06: ["restaurante", "mariscos", "comedor", "cocina economica", "fondita", "buffet", "japones", "chino"],
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
  return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
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
  return Math.max(scoreDirecto, diceBiGrams(entradaColapsada, objColapsado));
}

function resolverMarca(query: string): { marca: RedCorporativa; score: number } | null {
  const qNorm = normalizar(query);
  const redes = getRedes();

  let mejor: { marca: RedCorporativa; score: number } | null = null;
  let maxPuntajeEfectivo = 0;

  for (const item of redes) {
    const nNorm = normalizar(item.n);
    let rawScore = (qNorm === nNorm) ? 1.0 : evaluarSimilitud(qNorm, nNorm);
    if (rawScore < 0.65) continue;

    const boostUnidades = Math.min(0.06, Math.log10(Math.max(item.u, 1)) * 0.015);
    const puntajeEfectivo = rawScore + boostUnidades;

    if (puntajeEfectivo > maxPuntajeEfectivo) {
      maxPuntajeEfectivo = puntajeEfectivo;
      mejor = { marca: item, score: rawScore };
    }
  }
  return mejor;
}

function resolverCategoria(texto: string): { catId: string; score: number } | null {
  const q = normalizar(texto);
  let mejor: { catId: string; score: number } | null = null;
  let maxScore = 0;

  for (const [catId, palabras] of Object.entries(CATEGORIAS_KEYWORDS)) {
    for (const palabra of palabras) {
      const score = evaluarSimilitud(q, palabra);
      if (score > 0.55 && score > maxScore) {
        maxScore = score;
        mejor = { catId, score };
      }
    }
  }
  return mejor;
}

// --- ENDPOINT PRINCIPAL ---
export async function GET(request: NextRequest) {
  try {
    // DIAGNÓSTICO: Registrar inicio
    console.log("=== INICIO DE BÚSQUEDA ===");
    console.log(`DB_NAME configurado: ${process.env.DB_NAME}`);
    console.log(`DB_HOST configurado: ${process.env.DB_HOST}`);
    const startTime = performance.now();

    const { searchParams } = new URL(request.url);
    const rawQ = (searchParams.get("q") || "").trim();
    const estado = (searchParams.get("estado") || "").trim();
    const municipio = (searchParams.get("municipio") || "").trim();
    const limit = 20;

    let marcaDetectada: RedCorporativa | null = null;
    let categoriaDetectada: string | null = null;
    let terminoFiltroNombre = "";

    if (rawQ) {
      const matchMarca = resolverMarca(rawQ);
      if (matchMarca && matchMarca.score >= 0.7) {
        marcaDetectada = matchMarca.marca;
        terminoFiltroNombre = matchMarca.marca.n;
      } else {
        const matchCat = resolverCategoria(rawQ);
        if (matchCat) {
          categoriaDetectada = matchCat.catId;
        } else {
          // Búsqueda compuesta (ej. "restaurante japones")
          const palabras = rawQ.split(/\s+/);
          let mejorCatMatch: { catId: string, token: string, score: number } | null = null;

          for (const token of palabras) {
            if (token.length >= 4) {
              const testCat = resolverCategoria(token);
              if (testCat && testCat.score >= 0.6) {
                if (!mejorCatMatch || testCat.score > mejorCatMatch.score) {
                  mejorCatMatch = { catId: testCat.catId, token, score: testCat.score };
                }
              }
            }
          }

          if (mejorCatMatch) {
            categoriaDetectada = mejorCatMatch.catId;
            terminoFiltroNombre = palabras
              .filter((p) => p.toLowerCase() !== mejorCatMatch!.token.toLowerCase())
              .join(" ")
              .trim();
          } else {
            terminoFiltroNombre = rawQ;
          }
        }
      }
    }

    // --- CONSTRUCCIÓN DE CONSULTA DINÁMICA PARA POSTGRESQL ---
    const whereConditions: string[] = [];
    const args: (string | number)[] = [];
    let paramIndex = 1; // Contador dinámico para $1, $2, $3...

    if (categoriaDetectada) {
      whereConditions.push(`dp.categoria_id = $${paramIndex++}`);
      args.push(categoriaDetectada);
    }

    if (terminoFiltroNombre.length >= 2) {
      if (categoriaDetectada || estado) {
        whereConditions.push(`dp.nombre ILIKE $${paramIndex++}`);
        args.push(`%${terminoFiltroNombre}%`);
      } else {
        whereConditions.push(`dp.nombre ILIKE $${paramIndex++}`);
        args.push(`${terminoFiltroNombre}%`);
      }
    }

    if (estado) {
      whereConditions.push(`dp.estado ILIKE $${paramIndex++}`);
      args.push(estado);
    }

    if (municipio) {
      whereConditions.push(`dp.municipio ILIKE $${paramIndex++}`);
      args.push(municipio);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    const sqlQuery = `
      SELECT 
        dp.id, dp.nombre, dp.tipo_vial, dp.calle, dp.num_ext, 
        dp.colonia, dp.cp, dp.municipio, dp.estado, dp.lat, dp.lon, 
        dp.telefono, dp.email, dp.web, dc.nombre AS categoria
      FROM directorio_prod dp
      LEFT JOIN directorio_categorias dc ON dp.categoria_id = dc.id
      ${whereClause}
      LIMIT $${paramIndex};
    `;
    args.push(limit); // El límite siempre es el último parámetro

    // Ejecutamos en Postgres
    const rows = await sql.unsafe(sqlQuery, args);

    const tipoResolucion = marcaDetectada
      ? "marca_corporativa"
      : categoriaDetectada && terminoFiltroNombre
      ? "categoria_y_nombre"
      : categoriaDetectada
      ? "categoria"
      : "nombre_directo";

    // DIAGNÓSTICO: Registrar fin
    const endTime = performance.now();
    console.log(`Tiempo total ejecución: ${(endTime - startTime).toFixed(2)} ms`);
    console.log(`Filas devueltas: ${rows.length}`);
    console.log("=== FIN DE BÚSQUEDA ===\n");

    return NextResponse.json({
      success: true,
      tipoResolucion,
      marca: marcaDetectada
        ? {
            idCorporativo: marcaDetectada.id,
            nombre: marcaDetectada.n,
            razonSocial: marcaDetectada.r,
            totalUnidades: marcaDetectada.u,
            totalSucursales: marcaDetectada.s,
            totalMatrices: marcaDetectada.m,
          }
        : null,
      categoriaId: categoriaDetectada,
      data: rows,
    });
  } catch (error: any) {
    console.error("Error en /api/search:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Error al procesar la búsqueda" },
      { status: 500 }
    );
  }
}