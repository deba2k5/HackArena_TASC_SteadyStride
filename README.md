# Sinhas Track - Deployment Ready

Complete monorepo with independent frontend and backend services ready for Vercel deployment.

## 📁 Project Structure

```
sinhastracker/
├── frontend/                  ← React/Vite SPA
│   ├── src/                   React components & pages
│   ├── public/                Static assets
│   ├── package.json
│   ├── vite.config.ts
│   ├── vercel.json           ✨ Vercel config
│   ├── .env.example
│   ├── build.sh
│   └── README.md
│
├── backend/                   ← Python/Flask API
│   ├── app.py                 Flask application
│   ├── requirements.txt        Python dependencies
│   ├── vercel.json           ✨ Vercel config
│   ├── .env.example
│   └── README.md
│
├── VERCEL_DEPLOYMENT_GUIDE.md ← Start here! 📖
├── README.md
└── .gitignore
```

## 🚀 Quick Start

### 1. Prerequisites
- GitHub account (free)
- Vercel account (free)
- MongoDB Atlas (free tier)

### 2. Setup in 3 Steps

**Step 1: MongoDB Atlas** (5 min)
```
1. Create cluster at mongodb.com/cloud/atlas
2. Create user: workforce-admin
3. Whitelist 0.0.0.0/0
4. Copy connection string
```

**Step 2: Deploy Backend** (10 min)
```
1. Go to vercel.com
2. Import repo
3. Set Root Directory: backend
4. Add MONGODB_URI env var
5. Deploy!
```

**Step 3: Deploy Frontend** (10 min) ok
```
1. New Project on vercel.com
2. Import repo
3. Set Root Directory: frontend
4. Add VITE_MONGODB_API_URL (backend URL)
5. Deploy!
```

## 📖 Complete Deployment Guide

See [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) for detailed step-by-step instructions.

## 🏗️ Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + shadcn/ui
- **Communication**: REST API + WebSocket

### Backend
- **Framework**: Python Flask 3.0
- **Database**: MongoDB Atlas
- **APIs**: RESTful endpoints
- **Real-time**: Socket.IO (WebSocket)

### Database
- **Platform**: MongoDB Atlas
- **Collections**: profiles, sessions, audit_logs
- **Indexing**: Automatic on deploy

## 🌐 Deployment Targets

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel Static | https://sinhas-frontend.vercel.app |
| Backend | Vercel Serverless | https://sinhas-backend.vercel.app |
| Database | MongoDB Atlas | Cloud hosted |

## 📊 Endpoints

### Backend API
```
GET    /api/profiles              List all profiles
GET    /api/profiles/:email       Get profile
POST   /api/profiles              Create/Update
DELETE /api/profiles/:email       Delete

GET    /api/sessions              List sessions
POST   /api/sessions              Clock in
PATCH  /api/sessions/:id          Update session
POST   /api/sessions/:id/breaks   Add break
POST   /api/sessions/:id/locations  Log location

GET    /api/audit                 Audit logs
GET    /api/health                Health check
```

## 🔧 Environment Variables

### Backend
```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/workforce-vision
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
ADMIN_EMAILS=admin@sinhas.ch
FLASK_ENV=production
```

### Frontend
```
VITE_MONGODB_API_URL=https://your-backend.vercel.app/api
VITE_WS_URL=https://your-backend.vercel.app
VITE_GOOGLE_DRIVE_UPLOAD_URL=https://script.google.com/macros/s/YOUR_ID/exec
VITE_ADMIN_EMAILS=admin@sinhas.ch
```

## 🚢 Deployment

### Automatic
- Push to GitHub
- Vercel auto-deploys
- No manual action needed

### Manual CLI
```bash
npm i -g vercel
vercel --prod
```

## ✅ Verification Checklist

- [ ] MongoDB cluster created
- [ ] Backend deployed to Vercel
- [ ] Backend health check works
- [ ] Frontend deployed to Vercel
- [ ] Frontend loads without errors
- [ ] API calls working
- [ ] WebSocket connecting
- [ ] Audit logs recording

## 📚 Documentation

- [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) - Step-by-step deployment
- [frontend/README.md](./frontend/README.md) - Frontend setup
- [backend/README.md](./backend/README.md) - Backend setup

## 🆘 Troubleshooting

### Backend won't deploy
- Check `backend/requirements.txt` exists
- Verify Python version ≥ 3.8
- Check build logs in Vercel

### Frontend shows errors
- Check environment variables set
- Verify `VITE_MONGODB_API_URL` is correct
- Check browser console for errors

### API connection failing
- Verify backend is running: `/api/health`
- Check CORS is enabled
- Verify environment variables

### Database connection error
- Check MONGODB_URI is correct
- Verify IP whitelist includes 0.0.0.0/0
- Check username/password

## 📈 Performance

- ✅ Global CDN
- ✅ Auto-scaling
- ✅ 99.95% uptime
- ✅ SSL/HTTPS
- ✅ Zero configuration

## 🔐 Security

- ✅ HTTPS only
- ✅ Environment variables
- ✅ CORS configured
- ✅ Audit logging
- ✅ MongoDB authentication

## 🎯 Next Steps

1. Read [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)
2. Setup MongoDB Atlas
3. Deploy backend
4. Deploy frontend
5. Test integration
6. Monitor in production

## 📞 Support

- **Frontend Issues**: See frontend/README.md
- **Backend Issues**: See backend/README.md
- **Deployment Issues**: See VERCEL_DEPLOYMENT_GUIDE.md
- **Vercel Help**: vercel.com/docs
- **MongoDB Help**: docs.mongodb.com

---

**Ready to deploy? Start with [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)** 🚀
