<script setup lang="ts">
import type { EmotionLabel, EmotionResult } from '../../core/models';
import type { DecisionSource } from '../useStudio';

const props = defineProps<{ auto?: EmotionResult; final: EmotionLabel; source: DecisionSource; ruleVersion?: string }>();
const emit = defineEmits<{ select: [e: EmotionLabel]; restore: []; next: [] }>();
const labels: EmotionLabel[] = ['暴躁老哥', '温柔姐姐', '阴阳怪气', '元气满满'];
</script>

<template>
  <section class="stage-card">
    <span class="kicker">03 / MOOD MATCH</span>
    <h2>这段声音，有点像——</h2>
    <div v-if="props.auto" class="emotion-hero" data-testid="auto-suggestion">
      <small>自动建议<template v-if="props.ruleVersion"> · 规则 {{ props.ruleVersion }}</template> · 仅供娱乐，不构成身份或医学判断</small>
      <b>{{ props.auto.label }}</b>
      <strong>{{ Math.round(props.auto.confidence * 100) }}%</strong>
      <p>{{ props.auto.explanation }}</p>
    </div>
    <div v-else class="emotion-hero missing" data-testid="auto-missing">
      <small>自动建议</small>
      <p>该作品未保存自动建议与分析依据，无法回放当时的判断过程。</p>
    </div>
    <p class="final-line" data-testid="final-label">
      最终标签：<b>{{ props.final }}</b>
      <span v-if="props.source === 'manual'">（人工改选 · 人工标签不带置信度）</span>
      <span v-else-if="props.source === 'auto'">（采纳自动建议）</span>
      <span v-else>（来源未知）</span>
    </p>
    <div class="emotion-options">
      <button v-for="label in labels" :key="label" type="button" :data-emotion="label" :class="{ active: props.final === label }" @click="emit('select', label)">{{ label }}</button>
    </div>
    <button v-if="props.source === 'manual' && props.auto" data-testid="restore-auto" class="restore-button" type="button" @click="emit('restore')">恢复自动建议「{{ props.auto.label }}」</button>
    <button data-testid="to-cover" class="acid-button" type="button" @click="emit('next')">用这个情绪做封面 →</button>
  </section>
</template>
