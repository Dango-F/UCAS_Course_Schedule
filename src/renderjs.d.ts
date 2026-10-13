import 'vue'

// The uni-app compiler supplies this module in the view layer. vue-tsc does
// not discover <script module="nativeSwipe" lang="renderjs"> by itself.
declare module 'vue' {
  interface ComponentCustomProperties {
    glassPreview: { configure(config: { clarity:number; navMotion:'flow' | 'hop'; qElastic:boolean }): void }
    glassNav: {
      configure(config: { week: number; activeIndex: number; reducedMotion: boolean; clarity: number; navMotion:'flow' | 'hop'; qElastic:boolean; navVisibility:'fixed' | 'auto' }): void
    }
    nativeSwipe: {
      configure(config: { week: number; maxWeek: number; reducedMotion: boolean; revision: number }): void
    }
    nativeSwipeV3: ComponentCustomProperties['nativeSwipe']
  }
}
