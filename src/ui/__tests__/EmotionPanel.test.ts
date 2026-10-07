import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EmotionPanel from '../components/EmotionPanel.vue';
import { classifyEmotion } from '../../core/emotion-engine';

const auto = classifyEmotion({ loudness: .75, dynamics: .55, pitch: .8, zeroCrossing: .62, pauseRatio: .12, tempoVariation: .6 });

describe('EmotionPanel', () => {
  it('shows the auto suggestion with confidence and the manual final label without one', () => {
    const wrapper = mount(EmotionPanel, { props: { auto, final: '温柔姐姐', source: 'manual', ruleVersion: 'voice-rules-v1' } });
    const suggestion = wrapper.get('[data-testid="auto-suggestion"]').text();
    expect(suggestion).toContain('元气满满');
    expect(suggestion).toContain(`${Math.round(auto.confidence * 100)}%`);
    expect(suggestion).toContain('voice-rules-v1');
    const finalLine = wrapper.get('[data-testid="final-label"]').text();
    expect(finalLine).toContain('温柔姐姐');
    expect(finalLine).not.toContain('%');
    expect(wrapper.get('[data-testid="restore-auto"]').text()).toContain('元气满满');
  });
  it('hides the restore button while the auto suggestion is adopted', () => {
    const wrapper = mount(EmotionPanel, { props: { auto, final: auto.label, source: 'auto', ruleVersion: 'voice-rules-v1' } });
    expect(wrapper.get('[data-testid="final-label"]').text()).toContain('采纳自动建议');
    expect(wrapper.find('[data-testid="restore-auto"]').exists()).toBe(false);
  });
  it('admits missing basis for legacy works instead of inventing zero scores', () => {
    const wrapper = mount(EmotionPanel, { props: { final: '温柔姐姐', source: 'unknown' } });
    expect(wrapper.get('[data-testid="auto-missing"]').text()).toContain('未保存自动建议');
    expect(wrapper.get('[data-testid="final-label"]').text()).toContain('来源未知');
    expect(wrapper.text()).not.toContain('0%');
  });
  it('emits select and restore events', async () => {
    const wrapper = mount(EmotionPanel, { props: { auto, final: '温柔姐姐', source: 'manual' } });
    await wrapper.get('[data-emotion="阴阳怪气"]').trigger('click');
    await wrapper.get('[data-testid="restore-auto"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['阴阳怪气']]);
    expect(wrapper.emitted('restore')).toHaveLength(1);
  });
});
