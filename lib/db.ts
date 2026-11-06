import postgres from 'postgres';

// Si no hay variable de entorno, fallará durante el build,
// por lo que agregamos una cadena vacía por defecto para que Vercel pase la compilación estática si lo necesita.
const connectionString = process.env.DATABASE_URL || '';

export const db = postgres(connectionString, {
  ssl: false, // Mapoteca no tiene SSL configurado para la conexión directa interna
  max: 10,    // Límite de conexiones simultáneas por instancia
  idle_timeout: 20 // Cierra conexiones inactivas
});