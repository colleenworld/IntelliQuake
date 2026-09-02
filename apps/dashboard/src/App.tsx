import { observer } from 'mobx-react-lite';

import { explorerStore } from './store';

export const App = observer(function App() {
  return (
    <main>
      <header>
        <p className="eyebrow">Event Explorer · Foundation</p>
        <h1>Earthquake Intelligence Platform</h1>
        <p className="lede">
          A production-oriented catalog, seismic-series explorer, and grounded research assistant.
        </p>
      </header>

      <section className="workspace" aria-label="Explorer foundation">
        <div className="map-placeholder" role="img" aria-label="Map implementation placeholder">
          <span>Interactive event map</span>
          <small>MapLibre and deck.gl arrive in Increment 2</small>
        </div>

        <aside>
          <h2>Explorer state</h2>
          <label htmlFor="magnitude">Minimum magnitude</label>
          <input
            id="magnitude"
            type="range"
            min="0"
            max="9"
            step="0.1"
            value={explorerStore.minimumMagnitude}
            onChange={(event) => explorerStore.setMinimumMagnitude(Number(event.target.value))}
          />
          <output htmlFor="magnitude">M {explorerStore.minimumMagnitude.toFixed(1)}+</output>
          <button type="button" onClick={() => explorerStore.togglePlayback()}>
            {explorerStore.isPlaying ? 'Pause timeline' : 'Play timeline'}
          </button>
        </aside>
      </section>
    </main>
  );
});
