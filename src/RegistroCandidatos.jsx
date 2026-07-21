import { useState, useRef, useEffect } from "react";
import { supabase } from "./lib/supabaseClient";

// ─── Utilidades de seguridad y archivos ─────────────────────────────
// Cifra la contraseña con SHA-256 (nunca se guarda en texto plano)
const hashTexto = async (texto) => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(texto)
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// Reduce la foto a máx. 1000px y la convierte a JPEG para poder guardarla
const comprimirImagen = (file) =>
  new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1000;
      const esc = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * esc);
      cv.height = Math.round(img.height * esc);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      res(cv.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("No se pudo procesar la imagen"));
    };
    img.src = url;
  });

const archivoADataURL = (file) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("No se pudo leer el archivo"));
    r.readAsDataURL(file);
  });

const CLAVE_DATOS = "portal:principal";

// ─── Configuración de pasos del registro ────────────────────────────
const PASOS = [
  { id: "cuenta", titulo: "Crear cuenta", etiqueta: "Cuenta" },
  { id: "personal", titulo: "Datos personales", etiqueta: "Datos" },
  { id: "experiencia", titulo: "Experiencia", etiqueta: "Experiencia" },
  { id: "cv", titulo: "Currículum", etiqueta: "Currículum" },
  { id: "resumen", titulo: "Confirmación", etiqueta: "Listo" },
];

const AREAS = [
  "Administración",
  "Atención al Cliente",
  "Ventas",
  "Marketing y Publicidad",
  "Tecnología e Informática",
  "Diseño Gráfico y Multimedia",
  "Salud",
  "Educación",
  "Construcción",
  "Ingeniería",
  "Arquitectura",
  "Contabilidad y Finanzas",
  "Recursos Humanos",
  "Logística y Transporte",
  "Compras y Abastecimiento",
  "Producción y Manufactura",
  "Hotelería y Turismo",
  "Restaurantes y Gastronomía",
  "Comercio y Retail",
  "Seguridad",
  "Limpieza y Mantenimiento",
  "Mecánica y Automotriz",
  "Telecomunicaciones",
  "Agricultura y Ganadería",
  "Derecho y Asesoría Legal",
  "Bienes Raíces",
  "Banca y Seguros",
  "Servicio Doméstico",
  "Belleza y Estética",
  "Deportes y Fitness",
  "Arte, Cultura y Entretenimiento",
  "Freelance",
  "Prácticas Profesionales",
];

const TIPOS_CONTRATO = [
  "Tiempo completo",
  "Medio tiempo",
  "Por proyecto",
  "Freelance",
  "Prácticas",
];

// ─── Campos reutilizables (a nivel de módulo para no perder el foco) ─
const Campo = ({ etiqueta, error, children }) => (
  <label className="block mb-5">
    <span className="block text-sm font-semibold text-stone-700 mb-1.5">
      {etiqueta}
    </span>
    {children}
    {error && (
      <span className="block mt-1.5 text-sm text-red-600">{error}</span>
    )}
  </label>
);

const claseInput = (err) =>
  `w-full rounded-lg border px-4 py-3 text-base text-stone-900 bg-white outline-none rc-anim transition-shadow focus:ring-2 focus:ring-emerald-500 ${
    err ? "border-red-400" : "border-stone-300"
  }`;

// ─── Provincias de Panamá según el primer número de la cédula ───────
const PROVINCIAS_PA = {
  1: "Bocas del Toro",
  2: "Coclé",
  3: "Colón",
  4: "Chiriquí",
  5: "Darién",
  6: "Herrera",
  7: "Los Santos",
  8: "Panamá",
  9: "Veraguas",
  10: "Comarca Guna Yala",
  11: "Comarca Emberá-Wounaan",
  12: "Comarca Ngäbe-Buglé",
};

const PREFIJOS_ESPECIALES = {
  PE: "Panameño(a) nacido(a) en el extranjero",
  E: "Extranjero(a) residente",
  N: "Naturalizado(a)",
};

// Detecta la circunscripción a partir de la cédula (ej. "8-123-4567" → Panamá)
const detectarProvincia = (cedula) => {
  const c = cedula.trim().toUpperCase();
  if (!c) return null;
  const prefijoEspecial = Object.keys(PREFIJOS_ESPECIALES).find((p) =>
    new RegExp(`^${p}(-|\\d|$)`).test(c)
  );
  if (prefijoEspecial)
    return { codigo: prefijoEspecial, nombre: PREFIJOS_ESPECIALES[prefijoEspecial] };
  const m = c.match(/^(\d{1,2})(-|$)/) || c.match(/^(\d)/);
  if (!m) return null;
  const num = Number(m[1]);
  if (PROVINCIAS_PA[num]) return { codigo: String(num), nombre: PROVINCIAS_PA[num] };
  return null;
};

