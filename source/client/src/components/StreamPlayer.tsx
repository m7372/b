import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { Check, ChevronDown, Expand, ListVideo, Maximize, MonitorPlay, Radio, Scan, Volume2 } from "lucide-react";
import type { MediaKind, StreamVariant, XtreamItem } from "@/lib/xtream";
import { itemTitle, qualityNumber, variantsFor } from "@/lib/xtream";

type Props = {
  item: XtreamItem | null;
  kind: MediaKind;
  streamUrl: string;
  streamOptions?: Array<{ label: string; url: string; rank?: number }>;
  onOpenChannels: () => void;
  onOpenGroups: () => void;
  connectionLabel: string;
};
const FITS = ["contain", "cover", "4/3", "21/9"] as const;
const FIT_NAMES = ["ملاءمة", "ملء الإطار", "4:3", "سينما 21:9"];

export default function StreamPlayer({ item, kind, streamUrl, streamOptions, onOpenChannels, onOpenGroups, connectionLabel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [fitIndex, setFitIndex] = useState(0);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [hlsLevels, setHlsLevels] = useState<Array<{ index: number; label: string; rank: number }>>([]);
  const [selectedHls, setSelectedHls] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState("");

  const options = useMemo(() => {
    const supplied = streamOptions?.length ? streamOptions : [];
    if (supplied.length) return [...supplied].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
    const variants: StreamVariant[] = variantsFor(item || {});
    if (variants.length > 1) return [...variants].sort((a, b) => qualityNumber(a) - qualityNumber(b)).map((v, i) => ({ label: v.quality || `جودة ${i + 1}`, url: v.url || streamUrl, rank: qualityNumber(v) }));
    return streamUrl ? [{ label: "جودة المصدر", url: streamUrl, rank: 0 }] : [];
  }, [item, streamOptions, streamUrl]);

  useEffect(() => { setSelectedSource(0); setHlsLevels([]); setSelectedHls(null); setError(""); }, [item, kind, streamUrl]);

  const currentOption = options[Math.min(selectedSource, Math.max(options.length - 1, 0))];
  const src = currentOption?.url || streamUrl;
  const isHls = /\.m3u8(?:$|\?)/i.test(src) || String(item?.container_extension || (kind === "live" ? "m3u8" : "")).toLowerCase().replace(/^\./, "") === "m3u8";

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    setError(""); setHlsLevels([]); setSelectedHls(null);
    hlsRef.current?.destroy(); hlsRef.current = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, startLevel: 0, capLevelToPlayerSize: false, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(src); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const levels = data.levels.map((level, index) => ({
          index, rank: level.height || level.bitrate || index,
          label: level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)} kbps`,
        })).sort((a, b) => a.rank - b.rank);
        setHlsLevels(levels);
        if (levels.length) {
          const lowest = levels[0];
          hls.startLevel = lowest.index;
          hls.currentLevel = lowest.index;
          hls.loadLevel = lowest.index;
          setSelectedHls(lowest.index);
        }
      });
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setError("تعذر تشغيل هذا البث. تحقق من الرابط أو صيغة الفيديو."); });
    } else {
      video.src = src;
      video.load();
      if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
        setError("هذا المتصفح لا يدعم HLS مباشرة ولا يتيح فك الترميز المطلوب.");
      }
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [src, isHls]);

  const chooseHls = (index: number) => {
    if (hlsRef.current) { hlsRef.current.currentLevel = index; setSelectedHls(index); }
    setQualityOpen(false);
  };
  const chooseSource = (index: number) => { setSelectedSource(index); setSelectedHls(null); setQualityOpen(false); };
  const activeFit = FITS[fitIndex];

  return <section className="player-shell" aria-label="مشغل البث">
    <div className={`player-frame fit-${activeFit.replace("/", "-")}`}>
      {src ? <video ref={videoRef} className="player-video" controls playsInline preload="metadata" muted={muted}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError("تعذر تشغيل الملف. قد لا يدعم المتصفح هذا النوع من الحاويات أو الترميز.")} /> :
        <div className="player-idle"><div className="idle-orbit"><MonitorPlay size={32} /></div><span className="eyebrow">مساحتك للمشاهدة</span><strong>ابدأ المشاهدة من هنا</strong><small>اختر قناة أو فيلمًا أو حلقة من مكتبتك</small></div>}
      <div className="player-gloss" />
      <div className="player-topline">
        <div className="live-indicator"><span className="live-dot" />{kind === "live" ? "مباشر" : kind === "movie" ? "فيلم" : "مسلسل"}</div>
        <div className="player-top-actions">
          <button className="player-icon player-labeled" aria-label="فتح القنوات" title="القنوات" onClick={onOpenChannels}><ListVideo size={16} /><span>القنوات</span></button>
          <button className="player-icon player-labeled" aria-label="فتح المجموعات" title="المجموعات" onClick={onOpenGroups}><Radio size={16} /><span>المجموعات</span></button>
        </div>
      </div>
      {item && <div className="player-title"><span>{kind === "live" ? "على الهواء الآن" : "يُعرض الآن"}</span><strong>{itemTitle(item)}</strong></div>}
      <div className="player-quick-controls">
        <button className="player-icon" title={`مقاس العرض: ${FIT_NAMES[fitIndex]}`} aria-label={`تغيير المقاس، الحالي ${FIT_NAMES[fitIndex]}`} onClick={() => setFitIndex(i => (i + 1) % FITS.length)}><Scan size={17} /><small>{fitIndex + 1}/4</small></button>
        <div className="quality-wrap">
          <button className="quality-button" onClick={() => setQualityOpen(v => !v)} aria-expanded={qualityOpen}><span>الجودة</span><strong>{selectedHls != null ? hlsLevels.find(x => x.index === selectedHls)?.label || "منخفضة" : currentOption?.label || "—"}</strong><ChevronDown size={14} /></button>
          {qualityOpen && <div className="quality-menu">
            {options.map((option, index) => <button key={`${option.url}-${index}`} onClick={() => chooseSource(index)} className={selectedHls == null && index === selectedSource ? "selected" : ""}><span>{option.label}</span>{index === selectedSource && selectedHls == null && <Check size={14} />}</button>)}
            {hlsLevels.map(level => <button key={level.index} onClick={() => chooseHls(level.index)} className={selectedHls === level.index ? "selected" : ""}><span>{level.label}</span>{selectedHls === level.index && <Check size={14} />}</button>)}
            {!options.length && <span className="quality-empty">لا توجد جودات متاحة</span>}
          </div>}
        </div>
        <button className="player-icon sound-toggle" aria-label={muted ? "إلغاء كتم الصوت" : "كتم الصوت"} title="الصوت" onClick={() => setMuted(v => !v)}><Volume2 size={17} /></button>
        <button className="player-icon fullscreen-toggle" aria-label="ملء الشاشة" title="ملء الشاشة" onClick={() => videoRef.current?.requestFullscreen?.()}><Maximize size={17} /></button>
      </div>
      {!src && <div className="connection-caption"><span className="status-dot" />{connectionLabel}</div>}
      {error && <div className="playback-error">{error}</div>}
      {item && !playing && src && <div className="paused-caption"><Expand size={12} /> جاهز للتشغيل</div>}
    </div>
  </section>;
}
