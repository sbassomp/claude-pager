import type { InputInjector } from './injector.js';
import type { SessionInfo, EventType } from '../types.js';

export class CompositeInjector implements InputInjector {
  readonly name = 'composite';
  private readonly injectors: InputInjector[];

  constructor(injectors: InputInjector[]) {
    this.injectors = injectors;
  }

  async resolve(session: SessionInfo): Promise<boolean> {
    for (const inj of this.injectors) {
      if (await inj.resolve(session)) return true;
    }
    return false;
  }

  async sendResponse(session: SessionInfo, text: string, eventType: EventType): Promise<boolean> {
    for (const inj of this.injectors) {
      if (await inj.resolve(session)) {
        return inj.sendResponse(session, text, eventType);
      }
    }
    return false;
  }
}
