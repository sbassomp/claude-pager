export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>claude-pager dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: 'JetBrains Mono', monospace;
      min-height: 100vh;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid #21262d;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo h1 {
      font-size: 22px;
      font-weight: 700;
      color: #f0f6fc;
    }

    .cursor {
      display: inline-block;
      width: 10px;
      height: 20px;
      background: #58a6ff;
      animation: blink 1s step-end infinite;
      vertical-align: middle;
      margin-left: 4px;
    }

    @keyframes blink {
      50% { opacity: 0; }
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .status-dot.connected { background: #3fb950; box-shadow: 0 0 6px #3fb950; }
    .status-dot.disconnected { background: #f85149; box-shadow: 0 0 6px #f85149; }

    .meta {
      font-size: 12px;
      color: #484f58;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .project {
      margin-bottom: 28px;
    }

    .project-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .project-header h2 {
      font-size: 16px;
      font-weight: 600;
      color: #58a6ff;
    }

    .project-count {
      background: #21262d;
      color: #8b949e;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .project-path {
      font-size: 11px;
      color: #484f58;
      margin-left: auto;
    }

    .pin-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 14px;
      opacity: 0.3;
      transition: opacity 0.2s;
      padding: 2px 4px;
    }

    .pin-btn:hover { opacity: 0.7; }
    .pin-btn.pinned { opacity: 1; }

    .dismiss-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      opacity: 0.25;
      transition: opacity 0.2s;
      padding: 2px 4px;
    }

    .dismiss-btn:hover { opacity: 0.8; color: #f85149; }

    .ci-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 11px;
    }

    .ci-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 600;
      text-decoration: none;
      transition: opacity 0.2s;
    }

    .ci-badge:hover { opacity: 0.8; }

    .ci-badge.success { background: #0d2818; color: #3fb950; }
    .ci-badge.failed { background: #490202; color: #f85149; }
    .ci-badge.running { background: #0d419d; color: #58a6ff; animation: pulse 2s ease-in-out infinite; }
    .ci-badge.pending { background: #3d2e00; color: #d29922; }
    .ci-badge.canceled { background: #21262d; color: #8b949e; }
    .ci-badge.unknown { background: #21262d; color: #484f58; }

    .ci-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
    }

    .ci-dot.success { background: #3fb950; }
    .ci-dot.failed { background: #f85149; }
    .ci-dot.running { background: #58a6ff; }
    .ci-dot.pending { background: #d29922; }
    .ci-dot.canceled { background: #8b949e; }
    .ci-dot.unknown { background: #484f58; }

    .sessions {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 12px;
    }

    .card {
      background: #161b22;
      border: 1px solid #21262d;
      border-radius: 8px;
      padding: 16px;
      transition: border-color 0.2s, box-shadow 0.2s, opacity 0.3s;
    }

    .card:hover {
      border-color: #388bfd44;
      box-shadow: 0 0 12px #388bfd22;
    }

    .card.stale {
      opacity: 0.45;
      border-style: dashed;
    }

    .card.stale:hover {
      opacity: 0.8;
    }

    .card.active {
      border-color: #388bfd44;
      border-left: 3px solid #58a6ff;
    }

    .card.alert {
      border-color: #f0883e44;
      border-left: 3px solid #f0883e;
    }

    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .card-title {
      font-size: 14px;
      font-weight: 600;
      color: #f0f6fc;
      line-height: 1.3;
      flex: 1;
      margin-right: 8px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .card-title.expanded {
      -webkit-line-clamp: unset;
      overflow: visible;
      white-space: pre-wrap;
    }

    .expand-btn {
      background: none;
      border: none;
      color: #58a6ff;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      cursor: pointer;
      padding: 2px 0;
      opacity: 0.8;
    }

    .expand-btn:hover { opacity: 1; }

    .badge {
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 12px;
      white-space: nowrap;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge.working {
      background: #0d419d;
      color: #58a6ff;
      animation: pulse 2s ease-in-out infinite;
    }

    .badge.waiting_permission {
      background: #5a1e02;
      color: #f0883e;
    }

    .badge.waiting_input {
      background: #3d2e00;
      color: #d29922;
    }

    .badge.idle {
      background: #21262d;
      color: #8b949e;
    }

    .badge.unknown {
      background: #21262d;
      color: #484f58;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .pending-box {
      background: #1c1208;
      border: 1px solid #3d2e00;
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 10px;
      font-size: 12px;
      color: #d29922;
    }

    .pending-box .tool {
      color: #f0883e;
      font-weight: 600;
    }

    .pending-box .ago {
      color: #8b949e;
      float: right;
    }

    .action-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .action-btn {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 14px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
    }

    .action-btn:hover { opacity: 0.85; }
    .action-btn:active { transform: scale(0.96); }

    .action-btn.allow {
      background: #238636;
      color: #ffffff;
    }

    .action-btn.deny {
      background: #da3633;
      color: #ffffff;
    }

    .action-btn.allow-all {
      background: #1f6feb;
      color: #ffffff;
      margin-left: auto;
    }

    .action-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .reply-input {
      flex: 1;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid #30363d;
      background: #0d1117;
      color: #c9d1d9;
      outline: none;
    }

    .reply-input:focus {
      border-color: #58a6ff;
    }

    .git-row {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      margin-bottom: 6px;
    }

    .git-branch {
      color: #8b949e;
    }

    .git-branch::before {
      content: '⎇ ';
    }

    .git-modified {
      color: #f85149;
    }

    .git-unpushed {
      color: #d29922;
    }

    .git-clean {
      color: #3fb950;
    }

    .needs-testing {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      background: #490202;
      color: #f85149;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .flag {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      letter-spacing: 0.3px;
    }

    .flag.ok {
      background: #0d2818;
      color: #3fb950;
    }

    .flag.pending {
      background: #3d2e00;
      color: #d29922;
    }

    .card-footer {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
      font-size: 10px;
      color: #484f58;
    }

    .card-footer .spacer {
      margin-left: auto;
    }

    .notes-panel {
      background: #1a1e2e;
      border: 1px solid #2d333b;
      border-radius: 8px;
      padding: 12px;
      min-width: 0;
    }

    .notes-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #8b949e;
    }

    .notes-header .count {
      background: #2d333b;
      color: #c9d1d9;
      font-size: 10px;
      padding: 1px 7px;
      border-radius: 8px;
    }

    .note-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 4px;
      font-size: 12px;
      color: #c9d1d9;
      transition: background 0.15s;
    }

    .note-item:hover {
      background: #21262d;
    }

    .note-item .note-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .note-item .note-source {
      font-size: 9px;
      color: #484f58;
      text-transform: uppercase;
    }

    .note-item .note-age {
      font-size: 10px;
      color: #484f58;
    }

    .note-grip {
      cursor: grab;
      color: #484f58;
      font-size: 10px;
      user-select: none;
    }
    .note-item.dragging {
      opacity: 0.4;
    }
    .note-item.drag-over {
      border-top: 2px solid #58a6ff;
      margin-top: -2px;
    }
    .note-btn.move {
      background: none;
      color: #484f58;
      padding: 0 2px;
      font-size: 8px;
      min-width: 16px;
    }
    .note-btn.move:hover {
      color: #58a6ff;
    }
    .note-btn {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      transition: opacity 0.2s;
    }

    .note-btn:hover { opacity: 0.85; }

    .note-btn.send {
      background: #238636;
      color: #fff;
    }

    .note-btn.delete {
      background: #21262d;
      color: #8b949e;
    }

    .note-btn.delete:hover {
      background: #da3633;
      color: #fff;
    }

    .note-add-row {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }

    .empty {
      text-align: center;
      padding: 60px 20px;
      color: #484f58;
    }

    .empty h2 {
      font-size: 18px;
      color: #8b949e;
      margin-bottom: 8px;
    }

    .empty p {
      font-size: 13px;
    }

    @media (max-width: 768px) {
      body { padding: 12px; }

      header { flex-direction: column; align-items: flex-start; gap: 8px; }

      .logo h1 { font-size: 18px; }

      .sessions {
        grid-template-columns: 1fr;
        gap: 10px;
      }

      .project-header {
        flex-wrap: wrap;
      }

      .project-path { display: none; }

      .card { padding: 12px; }

      .card-title { font-size: 13px; }

      .action-btn {
        padding: 8px 18px;
        font-size: 13px;
      }

      .reply-input {
        font-size: 13px;
        padding: 8px 10px;
      }

      .ci-row { flex-wrap: wrap; gap: 6px; }

      .pending-box { font-size: 11px; }

      .pending-box code { font-size: 9px; }
    }

    @media (max-width: 480px) {
      body { padding: 8px; }

      .logo h1 { font-size: 16px; }

      .badge { font-size: 9px; padding: 2px 6px; }

      .git-row { flex-wrap: wrap; gap: 6px; }

      .action-btn {
        padding: 10px 20px;
        font-size: 14px;
      }

      .action-btn.allow-all {
        width: 100%;
        text-align: center;
      }
    }

    .scanline {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 0, 0, 0.03) 2px,
        rgba(0, 0, 0, 0.03) 4px
      );
      z-index: 999;
    }
  </style>
</head>
<body>
  <div class="scanline"></div>
  <header>
    <div class="logo">
      <h1>claude-pager<span class="cursor"></span></h1>
    </div>
    <div class="meta">
      <button class="action-btn allow-all" id="allowAllBtn" style="display:none" onclick="allowAll()">Allow All</button>
      <span class="status-dot connected" id="statusDot"></span>
      <span id="lastUpdate">connecting...</span>
    </div>
  </header>
  <main id="projects"></main>

  <script>
    let data = null;

    function getPinnedOrder() {
      try { return JSON.parse(localStorage.getItem('dashboard-pin-order') || '[]'); }
      catch { return []; }
    }

    function savePinnedOrder(order) {
      localStorage.setItem('dashboard-pin-order', JSON.stringify(order));
    }

    function togglePin(name) {
      const order = getPinnedOrder();
      const idx = order.indexOf(name);
      if (idx >= 0) {
        order.splice(idx, 1);
      } else {
        order.push(name);
      }
      savePinnedOrder(order);
      if (data) render(data);
    }

    function sortProjects(projects) {
      const pinned = getPinnedOrder();
      return [...projects].sort((a, b) => {
        const aPin = pinned.indexOf(a.name);
        const bPin = pinned.indexOf(b.name);
        const aIsPinned = aPin >= 0;
        const bIsPinned = bPin >= 0;
        // Pinned projects first, in their pinned order
        if (aIsPinned && bIsPinned) return aPin - bPin;
        if (aIsPinned) return -1;
        if (bIsPinned) return 1;
        // Unpinned: keep the original sort (by state)
        return 0;
      });
    }

    function escapeHtml(s) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function timeAgo(epochMs) {
      if (!epochMs) return 'unknown';
      const s = Math.floor((Date.now() - epochMs) / 1000);
      if (s < 10) return 'just now';
      if (s < 60) return s + 's ago';
      if (s < 3600) return Math.floor(s / 60) + 'm ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      return Math.floor(s / 86400) + 'd ago';
    }

    function stateLabel(state) {
      const labels = {
        working: 'Working',
        waiting_permission: 'Permission',
        waiting_input: 'Waiting',
        idle: 'Idle',
        unknown: '?',
      };
      return labels[state] || state;
    }

    function renderSession(s) {
      const ageMs = Date.now() - s.lastActivity;
      const isStale = (s.state === 'idle' || s.state === 'unknown') && ageMs > 2 * 3600_000;
      const isAlert = s.state === 'waiting_permission' || s.state === 'waiting_input';
      const isActive = s.state === 'working';
      const cardClass = isStale ? 'stale' : isAlert ? 'alert' : isActive ? 'active' : '';

      let pending = '';
      if (s.pendingQuestion) {
        const q = s.pendingQuestion;
        const isPermission = q.type === 'permission_prompt';
        const contextInfo = q.context
          ? '<div style="font-size:11px;color:#c9d1d9;margin-bottom:6px;white-space:pre-wrap">' + escapeHtml(q.context.slice(-300)) + '</div>'
          : '';
        const toolInfo = q.toolName
          ? contextInfo + '<span class="tool">' + escapeHtml(q.toolName) + '</span>' +
            (q.toolInput ? '<br><code style="font-size:10px;color:#8b949e;word-break:break-all">' + escapeHtml(q.toolInput.slice(0, 200)) + '</code>' : '')
          : escapeHtml(q.message.slice(0, 150));

        const actions = isPermission
          ? \`<div class="action-row">
              <button class="action-btn allow" onclick="respondTo('\${q.eventId}', 'allow', this)">✓ Allow</button>
              <button class="action-btn deny" onclick="respondTo('\${q.eventId}', 'deny', this)">✗ Deny</button>
            </div>\`
          : \`<div class="action-row" style="align-items:center">
              <input type="text" class="reply-input" id="reply-\${q.eventId}" placeholder="Type a reply..." onkeydown="if(event.key==='Enter')respondTo('\${q.eventId}',this.value,this)">
              <button class="action-btn allow" onclick="respondTo('\${q.eventId}',document.getElementById('reply-\${q.eventId}').value,this)">Send</button>
            </div>\`;

        pending = \`
          <div class="pending-box">
            <span class="ago">\${timeAgo(Date.now() - q.agoSeconds * 1000)}</span>
            \${toolInfo}
            \${actions}
          </div>
        \`;
      }

      const hasGit = s.git.branch !== 'unknown';

      const gitParts = [];
      if (hasGit) {
        gitParts.push('<span class="git-branch">' + escapeHtml(s.git.branch) + '</span>');
        gitParts.push(s.git.modifiedFiles > 0
          ? '<span class="git-modified">' + s.git.modifiedFiles + ' mod</span>'
          : '<span class="git-clean">clean</span>');
        if (s.git.unpushedCommits > 0) gitParts.push('<span class="git-unpushed">' + s.git.unpushedCommits + ' unpush</span>');
        gitParts.push(s.committed
          ? '<span class="flag ok">✓ commit</span>'
          : '<span class="flag pending">○ uncommit</span>');
        gitParts.push(s.pushed
          ? '<span class="flag ok">✓ push</span>'
          : '<span class="flag pending">○ unpush</span>');
      }

      // Show reply input for idle/waiting sessions without a pending question
      const idleInput = (!s.pendingQuestion && (s.state === 'idle' || s.state === 'waiting_input' || s.state === 'unknown'))
        ? \`<div class="action-row" style="margin-top:6px">
            <input type="text" class="reply-input" id="idle-\${s.sessionId}" placeholder="Send a message..." onkeydown="if(event.key==='Enter')sendToSession('\${s.sessionId}',this.value,this)">
            <button class="action-btn allow" onclick="sendToSession('\${s.sessionId}',document.getElementById('idle-\${s.sessionId}').value,this)">Send</button>
          </div>\`
        : '';

      const titleId = 'title-' + s.sessionId.slice(0, 8);
      const longTitle = s.title.length > 80;
      const expandBtn = longTitle ? \`<button class="expand-btn" onclick="document.getElementById('\${titleId}').classList.toggle('expanded');this.textContent=this.textContent==='...'?'▲':'...'">...</button>\` : '';

      return \`
        <div class="card \${cardClass}">
          <div class="card-header">
            <span class="card-title" id="\${titleId}">\${escapeHtml(s.title)}</span>
            <span class="badge \${s.state}">\${stateLabel(s.state)}</span>
            <button class="dismiss-btn" onclick="dismissSession('\${s.sessionId}')" title="Dismiss session">🗑</button>
          </div>
          \${expandBtn}
          \${pending}
          \${idleInput}
          <div class="card-footer">
            \${gitParts.join(' ')}
            <span class="spacer"></span>
            <span>pane \${escapeHtml(s.tmuxPane)}</span>
            <span>\${timeAgo(s.lastActivity)}</span>
          </div>
        </div>
      \`;
    }

    function renderPipeline(label, pipeline) {
      if (!pipeline) return '';
      const s = pipeline.status;
      const dot = '<span class="ci-dot ' + s + '"></span>';
      const text = label + ': ' + s;
      if (pipeline.url) {
        return '<a class="ci-badge ' + s + '" href="' + escapeHtml(pipeline.url) + '" target="_blank">' + dot + ' ' + text + '</a>';
      }
      return '<span class="ci-badge ' + s + '">' + dot + ' ' + text + '</span>';
    }

    function renderCI(ci) {
      if (!ci) return '';
      const main = renderPipeline('main', ci.main);
      const staging = renderPipeline('staging', ci.staging);
      return main + staging;
    }

    function renderNotes(project, notes) {
      if (!notes || notes.length === 0) {
        return \`
          <div class="notes-panel">
            <div class="notes-header">Notes</div>
            <div class="note-add-row">
              <input type="text" class="reply-input" id="note-add-\${escapeHtml(project)}" placeholder="Add a note..." onkeydown="if(event.key==='Enter')addNote('\${escapeHtml(project)}',this.value,this)">
              <button class="note-btn send" onclick="var i=document.getElementById('note-add-\${escapeHtml(project)}');addNote('\${escapeHtml(project)}',i.value,i)">+</button>
            </div>
          </div>
        \`;
      }

      const items = notes.map((n, idx) => \`
        <div class="note-item" draggable="true" data-note-id="\${n.id}" data-project="\${escapeHtml(project)}"
          ondragstart="onNoteDragStart(event)" ondragover="onNoteDragOver(event)" ondrop="onNoteDrop(event)" ondragend="onNoteDragEnd(event)">
          <span class="note-grip" title="Drag to reorder">⠿</span>
          <span class="note-text" title="\${escapeHtml(n.text)}">\${escapeHtml(n.text)}</span>
          <span class="note-source">\${n.source}</span>
          <span class="note-age">\${timeAgo(n.createdAt)}</span>
          \${idx > 0 ? '<button class="note-btn move" onclick="moveNote(\\'' + escapeHtml(project) + '\\',' + idx + ',-1)" title="Move up">▲</button>' : '<span class="note-btn move" style="visibility:hidden">▲</span>'}
          \${idx < notes.length - 1 ? '<button class="note-btn move" onclick="moveNote(\\'' + escapeHtml(project) + '\\',' + idx + ',1)" title="Move down">▼</button>' : '<span class="note-btn move" style="visibility:hidden">▼</span>'}
          <button class="note-btn send" onclick="sendNote('\${n.id}',this)" title="Send to session">▶</button>
          <button class="note-btn delete" onclick="deleteNote('\${n.id}')" title="Delete">✕</button>
        </div>
      \`).join('');

      return \`
        <div class="notes-panel">
          <div class="notes-header">
            <span>Notes</span>
            <span class="count">\${notes.length}</span>
          </div>
          \${items}
          <div class="note-add-row">
            <input type="text" class="reply-input" id="note-add-\${escapeHtml(project)}" placeholder="Add a note..." onkeydown="if(event.key==='Enter')addNote('\${escapeHtml(project)}',this.value,this)">
            <button class="note-btn send" onclick="var i=document.getElementById('note-add-\${escapeHtml(project)}');addNote('\${escapeHtml(project)}',i.value,i)">+</button>
          </div>
        </div>
      \`;
    }

    function renderProject(p) {
      const isPinned = getPinnedOrder().includes(p.name);
      const anyNeedsTesting = p.sessions.some(s => s.needsTesting);
      const testBadge = anyNeedsTesting ? '<span class="needs-testing">needs testing</span>' : '';
      const ciBadges = renderCI(p.ci);
      const infoRow = (ciBadges || testBadge) ? '<div class="ci-row">' + ciBadges + testBadge + '</div>' : '';

      return \`
        <div class="project">
          <div class="project-header">
            <button class="pin-btn \${isPinned ? 'pinned' : ''}" onclick="togglePin('\${escapeHtml(p.name)}')" title="\${isPinned ? 'Unpin' : 'Pin'}">\${isPinned ? '📌' : '📌'}</button>
            <h2>\${escapeHtml(p.name)}</h2>
            <span class="project-count">\${p.sessions.length} session\${p.sessions.length > 1 ? 's' : ''}</span>
            <span class="project-path">\${escapeHtml(p.path)}</span>
          </div>
          \${infoRow}
          <div class="sessions">
            \${p.sessions.map(renderSession).join('')}
            \${renderNotes(p.name, p.notes)}
          </div>
        </div>
      \`;
    }

    function countPending(data) {
      let count = 0;
      for (const p of data.projects) {
        for (const s of p.sessions) {
          if (s.pendingQuestion && s.pendingQuestion.type === 'permission_prompt') count++;
        }
      }
      return count;
    }

    function render(data) {
      const container = document.getElementById('projects');
      if (!data.projects || data.projects.length === 0) {
        container.innerHTML = \`
          <div class="empty">
            <h2>No active sessions</h2>
            <p>Start Claude Code in tmux and sessions will appear here.</p>
          </div>
        \`;
        document.getElementById('allowAllBtn').style.display = 'none';
        return;
      }

      const pendingCount = countPending(data);
      const allowAllBtn = document.getElementById('allowAllBtn');
      if (pendingCount > 1) {
        allowAllBtn.style.display = 'inline-block';
        allowAllBtn.textContent = 'Allow All (' + pendingCount + ')';
      } else {
        allowAllBtn.style.display = 'none';
      }

      // Skip DOM update if user is typing in an input field
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

      // Preserve expanded title state across re-renders
      const expandedTitles = new Set();
      document.querySelectorAll('.card-title.expanded').forEach(el => expandedTitles.add(el.id));

      container.innerHTML = sortProjects(data.projects).map(renderProject).join('');

      // Restore expanded titles
      expandedTitles.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.classList.add('expanded');
          const btn = el.parentElement?.querySelector('.expand-btn');
          if (btn) btn.textContent = '▲';
        }
      });
    }

    function showSentBanner(card, icon, text) {
      if (!card) return;
      const old = card.querySelector('.sent-banner');
      if (old) old.remove();
      const banner = document.createElement('div');
      banner.className = 'sent-banner';
      banner.innerHTML = '<span style="font-weight:600">' + icon + '</span> ' + escapeHtml(text.length > 120 ? text.slice(0, 120) + '...' : text);
      banner.style.cssText = 'background:#0d2818;border:1px solid #238636;border-radius:6px;padding:6px 10px;margin:8px 0;font-size:12px;color:#c9d1d9;white-space:pre-wrap;';
      const footer = card.querySelector('.card-footer');
      if (footer) card.insertBefore(banner, footer);
      else card.appendChild(banner);
      card.style.boxShadow = '0 0 16px #238636';
      setTimeout(() => { card.style.boxShadow = ''; }, 5000);
    }

    async function respondTo(eventId, response, btn) {
      if (btn) btn.disabled = true;
      const card = btn?.closest('.card');
      try {
        const res = await fetch('/api/v1/respond-to', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, response }),
        });
        if (res.ok) {
          const label = response === 'allow' ? '✓ Allowed' : response === 'deny' ? '✗ Denied' : response;
          showSentBanner(card, '↩', label);
          fetchDashboard();
        } else {
          const err = await res.json();
          console.error('respond-to failed:', err);
        }
      } catch (e) {
        console.error('respond-to error:', e);
      }
      if (btn) btn.disabled = false;
    }

    async function dismissSession(sessionId) {
      try {
        await fetch('/api/v1/dismiss-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        fetchDashboard();
      } catch (e) {
        console.error('dismiss error:', e);
      }
    }

    async function sendToSession(sessionId, text, btn) {
      if (!text || !text.trim()) return;
      if (btn) btn.disabled = true;
      const card = btn?.closest('.card');
      const input = card?.querySelector('input');
      if (input) { input.value = ''; input.blur(); }
      try {
        const res = await fetch('/api/v1/send-to', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, text: text.trim() }),
        });
        if (res.ok) {
          showSentBanner(card, '▶', text.trim());
          fetchDashboard();
        } else {
          const err = await res.json();
          console.error('send-to failed:', err);
        }
      } catch (e) {
        console.error('send-to error:', e);
      }
      if (btn) btn.disabled = false;
    }

    let addingNote = false;
    async function addNote(project, text, input) {
      if (!text || !text.trim() || addingNote) return;
      addingNote = true;
      if (input) { input.value = ''; input.blur(); }
      try {
        await fetch('/api/v1/notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, text: text.trim(), source: 'dashboard' }),
        });
        fetchDashboard();
      } catch (e) {
        console.error('add-note error:', e);
      }
      addingNote = false;
    }

    async function deleteNote(noteId) {
      try {
        await fetch('/api/v1/notes/' + noteId, { method: 'DELETE' });
        fetchDashboard();
      } catch (e) {
        console.error('delete-note error:', e);
      }
    }

    async function sendNote(noteId, btn) {
      if (btn) btn.disabled = true;
      const noteText = btn?.closest('.note-item')?.querySelector('.note-text')?.textContent || '';
      try {
        const res = await fetch('/api/v1/notes/' + noteId + '/send', { method: 'POST' });
        const result = await res.json();
        if (!res.ok) {
          showToast(btn, result.error || 'Failed to send', true);
        } else {
          if (result.sessionId) {
            const card = document.querySelector('#title-' + result.sessionId.slice(0, 8))?.closest('.card');
            showSentBanner(card, '▶', noteText);
          }
          showToast(btn, 'Sent', false);
        }
        fetchDashboard();
      } catch (e) {
        console.error('send-note error:', e);
      }
      if (btn) btn.disabled = false;
    }

    function getProjectNoteIds(project) {
      return Array.from(document.querySelectorAll('.note-item[data-project="' + project + '"]'))
        .map(el => el.dataset.noteId);
    }

    async function saveNoteOrder(project) {
      const orderedIds = getProjectNoteIds(project);
      try {
        await fetch('/api/v1/notes/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project, orderedIds }),
        });
      } catch (e) {
        console.error('reorder error:', e);
      }
    }

    function moveNote(project, idx, direction) {
      const items = document.querySelectorAll('.note-item[data-project="' + project + '"]');
      const target = idx + direction;
      if (target < 0 || target >= items.length) return;
      const parent = items[0].parentNode;
      if (direction === -1) parent.insertBefore(items[idx], items[target]);
      else parent.insertBefore(items[target], items[idx]);
      saveNoteOrder(project);
    }

    let draggedNote = null;
    function onNoteDragStart(e) {
      draggedNote = e.currentTarget;
      draggedNote.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
    function onNoteDragOver(e) {
      e.preventDefault();
      const item = e.currentTarget;
      if (item !== draggedNote) item.classList.add('drag-over');
    }
    function onNoteDrop(e) {
      e.preventDefault();
      const target = e.currentTarget;
      target.classList.remove('drag-over');
      if (!draggedNote || target === draggedNote) return;
      const parent = target.parentNode;
      const items = Array.from(parent.querySelectorAll('.note-item'));
      const fromIdx = items.indexOf(draggedNote);
      const toIdx = items.indexOf(target);
      if (fromIdx < toIdx) parent.insertBefore(draggedNote, target.nextSibling);
      else parent.insertBefore(draggedNote, target);
      saveNoteOrder(draggedNote.dataset.project);
    }
    function onNoteDragEnd(e) {
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      if (draggedNote) draggedNote.classList.remove('dragging');
      draggedNote = null;
    }

    function showToast(anchor, text, isError) {
      const toast = document.createElement('span');
      toast.textContent = (isError ? '✗ ' : '✓ ') + text;
      toast.style.cssText = 'position:absolute;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:600;z-index:10;pointer-events:none;'
        + (isError ? 'background:#490202;color:#f85149;' : 'background:#0d2818;color:#3fb950;');
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        toast.style.left = rect.left + 'px';
        toast.style.top = (rect.top - 24) + 'px';
      } else {
        toast.style.right = '24px';
        toast.style.top = '70px';
      }
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    async function allowAll() {
      if (!data) return;
      const pending = [];
      for (const p of data.projects) {
        for (const s of p.sessions) {
          if (s.pendingQuestion && s.pendingQuestion.type === 'permission_prompt') {
            pending.push(s.pendingQuestion);
          }
        }
      }
      for (const q of pending) {
        await respondTo(q.eventId, 'allow', null);
      }
      fetchDashboard();
    }

    async function fetchDashboard() {
      try {
        const res = await fetch('/api/v1/dashboard');
        data = await res.json();
        render(data);
        document.getElementById('statusDot').className = 'status-dot connected';
        document.getElementById('lastUpdate').textContent = 'updated ' + timeAgo(data.updatedAt);
      } catch {
        document.getElementById('statusDot').className = 'status-dot disconnected';
        document.getElementById('lastUpdate').textContent = 'disconnected';
      }
    }

    fetchDashboard();

    // SSE for instant push — polling as fallback
    let fallbackTimer = setInterval(fetchDashboard, 10000);
    function connectSSE() {
      const es = new EventSource('/api/v1/sse');
      es.addEventListener('refresh', () => fetchDashboard());
      es.onopen = () => {
        clearInterval(fallbackTimer);
        fallbackTimer = setInterval(fetchDashboard, 10000);
      };
      es.onerror = () => {
        es.close();
        clearInterval(fallbackTimer);
        fallbackTimer = setInterval(fetchDashboard, 2000);
        setTimeout(connectSSE, 3000);
      };
    }
    connectSSE();
  </script>
</body>
</html>`;
