# Frontend - Sinhas Track App

React/Vite application for employee management, ready for Vercel deployment.

## Quick Start

### Local Development
```bash
npm install
npm run dev
```

Open: http://localhost:5173

### Deployment on Vercel

1. **Set Root Directory**: `frontend`
2. **Build Command**: `npm run build`
3. **Output Directory**: `dist`
4. **Environment Variables** (in Vercel Settings):
   ```
   VITE_MONGODB_API_URL = https://your-backend.vercel.app/api
   VITE_WS_URL = https://your-backend.vercel.app
   VITE_ADMIN_EMAILS = admin@sinhas.ch
   VITE_GOOGLE_DRIVE_UPLOAD_URL = https://script.google.com/macros/s/YOUR_ID/exec
   ```
5. **Deploy** - Vercel handles everything!

## Features

✅ React 18 + TypeScript  
✅ Vite build tool  
✅ Tailwind CSS + shadcn/ui  
✅ Real-time WebSocket  
✅ Responsive design  
✅ Production optimized  

## Build

```bash
npm run build
```

Output: `dist/` folder ready for deployment

## Files

- `src/` - React components
- `public/` - Static assets
- `package.json` - Dependencies
- `vite.config.ts` - Build config
- `tailwind.config.ts` - Styling
- `vercel.json` - Vercel config
