"use client";

/* Generated frame previews are local object URLs and should not use Next Image optimization. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  Check, Download, ExternalLink, FileVideo, FolderOpen,
  ImageIcon, ImagePlus, Link2, LoaderCircle, Play, ScanFace, Scissors, Upload, Volume2, X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { type RemoteVideoSource, formatTime, renderStillFrames, renderVideoSegment, selectCharacterFrameTimes } from "@/lib/browser-analyzer";
import { characterCatalog } from "@/lib/character-catalog";

type SourceMeta = {
  title: string;
  duration: number;
  width: number;
  height: number;
  codec: string;
  provider: string;
};

type GeneratedMaterial = {
  frames: Array<{ blob: Blob; url: string; time: number; width: number; height: number; targetScore: number; motionScore: number }>;
  clip: { blob: Blob; url: string; extension: "mp4" | "webm"; mimeType: string };
  start: number;
  end: number;
  createdAt: string;
};

type WritableHandle = { write(data: Blob | string): Promise<void>; close(): Promise<void> };
type FileHandle = { createWritable(): Promise<WritableHandle> };
type DirectoryHandle = {
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options: { create: boolean }): Promise<FileHandle>;
};

function parseTimecode(value: string) {
  const parts = value.trim().split(":").map(Number);
  if (!parts.length || parts.some(part => !Number.isFinite(part) || part < 0)) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2 && parts[1] < 60) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function editorTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(1).padStart(4, "0")}`;
}

function safeName(value: string, fallback: string) {
  return value.trim().normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/^\.+|\.+$/g, "").slice(0, 80) || fallback;
}

function extractVideoUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"'`，。！？；、【】（）《》“”‘’]+/i);
  if (!match) return "";
  return match[0].replace(/[\])}>.,!?;:]+$/g, "");
}

function normalizeVideoLinkInput(value: string) {
  return extractVideoUrl(value) || value;
}

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function releaseGenerated(material: GeneratedMaterial | null) {
  if (!material) return;
  material.frames.forEach(frame => URL.revokeObjectURL(frame.url));
  URL.revokeObjectURL(material.clip.url);
}

async function writeFile(directory: DirectoryHandle, name: string, data: Blob | string) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

function StepTitle({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-400 font-mono text-xs font-black text-slate-950">{number}</span><div><h2 className="text-base font-black text-white">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div></div>;
}

export default function ExpressionExtractor() {
  const [videoLink, setVideoLink] = useState("");
  const [remoteSource, setRemoteSource] = useState<RemoteVideoSource | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<SourceMeta | null>(null);
  const [resolving, setResolving] = useState(false);
  const [sourceNote, setSourceNote] = useState("支持 B站、抖音、快手、小红书等公开链接，也可以上传本地视频。");
  const [rangeStart, setRangeStart] = useState("00:00.0");
  const [rangeEnd, setRangeEnd] = useState("00:10.0");
  const [frameCount, setFrameCount] = useState("12");
  const [countryId, setCountryId] = useState("japan");
  const [workId, setWorkId] = useState("doraemon");
  const [characterId, setCharacterId] = useState("doraemon");
  const [categoryName, setCategoryName] = useState("Custom");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [generated, setGenerated] = useState<GeneratedMaterial | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioWarningShownRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const generatedRef = useRef<GeneratedMaterial | null>(null);

  const localPreviewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => { if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl); }, [localPreviewUrl]);
  const referencePreviewUrl = useMemo(() => referenceFile ? URL.createObjectURL(referenceFile) : "", [referenceFile]);
  useEffect(() => () => { if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl); }, [referencePreviewUrl]);

  useEffect(() => { generatedRef.current = generated; }, [generated]);
  useEffect(() => () => releaseGenerated(generatedRef.current), []);

  const activeSource = remoteSource ?? file;
  const previewUrl = remoteSource?.url ?? localPreviewUrl;
  const duration = meta?.duration ?? 0;
  const startSeconds = parseTimecode(rangeStart);
  const endSeconds = parseTimecode(rangeEnd);
  const rangeValid = startSeconds != null && endSeconds != null && endSeconds > startSeconds && (!duration || endSeconds <= duration + .1);
  const segmentDuration = rangeValid ? endSeconds - startSeconds : 0;
  const activeCountry = characterCatalog.find(country => country.id === countryId) ?? characterCatalog[0];
  const activeWork = activeCountry.works.find(work => work.id === workId) ?? activeCountry.works[0];
  const activeCharacter = activeWork.characters.find(character => character.id === characterId) ?? activeWork.characters[0];
  const requestedFrameCount = Number(frameCount);
  const frameCountValid = Number.isInteger(requestedFrameCount) && requestedFrameCount >= 1 && requestedFrameCount <= 100;
  const recognitionReady = Boolean(referenceFile || activeCharacter.preset);
  const folderPath = `${activeWork.folder}/${activeCharacter.folder}/${safeName(categoryName, "Custom")}`;

  const clearGenerated = () => {
    releaseGenerated(generatedRef.current);
    generatedRef.current = null;
    setGenerated(null);
    setProgress(0);
    setProgressText("");
  };

  const changeCountry = (nextCountryId: string) => {
    const nextCountry = characterCatalog.find(country => country.id === nextCountryId) ?? characterCatalog[0];
    const nextWork = nextCountry.works[0];
    setCountryId(nextCountry.id);
    setWorkId(nextWork.id);
    setCharacterId(nextWork.characters[0].id);
    setReferenceFile(null);
    clearGenerated();
  };

  const changeWork = (nextWorkId: string) => {
    const nextWork = activeCountry.works.find(work => work.id === nextWorkId) ?? activeCountry.works[0];
    setWorkId(nextWork.id);
    setCharacterId(nextWork.characters[0].id);
    setReferenceFile(null);
    clearGenerated();
  };

  const changeCharacter = (nextCharacterId: string) => {
    setCharacterId(nextCharacterId);
    setReferenceFile(null);
    clearGenerated();
  };

  const loadReferenceImage = (incoming?: File | null) => {
    if (!incoming) return;
    if (!incoming.type.startsWith("image/")) return toast.error("请选择 JPG、PNG 或 WebP 角色参考图");
    setReferenceFile(incoming);
    clearGenerated();
    toast.success("角色参考图已加入人物匹配");
  };

  const resetSource = () => {
    clearGenerated();
    audioRef.current?.pause();
    audioWarningShownRef.current = false;
    setRemoteSource(null);
    setFile(null);
    setMeta(null);
    setVideoLink("");
    setSourceNote("支持 B站、抖音、快手、小红书等公开链接，也可以上传本地视频。");
    if (fileRef.current) fileRef.current.value = "";
  };

  const applyDuration = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return;
    setRangeStart("00:00.0");
    setRangeEnd(editorTime(Math.min(value, 10)));
  };

  const syncRemoteAudioTime = (force = false) => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio || audio.readyState < 1) return;
    if (force || Math.abs(audio.currentTime - video.currentTime) > .3) {
      audio.currentTime = Math.max(0, Math.min(audio.duration || video.currentTime, video.currentTime));
    }
  };

  const playRemoteAudio = async () => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (!video || !audio) return;
    audio.volume = video.volume;
    audio.muted = video.muted;
    audio.playbackRate = video.playbackRate;
    syncRemoteAudioTime(true);
    try {
      await audio.play();
      audioWarningShownRef.current = false;
    } catch {
      if (!audioWarningShownRef.current) {
        audioWarningShownRef.current = true;
        toast.error("浏览器阻止了音频播放，请暂停后再次点击播放。");
      }
    }
  };

  const resolveLink = async () => {
    const raw = extractVideoUrl(videoLink) || videoLink.trim();
    if (!raw) return toast.error("请先粘贴视频链接");
    if (raw !== videoLink) setVideoLink(raw);
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") throw new Error("只接受 HTTPS 视频页面链接");
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "链接格式不正确");
    }
    setResolving(true);
    setSourceNote("正在解析完整视频信息和可读取的视频轨道…");
    toast.loading("正在解析视频链接…", { id: "resolve" });
    try {
      const response = await fetch("http://127.0.0.1:5174/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: raw }) });
      const data = await response.json() as { error?: string; title?: string; duration?: number; width?: number; height?: number; size?: number; mimeType?: string; codec?: string; audioUrl?: string; audioCodec?: string; hasAudio?: boolean; audioMode?: "embedded" | "separate" | "none"; provider?: string; pageUrl?: string; streamUrl?: string; downloadUrl?: string };
      if (!response.ok || !data.streamUrl) throw new Error(data.error || `解析失败：HTTP ${response.status}`);
      clearGenerated();
      const source: RemoteVideoSource = { url: data.streamUrl, audioUrl: data.audioUrl, audioCodec: data.audioCodec, hasAudio: data.hasAudio, audioMode: data.audioMode, downloadUrl: data.downloadUrl, name: data.title || "链接视频", size: data.size || 0, mimeType: data.mimeType || "video/mp4", codec: data.codec || "unknown", provider: data.provider || "公开视频平台", pageUrl: data.pageUrl || raw, duration: data.duration || 0, width: data.width || 0, height: data.height || 0 };
      setRemoteSource(source);
      setFile(null);
      const nextMeta = { title: source.name, duration: source.duration || 0, width: source.width || 0, height: source.height || 0, codec: source.codec || "unknown", provider: source.provider || "公开视频平台" };
      setMeta(nextMeta);
      applyDuration(nextMeta.duration);
      setSourceNote(source.hasAudio ? "视频和音频轨道均已解析，完整预览现在包含声音。" : "画面解析完成，但该链接没有提供可读取的音频轨道。");
      toast.success(source.hasAudio ? "完整视频和声音解析成功" : "视频解析成功，但没有检测到音频", { id: "resolve" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "视频链接解析失败";
      setSourceNote(message.includes("fetch") ? "链接服务未启动，请重新启动项目。" : message);
      toast.error(message, { id: "resolve" });
    } finally {
      setResolving(false);
    }
  };

  const loadLocalFile = (incoming?: File | null) => {
    if (!incoming) return;
    if (!incoming.type.startsWith("video/") && !/\.(mp4|mov|mkv|avi|webm|ogv)$/i.test(incoming.name)) return toast.error("请选择视频文件");
    clearGenerated();
    setRemoteSource(null);
    setFile(incoming);
    setMeta({ title: incoming.name, duration: 0, width: 0, height: 0, codec: incoming.type || "本地视频", provider: "本地文件" });
    setSourceNote("本地视频已载入。等待播放器读取完整时长。");
    toast.success("本地视频已载入");
  };

  const downloadOriginal = () => {
    if (remoteSource?.downloadUrl) {
      const anchor = document.createElement("a");
      anchor.href = remoteSource.downloadUrl;
      anchor.download = "";
      anchor.click();
      toast.success("已开始下载完整视频画面轨道");
      return;
    }
    if (file) downloadBlob(file.name, file);
  };

  const setFromPlayer = (target: "start" | "end") => {
    const value = videoRef.current?.currentTime ?? 0;
    if (target === "start") setRangeStart(editorTime(value));
    else setRangeEnd(editorTime(value));
    clearGenerated();
  };

  const generateMaterial = async () => {
    if (!activeSource) return toast.error("请先解析链接或上传视频");
    if (!rangeValid || startSeconds == null || endSeconds == null) return toast.error("请输入有效的开始和结束时间，结束时间不能超过视频时长");
    if (!frameCountValid) return toast.error("图片数量请输入 1—100 之间的整数");
    if (!recognitionReady) return toast.error(`${activeCharacter.name}没有内置视觉预设，请先上传目标人物参考图`);
    setGenerating(true);
    clearGenerated();
    setProgressText(`正在逐帧查找 ${activeCharacter.name} 并评估表情变化…`);
    try {
      const selections = await selectCharacterFrameTimes(activeSource, startSeconds, endSeconds, requestedFrameCount, { referenceImage: referenceFile, preset: activeCharacter.preset }, fraction => setProgress(Math.round(fraction * 35)));
      setProgressText(`已定位 ${activeCharacter.name} 候选画面，正在生成高清图片…`);
      const frames = await renderStillFrames(activeSource, selections.map(selection => selection.time), fraction => setProgress(35 + Math.round(fraction * 20)));
      setProgressText("正在按所选时间生成视频片段…");
      const clip = await renderVideoSegment(activeSource, startSeconds, endSeconds, fraction => setProgress(55 + Math.round(fraction * 40)));
      const material: GeneratedMaterial = { frames: frames.map((frame, index) => ({ ...frame, targetScore: selections[index]?.targetScore ?? 0, motionScore: selections[index]?.motionScore ?? 0, url: URL.createObjectURL(frame.blob) })), clip: { ...clip, url: URL.createObjectURL(clip.blob) }, start: startSeconds, end: endSeconds, createdAt: new Date().toISOString() };
      generatedRef.current = material;
      setGenerated(material);
      setProgress(100);
      setProgressText("素材生成完成");
      toast.success(`已筛选 ${frames.length} 张包含 ${activeCharacter.name} 的候选图片`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "素材生成失败";
      toast.error(message);
      setProgressText(message);
    } finally {
      setGenerating(false);
    }
  };

  const materialManifest = (material: GeneratedMaterial) => ({
    schemaVersion: "3.0",
    createdAt: material.createdAt,
    source: { title: meta?.title, provider: meta?.provider, pageUrl: remoteSource?.pageUrl ?? null, width: meta?.width, height: meta?.height, duration: meta?.duration },
    target: { country: activeCountry.name, work: activeWork.name, character: activeCharacter.name, recognition: referenceFile ? "reference-image-and-visual-preset" : "built-in-visual-preset", referenceFile: referenceFile?.name ?? null },
    selection: { start: material.start, end: material.end, duration: material.end - material.start },
    folder: folderPath,
    frames: material.frames.map((frame, index) => ({ index: index + 1, time: frame.time, width: frame.width, height: frame.height, targetSimilarity: frame.targetScore, expressionMotion: frame.motionScore, file: `Frames/frame_${String(index + 1).padStart(2, "0")}_${editorTime(frame.time).replace(":", "-").replace(".", "_")}.jpg` })),
    clip: { file: `Clips/clip_${editorTime(material.start).replace(":", "-").replace(".", "_")}-${editorTime(material.end).replace(":", "-").replace(".", "_")}.${material.clip.extension}`, mimeType: material.clip.mimeType },
  });

  const buildMaterialZip = async (material: GeneratedMaterial) => {
    const archive: Record<string, Uint8Array> = {};
    for (let index = 0; index < material.frames.length; index++) {
      const frame = material.frames[index];
      const name = `${folderPath}/Frames/frame_${String(index + 1).padStart(2, "0")}_${editorTime(frame.time).replace(":", "-").replace(".", "_")}.jpg`;
      archive[name] = new Uint8Array(await frame.blob.arrayBuffer());
    }
    const clipName = `${folderPath}/Clips/clip_${editorTime(material.start).replace(":", "-").replace(".", "_")}-${editorTime(material.end).replace(":", "-").replace(".", "_")}.${material.clip.extension}`;
    archive[clipName] = new Uint8Array(await material.clip.blob.arrayBuffer());
    archive[`${folderPath}/manifest.json`] = strToU8(JSON.stringify(materialManifest(material), null, 2));
    archive[`${folderPath}/README.txt`] = strToU8(`目标人物表情素材\n作品：${activeWork.name}\n人物：${activeCharacter.name}\n来源：${meta?.title ?? "未知"}\n范围：${editorTime(material.start)}—${editorTime(material.end)}\n人物候选图片：${material.frames.length} 张\n视频片段：1 个\n识别方式：${referenceFile ? "角色参考图 + 视觉预设" : "内置视觉预设"}\n说明：人物匹配与表情变化分数用于候选筛选，最终身份和情绪仍应人工复核。\n`);
    return new Blob([zipSync(archive, { level: 0 })], { type: "application/zip" });
  };

  const downloadPackage = async () => {
    if (!generated) return;
    const blob = await buildMaterialZip(generated);
    downloadBlob(`${activeWork.folder}-${activeCharacter.folder}-${safeName(categoryName, "Custom")}.zip`, blob);
    toast.success("素材 ZIP 已开始下载");
  };

  const saveToFolder = async () => {
    if (!generated) return;
    const picker = (window as unknown as { showDirectoryPicker?: (options: { mode: "readwrite" }) => Promise<DirectoryHandle> }).showDirectoryPicker;
    if (!picker) return toast.error("当前浏览器不支持选择文件夹，请使用“下载素材 ZIP”");
    try {
      const selectedRoot = await picker({ mode: "readwrite" });
      const workDirectory = await selectedRoot.getDirectoryHandle(activeWork.folder, { create: true });
      const characterDirectory = await workDirectory.getDirectoryHandle(activeCharacter.folder, { create: true });
      const categoryDirectory = await characterDirectory.getDirectoryHandle(safeName(categoryName, "Custom"), { create: true });
      const framesDirectory = await categoryDirectory.getDirectoryHandle("Frames", { create: true });
      const clipsDirectory = await categoryDirectory.getDirectoryHandle("Clips", { create: true });
      for (let index = 0; index < generated.frames.length; index++) {
        const frame = generated.frames[index];
        await writeFile(framesDirectory, `frame_${String(index + 1).padStart(2, "0")}_${editorTime(frame.time).replace(":", "-").replace(".", "_")}.jpg`, frame.blob);
      }
      await writeFile(clipsDirectory, `clip_${editorTime(generated.start).replace(":", "-").replace(".", "_")}-${editorTime(generated.end).replace(":", "-").replace(".", "_")}.${generated.clip.extension}`, generated.clip.blob);
      await writeFile(categoryDirectory, "manifest.json", JSON.stringify(materialManifest(generated), null, 2));
      toast.success(`素材已保存到所选目录的 ${folderPath} 文件夹`);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      toast.error(cause instanceof Error ? cause.message : "保存到文件夹失败");
    }
  };

  return <main className="min-h-screen bg-[#071117] text-slate-100">
    <Toaster position="top-right" richColors />
    <header className="border-b border-white/[.07] bg-[#08141a]/90 backdrop-blur-xl"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-amber-400 text-slate-950"><Scissors className="size-5" /></div><div><h1 className="text-lg font-black">Anime Clip</h1><p className="text-[10px] tracking-[.16em] text-slate-600">极简动漫素材裁剪器</p></div></div><Badge variant="outline" className="border-emerald-400/20 text-emerald-300"><Check className="size-3" />本地处理</Badge></div></header>

    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-9">
      <section className="panel rounded-3xl p-5 sm:p-7">
        <StepTitle number="1" title="添加视频" detail="粘贴公开视频链接，或选择本地视频。解析后可预览完整时间轴。" />
        {!activeSource ? <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto]"><div className="relative"><Link2 className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-600" /><Input value={videoLink} onChange={event => setVideoLink(normalizeVideoLinkInput(event.target.value))} onPaste={event => { const pasted = event.clipboardData.getData("text"); const cleaned = extractVideoUrl(pasted); if (!cleaned) return; event.preventDefault(); setVideoLink(cleaned); if (cleaned !== pasted.trim()) toast.success("已自动去除分享文案，只保留视频链接"); }} onKeyDown={event => { if (event.key === "Enter" && !resolving) void resolveLink(); }} placeholder="粘贴任意平台的视频链接或分享文案" className="h-12 bg-black/15 pl-10" /></div><Button onClick={() => void resolveLink()} disabled={resolving || !videoLink.trim()} className="h-12 px-6">{resolving ? <LoaderCircle className="animate-spin" /> : <Link2 />}{resolving ? "正在解析" : "解析完整视频"}</Button></div> : <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4 sm:flex-row sm:items-center"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400 text-slate-950"><Check className="size-5" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{meta?.title}</p><p className="mt-1 text-xs text-slate-500">{meta?.provider} · {meta?.width || "?"}×{meta?.height || "?"} · {duration ? formatTime(duration) : "读取时长中"} · {meta?.codec}</p></div>{remoteSource?.pageUrl && <a href={remoteSource.pageUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs text-slate-400 hover:text-white"><ExternalLink className="size-3.5" />原页面</a>}<Button variant="ghost" size="sm" onClick={resetSource}><X />更换视频</Button></div>}
        {!activeSource && <div className="my-5 flex items-center gap-3 text-[10px] text-slate-700"><span className="h-px flex-1 bg-white/[.07]" />或者<span className="h-px flex-1 bg-white/[.07]" /></div>}
        {!activeSource && <><input ref={fileRef} type="file" accept="video/*,.mkv,.avi,.mov,.webm,.ogv" className="hidden" onChange={event => loadLocalFile(event.target.files?.[0])} /><button onClick={() => fileRef.current?.click()} className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/10 text-sm font-semibold text-slate-400 transition hover:border-amber-400/50 hover:text-white"><Upload className="size-5 text-amber-400" />选择本地视频</button></>}
        <p className="mt-4 text-[11px] leading-5 text-slate-600">{sourceNote} 仅处理你有权使用的公开内容；不读取登录 Cookie，不绕过付费或 DRM。</p>
      </section>

      {activeSource && previewUrl && <>
        <section className="panel overflow-hidden rounded-3xl">
          <div className="p-5 sm:p-7"><StepTitle number="2" title="预览完整视频" detail="播放、暂停或拖动时间轴，找到你想裁剪的准确位置。" /></div>
          <div className="bg-black"><video ref={videoRef} src={previewUrl} crossOrigin={remoteSource ? "anonymous" : undefined} controls preload="metadata" className="mx-auto max-h-[620px] w-full" onLoadedMetadata={event => { const video = event.currentTarget; if (!remoteSource) { const next = { title: file?.name || "本地视频", duration: video.duration, width: video.videoWidth, height: video.videoHeight, codec: file?.type || "本地视频", provider: "本地文件" }; setMeta(next); applyDuration(video.duration); setSourceNote("完整视频已就绪，可以设置裁剪时间。"); } }} onPlay={() => { if (remoteSource?.audioUrl) void playRemoteAudio(); }} onPlaying={() => { if (remoteSource?.audioUrl) void playRemoteAudio(); }} onPause={() => audioRef.current?.pause()} onWaiting={() => audioRef.current?.pause()} onSeeking={() => audioRef.current?.pause()} onSeeked={() => { if (remoteSource?.audioUrl) { syncRemoteAudioTime(true); if (!videoRef.current?.paused) void playRemoteAudio(); } }} onTimeUpdate={() => { if (remoteSource?.audioUrl) syncRemoteAudioTime(); }} onRateChange={event => { if (audioRef.current) audioRef.current.playbackRate = event.currentTarget.playbackRate; }} onVolumeChange={event => { if (audioRef.current) { audioRef.current.volume = event.currentTarget.volume; audioRef.current.muted = event.currentTarget.muted; } }} onEnded={() => audioRef.current?.pause()} />{remoteSource?.audioUrl && <audio ref={audioRef} src={remoteSource.audioUrl} crossOrigin="anonymous" preload="metadata" className="hidden" onLoadedMetadata={() => syncRemoteAudioTime(true)} onError={() => { if (!audioWarningShownRef.current) { audioWarningShownRef.current = true; toast.error("音频轨道读取失败，请重新解析视频链接。"); } }} />}</div>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-7"><p className="text-xs text-slate-500">完整时长：<b className="font-mono text-slate-200">{duration ? formatTime(duration, true) : "读取中"}</b></p><Button variant="outline" onClick={downloadOriginal}><Download />{remoteSource ? "下载原始视频画面轨道" : "下载原视频"}</Button></div>
          {remoteSource && <div className="mx-5 mb-5 flex items-start gap-2 rounded-xl border border-white/[.06] bg-white/[.025] p-3 text-[10px] leading-5 text-slate-500 sm:mx-7"><Volume2 className={`mt-0.5 size-3.5 shrink-0 ${remoteSource.hasAudio ? "text-emerald-400" : "text-amber-400"}`} /><p>{remoteSource.hasAudio ? `预览声音已启用${remoteSource.audioCodec ? `（${remoteSource.audioCodec}）` : ""}。播放、暂停、拖动、倍速和音量会与画面同步。` : "该链接没有解析到可读取的音频轨道，预览只能播放画面。"} 原始下载与素材裁剪目前仍使用高清 H.264 画面轨道，因此导出的片段默认不含音频。</p></div>}
        </section>

        <section className="panel rounded-3xl p-5 sm:p-7">
          <StepTitle number="3" title="选择动漫与目标人物" detail="系统只优先保留目标人物出现且画面变化明显的候选帧，不再把所有人物一起截取。" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div><Label className="mb-2 block text-xs text-slate-400">国家 / 地区</Label><Select value={activeCountry.id} onValueChange={changeCountry}><SelectTrigger className="h-11 w-full bg-black/15"><SelectValue /></SelectTrigger><SelectContent>{characterCatalog.map(country => <SelectItem key={country.id} value={country.id}>{country.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="mb-2 block text-xs text-slate-400">动画作品</Label><Select value={activeWork.id} onValueChange={changeWork}><SelectTrigger className="h-11 w-full bg-black/15"><SelectValue /></SelectTrigger><SelectContent>{activeCountry.works.map(work => <SelectItem key={work.id} value={work.id}>{work.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="mb-2 block text-xs text-slate-400">目标人物 IP</Label><Select value={activeCharacter.id} onValueChange={changeCharacter}><SelectTrigger className="h-11 w-full bg-black/15"><SelectValue /></SelectTrigger><SelectContent>{activeWork.characters.map(character => <SelectItem key={character.id} value={character.id}>{character.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_220px]">
            <div className={`rounded-2xl border p-4 ${recognitionReady ? "border-emerald-400/15 bg-emerald-400/5" : "border-amber-400/20 bg-amber-400/5"}`}>
              <div className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-black/20"><ScanFace className={`size-4 ${recognitionReady ? "text-emerald-400" : "text-amber-400"}`} /></div><div><p className="text-sm font-bold text-white">当前目标：{activeWork.name} / {activeCharacter.name}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{referenceFile ? `已载入参考图 ${referenceFile.name}，它会与${activeCharacter.preset ? "内置颜色预设共同" : "视频候选区域"}参与人物匹配。` : activeCharacter.preset ? "已提供内置视觉预设，可以直接筛选；上传一张人物近景参考图可提高准确性。" : "这个人物没有内置视觉预设，必须上传一张人物近景参考图后才能筛选。"}</p></div></div>
              <div className="mt-4 flex flex-wrap gap-2"><input ref={referenceInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => loadReferenceImage(event.target.files?.[0])} /><Button type="button" variant="outline" size="sm" onClick={() => referenceInputRef.current?.click()}><ImagePlus />{referenceFile ? "更换角色参考图" : "上传角色参考图"}</Button>{referenceFile && <Button type="button" variant="ghost" size="sm" onClick={() => { setReferenceFile(null); clearGenerated(); if (referenceInputRef.current) referenceInputRef.current.value = ""; }}><X />移除参考图</Button>}</div>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-black/15 p-3">{referencePreviewUrl ? <img src={referencePreviewUrl} alt={`${activeCharacter.name}参考图`} className="aspect-video h-full max-h-32 w-full rounded-xl object-contain" /> : <div className="grid h-28 place-items-center rounded-xl border border-dashed border-white/10 text-center text-[11px] leading-5 text-slate-600">建议上传只包含<br />{activeCharacter.name} 的清晰近景</div>}</div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Label className="mb-2 block text-xs text-slate-400">情绪 / 素材分类</Label><Input value={categoryName} onChange={event => { setCategoryName(event.target.value); clearGenerated(); }} placeholder="Happy / Angry / Surprise / Custom" className="h-11 bg-black/15" /></div><div><Label className="mb-2 block text-xs text-slate-400">导出目录</Label><div className="flex h-11 items-center gap-2 rounded-xl border border-white/[.08] bg-black/15 px-3 text-[11px] text-slate-400"><FolderOpen className="size-4 shrink-0 text-amber-400" /><code className="truncate">{folderPath}</code></div></div></div>
          <p className="mt-4 text-[10px] leading-5 text-slate-600">人物匹配使用参考图颜色分布、分区搜索和内置角色配色预设进行候选筛选，并结合画面运动与细节变化优先保留表情变化帧。它是本地视觉候选器，结果仍建议人工复核。</p>
        </section>

        <section className="panel rounded-3xl p-5 sm:p-7">
          <StepTitle number="4" title="定义时间与图片数量" detail="规定分析时间段，并输入任意需要的图片数量；系统会在该范围内查找目标人物。" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><div><Label className="mb-2 block text-xs text-slate-400">开始时间（MM:SS.s）</Label><div className="flex gap-2"><Input value={rangeStart} onChange={event => { setRangeStart(event.target.value); clearGenerated(); }} className="h-11 bg-black/15 font-mono" /><Button variant="outline" onClick={() => setFromPlayer("start")} className="shrink-0"><Play className="size-3.5" />使用当前</Button></div></div><div><Label className="mb-2 block text-xs text-slate-400">结束时间（MM:SS.s）</Label><div className="flex gap-2"><Input value={rangeEnd} onChange={event => { setRangeEnd(event.target.value); clearGenerated(); }} className="h-11 bg-black/15 font-mono" /><Button variant="outline" onClick={() => setFromPlayer("end")} className="shrink-0"><Play className="size-3.5" />使用当前</Button></div></div></div>
          <div className={`mt-4 rounded-xl border p-3 text-xs ${rangeValid ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300" : "border-red-400/15 bg-red-400/5 text-red-300"}`}>{rangeValid ? `将裁剪 ${editorTime(startSeconds ?? 0)}—${editorTime(endSeconds ?? 0)}，片段时长 ${segmentDuration.toFixed(1)} 秒。` : "时间范围无效：结束时间必须晚于开始时间，并且不能超过完整视频时长。"}</div>
          <div className="mt-5 max-w-sm"><Label className="mb-2 block text-xs text-slate-400">需要的目标人物图片数量（1—100）</Label><Input type="number" min={1} max={100} step={1} value={frameCount} onChange={event => { setFrameCount(event.target.value); clearGenerated(); }} className={`h-11 bg-black/15 font-mono ${frameCountValid ? "" : "border-red-400/50"}`} /><p className="mt-2 text-[10px] text-slate-600">不再限制为固定档位。数量越大，候选扫描越密集，处理时间也会增加。</p></div>
          <Button onClick={() => void generateMaterial()} disabled={generating || !rangeValid || !frameCountValid || !recognitionReady} className="mt-6 h-12 w-full text-sm font-black">{generating ? <LoaderCircle className="animate-spin" /> : <ScanFace />}{generating ? `正在筛选 ${progress}%` : `筛选 ${activeCharacter.name} 图片并裁剪视频`}</Button>
          {(generating || progress > 0) && <div className="mt-4"><div className="mb-2 flex justify-between text-xs"><span className="text-slate-500">{progressText}</span><span className="font-mono text-amber-400">{progress}%</span></div><Progress value={progress} /></div>}
        </section>
      </>}

      {generated && <section className="panel rounded-3xl p-5 sm:p-7">
        <StepTitle number="5" title={`${activeCharacter.name} 素材已生成`} detail={`候选图片已经按“目标人物相似度 + 表情画面变化”筛选，保存到 ${folderPath}。`} />
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black"><video src={generated.clip.url} controls className="max-h-[520px] w-full" /></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Badge className="bg-emerald-400 text-slate-950">{generated.frames.length} 张高清图片</Badge><Badge variant="outline">1 个 {generated.clip.extension.toUpperCase()} 片段</Badge><Badge variant="outline">{editorTime(generated.start)}—{editorTime(generated.end)}</Badge></div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{generated.frames.map((frame, index) => <div key={`${frame.time}-${index}`}><button onClick={() => downloadBlob(`frame_${String(index + 1).padStart(2, "0")}_${editorTime(frame.time).replace(":", "-").replace(".", "_")}.jpg`, frame.blob)} className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black"><img src={frame.url} alt={`${activeCharacter.name}候选帧 ${index + 1}`} className="h-full w-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-black/0 text-transparent transition group-hover:bg-black/50 group-hover:text-white"><Download className="size-5" /></span></button><div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-slate-600"><span>{editorTime(frame.time)}</span><span>人物 {Math.round(frame.targetScore * 100)}%</span></div></div>)}</div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3"><Button variant="outline" onClick={() => downloadBlob(`clip_${editorTime(generated.start).replace(":", "-").replace(".", "_")}-${editorTime(generated.end).replace(":", "-").replace(".", "_")}.${generated.clip.extension}`, generated.clip.blob)}><FileVideo />单独下载视频片段</Button><Button variant="outline" onClick={() => void downloadPackage()}><Download />下载完整素材 ZIP</Button><Button onClick={() => void saveToFolder()}><FolderOpen />保存到选择的文件夹</Button></div>
        <div className="mt-4 rounded-xl border border-white/[.07] bg-black/15 p-3 text-[11px] leading-5 text-slate-500"><ImageIcon className="mr-1 inline size-3.5 text-amber-400" />图片来自人物候选筛选后的原视频高清时间点；“人物百分比”是本地视觉相似度，不是身份识别的绝对概率。点击单张图片可以独立下载，最终身份和情绪请人工复核。</div>
      </section>}
    </div>
  </main>;
}
