# Cinemai Production SaaS Starter

حزمة كاملة أقرب للإنتاج الفعلي لمنصة مشاهدة بطابع Netflix، مبنية لتكون **جاهزة للتشغيل على Docker / VPS**.

## ما الذي يحتويه المشروع؟
- واجهة Netflix-style
- وضع ليلي وفاتح
- 3 لغات: العربية / الإنجليزية / الفرنسية
- تسجيل حساب وتسجيل دخول JWT
- ملفات شخصية Profiles
- Continue Watching
- Favorites / My List
- لوحة Admin لإضافة عناصر المكتبة وسيرفرات التشغيل
- PostgreSQL
- Nginx reverse proxy
- تشغيل HLS عبر hls.js
- Seeder تلقائي لأول تشغيل

## بيانات الأدمن الافتراضية
- Email: `admin@cinemai.local`
- Password: `Admin@12345`

## التشغيل المحلي
```bash
cp backend/.env.example backend/.env
docker compose up --build
```
ثم افتح:
- http://localhost

## واجهات API الأساسية
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PUT /api/users/me`
- `POST /api/profiles`
- `GET /api/catalog`
- `POST /api/catalog` (admin)
- `GET /api/catalog/:id/sources`
- `POST /api/catalog/:id/sources` (admin)
- `GET /api/servers`
- `POST /api/servers` (admin)
- `GET /api/favorites`
- `POST /api/favorites`
- `DELETE /api/favorites/:catalogId`
- `GET /api/progress`
- `POST /api/progress`

## نشر VPS سريع
1. ارفع المشروع إلى الخادم.
2. ثبت Docker و Docker Compose plugin.
3. عدّل القيم في `backend/.env`.
4. شغّل:
```bash
docker compose up -d --build
```
5. ضع Nginx/Traefik خارجي مع SSL أو استخدم Cloudflare Tunnel.

## ترقية مقترحة للإنتاج الكامل
- Signed URLs
- DRM
- Object storage مثل S3/R2
- FFmpeg transcoding pipeline
- Redis queue
- Observability (Grafana / Prometheus)
- Email verification / password reset
- Subscription billing (Stripe)
- Recommendation engine

## ملاحظات مهمة
هذا المشروع **Starter Production-Oriented** وليس Netflix التجاري الكامل. لكنه منظم، وقابل للتوسعة، ومناسب للانطلاق الحقيقي بسرعة.
"# sami" 
