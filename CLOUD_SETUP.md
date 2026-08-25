# Lovable Cloud Setup (AI + Database + Storage)

This file is only for setting up **Lovable Cloud** so this project runs correctly with:

- AI features
- Database tables
- Storage buckets (face images)

---

## 1) Required Cloud services for this project

Enable/confirm these in Lovable Cloud:

1. **Cloud backend enabled**
2. **Database enabled**
3. **Storage enabled**
4. **Auth enabled**
5. **Lovable AI enabled**

---

## 2) Environment variables required by frontend

The frontend expects these variables:

```env
VITE_SUPABASE_URL=YOUR_LOVABLE_CLOUD_PROJECT_URL
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_LOVABLE_CLOUD_PUBLISHABLE_KEY
```

This project currently points to backend ref:

- `eiahucigcvsnuvviajqt`

If you use a different Lovable Cloud project, update both env vars accordingly.

---

## 3) Database setup checklist

For this app to function (attendance + face sample admin), confirm these tables exist and are accessible with correct policies:

- `profiles`
- `attendance_records`
- `face_descriptors`
- any gate/notification/email tables used by your enabled features

Also verify:

- Row-level security/policies allow intended read/write paths
- Admin actions can insert/update/delete where needed

---

## 4) Storage setup checklist

Create/verify storage bucket:

- **Bucket name:** `face-images`

Policies must allow the operations used in app flows:

- upload face images
- read face images
- delete/rewrite during cleanup or re-import

---

## 5) Lovable AI setup checklist

To run AI-backed features reliably:

1. Enable **Lovable AI** for the project.
2. Ensure `LOVABLE_API_KEY` exists in project secrets (auto-managed by Lovable).
3. Keep AI calls on server/edge functions only (never expose private key in frontend).
4. Surface AI errors in UI (especially 429 rate-limit and 402 credits).

---

## 6) Edge function readiness

This repo includes cloud functions under:

- `supabase/functions/*`

Deploy the ones you use in production and verify each has:

- correct secrets
- CORS support for browser calls
- expected table and bucket permissions

---

## 7) Minimum validation after setup

After Cloud setup, test this flow:

1. Login/signup works.
2. Admin page loads student data.
3. Face sample upload stores files in `face-images`.
4. ZIP export/import in Face Samples works.
5. Attendance/gate writes records to DB.
6. Any AI feature returns valid response (not auth/credit/rate-limit config errors).

---

## 8) Most common setup failures

### Data not loading

- wrong `VITE_SUPABASE_URL` / key
- missing table policies

### Face image upload/import failures

- `face-images` bucket missing
- storage policy blocks write/read/delete

### AI not working

- Lovable AI not enabled
- missing/invalid `LOVABLE_API_KEY`
- calling AI from client instead of server route/function

---

## 9) Security baseline

- Keep private keys only in Lovable Cloud secrets.
- Do not hardcode private secrets in source files.
- Use least-privilege policies for DB and storage.
- Keep publishable/anon key only in `VITE_` env vars.
