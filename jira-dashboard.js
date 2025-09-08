// jira-dashboard.js - Host this on GitHub Pages
window.createJiraDashboard = function(config) {
    const { JIRA_URL, BEARER_TOKEN } = config;
    
    (function() {
    
    let currentData = { tickets: [], groupedTickets: {}, stats: {} };
    let currentSort = { field: 'updated', direction: 'desc' };

    // Fetch and parse JIRA data
    async function fetchJiraData() {
        try {
            const response = await fetch(JIRA_URL, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${BEARER_TOKEN}`,
                    'Accept': 'application/xml'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlText = await response.text();
            return parseJiraXML(xmlText);
        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    // Parse XML to ticket objects with HTML preserved
    function parseJiraXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const tickets = [];
        
        const items = xmlDoc.querySelectorAll('item');
        
        items.forEach(item => {
            try {
                // Extract description with HTML preserved
                const descriptionElement = item.querySelector('description');
                let description = '';
                if (descriptionElement) {
                    const descText = descriptionElement.textContent || '';
                    // Keep HTML but clean up common JIRA artifacts
                    description = descText
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&amp;/g, '&')
                        .replace(/&quot;/g, '"')
                        .trim();
                }

                // Extract comments (if any)
                let comments = [];
                const commentsElement = item.querySelector('comments');
                if (commentsElement) {
                    comments = Array.from(commentsElement.querySelectorAll('comment')).map(commentEl => ({
                        id: commentEl.getAttribute('id'),
                        author: commentEl.getAttribute('author'),
                        created: commentEl.getAttribute('created'),
                        body: (commentEl.textContent || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
                    }));
                }

                const ticket = {
                    id: item.querySelector('guid')?.textContent || item.querySelector('link')?.textContent || '',
                    key: item.querySelector('key')?.textContent || item.querySelector('title')?.textContent?.split(':')[0] || '',
                    summary: item.querySelector('summary')?.textContent || item.querySelector('title')?.textContent?.replace(/^[^:]*:\s*/, '') || '',
                    description: description,
                    type: item.querySelector('type')?.textContent || 'Task',
                    status: item.querySelector('status')?.textContent || 'Unknown',
                    assignee: item.querySelector('assignee')?.textContent || item.querySelector('reporter')?.textContent || 'Unassigned',
                    priority: item.querySelector('priority')?.textContent || 'Medium',
                    updated: item.querySelector('updated')?.textContent || item.querySelector('pubDate')?.textContent || new Date().toISOString(),
                    created: item.querySelector('created')?.textContent || item.querySelector('pubDate')?.textContent || new Date().toISOString(),
                    parentKey: item.querySelector('parent')?.textContent || undefined,
                    link: item.querySelector('link')?.textContent || '',
                    comments: comments
                };
                
                if (ticket.key) {
                    tickets.push(ticket);
                }
            } catch (e) {
                console.warn('Failed to parse ticket:', e);
            }
        });
        
        return tickets;
    }

    // Format date for display
    function formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return dateString;
        }
    }

    // Sort tickets
    function sortTickets(tickets, field, direction) {
        return [...tickets].sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];
            
            if (field === 'created' || field === 'updated') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }
            
            if (direction === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }

    // Group tickets by assignee
    function groupTicketsByAssignee(tickets) {
        return tickets.reduce((acc, ticket) => {
            if (!acc[ticket.assignee]) {
                acc[ticket.assignee] = { userStories: [], tasks: [] };
            }
            if (ticket.type.toLowerCase().includes('story')) {
                acc[ticket.assignee].userStories.push(ticket);
            } else {
                acc[ticket.assignee].tasks.push(ticket);
            }
            return acc;
        }, {});
    }

    // Calculate stats
    function calculateStats(tickets) {
        return {
            totalTickets: tickets.length,
            userStories: tickets.filter(t => t.type.toLowerCase().includes('story')).length,
            tasks: tickets.filter(t => t.type.toLowerCase().includes('task')).length,
            assignees: new Set(tickets.map(t => t.assignee)).size
        };
    }

    // Helper functions
    const getStatusColor = (status) => {
        const statusLower = status.toLowerCase();
        if (statusLower.includes('done') || statusLower.includes('closed')) return '#22c55e';
        if (statusLower.includes('progress')) return '#3b82f6';
        if (statusLower.includes('todo') || statusLower.includes('to do')) return '#f59e0b';
        if (statusLower.includes('blocked')) return '#ef4444';
        return '#6b7280';
    };

    const getPriorityColor = (priority) => {
        const priorityLower = priority.toLowerCase();
        if (priorityLower.includes('highest') || priorityLower.includes('critical')) return '#dc2626';
        if (priorityLower.includes('high')) return '#ea580c';
        if (priorityLower.includes('medium')) return '#ca8a04';
        if (priorityLower.includes('low')) return '#16a34a';
        if (priorityLower.includes('lowest')) return '#0891b2';
        return '#6b7280';
    };

    const getAssigneeInitials = (name) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // Global functions
    window.toggleJiraSection = function(sectionId) {
        const content = document.getElementById(sectionId);
        const button = document.querySelector(`[data-toggle="${sectionId}"]`);
        
        if (content && button) {
            const isExpanded = content.style.display !== 'none';
            content.style.display = isExpanded ? 'none' : 'block';
            button.textContent = isExpanded ? '▶' : '▼';
        }
    };

    window.sortJiraTickets = function(field) {
        const direction = (currentSort.field === field && currentSort.direction === 'desc') ? 'asc' : 'desc';
        currentSort = { field, direction };
        
        const sortedTickets = sortTickets(currentData.tickets, field, direction);
        currentData.groupedTickets = groupTicketsByAssignee(sortedTickets);
        
        renderDashboard(sortedTickets);
    };

    // Render dashboard
    function renderDashboard(tickets, error = null) {
        const groupedTickets = groupTicketsByAssignee(tickets);
        const stats = calculateStats(tickets);
        
        // Store current data
        currentData = { tickets, groupedTickets, stats };

        const dashboardHTML = `
            <div id="jira-dashboard-popup" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            ">
                <style>
                .jira-description {
                    word-wrap: break-word;
                }
                .jira-description p {
                    margin: 0.5em 0;
                }
                .jira-description ul, .jira-description ol {
                    margin: 0.5em 0;
                    padding-left: 1.5em;
                }
                .jira-description li {
                    margin: 0.25em 0;
                }
                .jira-description strong, .jira-description b {
                    font-weight: 600;
                }
                .jira-description em, .jira-description i {
                    font-style: italic;
                }
                .jira-description code {
                    background: #f3f4f6;
                    padding: 0.125em 0.25em;
                    border-radius: 0.25em;
                    font-family: monospace;
                    font-size: 0.875em;
                }
                .jira-description pre {
                    background: #f3f4f6;
                    padding: 0.75em;
                    border-radius: 0.375em;
                    overflow-x: auto;
                    font-family: monospace;
                    font-size: 0.875em;
                }
                .jira-description a {
                    color: #3b82f6;
                    text-decoration: underline;
                }
                .jira-description blockquote {
                    border-left: 4px solid #e5e7eb;
                    padding-left: 1em;
                    margin: 0.5em 0;
                    font-style: italic;
                    color: #6b7280;
                }
                </style>
                <div style="
                    background: white;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 1200px;
                    max-height: 90%;
                    overflow-y: auto;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                ">
                    <div style="
                        background: white;
                        border-bottom: 1px solid #e5e7eb;
                        padding: 16px 24px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-radius: 12px 12px 0 0;
                        position: sticky;
                        top: 0;
                        z-index: 1;
                    ">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="
                                width: 32px;
                                height: 32px;
                                background: #3b82f6;
                                border-radius: 8px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                color: white;
                                font-weight: bold;
                            ">J</div>
                            <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #111827;">JIRA Sprint Dashboard</h1>
                            <span style="
                                background: #dbeafe;
                                color: #1d4ed8;
                                padding: 4px 8px;
                                border-radius: 6px;
                                font-size: 12px;
                                font-weight: 500;
                            ">Sprint 3490 - Live Data</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="display: flex; gap: 8px;">
                                <button onclick="window.sortJiraTickets('created')" style="
                                    background: ${currentSort.field === 'created' ? '#3b82f6' : 'white'};
                                    color: ${currentSort.field === 'created' ? 'white' : '#6b7280'};
                                    border: 1px solid #e5e7eb;
                                    padding: 6px 12px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                    cursor: pointer;
                                ">
                                    Created ${currentSort.field === 'created' ? (currentSort.direction === 'asc' ? '↑' : '↓') : ''}
                                </button>
                                <button onclick="window.sortJiraTickets('updated')" style="
                                    background: ${currentSort.field === 'updated' ? '#3b82f6' : 'white'};
                                    color: ${currentSort.field === 'updated' ? 'white' : '#6b7280'};
                                    border: 1px solid #e5e7eb;
                                    padding: 6px 12px;
                                    border-radius: 6px;
                                    font-size: 12px;
                                    cursor: pointer;
                                ">
                                    Updated ${currentSort.field === 'updated' ? (currentSort.direction === 'asc' ? '↑' : '↓') : ''}
                                </button>
                            </div>
                            <button onclick="document.getElementById('jira-dashboard-popup').remove()" style="
                                background: none;
                                border: none;
                                font-size: 24px;
                                cursor: pointer;
                                color: #6b7280;
                                padding: 8px;
                                border-radius: 6px;
                            ">×</button>
                        </div>
                    </div>

                    <div style="padding: 24px;">
                        ${error ? `
                            <div style="
                                background: #fef2f2;
                                border: 1px solid #fecaca;
                                border-radius: 8px;
                                padding: 16px;
                                margin-bottom: 24px;
                                color: #dc2626;
                            ">
                                <h3 style="margin: 0 0 8px 0; font-weight: 600;">Error fetching JIRA data</h3>
                                <p style="margin: 0; font-size: 14px;">${error}</p>
                            </div>
                        ` : ''}

                        <div style="
                            display: grid;
                            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                            gap: 16px;
                            margin-bottom: 32px;
                        ">
                            <div style="
                                background: white;
                                border: 1px solid #e5e7eb;
                                border-radius: 8px;
                                padding: 20px;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                            ">
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">Total Tickets</p>
                                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${stats.totalTickets}</p>
                                </div>
                                <div style="color: #3b82f6; font-size: 20px;">🎫</div>
                            </div>
                            <div style="
                                background: white;
                                border: 1px solid #e5e7eb;
                                border-radius: 8px;
                                padding: 20px;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                            ">
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">User Stories</p>
                                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${stats.userStories}</p>
                                </div>
                                <div style="color: #10b981; font-size: 20px;">📖</div>
                            </div>
                            <div style="
                                background: white;
                                border: 1px solid #e5e7eb;
                                border-radius: 8px;
                                padding: 20px;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                            ">
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">Tasks</p>
                                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${stats.tasks}</p>
                                </div>
                                <div style="color: #f59e0b; font-size: 20px;">✓</div>
                            </div>
                            <div style="
                                background: white;
                                border: 1px solid #e5e7eb;
                                border-radius: 8px;
                                padding: 20px;
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                            ">
                                <div>
                                    <p style="margin: 0 0 4px 0; font-size: 14px; color: #6b7280;">Assignees</p>
                                    <p style="margin: 0; font-size: 24px; font-weight: bold; color: #111827;">${stats.assignees}</p>
                                </div>
                                <div style="color: #8b5cf6; font-size: 20px;">👥</div>
                            </div>
                        </div>

                        ${tickets.length === 0 && !error ? `
                            <div style="text-align: center; padding: 40px; color: #6b7280;">
                                <div style="font-size: 48px; margin-bottom: 16px;">📋</div>
                                <h3 style="margin: 0 0 8px 0; color: #111827;">No tickets found</h3>
                                <p style="margin: 0;">No tickets match the current sprint and assignee criteria.</p>
                            </div>
                        ` : ''}

                        ${Object.keys(groupedTickets).length > 0 ? `
                            <div style="display: flex; flex-direction: column; gap: 24px;">
                                ${Object.entries(groupedTickets).map(([assignee, tickets], assigneeIndex) => {
                                    const tasksByParent = tickets.tasks.reduce((acc, task) => {
                                        const parentKey = task.parentKey || 'standalone';
                                        if (!acc[parentKey]) acc[parentKey] = [];
                                        acc[parentKey].push(task);
                                        return acc;
                                    }, {});

                                    return `
                                    <div style="
                                        background: white;
                                        border: 1px solid #e5e7eb;
                                        border-radius: 12px;
                                        overflow: hidden;
                                    ">
                                        <div style="
                                            padding: 24px;
                                            border-bottom: 1px solid #e5e7eb;
                                            display: flex;
                                            align-items: center;
                                            justify-content: space-between;
                                            cursor: pointer;
                                        " onclick="window.toggleJiraSection('assignee-${assigneeIndex}')">
                                            <div style="display: flex; align-items: center; gap: 16px;">
                                                <div style="
                                                    position: relative;
                                                    width: 48px;
                                                    height: 48px;
                                                    background: #dbeafe;
                                                    border-radius: 50%;
                                                    display: flex;
                                                    align-items: center;
                                                    justify-content: center;
                                                    font-weight: 600;
                                                    color: #1d4ed8;
                                                ">
                                                    ${getAssigneeInitials(assignee)}
                                                    <div style="
                                                        position: absolute;
                                                        bottom: -2px;
                                                        right: -2px;
                                                        width: 20px;
                                                        height: 20px;
                                                        background: #10b981;
                                                        border-radius: 50%;
                                                        display: flex;
                                                        align-items: center;
                                                        justify-content: center;
                                                        color: white;
                                                        font-size: 12px;
                                                        font-weight: bold;
                                                        border: 2px solid white;
                                                    ">${tickets.userStories.length + tickets.tasks.length}</div>
                                                </div>
                                                <div>
                                                    <h3 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 600; color: #111827;">${assignee}</h3>
                                                    <p style="margin: 0; font-size: 14px; color: #6b7280;">
                                                        ${tickets.userStories.length} User Stories, ${tickets.tasks.length} Tasks
                                                    </p>
                                                </div>
                                            </div>
                                            <button 
                                                data-toggle="assignee-${assigneeIndex}" 
                                                style="
                                                    background: none;
                                                    border: none;
                                                    font-size: 20px;
                                                    cursor: pointer;
                                                    color: #6b7280;
                                                    padding: 8px;
                                                    border-radius: 6px;
                                                "
                                            >▶</button>
                                        </div>

                                        <div id="assignee-${assigneeIndex}" style="padding: 24px; display: none;">
                                            ${tickets.userStories.map((story, storyIndex) => `
                                                <div style="
                                                    border-left: 4px solid #3b82f6;
                                                    background: #f8fafc;
                                                    border-radius: 0 8px 8px 0;
                                                    margin-bottom: 16px;
                                                ">
                                                    <div style="padding: 16px;">
                                                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                                                            <div style="display: flex; align-items: center; gap: 12px;">
                                                                <span style="
                                                                    background: #3b82f6;
                                                                    color: white;
                                                                    padding: 4px 8px;
                                                                    border-radius: 4px;
                                                                    font-size: 12px;
                                                                    font-weight: 500;
                                                                ">📖 STORY</span>
                                                                <a href="${story.link}" target="_blank" style="
                                                                    font-weight: 500; 
                                                                    color: #3b82f6;
                                                                    text-decoration: none;
                                                                ">${story.key}</a>
                                                                <span style="
                                                                    background: ${getStatusColor(story.status)};
                                                                    color: white;
                                                                    padding: 2px 6px;
                                                                    border-radius: 4px;
                                                                    font-size: 12px;
                                                                ">${story.status}</span>
                                                                <span style="
                                                                    background: ${getPriorityColor(story.priority)};
                                                                    color: white;
                                                                    padding: 2px 6px;
                                                                    border-radius: 4px;
                                                                    font-size: 12px;
                                                                ">${story.priority}</span>
                                                            </div>
                                                            ${tasksByParent[story.key] ? `
                                                                <button 
                                                                    data-toggle="story-${assigneeIndex}-${storyIndex}" 
                                                                    onclick="window.toggleJiraSection('story-${assigneeIndex}-${storyIndex}')"
                                                                    style="
                                                                        background: none;
                                                                        border: none;
                                                                        font-size: 16px;
                                                                        cursor: pointer;
                                                                        color: #6b7280;
                                                                        padding: 4px;
                                                                    "
                                                                >▶</button>
                                                            ` : ''}
                                                        </div>
                                                        <h4 style="margin: 0 0 8px 0; font-weight: 500; color: #111827;">${story.summary}</h4>
                                                        ${story.description ? `<div style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280; line-height: 1.5;" class="jira-description">${story.description}</div>` : ''}
                                                        <!-- Comments toggle button and section -->
                                                        ${story.comments && story.comments.length > 0 ? `
                                                            <button 
                                                                data-toggle="comments-${assigneeIndex}-${storyIndex}"
                                                                onclick="window.toggleJiraSection('comments-${assigneeIndex}-${storyIndex}')"
                                                                style="
                                                                    background: none;
                                                                    border: none;
                                                                    font-size: 14px;
                                                                    cursor: pointer;
                                                                    color: #3b82f6;
                                                                    margin-bottom: 8px;
                                                                "
                                                            >💬 ${story.comments.length} Comment${story.comments.length > 1 ? 's' : ''} ▶</button>
                                                            <div id="comments-${assigneeIndex}-${storyIndex}" style="margin: 8px 0 12px 0; display: none;">
                                                                <div style="background: #f1f5f9; border-radius: 6px; padding: 10px;">
                                                                    ${story.comments.map(comment => `
                                                                        <div style="margin-bottom: 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">
                                                                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 2px;"><strong>${comment.author}</strong> <span style="font-size: 11px; color: #94a3b8;">${formatDate(comment.created)}</span></div>
                                                                            <div style="font-size: 13px; color: #111827;">${comment.body}</div>
                                                                        </div>
                                                                    `).join('')}
                                                                </div>
                                                            </div>
                                                        ` : ''}
                                                        <!-- Always show related tasks section if present -->
                                                        ${tasksByParent[story.key] ? `
                                                            <div id="story-${assigneeIndex}-${storyIndex}" style="margin-top: 16px; display: none;">
                                                                <h5 style="
                                                                    margin: 0 0 8px 0;
                                                                    font-size: 12px;
                                                                    font-weight: 500;
                                                                    color: #6b7280;
                                                                    text-transform: uppercase;
                                                                    letter-spacing: 0.05em;
                                                                ">Related Tasks</h5>
                                                                ${tasksByParent[story.key].map(task => `
                                                                    <div style="
                                                                        background: white;
                                                                        border: 1px solid #e5e7eb;
                                                                        border-radius: 6px;
                                                                        padding: 12px;
                                                                        margin-bottom: 8px;
                                                                    ">
                                                                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                                                            <span style="
                                                                                background: #6b7280;
                                                                                color: white;
                                                                                padding: 2px 6px;
                                                                                border-radius: 3px;
                                                                                font-size: 11px;
                                                                                font-weight: 500;
                                                                            ">✓ TASK</span>
                                                                            <a href="${task.link}" target="_blank" style="
                                                                                font-weight: 500; 
                                                                                font-size: 14px;
                                                                                color: #6b7280;
                                                                                text-decoration: none;
                                                                            ">${task.key}</a>
                                                                            <span style="
                                                                                background: ${getStatusColor(task.status)};
                                                                                color: white;
                                                                                padding: 1px 4px;
                                                                                border-radius: 3px;
                                                                                font-size: 11px;
                                                                            ">${task.status}</span>
                                                                            <span style="
                                                                                background: ${getPriorityColor(task.priority)};
                                                                                color: white;
                                                                                padding: 1px 4px;
                                                                                border-radius: 3px;
                                                                                font-size: 11px;
                                                                            ">${task.priority}</span>
                                                                        </div>
                                                                        <div style="font-weight: 500; font-size: 14px; color: #111827; margin-bottom: 6px;">${task.summary}</div>
                                                                        ${task.description ? `<div style="font-size: 13px; color: #6b7280; line-height: 1.4; margin-bottom: 8px;" class="jira-description">${task.description}</div>` : ''}
                                                                        <div style="display: flex; gap: 12px; font-size: 11px; color: #6b7280;">
                                                                            <span><strong>Created:</strong> ${formatDate(task.created)}</span>
                                                                            <span><strong>Updated:</strong> ${formatDate(task.updated)}</span>
                                                                        </div>
                                                                    </div>
                                                                `).join('')}
                                                            </div>
                                                        ` : ''}
                                                        
                                                        <div style="display: flex; gap: 16px; font-size: 12px; color: #6b7280; margin-bottom: 12px;">
                                                            <span><strong>Created:</strong> ${formatDate(story.created)}</span>
                                                            <span><strong>Updated:</strong> ${formatDate(story.updated)}</span>
                                                        </div>

                                                        ${tasksByParent[story.key] ? `
                                                            <div id="story-${assigneeIndex}-${storyIndex}" style="margin-top: 16px; display: none;">
                                                                <h5 style="
                                                                    margin: 0 0 8px 0;
                                                                    font-size: 12px;
                                                                    font-weight: 500;
                                                                    color: #6b7280;
                                                                    text-transform: uppercase;
                                                                    letter-spacing: 0.05em;
                                                                ">Related Tasks</h5>
                                                                ${tasksByParent[story.key].map(task => `
                                                                    <div style="
                                                                        background: white;
                                                                        border: 1px solid #e5e7eb;
                                                                        border-radius: 6px;
                                                                        padding: 12px;
                                                                        margin-bottom: 8px;
                                                                    ">
                                                                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                                                            <span style="
                                                                                background: #6b7280;
                                                                                color: white;
                                                                                padding: 2px 6px;
                                                                                border-radius: 3px;
                                                                                font-size: 11px;
                                                                                font-weight: 500;
                                                                            ">✓ TASK</span>
                                                                            <a href="${task.link}" target="_blank" style="
                                                                                font-weight: 500; 
                                                                                font-size: 14px;
                                                                                color: #6b7280;
                                                                                text-decoration: none;
                                                                            ">${task.key}</a>
                                                                            <span style="
                                                                                background: ${getStatusColor(task.status)};
                                                                                color: white;
                                                                                padding: 1px 4px;
                                                                                border-radius: 3px;
                                                                                font-size: 11px;
                                                                            ">${task.status}</span>
                                                                            <span style="
                                                                                background: ${getPriorityColor(task.priority)};
                                                                                color: white;
                                                                                padding: 1px 4px;
                                                                                border-radius: 3px;
                                                                                font-size: 11px;
                                                                            ">${task.priority}</span>
                                                                        </div>
                                                                        <div style="font-weight: 500; font-size: 14px; color: #111827; margin-bottom: 6px;">${task.summary}</div>
                                                                        ${task.description ? `<div style="font-size: 13px; color: #6b7280; line-height: 1.4; margin-bottom: 8px;" class="jira-description">${task.description}</div>` : ''}
                                                                        <div style="display: flex; gap: 12px; font-size: 11px; color: #6b7280;">
                                                                            <span><strong>Created:</strong> ${formatDate(task.created)}</span>
                                                                            <span><strong>Updated:</strong> ${formatDate(task.updated)}</span>
                                                                        </div>
                                                                    </div>
                                                                `).join('')}
                                                            </div>
                                                        ` : ''}
                                                    </div>
                                                </div>
                                            `).join('')}

                                            ${tasksByParent.standalone ? `
                                                <div>
                                                    <h5 style="
                                                        margin: 0 0 12px 0;
                                                        font-size: 12px;
                                                        font-weight: 500;
                                                        color: #6b7280;
                                                        text-transform: uppercase;
                                                        letter-spacing: 0.05em;
                                                    ">Standalone Tasks</h5>
                                                    ${tasksByParent.standalone.map(task => `
                                                        <div style="
                                                            background: white;
                                                            border: 1px solid #e5e7eb;
                                                            border-radius: 6px;
                                                            padding: 12px;
                                                            margin-bottom: 8px;
                                                        ">
                                                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                                                <span style="
                                                                    background: #6b7280;
                                                                    color: white;
                                                                    padding: 2px 6px;
                                                                    border-radius: 3px;
                                                                    font-size: 11px;
                                                                    font-weight: 500;
                                                                ">✓ TASK</span>
                                                                <a href="${task.link}" target="_blank" style="
                                                                    font-weight: 500; 
                                                                    font-size: 14px;
                                                                    color: #6b7280;
                                                                    text-decoration: none;
                                                                ">${task.key}</a>
                                                                <span style="
                                                                    background: ${getStatusColor(task.status)};
                                                                    color: white;
                                                                    padding: 1px 4px;
                                                                    border-radius: 3px;
                                                                    font-size: 11px;
                                                                ">${task.status}</span>
                                                                <span style="
                                                                    background: ${getPriorityColor(task.priority)};
                                                                    color: white;
                                                                    padding: 1px 4px;
                                                                    border-radius: 3px;
                                                                    font-size: 11px;
                                                                ">${task.priority}</span>
                                                            </div>
                                                            <div style="font-weight: 500; font-size: 14px; color: #111827; margin-bottom: 6px;">${task.summary}</div>
                                                            ${task.description ? `<div style="font-size: 13px; color: #6b7280; line-height: 1.4; margin-bottom: 8px;" class="jira-description">${task.description}</div>` : ''}
                                                            <div style="display: flex; gap: 12px; font-size: 11px; color: #6b7280;">
                                                                <span><strong>Created:</strong> ${formatDate(task.created)}</span>
                                                                <span><strong>Updated:</strong> ${formatDate(task.updated)}</span>
                                                            </div>
                                                        </div>
                                                    `).join('')}
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Remove existing popup and insert new one
        const existingPopup = document.getElementById('jira-dashboard-popup');
        if (existingPopup) existingPopup.remove();
        
        document.body.insertAdjacentHTML('beforeend', dashboardHTML);

        // Add click outside to close
        document.getElementById('jira-dashboard-popup').addEventListener('click', function(e) {
            if (e.target === this) {
                this.remove();
            }
        });
    }

    // Show loading popup
    const loadingHTML = `
        <div id="jira-dashboard-popup" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        ">
            <div style="
                background: white;
                border-radius: 12px;
                padding: 40px;
                text-align: center;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
            ">
                <div style="
                    width: 40px;
                    height: 40px;
                    border: 4px solid #e5e7eb;
                    border-top: 4px solid #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 16px auto;
                "></div>
                <h3 style="margin: 0 0 8px 0; color: #111827;">Fetching JIRA Data</h3>
                <p style="margin: 0; color: #6b7280;">Processing JIRA XML response...</p>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', loadingHTML);

    // Execute the main process
    fetchJiraData()
        .then(tickets => {
            console.log('Parsed tickets:', tickets);
            renderDashboard(tickets);
        })
        .catch(error => {
            console.error('Error:', error);
            renderDashboard([], error.message);
        });
})();    
    // Show loading and start the process
    showLoadingPopup();
    
    fetchJiraData()
        .then(tickets => {
            renderDashboard(tickets);
        })
        .catch(error => {
            renderDashboard([], error.message);
        });
    
    // [All the other functions: fetchJiraData, parseJiraXML, renderDashboard, etc.]
};
