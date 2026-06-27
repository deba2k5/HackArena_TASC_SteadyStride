# Touchless Invoice Agent (TIA) — Enterprise AI Platform

## Architecture

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + LayoutLMv3
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS + shadcn/ui
- **AI Model**: microsoft/layoutlmv3-base (ONLY)
- **OCR**: Tesseract OCR + OpenCV preprocessing
- **Database**: PostgreSQL 15
- **Cache**: Redis
- **Auth**: JWT + RBAC

## Quick Start

```bash
# Clone and setup
git clone <repo>
cd tia-platform

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev

# Docker (full stack)
docker-compose up --build
```

## Environment Variables

See `.env.example` in each directory.
