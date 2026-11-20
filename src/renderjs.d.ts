import 'vue'

// The uni-app compiler supplies this module in the view layer. vue-tsc does
// not discover <script module="nativeSwipe" lang="renderjs"> by itself.
declare module 'vue' {
  interface ComponentCustomProperties {
    scrollView: { reset(hidden: boolean): void }
    dotView: { finish(complete: boolean): void }
    editorView: { enter(quiet: boolean): void }
    sheetView: { setExit(epoch: number): void }
    slideView: { prepare(phase: string): void }
    glassPreview: { configure(config: { clarity:number; navMotion:'flow' | 'hop'; qElastic:boolean }): void }
    glassNav: {
      configure(config: { week: number; activeIndex: number; reducedMotion: boolean; clarity: number; navMotion:'flow' | 'hop'; qElastic:boolean; navVisibility:'fixed' | 'auto' }): void
    }
    nativeSwipe: {
      configure(config: { week: number; maxWeek: number; reducedMotion: boolean; revision: number }): void
      dismissGridAdd(): void
    }
    nativeSwipeV3: Pick<ComponentCustomProperties['nativeSwipe'], 'configure'>
  }
}
