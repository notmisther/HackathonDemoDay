// src/pages/api/analyze.js
// Endpoint serverless de Astro/Vercel para analizar documentos.
// Se expone automáticamente en /api/analyze.

// Configura las variables de entorno en Vercel (Project Settings → Environment Variables):
//   GEMINI_API_KEY = tu-key-de-aistudio
//   GEMINI_MODEL   = gemini-2.5-flash   (opcional, por defecto usa este)

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const MAX_INPUT_CHARS = 12000;
const FETCH_TIMEOUT_MS = 12000;
const MIME_TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];
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

export async function POST({ request }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Falta configurar GEMINI_API_KEY en el servidor." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "El cuerpo de la solicitud no es válido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { text, image, mimeType } = body || {};
  const tieneTexto = typeof text === "string" && text.trim().length > 0;
  const tieneImagen = typeof image === "string" && image.trim().length > 0;

  if (!tieneTexto && !tieneImagen) {
    return new Response(JSON.stringify({ error: "Falta el documento a analizar (texto o imagen)." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let safeText = "";
  if (tieneTexto) {
    safeText = text.slice(0, MAX_INPUT_CHARS);
  }

  if (tieneImagen) {
    if (!MIME_TIPOS_PERMITIDOS.includes(mimeType)) {
      return new Response(JSON.stringify({ error: "Formato de imagen no soportado. Usa JPG, PNG o WEBP." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (image.length > MAX_IMAGE_BASE64_CHARS) {
      return new Response(JSON.stringify({ error: "La imagen es demasiado pesada. Intenta con una foto más liviana o recórtala." }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
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
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const msg = data?.error?.message || "Error al conectar con Gemini.";
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const finishReason = data?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      return new Response(
        JSON.stringify({
          error: "El modelo no pudo generar una respuesta completa para este documento. Intenta con otro archivo.",
        }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: "La IA devolvió una respuesta que no se pudo interpretar." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

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
      return new Response(JSON.stringify({ error: "La IA no generó un plan de acción válido. Intenta de nuevo." }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(seguro), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      return new Response(JSON.stringify({ error: "El análisis tardó demasiado. Intenta de nuevo." }), {
        status: 504,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Error inesperado al analizar el documento." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeout);
  }
}