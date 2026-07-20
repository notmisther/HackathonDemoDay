// api/analyze.js
// Función serverless de Vercel. Se despliega automáticamente si este archivo
// vive en la carpeta /api de tu proyecto (junto a index.html en la raíz).
//
// Configura las variables de entorno en Vercel (Project Settings → Environment Variables):
//   GEMINI_API_KEY = tu-key-de-aistudio
//   GEMINI_MODEL   = gemini-2.5-flash   (opcional, por defecto usa este)
//
// El front (index.html) le hace POST a /api/analyze con { text: "..." }
// (documentos PDF) o con { image: "base64...", mimeType: "image/jpeg" }
// (fotos), y espera de vuelta el JSON con la forma:
// { titulo_significado, que_significa, que_hacer_hoy[], documentos_necesarios[] }

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// Nota: se fija una versión estable en vez de usar el alias "gemini-flash-latest".
// Ese alias apunta siempre a la última versión de un modelo (estable, preview o
// incluso experimental) y puede cambiar sin previo aviso — un riesgo real si
// justo cambia el sábado antes de tu pitch. Con un modelo fijo, lo que probaste
// es exactamente lo que corre en la demo.

const MAX_INPUT_CHARS = 12000; // debe coincidir con el slice() del frontend
const FETCH_TIMEOUT_MS = 12000; // corta la llamada a Gemini si tarda demasiado en el demo
const MIME_TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
// Vercel rechaza cualquier request de más de 4.5MB (413 FUNCTION_PAYLOAD_TOO_LARGE).
// El frontend ya comprime la foto antes de mandarla, pero esta es la defensa
// en el servidor por si alguien llama al endpoint directamente.
const MAX_IMAGE_BASE64_CHARS = 5_000_000;

const SYSTEM_PROMPT = `Eres un asistente especializado en interpretación de documentos de SUNAT para microempresarios peruanos. Tu objetivo es convertir lenguaje burocrático en una explicación clara, útil y honesta, sin inventar nada.

Reglas obligatorias:
- Usa solo la información que esté presente en el texto o en la imagen analizada.
- No agregues datos por conocimiento general, suposiciones ni contexto externo.
- Si un dato no está claro, no lo adivines: indícalo como "No se pudo confirmar" o simplemente omítelo.
- Si el documento menciona una norma, plazo, multa, requisito o acción, repítelo solo si está explícito en el documento.
- No cites artículos, números, entidades o fechas que no aparezcan en la fuente analizada.
- Prioriza información oficial de SUNAT cuando esté visible en el documento. Si no hay suficiente evidencia oficial en el contenido, dilo claramente.
- Explica todo con palabras sencillas, como para una persona con educación secundaria.
- Evita tecnicismos, frases largas y lenguaje legal innecesario.
- Enfócate solo en lo importante para el usuario: qué es, por qué le llegó, qué debe hacer hoy y qué documentos debe tener a mano.
- No repitas información ni escribas texto decorativo.

Genera siempre este resultado:
- titulo_significado: frase corta de máximo 8 palabras que resuma qué es este documento.
- que_significa: 2 a 3 frases simples explicando qué es el documento, por qué le llega al empresario y cuál es el riesgo o consecuencia principal si no atiende lo indicado.
- que_hacer_hoy: lista de máximo 4 pasos, cada uno una acción concreta, ordenada por prioridad. Si existe una fecha límite, inclúyela exactamente como aparece o indícala de forma clara.
- documentos_necesarios: lista breve de documentos o datos que el empresario debería tener listos para responder o cumplir.

Estilo de salida:
- Sé claro, directo y fácil de leer.
- Si no hay suficientes datos para un campo, devuelve una respuesta honesta y corta en lugar de inventar información.
- Mantén un tono profesional, cercano y comprensible para cualquier usuario.`;

