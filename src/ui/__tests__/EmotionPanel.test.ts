import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EmotionPanel from '../components/EmotionPanel.vue';
import { EMOTION_RULES_VERSION } from '../../core/emotion-engine';
import type { EmotionAnalysisSnapshot } from '../../core/models';

const snapshot = (rulesVersion = EMOTION_RULES_VERSION): EmotionAnalysisSnapshot => ({
  rulesVersion,
  analyzedAt: '2026-10-07T08:00:00.000Z',
  features: { loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6 },
  suggestion: { label:'元气满满', confidence:.82, explanation:'音调明亮', scores:{'暴躁老哥':.4,'温柔姐姐':.3,'阴阳怪气':.5,'元气满满':.9} },
});

describe('EmotionPanel', () => {
  it('自动建议与最终标签分开显示，手动标签不显示自动置信度', () => {
    const wrapper = mount(EmotionPanel, { props: { analysis: snapshot(), decision: { label:'温柔姐姐', source:'manual' } } });
    const suggestion = wrapper.get('[data-testid="auto-suggestion"]');
    expect(suggestion.text()).toContain('元气满满');
    expect(suggestion.text()).toContain('82%');
    const finalLabel = wrapper.get('[data-testid="final-label"]');
    expect(finalLabel.text()).toContain('温柔姐姐');
    expect(finalLabel.text()).toContain('已手动选择');
    expect(finalLabel.text()).not.toContain('82%');
    expect(wrapper.get('[data-testid="restore-suggestion"]').text()).toContain('元气满满');
  });
  it('规则版本不一致时标注依据来源，仍展示原始结论', () => {
    const wrapper = mount(EmotionPanel, { props: { analysis: snapshot('emotion-rules@0'), decision: { label:'元气满满', source:'auto' } } });
    expect(wrapper.get('[data-testid="rules-outdated"]').text()).toContain('emotion-rules@0');
    expect(wrapper.get('[data-testid="rules-outdated"]').text()).toContain('未按当前规则重新计算');
    expect(wrapper.get('[data-testid="auto-suggestion"]').text()).toContain('元气满满');
  });
  it('缺少分析依据时如实说明，不展示编造的分数', () => {
    const wrapper = mount(EmotionPanel, { props: { analysis: undefined, decision: { label:'温柔姐姐' } } });
    expect(wrapper.get('[data-testid="analysis-missing"]').text()).toContain('未记录分析依据');
    expect(wrapper.find('[data-testid="auto-suggestion"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="restore-suggestion"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('0%');
    expect(wrapper.get('[data-testid="final-label"]').text()).toContain('早期记录');
  });
});
