import postgres from 'postgres';

// Cliente ÚNICO de base de datos para toda la app (Fase 1).
// Antes había dos configuraciones distintas: lib/db.ts usaba DATABASE_URL
// y app/api/search/route.ts creaba su propio cliente con DB_HOST/DB_PORT/
// DB_NAME/DB_USER/DB_PASSWORD. Si se arreglaba una, la otra seguía rota.
//
// Prioridad:
//  1. DATABASE_URL, si está definida (ej. URL completa de conexión).
//  2. Variables sueltas DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD,
//     que son las que ya usa el .env de Django y las que apuntan a Mapoteca.
//  3. Si no hay ninguna, cadena vacía, como antes: el build de Vercel pasa
//     y la ruta /api/search devuelve un 500 con un mensaje claro en vez de
//     colgarse. NUNCA poner la contraseña aquí; va en variables de entorno.
const dbOptions = {
  ssl: false, // Mapoteca no tiene SSL configurado para la conexión directa interna
  max: 10, // Límite de conexiones simultáneas por instancia
  idle_timeout: 20, // Cierra conexiones inactivas
  max_lifetime: 60 * 30,
};

function crearCliente() {
  if (process.env.DATABASE_URL) {
    return postgres(process.env.DATABASE_URL, dbOptions);
  }
  if (process.env.DB_HOST) {
    // OJO: postgres() solo acepta las opciones en UN solo objeto. Si se le
    // pasa el objeto de conexión y aparte el de opciones, TypeScript lo
    // rechaza (error TS2345). Por eso aquí va todo junto con ...dbOptions.
    return postgres({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ...dbOptions,
    });
  }
  // Sin configuración: mismo comportamiento que antes (falla al consultar,
  // no al compilar). La ruta /api/search detecta este caso y responde 500
  // con un mensaje explicativo.
  return postgres('', dbOptions);
}

export const sql = crearCliente();

// Alias histórico: antes este módulo exportaba `db`. Se mantiene para no
// romper ningún import existente.
export const db = sql;
