import { reactive, ref } from 'vue';
import { classifyEmotion, EMOTION_RULE_VERSION } from '../core/emotion-engine';
import { coverPresetFor } from '../core/cover-presets';
import type { AudioFeatures, CoverConfig, EmotionLabel, EmotionResult, StudioStage, VoiceMeme } from '../core/models';
import type { RecorderPort } from '../ports/recorder.port';
import type { AudioAnalyzerPort } from '../ports/audio-analyzer.port';
import type { AudioCropperPort } from '../ports/audio-cropper.port';
import type { CoverRendererPort } from '../ports/cover-renderer.port';
import type { MemeRepository } from '../ports/meme-repository.port';
import type { SharePort } from '../ports/share.port';

export interface StudioDependencies { recorder: RecorderPort; analyzer: AudioAnalyzerPort; cropper: AudioCropperPort; renderer: CoverRendererPort; repository: MemeRepository; share: SharePort }
/** 'unknown' 仅用于旧版本记录：它们没有保存决策快照，来源如实标记为未知。 */
export type DecisionSource = 'auto' | 'manual' | 'unknown';
export interface DecisionState { auto?: EmotionResult; final?: EmotionLabel; source: DecisionSource; ruleVersion?: string; analyzedAt?: string }

export function useStudio(deps: StudioDependencies) {
  const stage = ref<StudioStage>('record'); const error = ref(''); const notice = ref(''); const level = ref(0);
  const draft = reactive<{ id?: string; title: string; audio?: Blob; duration: number; cropStart: number; cropEnd: number }>({ title: '我的声音表情', duration: 0, cropStart: 0, cropEnd: 0 });
  const features = ref<AudioFeatures>();
  const decision = reactive<DecisionState>({ source: 'auto' });
  const cover = ref<CoverConfig>(coverPresetFor('元气满满')); const collection = ref<VoiceMeme[]>([]);

  /** 音频一旦变化，旧音频的分析依据（自动建议、最终标签、特征）必须全部失效。 */
  function resetDecision() { decision.auto = undefined; decision.final = undefined; decision.source = 'auto'; decision.ruleVersion = undefined; decision.analyzedAt = undefined; features.value = undefined; }

  async function startRecording() { error.value = ''; try { await deps.recorder.start((value) => { level.value = value; }); notice.value = '正在录音，最长 10 秒'; } catch { error.value = '无法使用麦克风权限，请在浏览器设置中允许访问或导入音频。'; } }
  async function stopRecording() { try { draft.audio = await deps.recorder.stop(); const info = await deps.cropper.inspect(draft.audio); draft.duration = info.duration; draft.cropStart = 0; draft.cropEnd = Math.min(10, info.duration); resetDecision(); stage.value = 'crop'; notice.value = info.needsCrop ? '音频超过 10 秒，请选择保留片段' : '录音完成，可以试听并分析'; } catch (cause) { error.value = cause instanceof Error ? cause.message : '录音结束失败'; } }
  async function importAudio(blob: Blob) { draft.audio = blob; const info = await deps.cropper.inspect(blob); draft.duration = info.duration; draft.cropStart = 0; draft.cropEnd = Math.min(10, info.duration); resetDecision(); stage.value = 'crop'; }
  async function analyze() {
    if (!draft.audio) { error.value = '请先录制或导入一段声音'; return; }
    const cropped = await deps.cropper.crop(draft.audio, { start: draft.cropStart, end: draft.cropEnd }); draft.audio = cropped.blob; draft.duration = cropped.duration;
    const result = await deps.analyzer.analyze(cropped.blob);
    features.value = result.features;
    const auto = classifyEmotion(result.features);
    decision.auto = auto; decision.final = auto.label; decision.source = 'auto'; decision.ruleVersion = EMOTION_RULE_VERSION; decision.analyzedAt = new Date().toISOString();
    cover.value = coverPresetFor(auto.label); stage.value = 'emotion';
  }
  /** 切换封面情绪时保留用户手写的气泡、位置、滤镜与比例，只更新随情绪生成的部分。 */
  function applyLabelToCover(label: EmotionLabel) {
    const previous = cover.value; const previousPreset = coverPresetFor(previous.label); const preset = coverPresetFor(label);
    const handwrittenBubble = previous.bubbleText !== previousPreset.bubbleText;
    const customTitle = previous.title.trim() !== '' && previous.title !== previousPreset.title;
    cover.value = { ...preset, title: customTitle ? previous.title : preset.title, bubbleText: handwrittenBubble ? previous.bubbleText : preset.bubbleText, bubbleX: previous.bubbleX, bubbleY: previous.bubbleY, filter: previous.filter, ratio: previous.ratio };
  }
  /** 人工改选只改变最终标签与来源，自动建议快照原样保留，人工标签不借用自动置信度。 */
  function selectEmotion(label: EmotionLabel) { decision.final = label; decision.source = 'manual'; applyLabelToCover(label); }
  /** 恢复自动建议：只回退最终标签与来源，不覆盖用户已经手写的气泡等封面编辑。 */
  function restoreAuto() { if (!decision.auto) return; decision.final = decision.auto.label; decision.source = 'auto'; applyLabelToCover(decision.auto.label); notice.value = '已恢复为自动建议标签'; }
  function goCover() { stage.value = 'cover'; }
  async function save(target?: HTMLCanvasElement) {
    if (!draft.audio || !decision.final || !features.value) { error.value = '作品信息尚未完整，请先完成声音分析'; return; }
    try {
      const coverBlob = await deps.renderer.render(cover.value, target);
      const meme: VoiceMeme = { id: draft.id ?? `meme-${Date.now()}`, title: draft.title.trim() || '未命名声音', emotion: decision.final, features: features.value, audio: draft.audio, duration: draft.duration, cover: coverBlob, coverConfig: { ...cover.value }, createdAt: new Date().toISOString() };
      if (decision.source !== 'unknown') meme.decision = { final: decision.final, source: decision.source, auto: decision.auto, ruleVersion: decision.ruleVersion, analyzedAt: decision.analyzedAt };
      await deps.repository.save(meme); await loadCollection(); stage.value = 'collection'; notice.value = '作品已保存到本地';
    } catch { error.value = '保存失败，本次编辑内容仍保留，请检查浏览器存储空间。'; }
  }
  async function loadCollection() { collection.value = (await deps.repository.list()).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  function editMeme(meme: VoiceMeme) {
    Object.assign(draft, { id:meme.id,title:meme.title,audio:meme.audio,duration:meme.duration,cropStart:0,cropEnd:meme.duration });
    features.value = meme.features;
    if (meme.decision) { decision.auto = meme.decision.auto; decision.final = meme.decision.final; decision.source = meme.decision.source; decision.ruleVersion = meme.decision.ruleVersion; decision.analyzedAt = meme.decision.analyzedAt; }
    else { decision.auto = undefined; decision.final = meme.emotion; decision.source = 'unknown'; decision.ruleVersion = undefined; decision.analyzedAt = undefined; }
    cover.value = { ...meme.coverConfig }; stage.value = 'emotion';
  }
  async function deleteMeme(id: string) { await deps.repository.delete(id); await loadCollection(); }
  async function shareMeme(meme: VoiceMeme) { const result = await deps.share.share(meme); notice.value = result === 'shared' ? '已打开系统分享' : '浏览器不支持文件分享，已下载音频和封面'; }
  function newRecording() { draft.id = undefined; draft.title = '我的声音表情'; draft.audio = undefined; resetDecision(); stage.value = 'record'; error.value = ''; }
  return { stage,error,notice,level,draft,decision,features,cover,collection,startRecording,stopRecording,importAudio,analyze,selectEmotion,restoreAuto,goCover,save,loadCollection,editMeme,deleteMeme,shareMeme,newRecording };
}
