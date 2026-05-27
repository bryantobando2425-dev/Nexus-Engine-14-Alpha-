import { useLocation } from "wouter";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-[#0a0c0f] flex flex-col items-center justify-center text-[#eef2f8] px-4">
      <div className="text-center max-w-md">
        <div className="font-mono text-[#3d8eff]/40 text-8xl font-bold mb-4">404</div>
        <h1 className="font-display font-bold text-3xl mb-3">Ruta no encontrada</h1>
        <p className="font-serif italic text-[#5a6478] mb-8">
          Esta parte del mundo no existe todavía.
        </p>
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-mono text-sm border border-[#3d8eff]/30 text-[#3d8eff] hover:bg-[#3d8eff]/10 transition-all active:scale-95 mx-auto"
        >
          <ArrowLeft size={14} /> Volver al inicio
        </button>
      </div>
    </div>
  );
}
