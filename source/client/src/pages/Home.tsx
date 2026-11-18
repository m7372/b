import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Activity, ArrowDownWideNarrow, ArrowLeft, ArrowUpLeft, Bookmark, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Film, Grid2X2, KeyRound, LoaderCircle, LogOut, Menu, MonitorPlay, Play, Radio, Search, Settings2, ShieldCheck, Sparkles, Tv, X } from "lucide-react";
import StreamPlayer from "@/components/StreamPlayer";
import { configuredOrigin, DEFAULT_WORKER_ORIGIN, itemArtwork, itemId, itemTitle, MediaKind, qualityNumber, WORKER_ORIGIN_KEY, WORKER_TOKEN_KEY, XtreamCategory, XtreamClient, XtreamItem } from "@/lib/xtream";

const DEMO_CHANNELS: XtreamItem[] = [
  { stream_id: "demo-1", name: "قناة المشهد", category_id: "all", stream_icon: "", container_extension: "m3u8" },
  { stream_id: "demo-2", name: "العربية اليوم", category_id: "all", stream_icon: "", container_extension: "m3u8" },
  { stream_id: "demo-3", name: "نافذة سينما", category_id: "all", stream_icon: "", container_extension: "m3u8" },
  { stream_id: "demo-4", name: "رياضة بلس", category_id: "all", stream_icon: "", container_extension: "m3u8" },
  { stream_id: "demo-5", name: "ثقافة لايف", category_id: "all", stream_icon: "", container_extension: "m3u8" },
  { stream_id: "demo-6", name: "أخبار 24", category_id: "all", stream_icon: "", container_extension: "m3u8" },
];
const DEMO_MOVIES: XtreamItem[] = [
  { stream_id: "demo-m1", name: "على حافة الضوء", category_id: "all", year: 2025, rating: "8.4", container_extension: "mp4" },
  { stream_id: "demo-m2", name: "مدار أخير", category_id: "all", year: 2024, rating: "7.9", container_extension: "mkv" },
  { stream_id: "demo-m3", name: "صوت المدينة", category_id: "all", year: 2025, rating: "8.1", container_extension: "mp4" },
  { stream_id: "demo-m4", name: "مسافة آمنة", category_id: "all", year: 2023, rating: "7.6", container_extension: "webm" },
  { stream_id: "demo-m5", name: "الطريق شمالًا", category_id: "all", year: 2025, rating: "8.7", container_extension: "mp4" },
  { stream_id: "demo-m6", name: "زمن مستعار", category_id: "all", year: 2022, rating: "7.8", container_extension: "mp4" },
];
const DEMO_SERIES: XtreamItem[] = [
  { series_id: "demo-s1", name: "خط موازٍ", category_id: "all", year: 2025, rating: "8.6" },
  { series_id: "demo-s2", name: "الممر السابع", category_id: "all", year: 2024, rating: "8.2" },
  { series_id: "demo-s3", name: "مدينة الرماد", category_id: "all", year: 2025, rating: "7.9" },
  { series_id: "demo-s4", name: "قبل الفجر", category_id: "all", year: 2023, rating: "8.0" },
  { series_id: "demo-s5", name: "الملف الأزرق", category_id: "all", year: 2024, rating: "8.3" },
  { series_id: "demo-s6", name: "عتمة خفيفة", category_id: "all", year: 2022, rating: "7.7" },
];
const DEMO_PALETTES = ["poster-aurora", "poster-ember", "poster-ice", "poster-violet", "poster-sand", "poster-noir"];
const SECTIONS: Array<{ id: MediaKind; label: string; Icon: typeof Tv }> = [
  { id: "live", label: "مباشر", Icon: Radio }, { id: "movie", label: "أفلام", Icon: Film }, { id: "series", label: "مسلسلات", Icon: Clapperboard },
];

function makeApi(origin: string, token: string) { return new XtreamClient(origin, token); }
function getDemo(kind: MediaKind) { return kind === "live" ? DEMO_CHANNELS : kind === "movie" ? DEMO_MOVIES : DEMO_SERIES; }
function formatError(error: unknown) { return error instanceof Error ? error.message : "حدث خطأ غير متوقع"; }

