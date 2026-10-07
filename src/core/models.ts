export type EmotionLabel = '暴躁老哥' | '温柔姐姐' | '阴阳怪气' | '元气满满';
export type StudioStage = 'record' | 'crop' | 'emotion' | 'cover' | 'collection';
export interface CropRange { start: number; end: number }
export interface AudioFeatures { loudness: number; dynamics: number; pitch: number; zeroCrossing: number; pauseRatio: number; tempoVariation: number }
export interface EmotionResult { label: EmotionLabel; confidence: number; explanation: string; scores: Record<EmotionLabel, number> }
export type EmotionSource = 'auto' | 'manual';
// 保存时的完整分析快照：记录事实，回看时不重新计算。
// 规则升级后仍按原样展示；快照中的 features 允许用户显式选择按当前规则重新分析（标注为新结果）。
export interface EmotionAnalysisSnapshot {
  rulesVersion: string;
  analyzedAt: string;
  features: AudioFeatures;
  suggestion: EmotionResult;
}
export interface EmotionDecision { label: EmotionLabel; source?: EmotionSource }
export interface CoverConfig {
  label: EmotionLabel;
  title: string;
  bubbleText: string;
  bubbleX: number;
  bubbleY: number;
  palette: [string, string, string];
  filter: 'none' | 'mono' | 'saturate' | 'warm' | 'cool';
  ratio: 'square' | 'portrait';
}
export interface VoiceMeme {
  id: string;
  title: string;
  emotion: EmotionLabel;
  // 最终标签来源；早期记录缺失该字段时保持未知，不猜测。
  emotionSource?: EmotionSource;
  // 仅自动来源时有值；手动标签不借用自动建议的置信度。
  confidence?: number;
  features: AudioFeatures;
  // 完整分析快照；早期记录可能缺失，回看时如实说明。
  analysis?: EmotionAnalysisSnapshot;
  audio: Blob;
  duration: number;
  cover: Blob;
  coverConfig: CoverConfig;
  createdAt: string;
}

export function validateCropRange(range: CropRange, duration: number): string | undefined {
  if (range.start < 0) return '裁剪起点不能小于 0';
  if (range.end <= range.start) return '裁剪终点必须晚于起点';
  if (range.end > duration) return '裁剪终点超出音频时长';
  if (range.end - range.start > 10) return '裁剪片段不能超过 10 秒';
  return undefined;
}
