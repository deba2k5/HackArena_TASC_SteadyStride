# Backend - Sinhas Track API

Python/Flask REST API for employee management, ready for Vercel deployment.

## Quick Start

### Local Development
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

API runs on: http://localhost:5000

### Deployment on Vercel

1. **Set Root Directory**: `backend`
2. **Environment Variables** (in Vercel Settings):
   ```
   MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/database
   FLASK_ENV = production
   ADMIN_EMAILS = admin@sinhas.ch
   GOOGLE_DRIVE_FOLDER_ID = your-folder-id
   ```
3. **Deploy** - Vercel handles everything!

## API Endpoints

```
GET    /api/profiles              List profiles
GET    /api/profiles/:email       Get profile
POST   /api/profiles              Create/Update
DELETE /api/profiles/:email       Delete

GET    /api/sessions              List sessions
POST   /api/sessions              Create session
PATCH  /api/sessions/:id          Update
POST   /api/sessions/:id/breaks   Add break
POST   /api/sessions/:id/locations  Add location

GET    /api/audit                 Audit logs
GET    /api/health                Health check
```

## Features

✅ MongoDB integration  
✅ REST API (12 endpoints)  
✅ Error handling  
✅ CORS enabled  
✅ Audit logging  
✅ Production ready  

## Files

- `app.py` - Flask application (555 lines)
- `requirements.txt` - Python dependencies
- `vercel.json` - Vercel configuration
- `Dockerfile` - Docker support
