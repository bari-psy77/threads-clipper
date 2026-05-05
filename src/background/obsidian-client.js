export class ObsidianAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'ObsidianAuthError'; }
}
export class ObsidianConnectionError extends Error {
  constructor(msg) { super(msg); this.name = 'ObsidianConnectionError'; }
}
export class ObsidianHttpError extends Error {
  constructor(msg, status) { super(msg); this.name = 'ObsidianHttpError'; this.status = status; }
}

const SOURCE_RE = /^source:\s*(.+?)\s*$/m;

export class ObsidianClient {
  constructor({ apiHost, apiToken }) {
    this.apiHost = String(apiHost).replace(/\/+$/, '');
    this.apiToken = apiToken;
  }

  _url(vaultPath) {
    const cleaned = vaultPath.replace(/^\/+/, '');
    return `${this.apiHost}/vault/${cleaned}`;
  }

  _headers(extra = {}) {
    return { Authorization: `Bearer ${this.apiToken}`, ...extra };
  }

  async _do(req) {
    let res;
    try {
      res = await fetch(req.url, req.init);
    } catch (e) {
      throw new ObsidianConnectionError('Obsidian이 실행 중이고 Local REST API 플러그인이 켜져 있는지 확인하세요');
    }
    if (res.status === 401 || res.status === 403) {
      throw new ObsidianAuthError('API token이 잘못되었거나 누락되었습니다');
    }
    return res;
  }

  async putMarkdown(vaultPath, text) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: {
        method: 'PUT',
        headers: this._headers({ 'Content-Type': 'text/markdown' }),
        body: text,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ObsidianHttpError(`PUT ${vaultPath} failed: ${res.status} ${body}`, res.status);
    }
  }

  async putBinary(vaultPath, blob, mime) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: {
        method: 'PUT',
        headers: this._headers({ 'Content-Type': mime || 'application/octet-stream' }),
        body: blob,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ObsidianHttpError(`PUT ${vaultPath} failed: ${res.status} ${body}`, res.status);
    }
  }

  async noteExists(vaultPath) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: { method: 'GET', headers: this._headers() },
    });
    if (res.status === 404) return false;
    if (res.ok) return true;
    const body = await res.text();
    throw new ObsidianHttpError(`GET ${vaultPath} failed: ${res.status} ${body}`, res.status);
  }

  async readNoteSource(vaultPath) {
    const res = await this._do({
      url: this._url(vaultPath),
      init: { method: 'GET', headers: this._headers() },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new ObsidianHttpError(`GET ${vaultPath} failed: ${res.status} ${body}`, res.status);
    }
    const text = await res.text();
    const m = text.match(SOURCE_RE);
    return m ? m[1] : null;
  }
}
