import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from '../App.vue';
import type { StudioDependencies } from '../useStudio';
import { coverPresetFor } from '../../core/cover-presets';
import type { VoiceMeme } from '../../core/models';

function deps(options: { denied?: boolean; seed?: VoiceMeme[] } = {}): StudioDependencies & { works: VoiceMeme[] } {
  const works: VoiceMeme[] = [...(options.seed ?? [])];
  return {
    works,
    recorder:{isRecording:false,start:async()=>{if(options.denied)throw new DOMException('denied','NotAllowedError')},stop:async()=>new Blob(['voice'],{type:'audio/webm'})},
    analyzer:{analyze:async()=>({duration:2,features:{loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6}})},
    cropper:{inspect:async()=>({duration:2,needsCrop:false}),crop:async(blob,range)=>({blob,duration:range.end-range.start})},
    renderer:{render:async()=>new Blob(['cover'],{type:'image/png'})},
    repository:{list:async()=>works,save:async(m)=>{const i=works.findIndex(w=>w.id===m.id);if(i>=0)works.splice(i,1,m);else works.push(m)},rename:async()=>{},delete:async(id)=>{const i=works.findIndex(w=>w.id===id);if(i>=0)works.splice(i,1)}},
    share:{share:async()=> 'shared'},
  };
}

async function recordAndAnalyze(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="record"]').trigger('click');
  await wrapper.get('[data-testid="stop"]').trigger('click'); await flushPromises();
  await wrapper.get('[data-testid="analyze"]').trigger('click'); await flushPromises();
}

describe('Voice meme App', () => {
  it('shows the studio stages, time limit and sharing disclosure', async () => {
    const wrapper = mount(App,{props:{dependencies:deps()}}); await flushPromises();
    expect(wrapper.text()).toContain('声音表情包工坊');
    expect(wrapper.text()).toContain('00:10 MAX');
    expect(wrapper.text()).toContain('分享链接不包含原始声音');
  });
  it('shows a recoverable microphone permission error', async () => {
    const wrapper=mount(App,{props:{dependencies:deps({denied:true})}}); await wrapper.get('[data-testid="record"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('麦克风权限');
  });
  it('creates, labels, edits and saves a work to the gallery', async () => {
    const wrapper=mount(App,{props:{dependencies:deps()}}); await recordAndAnalyze(wrapper);
    expect(wrapper.get('[data-testid="auto-suggestion"]').text()).toContain('元气满满');
    await wrapper.get('[data-emotion="温柔姐姐"]').trigger('click');
    const finalLine = wrapper.get('[data-testid="final-label"]').text();
    expect(finalLine).toContain('温柔姐姐'); expect(finalLine).toContain('人工改选'); expect(finalLine).not.toContain('%');
    await wrapper.get('[data-testid="to-cover"]').trigger('click'); await wrapper.get('[aria-label="气泡文字"]').setValue('轻轻说一句'); await wrapper.get('[data-testid="save-work"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('作品集'); expect(wrapper.text()).toContain('我的声音表情');
  });
  it('reopens a saved work with its original basis and restores the auto suggestion', async () => {
    const d = deps(); const wrapper=mount(App,{props:{dependencies:d}}); await recordAndAnalyze(wrapper);
    await wrapper.get('[data-emotion="温柔姐姐"]').trigger('click');
    await wrapper.get('[data-testid="to-cover"]').trigger('click'); await wrapper.get('[aria-label="气泡文字"]').setValue('轻轻说一句');
    await wrapper.get('[data-testid="save-work"]').trigger('click'); await flushPromises();
    expect(d.works[0].decision?.source).toBe('manual');
    await wrapper.get('[data-testid="edit-work"]').trigger('click');
    const auto = wrapper.get('[data-testid="auto-suggestion"]').text();
    expect(auto).toContain('元气满满'); expect(auto).toContain('%'); expect(auto).toContain('规则');
    expect(wrapper.get('[data-testid="final-label"]').text()).toContain('温柔姐姐');
    await wrapper.get('[data-testid="restore-auto"]').trigger('click');
    expect(wrapper.get('[data-testid="final-label"]').text()).toContain('元气满满');
    expect(wrapper.get('[data-testid="final-label"]').text()).toContain('采纳自动建议');
    await wrapper.get('[data-testid="to-cover"]').trigger('click');
    expect(wrapper.get<HTMLTextAreaElement>('[aria-label="气泡文字"]').element.value).toBe('轻轻说一句');
  });
  it('states honestly when a legacy work has no recorded basis', async () => {
    const legacy: VoiceMeme = { id:'old',title:'旧作品',emotion:'温柔姐姐',confidence:.8,features:{loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2},audio:new Blob(['a']),duration:1,cover:new Blob(['c']),coverConfig:coverPresetFor('温柔姐姐'),createdAt:'2026-10-05' };
    const wrapper=mount(App,{props:{dependencies:deps({seed:[legacy]})}}); await flushPromises();
    await wrapper.get('[data-testid="edit-work"]').trigger('click');
    expect(wrapper.get('[data-testid="auto-missing"]').text()).toContain('未保存自动建议');
    expect(wrapper.get('[data-testid="final-label"]').text()).toContain('来源未知');
    expect(wrapper.text()).not.toContain('0%');
    expect(wrapper.find('[data-testid="restore-auto"]').exists()).toBe(false);
  });
});
