import { describe, expect, it } from 'vitest';
import { useStudio, type StudioDependencies } from '../useStudio';
import { coverPresetFor } from '../../core/cover-presets';
import { EMOTION_RULES_VERSION } from '../../core/emotion-engine';
import type { VoiceMeme } from '../../core/models';

const ENERGETIC = { loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6 };

function dependencies(overrides: Partial<StudioDependencies> = {}): StudioDependencies {
  const saved: VoiceMeme[] = [];
  return {
    recorder: { isRecording: false, start: async () => {}, stop: async () => new Blob(['voice'], { type: 'audio/webm' }) },
    analyzer: { analyze: async () => ({ duration: 2, features: { ...ENERGETIC } }) },
    cropper: { inspect: async () => ({duration:2,needsCrop:false}), crop: async (blob, range) => ({blob,duration:range.end-range.start}) },
    renderer: { render: async () => new Blob(['cover'], { type: 'image/png' }) },
    repository: { list: async()=>saved, save: async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} },
    share: { share: async () => 'shared' },
    ...overrides,
  };
}

async function recordAndAnalyze(studio: ReturnType<typeof useStudio>) {
  await studio.startRecording(); await studio.stopRecording(); await studio.analyze();
}

describe('useStudio', () => {
  it('turns microphone denial into a recoverable error', async () => {
    const studio = useStudio(dependencies({ recorder: { isRecording:false, start:async()=>{throw new DOMException('denied','NotAllowedError')}, stop:async()=>new Blob() } }));
    await studio.startRecording();
    expect(studio.error.value).toContain('麦克风权限');
    expect(studio.stage.value).toBe('record');
  });
  it('moves recording through crop and emotion with manual override', async () => {
    const studio = useStudio(dependencies()); await recordAndAnalyze(studio);
    expect(studio.decision.value).toEqual({ label:'元气满满', source:'auto' });
    studio.selectEmotion('温柔姐姐');
    expect(studio.decision.value).toEqual({ label:'温柔姐姐', source:'manual' });
    expect(studio.cover.value.label).toBe('温柔姐姐'); expect(studio.stage.value).toBe('emotion');
  });
  it('keeps the draft when saving fails and can edit an existing work', async () => {
    const studio = useStudio(dependencies({ repository: { list:async()=>[], save:async()=>{throw new DOMException('full','QuotaExceededError')}, rename:async()=>{}, delete:async()=>{} } }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 1; studio.cover.value = coverPresetFor('温柔姐姐');
    studio.decision.value = { label:'温柔姐姐', source:'manual' };
    studio.features.value = { loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2 };
    await studio.save(); expect(studio.error.value).toContain('保存失败'); expect(studio.draft.audio?.size).toBe(1);
    const existing = { id:'old',title:'旧作品',emotion:'温柔姐姐' as const,confidence:.8,features:{loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2},audio:new Blob(['a']),duration:1,cover:new Blob(['c']),coverConfig:coverPresetFor('温柔姐姐'),createdAt:'2026-10-05' };
    studio.editMeme(existing); expect(studio.draft.title).toBe('旧作品'); expect(studio.stage.value).toBe('emotion');
  });

  it('保存重开：快照记录自动建议，最终标签不借用其置信度', async () => {
    const deps = dependencies(); const saved: VoiceMeme[] = [];
    deps.repository = { list: async()=>saved, save: async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} };
    const studio = useStudio(deps);
    await recordAndAnalyze(studio);
    const suggestedConfidence = studio.analysis.value!.suggestion.confidence;
    studio.selectEmotion('温柔姐姐'); studio.goCover(); await studio.save();
    const meme = saved[0];
    expect(meme.emotion).toBe('温柔姐姐');
    expect(meme.emotionSource).toBe('manual');
    expect(meme.confidence).toBeUndefined();
    expect(meme.analysis?.suggestion.label).toBe('元气满满');
    expect(meme.analysis?.suggestion.confidence).toBe(suggestedConfidence);
    expect(meme.analysis?.rulesVersion).toBe(EMOTION_RULES_VERSION);
    // 重开：回看同时还原自动建议与最终标签，二者来源分明
    const reviewer = useStudio(deps);
    reviewer.editMeme(meme);
    expect(reviewer.analysis.value?.suggestion.label).toBe('元气满满');
    expect(reviewer.analysis.value?.suggestion.confidence).toBe(suggestedConfidence);
    expect(reviewer.decision.value).toEqual({ label:'温柔姐姐', source:'manual' });
  });

  it('规则变化：回看展示保存时的原始结论，不按当前规则重算', async () => {
    const studio = useStudio(dependencies());
    // 快照称旧规则给出「暴躁老哥」，而同一特征在当前规则下会判为「元气满满」
    const legacy: VoiceMeme = {
      id:'legacy', title:'旧规则作品', emotion:'暴躁老哥', emotionSource:'auto', confidence:.7,
      features:{ ...ENERGETIC },
      analysis:{ rulesVersion:'emotion-rules@0', analyzedAt:'2026-09-01T00:00:00.000Z', features:{ ...ENERGETIC },
        suggestion:{ label:'暴躁老哥', confidence:.7, explanation:'旧规则文案', scores:{'暴躁老哥':.9,'温柔姐姐':.1,'阴阳怪气':.2,'元气满满':.3} } },
      audio:new Blob(['a']), duration:1, cover:new Blob(['c']), coverConfig:coverPresetFor('暴躁老哥'), createdAt:'2026-09-01',
    };
    studio.editMeme(legacy);
    expect(studio.analysis.value?.rulesVersion).toBe('emotion-rules@0');
    expect(studio.analysis.value?.suggestion.label).toBe('暴躁老哥');
    expect(studio.decision.value).toEqual({ label:'暴躁老哥', source:'auto' });
    // 显式重新分析才产生新结论，且明确属于当前规则
    await studio.analyze();
    expect(studio.analysis.value?.rulesVersion).toBe(EMOTION_RULES_VERSION);
    expect(studio.analysis.value?.suggestion.label).toBe('元气满满');
  });

  it('人工切换与恢复：恢复自动建议不覆盖手写气泡', async () => {
    const studio = useStudio(dependencies()); await recordAndAnalyze(studio);
    studio.patchCover({ bubbleText:'手写的台词' });
    studio.selectEmotion('阴阳怪气');
    expect(studio.cover.value.bubbleText).toBe('手写的台词');
    studio.restoreSuggestion();
    expect(studio.decision.value).toEqual({ label:'元气满满', source:'auto' });
    expect(studio.cover.value.label).toBe('元气满满');
    expect(studio.cover.value.bubbleText).toBe('手写的台词');
    // 未手写时，切换标签仍使用预设气泡
    const fresh = useStudio(dependencies()); await recordAndAnalyze(fresh);
    fresh.selectEmotion('阴阳怪气');
    expect(fresh.cover.value.bubbleText).toBe('本声音属于「阴阳怪气」');
  });

  it('换音频后旧分析依据失效', async () => {
    const studio = useStudio(dependencies()); await recordAndAnalyze(studio);
    expect(studio.analysis.value).toBeDefined();
    await studio.importAudio(new Blob(['other'], { type:'audio/webm' }));
    expect(studio.analysis.value).toBeUndefined();
    expect(studio.decision.value).toBeUndefined();
    expect(studio.features.value).toBeUndefined();
    // 重新录音同样失效
    await recordAndAnalyze(studio);
    await studio.startRecording(); await studio.stopRecording();
    expect(studio.analysis.value).toBeUndefined();
    expect(studio.decision.value).toBeUndefined();
  });

  it('旧记录缺少依据时如实留空，不编造分数或来源', async () => {
    const saved: VoiceMeme[] = [];
    const deps = dependencies({ repository: { list: async()=>saved, save: async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} } });
    const studio = useStudio(deps);
    const legacy: VoiceMeme = { id:'old', title:'旧作品', emotion:'温柔姐姐', confidence:.8,
      features:{loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2},
      audio:new Blob(['a']), duration:1, cover:new Blob(['c']), coverConfig:coverPresetFor('温柔姐姐'), createdAt:'2026-10-05' };
    studio.editMeme(legacy);
    expect(studio.analysis.value).toBeUndefined();
    expect(studio.decision.value).toEqual({ label:'温柔姐姐', source:undefined });
    // 直接保存（未重新分析）：不伪造快照、不猜测来源
    studio.goCover(); await studio.save();
    expect(saved[0].analysis).toBeUndefined();
    expect(saved[0].emotionSource).toBeUndefined();
    expect(saved[0].features).toEqual(legacy.features);
  });
});
