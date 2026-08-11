import type { ComponentPublicInstance, VNode } from 'vue'

declare global {
  namespace JSX {
    // tslint:disable no-empty-interface
    interface Element extends VNode {}
    // tslint:disable no-empty-interface
    interface ElementClass extends ComponentPublicInstance {}
    interface IntrinsicElements {
      [elem: string]: any
    }
  }
}
