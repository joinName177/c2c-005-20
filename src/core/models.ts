export type EmotionLabel = '暴躁老哥' | '温柔姐姐' | '阴阳怪气' | '元气满满';
export type StudioStage = 'record' | 'crop' | 'emotion' | 'cover' | 'collection';
export interface CropRange { start: number; end: number }
export interface AudioFeatures { loudness: number; dynamics: number; pitch: number; zeroCrossing: number; pauseRatio: number; tempoVariation: number }
export interface EmotionResult { label: EmotionLabel; confidence: number; explanation: string; scores: Record<EmotionLabel, number> }
export type EmotionSource = 'auto' | 'manual';
/**
 * 一次情绪判定的完整决策记录。
 * 选择保存完整分析快照（而非仅保存特征 + 规则版本以便重建），原因：
 * - 记录体积：快照约百余字节，相对音频与封面 Blob 可忽略，重建方案省下的只是四个分数与一句说明；
 * - 规则升级兼容：重建要求永久保留每个历史规则版本的实现，快照天然免疫规则变更；
 * - 回看稳定性：快照即当时展示的内容，重开时不允许用当前规则重新计算来代表过去的结论。
 */
export interface EmotionDecision {
  final: EmotionLabel;
  source: EmotionSource;
  auto?: EmotionResult;
  ruleVersion?: string;
  analyzedAt?: string;
}
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
  /** 旧版本字段：人工改选时也会带上自动置信度，含义不可靠；新记录不再写入，仅为读取旧记录保留。 */
  confidence?: number;
  /** 完整决策快照；旧版本记录缺失该字段，回看时需如实说明而不是编造。 */
  decision?: EmotionDecision;
  features: AudioFeatures;
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
