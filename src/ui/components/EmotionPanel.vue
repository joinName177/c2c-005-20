<script setup lang="ts">
import { computed } from 'vue';
import { EMOTION_RULES_VERSION } from '../../core/emotion-engine';
import type { EmotionAnalysisSnapshot, EmotionDecision, EmotionLabel } from '../../core/models';

const props = defineProps<{ analysis?: EmotionAnalysisSnapshot; decision: EmotionDecision }>();
const emit = defineEmits<{ select: [e: EmotionLabel]; restore: []; reanalyze: []; next: [] }>();
const labels: EmotionLabel[] = ['暴躁老哥', '温柔姐姐', '阴阳怪气', '元气满满'];
const outdated = computed(() => !!props.analysis && props.analysis.rulesVersion !== EMOTION_RULES_VERSION);
const finalNote = computed(() => {
  if (props.decision.source === 'auto') return '采用自动建议';
  if (props.decision.source === 'manual') return `已手动选择「${props.decision.label}」，手动标签不显示自动建议的置信度`;
  return '早期记录，未保存标签来源';
});
</script>

<template>
  <section class="stage-card">
    <span class="kicker">03 / MOOD MATCH</span>
    <h2>这段声音，有点像——</h2>

    <div v-if="analysis" class="emotion-hero" data-testid="auto-suggestion">
      <small>自动建议 · 规则 {{ analysis.rulesVersion }} · {{ new Date(analysis.analyzedAt).toLocaleString() }}</small>
      <b>{{ analysis.suggestion.label }}</b>
      <strong>{{ Math.round(analysis.suggestion.confidence * 100) }}%</strong>
      <p>{{ analysis.suggestion.explanation }}</p>
      <ul class="emotion-scores">
        <li v-for="label in labels" :key="label">{{ label }} {{ Math.round(analysis.suggestion.scores[label] * 100) }}%</li>
      </ul>
      <p v-if="outdated" class="rules-note" data-testid="rules-outdated">此依据由规则 {{ analysis.rulesVersion }} 生成，当前规则为 {{ EMOTION_RULES_VERSION }}。展示的是保存时的原始结论，未按当前规则重新计算。</p>
    </div>
    <div v-else class="emotion-hero missing" data-testid="analysis-missing">
      <p>该作品保存时未记录分析依据，无法回看当时的自动建议。可重新分析生成一份新依据（按当前规则，不代表保存时的结论）。</p>
    </div>

    <div class="emotion-final" data-testid="final-label">
      <small>最终标签</small>
      <b>{{ decision.label }}</b>
      <span>{{ finalNote }}</span>
    </div>

    <div class="emotion-options">
      <button v-for="label in labels" :key="label" type="button" :data-emotion="label" :class="{ active: decision.label === label }" @click="emit('select', label)">{{ label }}</button>
    </div>
    <button v-if="analysis && decision.source === 'manual'" data-testid="restore-suggestion" type="button" @click="emit('restore')">恢复自动建议「{{ analysis.suggestion.label }}」</button>
    <button v-if="!analysis || outdated" data-testid="reanalyze" type="button" @click="emit('reanalyze')">按当前规则重新分析</button>
    <button data-testid="to-cover" class="acid-button" type="button" @click="emit('next')">用这个情绪做封面 →</button>
  </section>
</template>
