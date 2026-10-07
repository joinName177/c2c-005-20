import { reactive, ref } from 'vue';
import { classifyEmotion, EMOTION_RULES_VERSION } from '../core/emotion-engine';
import { coverPresetFor } from '../core/cover-presets';
import type { AudioFeatures, CoverConfig, EmotionAnalysisSnapshot, EmotionDecision, EmotionLabel, StudioStage, VoiceMeme } from '../core/models';
import type { RecorderPort } from '../ports/recorder.port';
import type { AudioAnalyzerPort } from '../ports/audio-analyzer.port';
import type { AudioCropperPort } from '../ports/audio-cropper.port';
import type { CoverRendererPort } from '../ports/cover-renderer.port';
import type { MemeRepository } from '../ports/meme-repository.port';
import type { SharePort } from '../ports/share.port';

export interface StudioDependencies { recorder: RecorderPort; analyzer: AudioAnalyzerPort; cropper: AudioCropperPort; renderer: CoverRendererPort; repository: MemeRepository; share: SharePort }
export function useStudio(deps: StudioDependencies) {
  const stage = ref<StudioStage>('record'); const error = ref(''); const notice = ref(''); const level = ref(0);
  const draft = reactive<{ id?: string; title: string; audio?: Blob; duration: number; cropStart: number; cropEnd: number }>({ title: '我的声音表情', duration: 0, cropStart: 0, cropEnd: 0 });
  const analysis = ref<EmotionAnalysisSnapshot>(); const decision = ref<EmotionDecision>(); const features = ref<AudioFeatures>();
  const bubbleEdited = ref(false);
  const cover = ref<CoverConfig>(coverPresetFor('元气满满')); const collection = ref<VoiceMeme[]>([]);

  // 换音频后旧分析依据必须失效。
  function invalidateAnalysis() { analysis.value = undefined; decision.value = undefined; features.value = undefined; bubbleEdited.value = false; cover.value = coverPresetFor('元气满满'); }
  // 应用封面预设时保留用户手写的气泡文字。
  function applyPreset(label: EmotionLabel) { const preset = coverPresetFor(label); cover.value = { ...preset, title: cover.value.title || preset.title, bubbleText: bubbleEdited.value ? cover.value.bubbleText : preset.bubbleText }; }

  async function startRecording() { error.value = ''; try { await deps.recorder.start((value) => { level.value = value; }); notice.value = '正在录音，最长 10 秒'; } catch { error.value = '无法使用麦克风权限，请在浏览器设置中允许访问或导入音频。'; } }
  async function stopRecording() { try { const audio = await deps.recorder.stop(); invalidateAnalysis(); draft.audio = audio; const info = await deps.cropper.inspect(audio); draft.duration = info.duration; draft.cropStart = 0; draft.cropEnd = Math.min(10, info.duration); stage.value = 'crop'; notice.value = info.needsCrop ? '音频超过 10 秒，请选择保留片段' : '录音完成，可以试听并分析'; } catch (cause) { error.value = cause instanceof Error ? cause.message : '录音结束失败'; } }
  async function importAudio(blob: Blob) { invalidateAnalysis(); draft.audio = blob; const info = await deps.cropper.inspect(blob); draft.duration = info.duration; draft.cropStart = 0; draft.cropEnd = Math.min(10, info.duration); stage.value = 'crop'; }
  async function analyze() {
    if (!draft.audio) { error.value = '请先录制或导入一段声音'; return; }
    const cropped = await deps.cropper.crop(draft.audio, { start: draft.cropStart, end: draft.cropEnd });
    draft.audio = cropped.blob; draft.duration = cropped.duration;
    const result = await deps.analyzer.analyze(cropped.blob);
    const suggestion = classifyEmotion(result.features);
    features.value = result.features;
    analysis.value = { rulesVersion: EMOTION_RULES_VERSION, analyzedAt: new Date().toISOString(), features: { ...result.features }, suggestion };
    decision.value = { label: suggestion.label, source: 'auto' };
    bubbleEdited.value = false; cover.value = coverPresetFor(suggestion.label);
    stage.value = 'emotion';
  }
  function selectEmotion(label: EmotionLabel) {
    if (!decision.value) return;
    decision.value = { label, source: analysis.value?.suggestion.label === label ? 'auto' : 'manual' };
    applyPreset(label);
  }
  // 恢复自动建议：只改标签与预设，不覆盖已经手写的气泡。
  function restoreSuggestion() {
    if (!analysis.value) return;
    decision.value = { label: analysis.value.suggestion.label, source: 'auto' };
    applyPreset(analysis.value.suggestion.label);
  }
  function patchCover(patch: Partial<CoverConfig>) {
    if (typeof patch.bubbleText === 'string' && patch.bubbleText !== cover.value.bubbleText) bubbleEdited.value = true;
    cover.value = { ...cover.value, ...patch };
  }
  function goCover() { stage.value = 'cover'; }
  async function save(target?: HTMLCanvasElement) {
    if (!draft.audio || !decision.value || !features.value) { error.value = '作品信息尚未完整，请先完成声音分析'; return; }
    try {
      const coverBlob = await deps.renderer.render(cover.value, target);
      const snapshot = analysis.value;
      const meme: VoiceMeme = {
        id: draft.id ?? `meme-${Date.now()}`,
        title: draft.title.trim() || '未命名声音',
        emotion: decision.value.label,
        emotionSource: decision.value.source,
        confidence: decision.value.source === 'auto' ? snapshot?.suggestion.confidence : undefined,
        features: features.value,
        analysis: snapshot ? { ...snapshot, features: { ...snapshot.features }, suggestion: { ...snapshot.suggestion, scores: { ...snapshot.suggestion.scores } } } : undefined,
        audio: draft.audio, duration: draft.duration, cover: coverBlob, coverConfig: { ...cover.value }, createdAt: new Date().toISOString(),
      };
      await deps.repository.save(meme); await loadCollection(); stage.value = 'collection'; notice.value = '作品已保存到本地';
    } catch { error.value = '保存失败，本次编辑内容仍保留，请检查浏览器存储空间。'; }
  }
  async function loadCollection() { collection.value = (await deps.repository.list()).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  // 回看已保存作品：如实加载当时的分析快照；早期记录缺少快照时保持空缺，不编造分数。
  function editMeme(meme: VoiceMeme) {
    Object.assign(draft, { id:meme.id,title:meme.title,audio:meme.audio,duration:meme.duration,cropStart:0,cropEnd:meme.duration });
    analysis.value = meme.analysis;
    decision.value = { label: meme.emotion, source: meme.emotionSource };
    features.value = meme.features ?? meme.analysis?.features;
    bubbleEdited.value = true; // 已保存的气泡文字视为用户内容，恢复建议时不得覆盖
    cover.value = { ...meme.coverConfig };
    stage.value = 'emotion';
  }
  async function deleteMeme(id: string) { await deps.repository.delete(id); await loadCollection(); }
  async function shareMeme(meme: VoiceMeme) { const result = await deps.share.share(meme); notice.value = result === 'shared' ? '已打开系统分享' : '浏览器不支持文件分享，已下载音频和封面'; }
  function newRecording() { draft.id = undefined; draft.title = '我的声音表情'; draft.audio = undefined; invalidateAnalysis(); stage.value = 'record'; error.value = ''; }
  return { stage,error,notice,level,draft,analysis,decision,features,bubbleEdited,cover,collection,startRecording,stopRecording,importAudio,analyze,selectEmotion,restoreSuggestion,patchCover,goCover,save,loadCollection,editMeme,deleteMeme,shareMeme,newRecording };
}
