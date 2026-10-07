import { describe, expect, it } from 'vitest';
import { useStudio, type StudioDependencies } from '../useStudio';
import { coverPresetFor } from '../../core/cover-presets';
import { classifyEmotion, EMOTION_RULE_VERSION } from '../../core/emotion-engine';
import type { EmotionDecision, VoiceMeme } from '../../core/models';

const ENERGETIC = { loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6 };

function dependencies(overrides: Partial<StudioDependencies> = {}): StudioDependencies & { saved: VoiceMeme[] } {
  const saved: VoiceMeme[] = [];
  return {
    saved,
    recorder: { isRecording: false, start: async () => {}, stop: async () => new Blob(['voice'], { type: 'audio/webm' }) },
    analyzer: { analyze: async () => ({ duration: 2, features: { ...ENERGETIC } }) },
    cropper: { inspect: async () => ({duration:2,needsCrop:false}), crop: async (blob, range) => ({blob,duration:range.end-range.start}) },
    renderer: { render: async () => new Blob(['cover'], { type: 'image/png' }) },
    repository: { list: async()=>saved, save: async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} },
    share: { share: async () => 'shared' },
    ...overrides,
  };
}

function legacyMeme(): VoiceMeme {
  return { id:'old',title:'旧作品',emotion:'温柔姐姐',confidence:.8,features:{loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2},audio:new Blob(['a']),duration:1,cover:new Blob(['c']),coverConfig:coverPresetFor('温柔姐姐'),createdAt:'2026-10-05' };
}

