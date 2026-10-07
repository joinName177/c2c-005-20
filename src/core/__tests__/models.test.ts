import { describe, expect, it } from 'vitest';
import { validateCropRange, type EmotionDecision } from '../models';
import { classifyEmotion, EMOTION_RULE_VERSION } from '../emotion-engine';

describe('validateCropRange', () => {
  it('rejects a negative start', () => expect(validateCropRange({ start: -1, end: 3 }, 5)).toContain('起点'));
  it('rejects reversed endpoints', () => expect(validateCropRange({ start: 4, end: 2 }, 5)).toContain('终点'));
  it('rejects clips longer than ten seconds', () => expect(validateCropRange({ start: 0, end: 11 }, 12)).toContain('10 秒'));
  it('accepts an exact ten-second clip', () => expect(validateCropRange({ start: 0, end: 10 }, 10)).toBeUndefined());
});

describe('EmotionDecision snapshot', () => {
  it('round trips through serialization unchanged so saved works reopen identically', () => {
    const features = { loudness: .75, dynamics: .55, pitch: .8, zeroCrossing: .62, pauseRatio: .12, tempoVariation: .6 };
    const decision: EmotionDecision = { final: '温柔姐姐', source: 'manual', auto: classifyEmotion(features), ruleVersion: EMOTION_RULE_VERSION, analyzedAt: '2026-10-07T00:00:00.000Z' };
    // IndexedDB 结构化克隆与 JSON 往返都不应改变快照内容
    expect(JSON.parse(JSON.stringify(decision))).toEqual(decision);
    expect(structuredClone(decision)).toEqual(decision);
  });
  it('stays small compared with the stored audio and cover blobs', () => {
    const features = { loudness: .75, dynamics: .55, pitch: .8, zeroCrossing: .62, pauseRatio: .12, tempoVariation: .6 };
    const decision: EmotionDecision = { final: '元气满满', source: 'auto', auto: classifyEmotion(features), ruleVersion: EMOTION_RULE_VERSION, analyzedAt: '2026-10-07T00:00:00.000Z' };
    expect(JSON.stringify(decision).length).toBeLessThan(1024);
  });
});
