# Vercel Deployment Guide - Sinhas Track

Complete guide to deploy both frontend and backend on Vercel.

## 📋 Prerequisites

- GitHub account (code hosting)
- Vercel account (free at https://vercel.com)
- MongoDB Atlas account (free tier available)
- GitHub repository with both folders: `frontend/` and `backend/`

---

## 🚀 Quick Summary

| Component | Platform | URL |
|-----------|----------|-----|
| **Frontend** | Vercel | https://sinhas-frontend.vercel.app |
| **Backend** | Vercel | https://sinhas-backend.vercel.app |
| **Database** | MongoDB Atlas | Cloud hosted |

---

## 📂 Project Structure Required

```
your-repo/
├── frontend/              ← React/Vite app
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   ├── vercel.json       ✨ Required
│   └── .env.example
│
├── backend/               ← Python Flask app
│   ├── app.py
│   ├── requirements.txt
│   ├── vercel.json       ✨ Required
│   └── .env.example
│
└── README.md
```

---

## Step 1: Setup MongoDB Atlas (5 minutes)

### 1.1 Create Cluster
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up or login
3. Create free M0 cluster
4. Choose AWS region close to you
5. Wait for cluster to initialize (~5 min)

### 1.2 Create User
1. Go to Database Access
2. Click "Add New Database User"
3. Username: `workforce-admin`
4. Password: Generate strong password
5. Add user

### 1.3 Whitelist IPs
1. Go to Network Access
2. Click "Add IP Address"
3. Add: `0.0.0.0/0` (allow all - for Vercel)
4. Confirm

### 1.4 Get Connection String
1. Click "Connect"
2. Select "Drivers"
3. Copy connection string
4. Replace `<username>` and `<password>`
5. Append `/workforce-vision` to path

**Example:**
```
mongodb+srv://workforce-admin:YOUR_PASSWORD@cluster-name.mongodb.net/workforce-vision?retryWrites=true&w=majority
```

---

## Step 2: Deploy Backend on Vercel (10 minutes)

### 2.1 Push Code to GitHub
```bash
git add .
git commit -m "Ready for Vercel deployment"
git push origin main
```

### 2.2 Import Backend Project
1. Go to https://vercel.com/dashboard
2. Click "New Project"
3. Click "Import Git Repository"
4. Select your repo
5. Click "Import"

### 2.3 Configure Root Directory
1. Under "Project Settings"
2. Set "Root Directory" to: `backend`
3. Click "Save"

### 2.4 Set Environment Variables
1. Go to Settings → Environment Variables
2. Add these variables:

```
MONGODB_URI
Value: mongodb+srv://workforce-admin:PASSWORD@cluster.mongodb.net/workforce-vision?retryWrites=true&w=majority

GOOGLE_DRIVE_FOLDER_ID
Value: 1i5eJ2S3LVEsnEYI8gpljk-E0eoq6rCSb

ADMIN_EMAILS
Value: admin@sinhas.ch

FLASK_ENV
Value: production
```

3. Click "Save"

### 2.5 Deploy
1. Click "Deploy"
2. Wait for build to complete (~2-3 minutes)
3. Note your backend URL: `https://sinhas-backend.vercel.app`

### 2.6 Test Backend
```bash
curl https://sinhas-backend.vercel.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-06-04T..."
}
```

---

## Step 3: Deploy Frontend on Vercel (10 minutes)

### 3.1 Import Frontend Project
1. Go to https://vercel.com/dashboard
2. Click "New Project"
3. Click "Import Git Repository"
4. Select your repo
5. Click "Import"

### 3.2 Configure Root Directory
1. Under "Project Settings"
2. Set "Root Directory" to: `frontend`
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Click "Save"

### 3.3 Set Environment Variables
1. Go to Settings → Environment Variables
2. Add these variables:

```
VITE_MONGODB_API_URL
Value: https://sinhas-backend.vercel.app/api

VITE_WS_URL
Value: https://sinhas-backend.vercel.app

VITE_GOOGLE_DRIVE_UPLOAD_URL
Value: https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec

VITE_ADMIN_EMAILS
Value: admin@sinhas.ch
```

3. Click "Save"

### 3.4 Deploy
1. Click "Deploy"
2. Wait for build (~2-3 minutes)
3. Note your frontend URL: `https://sinhas-frontend.vercel.app`

---

## Step 4: Connect Frontend to Backend

### Update Frontend Environment
The frontend should automatically use environment variables from Vercel.

To verify:
1. Open browser DevTools (F12)
2. Check Network tab
3. API calls should go to `https://sinhas-backend.vercel.app/api`

---

## 🧪 Test Everything

### Backend Tests
```bash
# Health check
curl https://sinhas-backend.vercel.app/api/health

# Create profile
curl -X POST https://sinhas-backend.vercel.app/api/profiles \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "fullName": "Test User",
    "employeeId": "EMP001"
  }'

# List profiles
curl https://sinhas-backend.vercel.app/api/profiles
```

### Frontend Tests
1. Open https://sinhas-frontend.vercel.app
2. Check browser console (F12 → Console)
3. No errors should appear
4. Navigate through the app
5. Data should appear from API

---

## 🔄 Automatic Deployments

Both frontend and backend now:
- ✅ Auto-deploy on GitHub push
- ✅ Have SSL/HTTPS enabled
- ✅ Are globally distributed on CDN
- ✅ Scale automatically

### To Deploy Updates:
```bash
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically deploys!
```

---

## 📊 Environment Variables Reference

### Backend (Vercel Settings)
| Variable | Value | Source |
|----------|-------|--------|
| `MONGODB_URI` | Connection string | MongoDB Atlas |
| `GOOGLE_DRIVE_FOLDER_ID` | Folder ID | Google Drive |
| `ADMIN_EMAILS` | admin@sinhas.ch | Your choice |
| `FLASK_ENV` | production | Fixed |

### Frontend (Vercel Settings)
| Variable | Value | Source |
|----------|-------|--------|
| `VITE_MONGODB_API_URL` | Backend URL + /api | Vercel backend |
| `VITE_WS_URL` | Backend URL | Vercel backend |
| `VITE_GOOGLE_DRIVE_UPLOAD_URL` | Google Apps Script URL | Google |
| `VITE_ADMIN_EMAILS` | admin@sinhas.ch | Your choice |

---

## ⚠️ Troubleshooting

### Backend Won't Deploy
```
Error: ModuleNotFoundError
```
**Solution**: Ensure `requirements.txt` is in backend folder

### Frontend Shows Blank Page
```
GET https://... net::ERR_CONNECTION_REFUSED
```
**Solution**: Check `VITE_MONGODB_API_URL` in environment variables

### API Returns 404
```
POST /api/profiles 404
```
**Solution**: Verify backend deployed correctly, test `/api/health`

### MongoDB Connection Timeout
```
Error: connection timed out
```
**Solution**: 
1. Verify IP whitelist (0.0.0.0/0) in MongoDB Atlas
2. Check MONGODB_URI syntax
3. Verify username/password

### CORS Errors
```
Access-Control-Allow-Origin
```
**Solution**: Backend has CORS enabled for Vercel domains

---

## 🔐 Security Checklist

- ✅ HTTPS/SSL enabled (Vercel)
- ✅ Environment variables not in code
- ✅ MongoDB password protected
- ✅ IP whitelist configured
- ✅ CORS properly configured
- ✅ Audit logging enabled

---

## 📈 Monitoring

### View Logs
1. Vercel Dashboard
2. Select project
3. Deployments tab
4. Click deployment
5. View logs in real-time

### Monitor Performance
1. Settings → Analytics
2. View request metrics
3. Check response times

### Database Monitoring
1. MongoDB Atlas Dashboard
2. View connection metrics
3. Monitor storage usage

---

## 🎯 Next Steps

1. ✅ Deploy backend
2. ✅ Deploy frontend
3. [ ] Create admin account in Firebase
4. [ ] Invite team members
5. [ ] Test full workflow
6. [ ] Monitor performance

---

## 💡 Pro Tips

1. **Custom Domain**: Add custom domain in Vercel Settings
2. **SSL Certificate**: Automatic (Vercel)
3. **Performance**: Vercel CDN optimizes delivery
4. **Scaling**: Automatic scaling included
5. **CI/CD**: GitHub integration with auto-deploy

---

## 📞 Support

### Vercel Issues
- Dashboard: https://vercel.com
- Docs: https://vercel.com/docs
- Status: https://vercel.statuspage.io

### MongoDB Issues
- Dashboard: https://cloud.mongodb.com
- Docs: https://docs.mongodb.com
- Forum: https://community.mongodb.com

### Your App Issues
- Check backend logs
- Check frontend console
- Verify environment variables
- Test API endpoints manually

---

## Estimated Timeline

| Task | Time |
|------|------|
| MongoDB setup | 10 min |
| Backend deploy | 10 min |
| Frontend deploy | 10 min |
| Testing | 10 min |
| **Total** | **~40 min** |

---

**You're all set! Your app is now live on Vercel! 🚀**

Share these URLs:
- Frontend: https://sinhas-frontend.vercel.app
- Backend API: https://sinhas-backend.vercel.app/api

Updates automatically deploy on GitHub push! 📦
