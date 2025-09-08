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
            comments
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

    function groupTicketsByAssignee(tickets) {
      return tickets.reduce((acc, t) => {
        const assignee = t.assignee || 'Unassigned';
        if (!acc[assignee]) acc[assignee] = { userStories: [], tasks: [], raw: [] };
        acc[assignee].raw.push(t);
        if ((t.type || '').toLowerCase().includes('story')) acc[assignee].userStories.push(t);
        else acc[assignee].tasks.push(t);
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
      const grouped = groupTicketsByAssignee(tickets);
      const stats = {
        totalTickets: tickets.length,
        userStories: tickets.filter(t => (t.type || '').toLowerCase().includes('story')).length,
        tasks: tickets.filter(t => (t.type || '').toLowerCase().includes('task')).length,
        assignees: Object.keys(grouped).length
      };
      currentData = { tickets, groupedTickets: grouped, stats };

      // build HTML incrementally (avoid deep nested template problems)
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
      html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px;display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:12px;color:#6b7280;">Assignees</div><div style="font-weight:600;font-size:18px;">${stats.assignees}</div></div><div style="font-size:20px;color:#8b5cf6;">👥</div></div>`;
      html += `</div>`; // stats end

      // assignees list
      html += `<div style="display:flex;flex-direction:column;gap:16px;">`;

      Object.entries(grouped).forEach(([assignee, bucket], assigneeIndex) => {
        // build tasks by parent for this assignee
        const tasksByParent = (bucket.tasks || []).reduce((acc, t) => {
          const parent = t.parentKey || 'standalone';
          if (!acc[parent]) acc[parent] = [];
          acc[parent].push(t);
          return acc;
        }, {});

        html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">`;
        html += `<div style="padding:24px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="window.toggleJiraSection('assignee-${assigneeIndex}')">`;
        html += `<div style="display:flex;align-items:center;gap:12px;"><div style="width:48px;height:48px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;color:#1d4ed8;font-weight:700;">${assignee.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}</div><div><div style="font-weight:700;color:#111827;">${assignee}</div><div style="font-size:12px;color:#6b7280;">${bucket.userStories.length} Stories, ${bucket.tasks.length} Tasks</div></div></div>`;
        html += `<div><button data-toggle="assignee-${assigneeIndex}" data-collapsed-text="▶" data-expanded-text="▼" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;padding:8px;border-radius:6px;">▶</button></div>`;
        html += `</div>`; // assignee header

        // assignee content
        html += `<div id="assignee-${assigneeIndex}" style="padding:24px;display:none;">`;

        // iterate stories
        (bucket.userStories || []).forEach((story, storyIndex) => {
          const lastComment = (story.comments && story.comments.length) ? story.comments[story.comments.length - 1] : null;

          html += `<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:16px;">`;

          // story box (left)
          html += `<div style="flex:2;border-left:4px solid #3b82f6;background:#f8fafc;border-radius:0 8px 8px 0;">`;
          html += `<div style="padding:16px;">`;
          html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">`;
          html += `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">`;
          html += `<div style="background:#3b82f6;color:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:500;">📖 STORY</div>`;
          html += `<a href="${story.link}" target="_blank" style="font-weight:500;color:#3b82f6;text-decoration:none;">${story.key}</a>`;
          html += `<div style="background:${getStatusColor(story.status)};color:white;padding:2px 6px;border-radius:4px;font-size:12px;">${story.status}</div>`;
          html += `<div style="background:${getPriorityColor(story.priority)};color:white;padding:2px 6px;border-radius:4px;font-size:12px;">${story.priority}</div>`;
          if (lastComment) html += `<div style="font-size:12px;color:#6b7280;margin-left:8px;">💬 Last: ${formatDate(lastComment.created)}</div>`;
          html += `</div>`; // left meta

          // expand button for related tasks
          if (tasksByParent[story.key]) {
            html += `<div><button data-toggle="story-${assigneeIndex}-${storyIndex}" data-collapsed-text="▶" data-expanded-text="▼" onclick="window.toggleJiraSection('story-${assigneeIndex}-${storyIndex}')" style="background:none;border:none;font-size:16px;cursor:pointer;color:#6b7280;padding:4px;">▶</button></div>`;
          } else {
            html += `<div style="width:28px"></div>`;
          }

          html += `</div>`; // story header row

          // summary + description toggle
          html += `<h4 style="margin:0 0 8px 0;font-weight:500;color:#111827;">${story.summary}</h4>`;
          if (story.description) {
            html += `<div>`;
            html += `<button data-toggle="description-${assigneeIndex}-${storyIndex}" data-collapsed-text="📝 View Description ▶" data-expanded-text="📝 Hide Description ▼" onclick="window.toggleJiraSection('description-${assigneeIndex}-${storyIndex}')" style="background:none;border:none;color:#3b82f6;cursor:pointer;margin-bottom:8px;">📝 View Description ▶</button>`;
            html += `<div id="description-${assigneeIndex}-${storyIndex}" style="display:none;margin:8px 0 12px 0;"><div class="jira-description" style="padding:8px;background:#ffffff;border-radius:6px;border:1px solid #e5e7eb;color:#6b7280;">${story.description}</div></div>`;
            html += `</div>`;
          }

          // related tasks (collapsed by default)
          if (tasksByParent[story.key]) {
            html += `<div id="story-${assigneeIndex}-${storyIndex}" style="display:none;margin-top:16px;">`;
            html += `<h5 style="margin:0 0 8px 0;font-size:12px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Related Tasks</h5>`;
            tasksByParent[story.key].forEach(task => {
              html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px;">`;
              html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><div style="background:#6b7280;color:white;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:500;">✓ TASK</div><a href="${task.link}" target="_blank" style="font-weight:500;font-size:14px;color:#6b7280;text-decoration:none;">${task.key}</a><div style="background:${getStatusColor(task.status)};color:white;padding:1px 4px;border-radius:3px;font-size:11px;margin-left:6px;">${task.status}</div><div style="background:${getPriorityColor(task.priority)};color:white;padding:1px 4px;border-radius:3px;font-size:11px;margin-left:4px;">${task.priority}</div></div>`;
              html += `<div style="font-weight:500;font-size:14px;color:#111827;margin-bottom:6px;">${task.summary}</div>`;
              if (task.description) html += `<div class="jira-description" style="font-size:13px;color:#6b7280;line-height:1.4;margin-bottom:8px;">${task.description}</div>`;
              html += `<div style="display:flex;gap:12px;font-size:11px;color:#6b7280;"><span><strong>Created:</strong> ${formatDate(task.created)}</span><span><strong>Updated:</strong> ${formatDate(task.updated)}</span></div>`;
              html += `</div>`;
            });
            html += `</div>`;
          }

          html += `</div></div>`; // story box end

          // comments box (right)
          html += `<div style="flex:1;min-width:220px;max-width:350px;background:#f1f5f9;border-radius:8px;padding:16px;box-sizing:border-box;">`;
          if (story.comments && story.comments.length) {
            html += `<button data-toggle="comments-${assigneeIndex}-${storyIndex}" data-collapsed-text="💬 ${story.comments.length} Comment${story.comments.length>1? 's':''} ▶" data-expanded-text="💬 Hide Comments ▼" onclick="window.toggleJiraSection('comments-${assigneeIndex}-${storyIndex}')" style="background:none;border:none;font-size:14px;cursor:pointer;color:#3b82f6;margin-bottom:8px;">💬 ${story.comments.length} Comment${story.comments.length>1? 's':''} ▶</button>`;
            html += `<div id="comments-${assigneeIndex}-${storyIndex}" style="display:none;margin:8px 0 0 0;">`;
            story.comments.forEach(c => {
              html += `<div style="margin-bottom:10px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;"><div style="font-size:12px;color:#6b7280;margin-bottom:2px;"><strong>${c.author}</strong> <span style="font-size:11px;color:#94a3b8;">${formatDate(c.created)}</span></div><div style="font-size:13px;color:#111827;">${c.body}</div></div>`;
            });
            html += `</div>`;
          } else {
            html += `<div style="color:#94a3b8;font-size:13px;">No comments</div>`;
          }
          html += `</div>`; // comments box end

          html += `</div>`; // row end
        });

        // standalone tasks
        if (tasksByParent.standalone) {
          html += `<div><h5 style="margin:0 0 12px 0;font-size:12px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Standalone Tasks</h5>`;
          tasksByParent.standalone.forEach(task => {
            html += `<div style="background:white;border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin-bottom:8px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><div style="background:#6b7280;color:white;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:500;">✓ TASK</div><a href="${task.link}" target="_blank" style="font-weight:500;font-size:14px;color:#6b7280;text-decoration:none;">${task.key}</a><div style="background:${getStatusColor(task.status)};color:white;padding:1px 4px;border-radius:3px;font-size:11px;margin-left:6px;">${task.status}</div><div style="background:${getPriorityColor(task.priority)};color:white;padding:1px 4px;border-radius:3px;font-size:11px;margin-left:4px;">${task.priority}</div></div><div style="font-weight:500;font-size:14px;color:#111827;margin-bottom:6px;">${task.summary}</div>${task.description?`<div class="jira-description" style="font-size:13px;color:#6b7280;line-height:1.4;margin-bottom:8px;">${task.description}</div>`:''}<div style="display:flex;gap:12px;font-size:11px;color:#6b7280;"><span><strong>Created:</strong> ${formatDate(task.created)}</span><span><strong>Updated:</strong> ${formatDate(task.updated)}</span></div></div>`;
          });
          html += `</div>`;
        }

        html += `</div>`; // assignee content end
        html += `</div>`; // assignee card end
      });

      html += `</div>`; // assignees list

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
    fetchJiraData().then(tickets => renderDashboard(tickets)).catch(err => { renderDashboard([]); console.error(err); });

  })();
};
