"""
Trámite Claro — Setup Guide
============================

## Quick Start

### 1. Local Development
```bash
npm install
npm run dev
```
Visit http://localhost:3000

### 2. Environment Setup
Create `.env.local` with:
```
GEMINI_API_KEY=your-key-from-aistudio.google.com
```

### 3. Deploy to Vercel

#### Option A: Using Vercel CLI
```bash
npm install -g vercel
vercel
```

#### Option B: GitHub Integration
1. Push to GitHub
2. Import project in dashboard.vercel.com
3. Add environment variables in Project Settings
4. Deploy automatically on push

## Project Structure

```
src/
  ├── layouts/Layout.astro       # Main layout template
  ├── pages/
  │   └── index.astro            # Home page
  └── components/                # Reusable components (future)

api/
  └── analyze.js                 # Vercel serverless function

public/                          # Static assets
```

## How It Works

1. User uploads PDF or image of document
2. Frontend extracts text (PDF) or compresses image
3. Sends to `/api/analyze` (Vercel serverless)
4. Gemini API analyzes and returns:
   - Title/meaning summary
   - Simple explanation
   - Action checklist (max 4 items)
   - Required documents
5. Frontend renders results and can generate PDF

## Environment Variables (Vercel)

| Variable | Required | Description |
|----------|----------|-------------|
| GEMINI_API_KEY | Yes | API key from Google AI Studio |
| GEMINI_MODEL | No | Model name (default: gemini-2.5-flash) |

## Key Features

✅ PDF text extraction (using pdfjs-dist)
✅ Image compression in browser (before upload)
✅ Serverless API on Vercel
✅ Zero document storage (privacy)
✅ PDF generation of results
✅ Spanish UI for Peruvian MYPEs
✅ Mobile responsive

## Development Commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run astro    # Direct astro CLI access
```

## Troubleshooting

### "Cannot load pdf.js from CDN"
- Check internet connection
- Check if CDN is blocked (firewall, VPN, corporate network)
- Reload page

### "Error uploading image"
- Image file > 5MB (reduce size)
- Unsupported format (use JPG, PNG)
- Try different image file

### "API error from Gemini"
- Check GEMINI_API_KEY is correct
- Verify API quota in Google Cloud Console
- Check document isn't blocked by content filters

### "Vercel deployment fails"
- Ensure Node.js 20.x
- Check `npm run build` passes locally
- Verify environment variables in Project Settings

## Support

For issues with Gemini API: https://aistudio.google.com
For Astro docs: https://docs.astro.build
For Vercel docs: https://vercel.com/docs
"""