const formatearFecha = (iso) =>
  new Date(iso).toLocaleDateString("es-PA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Convierte una fila de la tabla "candidatos" de Supabase al formato que usa la UI
const filaACandidato = (f) => ({
  id: f.id,
  nombre: f.nombre,
  edad: f.edad,
  cedula: f.cedula,
  correo: f.correo,
  anios: f.anios,
  area: f.area,
  descripcion: f.descripcion,
  archivoNombre: f.archivo_nombre,
  estado: f.estado,
  fotoCedulaUrl: f.foto_cedula_url || "",
  fotoPerfilUrl: f.foto_perfil_url || "",
  fecha: formatearFecha(f.creado_en),
});

// Convierte una fila de la tabla "vacantes" de Supabase al formato que usa la UI
const filaAVacante = (f) => ({
  id: f.id,
  autorCorreo: f.autor_correo,
  autorNombre: f.autor_nombre,
  puesto: f.puesto,
  empresa: f.empresa,
  ubicacion: f.ubicacion,
  area: f.area,
  tipoContrato: f.tipo_contrato,
  salario: f.salario || "",
  descripcion: f.descripcion,
  fotoUrl: f.foto_url || "",
  fecha: formatearFecha(f.creado_en),
});

// ─── Candidatos registrados (se llena con los registros reales) ─────
const CANDIDATOS_DEMO = [];

// Cuenta de reclutador de demostración (en un backend real esto se valida en el servidor)
const RECLUTADOR = {
  correo: "reclutador@portal.com",
  contrasena: "reclutador123",
};

// ─── Notificaciones de demostración ──────────────────────────────────
const NOTIFICACIONES_DEMO = [
  {
    id: 1,
    icono: "✅",
    texto: "La foto de tu cédula fue verificada correctamente.",
    tiempo: "1 d",
    leida: false,
  },
  {
    id: 2,
    icono: "🛒",
    texto: "Se publicó una nueva vacante en la categoría Tecnología.",
    tiempo: "2 d",
    leida: false,
  },
  {
    id: 3,
    icono: "👀",
    texto: "Un reclutador revisó tu perfil de candidato.",
    tiempo: "3 d",
    leida: false,
  },
  {
    id: 4,
    icono: "📄",
    texto: "Tu postulación cambió de estado a Pendiente.",
    tiempo: "4 d",
    leida: true,
  },
  {
    id: 5,
    icono: "⚠️",
    texto: "Recuerda completar tu currículum para mejorar tu perfil.",
    tiempo: "5 d",
    leida: true,
  },
];

const ESTADOS = {
  pendiente: { texto: "Pendiente", clase: "bg-amber-100 text-amber-800 border-amber-300" },
  aprobado: { texto: "Aprobado", clase: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  rechazado: { texto: "Rechazado", clase: "bg-red-100 text-red-700 border-red-300" },
};

const DATOS_VACIOS = {
  correo: "",
  contrasena: "",
  confirmar: "",
  nombre: "",
  edad: "",
  cedula: "",
  anios: "",
  area: "",
  descripcion: "",
  archivo: null,
  fotoCedula: null,
  fotoCedulaUrl: "",
  fotoPerfilUrl: "",
};

export default function RegistroCandidatos() {
  // vista: "inicio" (login) | "registro" (asistente) | "perfil" (sesión iniciada)
  const [vista, setVista] = useState("inicio");
  const [paso, setPaso] = useState(0);
  const [errores, setErrores] = useState({});
  const [arrastrando, setArrastrando] = useState(false);
  const [analisis, setAnalisis] = useState(null);
  const inputArchivo = useRef(null);
  const inputFoto = useRef(null);
  const inputFotoPerfil = useRef(null);
  const menuPerfilRef = useRef(null);

  // ─── Análisis de la foto de la cédula con IA ─────────────────────
  const analizarFoto = async (file) => {
    const tiposSoportados = ["image/jpeg", "image/png", "image/webp"];
    if (!tiposSoportados.includes(file.type)) {
      setAnalisis({ estado: "no_soportado" });
      return;
    }
    setAnalisis({ estado: "analizando" });
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("No se pudo leer el archivo"));
        r.readAsDataURL(file);
      });

      const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: file.type,
                    data: base64,
                  },
                },
                {
                  type: "text",
                  text: 'Analiza esta imagen que debería ser una cédula de identidad de Panamá. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto adicional, con esta estructura exacta: {"es_cedula": boolean (si parece un documento de identidad panameño), "legible": boolean (si el texto se puede leer bien), "numero": string o null (el número de cédula tal como aparece, ej. "8-123-4567"), "nombre": string o null (el nombre completo tal como aparece), "observacion": string (una frase corta en español, por ejemplo si la foto está borrosa, con reflejos, incompleta, o si todo se ve bien)}',
                },
              ],
            },
          ],
        }),
      });

      const data = await respuesta.json();
      const texto = (data.content || [])
        .filter((i) => i.type === "text")
        .map((i) => i.text)
        .join("\n");
      const limpio = texto.replace(/```json|```/g, "").trim();
      const r = JSON.parse(limpio);
      setAnalisis({ estado: "listo", ...r });
    } catch (err) {
      setAnalisis({ estado: "error" });
    }
  };

  // Compara ignorando espacios, guiones y mayúsculas
  const normalizar = (t) => (t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  // Acepta la foto de la cédula (imagen) y crea la vista previa
  const aceptarFotoCedula = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["jpg", "jpeg", "png", "webp", "heic"].includes(ext)) {
      setErrores((e) => ({
        ...e,
        fotoCedula: "La foto debe ser una imagen (JPG, PNG, WEBP o HEIC)",
      }));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrores((e) => ({
        ...e,
        fotoCedula: "La imagen supera los 8 MB. Toma la foto de nuevo o comprímela.",
      }));
      return;
    }
    try {
      const dataUrl = await comprimirImagen(file);
      setDatos((d) => ({ ...d, fotoCedula: file, fotoCedulaUrl: dataUrl }));
      setErrores((e) => ({ ...e, fotoCedula: undefined }));
      analizarFoto(file);
    } catch {
      setErrores((e) => ({
        ...e,
        fotoCedula: "No se pudo procesar la imagen. Intenta con otra foto.",
      }));
    }
  };

  const [sesion, setSesion] = useState(null);
  const [restaurandoSesion, setRestaurandoSesion] = useState(true);

  // Restaura la sesión si el usuario ya había iniciado sesión antes (Supabase la guarda en el navegador)
  useEffect(() => {
    const restaurar = async () => {
      const { data } = await supabase.auth.getSession();
      const usuario = data.session?.user;
      if (usuario) {
        if (usuario.email === RECLUTADOR.correo) {
          setVista("admin");
        } else {
          const perfil = await cargarPerfilCandidato(usuario.email);
          setSesion(perfil);
          setVista("perfil");
        }
      }
      setRestaurandoSesion(false);
    };
    restaurar();
  }, []);

  const [pestana, setPestana] = useState("empleos"); // "perfil" | "empleos"
  const [mostrarMenuPerfil, setMostrarMenuPerfil] = useState(false);
  const [soloMisPublicaciones, setSoloMisPublicaciones] = useState(false);
  const [notificaciones, setNotificaciones] = useState(NOTIFICACIONES_DEMO);
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);
  const [filtroNotif, setFiltroNotif] = useState("todas"); // "todas" | "no-leidas"
  const [pushDescartado, setPushDescartado] = useState(false);
  const notifRef = useRef(null);

  const noLeidas = notificaciones.filter((n) => !n.leida).length;
  const notificacionesFiltradas =
    filtroNotif === "no-leidas"
      ? notificaciones.filter((n) => !n.leida)
      : notificaciones;

  const marcarNotificacionLeida = (id) =>
    setNotificaciones((ns) =>
      ns.map((n) => (n.id === id ? { ...n, leida: true } : n))
    );

  // Cierra el menú del perfil al hacer clic fuera de él
  useEffect(() => {
    if (!mostrarMenuPerfil) return;
    const alHacerClic = (e) => {
      if (menuPerfilRef.current && !menuPerfilRef.current.contains(e.target)) {
        setMostrarMenuPerfil(false);
      }
    };
    document.addEventListener("mousedown", alHacerClic);
    return () => document.removeEventListener("mousedown", alHacerClic);
  }, [mostrarMenuPerfil]);

  // Cierra el panel de notificaciones al hacer clic fuera de él
  useEffect(() => {
    if (!mostrarNotificaciones) return;
    const alHacerClic = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setMostrarNotificaciones(false);
      }
    };
    document.addEventListener("mousedown", alHacerClic);
    return () => document.removeEventListener("mousedown", alHacerClic);
  }, [mostrarNotificaciones]);

  // Cambia la foto de perfil del candidato con sesión iniciada
  const cambiarFotoPerfil = async (file) => {
    if (!file || !sesion) return;
    try {
      const dataUrl = await comprimirImagen(file);
      setSesion((s) => ({ ...s, fotoPerfilUrl: dataUrl }));
      if (sesion.id) {
        await supabase
          .from("candidatos")
          .update({ foto_perfil_url: dataUrl })
          .eq("id", sesion.id);
      }
    } catch {
      // Si la imagen no se puede procesar, simplemente no se actualiza la foto
    }
  };

  // ─── Vacantes de empleo (cualquiera con sesión puede publicar) ─────
  const [vacantes, setVacantes] = useState([]);
  const [mostrarFormVacante, setMostrarFormVacante] = useState(false);
  const [nuevaVacante, setNuevaVacante] = useState({
    puesto: "",
    empresa: "",
    ubicacion: "",
    area: "",
    tipoContrato: "",
    salario: "",
    descripcion: "",
    fotoUrl: "",
  });
  const [erroresVacante, setErroresVacante] = useState({});
  const [busquedaEmpleo, setBusquedaEmpleo] = useState("");
  const [categoriaEmpleo, setCategoriaEmpleo] = useState("");
  const [busquedaCategoria, setBusquedaCategoria] = useState("");
  const [vacanteDetalle, setVacanteDetalle] = useState(null);

  const categoriasFiltradas = AREAS.filter((a) =>
    a.toLowerCase().includes(busquedaCategoria.trim().toLowerCase())
  );

  const setVacanteCampo = (campo, valor) => {
    setNuevaVacante((v) => ({ ...v, [campo]: valor }));
    setErroresVacante((e) => ({ ...e, [campo]: undefined }));
  };

  const manejarFotoVacante = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await comprimirImagen(file);
      setVacanteCampo("fotoUrl", dataUrl);
    } catch {
      setErroresVacante((e) => ({
        ...e,
        foto: "No se pudo procesar la imagen. Intenta con otra foto.",
      }));
    }
  };

  const validarVacante = () => {
    const e = {};
    if (nuevaVacante.puesto.trim().length < 5)
      e.puesto = "Escribe un título de puesto más descriptivo (mínimo 5 caracteres)";
    if (nuevaVacante.empresa.trim().length < 2)
      e.empresa = "Escribe el nombre de la empresa";
    if (nuevaVacante.ubicacion.trim().length < 2)
      e.ubicacion = "Indica la ubicación de la vacante";
    if (!nuevaVacante.area) e.area = "Selecciona una categoría";
    if (!nuevaVacante.tipoContrato)
      e.tipoContrato = "Selecciona un tipo de contrato";
    if (nuevaVacante.descripcion.trim().length < 20)
      e.descripcion =
        "Cuéntanos más sobre la vacante (mínimo 20 caracteres)";
    setErroresVacante(e);
    return Object.keys(e).length === 0;
  };

  const [publicandoVacante, setPublicandoVacante] = useState(false);

  const publicarVacante = async () => {
    if (!validarVacante()) return;
    setPublicandoVacante(true);
    const { data, error } = await supabase
      .from("vacantes")
      .insert({
        autor_correo: sesion.correo,
        autor_nombre: sesion.nombre,
        puesto: nuevaVacante.puesto.trim(),
        empresa: nuevaVacante.empresa.trim(),
        ubicacion: nuevaVacante.ubicacion.trim(),
        area: nuevaVacante.area,
        tipo_contrato: nuevaVacante.tipoContrato,
        salario: nuevaVacante.salario.trim(),
        descripcion: nuevaVacante.descripcion.trim(),
        foto_url: nuevaVacante.fotoUrl,
      })
      .select()
      .single();
    setPublicandoVacante(false);

    if (error) {
      setErroresVacante((e) => ({
        ...e,
        general: "No se pudo publicar la vacante. Intenta de nuevo.",
      }));
      return;
    }

    setVacantes((v) => [filaAVacante(data), ...v]);
    setNuevaVacante({
      puesto: "",
      empresa: "",
      ubicacion: "",
      area: "",
      tipoContrato: "",
      salario: "",
      descripcion: "",
      fotoUrl: "",
    });
    setErroresVacante({});
    setMostrarFormVacante(false);
  };

  const eliminarVacante = async (id) => {
    setVacantes((v) => v.filter((x) => x.id !== id));
    await supabase.from("vacantes").delete().eq("id", id);
  };

  const vacantesFiltradas = vacantes.filter((v) => {
    if (soloMisPublicaciones && v.autorCorreo !== sesion?.correo)
      return false;
    const q = busquedaEmpleo.trim().toLowerCase();
    if (
      q &&
      !v.puesto.toLowerCase().includes(q) &&
      !v.empresa.toLowerCase().includes(q) &&
      !v.descripcion.toLowerCase().includes(q)
    )
      return false;
    if (categoriaEmpleo && v.area !== categoriaEmpleo) return false;
    return true;
  });

  // ─── Panel de administrador ───────────────────────────────────────
  const [candidatos, setCandidatos] = useState(CANDIDATOS_DEMO);
  const [filtro, setFiltro] = useState({
    busqueda: "",
    provincia: "",
    area: "",
    estado: "",
  });
  const [seleccionado, setSeleccionado] = useState(null);

  // Carga las vacantes y postulaciones reales desde Supabase al abrir la app
  useEffect(() => {
    const cargarDatos = async () => {
      const { data: filasVacantes } = await supabase
        .from("vacantes")
        .select("*")
        .order("creado_en", { ascending: false });
      if (filasVacantes) setVacantes(filasVacantes.map(filaAVacante));

      const { data: filasCandidatos } = await supabase
        .from("candidatos")
        .select("*")
        .order("creado_en", { ascending: false });
      if (filasCandidatos) setCandidatos(filasCandidatos.map(filaACandidato));
    };
    cargarDatos();
  }, []);

  const [enviandoCorreo, setEnviandoCorreo] = useState(null); // id del candidato al que se le está notificando

  const cambiarEstado = async (id, estado) => {
    setCandidatos((cs) => cs.map((c) => (c.id === id ? { ...c, estado } : c)));

    const { error } = await supabase
      .from("candidatos")
      .update({ estado })
      .eq("id", id);

    if (error) return;

    if (estado === "aprobado") {
      const candidato = candidatos.find((c) => c.id === id);
      if (candidato) {
        setEnviandoCorreo(id);
        await supabase.functions.invoke("notificar-aprobacion", {
          body: { correo: candidato.correo, nombre: candidato.nombre },
        });
        setEnviandoCorreo(null);
      }
    }
  };

  const candidatosFiltrados = candidatos.filter((c) => {
    const prov = detectarProvincia(c.cedula)?.nombre || "";
    const q = filtro.busqueda.trim().toLowerCase();
    if (
      q &&
      !c.nombre.toLowerCase().includes(q) &&
      !c.cedula.toLowerCase().includes(q) &&
      !c.correo.toLowerCase().includes(q)
    )
      return false;
    if (filtro.provincia && prov !== filtro.provincia) return false;
    if (filtro.area && c.area !== filtro.area) return false;
    if (filtro.estado && c.estado !== filtro.estado) return false;
    return true;
  });

  const conteo = (estado) =>
    candidatos.filter((c) => c.estado === estado).length;

  const [datos, setDatos] = useState(DATOS_VACIOS);
  const [login, setLogin] = useState({ correo: "", contrasena: "" });
  const [errorLogin, setErrorLogin] = useState("");
  const [loginReclutador, setLoginReclutador] = useState({
    correo: "",
    contrasena: "",
  });
  const [errorLoginReclutador, setErrorLoginReclutador] = useState("");

  const set = (campo, valor) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  // Busca el perfil de candidato asociado a un correo y arma el objeto de sesión
  const cargarPerfilCandidato = async (correo) => {
    const { data: fila } = await supabase
      .from("candidatos")
      .select("*")
      .eq("correo", correo)
      .order("creado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    return fila ? filaACandidato(fila) : { correo };
  };

  // ─── Verificación de inicio de sesión ─────────────────────────────
  const iniciarSesion = async () => {
    setErrorLogin("");
    if (!/^\S+@\S+\.\S+$/.test(login.correo)) {
      setErrorLogin("Escribe un correo válido para verificar tu cuenta.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: login.correo.trim(),
      password: login.contrasena,
    });
    if (error) {
      setErrorLogin("Correo o contraseña incorrectos. Inténtalo de nuevo.");
      return;
    }
    const perfil = await cargarPerfilCandidato(data.user.email);
    setSesion(perfil);
    setVista("perfil");
    setLogin({ correo: "", contrasena: "" });
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
    setSesion(null);
    setPestana("empleos");
    setMostrarMenuPerfil(false);
    setMostrarNotificaciones(false);
    setSoloMisPublicaciones(false);
    setVista("inicio");
  };

  // ─── Verificación de inicio de sesión del reclutador ──────────────
  const iniciarSesionReclutador = async () => {
    setErrorLoginReclutador("");
    if (!/^\S+@\S+\.\S+$/.test(loginReclutador.correo)) {
      setErrorLoginReclutador("Escribe un correo válido.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginReclutador.correo.trim(),
      password: loginReclutador.contrasena,
    });
    if (error) {
      setErrorLoginReclutador("Correo o contraseña incorrectos.");
      return;
    }
    if (data.user.email !== RECLUTADOR.correo) {
      await supabase.auth.signOut();
      setErrorLoginReclutador("Esta cuenta no tiene permisos de reclutador.");
      return;
    }
    setLoginReclutador({ correo: "", contrasena: "" });
    setVista("admin");
  };

  const irARegistro = () => {
    setDatos({ ...DATOS_VACIOS, correo: login.correo });
    setErrores({});
    setAnalisis(null);
    setPaso(0);
    setVista("registro");
  };

  // ─── Validación por paso del registro ─────────────────────────────
  const validar = () => {
    const e = {};
    if (paso === 0) {
      if (!/^\S+@\S+\.\S+$/.test(datos.correo))
        e.correo = "Escribe un correo válido, por ejemplo nombre@correo.com";
      if (datos.contrasena.length < 8)
        e.contrasena = "La contraseña necesita al menos 8 caracteres";
      if (datos.confirmar !== datos.contrasena)
        e.confirmar = "Las contraseñas no coinciden";
    }
    if (paso === 1) {
      if (datos.nombre.trim().length < 3)
        e.nombre = "Escribe tu nombre completo";
      const edad = Number(datos.edad);
      if (!datos.edad || edad < 18 || edad > 99)
        e.edad = "Ingresa una edad entre 18 y 99";
      if (!/^(PE|E|N|\d{1,2})-\d{1,4}-\d{1,6}$/i.test(datos.cedula.trim()))
        e.cedula =
          "Usa el formato panameño: provincia-tomo-asiento, ej. 8-123-4567";
      else if (!detectarProvincia(datos.cedula))
        e.cedula =
          "El primer número no corresponde a una provincia válida (1 al 12, PE, E o N)";
      if (!datos.fotoCedula)
        e.fotoCedula = "Sube una foto de tu cédula para continuar";
    }
    if (paso === 2) {
      if (datos.anios === "") e.anios = "Indica tus años de experiencia";
      if (!datos.area) e.area = "Selecciona un área";
      if (datos.descripcion.trim().length < 20)
        e.descripcion = "Cuéntanos un poco más (mínimo 20 caracteres)";
    }
    if (paso === 3) {
      if (!datos.archivo) e.archivo = "Sube tu currículum para continuar";
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const siguiente = () => {
    if (validar()) setPaso((p) => Math.min(p + 1, PASOS.length - 1));
  };
  const anterior = () => setPaso((p) => Math.max(p - 1, 0));

  const [enviandoRegistro, setEnviandoRegistro] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState("");

  const enviarRegistro = async () => {
    const nueva = { ...datos, correo: datos.correo.trim() };
    setEnviandoRegistro(true);
    setErrorRegistro("");

    const { error: errorAuth } = await supabase.auth.signUp({
      email: nueva.correo,
      password: nueva.contrasena,
    });

    if (errorAuth) {
      setEnviandoRegistro(false);
      setErrorRegistro(
        errorAuth.message.includes("already registered") ||
          errorAuth.message.includes("already been registered")
          ? "Ya existe una cuenta con este correo. Vuelve al inicio para entrar."
          : "No se pudo crear tu cuenta. Intenta de nuevo."
      );
      return;
    }

    const { data, error } = await supabase
      .from("candidatos")
      .insert({
        nombre: nueva.nombre,
        edad: nueva.edad,
        cedula: nueva.cedula,
        correo: nueva.correo,
        anios: nueva.anios,
        area: nueva.area,
        descripcion: nueva.descripcion,
        archivo_nombre: nueva.archivo?.name || "Sin archivo",
        estado: "pendiente",
        foto_cedula_url: nueva.fotoCedulaUrl,
      })
      .select()
      .single();

    setEnviandoRegistro(false);

    if (error) {
      setErrorRegistro(
        "Tu cuenta se creó, pero no se pudo guardar tu postulación. Escríbenos para revisarlo."
      );
      return;
    }

    setCandidatos((cs) => [filaACandidato(data), ...cs]);
    setSesion(filaACandidato(data));
    setVista("perfil");
  };

  // ─── Manejo del archivo ────────────────────────────────────────────
  const aceptarArchivo = (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "doc", "docx"].includes(ext)) {
      setErrores((e) => ({
        ...e,
        archivo: "El archivo debe ser PDF o Word (.pdf, .doc, .docx)",
      }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrores((e) => ({
        ...e,
        archivo: "El archivo supera los 5 MB. Sube una versión más ligera.",
      }));
      return;
    }
    set("archivo", file);
  };

  const tamano = (bytes) =>
    bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const estilos = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Archivo+Narrow:wght@500&display=swap');
      .rc-display { font-family: 'Archivo', system-ui, sans-serif; }
      .rc-mono { font-family: 'Archivo Narrow', system-ui, sans-serif; letter-spacing: 0.08em; }
      @media (prefers-reduced-motion: reduce) { .rc-anim { transition: none !important; } }
    `}</style>
  );

  if (restaurandoSesion) {
    return (
      <div className="min-h-screen bg-stone-100 rc-display flex items-center justify-center">
        {estilos}
        <p className="text-stone-400 text-sm">Cargando…</p>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // VISTA 1 · Inicio: verificar cuenta / iniciar sesión
  // ──────────────────────────────────────────────────────────────────
  if (vista === "inicio") {
    return (
      <div className="min-h-screen bg-stone-100 rc-display flex items-center justify-center p-6">
        {estilos}
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <p className="rc-mono uppercase text-xs text-emerald-700 font-medium mb-1">
              Camaron
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">
              Bienvenido de nuevo
            </h1>
            <p className="text-stone-500 mt-2">
              Entra con tu cuenta o crea una si es tu primera vez.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8">
            <Campo etiqueta="Correo electrónico">
              <input
                type="email"
                value={login.correo}
                onChange={(e) => {
                  setLogin((l) => ({ ...l, correo: e.target.value }));
                  setErrorLogin("");
                }}
                placeholder="nombre@correo.com"
                className={claseInput(false)}
              />
            </Campo>
            <Campo etiqueta="Contraseña">
              <input
                type="password"
                value={login.contrasena}
                onChange={(e) => {
                  setLogin((l) => ({ ...l, contrasena: e.target.value }));
                  setErrorLogin("");
                }}
                onKeyDown={(e) => e.key === "Enter" && iniciarSesion()}
                placeholder="Tu contraseña"
                className={claseInput(false)}
              />
            </Campo>

            {errorLogin && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {errorLogin}
              </div>
            )}

            <button
              onClick={iniciarSesion}
              className="w-full px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Iniciar sesión
            </button>

            <div className="flex items-center gap-3 my-6">
              <div className="h-px bg-stone-200 flex-1" />
              <span className="rc-mono uppercase text-[11px] text-stone-400">
                ¿Primera vez aquí?
              </span>
              <div className="h-px bg-stone-200 flex-1" />
            </div>

            <button
              onClick={irARegistro}
              className="w-full px-6 py-3 rounded-lg bg-amber-400 text-stone-900 font-bold hover:bg-amber-500 rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              Crear una cuenta nueva
            </button>
          </div>

          <p className="text-center text-xs text-stone-400 mt-4">
            Tus datos se guardan de forma segura y persisten entre sesiones.
          </p>
          <div className="text-center mt-3">
            <button
              onClick={() => {
                setErrorLoginReclutador("");
                setVista("login-reclutador");
              }}
              className="text-sm text-stone-500 hover:text-emerald-700 font-semibold"
            >
              🗂️ Entrar como reclutador
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // VISTA · Inicio de sesión del reclutador
  // ──────────────────────────────────────────────────────────────────
  if (vista === "login-reclutador") {
    return (
      <div className="min-h-screen bg-stone-100 rc-display flex items-center justify-center p-6">
        {estilos}
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <p className="rc-mono uppercase text-xs text-emerald-700 font-medium mb-1">
              Camaron · Reclutador
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">
              Acceso de reclutador
            </h1>
            <p className="text-stone-500 mt-2">
              Ingresa tu correo y contraseña para ver la bandeja de
              postulantes.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8">
            <Campo etiqueta="Correo electrónico">
              <input
                type="email"
                value={loginReclutador.correo}
                onChange={(e) => {
                  setLoginReclutador((l) => ({ ...l, correo: e.target.value }));
                  setErrorLoginReclutador("");
                }}
                placeholder="reclutador@portal.com"
                className={claseInput(false)}
              />
            </Campo>
            <Campo etiqueta="Contraseña">
              <input
                type="password"
                value={loginReclutador.contrasena}
                onChange={(e) => {
                  setLoginReclutador((l) => ({
                    ...l,
                    contrasena: e.target.value,
                  }));
                  setErrorLoginReclutador("");
                }}
                onKeyDown={(e) =>
                  e.key === "Enter" && iniciarSesionReclutador()
                }
                placeholder="Tu contraseña"
                className={claseInput(false)}
              />
            </Campo>

            {errorLoginReclutador && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {errorLoginReclutador}
              </div>
            )}

            <button
              onClick={iniciarSesionReclutador}
              className="w-full px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              Entrar al panel
            </button>
          </div>

          <div className="text-center mt-4">
            <button
              onClick={() => setVista("inicio")}
              className="text-sm text-stone-500 hover:text-emerald-700 font-semibold"
            >
              ← Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // VISTA 3 · Perfil (sesión iniciada)
  // ──────────────────────────────────────────────────────────────────
  if (vista === "perfil" && sesion) {
    return (
      <div className="min-h-screen bg-stone-100 rc-display p-6">
        {estilos}
        <div
          className={`mx-auto ${
            pestana === "empleos" ? "max-w-7xl" : "max-w-lg"
          }`}
        >
          {/* ── Encabezado con pestañas ── */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="inline-flex gap-1 bg-white rounded-xl border border-stone-200 p-1.5">
              <button
                onClick={() => setPestana("perfil")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold rc-anim transition-colors ${
                  pestana === "perfil"
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:bg-stone-100"
                }`}
              >
                Mi perfil
              </button>
              <button
                onClick={() => setPestana("empleos")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold rc-anim transition-colors ${
                  pestana === "empleos"
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:bg-stone-100"
                }`}
              >
                💼 Empleos
              </button>
            </div>

            <div className="flex-1 min-w-[160px] max-w-md order-last sm:order-none">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">
                  🔍
                </span>
                <input
                  value={busquedaEmpleo}
                  onChange={(e) => {
                    setBusquedaEmpleo(e.target.value);
                    setPestana("empleos");
                  }}
                  placeholder="Buscar empleos, empresas…"
                  className={claseInput(false) + " !pl-9"}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Aplicaciones (decorativo) */}
              <button
                title="Aplicaciones"
                className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-lg text-stone-700 rc-anim transition-colors"
              >
                ▦
              </button>

              {/* Mensajes (decorativo) */}
              <button
                title="Mensajes"
                className="w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-lg text-stone-700 rc-anim transition-colors"
              >
                💬
              </button>

              {/* Notificaciones */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setMostrarNotificaciones((v) => !v)}
                  className="relative w-10 h-10 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-lg text-stone-700 rc-anim transition-colors"
                  title="Notificaciones"
                >
                  🔔
                  {noLeidas > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {noLeidas}
                    </span>
                  )}
                </button>

                {mostrarNotificaciones && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden z-20">
                    <div className="px-4 pt-3 pb-2">
                      <h3 className="text-lg font-extrabold text-stone-900">
                        Notificaciones
                      </h3>
                    </div>
                    <div className="flex gap-2 px-4 pb-3">
                      <button
                        onClick={() => setFiltroNotif("todas")}
                        className={`px-3 py-1 rounded-full text-sm font-semibold rc-anim transition-colors ${
                          filtroNotif === "todas"
                            ? "bg-emerald-100 text-emerald-700"
                            : "text-stone-500 hover:bg-stone-100"
                        }`}
                      >
                        Todas
                      </button>
                      <button
                        onClick={() => setFiltroNotif("no-leidas")}
                        className={`px-3 py-1 rounded-full text-sm font-semibold rc-anim transition-colors ${
                          filtroNotif === "no-leidas"
                            ? "bg-emerald-100 text-emerald-700"
                            : "text-stone-500 hover:bg-stone-100"
                        }`}
                      >
                        No leídas
                      </button>
                    </div>

                    {!pushDescartado && (
                      <div className="mx-4 mb-3 rounded-lg bg-stone-50 border border-stone-200 p-3 relative">
                        <button
                          onClick={() => setPushDescartado(true)}
                          className="absolute top-2 right-2 text-stone-400 hover:text-stone-600 text-xs"
                        >
                          ✕
                        </button>
                        <p className="text-sm font-semibold text-stone-800 pr-4">
                          Tus notificaciones push están desactivadas
                        </p>
                        <p className="text-xs text-stone-500 mt-0.5 mb-2">
                          Actívalas para estar al tanto de las novedades.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPushDescartado(true)}
                            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 rc-anim transition-colors"
                          >
                            Activar
                          </button>
                          <button
                            onClick={() => setPushDescartado(true)}
                            className="px-3 py-1.5 rounded-md bg-stone-200 text-stone-700 text-xs font-semibold hover:bg-stone-300 rc-anim transition-colors"
                          >
                            Ahora no
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="max-h-80 overflow-y-auto border-t border-stone-100">
                      {notificacionesFiltradas.length === 0 ? (
                        <p className="text-sm text-stone-400 text-center py-8">
                          No tienes notificaciones
                          {filtroNotif === "no-leidas" ? " sin leer" : ""}.
                        </p>
                      ) : (
                        notificacionesFiltradas.map((n) => (
                          <button
                            key={n.id}
                            onClick={() => marcarNotificacionLeida(n.id)}
                            className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-stone-50 rc-anim transition-colors ${
                              !n.leida ? "bg-emerald-50/40" : ""
                            }`}
                          >
                            <span className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-base shrink-0">
                              {n.icono}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="text-sm text-stone-800 leading-snug">
                                {n.texto}
                              </span>
                              <span className="block text-xs text-emerald-700 font-semibold mt-0.5">
                                {n.tiempo}
                              </span>
                            </span>
                            {!n.leida && (
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Perfil */}
              <div className="relative" ref={menuPerfilRef}>
                <button
                  onClick={() => setMostrarMenuPerfil((v) => !v)}
                  className="flex items-center gap-1 pl-1 pr-2 h-10 rounded-full bg-stone-100 hover:bg-stone-200 rc-anim transition-colors"
                  title="Tu cuenta"
                >
                  <span className="w-8 h-8 rounded-full bg-emerald-500 text-stone-900 flex items-center justify-center font-extrabold overflow-hidden shrink-0">
                    {sesion.fotoPerfilUrl ? (
                      <img
                        src={sesion.fotoPerfilUrl}
                        alt="Foto de perfil"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (sesion.nombre || sesion.correo || "?").trim().charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="text-stone-500 text-xs">▾</span>
                </button>

                {mostrarMenuPerfil && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-stone-200 shadow-lg overflow-hidden z-20">
                    <div className="p-3">
                      <div className="flex items-center gap-3 px-1 py-1.5">
                        <span className="w-9 h-9 rounded-full bg-emerald-500 text-stone-900 flex items-center justify-center font-extrabold overflow-hidden shrink-0">
                          {sesion.fotoPerfilUrl ? (
                            <img
                              src={sesion.fotoPerfilUrl}
                              alt="Foto de perfil"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            (sesion.nombre || sesion.correo || "?").trim().charAt(0).toUpperCase()
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-stone-900 truncate">
                            {sesion.nombre}
                          </p>
                          <p className="text-xs text-stone-500 truncate">
                            {sesion.correo}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          inputFotoPerfil.current?.click();
                          setMostrarMenuPerfil(false);
                        }}
                        className="w-full mt-2 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 text-sm font-semibold text-stone-700 rc-anim transition-colors"
                      >
                        🖼️ Cambiar foto de perfil
                      </button>
                    </div>

                    <div className="border-t border-stone-100 py-1.5">
                      <button
                        onClick={() => {
                          setPestana("empleos");
                          setSoloMisPublicaciones(true);
                          setMostrarMenuPerfil(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 rc-anim transition-colors"
                      >
                        📋 Mis publicaciones
                      </button>
                    </div>

                    <div className="border-t border-stone-100 py-1.5">
                      <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 rc-anim transition-colors">
                        <span>⚙️ Configuración y privacidad</span>
                        <span>›</span>
                      </button>
                      <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 rc-anim transition-colors">
                        <span>❓ Ayuda y asistencia</span>
                        <span>›</span>
                      </button>
                      <button className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 rc-anim transition-colors">
                        <span>🚩 Informar de un problema</span>
                        <span className="text-[11px] text-stone-400">
                          Ctrl B
                        </span>
                      </button>
                      <button className="w-full text-left px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 rc-anim transition-colors">
                        🌙 Pantalla y accesibilidad
                      </button>
                    </div>

                    <div className="border-t border-stone-100 py-1.5">
                      <button
                        onClick={cerrarSesion}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rc-anim transition-colors"
                      >
                        🚪 Cerrar sesión
                      </button>
                    </div>

                    <p className="px-4 py-3 text-[11px] text-stone-400 border-t border-stone-100">
                      Privacidad · Condiciones · Cookies
                    </p>
                  </div>
                )}

                <input
                  ref={inputFotoPerfil}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => cambiarFotoPerfil(e.target.files[0])}
                />
              </div>
            </div>
          </div>

          {/* ── Pestaña: Mi perfil ── */}
          {pestana === "perfil" && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="bg-stone-900 text-white px-8 py-6 flex items-center justify-between">
                <div>
                  <p className="rc-mono uppercase text-[11px] text-emerald-400">
                    Sesión iniciada
                  </p>
                  <h1 className="text-xl font-bold">Hola, {sesion.nombre} 👋</h1>
                </div>
                <button
                  onClick={() => inputFotoPerfil.current?.click()}
                  className="w-12 h-12 rounded-full bg-emerald-500 text-stone-900 flex items-center justify-center text-lg font-extrabold overflow-hidden hover:ring-2 hover:ring-emerald-400 rc-anim transition-shadow"
                  title="Cambiar foto de perfil"
                >
                  {sesion.fotoPerfilUrl ? (
                    <img
                      src={sesion.fotoPerfilUrl}
                      alt="Foto de perfil"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (sesion.nombre || sesion.correo || "?").trim().charAt(0).toUpperCase()
                  )}
                </button>
              </div>

              <div className="p-8">
                <p className="rc-mono uppercase text-[11px] text-stone-400 mb-3">
                  Tu perfil de candidato
                </p>
                <dl className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden mb-6">
                  {[
                    ["Correo", sesion.correo],
                    ["Edad", `${sesion.edad} años`],
                    ["Cédula", sesion.cedula],
                    [
                      "Provincia",
                      detectarProvincia(sesion.cedula || "")?.nombre || "—",
                    ],
                    [
                      "Foto de cédula",
                      sesion.fotoCedulaUrl ? "✅ Verificación enviada" : "Sin foto",
                    ],
                    [
                      "Experiencia",
                      `${sesion.anios} ${
                        Number(sesion.anios) === 1 ? "año" : "años"
                      } en ${sesion.area}`,
                    ],
                    ["Currículum", sesion.archivoNombre || "Sin archivo"],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="grid grid-cols-[110px_1fr] gap-3 px-4 py-3"
                    >
                      <dt className="rc-mono uppercase text-[11px] text-stone-400 pt-0.5">
                        {k}
                      </dt>
                      <dd className="text-sm text-stone-800 break-words">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
                  Tu perfil está completo. Te avisaremos a {sesion.correo}{" "}
                  cuando haya novedades sobre tu postulación.
                </div>
              </div>
            </div>
          )}

          {/* ── Pestaña: Empleos ── */}
          {pestana === "empleos" && (
            <div className="grid md:grid-cols-[260px_1fr] gap-5 items-start">
              {/* ── Barra lateral ── */}
              <aside className="bg-white rounded-2xl border border-stone-200 p-4 md:sticky md:top-6">
                <h1 className="text-xl font-extrabold text-stone-900 mb-4">
                  Empleos
                </h1>

                <button
                  onClick={() => {
                    setMostrarFormVacante((v) => !v);
                    setErroresVacante({});
                  }}
                  className="w-full mb-5 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 rc-anim transition-colors"
                >
                  {mostrarFormVacante ? "✕ Cancelar" : "+ Publicar vacante"}
                </button>

                <nav className="space-y-1 mb-5">
                  <button
                    onClick={() => setSoloMisPublicaciones(false)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold rc-anim transition-colors ${
                      !soloMisPublicaciones
                        ? "bg-emerald-50 text-emerald-700"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <span className="text-base">💼</span> Explorar vacantes
                  </button>
                  <button
                    onClick={() => setSoloMisPublicaciones(true)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold rc-anim transition-colors ${
                      soloMisPublicaciones
                        ? "bg-emerald-50 text-emerald-700"
                        : "text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    <span className="text-base">📋</span> Mis publicaciones
                  </button>
                </nav>

                <div className="border-t border-stone-200 pt-4">
                  <p className="rc-mono uppercase text-[11px] text-stone-400 mb-2 px-3">
                    Categorías
                  </p>
                  <input
                    value={busquedaCategoria}
                    onChange={(e) => setBusquedaCategoria(e.target.value)}
                    placeholder="Buscar categoría…"
                    className={
                      claseInput(false) + " mb-2 !py-1.5 !text-sm mx-1 w-[calc(100%-0.5rem)]"
                    }
                  />
                  <div className="space-y-0.5 max-h-64 overflow-y-auto">
                    {busquedaCategoria === "" && (
                      <button
                        onClick={() => setCategoriaEmpleo("")}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm rc-anim transition-colors ${
                          categoriaEmpleo === ""
                            ? "bg-emerald-50 text-emerald-700 font-semibold"
                            : "text-stone-600 hover:bg-stone-100"
                        }`}
                      >
                        Todas
                      </button>
                    )}
                    {categoriasFiltradas.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-stone-400">
                        Sin resultados.
                      </p>
                    ) : (
                      categoriasFiltradas.map((a) => (
                        <button
                          key={a}
                          onClick={() => setCategoriaEmpleo(a)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-sm rc-anim transition-colors ${
                            categoriaEmpleo === a
                              ? "bg-emerald-50 text-emerald-700 font-semibold"
                              : "text-stone-600 hover:bg-stone-100"
                          }`}
                        >
                          {a}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </aside>

              {/* ── Contenido principal ── */}
              <div>
                {mostrarFormVacante && (
                  <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-5">
                    <h2 className="text-lg font-bold mb-4">
                      Publicar una vacante
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      <Campo etiqueta="Título del puesto" error={erroresVacante.puesto}>
                        <input
                          value={nuevaVacante.puesto}
                          onChange={(e) =>
                            setVacanteCampo("puesto", e.target.value)
                          }
                          placeholder="Ej. Desarrollador/a frontend"
                          className={claseInput(erroresVacante.puesto)}
                        />
                      </Campo>
                      <Campo etiqueta="Empresa" error={erroresVacante.empresa}>
                        <input
                          value={nuevaVacante.empresa}
                          onChange={(e) =>
                            setVacanteCampo("empresa", e.target.value)
                          }
                          placeholder="Ej. Innova Tech S.A."
                          className={claseInput(erroresVacante.empresa)}
                        />
                      </Campo>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      <Campo etiqueta="Ubicación" error={erroresVacante.ubicacion}>
                        <input
                          value={nuevaVacante.ubicacion}
                          onChange={(e) =>
                            setVacanteCampo("ubicacion", e.target.value)
                          }
                          placeholder="Ej. Ciudad de Panamá"
                          className={claseInput(erroresVacante.ubicacion)}
                        />
                      </Campo>
                      <Campo etiqueta="Categoría" error={erroresVacante.area}>
                        <select
                          value={nuevaVacante.area}
                          onChange={(e) =>
                            setVacanteCampo("area", e.target.value)
                          }
                          className={claseInput(erroresVacante.area)}
                        >
                          <option value="">Selecciona una categoría</option>
                          {AREAS.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      <Campo
                        etiqueta="Tipo de contrato"
                        error={erroresVacante.tipoContrato}
                      >
                        <select
                          value={nuevaVacante.tipoContrato}
                          onChange={(e) =>
                            setVacanteCampo("tipoContrato", e.target.value)
                          }
                          className={claseInput(erroresVacante.tipoContrato)}
                        >
                          <option value="">Selecciona un tipo</option>
                          {TIPOS_CONTRATO.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      <Campo etiqueta="Salario (opcional)">
                        <input
                          value={nuevaVacante.salario}
                          onChange={(e) =>
                            setVacanteCampo("salario", e.target.value)
                          }
                          placeholder="Ej. 800 - 1200 USD/mes"
                          className={claseInput(false)}
                        />
                      </Campo>
                    </div>
                    <Campo
                      etiqueta="Descripción del puesto"
                      error={erroresVacante.descripcion}
                    >
                      <textarea
                        rows={4}
                        value={nuevaVacante.descripcion}
                        onChange={(e) =>
                          setVacanteCampo("descripcion", e.target.value)
                        }
                        placeholder="Responsabilidades, requisitos, beneficios…"
                        className={
                          claseInput(erroresVacante.descripcion) + " resize-y"
                        }
                      />
                    </Campo>
                    <div className="mb-2">
                      <span className="block text-sm font-semibold text-stone-700 mb-1.5">
                        Logo de la empresa (opcional)
                      </span>
                      {nuevaVacante.fotoUrl ? (
                        <div className="flex items-center gap-4">
                          <img
                            src={nuevaVacante.fotoUrl}
                            alt="Vista previa del logo"
                            className="w-24 h-24 object-cover rounded-lg border border-stone-200"
                          />
                          <button
                            onClick={() => setVacanteCampo("fotoUrl", "")}
                            className="text-sm text-stone-500 hover:text-red-600"
                          >
                            Quitar foto
                          </button>
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) =>
                            manejarFotoVacante(e.target.files[0])
                          }
                          className="text-sm text-stone-600"
                        />
                      )}
                      {erroresVacante.foto && (
                        <p className="mt-1.5 text-sm text-red-600">
                          {erroresVacante.foto}
                        </p>
                      )}
                    </div>
                    {erroresVacante.general && (
                      <p className="mb-2 text-sm text-red-600">
                        {erroresVacante.general}
                      </p>
                    )}
                    <button
                      onClick={publicarVacante}
                      disabled={publicandoVacante}
                      className="w-full mt-3 px-6 py-3 rounded-lg bg-amber-400 text-stone-900 font-bold hover:bg-amber-500 disabled:opacity-60 rc-anim transition-colors"
                    >
                      {publicandoVacante ? "Publicando…" : "Publicar vacante"}
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-stone-900">
                    {soloMisPublicaciones
                      ? "Mis publicaciones"
                      : categoriaEmpleo
                      ? categoriaEmpleo
                      : "Vacantes destacadas"}
                  </h2>
                  {soloMisPublicaciones && (
                    <button
                      onClick={() => setSoloMisPublicaciones(false)}
                      className="text-sm text-emerald-700 font-semibold hover:underline"
                    >
                      Ver todas
                    </button>
                  )}
                </div>

                {/* ── Lista de vacantes ── */}
                {vacantesFiltradas.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-stone-300 p-14 text-center text-stone-400">
                    {vacantes.length === 0
                      ? "Todavía no hay vacantes publicadas. ¡Sé el primero en publicar una!"
                      : "No hay vacantes que coincidan con estos filtros."}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {vacantesFiltradas.map((v) => (
                      <div
                        key={v.id}
                        onClick={() => setVacanteDetalle(v)}
                        className="bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-md rc-anim transition-shadow relative flex flex-col h-full cursor-pointer"
                      >
                        {v.autorCorreo === sesion.correo && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              eliminarVacante(v.id);
                            }}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-stone-900/70 text-white text-xs font-bold flex items-center justify-center hover:bg-red-600 rc-anim transition-colors"
                            title="Eliminar publicación"
                          >
                            ✕
                          </button>
                        )}
                        {v.fotoUrl ? (
                          <img
                            src={v.fotoUrl}
                            alt={v.empresa}
                            className="w-full aspect-square object-cover"
                          />
                        ) : (
                          <div className="w-full aspect-square bg-stone-100 flex items-center justify-center text-4xl">
                            💼
                          </div>
                        )}
                        <div className="p-3 flex flex-col flex-1">
                          <p className="text-sm font-bold text-stone-900 truncate">
                            {v.puesto}
                          </p>
                          <p className="text-xs text-stone-500 truncate mt-0.5">
                            {v.empresa} · 📍 {v.ubicacion}
                          </p>
                          <p
                            className={`text-lg font-extrabold mt-1.5 ${
                              v.salario ? "text-stone-900" : "text-stone-400"
                            }`}
                          >
                            {v.salario || "A convenir"}
                          </p>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setVacanteDetalle(v);
                            }}
                            className="mt-auto pt-2 block w-full text-center px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 rc-anim transition-colors"
                          >
                            Postularme
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Detalle de la vacante ── */}
              {vacanteDetalle && (
                <div
                  className="fixed inset-0 bg-stone-900/60 flex items-center justify-center p-4 z-50"
                  onClick={() => setVacanteDetalle(null)}
                >
                  <div
                    className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {vacanteDetalle.fotoUrl ? (
                      <img
                        src={vacanteDetalle.fotoUrl}
                        alt={vacanteDetalle.empresa}
                        className="w-full aspect-video object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-video bg-stone-100 flex items-center justify-center text-5xl">
                        💼
                      </div>
                    )}

                    <div className="p-6">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <h2 className="text-xl font-extrabold text-stone-900">
                          {vacanteDetalle.puesto}
                        </h2>
                        <button
                          onClick={() => setVacanteDetalle(null)}
                          className="text-stone-400 hover:text-stone-700 text-sm font-semibold shrink-0"
                        >
                          ✕ Cerrar
                        </button>
                      </div>
                      <p className="text-stone-600 mb-4">
                        {vacanteDetalle.empresa}
                      </p>

                      <p
                        className={`text-2xl font-extrabold mb-4 ${
                          vacanteDetalle.salario
                            ? "text-emerald-700"
                            : "text-stone-400"
                        }`}
                      >
                        {vacanteDetalle.salario || "Salario a convenir"}
                      </p>

                      <dl className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden mb-4">
                        {[
                          ["Ubicación", "📍 " + vacanteDetalle.ubicacion],
                          ["Categoría", vacanteDetalle.area],
                          ["Tipo de contrato", vacanteDetalle.tipoContrato],
                          ["Publicado", vacanteDetalle.fecha],
                        ].map(([k, v2]) => (
                          <div
                            key={k}
                            className="grid grid-cols-[130px_1fr] gap-3 px-4 py-2.5"
                          >
                            <dt className="rc-mono uppercase text-[11px] text-stone-400 pt-0.5">
                              {k}
                            </dt>
                            <dd className="text-sm text-stone-800 break-words">
                              {v2}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <p className="rc-mono uppercase text-[11px] text-stone-400 mb-1">
                        Descripción
                      </p>
                      <p className="text-sm text-stone-700 mb-6 whitespace-pre-wrap">
                        {vacanteDetalle.descripcion}
                      </p>

                      <a
                        href={`mailto:${vacanteDetalle.autorCorreo}?subject=${encodeURIComponent(
                          "Postulación: " + vacanteDetalle.puesto
                        )}`}
                        className="block text-center px-6 py-3 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 rc-anim transition-colors"
                      >
                        Postularme
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // VISTA 4 · Panel de reclutador (bandeja de postulantes)
  // ──────────────────────────────────────────────────────────────────
  if (vista === "admin") {
    const detalle = candidatos.find((c) => c.id === seleccionado);
    const provinciasEnUso = [
      ...new Set(
        candidatos
          .map((c) => detectarProvincia(c.cedula)?.nombre)
          .filter(Boolean)
      ),
    ].sort();

    return (
      <div className="min-h-screen bg-stone-100 rc-display text-stone-900">
        {estilos}
        <div className="max-w-6xl mx-auto px-4 py-8">
          <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
            <div>
              <p className="rc-mono uppercase text-xs text-emerald-700 font-medium mb-1">
                Camaron · Reclutador
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Bandeja de postulantes
              </h1>
            </div>
            <button
              onClick={() => {
                setSeleccionado(null);
                setVista("inicio");
              }}
              className="text-sm text-stone-500 hover:text-emerald-700 font-semibold"
            >
              ← Salir del panel
            </button>
          </header>

          {/* ── Estadísticas rápidas (tocables para filtrar) ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              ["", "Total", candidatos.length, "bg-stone-900 text-white"],
              ["pendiente", "Pendientes", conteo("pendiente"), "bg-amber-400 text-stone-900"],
              ["aprobado", "Aprobados", conteo("aprobado"), "bg-emerald-600 text-white"],
              ["rechazado", "Rechazados", conteo("rechazado"), "bg-white border border-stone-200 text-stone-700"],
            ].map(([estado, texto, num, clase]) => (
              <button
                key={texto}
                onClick={() =>
                  setFiltro((f) => ({
                    ...f,
                    estado: f.estado === estado ? "" : estado,
                  }))
                }
                className={`rounded-xl px-4 py-3 text-left rc-anim transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-emerald-500 ${clase} ${
                  filtro.estado === estado && estado !== ""
                    ? "ring-2 ring-stone-900 ring-offset-2"
                    : ""
                }`}
              >
                <p className="text-2xl font-extrabold leading-none">{num}</p>
                <p className="rc-mono uppercase text-[11px] mt-1 opacity-80">
                  {texto}
                </p>
              </button>
            ))}
          </div>

          {/* ── Filtros ── */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              value={filtro.busqueda}
              onChange={(e) =>
                setFiltro((f) => ({ ...f, busqueda: e.target.value }))
              }
              placeholder="Buscar por nombre, cédula o correo…"
              className={claseInput(false)}
            />
            <select
              value={filtro.provincia}
              onChange={(e) =>
                setFiltro((f) => ({ ...f, provincia: e.target.value }))
              }
              className={claseInput(false)}
            >
              <option value="">Todas las provincias</option>
              {provinciasEnUso.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              value={filtro.area}
              onChange={(e) =>
                setFiltro((f) => ({ ...f, area: e.target.value }))
              }
              className={claseInput(false)}
            >
              <option value="">Todas las áreas</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                setFiltro({ busqueda: "", provincia: "", area: "", estado: "" })
              }
              className="px-4 py-3 rounded-lg border border-stone-300 text-stone-600 font-semibold hover:bg-stone-100 rc-anim transition-colors"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="grid md:grid-cols-[1fr_400px] gap-5 items-start">
            {/* ── Lista de postulantes ── */}
            <div className={detalle ? "hidden md:block" : ""}>
              {candidatosFiltrados.length === 0 ? (
                <div className="bg-white rounded-xl border border-stone-200 p-10 text-center text-stone-500">
                  No hay postulantes que coincidan con estos filtros. Prueba
                  con "Limpiar filtros".
                </div>
              ) : (
                <ul className="space-y-3">
                  {candidatosFiltrados.map((c) => {
                    const prov = detectarProvincia(c.cedula)?.nombre;
                    const activo = c.id === seleccionado;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => setSeleccionado(c.id)}
                          className={`w-full text-left bg-white rounded-xl border p-4 flex items-center gap-4 rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                            activo
                              ? "border-emerald-500 ring-1 ring-emerald-500"
                              : "border-stone-200 hover:border-emerald-300"
                          }`}
                        >
                          <div className="w-11 h-11 rounded-full bg-stone-900 text-emerald-400 flex items-center justify-center font-extrabold shrink-0">
                            {c.nombre.trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-stone-900 truncate">
                              {c.nombre}
                            </p>
                            <p className="text-sm text-stone-500 truncate">
                              {c.area} · {c.anios}{" "}
                              {Number(c.anios) === 1 ? "año" : "años"}
                              {prov && ` · ${prov}`}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${ESTADOS[c.estado].clase}`}
                            >
                              {ESTADOS[c.estado].texto}
                            </span>
                            <p className="rc-mono uppercase text-[10px] text-stone-400 mt-1">
                              {c.fecha}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ── Detalle del postulante ── */}
            {detalle ? (
              <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden md:sticky md:top-6">
                <div className="bg-stone-900 text-white px-6 py-5 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="rc-mono uppercase text-[11px] text-emerald-400">
                      Postulante
                    </p>
                    <h2 className="text-lg font-bold truncate">
                      {detalle.nombre}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSeleccionado(null)}
                    className="text-stone-400 hover:text-white text-sm font-semibold shrink-0 ml-3"
                  >
                    ✕ Cerrar
                  </button>
                </div>

                <div className="p-6">
                  <span
                    className={`inline-block rounded-full border px-3 py-1 text-xs font-bold mb-4 ${ESTADOS[detalle.estado].clase}`}
                  >
                    {ESTADOS[detalle.estado].texto}
                  </span>

                  {detalle.fotoCedulaUrl ? (
                    <img
                      src={detalle.fotoCedulaUrl}
                      alt="Cédula del postulante"
                      className="w-full h-40 object-cover rounded-xl border border-stone-200 mb-4"
                    />
                  ) : (
                    <div className="w-full h-24 rounded-xl bg-stone-100 border border-dashed border-stone-300 flex items-center justify-center text-stone-400 text-sm mb-4">
                      🪪 Foto de cédula disponible en el expediente
                    </div>
                  )}

                  <dl className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden mb-4">
                    {[
                      ["Correo", detalle.correo],
                      ["Edad", `${detalle.edad} años`],
                      ["Cédula", detalle.cedula],
                      [
                        "Provincia",
                        detectarProvincia(detalle.cedula)?.nombre || "—",
                      ],
                      [
                        "Experiencia",
                        `${detalle.anios} ${
                          Number(detalle.anios) === 1 ? "año" : "años"
                        } en ${detalle.area}`,
                      ],
                      ["Currículum", detalle.archivoNombre],
                      ["Recibido", detalle.fecha],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="grid grid-cols-[100px_1fr] gap-3 px-4 py-2.5"
                      >
                        <dt className="rc-mono uppercase text-[11px] text-stone-400 pt-0.5">
                          {k}
                        </dt>
                        <dd className="text-sm text-stone-800 break-words">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <p className="rc-mono uppercase text-[11px] text-stone-400 mb-1">
                    Sobre su experiencia
                  </p>
                  <p className="text-sm text-stone-700 mb-6">
                    {detalle.descripcion}
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => cambiarEstado(detalle.id, "aprobado")}
                      disabled={enviandoCorreo === detalle.id}
                      className="px-4 py-3 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-60 rc-anim transition-colors"
                    >
                      {enviandoCorreo === detalle.id
                        ? "Enviando correo…"
                        : "✓ Aprobar"}
                    </button>
                    <button
                      onClick={() => cambiarEstado(detalle.id, "rechazado")}
                      className="px-4 py-3 rounded-lg border border-red-300 text-red-600 font-bold hover:bg-red-50 rc-anim transition-colors"
                    >
                      ✕ Rechazar
                    </button>
                  </div>
                  {detalle.estado !== "pendiente" && (
                    <button
                      onClick={() => cambiarEstado(detalle.id, "pendiente")}
                      className="w-full mt-3 text-sm text-stone-500 hover:text-stone-700 font-semibold"
                    >
                      Devolver a pendiente
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="hidden md:flex bg-white rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-400 items-center justify-center min-h-[300px]">
                Selecciona un postulante de la lista para ver su expediente
                completo.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────
  // VISTA 2 · Asistente de registro (5 pasos)
  // ──────────────────────────────────────────────────────────────────
  const filasFicha = [
    { etiqueta: "Correo", valor: datos.correo },
    { etiqueta: "Nombre", valor: datos.nombre },
    { etiqueta: "Edad", valor: datos.edad && `${datos.edad} años` },
    { etiqueta: "Cédula", valor: datos.cedula },
    {
      etiqueta: "Provincia",
      valor: detectarProvincia(datos.cedula)?.nombre,
    },
    {
      etiqueta: "Foto de cédula",
      valor: datos.fotoCedula && "✅ Subida",
    },
    {
      etiqueta: "Experiencia",
      valor:
        datos.anios !== "" &&
        `${datos.anios} ${Number(datos.anios) === 1 ? "año" : "años"}${
          datos.area ? " · " + datos.area : ""
        }`,
    },
    { etiqueta: "Currículum", valor: datos.archivo && datos.archivo.name },
  ];

  return (
    <div className="min-h-screen bg-stone-100 rc-display text-stone-900">
      {estilos}
      <div className="max-w-5xl mx-auto px-4 py-8 md:py-14">
        <header className="mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="rc-mono uppercase text-xs text-emerald-700 font-medium mb-1">
              Camaron
            </p>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Crea tu perfil de candidato
            </h1>
          </div>
          <button
            onClick={() => setVista("inicio")}
            className="text-sm text-stone-500 hover:text-emerald-700 font-semibold"
          >
            ← Ya tengo cuenta, iniciar sesión
          </button>
        </header>

        {/* ── Progreso compacto: solo en celular ── */}
        <div className="md:hidden mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="rc-mono uppercase text-[11px] text-stone-500">
              Paso {paso + 1} de {PASOS.length}
            </span>
            <span className="text-sm font-bold text-stone-800">
              {PASOS[paso].etiqueta}
            </span>
          </div>
          <div className="flex gap-1.5">
            {PASOS.map((p, i) => (
              <div
                key={p.id}
                className={`h-1.5 flex-1 rounded-full rc-anim transition-colors ${
                  i < paso
                    ? "bg-emerald-500"
                    : i === paso
                    ? "bg-amber-400"
                    : "bg-stone-300"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-6 items-start">
          {/* ── Panel izquierdo: pasos + ficha viva (solo escritorio) ── */}
          <aside className="hidden md:block bg-stone-900 text-stone-100 rounded-2xl p-6 md:sticky md:top-6">
            <ol className="mb-6">
              {PASOS.map((p, i) => {
                const activo = i === paso;
                const hecho = i < paso;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-1.5">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold rc-anim transition-colors ${
                        hecho
                          ? "bg-emerald-500 text-stone-900"
                          : activo
                          ? "bg-amber-400 text-stone-900"
                          : "bg-stone-700 text-stone-400"
                      }`}
                    >
                      {hecho ? "✓" : i + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        activo
                          ? "font-bold text-white"
                          : hecho
                          ? "text-emerald-300"
                          : "text-stone-400"
                      }`}
                    >
                      {p.etiqueta}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="border-t border-stone-700 pt-5">
              <p className="rc-mono uppercase text-[11px] text-stone-400 mb-3">
                Tu ficha se llena en vivo
              </p>
              <dl>
                {filasFicha.map((f) => (
                  <div key={f.etiqueta} className="mb-2.5">
                    <dt className="text-[11px] uppercase rc-mono text-stone-500">
                      {f.etiqueta}
                    </dt>
                    <dd
                      className={`text-sm truncate rc-anim transition-colors ${
                        f.valor ? "text-white" : "text-stone-600"
                      }`}
                    >
                      {f.valor || "— pendiente —"}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>

          {/* ── Panel derecho: formulario del paso ── */}
          <main className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 md:p-10">
            <p className="rc-mono uppercase text-xs text-stone-400 mb-1">
              Paso {paso + 1} de {PASOS.length}
            </p>
            <h2 className="text-2xl font-bold mb-6">{PASOS[paso].titulo}</h2>

            {paso === 0 && (
              <>
                <Campo etiqueta="Correo electrónico" error={errores.correo}>
                  <input
                    type="email"
                    value={datos.correo}
                    onChange={(e) => set("correo", e.target.value)}
                    placeholder="nombre@correo.com"
                    className={claseInput(errores.correo)}
                  />
                </Campo>
                <Campo etiqueta="Contraseña" error={errores.contrasena}>
                  <input
                    type="password"
                    value={datos.contrasena}
                    onChange={(e) => set("contrasena", e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className={claseInput(errores.contrasena)}
                  />
                </Campo>
                <Campo
                  etiqueta="Confirmar contraseña"
                  error={errores.confirmar}
                >
                  <input
                    type="password"
                    value={datos.confirmar}
                    onChange={(e) => set("confirmar", e.target.value)}
                    placeholder="Repite tu contraseña"
                    className={claseInput(errores.confirmar)}
                  />
                </Campo>
              </>
            )}

            {paso === 1 && (
              <>
                <Campo etiqueta="Nombre completo" error={errores.nombre}>
                  <input
                    value={datos.nombre}
                    onChange={(e) => set("nombre", e.target.value)}
                    placeholder="Ej. María Fernanda Rojas"
                    className={claseInput(errores.nombre)}
                  />
                </Campo>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Campo etiqueta="Edad" error={errores.edad}>
                    <input
                      type="number"
                      min="18"
                      max="99"
                      value={datos.edad}
                      onChange={(e) => set("edad", e.target.value)}
                      placeholder="Ej. 28"
                      className={claseInput(errores.edad)}
                    />
                  </Campo>
                  <Campo etiqueta="Cédula" error={errores.cedula}>
                    <input
                      value={datos.cedula}
                      onChange={(e) => set("cedula", e.target.value)}
                      placeholder="Ej. 8-123-4567"
                      className={claseInput(errores.cedula)}
                    />
                    {detectarProvincia(datos.cedula) && (
                      <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                        📍 {detectarProvincia(datos.cedula).nombre}
                      </span>
                    )}
                  </Campo>
                </div>

                <div className="mb-2">
                  <span className="block text-sm font-semibold text-stone-700 mb-1.5">
                    Foto de tu cédula
                  </span>
                  <div
                    onClick={() => inputFoto.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) =>
                      e.key === "Enter" && inputFoto.current?.click()
                    }
                    className={`rounded-xl border-2 border-dashed p-5 cursor-pointer rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      errores.fotoCedula
                        ? "border-red-400 bg-red-50"
                        : "border-stone-300 bg-stone-50 hover:border-emerald-400"
                    }`}
                  >
                    {datos.fotoCedulaUrl ? (
                      <div className="flex items-center gap-4">
                        <img
                          src={datos.fotoCedulaUrl}
                          alt="Vista previa de la cédula"
                          className="w-28 h-20 object-cover rounded-lg border border-stone-200"
                        />
                        <div>
                          <p className="font-semibold text-stone-800 text-sm">
                            {datos.fotoCedula.name}
                          </p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            {tamano(datos.fotoCedula.size)} · Haz clic para
                            cambiarla
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="w-28 h-20 rounded-lg bg-stone-200 flex items-center justify-center text-3xl">
                          🪪
                        </div>
                        <div>
                          <p className="font-semibold text-stone-800 text-sm">
                            Sube una foto de tu cédula
                          </p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Que se lea bien, sin reflejos · JPG, PNG o WEBP,
                            máximo 8 MB
                          </p>
                        </div>
                      </div>
                    )}
                    <input
                      ref={inputFoto}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => aceptarFotoCedula(e.target.files[0])}
                    />
                  </div>

                  {analisis?.estado === "analizando" && (
                    <div className="mt-2 rounded-lg bg-stone-100 border border-stone-200 px-4 py-3 text-sm text-stone-600 animate-pulse">
                      🔎 Analizando la foto de tu cédula…
                    </div>
                  )}

                  {analisis?.estado === "no_soportado" && (
                    <div className="mt-2 rounded-lg bg-stone-100 border border-stone-200 px-4 py-3 text-sm text-stone-600">
                      La foto quedó guardada, pero este formato no se puede
                      analizar automáticamente. Si puedes, súbela en JPG o PNG.
                    </div>
                  )}

                  {analisis?.estado === "error" && (
                    <div className="mt-2 rounded-lg bg-stone-100 border border-stone-200 px-4 py-3 text-sm text-stone-600">
                      No pudimos analizar la foto en este momento, pero quedó
                      guardada y puedes continuar.
                    </div>
                  )}

                  {analisis?.estado === "listo" &&
                    (!analisis.es_cedula || !analisis.legible ? (
                      <div className="mt-2 rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-800">
                        ⚠️ {analisis.observacion ||
                          "La imagen no parece una cédula legible."}{" "}
                        Intenta tomar la foto de nuevo, con buena luz y sin
                        reflejos.
                      </div>
                    ) : (
                      <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-300 px-4 py-3">
                        <p className="text-sm font-semibold text-emerald-800 mb-1">
                          ✅ Cédula leída correctamente
                        </p>
                        <p className="text-sm text-emerald-700">
                          {analisis.numero && (
                            <>
                              Número: <strong>{analisis.numero}</strong>
                            </>
                          )}
                          {analisis.numero && analisis.nombre && " · "}
                          {analisis.nombre && (
                            <>
                              Nombre: <strong>{analisis.nombre}</strong>
                            </>
                          )}
                        </p>
                        {analisis.numero &&
                          datos.cedula &&
                          normalizar(analisis.numero) !==
                            normalizar(datos.cedula) && (
                            <p className="mt-2 text-sm text-amber-800 bg-amber-50 border border-amber-300 rounded-md px-3 py-2">
                              ⚠️ El número de la foto no coincide con el que
                              escribiste arriba. Revisa cuál es el correcto.
                            </p>
                          )}
                        {(analisis.numero || analisis.nombre) && (
                          <button
                            onClick={() => {
                              if (analisis.numero)
                                set("cedula", analisis.numero);
                              if (analisis.nombre)
                                set("nombre", analisis.nombre);
                            }}
                            className="mt-2 text-sm font-semibold text-emerald-700 hover:underline"
                          >
                            Usar estos datos en el formulario
                          </button>
                        )}
                      </div>
                    ))}

                  {errores.fotoCedula && (
                    <p className="mt-1.5 text-sm text-red-600">
                      {errores.fotoCedula}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-stone-400">
                    Tu documento se usa solo para verificar tu identidad.
                  </p>
                </div>
              </>
            )}

            {paso === 2 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                  <Campo etiqueta="Años de experiencia" error={errores.anios}>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={datos.anios}
                      onChange={(e) => set("anios", e.target.value)}
                      placeholder="Ej. 5"
                      className={claseInput(errores.anios)}
                    />
                  </Campo>
                  <Campo etiqueta="Área principal" error={errores.area}>
                    <select
                      value={datos.area}
                      onChange={(e) => set("area", e.target.value)}
                      className={claseInput(errores.area)}
                    >
                      <option value="">Selecciona un área</option>
                      {AREAS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
                <Campo
                  etiqueta="Describe tu experiencia"
                  error={errores.descripcion}
                >
                  <textarea
                    rows={5}
                    value={datos.descripcion}
                    onChange={(e) => set("descripcion", e.target.value)}
                    placeholder="Cuéntanos dónde has trabajado, qué hacías y tus logros principales…"
                    className={claseInput(errores.descripcion) + " resize-y"}
                  />
                </Campo>
              </>
            )}

            {paso === 3 && (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastrando(true);
                  }}
                  onDragLeave={() => setArrastrando(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setArrastrando(false);
                    aceptarArchivo(e.dataTransfer.files[0]);
                  }}
                  onClick={() => inputArchivo.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" && inputArchivo.current?.click()
                  }
                  className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    arrastrando
                      ? "border-emerald-500 bg-emerald-50"
                      : errores.archivo
                      ? "border-red-400 bg-red-50"
                      : "border-stone-300 bg-stone-50 hover:border-emerald-400"
                  }`}
                >
                  <div className="text-4xl mb-3">📄</div>
                  {datos.archivo ? (
                    <>
                      <p className="font-semibold text-stone-800">
                        {datos.archivo.name}
                      </p>
                      <p className="text-sm text-stone-500 mt-1">
                        {tamano(datos.archivo.size)} · Haz clic para cambiarlo
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-stone-800">
                        Arrastra tu currículum aquí
                      </p>
                      <p className="text-sm text-stone-500 mt-1">
                        o haz clic para buscarlo · PDF o Word, máximo 5 MB
                      </p>
                    </>
                  )}
                  <input
                    ref={inputArchivo}
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => aceptarArchivo(e.target.files[0])}
                  />
                </div>
                {errores.archivo && (
                  <p className="mt-2 text-sm text-red-600">
                    {errores.archivo}
                  </p>
                )}
                {datos.archivo && (
                  <button
                    onClick={() => set("archivo", null)}
                    className="mt-3 text-sm text-stone-500 hover:text-red-600"
                  >
                    Quitar archivo
                  </button>
                )}
              </>
            )}

            {paso === 4 && (
              <div>
                <p className="text-stone-600 mb-6">
                  Revisa que todo esté correcto antes de enviar tu registro.
                </p>
                <dl className="divide-y divide-stone-200 border border-stone-200 rounded-xl overflow-hidden mb-2">
                  {[
                    ["Correo", datos.correo],
                    ["Nombre", datos.nombre],
                    ["Edad", `${datos.edad} años`],
                    ["Cédula", datos.cedula],
                    [
                      "Provincia",
                      detectarProvincia(datos.cedula)?.nombre || "—",
                    ],
                    [
                      "Foto de cédula",
                      datos.fotoCedula
                        ? `${datos.fotoCedula.name} (${tamano(
                            datos.fotoCedula.size
                          )})`
                        : "—",
                    ],
                    [
                      "Experiencia",
                      `${datos.anios} ${
                        Number(datos.anios) === 1 ? "año" : "años"
                      } en ${datos.area}`,
                    ],
                    ["Descripción", datos.descripcion],
                    [
                      "Currículum",
                      datos.archivo
                        ? `${datos.archivo.name} (${tamano(
                            datos.archivo.size
                          )})`
                        : "",
                    ],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      className="grid grid-cols-[120px_1fr] gap-3 px-4 py-3 bg-white"
                    >
                      <dt className="rc-mono uppercase text-[11px] text-stone-400 pt-0.5">
                        {k}
                      </dt>
                      <dd className="text-sm text-stone-800 break-words">
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* ── Navegación ── */}
            <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-stone-200">
              <button
                onClick={anterior}
                disabled={paso === 0}
                className={`px-5 py-3 rounded-lg font-semibold rc-anim transition-colors ${
                  paso === 0
                    ? "text-stone-300 cursor-not-allowed"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                ← Atrás
              </button>
              {paso < PASOS.length - 1 ? (
                <button
                  onClick={siguiente}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                >
                  Continuar →
                </button>
              ) : (
                <button
                  onClick={enviarRegistro}
                  disabled={enviandoRegistro}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-lg bg-amber-400 text-stone-900 font-bold hover:bg-amber-500 disabled:opacity-60 rc-anim transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                >
                  {enviandoRegistro ? "Enviando…" : "Enviar registro"}
                </button>
              )}
            </div>
            {errorRegistro && (
              <p className="mt-3 text-sm text-red-600 text-right">
                {errorRegistro}
              </p>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
