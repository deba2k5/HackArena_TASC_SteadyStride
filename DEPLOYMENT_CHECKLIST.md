# Pre-Deployment Checklist

## ✅ Before You Deploy

### GitHub Setup
- [ ] Code committed to GitHub
- [ ] Repository is public or private (your choice)
- [ ] Both `frontend/` and `backend/` folders are present
- [ ] .gitignore is configured

### MongoDB Atlas Setup
- [ ] Account created
- [ ] Cluster initialized (M0 free tier)
- [ ] Database user created (workforce-admin)
- [ ] IP whitelist includes 0.0.0.0/0
- [ ] Connection string copied and verified

### Backend (Python/Flask)
- [ ] `app.py` exists in backend/
- [ ] `requirements.txt` has all dependencies
- [ ] `vercel.json` configured
- [ ] `.env.example` has all variables
- [ ] MongoDB connection tested locally (optional)

### Frontend (React/Vite)
- [ ] `package.json` exists in frontend/
- [ ] `vite.config.ts` configured
- [ ] `vercel.json` configured
- [ ] `.env.example` has all variables
- [ ] Build succeeds: `npm run build`

---

## 🚀 Deployment Steps

### Step 1: Deploy Backend (10 min)

**Vercel Dashboard:**
- [ ] Go to vercel.com
- [ ] Click "Add New" → "Project"
- [ ] Import from GitHub
- [ ] Set Root Directory: `backend`
- [ ] Add environment variables:
  - [ ] MONGODB_URI
  - [ ] GOOGLE_DRIVE_FOLDER_ID
  - [ ] ADMIN_EMAILS
  - [ ] FLASK_ENV=production
- [ ] Click "Deploy"
- [ ] Wait for deployment to complete
- [ ] Copy backend URL: `https://...vercel.app`

**Verification:**
- [ ] Backend health check works: `curl https://...vercel.app/api/health`
- [ ] MongoDB connection successful
- [ ] No build errors in logs

### Step 2: Deploy Frontend (10 min)

**Vercel Dashboard:**
- [ ] Click "Add New" → "Project"
- [ ] Import from GitHub (same repo)
- [ ] Set Root Directory: `frontend`
- [ ] Build Command: `npm run build`
- [ ] Output Directory: `dist`
- [ ] Add environment variables:
  - [ ] VITE_MONGODB_API_URL=`https://backend.vercel.app/api`
  - [ ] VITE_WS_URL=`https://backend.vercel.app`
  - [ ] VITE_GOOGLE_DRIVE_UPLOAD_URL
  - [ ] VITE_ADMIN_EMAILS
- [ ] Click "Deploy"
- [ ] Wait for deployment to complete
- [ ] Copy frontend URL: `https://...vercel.app`

**Verification:**
- [ ] Frontend loads without errors
- [ ] No 404 errors in Network tab
- [ ] API calls go to backend URL
- [ ] Console shows no errors

---

## 🧪 Testing After Deployment

### Backend Tests
```bash
# Test 1: Health Check
curl https://your-backend.vercel.app/api/health
# Expected: {"status": "healthy", ...}

# Test 2: List Profiles (should be empty initially)
curl https://your-backend.vercel.app/api/profiles
# Expected: []

# Test 3: Create Profile
curl -X POST https://your-backend.vercel.app/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "fullName": "Test User"}'
# Expected: Profile object

# Test 4: Get Profile
curl https://your-backend.vercel.app/api/profiles/test@test.com
# Expected: Profile object
```

### Frontend Tests
- [ ] Open https://your-frontend.vercel.app
- [ ] Check browser DevTools (F12)
- [ ] Console tab - no red errors
- [ ] Network tab - verify API calls go to backend
- [ ] Try logging in
- [ ] Navigate through pages
- [ ] Try creating/updating data

### Integration Tests
- [ ] Create profile on frontend
- [ ] See it appear in database
- [ ] Verify audit log entries
- [ ] Check real-time updates
- [ ] Test file upload functionality

---

## 🔐 Security Verification

- [ ] HTTPS enabled (automatic on Vercel)
- [ ] Environment variables not exposed in frontend code
- [ ] MongoDB password protected
- [ ] CORS configured properly
- [ ] No API keys in repository
- [ ] .env files not committed to Git

---

## 📊 Performance Check

- [ ] Frontend loads in < 3 seconds
- [ ] API responds in < 500ms
- [ ] No console errors
- [ ] No console warnings
- [ ] Lighthouse score > 80 (run in DevTools)

---

## 🎯 Production Verification

- [ ] Backend `/api/health` returns 200
- [ ] Frontend loads from CDN
- [ ] Database queries work
- [ ] Real-time updates active
- [ ] Audit logging working
- [ ] Error handling proper

---

## 📈 Monitoring Setup

- [ ] Vercel dashboard open
- [ ] Monitor deployments
- [ ] Check logs for errors
- [ ] Set up MongoDB Atlas alerts (optional)
- [ ] Configure email notifications

---

## ✨ Optional Enhancements

- [ ] Add custom domain (Vercel)
- [ ] Add team members (Vercel)
- [ ] Enable branch previews
- [ ] Set up Slack notifications
- [ ] Configure analytics
- [ ] Add rate limiting

---

## 🆘 If Something Goes Wrong

### Backend won't deploy
1. Check `requirements.txt` is in backend/
2. View build logs in Vercel
3. Verify Python syntax
4. Check for missing dependencies

### Frontend won't deploy
1. Check `package.json` is in frontend/
2. Verify `npm run build` works locally
3. Check environment variables set
4. View build logs

### API calls fail
1. Check backend is running: `curl https://...vercel.app/api/health`
2. Verify `VITE_MONGODB_API_URL` is correct
3. Check browser Network tab
4. Check CORS errors in console

### Database connection fails
1. Verify MONGODB_URI is correct
2. Check IP whitelist (0.0.0.0/0)
3. Verify username/password
4. Test locally first

---

## ✅ Final Verification

- [ ] Both services deployed successfully
- [ ] All tests passing
- [ ] No console errors
- [ ] Production data working
- [ ] Team can access
- [ ] Monitoring active
- [ ] Documentation updated

---

## 📝 Notes for Team

### URLs to Share
- Frontend: `https://your-frontend.vercel.app`
- Backend API: `https://your-backend.vercel.app/api`
- Database: MongoDB Atlas (access via link)

### Important Credentials
- MongoDB user: `workforce-admin`
- Environment variables: See Vercel Settings
- Firebase admin: See backend .env

### First Time Setup for Team
1. Open frontend URL
2. Create account
3. Login
4. Start using!

---

**Deployment complete! 🎉**

Monitor your apps in real-time on https://vercel.com

Good luck! 🚀
