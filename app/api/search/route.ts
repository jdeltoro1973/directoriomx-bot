import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import path from "path";
import fs from "fs";

// FASE 1 (2026-11-14) — Reescritura de la búsqueda para la tabla real:
//   carto.denuenacional052026  (base "carto", servidor Mapoteca, 6,138,074 filas)
//
// Cambios respecto a la versión anterior:
//  1. Ya NO se consulta directorio_prod / directorio_categorias (esas tablas
//     viven solo en Nabucodonosor y Juan decidió NO usarlas). Se lee directo
//     de la tabla DENUE con el mapeo de columnas de abajo.
//  2. Ya NO se crea un cliente Postgres propio en este archivo: se usa el
//     cliente ÚNICO de lib/db.ts (antes había dos configuraciones distintas
//     y arreglar una no arreglaba la otra).
//  3. categoria_id y categoria_coloquial están en NULL en las 6,138,074 filas
//     y categorias_codigos también está vacío (verificado 2026-11-14), así
//     que el filtro de categoría ya NO usa categoria_id: usa codigo_act
//     (SCIAN, 6 dígitos) mediante la tabla CATEGORIA_CODIGOS_ACT de abajo.
//  4. Si faltan las variables de conexión, la ruta responde 500 con un
//     mensaje claro en vez de colgarse hasta el timeout.

// FASE 1.1 (2026-11-14) — Afinar marca vs. categoría ("zapatos" -> ZAPATA):
//  1. Nuevo orden de resolución: palabra genérica con SCIAN propio
//     (paso 0) > marca exacta (1.0) > categoría exacta (1.0) > marca
//     casi exacta (>= 0.85) > categoría difusa (> 0.55).
//     Antes la marca se revisaba primero con umbral 0.7 y "zapatos" daba
//     Dice 0.727 contra "ZAPATA", así que nunca se miraba la categoría.
//     El 0.85, y no 0.8, es a propósito: "zapato" vs "zapata" da 0.8
//     exacto y debe ser categoría, no marca.
//  2. Mapeo fino PALABRAS_CODIGOS_ACT: "zapatos"/"calzado"/"zapateria"
//     apuntan directo al SCIAN 463310 (calzado al por menor, 45,379 filas
//     verificadas en Mapoteca), no a toda la C14 (que también trae ropa
//     463211 y muebles 466111). Lo mismo para "ropa" -> 463211 y
//     "muebles"/"muebleria" -> 466111.

// FASE 1.2 (2026-11-14) — Familia cemento (opción B, elegida por Juan):
//  No existe clase SCIAN de venta de cemento al público: el que vende
//  cemento al menudeo es la ferretería (467111, 75,726 filas) y el
//  mayoreo de cemento/tabique/grava es el 434211 (20,015 filas),
//  verificados en Mapoteca el 2026-11-14. Por eso la familia cemento,
//  tabique, varilla, grava, arena, concreto y la frase "materiales para
//  construccion" apuntan a C17 con AMBOS prefijos: ferreterías +
//  almacenes de mayoreo. Solo estas palabras llevan el 434211;
//  "ferreteria" en general sigue siendo solo 467111 (ver C17).
//  La frase "materiales para construccion" va en el mapeo fino porque
//  como palabra de categoría llegaba tarde: la marca MATERIALES PARA
//  CONSTRUCCION ORTIZ (4 unidades) la ganaba con Dice 0.9.

