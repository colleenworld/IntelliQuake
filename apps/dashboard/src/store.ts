import { types, type Instance } from 'mobx-state-tree';

export const ExplorerStoreModel = types
  .model('ExplorerStore', {
    minimumMagnitude: types.optional(types.number, 2.5),
    isPlaying: types.optional(types.boolean, false),
  })
  .actions((self) => ({
    setMinimumMagnitude(value: number): void {
      self.minimumMagnitude = value;
    },
    togglePlayback(): void {
      self.isPlaying = !self.isPlaying;
    },
  }));

export type ExplorerStore = Instance<typeof ExplorerStoreModel>;

export const explorerStore = ExplorerStoreModel.create();
