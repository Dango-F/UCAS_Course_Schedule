// Keep the real navigation and material preview at the same tab geometry.
export const SHOW_DEVELOPER_TOOLS = import.meta.env.DEV

export const NAVIGATION_ITEMS = [
  { label:'课表', icon:'grid', aria:'周课表' },
  { label:'今日', icon:'clock', aria:'今日课程' },
  { label:'设置', icon:'settings', aria:'课表设置' },
  ...(SHOW_DEVELOPER_TOOLS ? [{ label:'测试', icon:'lake', aria:'液态玻璃测试' }] : [])
]
