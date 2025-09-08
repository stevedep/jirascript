// jira-dashboard.js - Refactored, self-contained
// Small, robust renderer that parses JIRA XML, extracts comments, and renders a dashboard
window.createJiraDashboard = function(config) {
  const { JIRA_URL, BEARER_TOKEN } = config;

  (function() {
    // state
    let currentData = { tickets: [], groupedTickets: {}, stats: {} };

    // fetch
    async function fetchJiraData() {
      const response = await fetch(JIRA_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Accept': 'application/xml'
        }
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const xmlText = await response.text();
      return parseJiraXML(xmlText);
    }

    // parse
    function parseJiraXML(xmlText) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const tickets = [];
      const items = xmlDoc.querySelectorAll('item');

      items.forEach(item => {
        try {
          const descriptionElement = item.querySelector('description');
          let description = '';
          if (descriptionElement) {
            description = (descriptionElement.textContent || '')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .trim();
          }

          // comments
          const commentsNode = item.querySelector('comments');
          let comments = [];
          if (commentsNode) {
            comments = Array.from(commentsNode.querySelectorAll('comment')).map(c => ({
              id: c.getAttribute('id') || null,
              author: c.getAttribute('author') || c.getAttribute('username') || 'Unknown',
              created: c.getAttribute('created') || null,
              body: (c.textContent || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
            }));
          }

          // Parse Sprint from customfields
          let sprint = 'No Sprint';
          const customfields = item.querySelectorAll('customfield');
          customfields.forEach(cf => {
            const name = cf.querySelector('customfieldname')?.textContent || '';
            if (name === 'Sprint') {
              const val = cf.querySelector('customfieldvalue')?.textContent;
              if (val) sprint = val;
            }
          });

          const ticket = {
            id: item.querySelector('guid')?.textContent || item.querySelector('link')?.textContent || '',
            key: item.querySelector('key')?.textContent || (item.querySelector('title')?.textContent || '').split(':')[0] || '',
            summary: item.querySelector('summary')?.textContent || item.querySelector('title')?.textContent?.replace(/^[^:]*:\s*/, '') || '',
            description,
            type: item.querySelector('type')?.textContent || 'Task',
            status: item.querySelector('status')?.textContent || 'Unknown',
            assignee: item.querySelector('assignee')?.textContent || item.querySelector('reporter')?.textContent || 'Unassigned',
            priority: item.querySelector('priority')?.textContent || 'Medium',
            updated: item.querySelector('updated')?.textContent || item.querySelector('pubDate')?.textContent || new Date().toISOString(),
            created: item.querySelector('created')?.textContent || item.querySelector('pubDate')?.textContent || new Date().toISOString(),
            parentKey: item.querySelector('parent')?.textContent || undefined,
            link: item.querySelector('link')?.textContent || '',
            comments,
            sprint
          };

          if (ticket.key) tickets.push(ticket);
        } catch (e) {
          console.warn('Failed to parse ticket', e);
        }
      });

      return tickets;
    }

    // helpers
    function formatDate(dateString) {
      if (!dateString) return '';
      try {
        const d = new Date(dateString);
        return d.toLocaleString();
      } catch (e) {
        return dateString;
      }
    }

    const getStatusColor = (s = '') => {
      const status = s.toLowerCase();
      if (status.includes('done') || status.includes('closed')) return '#22c55e';
      if (status.includes('progress')) return '#3b82f6';
      if (status.includes('todo') || status.includes('to do')) return '#f59e0b';
      if (status.includes('blocked')) return '#ef4444';
      return '#6b7280';
    };

    const getPriorityColor = (p = '') => {
      const priority = p.toLowerCase();
      if (priority.includes('highest') || priority.includes('critical')) return '#dc2626';
      if (priority.includes('high')) return '#ea580c';
      if (priority.includes('medium')) return '#ca8a04';
      if (priority.includes('low')) return '#16a34a';
      return '#6b7280';
    };

    // Group tickets by sprint, then by assignee, then by user stories
    function groupTicketsBySprintAndAssignee(tickets) {
      return tickets.reduce((acc, t) => {
        const sprint = t.sprint || 'No Sprint';
        if (!acc[sprint]) acc[sprint] = {};
        const assignee = t.assignee || 'Unassigned';
        if (!acc[sprint][assignee]) acc[sprint][assignee] = { userStories: [], tasks: [], raw: [] };
        acc[sprint][assignee].raw.push(t);
        if ((t.type || '').toLowerCase().includes('story')) acc[sprint][assignee].userStories.push(t);
        else acc[sprint][assignee].tasks.push(t);
        return acc;
      }, {});
    }

    // toggle helper (works with elements rendered below)
    window.toggleJiraSection = function(sectionId) {
      const el = document.getElementById(sectionId);
      const btn = document.querySelector(`[data-toggle="${sectionId}"]`);
      if (!el || !btn) return;
      const expanded = el.style.display !== 'none';
      el.style.display = expanded ? 'none' : 'block';
      btn.textContent = expanded ? btn.getAttribute('data-collapsed-text') || '▶' : btn.getAttribute('data-expanded-text') || '▼';
    };

    // render
    function renderDashboard(tickets = []) {
      const grouped = groupTicketsBySprintAndAssignee(tickets);
      const stats = {
        totalTickets: tickets.length,
        userStories: tickets.filter(t => (t.type || '').toLowerCase().includes('story')).length,
        tasks: tickets.filter(t => (t.type || '').toLowerCase().includes('task')).length,
        sprints: Object.keys(grouped).length
      };
      currentData = { tickets, groupedTickets: grouped, stats };

      let html = '';
      html += `<div id="jira-dashboard-popup" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,sans-serif;">`;
      html += `<div style="background:white;border-radius:12px;width:90%;max-width:1200px;max-height:90%;overflow-y:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">`;

      // header
      html += `<div style="padding:16px 24px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:white;z-index:2;">`;
      html += `<div style="display:flex;align-items:center;gap:12px;"><div style="width:32px;height:32px;background:#3b82f6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">J</div><div><h1 style="margin:0;font-size:16px;">JIRA Sprint Dashboard</h1><div style="font-size:12px;color:#6b7280;">Live data</div></div></div>`;
      html += `<div><button onclick="document.getElementById('jira-dashboard-popup').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button></div>`;
      html += `</div>`; // header end

      html += `<div style="padding:24px;">`;

      // stats
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">`;
      html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:12px;color:#6b7280;">Total Tickets</div><div style="font-weight:600;font-size:18px;">${stats.totalTickets}</div></div><div style="font-size:20px;color:#3b82f6;">🎫</div></div>`;
      html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:12px;color:#6b7280;">User Stories</div><div style="font-weight:600;font-size:18px;">${stats.userStories}</div></div><div style="font-size:20px;color:#10b981;">📖</div></div>`;
      html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:12px;color:#6b7280;">Tasks</div><div style="font-weight:600;font-size:18px;">${stats.tasks}</div></div><div style="font-size:20px;color:#f59e0b;">✓</div></div>`;
      html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:12px;color:#6b7280;">Sprints</div><div style="font-weight:600;font-size:18px;">${stats.sprints}</div></div><div style="font-size:20px;color:#8b5cf6;">🏁</div></div>`;
      html += `</div>`; // stats end

      // Sprints list
      html += `<div style="display:flex;flex-direction:column;gap:24px;">`;
      Object.entries(grouped).forEach(([sprint, assignees], sprintIndex) => {
        html += `<div style="background:white;border:2px solid #3b82f6;border-radius:12px;overflow:hidden;">`;
        html += `<div style="padding:20px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;background:#eff6ff;" onclick="window.toggleJiraSection('sprint-${sprintIndex}')">`;
        html += `<div style="font-weight:700;color:#1d4ed8;font-size:18px;">${sprint}</div>`;
        html += `<div><button data-toggle="sprint-${sprintIndex}" data-collapsed-text="▶" data-expanded-text="▼" style="background:none;border:none;font-size:20px;cursor:pointer;color:#3b82f6;">▶</button></div>`;
        html += `</div>`;
        html += `<div id="sprint-${sprintIndex}" style="display:none;padding:20px;">`;

        // Per assignee in sprint
        Object.entries(assignees).forEach(([assignee, bucket], assigneeIndex) => {
          // Only user stories for this assignee
          const userStories = bucket.userStories;
          if (!userStories.length) return;
          html += `<div style="margin-bottom:24px;background:#f8fafc;border-radius:8px;border-left:4px solid #3b82f6;padding:16px;">`;
          html += `<div style="font-weight:700;color:#111827;font-size:15px;margin-bottom:8px;">${assignee}</div>`;
          userStories.forEach((story, storyIndex) => {
            html += `<div style="margin-bottom:16px;">`;
            html += `<div style="font-weight:600;font-size:15px;margin-bottom:4px;"><a href="${story.link}" target="_blank" style="color:#3b82f6;text-decoration:none;">${story.key}</a> - ${story.summary}</div>`;
            html += `<div style="font-size:13px;color:#6b7280;margin-bottom:8px;">${story.description || ''}</div>`;
            if (story.comments && story.comments.length) {
              html += `<div style="margin-top:8px;"><strong>Comments:</strong>`;
              story.comments.forEach(c => {
                html += `<div style="margin:8px 0 8px 0;padding:8px;background:#fff;border-radius:6px;border:1px solid #e5e7eb;"><span style="color:#3b82f6;font-weight:500;">${c.author}</span> <span style="color:#6b7280;font-size:12px;">${formatDate(c.created)}</span><div style="margin-top:4px;color:#111827;">${c.body}</div></div>`;
              });
              html += `</div>`;
            } else {
              html += `<div style="color:#94a3b8;font-size:13px;">No comments</div>`;
            }
            html += `</div>`;
          });
          html += `</div>`;
        });

        html += `</div></div>`;
      });
      html += `</div>`;

      html += `</div>`; // padding
      html += `</div>`; // outer modal
      html += `</div>`; // popup

      // insert
      const existing = document.getElementById('jira-dashboard-popup');
      if (existing) existing.remove();
      document.body.insertAdjacentHTML('beforeend', html);

      // click outside to close
      const popup = document.getElementById('jira-dashboard-popup');
      if (popup) popup.addEventListener('click', e => { if (e.target === popup) popup.remove(); });
    }

    // show loading
    function showLoading() {
      const loading = `<div id="jira-dashboard-popup" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,sans-serif;"><div style="background:white;border-radius:12px;padding:40px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);"><div style="width:40px;height:40px;border:4px solid #e5e7eb;border-top:4px solid #3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px auto;"></div><h3 style="margin:0 0 8px 0;color:#111827;">Fetching JIRA Data</h3><p style="margin:0;color:#6b7280;">Processing JIRA XML response...</p></div><style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style></div>`;
      const existing = document.getElementById('jira-dashboard-popup'); if (existing) existing.remove();
      document.body.insertAdjacentHTML('beforeend', loading);
    }

    // run
    showLoading();
    fetchJiraData().then(tickets => {
      renderDashboard(tickets)
      console.log('JIRA Dashboard rendered with', tickets.length, 'tickets', tickets);
  }).catch(err => { renderDashboard([]); console.error(err); });

  })();
};
