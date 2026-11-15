import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { sql } from "@/lib/db";
import { construirSlugCanonico } from "@/lib/slug";
import { ArrowLeft, Globe, Mail, MapPin, Navigation, Phone } from "lucide-react";

// FASE 3-DETALLE (2026-11-14) — Página de detalle de un negocio:
//   /negocio/[slug]-[clee]
//   ej. /negocio/oxxo-centro-14120000123456789
// FASE 3.1-SLUG (2026-11-15) — La URL ahora lleva municipio y estado:
//   /negocio/[slug]-[municipio]-[estado]-[clee]
//   ej. /negocio/fresh-salads-zapopan-jalisco-14120722515000333001000000U9
//   El slug canónico se construye en lib/slug.ts (construirSlugCanonico):
//   [slug_negocio, slug_municipio, slug_estado] con "-", saltando las
//   partes NULL o vacías; si no queda ninguna, "negocio". NO se agregan
//   colonia ni localidad (decidido con Juan 00:35 CST).
//
//  1. La URL lleva slug + clee porque el slug solo NO identifica un
//     negocio: hay miles de OXXO y de "SIN NOMBRE" con el mismo slug.
//     La clee (llave única del DENUE, decidida con Juan 23:35 CST) es
//     el desambiguador. Google lee solo las palabras del nombre; la
//     clee al final se ignora, igual que en Mercado Libre o Amazon.
//     La clee es además estable si un día se reimporta el DENUE, a
//     diferencia del id/gid interno.
//  2. La página es DINÁMICA (no generateStaticParams: son 6.1M de
//     negocios). Se busca por clee::text — el cast es a propósito: el
//     tipo de clee en la tabla no está confirmado (texto o numérico) y
//     con el cast funciona en ambos casos.
//     NOTA (2026-11-15): Next.js 16 con Cache Components activado
//     prohíbe `export const dynamic = "force-dynamic"` y además
//     intenta prerenderizar la página en el build; como la página
//     usa `params` y consulta Postgres directamente (sin caché),
//     el prerender falla ("encountered uncached or runtime data
//     during prerendering"). La salida oficial es `instant = false`
//     (guía de migración a Cache Components): marca el segmento
//     como "allowed to block" y el build lo deja renderizarse bajo
//     demanda (ƒ dinámica) en cada petición, sin intentar el
//     prerender. Sin esta línea, el build no pasa.

export const instant = false;
//  3. La página funciona aunque los slugs aún sean NULL (el SQL de
//     slugs puede seguir corriendo): el slug canónico siempre existe
//     (construirSlugCanonico cae a "negocio" + municipio + estado),
//     así que el redirect canónico aplica igual y la página se
//     renderiza con solo la clee si hace falta.
//  4. SEO: generateMetadata con título/descripción y URL canónica, y
//     JSON-LD LocalBusiness con solo los campos presentes (nada
//     inventado). Sin mapa embebido: el mapa es otro paso (Fase 2B).

interface NegocioDetalle {
  clee: string | number;
  nom_estab: string;
  raz_social: string | null;
  nombre_act: string | null;
  codigo_act: number | null;
  nom_vial: string | null;
  numero_ext: number | null;
  letra_ext: string | null;
  nomb_asent: string | null;
  cod_postal: number | null;
  entidad: string | null;
  municipio: string | null;
  localidad: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  latitud: number | null;
  longitud: number | null;
  slug_negocio: string | null;
  slug_estado: string | null;
  slug_municipio: string | null;
  slug_colonia: string | null;
}

// FASE 3-DETALLE — Utilidad pura (exportada para probarla sin base de datos):
// el segmento es "slug-clee"; la clee es lo que va después del ÚLTIMO
// guion, porque el slug mismo puede tener guiones ("tacos-don-felix-456").
// Sin guion, todo el segmento es la clee (la URL /negocio/123 también vale).
export function parsearSegmentoNegocio(segmento: string): { slug: string; clee: string } {
  const idx = segmento.lastIndexOf("-");
  if (idx === -1) return { slug: "", clee: segmento };
  return { slug: segmento.slice(0, idx), clee: segmento.slice(idx + 1) };
}

// Una sola fila por clee. Se usa cache() de React para que generateMetadata
// y la página no hagan la misma consulta dos veces en un mismo request.
const obtenerNegocio = cache(async (clee: string): Promise<NegocioDetalle | null> => {
  const rows = await sql.unsafe(
    `SELECT clee, nom_estab, raz_social, nombre_act, codigo_act,
            nom_vial, numero_ext, letra_ext, nomb_asent, cod_postal,
            entidad, municipio, localidad,
            COALESCE(telefono_limpio, telefono) AS telefono,
            COALESCE(correoelec_limpio, correoelec) AS email,
            COALESCE(www_limpia, www) AS web,
            latitud, longitud,
            slug_negocio, slug_estado, slug_municipio, slug_colonia
     FROM carto.denuenacional052026
     WHERE clee::text = $1
     LIMIT 1`,
    [clee]
  );
  if (!rows.length) return null;
  return rows[0] as unknown as NegocioDetalle;
});

function calleNumero(n: NegocioDetalle): string {
  return [n.nom_vial, n.numero_ext != null ? String(n.numero_ext) : null, n.letra_ext]
    .filter(Boolean)
    .join(" ");
}

