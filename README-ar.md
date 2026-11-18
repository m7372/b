# لَمعة — واجهة مشغل بث

واجهة عربية RTL لمشاهدة القنوات والأفلام والمسلسلات. ملفات المصدر محفوظة في مجلد `source/` في مستودع GitHub، وملفات البناء الثابتة في الجذر الذي يعرضه GitHub Pages.

## البناء محليًا

```bash
cd source
pnpm install --frozen-lockfile
pnpm exec vite build --base=/b/
cp -R dist/public/. ../
```

ينشر GitHub Pages من الفرع `main` وجذر المستودع على `https://m7372.github.io/b/`. لذلك يجب أن تبقى `--base=/b/`، كما يضبط Router عنوان التطبيق على المسار نفسه. للمعاينة المحلية من داخل `source/` شغّل `pnpm dev:static`.

## ربط Cloudflare Worker

ملف Worker وتعليمات إعداده في `cloudflare/`. الموقع يتوقع المسارات `/auth/login` و`/api/player_api.php` و`/api/stream-url` و`/media`. اجعل `ALLOWED_ORIGIN` هو `https://m7372.github.io` (دون `/b/`؛ فـOrigin لا يتضمن مسار المستودع). لا تضع بيانات Xtream أو أسرار Worker في هذا المستودع.

## تشغيل الوسائط

يمرّر Worker قوائم HLS (`.m3u8`) وقطع TS وبقية الملفات كما هي، ولا يحوّل الترميز. يستخدم المشغل `hls.js` في المتصفحات الداعمة لـMSE ويختار أقل مستوى HLS مُعلن. يعتمد دعم MKV وAVI وWMV وغيرها على الحاوية والترميز والجهاز؛ لا يمكن ضمان تشغيل كل ملف من دون خدمة transcoding منفصلة.
