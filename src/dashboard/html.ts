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
    }

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
      justify-content: space-between;
      margin-top: 10px;
      font-size: 10px;
      color: #484f58;
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
      <span class="status-dot connected" id="statusDot"></span>
      <span id="lastUpdate">connecting...</span>
    </div>
  </header>
  <main id="projects"></main>

  <script>
    let data = null;

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

      const pending = s.pendingQuestion ? \`
        <div class="pending-box">
          <span class="ago">\${s.pendingQuestion.agoSeconds}s ago</span>
          \${s.pendingQuestion.toolName ? '<span class="tool">' + escapeHtml(s.pendingQuestion.toolName) + '</span> — ' : ''}
          \${escapeHtml(s.pendingQuestion.message.slice(0, 120))}
        </div>
      \` : '';

      const gitStatus = s.git.modifiedFiles > 0
        ? '<span class="git-modified">' + s.git.modifiedFiles + ' modified</span>'
        : '<span class="git-clean">clean</span>';

      const unpushed = s.git.unpushedCommits > 0
        ? '<span class="git-unpushed">' + s.git.unpushedCommits + ' unpushed</span>'
        : '';

      const testing = s.needsTesting
        ? '<span class="needs-testing">needs testing</span>'
        : '';

      const hasGit = s.git.branch !== 'unknown';
      const commitFlag = hasGit ? (s.committed
        ? '<span class="flag ok">✓ committed</span>'
        : '<span class="flag pending">○ uncommitted</span>') : '';

      const pushFlag = hasGit ? (s.pushed
        ? '<span class="flag ok">✓ pushed</span>'
        : '<span class="flag pending">○ unpushed</span>') : '';

      return \`
        <div class="card \${cardClass}">
          <div class="card-header">
            <span class="card-title">\${escapeHtml(s.title)}</span>
            <span class="badge \${s.state}">\${stateLabel(s.state)}</span>
          </div>
          \${pending}
          \${hasGit ? \`<div class="git-row">
            <span class="git-branch">\${escapeHtml(s.git.branch)}</span>
            \${gitStatus}
            \${unpushed}
            \${testing}
          </div>
          <div class="git-row">
            \${commitFlag}
            \${pushFlag}
          </div>\` : ''}
          <div class="card-footer">
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
      if (!main && !staging) return '';
      return '<div class="ci-row">' + main + staging + '</div>';
    }

    function renderProject(p) {
      return \`
        <div class="project">
          <div class="project-header">
            <h2>\${escapeHtml(p.name)}</h2>
            <span class="project-count">\${p.sessions.length} session\${p.sessions.length > 1 ? 's' : ''}</span>
            <span class="project-path">\${escapeHtml(p.path)}</span>
          </div>
          \${renderCI(p.ci)}
          <div class="sessions">
            \${p.sessions.map(renderSession).join('')}
          </div>
        </div>
      \`;
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
        return;
      }
      container.innerHTML = data.projects.map(renderProject).join('');
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
    setInterval(fetchDashboard, 5000);
  </script>
</body>
</html>`;
