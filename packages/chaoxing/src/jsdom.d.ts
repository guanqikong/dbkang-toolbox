declare module 'jsdom' {
  interface DomWindow {
    document: Document
  }

  export class JSDOM {
    constructor(html?: string)
    readonly window: DomWindow
  }
}
