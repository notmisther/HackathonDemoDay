# Trámite Claro — Asistente Regulatorio para MYPEs

Aplicación web que ayuda a microempresarios a entender documentos complejos de SUNAT y municipalidades, traducidos a lenguaje simple.

## Tecnología

- **Frontend**: Astro + JavaScript vanilla
- **Backend**: Serverless Vercel (Node.js) con API de Gemini
- **Almacenamiento**: Ninguno (los documentos no se guardan)

## Requisitos

- Node.js 20+
- npm o similar

## Instalación Local

```bash
npm install
npm run dev
```

Accede a `http://localhost:3000` en tu navegador.

## Variables de Entorno

En Vercel (Project Settings → Environment Variables), configura:

```
GEMINI_API_KEY = tu-clave-de-aistudio.google.com
GEMINI_MODEL = gemini-2.5-flash (opcional)
```

## Deploy a Vercel

```bash
vercel
```

O conecta tu repositorio de GitHub directamente en dashboard.vercel.com.

## Estructura del Proyecto

```
HackathonDemoDay/
├── src/
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   └── index.astro
│   └── components/
│       └── (componentes reutilizables)
├── api/
│   └── analyze.js          (Serverless endpoint)
├── public/                 (Assets estáticos)
├── astro.config.mjs
├── tsconfig.json
├── vercel.json
└── package.json
```

## Cómo Funciona

1. El usuario sube un PDF o foto del documento
2. El frontend extrae el texto (PDF) o comprime la imagen
3. Se envía a `/api/analyze` (endpoint Vercel)
4. Gemini analiza el documento y devuelve:
   - Título/significado
   - Explicación simple
   - Checklist de acciones
   - Documentos necesarios
5. El frontend renderiza los resultados y genera PDF

## Notas de Desarrollo

- Las imágenes se comprimen en el navegador antes de enviarse (máx ~3.5MB base64)
- El timeout de Gemini está en 12 segundos
- Vercel rechaza requests > 4.5MB, pero ya estamos protegidos
- No almacenamos ningún documento (privacidad)

---

Prototipo para Hackathon Núcleo Innova 2026
