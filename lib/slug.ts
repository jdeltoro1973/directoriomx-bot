// FASE 3.1-SLUG (2026-11-15) — Slug canónico de la URL de detalle.
//
// La URL de detalle es /negocio/[slug-canonico]-[clee], donde el slug
// canónico se construye con el nombre del negocio + municipio + estado:
//   /negocio/fresh-salads-zapopan-jalisco-14120722515000333001000000U9
//
// Regla (única fuente; la usan la página de detalle, la ruta de búsqueda
// y el frente): la primera parte es el nombre del negocio, y si falta
// (NULL, undefined o vacío) se sustituye por "negocio"; municipio y
// estado, si faltan, se saltan. Las partes se unen con "-".
//
//   (fresh-salads, zapopan, jalisco) -> "fresh-salads-zapopan-jalisco"
//   (NULL, zapopan, jalisco)         -> "negocio-zapopan-jalisco"
//   (fresh-salads, NULL, jalisco)    -> "fresh-salads-jalisco"
//   (NULL, NULL, NULL)               -> "negocio"
//
// NO se agregan colonia ni localidad: la URL se haría larguísima, el
// aporte a Google es marginal y la colonia puede ser NULL (decidido
// con Juan 00:35 CST). La clee NO forma parte del slug: sigue siendo
// lo que va después del ÚLTIMO guion del segmento, y es lo que
// identifica al negocio (la búsqueda de la página de detalle es por
// clee; el slug solo es la parte legible para Google y para la gente).

export function construirSlugCanonico(partes: {
  slug_negocio?: string | null;
  slug_municipio?: string | null;
  slug_estado?: string | null;
} = {}): string {
  const limpiar = (p: string | null | undefined): string =>
    p == null ? "" : String(p).trim();
  const nombre = limpiar(partes.slug_negocio);
  const piezas = [
    nombre.length > 0 ? nombre : "negocio",
    limpiar(partes.slug_municipio),
    limpiar(partes.slug_estado),
  ].filter((p) => p.length > 0);
  return piezas.join("-");
}
