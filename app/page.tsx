"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { 
  Search, MapPin, Crosshair, 
  Wrench, Stethoscope, Coffee, Car, 
  GraduationCap, Building2, MonitorSmartphone, Scissors
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

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [estado, setEstado] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      setIsTelegram(true);
    }
  }, []);

  const handleGeolocation = () => {
    alert("Pronto conectaremos el GPS mágico aquí 📍");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Buscando: ${searchQuery} en ${municipio}, ${estado}`);
  };

  const categorias = [
    { nombre: "Ferreterías", icono: <Wrench className="w-6 h-6 text-blue-600" /> },
    { nombre: "Salud y Médicos", icono: <Stethoscope className="w-6 h-6 text-blue-600" /> },
    { nombre: "Restaurantes", icono: <Coffee className="w-6 h-6 text-blue-600" /> },
    { nombre: "Talleres", icono: <Car className="w-6 h-6 text-blue-600" /> },
    { nombre: "Educación", icono: <GraduationCap className="w-6 h-6 text-blue-600" /> },
    { nombre: "Bienes Raíces", icono: <Building2 className="w-6 h-6 text-blue-600" /> },
    { nombre: "Tecnología", icono: <MonitorSmartphone className="w-6 h-6 text-blue-600" /> },
    { nombre: "Estéticas", icono: <Scissors className="w-6 h-6 text-blue-600" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      
      {/* 1. NAVBAR MINIMALISTA */}
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
            <a href="#" className="hover:text-blue-600 transition-colors">Categorías</a>
            <a href="#" className="hover:text-blue-600 transition-colors">Estados</a>
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
        <section className="px-4 -mt-20 relative z-20 max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-4 md:p-6 w-full">
            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
              
              {/* Campo: ¿Qué buscas? */}
              <div className="flex-1 flex items-center px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                <Search className="text-gray-400 w-5 h-5 mr-3 flex-shrink-0" />
                <input 
                  type="text" 
                  placeholder="¿Qué estás buscando? (Ej. Ferretería)" 
                  className="w-full bg-transparent focus:outline-none text-gray-800 placeholder-gray-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
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
                    <option value="CDMX">CDMX</option>
                    <option value="Nuevo Leon">Nuevo León</option>
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
                  </select>
                </div>
                
                {/* Botón Geolocalización */}
                <button 
                  type="button"
                  onClick={handleGeolocation}
                  className="absolute right-3 p-1.5 text-yellow-500 hover:bg-yellow-50 rounded-lg transition-colors group"
                  title="Usar mi ubicación actual"
                >
                  <Crosshair className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
              </div>

              {/* Botón Buscar */}
              <button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all flex justify-center items-center gap-2 md:w-auto w-full cursor-pointer"
              >
                Buscar
              </button>
            </form>
          </div>
        </section>

        {/* 3. CATEGORÍAS RÁPIDAS */}
        <section className="py-20 px-4 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Explora las categorías más buscadas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categorias.map((cat, idx) => (
              <button 
                key={idx}
                type="button"
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

      {/* 4. FOOTER */}
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