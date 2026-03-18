export interface InputInjector {
  readonly name: string;

  findWindow(pid: number): Promise<number | null>;

  typeText(windowId: number, text: string): Promise<boolean>;

  pressEnter(windowId: number): Promise<boolean>;
}