// Schema que fuerza a Gemini a responder SIEMPRE con esta forma exacta,
// sin necesidad de parsear/limpiar markdown a mano.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    titulo_significado: { type: "string" },
    que_significa: { type: "string" },
    que_hacer_hoy: { type: "array", items: { type: "string" } },
    documentos_necesarios: { type: "array", items: { type: "string" } },
  },
  required: ["titulo_significado", "que_significa", "que_hacer_hoy", "documentos_necesarios"],
  propertyOrdering: ["titulo_significado", "que_significa", "que_hacer_hoy", "documentos_necesarios"],
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido, usa POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en el servidor." });
    return;
  }

  const { text, image, mimeType } = req.body || {};

  const tieneTexto = typeof text === "string" && text.trim().length > 0;
  const tieneImagen = typeof image === "string" && image.trim().length > 0;

  if (!tieneTexto && !tieneImagen) {
    res.status(400).json({ error: "Falta el documento a analizar (texto o imagen)." });
    return;
  }

  let safeText = "";
  if (tieneTexto) {
    // Defensa en profundidad: el frontend ya recorta a 12000 caracteres, pero
    // alguien podría llamar a este endpoint directamente sin pasar por la UI.
    safeText = text.slice(0, MAX_INPUT_CHARS);
  }

  if (tieneImagen) {
    if (!MIME_TIPOS_PERMITIDOS.includes(mimeType)) {
      res.status(400).json({ error: "Formato de imagen no soportado. Usa JPG, PNG o WEBP." });
      return;
    }
    if (image.length > MAX_IMAGE_BASE64_CHARS) {
      res.status(413).json({ error: "La imagen es demasiado pesada. Intenta con una foto más liviana o recórtala." });
      return;
    }
  }

  const parts = tieneImagen
    ? [
        { inlineData: { mimeType, data: image } },
        { text: `${SYSTEM_PROMPT}\n\nAnaliza el documento que aparece en la imagen adjunta (foto de una notificación o normativa).` },
      ]
    : [{ text: `${SYSTEM_PROMPT}\n\nTEXTO DEL DOCUMENTO:\n${safeText}` }];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts,
            },
          ],
          generationConfig: {
            temperature: 0.3,
            // Gemini 2.5 Flash "piensa" internamente antes de responder, y esos
            // tokens de razonamiento se descuentan del mismo maxOutputTokens.
            // Como esta tarea es extracción simple (no necesita razonamiento),
            // lo apagamos para que todo el presupuesto se use en la respuesta.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 2048, // margen amplio como red de seguridad
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const msg = data?.error?.message || "Error al conectar con Gemini.";
      res.status(502).json({ error: msg });
      return;
    }

    // Si el contenido fue bloqueado por los filtros de seguridad de Gemini,
    // candidates puede venir vacío aunque la request en sí haya sido "ok".
    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      res.status(502).json({
        error: "El modelo no pudo generar una respuesta completa para este documento. Intenta con otro archivo.",
      });
      return;
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      res.status(502).json({ error: "La IA devolvió una respuesta que no se pudo interpretar." });
      return;
    }

    // Validación server-side: aunque el schema ya obliga la forma, esto
    // protege contra campos faltantes/tipos inesperados y aplica el límite
    // de 4 pasos que pide el prompt, sin depender 100% del modelo.
    const seguro = {
      titulo_significado:
        typeof parsed.titulo_significado === "string" && parsed.titulo_significado.trim()
          ? parsed.titulo_significado.trim()
          : "Resumen del documento",
      que_significa: typeof parsed.que_significa === "string" ? parsed.que_significa.trim() : "",
      que_hacer_hoy: Array.isArray(parsed.que_hacer_hoy) ? parsed.que_hacer_hoy.filter(Boolean).slice(0, 4) : [],
      documentos_necesarios: Array.isArray(parsed.documentos_necesarios)
        ? parsed.documentos_necesarios.filter(Boolean)
        : [],
    };

    if (!seguro.que_significa || seguro.que_hacer_hoy.length === 0) {
      res.status(502).json({ error: "La IA no generó un plan de acción válido. Intenta de nuevo." });
      return;
    }

    res.status(200).json(seguro);
  } catch (err) {
    if (err.name === "AbortError") {
      res.status(504).json({ error: "El análisis tardó demasiado. Intenta de nuevo." });
      return;
    }
    res.status(500).json({ error: "Error inesperado al analizar el documento." });
  } finally {
    clearTimeout(timeout);
  }
};