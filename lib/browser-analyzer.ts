export type RemoteVideoSource = {
  url: string;
  audioUrl?: string;
  audioCodec?: string;
  hasAudio?: boolean;
  audioMode?: "embedded" | "separate" | "none";
  downloadUrl?: string;
  name: string;
  size?: number;
  mimeType?: string;
  provider?: string;
  pageUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  codec?: string;
};

export type ExportedVideoClip = {
  blob: Blob;
  extension: "mp4" | "webm";
  mimeType: string;
};

export type ExportedStillFrame = {
  blob: Blob;
  height: number;
  time: number;
  width: number;
};

export type CharacterVisionPreset = {
  colors: string[];
  tolerance: number;
};

export type CharacterFrameSelection = {
  time: number;
  targetScore: number;
  motionScore: number;
  detailScore: number;
};

const waitFor = (target: HTMLMediaElement, event: string) =>
  new Promise<void>((resolve, reject) => {
    const onDone = () => { cleanup(); resolve(); };
    const onError = () => {
      const code = target.error?.code;
      const reason = code === MediaError.MEDIA_ERR_NETWORK
        ? "视频流连接中断，请重新解析链接后再试。"
        : code === MediaError.MEDIA_ERR_DECODE || code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
          ? "浏览器不支持该视频轨道的编码，请重新解析为 MP4/H.264。"
          : "无法读取视频帧，请重新解析链接或换用 MP4/H.264。";
      cleanup();
      reject(new Error(reason));
    };
    const cleanup = () => {
      target.removeEventListener(event, onDone);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(event, onDone, { once: true });
    target.addEventListener("error", onError, { once: true });
  });

async function seekTo(video: HTMLVideoElement, time: number) {
  if (Math.abs(video.currentTime - time) < .01 && video.readyState >= 2) return;
  const ready = waitFor(video, "seeked");
  video.currentTime = time;
  await ready;
}

export async function renderVideoSegment(
  source: File | RemoteVideoSource,
  start: number,
  end: number,
  onProgress?: (fraction: number) => void,
): Promise<ExportedVideoClip> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("当前浏览器不支持视频片段导出，请使用新版 Edge 或 Chrome。");
  }
  const isLocalFile = source instanceof File;
  const url = isLocalFile ? URL.createObjectURL(source) : source.url;
  const video = document.createElement("video");
  if (!isLocalFile) video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;

  try {
    const metadataReady = waitFor(video, "loadedmetadata");
    video.src = url;
    await metadataReady;
    const safeStart = Math.max(0, Math.min(video.duration - .1, start));
    const safeEnd = Math.max(safeStart + .1, Math.min(video.duration, end));
    if (video.readyState < 2) await waitFor(video, "loadeddata");
    await seekTo(video, safeStart);

    const captureStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream;
    if (typeof captureStream !== "function") {
      throw new Error("当前浏览器不支持从视频生成片段，请使用新版 Edge 或 Chrome。");
    }
    stream = captureStream.call(video);
    const candidates = [
      { mimeType: "video/mp4;codecs=avc1", extension: "mp4" as const },
      { mimeType: "video/webm;codecs=vp9", extension: "webm" as const },
      { mimeType: "video/webm;codecs=vp8", extension: "webm" as const },
      { mimeType: "video/webm", extension: "webm" as const },
    ];
    const selected = candidates.find(item => MediaRecorder.isTypeSupported(item.mimeType));
    if (!selected) throw new Error("浏览器没有可用的视频录制编码器，无法导出视频片段。");

    const chunks: BlobPart[] = [];
    recorder = new MediaRecorder(stream, {
      mimeType: selected.mimeType,
      videoBitsPerSecond: 4_500_000,
    });
    recorder.addEventListener("dataavailable", event => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve, reject) => {
      recorder?.addEventListener("stop", () => resolve(), { once: true });
      recorder?.addEventListener(
        "error",
        () => reject(new Error("浏览器在生成视频片段时发生编码错误。")),
        { once: true },
      );
    });

    recorder.start(500);
    await video.play();
    const duration = safeEnd - safeStart;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => { cleanup(); reject(new Error("生成视频片段超时，请缩短片段时长后再试。")); },
        Math.max(30_000, duration * 3_000),
      );
      const timer = window.setInterval(() => {
        onProgress?.(Math.max(0, Math.min(1, (video.currentTime - safeStart) / duration)));
        if (video.currentTime >= safeEnd || video.ended) {
          cleanup();
          resolve();
        }
      }, 100);
      const onError = () => {
        cleanup();
        reject(new Error("读取视频片段时视频流中断，请重新解析链接。"));
      };
      const cleanup = () => {
        window.clearInterval(timer);
        window.clearTimeout(timeout);
        video.removeEventListener("error", onError);
      };
      video.addEventListener("error", onError, { once: true });
    });

    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    onProgress?.(1);
    const blob = new Blob(chunks, { type: selected.mimeType });
    if (!blob.size) throw new Error("视频片段编码结果为空，请重试。");
    return { blob, extension: selected.extension, mimeType: selected.mimeType };
  } finally {
    video.pause();
    if (recorder?.state !== "inactive") recorder?.stop();
    stream?.getTracks().forEach(track => track.stop());
    video.removeAttribute("src");
    video.load();
    if (isLocalFile) URL.revokeObjectURL(url);
  }
}

