# Setup Guide - Copy Files to Frontend/Backend Folders

After deploying to Vercel, follow these steps to have your code properly organized in two folders.

## 📋 What You Have

```
expensify-esque/         ← Current monorepo
├── src/                 ← Frontend code
├── public/              ← Frontend assets
├── package.json         ← Frontend deps
├── vite.config.ts       ← Frontend build
├── backend/             ← Backend code
│   ├── app.py
│   ├── requirements.txt
│   └── ...
└── ...
```

## 🎯 What You Need

```
frontend/                ← Vercel will use this
├── src/
├── public/
├── package.json
├── vercel.json          ✨ (already created)
└── ...

backend/                 ← Vercel will use this
├── app.py
├── requirements.txt
├── vercel.json          ✨ (already created)
└── ...
```

## 🔄 Migration Steps

### Option 1: Manual Copy (VS Code)

**Step 1: Copy Frontend Files**
1. Open VS Code file explorer
2. Select from `expensify-esque/`:
   - [ ] src/
   - [ ] public/
   - [ ] components.json
   - [ ] eslint.config.js
   - [ ] index.html
   - [ ] package.json
   - [ ] playwright.config.ts
   - [ ] postcss.config.js
   - [ ] tailwind.config.ts
   - [ ] tsconfig.app.json
   - [ ] tsconfig.json
   - [ ] tsconfig.node.json
   - [ ] vite.config.ts
   - [ ] vitest.config.ts

3. Copy to `frontend/`

**Step 2: Copy Backend Files**
1. Select from `expensify-esque/backend/`:
   - [ ] app.py
   - [ ] requirements.txt
   - [ ] Dockerfile
   - [ ] Procfile
   - [ ] README.md (optional)

2. Copy to `backend/`

### Option 2: Terminal Copy (Git Bash / PowerShell)

**Windows (PowerShell):**
```powershell
# Copy frontend files
Copy-Item "expensify-esque\src" "frontend\src" -Recurse
Copy-Item "expensify-esque\public" "frontend\public" -Recurse
Copy-Item "expensify-esque\*.json" "frontend\" -Include "package.json","tsconfig*.json","components.json"
Copy-Item "expensify-esque\*.ts" "frontend\" -Include "vite.config.ts","tailwind.config.ts","postcss.config.ts"
Copy-Item "expensify-esque\index.html" "frontend\"
Copy-Item "expensify-esque\eslint.config.js" "frontend\"

# Copy backend files
Copy-Item "expensify-esque\backend\app.py" "backend\"
Copy-Item "expensify-esque\backend\requirements.txt" "backend\"
Copy-Item "expensify-esque\backend\Dockerfile" "backend\"
Copy-Item "expensify-esque\backend\Procfile" "backend\"
```

**Linux/Mac (Bash):**
```bash
# Copy frontend
cp -r expensify-esque/src frontend/
cp -r expensify-esque/public frontend/
cp expensify-esque/*.json frontend/
cp expensify-esque/vite.config.ts frontend/
cp expensify-esque/tailwind.config.ts frontend/
cp expensify-esque/postcss.config.ts frontend/
cp expensify-esque/index.html frontend/
cp expensify-esque/eslint.config.js frontend/

# Copy backend
cp expensify-esque/backend/app.py backend/
cp expensify-esque/backend/requirements.txt backend/
cp expensify-esque/backend/Dockerfile backend/
cp expensify-esque/backend/Procfile backend/
```

## ✅ Verify Files

After copying, verify:

### Frontend
```bash
ls frontend/
# Should show:
# .env.example  build.sh  README.md  vercel.json
# src/  public/  index.html
# package.json  vite.config.ts  tsconfig.json  etc.
```

### Backend
```bash
ls backend/
# Should show:
# .env.example  app.py  README.md  vercel.json
# requirements.txt  Dockerfile  Procfile
```

## 🔧 Update package.json (Frontend)

Edit `frontend/package.json` and verify:

1. **Scripts section** should have:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
  "test": "vitest"
}
```

2. **Dependencies** should include socket.io-client:
```json
"dependencies": {
  "socket.io-client": "^4.7.2",
  ...
}
```

## 🚀 Ready for Deployment

Once files are copied:

1. **Commit to Git**
```bash
git add frontend/ backend/
git commit -m "Organize frontend and backend into separate folders"
git push origin main
```

2. **Deploy on Vercel** (if not already done)
- See VERCEL_DEPLOYMENT_GUIDE.md for steps

3. **Test**
- Frontend: https://your-frontend.vercel.app
- Backend: https://your-backend.vercel.app/api/health

## 📁 After Migration

You can optionally:

```bash
# Archive the old monorepo (optional)
mv expensify-esque/ expensify-esque.backup/

# Or delete it if confident
rm -rf expensify-esque/
```

## ⚠️ Important Notes

- **Don't commit node_modules**: Add to .gitignore
- **Don't commit .env**: Use .env.example as template
- **Environment variables**: Set in Vercel, not in .env
- **Secrets**: Never commit passwords/keys

## 🔄 Structure After Migration

```
sinhastracker/
├── frontend/              ✨ Deploy to Vercel
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vercel.json
│   └── .env.example
│
├── backend/               ✨ Deploy to Vercel
│   ├── app.py
│   ├── requirements.txt
│   ├── vercel.json
│   └── .env.example
│
├── README.md              (updated)
├── VERCEL_DEPLOYMENT_GUIDE.md
├── DEPLOYMENT_CHECKLIST.md
└── .gitignore

expensify-esque/          (old monorepo - can delete)
```

## ✨ Benefits

✅ **Clean structure**: Separate frontend and backend  
✅ **Independent deploys**: Update each independently  
✅ **Easier scaling**: Each service scales separately  
✅ **Better organization**: Clear separation of concerns  
✅ **Vercel ready**: Each folder deploys as own project  

## 🎯 Next Steps

1. [ ] Copy files from expensify-esque to frontend/ and backend/
2. [ ] Verify all files present
3. [ ] Update environment variables
4. [ ] Deploy to Vercel
5. [ ] Test integration
6. [ ] Archive/delete old folder

---

**Questions?** See README.md and VERCEL_DEPLOYMENT_GUIDE.md
