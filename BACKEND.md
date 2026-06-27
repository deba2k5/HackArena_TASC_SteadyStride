# Backend Setup — Sinhas Track

The frontend is fully built. To enable real persistence (instead of the local-storage fallback)
you need to host two tiny services and point the app at them via `.env` variables:

```
VITE_MONGODB_API_URL=https://your-api.example.com/api
VITE_GOOGLE_DRIVE_UPLOAD_URL=https://script.google.com/macros/s/XXXX/exec
VITE_ADMIN_EMAILS=admin@sinhas.ch
```

Add these in **Project Settings → Variables** (or directly in `.env`).
Without them, the app uses an in-browser mock so you can still demo every screen.

---

## 1. MongoDB REST API

Spin up a small Node/Express server with the [MongoDB driver](https://www.mongodb.com/docs/drivers/node/current/).
Suggested free hosts: Render, Railway, Fly.io. MongoDB Atlas free tier works for the DB itself.

### Required endpoints

All bodies/responses are JSON. CORS must allow your Lovable preview & production domains.

| Method | Path | Purpose |
| -- | -- | -- |
| `GET`  | `/profiles` | List all employee profiles |
| `GET`  | `/profiles/:email` | Fetch one profile (404 if missing) |
| `POST` | `/profiles` | Upsert by `email` |
| `GET`  | `/sessions?email=&status=` | List sessions (optional filters) |
| `POST` | `/sessions` | Create a new session (clock-in) |
| `PATCH`| `/sessions/:id` | Patch any session field (breaks/locations/clockOut/status/…) |
| `GET`  | `/audit` | List audit log entries (newest first) |
| `POST` | `/audit` | Append an audit log entry |

### Suggested schemas (Mongoose)

```js
const Profile = new Schema({
  employeeId: String, fullName: String, email: { type: String, unique: true },
  mobile: String, department: String,
  employeeType: { type: String, enum: ["permanent", "contractual"] },
  active: { type: Boolean, default: true }, createdAt: String,
});

const Session = new Schema({
  employeeId: String, email: String, fullName: String, date: String,
  clockIn: String, clockOut: String, workType: String, description: String,
  breaks: [{ id: String, type: String, start: String, end: String }],
  locations: [{ lat: Number, lng: Number, accuracy: Number, at: String, outsideGeofence: Boolean }],
  attachments: [{ name: String, url: String, type: String }],
  totalWorkMs: Number, totalBreakMs: Number,
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  adminComment: String, reviewedBy: String, reviewedAt: String,
});

const AuditLog = new Schema({ actor: String, action: String, target: String, at: String, meta: Object });
```

### Minimal Express skeleton

```js
import express from "express";
import cors from "cors";
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGODB_URI);
const app = express(); app.use(cors()); app.use(express.json({ limit: "2mb" }));

app.get("/api/profiles", async (_, res) => res.json(await Profile.find()));
app.get("/api/profiles/:email", async (req, res) => {
  const p = await Profile.findOne({ email: req.params.email });
  return p ? res.json(p) : res.status(404).end();
});
app.post("/api/profiles", async (req, res) =>
  res.json(await Profile.findOneAndUpdate({ email: req.body.email }, req.body, { upsert: true, new: true })));

app.get("/api/sessions", async (req, res) => res.json(await Session.find(req.query).sort({ clockIn: -1 })));
app.post("/api/sessions", async (req, res) => res.json(await Session.create(req.body)));
app.patch("/api/sessions/:id", async (req, res) =>
  res.json(await Session.findByIdAndUpdate(req.params.id, req.body, { new: true })));

app.get("/api/audit", async (_, res) => res.json(await AuditLog.find().sort({ at: -1 }).limit(500)));
app.post("/api/audit", async (req, res) => res.json(await AuditLog.create(req.body)));

app.listen(process.env.PORT || 8080);
```

> **Security**: in production, verify the Firebase ID token on every request
> (`firebase-admin` → `auth().verifyIdToken(token)`), enforce that
> the email in the token matches the email in the body for employee actions,
> and that the email is in your admin list for admin-only routes.

---

## 2. Google Drive uploads

The easiest zero-server option is a **Google Apps Script Web App** bound to a Drive folder:

1. Open <https://script.google.com/> → New project.
2. Paste:

```js
function doPost(e) {
  const folder = DriveApp.getFolderById("YOUR_FOLDER_ID");
  const blob = e.parameter.file
    ? Utilities.newBlob(Utilities.base64Decode(e.parameter.file), e.parameter.type, e.parameter.filename)
    : e.postData.contents;
  // For multipart/form-data uploads:
  const fileBlob = e.files && e.files.file;
  const file = folder.createFile(fileBlob || blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return ContentService
    .createTextOutput(JSON.stringify({ url: file.getUrl(), id: file.getId() }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

3. **Deploy → New deployment → Web app** → Execute as *Me*, Access *Anyone*.
4. Copy the `/exec` URL into `VITE_GOOGLE_DRIVE_UPLOAD_URL`.

---

## 3. Firebase accounts

You said you'll create the accounts yourself. In the Firebase Console:

1. Authentication → **Sign-in method** → Email/Password → enable.
2. Authentication → Users → **Add user**:
   * `employee1@sinhas.ch` (any password)
   * `admin@sinhas.ch` (any password)
3. Sign in with each at the Login page. The first time an account signs in,
   the app bootstraps an employee profile in MongoDB which the user (or admin) can edit.

Admin emails are determined by `VITE_ADMIN_EMAILS` (comma-separated, defaults to `admin@sinhas.ch`).
