"use client";

import { BrandBadge, MarcaCorporativa } from "@/components/BrandBadge";
import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { 
  Search, MapPin, Crosshair, Phone, Mail, 
  Wrench, Stethoscope, Coffee, Car, 
  GraduationCap, Building2, MonitorSmartphone, Scissors, Loader2, Store
} from "lucide-react";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

interface Negocio {
  id: string;
  nombre: string;
  categoria?: string;
  codigo_act?: number;
  tipo_vial?: string;
  calle?: string;
  num_ext?: string;
  colonia?: string;
  cp?: string;
  municipio?: string;
  estado?: string;
  telefono?: string;
  email?: string;
  web?: string;
  // Fase 2A: distancia en km a la ubicación del usuario (solo si compartió GPS).
  dist_km?: number | null;
  // Fase 3-DETALLE: llave única del DENUE y slug para enlazar la tarjeta
  // a /negocio/[slug]-[clee]. Si no hay clee, la tarjeta queda sin enlace.
  clee?: string;
  slugNegocio?: string | null;
  // Fase 3.1-SLUG: slug canónico (nombre + municipio + estado) para la
  // URL nueva /negocio/[slug]-[municipio]-[estado]-[clee].
  slugCanonico?: string;
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [estado, setEstado] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [isTelegram, setIsTelegram] = useState(false);

