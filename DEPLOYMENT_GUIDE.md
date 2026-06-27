# 🚀 DEPLOYMENT GUIDE - VERCEL

Your app is READY TO DEPLOY! Follow these steps.

## 📋 Prerequisites

- Vercel account (vercel.com)
- GitHub account
- MongoDB Atlas account (for database)

---

## 🎯 BACKEND DEPLOYMENT (5 minutes)

### Step 1: Setup MongoDB (If not done)
1. Go to: https://www.mongodb.com/cloud/atlas
2. Create a free M0 cluster
3. Create a user
4. Copy connection string
5. Example: `mongodb+srv://user:pass@cluster.mongodb.net/database`

### Step 2: Deploy on Vercel
1. Open: https://vercel.com/dashboard
2. Click **"+ Add New"** → **"Project"**
3. Select your repository (sinhastracker)
4. **Root Directory**: Set to `backend`
5. Click **"Continue"**

### Step 3: Environment Variables
Click **"Environment Variables"** and add:

```
MONGODB_URI
mongodb+srv://username:password@cluster.mongodb.net/workforce-vision

FLASK_ENV
production

ADMIN_EMAILS
admin@sinhas.ch

GOOGLE_DRIVE_FOLDER_ID
1i5eJ2S3LVEsnEYI8gpljk-E0eoq6rCSb
```

6. Click **"Deploy"**
7. ⏳ Wait 2-3 minutes for build
8. Copy your Backend URL: `https://sinhas-backend-xxx.vercel.app`

### Verify Backend Works
```bash
curl https://sinhas-backend-xxx.vercel.app/api/health
```

You should get: `{"status": "healthy", "timestamp": "..."}`

---

## 🎨 FRONTEND DEPLOYMENT (5 minutes)

### Step 1: Deploy on Vercel
1. Go to: https://vercel.com/dashboard
2. Click **"+ Add New"** → **"Project"**
3. Select your repository
4. **Root Directory**: Set to `frontend`
5. **Build Command**: `npm run build`
6. **Output Directory**: `dist`
7. Click **"Continue"**

### Step 2: Environment Variables
Click **"Environment Variables"** and add:

```
VITE_MONGODB_API_URL
https://sinhas-backend-xxx.vercel.app/api

VITE_WS_URL
https://sinhas-backend-xxx.vercel.app

VITE_ADMIN_EMAILS
admin@sinhas.ch

VITE_GOOGLE_DRIVE_UPLOAD_URL
https://script.google.com/macros/s/YOUR_ID/exec
```

Replace `sinhas-backend-xxx` with your actual backend URL!

8. Click **"Deploy"**
9. ⏳ Wait 3-4 minutes
10. Copy your Frontend URL: `https://sinhas-frontend-xxx.vercel.app`

### Verify Frontend Works
1. Open: `https://sinhas-frontend-xxx.vercel.app`
2. Should load without errors
3. Check browser console (F12) - no red errors

---

## ✅ TESTING

### Backend Tests
```bash
# Health check
curl https://your-backend-url/api/health

# Create profile
curl -X POST https://your-backend-url/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "fullName": "Test"}'

# List profiles
curl https://your-backend-url/api/profiles
```

### Frontend Tests
1. Open frontend URL
2. Check DevTools (F12)
3. Console should be empty (no errors)
4. Network tab should show API calls to backend
5. Test login/navigation

---

## 🔄 UPDATE & REDEPLOY

To update your app:

```bash
cd sinhastracker
git add .
git commit -m "Your changes"
git push origin main
```

Vercel automatically redeploys! ✨

---

## 📊 Your Live URLs

```
Frontend: https://sinhas-frontend-xxx.vercel.app
Backend:  https://sinhas-backend-xxx.vercel.app
API:      https://sinhas-backend-xxx.vercel.app/api
Health:   https://sinhas-backend-xxx.vercel.app/api/health
```

---

## 🆘 TROUBLESHOOTING

### Backend Build Fails
- Check `requirements.txt` is in backend folder ✓
- Check `app.py` exists ✓
- View build logs in Vercel dashboard

### Frontend Build Fails  
- Check `package.json` is in frontend folder ✓
- Check `npm run build` works locally
- View build logs in Vercel

### API Returns 404
- Verify backend URL is correct
- Test: `/api/health` endpoint
- Check environment variables

### MongoDB Connection Error
- Verify MONGODB_URI is correct
- Check IP whitelist in MongoDB Atlas
- Should be: `0.0.0.0/0`

### CORS Errors
- Already configured in backend
- Check frontend env vars
- Verify backend URL in VITE_MONGODB_API_URL

---

## ✨ You're Done! 🎉

Your app is now live on:
- **Frontend**: https://sinhas-frontend-xxx.vercel.app
- **Backend**: https://sinhas-backend-xxx.vercel.app

Share the frontend URL with your team!

---

**Need help?** Check the README.md files in frontend/ and backend/ folders.