// FASE 2A (2026-11-14) — Paginación + orden por relevancia (acordado con Juan):
//  1. Paginación: ?page= (20 por página), OFFSET, y la API devuelve total,
//     totalPages, page y limit para el "mostrando 1-20 de N" del frente.
//     Antes solo salían las primeras 20 filas y el resto era invisible.
//  2. Orden por relevancia, en este orden: nombre exacto / que empieza con
//     el término primero; luego cercanía si el usuario compartió ubicación
//     (?lat&lon, distancia equirectangular en km, sin PostGIS); luego los
//     que tienen teléfono y correo; al final id, para que las páginas sean
//     estables (sin ORDER BY, LIMIT/OFFSET puede repetir o brincar filas).
//  3. La deduplicación de filas DENUE (punto 2 de la hoja de decisión) NO
//     entra aquí: Juan aún no eligió la opción. Tampoco el mapa (Fase 2B):
//     los puntos irán desde GeoServer, pendiente la URL y la capa.

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
  C17: ["ferreteria", "tlapaleria", "tornillos", "herramientas", "plomeria", "material electrico", "pinturas", "materiales", "cemento", "tabique", "varilla", "grava", "arena", "concreto", "materiales para construccion"],
  C18: ["farmacia", "botica", "drogueria", "medicamentos"],
  C19: ["bar", "bares", "cantina", "cerveceria", "antro", "pub"],
  C20: ["gimnasio", "gym", "fitness", "deportes", "crossfit", "pesas"],
  C21: ["cadenas comerciales", "franquicias"],
  C22: ["hospital", "clinica", "sanatorio", "urgencias"],
  C23: ["guarderia", "asilo", "asistencia social"],
};

// Mapeo categoría (C01–C23) -> prefijos de codigo_act (SCIAN, 6 dígitos).
// La consulta convierte cada prefijo en un rango numérico: "7225" equivale
// a codigo_act BETWEEN 722500 AND 722599, y "722514" a 722514 AND 722514.
// Así el filtro usa el índice btree normal sobre codigo_act (entero); un
// LIKE sobre codigo_act::text no lo usaría y haría escaneo completo.
// Es una tabla v1, editable en un solo lugar. Base: los 15 codigo_act más
// frecuentes verificados en carto.denuenacional052026 el 2026-11-14
// (461110 abarrotes 682,918; 812110 belleza 296,918; 463211 ropa 179,669;
// 722513 antojitos 168,295; 722514 tacos y tortas 147,589; 465311 papelería
// 131,637; 311830 tortillas 112,072; 461130 frutas y verduras 102,458;
// 811111 reparación mecánica 98,052; 722515 cafeterías 94,062;
// 722517 pizzas/hamburguesas 79,622; 461121 carnes rojas 76,695;
// 621211 consultorios dentales 76,032; 467111 ferreterías 75,726)
// más la estructura jerárquica del SCIAN (2 dígitos sector, 3 subsector,
// 4 rama, 5 subrama, 6 clase). Un prefijo corto abarca toda la familia,
// ej. "7225" = todos los restaurantes con servicio de preparación.
// C21 queda vacío a propósito: "cadenas/franquicias" no es una actividad
// SCIAN, así que esa categoría no filtra por código y solo busca por nombre.
const CATEGORIA_CODIGOS_ACT: Record<string, string[]> = {
  C01: ["461110"], // abarrotes, ultramarinos y misceláneas
  C02: ["462112"], // minisupers
  C03: ["462111", "462210", "431110"], // supermercados, departamentales, mayoreo de abarrotes
  C04: ["722513", "722514"], // antojitos; tacos y tortas
  C05: ["722517", "722519"], // pizzas/hamburguesas/hot dogs para llevar; otros para llevar
  C06: ["7225"], // TODOS los restaurantes con servicio de preparación de alimentos
  C07: ["722515"], // cafeterías, fuentes de sodas, neverías, refresquerías
  C08: ["3118"], // panaderías, tortillerías y molinos (rama 3118)
  C09: ["461121", "461122", "461123", "461130"], // carnes, aves, pescados/mariscos, frutas y verduras
  C10: ["8111"], // reparación y mantenimiento de automóviles y camiones
  C11: ["468211", "468212", "811192"], // refacciones nuevas/usadas; lavado y lubricado
  C12: ["812110"], // salones y clínicas de belleza y peluquerías
  C13: ["621"], // consultorios y servicios médicos de consulta externa (incl. dentales 621211)
  C14: ["463211", "463310", "466111"], // ropa; calzado; muebles para el hogar
  C15: ["611"], // servicios educativos
  C16: ["4653"], // papelería, libros, regalos y novedades
  C17: ["467111"], // ferreterías y tlapalerías
  C18: ["464111", "464112"], // farmacias sin/con minisúper
  C19: ["72241"], // bares, cantinas y centros nocturnos
  C20: ["713940"], // centros de acondicionamiento físico (gimnasios)
  C21: [], // sin mapeo SCIAN (ver comentario arriba)
  C22: ["622"], // hospitales
  C23: ["623", "6244"], // residencias de asistencia social; guarderías
};

