import Vue from 'vue'
import Vuetify from 'vuetify'
import {mount, createLocalVue} from '@vue/test-utils'
import TocListItem from '@/components/TocListItem.vue'

Vue.use(Vuetify)

describe('TocListItem', () => {
  test('emits navigation when any part of a linked row is clicked', async () => {
    document.body.setAttribute('data-app', 'true')
    const wrapper = mount(TocListItem, {
      localVue: createLocalVue(),
      vuetify: new Vuetify(),
      propsData: {item: {title: 'Chapter 1', href: 'OPS/chapter-1.xhtml'}},
    })

    await wrapper.find('.v-list-item').trigger('click')

    expect(wrapper.emitted('goto')).toEqual([[{title: 'Chapter 1', href: 'OPS/chapter-1.xhtml'}]])
    wrapper.destroy()
  })

  test('keeps parent rows enabled when they contain child entries', () => {
    const wrapper = mount(TocListItem, {
      localVue: createLocalVue(),
      vuetify: new Vuetify(),
      propsData: {item: {title: 'Part 1', children: [{title: 'Chapter 1', href: 'OPS/chapter-1.xhtml'}]}},
    })

    expect(wrapper.find('.v-list-item').classes()).not.toContain('v-list-item--disabled')
    wrapper.destroy()
  })

  test('never renders a disabled row so the table of contents stays usable', () => {
    const wrapper = mount(TocListItem, {
      localVue: createLocalVue(),
      vuetify: new Vuetify(),
      propsData: {item: {title: 'Unavailable heading'}},
    })

    expect(wrapper.find('.v-list-item').classes()).not.toContain('v-list-item--disabled')
    wrapper.destroy()
  })
})