export default function Home() {
  const [section, setSection] = useState<MediaKind>("live");
  const [categories, setCategories] = useState<XtreamCategory[]>([]);
  const [items, setItems] = useState<XtreamItem[]>(DEMO_CHANNELS);
  const [categoryId, setCategoryId] = useState("all");
  const [activeItem, setActiveItem] = useState<XtreamItem | null>(null);
  const [activeKind, setActiveKind] = useState<MediaKind>("live");
  const [playUrl, setPlayUrl] = useState("");
  const [playVariants, setPlayVariants] = useState<Array<{ label: string; url: string; rank?: number }>>([]);
  const [isDemo, setIsDemo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workerOrigin, setWorkerOrigin] = useState(configuredOrigin());
  const [workerDraft, setWorkerDraft] = useState(configuredOrigin());
  const [accessPassword, setAccessPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<XtreamItem | null>(null);
  const [episodes, setEpisodes] = useState<XtreamItem[]>([]);
  const [seasonKeys, setSeasonKeys] = useState<string[]>([]);
  const [season, setSeason] = useState("1");
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const token = typeof window !== "undefined" ? sessionStorage.getItem(WORKER_TOKEN_KEY) || "" : "";
  const filteredItems = useMemo(() => items.filter(item => itemTitle(item).toLocaleLowerCase().includes(query.toLocaleLowerCase())), [items, query]);
  const selectedCategory = categories.find(c => String(c.category_id) === categoryId)?.category_name || (categoryId === "all" ? "الكل" : "التصنيف");
  const categoryName = activeItem?.category_name || selectedCategory;

  const loadSection = useCallback(async (kind: MediaKind, nextCategory = "all", currentOrigin = workerOrigin, currentToken = token) => {
    if (!currentToken) { setIsDemo(true); setItems(getDemo(kind)); setCategories([{ category_id: "all", category_name: "الكل" }]); return; }
    setLoading(true); setError("");
    try {
      const api = makeApi(currentOrigin, currentToken);
      const [groups, list] = await Promise.all([api.categories(kind), api.list(kind, nextCategory)]);
      setCategories([{ category_id: "all", category_name: "الكل" }, ...(Array.isArray(groups) ? groups : [])]);
      setItems(Array.isArray(list) ? list : []); setIsDemo(false); setError("");
      if (kind === "live" && Array.isArray(list) && list.length && !activeItem) {
        // Keep the player empty until the user chooses a channel.
      }
    } catch (e) { setError(formatError(e)); setIsDemo(false); setItems([]); setCategories([]); }
    finally { setLoading(false); }
  }, [workerOrigin, token, activeItem]);

  useEffect(() => { setCategoryId("all"); setQuery(""); setSelectedSeries(null); setEpisodes([]); setActiveItem(null); setPlayUrl(""); setPlayVariants([]); loadSection(section, "all"); }, [section]);

  const ensureAndLoad = async (kind: MediaKind, cat = "all") => {
    setSection(kind); setCategoryId(cat); setSelectedSeries(null); setEpisodes([]);
    await loadSection(kind, cat);
  };

  const connect = async (event: FormEvent) => {
    event.preventDefault(); setAuthLoading(true); setLoginError("");
    try {
      const origin = workerDraft.trim().replace(/\/+$/, "");
      const api = makeApi(origin, "");
      const newToken = await api.login(accessPassword);
      sessionStorage.setItem(WORKER_TOKEN_KEY, newToken);
      localStorage.setItem(WORKER_ORIGIN_KEY, origin);
      setWorkerOrigin(origin); setWorkerDraft(origin); setAccessPassword(""); setLoginOpen(false); setIsDemo(false); setCategoryId("all");
      await loadSection(section, "all", origin, newToken);
    } catch (e) { setLoginError(formatError(e)); }
    finally { setAuthLoading(false); }
  };

  const chooseItem = async (item: XtreamItem, kind: MediaKind) => {
    setActiveItem(item); setActiveKind(kind); setChannelsOpen(false); setQuery(""); setSelectedSeries(null); setEpisodes([]); setPlayVariants([]); setPlayUrl("");
    if (isDemo) { setError("هذه بيانات توضيحية فقط. اربط Worker لتشغيل المحتوى الفعلي."); return; }
    const id = itemId(item, kind);
    if (!id) { setError("العنصر لا يحتوي معرّف بث صالحًا."); return; }
    const api = makeApi(workerOrigin, token);
    setLoading(true); setError("");
    try {
      let chosenUrl = "";
      const variants = Array.isArray(item.sources) ? item.sources : Array.isArray(item.qualities) ? item.qualities : [];
      if (variants.length > 1) {
        const resolved = await Promise.all(variants.map(async (v, i) => {
          const variantId = String(v.id ?? id);
          const ext = v.container_extension || item.container_extension || (kind === "live" ? "m3u8" : "mp4");
          try {
            const result = await api.streamUrl(kind, variantId, String(ext));
            return { label: String(v.quality || v.name || (v.height ? `${v.height}p` : `جودة ${i + 1}`)), url: result.url, rank: qualityNumber(v) };
          } catch { return null; }
        }));
        const usable = resolved.filter((v): v is { label: string; url: string; rank: number } => Boolean(v));
        if (usable.length) { usable.sort((a, b) => a.rank - b.rank); setPlayVariants(usable); chosenUrl = usable[0].url; }
      }
      if (!chosenUrl) {
        const ext = String(item.container_extension || (kind === "live" ? "m3u8" : "mp4"));
        const result = await api.streamUrl(kind, id, ext);
        chosenUrl = result.url;
      }
      setPlayUrl(chosenUrl);
    } catch (e) { setError(formatError(e)); }
    finally { setLoading(false); }
  };

  const openSeries = async (item: XtreamItem) => {
    setSelectedSeries(item); setSeriesLoading(true); setEpisodes([]); setError("");
    if (isDemo) { setSeasonKeys(["1", "2", "3"]); setSeason("1"); setEpisodes([{ episode_id: "demo-e1", name: "الحلقة الأولى", container_extension: "mp4" }, { episode_id: "demo-e2", name: "الحلقة الثانية", container_extension: "mp4" }, { episode_id: "demo-e3", name: "الحلقة الثالثة", container_extension: "mp4" }]); setSeriesLoading(false); return; }
    try {
      const info = await makeApi(workerOrigin, token).seriesInfo(itemId(item, "series"));
      const seasonMap = info.episodes || {};
      const seasons = Object.keys(seasonMap).sort((a, b) => Number(a) - Number(b));
      const chosen = seasons[0] || "1"; setSeasonKeys(seasons); setSeason(chosen); setEpisodes(seasonMap[chosen] || []);
    } catch (e) { setError(formatError(e)); }
    finally { setSeriesLoading(false); }
  };

  const selectSeason = (value: string) => {
    setSeason(value);
    if (isDemo) { setEpisodes([{ episode_id: "demo-e1", name: `الحلقة الأولى · الموسم ${value}`, container_extension: "mp4" }, { episode_id: "demo-e2", name: `الحلقة الثانية · الموسم ${value}`, container_extension: "mp4" }]); return; }
    if (!selectedSeries) return;
    makeApi(workerOrigin, token).seriesInfo(itemId(selectedSeries, "series")).then(info => setEpisodes(info.episodes?.[value] || [])).catch(e => setError(formatError(e)));
  };

  const playEpisode = async (ep: XtreamItem) => {
    if (!selectedSeries) return;
    setActiveItem({ ...ep, name: `${itemTitle(selectedSeries)} · ${itemTitle(ep)}` }); setActiveKind("series"); setPlayUrl(""); setPlayVariants([]);
    if (isDemo) { setError("هذه بيانات توضيحية فقط. اربط Worker لتشغيل الحلقة."); return; }
    const episodeId = String(ep.id ?? ep.episode_id ?? ep.stream_id ?? "");
    try { const data = await makeApi(workerOrigin, token).streamUrl("series", episodeId, String(ep.container_extension || "mp4")); setPlayUrl(data.url); }
    catch (e) { setError(formatError(e)); }
  };

  const disconnect = () => { sessionStorage.removeItem(WORKER_TOKEN_KEY); setIsDemo(true); setItems(getDemo(section)); setCategories([{ category_id: "all", category_name: "الكل" }]); setActiveItem(null); setPlayUrl(""); setError(""); };
  const toggleFavorite = (item: XtreamItem) => { const id = itemId(item, section); setFavorites(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); };

  return <div className="app-shell" dir="rtl">
    <header className="topbar">
      <div className="brand-lockup"><div className="brand-mark"><span /><span /><span /></div><div><strong>لَمعة</strong><small>منصتك للمشاهدة</small></div></div>
      <nav className={`main-nav ${mobileMenuOpen ? "nav-open" : ""}`} aria-label="التنقل الرئيسي">
        {SECTIONS.map(({ id, label, Icon }) => <button key={id} className={`nav-item ${section === id ? "active" : ""}`} onClick={() => { setMobileMenuOpen(false); ensureAndLoad(id); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === "live" && <i className="nav-live-dot" />}</button>)}
      </nav>
      <div className="top-actions">
        <label className="search-box"><Search size={16} /><input aria-label="بحث" placeholder="ابحث عن محتوى" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label>
        <button className="round-action settings-action" title="إعدادات الاتصال" onClick={() => { setWorkerDraft(workerOrigin); setSettingsOpen(true); }}><Settings2 size={17} /></button>
        {token ? <button className="connect-button connected" onClick={disconnect}><ShieldCheck size={15} /><span>متصل</span><LogOut size={14} /></button> : <button className="connect-button" onClick={() => setLoginOpen(true)}><KeyRound size={15} /><span>اتصال آمن</span></button>}
        <button className="round-action mobile-menu" aria-label="القائمة" onClick={() => setMobileMenuOpen(v => !v)}><Menu size={18} /></button>
      </div>
    </header>

    <main className="page-layout">
      <div className="content-column">
        <div className="section-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{isDemo ? "معاينة الواجهة" : "مكتبتك الخاصة"}</div><h1>{section === "live" ? <>كل لحظة، <em>مباشرة.</em></> : section === "movie" ? <>حكايات <em>تستحق المشاهدة.</em></> : <>مسلسلات <em>تأخذك بعيدًا.</em></>}</h1><p>{section === "live" ? "قنواتك المفضلة، كلها في مكان واحد." : section === "movie" ? "اختر فيلمك التالي من مكتبة واحدة." : "تابع المواسم والحلقات على راحتك."}</p></div><div className="heading-actions"><div className="status-pill"><span className={`status-dot ${isDemo ? "demo-dot" : "online-dot"}`} />{isDemo ? "وضع تجريبي" : "متصل بالمصدر"}</div><button className="soft-button" onClick={() => setLoginOpen(true)}><Activity size={15} />{isDemo ? "اربط مكتبتك" : "تحديث"}</button></div></div>

        <StreamPlayer item={activeItem} kind={activeKind} streamUrl={playUrl} streamOptions={playVariants} onOpenChannels={() => setChannelsOpen(v => !v)} onOpenGroups={() => setGroupsOpen(v => !v)} connectionLabel={isDemo ? "عرض توضيحي · لا يوجد بث فعلي" : loading ? "جارٍ تجهيز البث" : "بانتظار اختيار محتوى"} />

        {error && <div className="inline-alert"><Activity size={15} /><span>{error}</span><button aria-label="إغلاق" onClick={() => setError("")}><X size={15} /></button></div>}
        {isDemo && <div className="demo-note"><Sparkles size={15} /><span>تظهر هنا عناصر تجريبية لتجربة التصميم فقط. اربط Worker لعرض مكتبتك الحقيقية.</span><button onClick={() => setLoginOpen(true)}>إعداد الاتصال <ArrowLeft size={14} /></button></div>}

        <div className="library-head">
          <div className="library-title"><div className="section-icon"><Grid2X2 size={16} /></div><div><h2>{section === "live" ? "على شاشتك" : section === "movie" ? "اختيارات لك" : "تابع المشاهدة"}</h2><span>{section === "live" ? "قنوات ومجموعات البث" : section === "movie" ? "أفلام من مكتبتك" : "مسلسلات ومواسم جديدة"}</span></div></div>
          <div className="library-tools"><button className={`filter-chip ${categoryId === "all" ? "active" : ""}`} onClick={() => { setCategoryId("all"); loadSection(section, "all"); }}><Grid2X2 size={14} />الكل</button><button className="sort-button"><ArrowDownWideNarrow size={15} />ترتيب <ChevronDown size={13} /></button></div>
        </div>

        <div className="category-strip">
          {categories.map(c => <button key={c.category_id} className={`category-chip ${String(c.category_id) === categoryId ? "selected" : ""}`} onClick={() => { setCategoryId(String(c.category_id)); loadSection(section, String(c.category_id)); }}>{c.category_name}<span>{String(c.category_id) === "all" ? items.length : ""}</span></button>)}
          {!categories.length && isDemo && <button className="category-chip selected">الكل <span>{items.length}</span></button>}
        </div>

        {selectedSeries && <section className="series-detail">
          <div className="series-detail-head"><button className="back-link" onClick={() => { setSelectedSeries(null); setEpisodes([]); }}><ArrowRightIcon /> رجوع للمسلسلات</button><div><span className="eyebrow">المسلسل المختار</span><h3>{itemTitle(selectedSeries)}</h3></div><select aria-label="اختر الموسم" value={season} onChange={e => selectSeason(e.target.value)}>{(seasonKeys.length ? seasonKeys : [season]).map(x => <option key={x} value={x}>الموسم {x}</option>)}</select></div>
          {seriesLoading ? <div className="loading-inline"><LoaderCircle className="spin" size={18} /> جارٍ تحميل الحلقات…</div> : <div className="episode-list">{episodes.map((ep, i) => <button key={String(ep.id || ep.episode_id || i)} className="episode-row" onClick={() => playEpisode(ep)}><span className="episode-number">{String(ep.episode_num || i + 1).padStart(2, "0")}</span><span className="episode-play"><Play size={14} fill="currentColor" /></span><span className="episode-copy"><strong>{itemTitle(ep)}</strong><small>{String(ep.info && typeof ep.info === "object" ? (ep.info as any).plot || "" : "")}</small></span><span className="episode-duration">{(ep.info as any)?.duration || "حلقة"}</span></button>)}</div>}
        </section>}

        <div className={`media-grid ${section === "live" ? "channel-grid" : ""}`}>
          {loading && Array.from({ length: 6 }).map((_, i) => <div className="media-skeleton" key={i}><div /><span /></div>)}
          {!loading && filteredItems.map((item, index) => <MediaCard key={String(itemId(item, section) || index)} item={item} kind={section} index={index} demo={isDemo} favorite={favorites.includes(itemId(item, section))} onFavorite={() => toggleFavorite(item)} onSelect={() => section === "series" ? openSeries(item) : chooseItem(item, section)} />)}
          {!loading && !filteredItems.length && <div className="empty-state"><div className="empty-icon"><Search size={22} /></div><strong>{error ? "تعذر تحميل المحتوى" : "لا توجد عناصر هنا بعد"}</strong><span>{error || "اختر مجموعة أخرى أو جرّب البحث."}</span>{!token && <button className="soft-button" onClick={() => setLoginOpen(true)}>إعداد Worker</button>}</div>}
        </div>
      </div>
      <aside className="side-rail"><div className="rail-label">مساحة المشاهدة</div><div className="rail-card active-rail"><div className="rail-glow" /><span className="rail-icon"><MonitorPlay size={19} /></span><strong>مشاهدة مستمرة</strong><p>تنقّل في مكتبتك بينما يبقى المشغل جاهزًا بالأعلى.</p><div className="rail-divider" /><div className="rail-mini-status"><span className={`status-dot ${isDemo ? "demo-dot" : "online-dot"}`} />{isDemo ? "عرض توضيحي" : "مصدر متصل"}</div></div><div className="rail-card rail-tip"><div className="tip-icon"><Sparkles size={17} /></div><div><strong>اختيارك للجودة</strong><p>ابدأ بالأقل ثم غيّر يدويًا من قائمة الجودة داخل المشغل.</p></div></div><div className="rail-footer"><span>لَمعة</span><span>مشاهدة أهدأ، تحكم أكثر.</span></div></aside>
    </main>

    {channelsOpen && <div className="overlay-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setChannelsOpen(false); }}><aside className="glass-drawer" aria-label="قائمة القنوات"><div className="drawer-head"><div><span className="eyebrow">المشغل مستمر</span><h3>{section === "live" ? "قنواتك" : section === "movie" ? "الأفلام" : "المسلسلات"}</h3></div><button className="round-action" onClick={() => setChannelsOpen(false)}><X size={17} /></button></div><label className="drawer-search"><Search size={15} /><input placeholder="ابحث في القائمة" value={query} onChange={e => setQuery(e.target.value)} /></label><div className="drawer-list">{filteredItems.map((item, i) => <button key={String(itemId(item, section) || i)} className={`drawer-row ${activeItem && itemId(activeItem, activeKind) === itemId(item, section) ? "selected" : ""}`} onClick={() => section === "series" ? (openSeries(item), setChannelsOpen(false)) : chooseItem(item, section)}><span className="drawer-thumb"><MediaGlyph kind={section} index={i} /></span><span><strong>{itemTitle(item)}</strong><small>{section === "live" ? item.category_name || "قناة مباشرة" : String(item.year || "من مكتبتك")}</small></span>{activeItem && itemId(activeItem, activeKind) === itemId(item, section) ? <span className="now-dot" /> : <Play size={13} />}</button>)}{!filteredItems.length && <span className="drawer-empty">لا توجد نتائج في هذه القائمة</span>}</div><div className="drawer-foot"><span><span className="status-dot online-dot" />{items.length} عنصر</span><span>يمكنك الاختيار دون إيقاف المشغل</span></div></aside></div>}

    {groupsOpen && <div className="overlay-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setGroupsOpen(false); }}><aside className="glass-drawer groups-drawer"><div className="drawer-head"><div><span className="eyebrow">رتّب ما تشاهده</span><h3>المجموعات</h3></div><button className="round-action" onClick={() => setGroupsOpen(false)}><X size={17} /></button></div><div className="group-list">{categories.map(c => <button key={c.category_id} className={`group-row ${String(c.category_id) === categoryId ? "selected" : ""}`} onClick={() => { setCategoryId(String(c.category_id)); loadSection(section, String(c.category_id)); setGroupsOpen(false); }}><span className="group-icon"><Grid2X2 size={16} /></span><span><strong>{c.category_name}</strong><small>{String(c.category_id) === "all" ? "كل المكتبة" : "مجموعة المحتوى"}</small></span><ChevronLeft size={16} /></button>)}{!categories.length && <div className="drawer-empty">اتصل بـWorker لعرض مجموعاتك.</div>}</div></aside></div>}

    {loginOpen && <Modal title="اتصال آمن بـWorker" eyebrow="بيانات المصدر لا تدخل الموقع" onClose={() => { setLoginOpen(false); setLoginError(""); }}><form className="connect-form" onSubmit={connect}><label>عنوان Cloudflare Worker<input value={workerDraft} onChange={e => setWorkerDraft(e.target.value)} type="url" placeholder={DEFAULT_WORKER_ORIGIN} required /></label><label>كلمة مرور دخول Worker<input value={accessPassword} onChange={e => setAccessPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="كلمة المرور التي عيّنتها كـ APP_ACCESS_PASSWORD" required /></label><div className="form-security"><ShieldCheck size={16} /><span>لا تكتب بيانات Xtream هنا. أدخل كلمة مرور الوصول التي تضبطها أنت في Worker.</span></div>{loginError && <div className="form-error">{loginError}</div>}<button className="primary-submit" type="submit" disabled={authLoading}>{authLoading ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}<span>{authLoading ? "جارٍ الاتصال…" : "اتصال بالمكتبة"}</span><ArrowLeft size={15} /></button><button type="button" className="secondary-submit" onClick={() => { setLoginOpen(false); setIsDemo(true); setItems(getDemo(section)); setCategories([{ category_id: "all", category_name: "الكل" }]); }}>متابعة في وضع المعاينة</button></form></Modal>}

    {settingsOpen && <Modal title="إعدادات المصدر" eyebrow="تغيير عنوان الربط" onClose={() => setSettingsOpen(false)}><form className="connect-form" onSubmit={e => { e.preventDefault(); const origin = workerDraft.trim().replace(/\/+$/, ""); localStorage.setItem(WORKER_ORIGIN_KEY, origin); setWorkerOrigin(origin); setSettingsOpen(false); if (token) loadSection(section, categoryId, origin, token); }}><label>عنوان Worker<input type="url" value={workerDraft} onChange={e => setWorkerDraft(e.target.value)} required /></label><div className="form-security"><ShieldCheck size={16} /><span>عنوان الواجهة ليس سرًا. لا تحفظ بيانات Xtream في GitHub أو المتصفح.</span></div><button className="primary-submit" type="submit"><Check size={16} /><span>حفظ العنوان</span></button><button type="button" className="secondary-submit" onClick={() => { setWorkerDraft(DEFAULT_WORKER_ORIGIN); }}>استعادة العنوان الافتراضي</button></form></Modal>}

    <footer className="site-footer"><span>© لَمعة · واجهة مشاهدة شخصية</span><span>يدعم المتصفح حسب الصيغة والترميز المتاحين</span><button onClick={() => setSettingsOpen(true)}>إعداد الاتصال <ChevronLeft size={13} /></button></footer>
  </div>;
}

function ArrowRightIcon() { return <ChevronRight size={14} />; }

function MediaGlyph({ kind, index }: { kind: MediaKind; index: number }) {
  const Icon = kind === "live" ? Radio : kind === "movie" ? Film : Clapperboard;
  return <span className={`glyph-art ${DEMO_PALETTES[index % DEMO_PALETTES.length]}`}><span className="glyph-orbit" /><Icon size={kind === "live" ? 22 : 24} strokeWidth={1.4} /></span>;
}

function MediaCard({ item, kind, index, demo, favorite, onFavorite, onSelect }: { item: XtreamItem; kind: MediaKind; index: number; demo: boolean; favorite: boolean; onFavorite: () => void; onSelect: () => void }) {
  const title = itemTitle(item); const artwork = demo ? "" : itemArtwork(item);
  return <article className={`media-card ${kind === "live" ? "live-card" : "poster-card"}`}>
    <div className="media-art-button" role="button" tabIndex={0} onClick={onSelect} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }} aria-label={`اختيار ${title}`}>
      <MediaGlyph kind={kind} index={index} />
      {artwork && <img className="media-artwork" src={artwork} alt="" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
      <span className="art-vignette" />{kind === "live" && <span className="card-live"><i /> مباشر</span>}
      {kind !== "live" && <span className="card-play"><Play size={18} fill="currentColor" /></span>}
      <button className={`favorite-button ${favorite ? "favorited" : ""}`} aria-label="إضافة للمفضلة" onClick={e => { e.stopPropagation(); onFavorite(); }}><Bookmark size={15} fill={favorite ? "currentColor" : "none"} /></button>
      <span className="card-format">{demo ? "معاينة" : String(item.container_extension || (kind === "live" ? "HLS" : "فيديو")).toUpperCase()}</span>
    </div>
    <div className="media-meta"><div><strong>{title}</strong><span>{item.category_name || (kind === "live" ? "بث مباشر" : kind === "movie" ? String(item.year || "فيلم") : String(item.year || "مسلسل"))}</span></div><button className="card-action" onClick={onSelect} aria-label="تشغيل"><ChevronLeft size={16} /></button></div>
  </article>;
}

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="إغلاق"><X size={17} /></button><span className="eyebrow"><span className="eyebrow-line" />{eyebrow}</span><h2>{title}</h2><div className="modal-body">{children}</div></section></div>;
}