export async function renderStillFrames(
  source: File | RemoteVideoSource,
  times: number[],
  onProgress?: (fraction: number) => void,
): Promise<ExportedStillFrame[]> {
  const isLocalFile = source instanceof File;
  const url = isLocalFile ? URL.createObjectURL(source) : source.url;
  const video = document.createElement("video");
  if (!isLocalFile) video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;

  try {
    const metadataReady = waitFor(video, "loadedmetadata");
    video.src = url;
    await metadataReady;
    if (video.readyState < 2) await waitFor(video, "loadeddata");
    const scale = Math.min(1, 1920 / Math.max(1, video.videoWidth));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器无法创建高清图片帧画布。");

    const output: ExportedStillFrame[] = [];
    for (let index = 0; index < times.length; index++) {
      const time = Math.max(0, Math.min(video.duration - .02, times[index]));
      await seekTo(video, time);
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          value => value ? resolve(value) : reject(new Error("高清图片帧编码失败。")),
          "image/jpeg",
          .92,
        );
      });
      output.push({ blob, width, height, time });
      onProgress?.((index + 1) / Math.max(1, times.length));
    }
    return output;
  } finally {
    video.removeAttribute("src");
    video.load();
    if (isLocalFile) URL.revokeObjectURL(url);
  }
}

function histogram(data: Uint8ClampedArray, width: number, height: number, area?: [number, number, number, number]) {
  const bins = new Float32Array(64);
  const [x0, y0, x1, y1] = area ?? [0, 0, width, height];
  let count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const offset = (y * width + x) * 4;
      const r = data[offset] >> 6;
      const g = data[offset + 1] >> 6;
      const b = data[offset + 2] >> 6;
      bins[r * 16 + g * 4 + b] += 1;
      count += 1;
    }
  }
  if (count) for (let index = 0; index < bins.length; index++) bins[index] /= count;
  return bins;
}

function histogramSimilarity(first: Float32Array, second: Float32Array) {
  let intersection = 0;
  for (let index = 0; index < first.length; index++) intersection += Math.min(first[index], second[index]);
  return intersection;
}

function analysisWindows(width: number, height: number) {
  const windows: Array<[number, number, number, number]> = [[0, 0, width, height]];
  for (const scale of [.38, .55, .72]) {
    const windowWidth = Math.max(12, Math.round(width * scale));
    const windowHeight = Math.max(12, Math.min(height, Math.round(windowWidth * 1.12)));
    for (const horizontal of [0, .5, 1]) {
      for (const vertical of [0, 1]) {
        const x = Math.round((width - windowWidth) * horizontal);
        const y = Math.round((height - windowHeight) * vertical);
        windows.push([x, y, x + windowWidth, y + windowHeight]);
      }
    }
  }
  return windows;
}

function parseHexColor(value: string) {
  const hex = value.replace("#", "");
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)] as const;
}

function presetSimilarity(data: Uint8ClampedArray, width: number, windows: Array<[number, number, number, number]>, preset: CharacterVisionPreset) {
  const colors = preset.colors.map(parseHexColor);
  let best = 0;
  for (const [x0, y0, x1, y1] of windows) {
    const matches = new Float32Array(colors.length);
    let count = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const offset = (y * width + x) * 4;
        for (let colorIndex = 0; colorIndex < colors.length; colorIndex++) {
          const color = colors[colorIndex];
          const distance = Math.sqrt(
            (data[offset] - color[0]) ** 2
            + (data[offset + 1] - color[1]) ** 2
            + (data[offset + 2] - color[2]) ** 2,
          );
          if (distance <= preset.tolerance) matches[colorIndex] += 1 - distance / (preset.tolerance * 1.5);
        }
        count += 1;
      }
    }
    if (!count) continue;
    const ratios = Array.from(matches, value => value / count);
    const primary = ratios[0] ?? 0;
    const accents = ratios.slice(1);
    const accent = accents.length ? Math.max(...accents) : 0;
    const finalAccent = ratios.length >= 3 ? Math.max(...ratios.slice(2)) : accent;
    const hasRequiredColors = ratios.length >= 3
      ? primary >= .025 && (ratios[1] ?? 0) >= .018 && finalAccent >= .0025
      : primary >= .03 && accent >= .01;
    const rawScore = ratios.length >= 3
      ? primary * 3.5 + (ratios[1] ?? 0) * .65 + finalAccent * 5
      : primary * 3.2 + accent * 1.6;
    best = Math.max(best, Math.min(1, hasRequiredColors ? rawScore : rawScore * .12));
  }
  return best;
}