// MAPEO FINO (FASE 1.1, 2026-11-14): palabra genérica -> categoría C y
// prefijos SCIAN propios, en vez de toda la categoría.
// Verificado en carto.denuenacional052026 el 2026-11-14:
//   463310 "Comercio al por menor de calzado" = 45,379 negocios
//   463211 ropa; 466111 muebles para el hogar.
// La clave se compara con la búsqueda normalizada (sin acentos), así que
// "zapatería" se escribe aquí "zapateria".
const PALABRAS_CODIGOS_ACT: Record<string, { cat: string; prefijos: string[] }> = {
  zapatos: { cat: "C14", prefijos: ["463310"] },
  zapato: { cat: "C14", prefijos: ["463310"] },
  calzado: { cat: "C14", prefijos: ["463310"] },
  zapateria: { cat: "C14", prefijos: ["463310"] },
  zapatillas: { cat: "C14", prefijos: ["463310"] },
  ropa: { cat: "C14", prefijos: ["463211"] },
  muebles: { cat: "C14", prefijos: ["466111"] },
  muebleria: { cat: "C14", prefijos: ["466111"] },
  // FASE 1.2 — Familia cemento (opción B): ferreterías (467111) + mayoreo
  // de cemento/tabique/grava (434211). Solo estas palabras llevan el
  // mayoreo; "ferreteria" sigue siendo solo 467111.
  cemento: { cat: "C17", prefijos: ["467111", "434211"] },
  tabique: { cat: "C17", prefijos: ["467111", "434211"] },
  varilla: { cat: "C17", prefijos: ["467111", "434211"] },
  grava: { cat: "C17", prefijos: ["467111", "434211"] },
  arena: { cat: "C17", prefijos: ["467111", "434211"] },
  concreto: { cat: "C17", prefijos: ["467111", "434211"] },
  "materiales para construccion": { cat: "C17", prefijos: ["467111", "434211"] },
};