describe('useStudio', () => {
  it('turns microphone denial into a recoverable error', async () => {
    const studio = useStudio(dependencies({ recorder: { isRecording:false, start:async()=>{throw new DOMException('denied','NotAllowedError')}, stop:async()=>new Blob() } }));
    await studio.startRecording();
    expect(studio.error.value).toContain('麦克风权限');
    expect(studio.stage.value).toBe('record');
  });

  it('keeps the auto suggestion and the manual final label separate', async () => {
    const studio = useStudio(dependencies());
    await studio.startRecording(); await studio.stopRecording(); await studio.analyze();
    expect(studio.decision.final).toBe('元气满满');
    expect(studio.decision.source).toBe('auto');
    const autoConfidence = studio.decision.auto?.confidence;
    studio.selectEmotion('温柔姐姐');
    expect(studio.decision.final).toBe('温柔姐姐');
    expect(studio.decision.source).toBe('manual');
    expect(studio.decision.auto?.label).toBe('元气满满');
    expect(studio.decision.auto?.confidence).toBe(autoConfidence);
    expect(studio.cover.value.label).toBe('温柔姐姐');
  });

  it('saves a manual label without borrowing the auto confidence', async () => {
    const deps = dependencies(); const studio = useStudio(deps);
    await studio.startRecording(); await studio.stopRecording(); await studio.analyze();
    studio.selectEmotion('温柔姐姐'); studio.goCover(); await studio.save();
    const meme = deps.saved[0];
    expect(meme.emotion).toBe('温柔姐姐');
    expect(meme.confidence).toBeUndefined();
    expect(meme.decision?.source).toBe('manual');
    expect(meme.decision?.final).toBe('温柔姐姐');
    expect(meme.decision?.auto?.label).toBe('元气满满');
    expect(meme.decision?.auto?.confidence).toBeGreaterThan(0);
    expect(meme.decision?.ruleVersion).toBe(EMOTION_RULE_VERSION);
  });

  it('restores the auto suggestion without overwriting a handwritten bubble', async () => {
    const studio = useStudio(dependencies());
    await studio.startRecording(); await studio.stopRecording(); await studio.analyze();
    studio.goCover();
    studio.cover.value = { ...studio.cover.value, bubbleText: '轻轻说一句' };
    studio.stage.value = 'emotion';
    studio.selectEmotion('阴阳怪气');
    expect(studio.cover.value.bubbleText).toBe('轻轻说一句');
    studio.restoreAuto();
    expect(studio.decision.final).toBe('元气满满');
    expect(studio.decision.source).toBe('auto');
    expect(studio.cover.value.label).toBe('元气满满');
    expect(studio.cover.value.bubbleText).toBe('轻轻说一句');
  });

  it('invalidates the analysis basis when the audio changes', async () => {
    const studio = useStudio(dependencies());
    await studio.startRecording(); await studio.stopRecording(); await studio.analyze();
    expect(studio.decision.auto).toBeDefined();
    await studio.importAudio(new Blob(['other'], { type: 'audio/webm' }));
    expect(studio.decision.auto).toBeUndefined();
    expect(studio.decision.final).toBeUndefined();
    expect(studio.features.value).toBeUndefined();
    await studio.analyze();
    expect(studio.decision.auto).toBeDefined();
    await studio.startRecording(); await studio.stopRecording();
    expect(studio.decision.auto).toBeUndefined();
    expect(studio.decision.final).toBeUndefined();
  });

  it('reopens the saved snapshot instead of recomputing with current rules', async () => {
    const deps = dependencies(); const studio = useStudio(deps);
    await studio.startRecording(); await studio.stopRecording(); await studio.analyze();
    studio.selectEmotion('温柔姐姐'); studio.goCover(); await studio.save();
    const saved = deps.saved[0];
    // 模拟规则已升级：用当前规则重算同一特征会得到不同结论
    const recomputed = classifyEmotion(saved.features);
    const tampered: VoiceMeme = { ...saved, decision: { ...saved.decision!, auto: { ...saved.decision!.auto!, label: '阴阳怪气' } } };
    expect(recomputed.label).not.toBe('阴阳怪气');
    studio.editMeme(tampered);
    expect(studio.stage.value).toBe('emotion');
    expect(studio.decision.auto?.label).toBe('阴阳怪气');
    expect(studio.decision.final).toBe('温柔姐姐');
    expect(studio.decision.source).toBe('manual');
    expect(studio.decision.ruleVersion).toBe(EMOTION_RULE_VERSION);
  });

  it('reports legacy works honestly without fabricating a basis', async () => {
    const deps = dependencies(); const studio = useStudio(deps);
    const legacy = legacyMeme();
    studio.editMeme(legacy);
    expect(studio.stage.value).toBe('emotion');
    expect(studio.decision.final).toBe('温柔姐姐');
    expect(studio.decision.source).toBe('unknown');
    expect(studio.decision.auto).toBeUndefined();
    studio.goCover(); await studio.save();
    const saved = deps.saved[0];
    expect(saved.decision).toBeUndefined();
    expect(saved.confidence).toBeUndefined();
  });

  it('keeps the draft when saving fails', async () => {
    const studio = useStudio(dependencies({ repository: { list:async()=>[], save:async()=>{throw new DOMException('full','QuotaExceededError')}, rename:async()=>{}, delete:async()=>{} } }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 1; studio.cover.value = coverPresetFor('温柔姐姐');
    studio.decision.final = '温柔姐姐'; studio.decision.source = 'manual';
    studio.features.value = { loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2 };
    await studio.save(); expect(studio.error.value).toContain('保存失败'); expect(studio.draft.audio?.size).toBe(1);
  });

  it('survives a save and reopen round trip with the full snapshot intact', async () => {
    const deps = dependencies(); const studio = useStudio(deps);
    await studio.startRecording(); await studio.stopRecording(); await studio.analyze();
    studio.selectEmotion('温柔姐姐'); studio.goCover(); await studio.save();
    const before = deps.saved[0].decision as EmotionDecision;
    const revived = useStudio(deps);
    revived.editMeme(deps.saved[0]);
    expect(revived.decision.auto).toEqual(before.auto);
    expect(revived.decision.auto?.scores).toEqual(before.auto?.scores);
    expect(revived.decision.final).toBe('温柔姐姐');
    expect(revived.decision.source).toBe('manual');
    expect(revived.decision.analyzedAt).toBe(before.analyzedAt);
  });
});
