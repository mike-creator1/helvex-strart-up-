/* HelveX shared AI client — call any /api/* streaming endpoint and parse
   Anthropic SSE events into clean text/JSON for the caller.
   Loaded by every app-* page that runs Claude-powered features. */

(function (global) {
  /**
   * Run a Claude-powered endpoint with streaming.
   *
   * @param {string} endpoint  e.g. '/api/generate-campaign'
   * @param {object} payload   request JSON body
   * @param {object} hooks
   *   - onChunk(deltaText, totalChars)  — fires per text delta
   *   - onDone(fullText)                — fires when stream completes
   *   - onError(err)                    — fires on any failure
   *
   * Returns a Promise that resolves with the full accumulated text.
   */
  async function runStream(endpoint, payload, hooks = {}) {
    const { onChunk, onDone, onError } = hooks;
    let assembled = '';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl;
        while ((nl = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 2);
          const dataLine = block.split('\n').find(l => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine.slice(6));
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              assembled += ev.delta.text;
              if (onChunk) onChunk(ev.delta.text, assembled.length);
            }
          } catch { /* skip malformed SSE events */ }
        }
      }

      if (onDone) onDone(assembled);
      return assembled;
    } catch (err) {
      if (onError) onError(err);
      throw err;
    }
  }

  /**
   * Strip surrounding markdown/code fences and parse the result as JSON.
   * Defensive — finds the outermost {...} so trailing chatter doesn't break it.
   */
  function extractJson(raw) {
    let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const first = text.indexOf('{');
    const last  = text.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('No JSON object in response');
    return JSON.parse(text.slice(first, last + 1));
  }

  /**
   * Tiny HTML escape — for safely interpolating model output into the DOM.
   */
  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  /**
   * Copy text to clipboard and animate a button as "Copied ✓" for 1.6s.
   */
  function copyToClipboard(text, btnEl) {
    return navigator.clipboard.writeText(text).then(() => {
      if (!btnEl) return;
      const original = btnEl.textContent;
      btnEl.textContent = 'Copied ✓';
      btnEl.classList.add('copied');
      setTimeout(() => {
        btnEl.textContent = original || 'Copy';
        btnEl.classList.remove('copied');
      }, 1600);
    });
  }

  /**
   * Open/close a modal by id. Locks body scroll while open.
   */
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    document.body.style.overflow = '';
  }

  /**
   * Wire common modal behaviour (click-outside + Esc close + close button).
   * The close button must have data-modal-close="<modalId>" attribute.
   */
  function wireModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(id); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(id);
    });
    modal.querySelectorAll(`[data-modal-close="${id}"]`).forEach((btn) => {
      btn.addEventListener('click', () => closeModal(id));
    });
  }

  global.HXAI = {
    runStream,
    extractJson,
    esc,
    copyToClipboard,
    openModal,
    closeModal,
    wireModal,
  };
})(window);
