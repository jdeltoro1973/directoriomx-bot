import fs from "fs";
import path from "path";
import readline from "readline";

// Buscar el archivo CSV en la carpeta actual o en la carpeta padre
let csvPath = "redes_corporativas.csv";
if (!fs.existsSync(csvPath) && fs.existsSync("../redes_corporativas.csv")) {
  csvPath = "../redes_corporativas.csv";
}

if (!fs.existsSync(csvPath)) {
  console.error(`❌ No se encontró redes_corporativas.csv en ${process.cwd()} ni en la carpeta superior.`);
  process.exit(1);
}

console.log(`Leyendo datos desde: ${path.resolve(csvPath)}`);

if (!fs.existsSync("data")) {
  fs.mkdirSync("data", { recursive: true });
}

const JSON_FILE = "data/redes_corporativas.json";

function parseCSVLine(line) {
  const values = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && (i === 0 || line[i - 1] !== "\\")) {
      insideQuote = !insideQuote;
    } else if (char === "," && !insideQuote) {
      values.push(current.trim().replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^["']|["']$/g, ""));
  return values;
}

async function run() {
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  const records = [];
  let isHeader = true;
  let idxId = 0, idxU = 1, idxM = 2, idxS = 3, idxN = 4, idxR = 5;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (isHeader) {
      isHeader = false;
      const headers = parseCSVLine(line).map(h => h.toLowerCase());
      idxId = headers.indexOf("id_corporativo");
      idxU = headers.indexOf("total_unidades");
      idxM = headers.indexOf("total_matrices");
      idxS = headers.indexOf("total_sucursales");
      idxN = headers.indexOf("nombre_comun");
      idxR = headers.indexOf("razon_social_comun");
      continue;
    }

    const cols = parseCSVLine(line);
    const idCorp = cols[idxId] || "";
    const totalU = parseInt(cols[idxU], 10) || 0;
    const totalM = parseInt(cols[idxM], 10) || 0;
    const totalS = parseInt(cols[idxS], 10) || 0;
    const nombre = cols[idxN] || "";
    const razon = cols[idxR] || "";

    // Conservar todas las cadenas de 2 unidades o más
    if (totalU >= 2 && nombre.trim().length >= 3) {
      records.push({
        id: idCorp,
        u: totalU,                    // total_unidades
        m: totalM,                    // total_matrices
        s: totalS,                    // total_sucursales
        n: nombre.trim(),             // nombre_comun
        r: razon ? razon.trim() : ""  // razon_social_comun
      });
    }
  }

  // Ordenadas de mayor a menor presencia
  records.sort((a, b) => b.u - a.u);

  fs.writeFileSync(JSON_FILE, JSON.stringify(records));
  const stats = fs.statSync(JSON_FILE);

  console.log(`\n✓ Archivo JSON generado con éxito: ${JSON_FILE}`);
  console.log(`✓ Cadenas comerciales guardadas:   ${records.length}`);
  console.log(`✓ Peso total del archivo:          ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
}

run().catch(console.error);