function normalizar(txt: string): string {
  return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// FASE 2A — Utilidades puras (exportadas para probarlas sin base de datos):
// parsearPagina: "?page=" es 1 si falta, no es número o es menor que 1.
// validarUbicacion: lat/lon solo valen si son números dentro de rango;
// cualquier otra cosa (vacío, texto, 200°) se ignora y se ordena sin cercanía.
export function parsearPagina(valor: string | null): number {
  const n = parseInt(valor ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function validarUbicacion(
  latStr: string | null,
  lonStr: string | null
): { lat: number; lon: number } | null {
  if (latStr == null || lonStr == null) return null;
  if (latStr.trim() === "" || lonStr.trim() === "") return null;
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
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

    // Sin configuración de base de datos no tiene sentido intentar conectar:
    // antes la petición se colgaba hasta el ETIMEDOUT y el frente lo mostraba
    // como "0 resultados". Ahora responde 500 con un mensaje claro.
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Base de datos no configurada en Vercel: faltan DATABASE_URL o DB_HOST/DB_NAME/DB_USER/DB_PASSWORD en las variables de entorno del proyecto.",
        },
        { status: 500 }
      );
    }

    const startTime = performance.now();

    const { searchParams } = new URL(request.url);
    const rawQ = (searchParams.get("q") || "").trim();
    const estado = (searchParams.get("estado") || "").trim();
    const municipio = (searchParams.get("municipio") || "").trim();
    // FASE 2A: paginación y ubicación. ?page= es 1 si falta o es inválida;
    // lat/lon solo valen si son números dentro de rango (ver validarUbicacion).
    const page = parsearPagina(searchParams.get("page"));
    const limit = 20;
    const offset = (page - 1) * limit;
    const ubicacion = validarUbicacion(searchParams.get("lat"), searchParams.get("lon"));

    let marcaDetectada: RedCorporativa | null = null;
    let categoriaDetectada: string | null = null;
    let terminoFiltroNombre = "";
    let mapeoFino: { cat: string; prefijos: string[] } | undefined;

    if (rawQ) {
      // FASE 1.1 — Paso 0: palabra genérica con SCIAN propio. La lista
      // PALABRAS_CODIGOS_ACT son palabras que Juan decidió que son
      // categoría, no marca, aunque exista una cadena con ese nombre:
      // "zapateria" tiene una marca ZAPATERIA de 24 unidades, pero la
      // palabra significa "tienda de zapatos" y debe traer las 45,379
      // zapaterías, no solo esa cadena. Por eso se revisa antes que la
      // marca exacta. ("oxxo" no está en esa lista: es solo marca.)
      const mapeoFino0 = PALABRAS_CODIGOS_ACT[normalizar(rawQ)];
      if (mapeoFino0) {
        mapeoFino = mapeoFino0;
        categoriaDetectada = mapeoFino0.cat;
      } else {
      // FASE 1.1 — Orden de resolución (antes la marca se revisaba primero
      // y con umbral 0.7, así que "zapatos" caía en la marca ZAPATA con
      // Dice 0.727 sin mirar nunca la categoría). Orden nuevo:
      //   1. Marca EXACTA (score 1.0): "oxxo", "tacos don pastor", "zapata".
      //      La marca exacta manda, también sobre una keyword de categoría
      //      ("oxxo" es keyword de C02 y marca a la vez).
      //   2. Categoría EXACTA (score 1.0): la búsqueda ES una palabra
      //      genérica ("zapatos", "tacos", "pan", "ferreteria").
      //   3. Marca casi exacta (score >= 0.85): cubre typos leves en
      //      nombres largos ("tacos don pasto" 0.966).
      //      El 0.85, y no 0.8, es a propósito: "zapato" vs "zapata"
      //      da 0.8 exacto y debe ser categoría, no marca.
      //   4. Categoría difusa (> 0.55): como antes.
      //   5. Búsqueda compuesta / por nombre: como antes.
      const matchMarca = resolverMarca(rawQ);
      const matchCat = resolverCategoria(rawQ);

      if (matchMarca && matchMarca.score >= 1.0) {
        marcaDetectada = matchMarca.marca;
        terminoFiltroNombre = matchMarca.marca.n;
      } else if (matchCat && matchCat.score >= 1.0) {
        categoriaDetectada = matchCat.catId;
      } else if (matchMarca && matchMarca.score >= 0.85) {
        marcaDetectada = matchMarca.marca;
        terminoFiltroNombre = matchMarca.marca.n;
      } else if (matchCat) {
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
      } // cierra el else del paso 0 (palabra genérica con SCIAN propio)
    }

    // Prefijos SCIAN de la categoría detectada (vacío = sin filtro por código).
    const prefijosCategoria: string[] = mapeoFino
      ? mapeoFino.prefijos
      : categoriaDetectada
      ? CATEGORIA_CODIGOS_ACT[categoriaDetectada] ?? []
      : [];

    if (categoriaDetectada && prefijosCategoria.length === 0) {
      // C21 ("cadenas comerciales / franquicias") no tiene mapeo SCIAN: si
      // dejáramos la categoría puesta sin filtro por código, la búsqueda
      // devolvería 20 filas arbitrarias de toda la tabla. Mejor buscar por
      // nombre como si no hubiera categoría.
      terminoFiltroNombre = rawQ;
      categoriaDetectada = null;
    }

    // --- CONSTRUCCIÓN DE CONSULTA DINÁMICA PARA POSTGRESQL ---
    // Tabla real: carto.denuenacional052026. Mapeo de columnas:
    //   nom_estab -> nombre | nom_vial -> calle | numero_ext -> num_ext
    //   nomb_asent -> colonia | cod_postal -> cp | entidad -> estado
    //   latitud -> lat | longitud -> lon
    //   telefono_limpio (o telefono) -> telefono
    //   correoelec_limpio (o correoelec) -> email
    //   www_limpia (o www) -> web
    //   nombre_act -> categoria (la actividad SCIAN, ya que categoria_coloquial
    //   está en NULL en toda la tabla)
    // Los slugs se devuelven ya para la página de detalle de la Fase 2.
    const whereConditions: string[] = [];
    const args: (string | number)[] = [];
    let paramIndex = 1; // Contador dinámico para $1, $2, $3...

    if (categoriaDetectada && prefijosCategoria.length > 0) {
      // Un prefijo SCIAN equivale a un rango numérico: "7225" -> 722500..722599,
      // "722514" -> 722514..722514. Con BETWEEN el filtro usa el índice btree
      // sobre codigo_act (entero); un LIKE sobre codigo_act::text no lo usaría.
      const rangeParts = prefijosCategoria.map((prefijo) => {
        const bajo = Number(prefijo.padEnd(6, "0"));
        const alto = Number(prefijo.padEnd(6, "9"));
        args.push(bajo, alto);
        const p1 = paramIndex++;
        const p2 = paramIndex++;
        return `(d.codigo_act BETWEEN $${p1} AND $${p2})`;
      });
      whereConditions.push(`(${rangeParts.join(" OR ")})`);
    }

    if (terminoFiltroNombre.length >= 2) {
      if (categoriaDetectada || estado) {
        whereConditions.push(`d.nom_estab ILIKE $${paramIndex++}`);
        args.push(`%${terminoFiltroNombre}%`);
      } else {
        whereConditions.push(`d.nom_estab ILIKE $${paramIndex++}`);
        args.push(`${terminoFiltroNombre}%`);
      }
    }

    if (estado) {
      whereConditions.push(`d.entidad ILIKE $${paramIndex++}`);
      args.push(estado);
    }

    if (municipio) {
      whereConditions.push(`d.municipio ILIKE $${paramIndex++}`);
      args.push(municipio);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";
    // Los parámetros del WHERE son los primeros de `args`; el COUNT de abajo
    // usa solo estos (los $n del orden/distancia no aparecen en esa consulta).
    const nParamsWhere = args.length;

    // --- FASE 2A: ORDEN POR RELEVANCIA (acordado con Juan 2026-11-14) ---
    // Orden, en este orden:
    //   1. Nombre: si la búsqueda trae término de nombre, el nombre exacto
    //      primero, luego los que empiezan con el término, luego el resto.
    //      En búsquedas solo por categoría no hay término y este nivel no
    //      discrimina (todos quedan igual).
    //   2. Cercanía: solo si el usuario compartió su ubicación (?lat&lon).
    //      Distancia equirectangular en km: 1° de latitud ≈ 111.32 km y 1°
    //      de longitud ≈ 111.32·cos(lat) km. No usa PostGIS a propósito: la
    //      tabla ya trae latitud/longitud y a escala municipal el error es
    //      de centésimas; si un día se quiere geodésica exacta, es una línea
    //      con ST_Distance. Los negocios sin lat/lon quedan al final.
    //   3. Contacto: primero los que tienen teléfono, luego los que tienen
    //      correo (si el directorio es para contactar, no solo para ver).
    //   4. id: orden estable, para que LIMIT/OFFSET no repita ni brinque
    //      negocios entre páginas (sin ORDER BY el orden no es garantizado).
    const orderParts: string[] = [];
    if (terminoFiltroNombre.length >= 2) {
      // Nombre exacto (ILIKE sin comodines = igualdad sin importar
      // mayúsculas) primero; luego los que empiezan con el término.
      args.push(terminoFiltroNombre, `${terminoFiltroNombre}%`);
      const pExacto = paramIndex++;
      const pEmpieza = paramIndex++;
      orderParts.push(
        `(CASE WHEN d.nom_estab ILIKE $${pExacto} THEN 0 WHEN d.nom_estab ILIKE $${pEmpieza} THEN 1 ELSE 2 END) ASC`
      );
    }

    // La distancia se calcula en el SELECT como dist_km (así el frente la
    // muestra: "a 1.2 km") y el ORDER BY usa ese alias.
    let selectDistancia: string;
    if (ubicacion) {
      args.push(ubicacion.lat, ubicacion.lon, ubicacion.lat);
      const pLat = paramIndex++;
      const pLon = paramIndex++;
      const pLatCos = paramIndex++;
      selectDistancia = `111.32 * SQRT(POWER(d.latitud - $${pLat}, 2) + POWER((d.longitud - $${pLon}) * COS(RADIANS($${pLatCos})), 2)) AS dist_km`;
      orderParts.push("dist_km ASC NULLS LAST");
    } else {
      selectDistancia = `NULL AS dist_km`;
    }

    orderParts.push("(COALESCE(d.telefono_limpio, d.telefono) IS NOT NULL) DESC");
    orderParts.push("(COALESCE(d.correoelec_limpio, d.correoelec) IS NOT NULL) DESC");
    orderParts.push("d.id ASC");
    const orderClause = `ORDER BY ${orderParts.join(", ")}`;

    // Total de resultados con el MISMO filtro (para "mostrando 1-20 de N"
    // y las páginas). El COUNT usa solo los parámetros del WHERE.
    const countRows = await sql.unsafe(
      `SELECT COUNT(*)::int AS total FROM carto.denuenacional052026 d ${whereClause}`,
      args.slice(0, nParamsWhere)
    );
    const total = (countRows[0] as { total?: number } | undefined)?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const sqlQuery = `
      SELECT
        d.id, d.nom_estab AS nombre, d.tipo_vial, d.nom_vial AS calle,
        d.numero_ext AS num_ext, d.nomb_asent AS colonia, d.cod_postal AS cp,
        d.municipio, d.entidad AS estado, d.latitud AS lat, d.longitud AS lon,
        COALESCE(d.telefono_limpio, d.telefono) AS telefono,
        COALESCE(d.correoelec_limpio, d.correoelec) AS email,
        COALESCE(d.www_limpia, d.www) AS web,
        d.nombre_act AS categoria, d.codigo_act,
        d.slug_negocio, d.slug_estado, d.slug_municipio, d.slug_colonia,
        ${selectDistancia}
      FROM carto.denuenacional052026 d
      ${whereClause}
      ${orderClause}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
    `;
    args.push(limit, offset);

    // Ejecutamos en Postgres (cliente único de lib/db.ts)
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
    console.log(`Categoría: ${categoriaDetectada ?? "ninguna"} | Prefijos SCIAN: ${prefijosCategoria.join(",") || "ninguno"}`);
    console.log(`Página: ${page} de ${totalPages} | Total: ${total} | Cercanía: ${ubicacion ? "sí" : "no"}`);
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
      codigoActPrefijos: prefijosCategoria,
      // FASE 2A: paginación y cercanía para el frente.
      page,
      total,
      totalPages,
      limit,
      cercaDeTi: !!ubicacion,
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