async function referenceHistogram(referenceImage: File) {
  const bitmap = await createImageBitmap(referenceImage);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法读取角色参考图。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return histogram(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}

export async function selectCharacterFrameTimes(
  source: File | RemoteVideoSource,
  start: number,
  end: number,
  count: number,
  options: { referenceImage?: File | null; preset?: CharacterVisionPreset },
  onProgress?: (fraction: number) => void,
): Promise<CharacterFrameSelection[]> {
  if (!options.referenceImage && !options.preset) {
    throw new Error("该人物没有内置视觉预设，请上传一张目标人物参考图后再筛选。");
  }
  const requestedCount = Math.max(1, Math.min(100, Math.round(count)));
  const isLocalFile = source instanceof File;
  const url = isLocalFile ? URL.createObjectURL(source) : source.url;
  const video = document.createElement("video");
  if (!isLocalFile) video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;

  try {
    const metadataReady = waitFor(video, "loadedmetadata");
    video.src = url;
    await metadataReady;
    if (video.readyState < 2) await waitFor(video, "loadeddata");
    const safeStart = Math.max(0, Math.min(video.duration - .05, start));
    const safeEnd = Math.max(safeStart + .05, Math.min(video.duration, end));
    const span = safeEnd - safeStart;
    const sampleCount = Math.min(300, Math.max(requestedCount * 7, Math.ceil(span * 2.5), 42));
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 108;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法建立人物识别画布。");
    const windows = analysisWindows(canvas.width, canvas.height);
    const reference = options.referenceImage ? await referenceHistogram(options.referenceImage) : null;
    const candidates: CharacterFrameSelection[] = [];
    let previousGray: Uint8Array | null = null;

    for (let index = 0; index < sampleCount; index++) {
      const time = sampleCount === 1 ? safeStart : safeStart + span * index / (sampleCount - 1);
      await seekTo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let referenceScore = 0;
      if (reference) {
        for (const area of windows) {
          referenceScore = Math.max(referenceScore, histogramSimilarity(reference, histogram(pixels, canvas.width, canvas.height, area)));
        }
      }
      const colorScore = options.preset ? presetSimilarity(pixels, canvas.width, windows, options.preset) : 0;
      const targetScore = reference && options.preset
        ? referenceScore * .72 + colorScore * .28
        : reference ? referenceScore : colorScore;

      const gray = new Uint8Array(canvas.width * canvas.height);
      let motion = 0;
      let detail = 0;
      for (let pixel = 0; pixel < gray.length; pixel++) {
        const offset = pixel * 4;
        gray[pixel] = Math.round(pixels[offset] * .299 + pixels[offset + 1] * .587 + pixels[offset + 2] * .114);
        if (previousGray) motion += Math.abs(gray[pixel] - previousGray[pixel]);
        const x = pixel % canvas.width;
        const y = Math.floor(pixel / canvas.width);
        if (x > 0) detail += Math.abs(gray[pixel] - gray[pixel - 1]);
        if (y > 0) detail += Math.abs(gray[pixel] - gray[pixel - canvas.width]);
      }
      previousGray = gray;
      candidates.push({
        time,
        targetScore: Math.max(0, Math.min(1, targetScore)),
        motionScore: Math.min(1, motion / Math.max(1, gray.length * 42)),
        detailScore: Math.min(1, detail / Math.max(1, gray.length * 42)),
      });
      onProgress?.((index + 1) / sampleCount);
    }

    const minimumTargetScore = reference ? .3 : .22;
    const ranked = candidates.filter(candidate => candidate.targetScore >= minimumTargetScore).sort((first, second) => {
      const firstScore = first.targetScore * .68 + first.motionScore * .22 + first.detailScore * .1;
      const secondScore = second.targetScore * .68 + second.motionScore * .22 + second.detailScore * .1;
      return secondScore - firstScore;
    });
    if (!ranked.length) throw new Error("所选时间段内没有发现足够可信的目标人物画面。请调整时间范围，或上传人物近景参考图后重试。");
    const selected: CharacterFrameSelection[] = [];
    const minimumGap = Math.max(.1, span / Math.max(requestedCount * 1.25, 1));
    for (const candidate of ranked) {
      if (selected.every(item => Math.abs(item.time - candidate.time) >= minimumGap)) selected.push(candidate);
      if (selected.length >= requestedCount) break;
    }
    if (selected.length < requestedCount) {
      for (const candidate of ranked) {
        if (!selected.includes(candidate) && selected.every(item => Math.abs(item.time - candidate.time) >= minimumGap * .55)) selected.push(candidate);
        if (selected.length >= requestedCount) break;
      }
    }
    return selected.sort((first, second) => first.time - second.time);
  } finally {
    video.removeAttribute("src");
    video.load();
    if (isLocalFile) URL.revokeObjectURL(url);
  }
}

export function formatTime(seconds: number, precise = false) {
  const value = Math.max(0, seconds);
  if (precise) {
    const tenths = Math.round(value * 10);
    const minutes = Math.floor(tenths / 600);
    const secs = (tenths % 600) / 10;
    return `${String(minutes).padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
  }
  const totalSeconds = Math.round(value);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
