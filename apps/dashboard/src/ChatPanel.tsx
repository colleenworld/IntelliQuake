import { observer } from 'mobx-react-lite';

import { explorerStore } from './store';

export const ChatPanel = observer(function ChatPanel() {
  const working = ['thinking', 'tool', 'streaming'].includes(explorerStore.chatStatus);
  return (
    <section className="chat-panel" aria-labelledby="chat-title">
      <div className="chat-heading">
        <div>
          <p className="panel-label">Grounded catalog assistant</p>
          <h2 id="chat-title">Ask about the earthquake catalog</h2>
        </div>
        {explorerStore.chatMessages.length > 0 && (
          <button type="button" className="chat-clear" onClick={() => explorerStore.clearChat()}>
            Clear
          </button>
        )}
      </div>
      <p className="chat-boundary">
        Answers use bounded read-only catalog tools. Candidate series are inferred, and this
        assistant cannot predict earthquakes.
      </p>
      <div className="chat-transcript" aria-live="polite">
        {explorerStore.chatMessages.length === 0 ? (
          <div className="chat-prompts">
            <span>Try:</span>
            {[
              'What are the largest events in this catalog?',
              'Explain the selected candidate series.',
              'Which events occurred near Wellington?',
            ].map((prompt) => (
              <button type="button" key={prompt} onClick={() => explorerStore.setChatDraft(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          explorerStore.chatMessages.map((message) => (
            <article key={message.id} className={`chat-message chat-message--${message.role}`}>
              <strong>{message.role === 'user' ? 'You' : 'Catalog assistant'}</strong>
              <p>{message.content || '…'}</p>
              {message.citations.length > 0 && (
                <div className="chat-citations" aria-label="Catalog records used">
                  <span>Catalog records</span>
                  {message.citations.map((citation) => (
                    <a key={`${citation.kind}:${citation.id}`} href={citation.href}>
                      {citation.label}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ))
        )}
        {working && (
          <p className="chat-working">
            {explorerStore.chatTool
              ? `Querying ${explorerStore.chatTool.replaceAll('_', ' ')}…`
              : 'Thinking…'}
          </p>
        )}
        {explorerStore.chatErrorMessage && (
          <p className="chat-error">{explorerStore.chatErrorMessage}</p>
        )}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          void explorerStore.sendChat();
        }}
      >
        <label htmlFor="chat-question">Question</label>
        <textarea
          id="chat-question"
          rows={3}
          maxLength={2000}
          value={explorerStore.chatDraft}
          onChange={(event) => explorerStore.setChatDraft(event.target.value)}
          placeholder="Ask about events, magnitudes, locations, or candidate series…"
        />
        <button type="submit" disabled={working || !explorerStore.chatDraft.trim()}>
          {working ? 'Answering…' : 'Ask the catalog'}
        </button>
      </form>
    </section>
  );
});