  // Estados del Buscador
  const [results, setResults] = useState<Negocio[]>([]);
  const [marcaResult, setMarcaResult] = useState<MarcaCorporativa | null>(null);
  const [tipoResolucion, setTipoResolucion] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  // Fase 1: antes un error del servidor (ej. la base no responde) se tragaba
  // en silencio y se mostraba como "0 resultados". Ahora se guarda y se muestra.
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);

  // Fase 2A: paginación y ubicación. La página actual y el total vienen de
  // la API; la ubicación es la del GPS del usuario, si la compartió.
  const [pagina, setPagina] = useState(1);
  const [totalResultados, setTotalResultados] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [limitePagina, setLimitePagina] = useState(20);
  const [ubicacion, setUbicacion] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsBuscando, setGpsBuscando] = useState(false);
  const resultadosRef = useRef<HTMLElement>(null);

  // Estados del Autocompletado
  const [suggestions, setSuggestions] = useState<{nombre: string, unidades: number}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      setIsTelegram(true);
    }
  }, []);

  // Clic fuera del buscador cierra las sugerencias
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounce para pedir sugerencias mientras teclea
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    const delayFn = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (data.success && data.data.length > 0) {
          setSuggestions(data.data);
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
        }
      } catch (e) {
        setSuggestions([]);
      }
    }, 250); // 250ms de espera

    return () => clearTimeout(delayFn);
  }, [searchQuery]);

  const ejecutarBusqueda = async (query: string, est: string, mun: string, pag: number = 1, loc: { lat: number; lon: number } | null = ubicacion) => {
    setLoading(true);
    setHasSearched(true);
    setShowSuggestions(false);
    setErrorBusqueda(null);

    try {
      const params = new URLSearchParams();
      if (query) params.append("q", query);
      if (est) params.append("estado", est);
      if (mun) params.append("municipio", mun);
      if (pag > 1) params.append("page", String(pag));
      if (loc) {
        params.append("lat", String(loc.lat));
        params.append("lon", String(loc.lon));
      }

      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();

      if (data.success && Array.isArray(data.data)) {
        setResults(data.data);
        setMarcaResult(data.marca || null);
        setTipoResolucion(data.tipoResolucion || "");
        // Fase 2A: la API devuelve la página y el total para la paginación.
        setPagina(data.page ?? pag);
        setTotalResultados(data.total ?? data.data.length);
        setTotalPaginas(data.totalPages ?? 1);
        setLimitePagina(data.limit ?? 20);
      } else {
        // Error real del servidor (base de datos, conexión, etc.): mostrarlo,
        // no fingir que simplemente no hubo resultados.
        setResults([]);
        setMarcaResult(null);
        setTipoResolucion("");
        setPagina(1);
        setTotalResultados(0);
        setTotalPaginas(1);
        setErrorBusqueda(
          data.error || "La búsqueda falló. Inténtalo de nuevo en un momento."
        );
      }
    } catch (err) {
      console.error("Error al buscar:", err);
      setResults([]);
      setMarcaResult(null);
      setTipoResolucion("");
      setPagina(1);
      setTotalResultados(0);
      setTotalPaginas(1);
      setErrorBusqueda("No se pudo conectar con el servidor de búsqueda. Revisa tu conexión e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // Fase 2A: el botón del GPS ahora sí hace algo. Pide la ubicación del
  // navegador (el usuario tiene que aceptarlo), guarda lat/lon y vuelve a
  // buscar desde la página 1 para que el servidor ordene por cercanía.
  // Si se pulsa de nuevo con el GPS activo, se quita la ubicación y se
  // vuelve a buscar sin cercanía.
  const handleGeolocation = () => {
    if (gpsActivo) {
      setUbicacion(null);
      setGpsActivo(false);
      setGpsError(null);
      ejecutarBusqueda(searchQuery, estado, municipio, 1, null);
      return;
    }
    if (!("geolocation" in navigator)) {
      setGpsError("Este navegador no tiene geolocalización.");
      return;
    }
    setGpsBuscando(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUbicacion(loc);
        setGpsActivo(true);
        setGpsBuscando(false);
        ejecutarBusqueda(searchQuery, estado, municipio, 1, loc);
      },
      (err) => {
        setGpsBuscando(false);
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "No diste permiso de ubicación. Actívalo en el navegador para ordenar por cercanía."
            : "No se pudo obtener tu ubicación. Inténtalo de nuevo."
        );
      },
      { timeout: 10000 }
    );
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutarBusqueda(searchQuery, estado, municipio);
  };

  const handleSelectSuggestion = (nombreMarca: string) => {
    setSearchQuery(nombreMarca);
    ejecutarBusqueda(nombreMarca, estado, municipio);
  };

  // Fase 1: cada categoría trae su `query`, la palabra que sí resuelve la
  // búsqueda en el servidor (antes el botón solo llenaba el cuadro de texto
  // y no buscaba nada). "Bienes Raíces" y "Tecnología" no tienen categoría
  // SCIAN directa, así que buscan por nombre; quedan pendientes de afinar.
  const categorias = [
    { nombre: "Ferreterías", query: "ferreteria", icono: <Wrench className="w-6 h-6 text-blue-600" /> },
    { nombre: "Salud y Médicos", query: "consultorio", icono: <Stethoscope className="w-6 h-6 text-blue-600" /> },
    { nombre: "Restaurantes", query: "restaurante", icono: <Coffee className="w-6 h-6 text-blue-600" /> },
    { nombre: "Talleres", query: "taller", icono: <Car className="w-6 h-6 text-blue-600" /> },
    { nombre: "Educación", query: "escuela", icono: <GraduationCap className="w-6 h-6 text-blue-600" /> },
    { nombre: "Bienes Raíces", query: "inmobiliaria", icono: <Building2 className="w-6 h-6 text-blue-600" /> },
    { nombre: "Tecnología", query: "computadoras", icono: <MonitorSmartphone className="w-6 h-6 text-blue-600" /> },
    { nombre: "Estéticas", query: "estetica", icono: <Scissors className="w-6 h-6 text-blue-600" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      
      {/* 1. NAVBAR */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image 
              src="/logo.png" 
              alt="Logo Directorio.cc" 
              width={40} 
              height={40} 
              className="rounded-full object-contain"
              priority
            />
            <span className="text-xl font-bold tracking-tight text-gray-900">
              <span className="text-blue-600">directorio</span>
              <span className="text-yellow-500">.cc</span>
            </span>
          </div>
          <div className="hidden md:flex space-x-8 text-sm font-medium text-gray-600">
            <a href="#categorias" className="hover:text-blue-600 transition-colors">Categorías</a>
            <a href="#buscador" className="hover:text-blue-600 transition-colors">Estados</a>
            <a href="mailto:ventas@directorio.cc" className="hover:text-blue-600 transition-colors">Contacto</a>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION & BUSCADOR */}
      <main className="flex-grow">
        <section className="bg-slate-900 pt-20 pb-32 px-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/20 blur-[100px] rounded-full pointer-events-none"></div>
          
          <div className="relative z-10 max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
              Encuentra cualquier negocio en México
            </h1>
            <p className="text-lg text-slate-300 mb-10">
              Explora más de 6 millones de empresas, servicios y proveedores locales actualizados al instante.
            </p>
          </div>
        </section>

        {/* Tarjeta de Búsqueda Flotante */}
        <section id="buscador" className="px-4 -mt-20 relative z-30 max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-6 w-full">
            <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3 relative">
              
              {/* Contenedor del Input principal y el Autocompletado */}
              <div ref={searchWrapperRef} className="flex-1 relative">
                <div className="flex items-center px-4 py-3 h-full bg-gray-50 border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                  <Search className="text-gray-400 w-5 h-5 mr-3 flex-shrink-0" />
                  <input 
                    type="text" 
                    placeholder="¿Qué estás buscando? (Ej. Ferretería)" 
                    className="w-full bg-transparent focus:outline-none text-gray-800 placeholder-gray-500"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                  />
                </div>
                
                {/* Desplegable de Sugerencias */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                    <ul className="py-2">
                      {suggestions.map((sug, idx) => (
                        <li 
                          key={idx}
                          onClick={() => handleSelectSuggestion(sug.nombre)}
                          className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between group transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Store className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                            <span className="text-sm font-medium text-gray-800 group-hover:text-blue-700">{sug.nombre}</span>
                          </div>
                          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full group-hover:bg-blue-100 group-hover:text-blue-600">
                            {sug.unidades} sucursales
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Campo: Ubicación */}
              <div className="flex-1 flex items-center px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl relative focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                <MapPin className="text-gray-400 w-5 h-5 mr-3 flex-shrink-0" />
                <div className="flex w-full gap-2 pr-8">
                  <select 
                    className="w-1/2 bg-transparent focus:outline-none text-gray-800 appearance-none cursor-pointer truncate"
                    value={estado}
                    onChange={(e) => setEstado(e.target.value)}
                  >
                    <option value="">Estado</option>
                    <option value="Jalisco">Jalisco</option>
                    <option value="Ciudad de México">CDMX</option>
                    <option value="Nuevo León">Nuevo León</option>
                  </select>
                  <div className="w-px bg-gray-300 my-1"></div>
                  <select 
                    className="w-1/2 bg-transparent focus:outline-none text-gray-800 appearance-none cursor-pointer truncate"
                    value={municipio}
                    onChange={(e) => setMunicipio(e.target.value)}
                  >
                    <option value="">Municipio</option>
                    <option value="Zapopan">Zapopan</option>
                    <option value="Guadalajara">Guadalajara</option>
                    <option value="Monterrey">Monterrey</option>
                  </select>
                </div>
                
                <button 
                  type="button"
                  onClick={handleGeolocation}
                  disabled={gpsBuscando}
                  className={`absolute right-3 p-1.5 rounded-lg transition-colors group ${gpsActivo ? "bg-blue-600 text-white hover:bg-blue-700" : "text-yellow-500 hover:bg-yellow-50"}`}
                  title={gpsActivo ? "Ubicación activa: ordenando por cercanía (pulsa para quitarla)" : "Usar mi ubicación actual"}
                >
                  <Crosshair className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
              </div>

              {/* Botón Buscar */}
              <button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all flex justify-center items-center gap-2 md:w-auto w-full cursor-pointer h-full"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Buscar"}
              </button>
            </form>
            {/* Fase 2A: aviso del GPS (error o ubicación activa). */}
            {gpsError && (
              <p className="text-sm text-red-600 mt-3">{gpsError}</p>
            )}
            {gpsActivo && !gpsError && (
              <p className="text-sm text-blue-600 mt-3">Ubicación activa: los resultados se ordenan por cercanía a ti. Pulsa el GPS otra vez para quitarla.</p>
            )}
          </div>
        </section>

        {/* 3. SECCIÓN DE RESULTADOS */}
        {hasSearched && (
          <section ref={resultadosRef} className="py-12 px-4 max-w-5xl mx-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Resultados de búsqueda ({totalResultados})
            </h2>
            {totalResultados > 0 && (
              <p className="text-sm text-gray-500 mb-6">
                Mostrando {(pagina - 1) * limitePagina + 1}–{Math.min(pagina * limitePagina, totalResultados)} de {totalResultados}
                {gpsActivo ? " · ordenados por cercanía a ti" : ""}
              </p>
            )}

            {loading ? (
              <div className="flex justify-center items-center py-16 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : errorBusqueda ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-red-200 p-8">
                <p className="text-red-600 text-lg font-medium">La búsqueda no se pudo completar.</p>
                <p className="text-sm text-gray-500 mt-2 break-words">{errorBusqueda}</p>
                <p className="text-sm text-gray-400 mt-1">Si el problema persiste, revisa la conexión a la base de datos en Vercel.</p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 p-8">
                <p className="text-gray-500 text-lg">No se encontraron negocios con esos criterios.</p>
                <p className="text-sm text-gray-400 mt-1">Prueba con otra palabra clave o quita los filtros de ubicación.</p>
              </div>
            ) : (
              <>
                {tipoResolucion === "marca_corporativa" && marcaResult && (
                  <BrandBadge marca={marcaResult} />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {results.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      {/* Fase 3.1-SLUG: el título enlaza a la página del negocio
                          con el slug canónico (nombre + municipio + estado). */}
                      {item.clee ? (
                        <h3 className="font-semibold text-lg text-gray-900 leading-snug">
                          <Link
                            href={`/negocio/${item.slugCanonico || item.slugNegocio || "negocio"}-${item.clee}`}
                            className="hover:text-blue-600 hover:underline"
                          >
                            {item.nombre}
                          </Link>
                        </h3>
                      ) : (
                        <h3 className="font-semibold text-lg text-gray-900 leading-snug">{item.nombre}</h3>
                      )}
                      {item.categoria && (
                        <span className="inline-block mt-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {item.categoria}
                        </span>
                      )}
                      <p className="text-sm text-gray-500 mt-3 flex items-start gap-1.5">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>
                          {[item.tipo_vial, item.calle, item.num_ext, item.colonia, item.municipio, item.estado]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                      </p>
                      {/* Fase 2A: distancia al usuario, solo con GPS activo. */}
                      {gpsActivo && item.dist_km != null && (
                        <p className="text-xs text-blue-600 mt-1 font-medium">
                          a {item.dist_km < 1 ? `${Math.round(item.dist_km * 1000)} m` : `${item.dist_km.toFixed(1)} km`} de ti
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-50 flex flex-wrap items-center gap-4 text-xs text-gray-600">
                      {item.telefono && (
                        <a href={`tel:${item.telefono}`} className="flex items-center gap-1 hover:text-blue-600 font-medium">
                          <Phone className="w-3.5 h-3.5 text-blue-600" /> {item.telefono}
                        </a>
                      )}
                      {item.email && (
                        <a href={`mailto:${item.email}`} className="flex items-center gap-1 hover:text-blue-600 font-medium">
                          <Mail className="w-3.5 h-3.5 text-blue-600" /> {item.email}
                        </a>
                      )}
                      {item.web && (
                        <a 
                          href={item.web.startsWith("http") ? item.web : `https://${item.web}`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 hover:underline font-medium"
                        >
                          Sitio web
                        </a>
                      )}
                    </div>
                  </div>
                  ))}
                </div>

                {/* Fase 2A: paginación (20 por página). */}
                {totalPaginas > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      disabled={pagina <= 1 || loading}
                      onClick={() => {
                        ejecutarBusqueda(searchQuery, estado, municipio, pagina - 1);
                        resultadosRef.current?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Anterior
                    </button>
                    <span className="text-sm text-gray-500">
                      Página {pagina} de {totalPaginas}
                    </span>
                    <button
                      type="button"
                      disabled={pagina >= totalPaginas || loading}
                      onClick={() => {
                        ejecutarBusqueda(searchQuery, estado, municipio, pagina + 1);
                        resultadosRef.current?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Siguiente →
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* 4. CATEGORÍAS RÁPIDAS */}
        <section id="categorias" className="py-20 px-4 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Explora las categorías más buscadas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categorias.map((cat, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSearchQuery(cat.query);
                  ejecutarBusqueda(cat.query, estado, municipio);
                  window.scrollTo({ top: 200, behavior: "smooth" });
                }}
                className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all group cursor-pointer"
              >
                <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                  {cat.icono}
                </div>
                <span className="text-sm font-medium text-gray-700">{cat.nombre}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* 5. FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500 flex flex-col md:flex-row items-center gap-2">
            <span>© 2026 directorio.cc. Todos los derechos reservados.</span>
            {isTelegram && (
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                Telegram Mini App
              </span>
            )}
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#" className="hover:text-blue-600 transition-colors">Aviso de Privacidad</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Términos de Uso</a>
            <a href="mailto:ventas@directorio.cc" className="hover:text-blue-600 transition-colors">ventas@directorio.cc</a>
          </div>
        </div>
      </footer>
      
    </div>
  );
}