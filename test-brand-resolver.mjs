import fs from "fs";
import { createClient } from "@libsql/client";

// Leer variables de entorno desde .env.local (o ../.env.local)
let envPath = ".env.local";
if (!fs.existsSync(envPath) && fs.existsSync("../.env.local")) {
  envPath = "../.env.local";
}

const envFile = fs.readFileSync(envPath, "utf8");
const getEnv = (key) => {
  const match = envFile.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
};

const client = createClient({
  url: getEnv("TURSO_DATABASE_URL"),
  authToken: getEnv("TURSO_AUTH_TOKEN"),
});

// Cargar catálogo de cadenas corporativas en memoria
const redes = JSON.parse(fs.readFileSync("data/redes_corporativas.json", "utf8"));

function normalizar(txt) {
  return txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function diceBiGrams(a, b) {
  if (a === b) return 1.0;
  if (a.length < 2 || b.length < 2) return 0.0;
  const bgA = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const pair = a.slice(i, i + 2);
    bgA.set(pair, (bgA.get(pair) || 0) + 1);
  }
  let intersection = 0;
  for (let j = 0; j < b.length - 1; j++) {
    const pair = b.slice(j, j + 2);
    const count = bgA.get(pair) || 0;
    if (count > 0) {
      intersection++;
      bgA.set(pair, count - 1);
    }
  }
  return (2.0 * intersection) / (a.length - 1 + (b.length - 1));
}

function buscarMarca(query) {
  const qNorm = normalizar(query);
  let mejor = null;
  let maxScore = 0;

  for (const item of redes) {
    const nNorm = normalizar(item.n);
    if (qNorm === nNorm || (nNorm.length > 5 && qNorm.includes(nNorm))) {
      return { marca: item, score: 1.0 };
    }

    const score = diceBiGrams(qNorm, nNorm);
    if (score > 0.65 && score > maxScore) {
      maxScore = score;
      mejor = { marca: item, score };
    }
  }
  return mejor;
}

async function test(termino, estado = "") {
  console.log(`\n================ Búsqueda: "${termino}" ${estado ? `en ${estado}` : ""} ================`);
  console.time("Tiempo de resolución y consulta");

  const match = buscarMarca(termino);
  let sql = "";
  let args = [];

  if (match) {
    console.log(`✓ Marca identificada: "${match.marca.n}" (Unidades: ${match.marca.u}, ID: ${match.marca.id}, Similitud: ${(match.score * 100).toFixed(1)}%)`);
    if (estado) {
      sql = "SELECT id, nombre, municipio, estado FROM directorio_prod WHERE nombre LIKE ? AND (estado LIKE ? OR slug_estado LIKE ?) LIMIT 5;";
      args = [`%${match.marca.n}%`, `%${estado}%`, `%${estado.toLowerCase()}%`];
    } else {
      sql = "SELECT id, nombre, municipio, estado FROM directorio_prod WHERE nombre LIKE ? LIMIT 5;";
      args = [`%${match.marca.n}%`];
    }
  } else {
    console.log("ℹ️ No es una marca corporativa registrada.");
    sql = "SELECT id, nombre, municipio, estado FROM directorio_prod WHERE nombre LIKE ? LIMIT 5;";
    args = [`%${termino}%`];
  }

  const res = await client.execute({ sql, args });
  console.timeEnd("Tiempo de resolución y consulta");
  console.log(`Sucursales devueltas: ${res.rows.length}`);
  console.table(res.rows);
}

async function run() {
  await test("ferreteria calzada");
  await test("farmacias guadaljara", "Jalisco");
  await test("starbucks");
}

run().catch(console.error);
