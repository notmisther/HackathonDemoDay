// api/analyze.js
// Función serverless de Vercel. Se despliega automáticamente si este archivo
// vive en la carpeta /api de tu proyecto (junto a index.html en la raíz).
//
// Configura la variable de entorno GEMINI_API_KEY en Vercel:
// Project Settings → Environment Variables → GEMINI_API_KEY = tu-key-de-aistudio
//
// El front (index.html) le hace POST a /api/analyze con { text: "..." }
// y espera de vuelta el JSON con la forma:
// { titulo_significado, que_significa, que_hacer_hoy[], documentos_necesarios[] }

const SYSTEM_PROMPT = `Eres un asesor legal experto en normativas peruanas diseñado para ayudar a microempresarios. Recibirás un texto burocrático. Debes extraer únicamente las acciones obligatorias, fechas límite y sanciones, y presentarlo como una checklist de máximo 4 pasos usando lenguaje de nivel de educación secundaria.

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown, con esta forma exacta:
{
  "titulo_significado": "Frase corta de máximo 8 palabras que resuma qué es este documento",
  "que_significa": "2-3 frases en lenguaje simple explicando de qué trata el documento y por qué le llega al empresario",
  "que_hacer_hoy": ["paso 1", "paso 2", "paso 3 (máximo 4 pasos, cada uno una acción concreta con fecha límite si existe)"],
  "documentos_necesarios": ["documento 1", "documento 2"]
}`;

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

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Falta el texto del documento a analizar." });
    return;
  }

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${SYSTEM_PROMPT}\n\nTEXTO DEL DOCUMENTO:\n${text}` }],
            },
          ],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const msg = data?.error?.message || "Error al conectar con Gemini.";
      res.status(502).json({ error: msg });
      return;
    }

    let raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    raw = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      res.status(502).json({ error: "La IA devolvió una respuesta que no se pudo interpretar." });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ error: "Error inesperado al analizar el documento." });
  }
};