function direccionTexto(n: NegocioDetalle): string {
  return [
    calleNumero(n),
    n.nomb_asent,
    n.municipio,
    n.entidad,
    n.cod_postal != null ? `C.P. ${n.cod_postal}` : null,
  ]
    .filter((p) => p != null && p.trim().length > 0)
    .join(", ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: segmento } = await params;
  const { clee } = parsearSegmentoNegocio(segmento);
  const negocio = await obtenerNegocio(clee);
  if (!negocio) {
    return { title: "Negocio no encontrado | directorio.cc" };
  }
  const slugReal = construirSlugCanonico(negocio);
  const cleeStr = String(negocio.clee);
  const donde = [negocio.municipio, negocio.entidad].filter(Boolean).join(", ");
  const title = donde
    ? `${negocio.nom_estab} en ${donde} | directorio.cc`
    : `${negocio.nom_estab} | directorio.cc`;
  const description = [
    negocio.nombre_act ? `${negocio.nom_estab} — ${negocio.nombre_act}` : negocio.nom_estab,
    direccionTexto(negocio),
    negocio.telefono ? `Tel. ${negocio.telefono}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  return {
    title,
    description,
    alternates: {
      canonical: `https://www.directorio.cc/negocio/${slugReal}-${cleeStr}`,
    },
  };
}

export default async function PaginaNegocio({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: segmento } = await params;
  const { slug, clee } = parsearSegmentoNegocio(segmento);
  const negocio = await obtenerNegocio(clee);
  if (!negocio) notFound();

  // URL canónica (FASE 3.1-SLUG): slug_negocio + municipio + estado.
  // Si el slug de la URL no es el canónico (URL vieja con solo el
  // nombre, o URL solo con la clee), permanentRedirect (308) a la
  // canónica. El canónico siempre existe — si falta el nombre es
  // "negocio" — así que el redirect aplica aunque slug_negocio sea
  // NULL; la página nunca se queda sin URL canónica. Las URLs viejas
  // /negocio/[slug]-[clee] siguen funcionando: la búsqueda es por
  // clee y el slug distinto dispara este redirect a la URL nueva.
  const slugCanonico = construirSlugCanonico(negocio);
  if (slug !== slugCanonico) {
    permanentRedirect(`/negocio/${slugCanonico}-${String(negocio.clee)}`);
  }

  const direccion = direccionTexto(negocio);
  const webUrl = negocio.web
    ? negocio.web.startsWith("http")
      ? negocio.web
      : `https://${negocio.web}`
    : null;
  const tieneCoords = negocio.latitud != null && negocio.longitud != null;
  const mapsUrl = tieneCoords
    ? `https://www.google.com/maps/search/?api=1&query=${negocio.latitud},${negocio.longitud}`
    : direccion
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`
      : null;

  // JSON-LD LocalBusiness: solo los campos presentes (Google ignora los
  // que faltan; no se inventa ningún dato).
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: negocio.nom_estab,
  };
  const calle = calleNumero(negocio);
  if (calle || negocio.municipio || negocio.entidad || negocio.cod_postal != null) {
    const address: Record<string, unknown> = { "@type": "PostalAddress" };
    if (calle) address.streetAddress = calle;
    if (negocio.municipio) address.addressLocality = negocio.municipio;
    if (negocio.entidad) address.addressRegion = negocio.entidad;
    if (negocio.cod_postal != null) address.postalCode = String(negocio.cod_postal);
    jsonLd.address = address;
  }
  if (negocio.telefono) jsonLd.telephone = negocio.telefono;
  if (webUrl) jsonLd.url = webUrl;
  if (tieneCoords) {
    jsonLd.geo = {
      "@type": "GeoCoordinates",
      latitude: negocio.latitud,
      longitude: negocio.longitud,
    };
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Barra superior, igual que el inicio. */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-gray-900">
              <span className="text-blue-600">directorio</span>
              <span className="text-yellow-500">.cc</span>
            </span>
          </Link>
          <Link href="/" className="text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors">
            Volver al buscador
          </Link>
        </div>
      </nav>

      <main className="flex-grow max-w-3xl mx-auto w-full px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a los resultados
        </Link>

        <article className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight">
            {negocio.nom_estab}
          </h1>

          {negocio.nombre_act && (
            <span className="inline-block mt-3 text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
              {negocio.nombre_act}
            </span>
          )}

          {negocio.raz_social && negocio.raz_social !== negocio.nom_estab && (
            <p className="text-sm text-gray-500 mt-3">
              Razón social: {negocio.raz_social}
            </p>
          )}

          {direccion && (
            <p className="text-base text-gray-700 mt-5 flex items-start gap-2">
              <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
              <span>{direccion}</span>
            </p>
          )}

          <div className="mt-6 pt-5 border-t border-gray-50 flex flex-col gap-3 text-sm text-gray-700">
            {negocio.telefono && (
              <a href={`tel:${negocio.telefono}`} className="flex items-center gap-2 hover:text-blue-600 font-medium w-fit">
                <Phone className="w-4 h-4 text-blue-600" /> {negocio.telefono}
              </a>
            )}
            {negocio.email && (
              <a href={`mailto:${negocio.email}`} className="flex items-center gap-2 hover:text-blue-600 font-medium w-fit break-all">
                <Mail className="w-4 h-4 text-blue-600" /> {negocio.email}
              </a>
            )}
            {webUrl && (
              <a
                href={webUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-blue-600 hover:underline font-medium w-fit break-all"
              >
                <Globe className="w-4 h-4" /> {negocio.web}
              </a>
            )}
          </div>

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all"
            >
              <Navigation className="w-4 h-4" /> Cómo llegar
            </a>
          )}
        </article>

        <p className="text-xs text-gray-400 mt-6 text-center">
          Datos del DENUE (INEGI), mayo 2026.
        </p>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </main>
    </div>
  );
}
