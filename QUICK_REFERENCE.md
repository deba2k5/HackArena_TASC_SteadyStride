# ⚡ QUICK REFERENCE - Deploy in 30 Minutes

Super quick reference for deploying to Vercel. No fluff, just steps!

## 🏃 TL;DR Setup

### 1. MongoDB (5 min)
```
1. Sign up: mongodb.com/cloud/atlas
2. Create M0 cluster
3. Create user: workforce-admin / strong-password
4. Whitelist: 0.0.0.0/0
5. Copy connection string
```

### 2. Backend Deploy (10 min)
```
1. vercel.com → "Add New" → "Project"
2. Select repo → Root: backend
3. Environment variables:
   MONGODB_URI=[your-connection-string]
   GOOGLE_DRIVE_FOLDER_ID=1i5eJ2S3LVEsnEYI8gpljk-E0eoq6rCSb
   ADMIN_EMAILS=admin@sinhas.ch
   FLASK_ENV=production
4. Deploy!
5. Copy URL: https://your-backend.vercel.app
```

### 3. Frontend Deploy (10 min)
```
1. vercel.com → "Add New" → "Project"
2. Select repo → Root: frontend
3. Environment variables:
   VITE_MONGODB_API_URL=https://your-backend.vercel.app/api
   VITE_WS_URL=https://your-backend.vercel.app
   VITE_GOOGLE_DRIVE_UPLOAD_URL=https://script.google.com/macros/s/YOUR_ID/exec
   VITE_ADMIN_EMAILS=admin@sinhas.ch
4. Deploy!
5. Done! https://your-frontend.vercel.app
```

## ✅ Quick Checklist

- [ ] Repo on GitHub
- [ ] Both folders exist: frontend/ and backend/
- [ ] MongoDB cluster created
- [ ] Backend env vars set
- [ ] Frontend env vars set
- [ ] Both deployed
- [ ] /api/health works
- [ ] Frontend loads

## 🔗 Important URLs

```
Frontend: https://sinhas-frontend.vercel.app
Backend:  https://sinhas-backend.vercel.app
API:      https://sinhas-backend.vercel.app/api
Health:   https://sinhas-backend.vercel.app/api/health
```

## 🧪 Quick Test

```bash
# Test backend
curl https://your-backend.vercel.app/api/health

# Test frontend
open https://your-frontend.vercel.app
```

## 📁 Files Already Created

```
✅ backend/vercel.json
✅ backend/app.py
✅ backend/requirements.txt
✅ frontend/vercel.json
✅ VERCEL_DEPLOYMENT_GUIDE.md (full details)
```

## ⚠️ Common Issues

| Issue | Fix |
|-------|-----|
| Backend won't deploy | Check requirements.txt in backend/ |
| API 404 | Verify VITE_MONGODB_API_URL correct |
| No data | Check MongoDB connection |
| CORS error | Already configured, check console |

## 📞 Need Help?

- Stuck? → See VERCEL_DEPLOYMENT_GUIDE.md
- Setup questions? → See SETUP_INSTRUCTIONS.md
- All files? → See README.md

---

**That's it! Ready?** Start with Backend deployment 🚀
