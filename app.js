const data = window.WORKBOOK_DATA;

const state = {
  page: location.hash.replace('#/', '') || 'overview',
  department: 'All',
  status: 'All',
  search: '',
  canDeleteUsers: sessionStorage.getItem('canDeleteUsers') === 'true',
  canAdmin: sessionStorage.getItem('canAdmin') === 'true',
  currentUserEmail: sessionStorage.getItem('currentUserEmail') || '',
  adminEmails: JSON.parse(sessionStorage.getItem('adminEmails') || '[]'),
  pendingUsers: JSON.parse(sessionStorage.getItem('pendingUsers') || '[]'),
  editMode: false,
  editSnapshot: null,
  adminSheet: 'Employees',
  adminSearch: '',
  chatMinimized: true,
  chatMessages: [
    {
      role: 'bot',
      text: 'Ask me about this dashboard: employees, departments, projects, tasks, meetings, updates, logs, risks, budgets, or the current filters.'
    }
  ]
};

const colors = {
  teal: '#007c78',
  green: '#3d8b37',
  amber: '#c98317',
  red: '#c6473d',
  blue: '#3168a8',
  violet: '#7651a7',
  gray: '#8b9aa0'
};

const pages = [
  { id: 'overview', label: 'Overview', eyebrow: 'Workbook Overview', title: 'Enterprise PMO Overview', sheet: 'Dashboard' },
  { id: 'departments', label: 'Departments', eyebrow: 'Department Sheet', title: 'Departments', sheet: 'Departments' },
  { id: 'employees', label: 'Employees', eyebrow: 'Employees Sheet', title: 'Employees', sheet: 'Employees' },
  { id: 'projects', label: 'Projects', eyebrow: 'Projects Sheet', title: 'Projects', sheet: 'Projects' },
  { id: 'tasks', label: 'Tasks', eyebrow: 'Tasks Sheet', title: 'Tasks', sheet: 'Tasks' },
  { id: 'meetings', label: 'Meetings', eyebrow: 'Meetings Sheet', title: 'Meetings', sheet: 'Meetings' },
  { id: 'updates', label: 'Updates', eyebrow: 'Weekly Updates Sheet', title: 'Weekly Updates', sheet: 'Weekly Updates' },
  { id: 'logs', label: 'Logs', eyebrow: 'Activity Log Sheet', title: 'Activity Log', sheet: 'Activity Log' }
];

const adminPage = { id: 'admin', label: 'Admin', eyebrow: 'Administration', title: 'Admin Workspace', sheet: 'Employees' };

const money = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
});

const number = new Intl.NumberFormat('en-US');

const idKeys = {
  Departments: 'Department ID',
  Employees: 'Employee ID',
  Projects: 'Project ID',
  Tasks: 'Task ID',
  Meetings: 'Meeting ID',
  'Weekly Updates': 'Update ID',
  'Activity Log': 'Activity ID'
};

const sheetByPage = {
  admin: 'Employees',
  departments: 'Departments',
  employees: 'Employees',
  projects: 'Projects',
  tasks: 'Tasks',
  meetings: 'Meetings',
  updates: 'Weekly Updates',
  logs: 'Activity Log'
};

const editableWorkbookSheets = [
  'Dashboard',
  'Departments',
  'Employees',
  'Projects',
  'Tasks',
  'Meetings',
  'Weekly Updates',
  'Activity Log',
  'Lists'
];

Object.entries(idKeys).forEach(([sheet, key]) => {
  data[sheet] = (data[sheet] || []).filter(row => row[key]);
});

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function average(items, key) {
  return items.length ? sum(items, key) / items.length : 0;
}

function byCount(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'Unassigned';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function normalize(text) {
  return String(text || '').toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

async function readApiJson(response, fallback = 'Request failed.') {
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/html') || text.trim().startsWith('<')) {
        throw new Error('The server returned an HTML page instead of JSON. Restart the dashboard server so the latest admin API routes are active.');
      }
      throw new Error(text.slice(0, 160) || fallback);
    }
  }
  if (!response.ok) throw new Error(payload.error || fallback);
  return payload;
}

function visiblePages() {
  return state.canAdmin ? [...pages, adminPage] : pages;
}

function pageMeta() {
  return visiblePages().find(page => page.id === state.page) || pages[0];
}

function rowMatchesSearch(row) {
  const query = normalize(state.search).trim();
  return !query || Object.values(row).some(value => normalize(value).includes(query));
}

function rowDepartment(row) {
  return row.Department || row['Department Name'] || '';
}

function filterRows(rows, options = {}) {
  return rows.filter(row => {
    const department = rowDepartment(row);
    const departmentMatch = state.department === 'All' || !options.department || department === state.department;
    const rowStatus = row.Status || row['Employment Status'] || '';
    const statusMatch = state.status === 'All' || !options.status || !rowStatus || rowStatus === state.status;
    return departmentMatch && statusMatch && rowMatchesSearch(row);
  });
}

function badge(value, tone = '') {
  return `<span class="badge ${tone}">${escapeHtml(value || 'Unassigned')}</span>`;
}

function toneFor(value) {
  const normalized = normalize(value).replace(/\s+/g, '-');
  if (['critical', 'high', 'red', 'blocked', 'at-risk'].includes(normalized)) return `risk-${normalized}`;
  if (['medium', 'amber', 'in-progress', 'planning'].includes(normalized)) return 'risk-medium';
  if (['low', 'green', 'completed', 'active'].includes(normalized)) return 'risk-low';
  return '';
}

function progressBar(value) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress-track" title="${width}%"><span style="width:${width}%"></span></div>`;
}

function renderShell() {
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#/overview" aria-label="Dashboard overview">
        <span class="brand-mark">EP</span>
        <span>
          <strong>Enterprise PMO</strong>
          <small>Workbook Dashboard</small>
        </span>
      </a>
      <nav class="nav" aria-label="Dashboard pages">
        ${visiblePages().map(page => `<a href="#/${page.id}" class="${state.page === page.id ? 'active' : ''}">${page.label}</a>`).join('')}
      </nav>
      <div class="source-note">
        <span>Cleaned workbook</span>
        <strong>${number.format(data.Employees.length)} employees in workbook</strong>
        <button class="logout-button" id="logoutButton" type="button">Logout</button>
      </div>
    </aside>
    <main>
      <header class="topbar">
        <div>
          <p class="eyebrow">${pageMeta().eyebrow}</p>
          <h1>${pageMeta().title}</h1>
        </div>
        <form class="filters ${state.page === 'admin' ? 'hidden' : ''}" id="filters">
          <label>
            <span>Department</span>
            <select id="departmentFilter"></select>
          </label>
          <label>
            <span>Status</span>
            <select id="statusFilter"></select>
          </label>
          <label class="searchbox">
            <span>Search</span>
            <input id="searchInput" type="search" placeholder="Search this sheet..." value="${escapeHtml(state.search)}">
          </label>
          <button class="ghost-button" id="resetFilters" type="button">Reset</button>
        </form>
      </header>
      <section id="page"></section>
    </main>
    ${renderChatbot()}
  `;

  wireFilters();
  wireLogout();
  wireChatbot();
}

function wireLogout() {
  const button = document.querySelector('#logoutButton');
  if (!button) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    await fetch('/api/logout', { method: 'POST' });
    sessionStorage.removeItem('canDeleteUsers');
    sessionStorage.removeItem('canAdmin');
    sessionStorage.removeItem('currentUserEmail');
    sessionStorage.removeItem('adminEmails');
    sessionStorage.removeItem('pendingUsers');
    sessionStorage.setItem('logoutMessage', 'See you later!');
    location.href = '/login.html';
  });
}

async function refreshCurrentUser() {
  try {
    const response = await fetch('/api/me');
    if (!response.ok) return;
    const user = await readApiJson(response, 'Could not load current user.');
    state.canDeleteUsers = Boolean(user.can_delete_users);
    state.canAdmin = Boolean(user.is_admin || user.can_delete_users);
    state.currentUserEmail = user.email || '';
    state.adminEmails = (user.admin_emails || []).map(email => normalize(email));
    state.pendingUsers = user.pending_users || [];
    sessionStorage.setItem('canDeleteUsers', state.canDeleteUsers ? 'true' : 'false');
    sessionStorage.setItem('canAdmin', state.canAdmin ? 'true' : 'false');
    sessionStorage.setItem('currentUserEmail', state.currentUserEmail);
    sessionStorage.setItem('adminEmails', JSON.stringify(state.adminEmails));
    sessionStorage.setItem('pendingUsers', JSON.stringify(state.pendingUsers));
    if (!state.canAdmin && state.page === 'admin') {
      state.page = 'overview';
      location.hash = '#/overview';
      return;
    }
    render();
  } catch (error) {
    state.canDeleteUsers = false;
    state.canAdmin = false;
    state.adminEmails = [];
    state.pendingUsers = [];
  }
}

function showToast(text) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 7000);
}

function showStoredWelcome() {
  const name = sessionStorage.getItem('welcomeName');
  if (!name) return;
  sessionStorage.removeItem('welcomeName');
  showToast(`Welcome ${name}!`);
}

function wireFilters() {
  if (state.page === 'admin') return;
  const departmentFilter = document.querySelector('#departmentFilter');
  const statusFilter = document.querySelector('#statusFilter');
  const departments = ['All', ...new Set([
    ...data.Departments.map(row => row['Department Name']),
    ...data.Employees.map(row => row.Department),
    ...data.Projects.map(row => row.Department)
  ].filter(Boolean).sort())];
  const statusRows = rowsForCurrentPage();
  const statuses = ['All', ...new Set(statusRows.flatMap(row => [row.Status, row['Employment Status']]).filter(Boolean).sort())];
  if (!statuses.includes(state.status)) state.status = 'All';

  departmentFilter.innerHTML = departments.map(value => `<option ${value === state.department ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
  statusFilter.innerHTML = statuses.map(value => `<option ${value === state.status ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');

  departmentFilter.addEventListener('change', event => {
    state.department = event.target.value;
    renderPage();
  });

  statusFilter.addEventListener('change', event => {
    state.status = event.target.value;
    renderPage();
  });

  document.querySelector('#searchInput').addEventListener('input', event => {
    state.search = event.target.value;
    renderPage();
  });

  document.querySelector('#resetFilters').addEventListener('click', () => {
    state.department = 'All';
    state.status = 'All';
    state.search = '';
    render();
  });
}

function rowsForCurrentPage() {
  const sheet = pageMeta().sheet;
  if (sheet === 'Dashboard') return data.Projects;
  return data[sheet] || [];
}

function renderChatbot() {
  return `
    <section class="chatbot ${state.chatMinimized ? 'minimized' : ''}" aria-label="Dashboard chatbot">
      <button class="chat-toggle" id="chatToggle" type="button" aria-expanded="${!state.chatMinimized}">
        <span>Dashboard Assistant</span>
        <strong>${state.chatMinimized ? '?' : '-'}</strong>
      </button>
      <div class="chat-window" ${state.chatMinimized ? 'hidden' : ''}>
        <div class="chat-head">
          <div>
            <strong>Dashboard Assistant</strong>
            <span>Answers only from this workbook</span>
          </div>
          <button id="chatMinimize" type="button" aria-label="Minimize chatbot">-</button>
        </div>
        <div class="chat-messages" id="chatMessages" aria-live="polite">
          ${state.chatMessages.map(message => `
            <div class="chat-message ${message.role}">
              ${escapeHtml(message.text)}
            </div>
          `).join('')}
        </div>
        <form class="chat-form" id="chatForm">
          <input id="chatInput" type="text" autocomplete="off" placeholder="Ask about the dashboard...">
          <button type="submit">Send</button>
        </form>
      </div>
    </section>
  `;
}

function wireChatbot() {
  const toggle = document.querySelector('#chatToggle');
  const minimize = document.querySelector('#chatMinimize');
  const form = document.querySelector('#chatForm');
  const messages = document.querySelector('#chatMessages');

  toggle.addEventListener('click', () => {
    state.chatMinimized = !state.chatMinimized;
    render();
  });

  if (minimize) {
    minimize.addEventListener('click', () => {
      state.chatMinimized = true;
      render();
    });
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const input = document.querySelector('#chatInput');
      const question = input.value.trim();
      if (!question) return;
      input.value = '';
      state.chatMessages.push({ role: 'user', text: question });
      state.chatMessages.push({ role: 'bot', text: 'Thinking...' });
      state.chatMessages = state.chatMessages.slice(-12);
      state.chatMinimized = false;
      render();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            context: buildDashboardContext(question),
            history: state.chatMessages
              .filter(message => message.text !== 'Thinking...')
              .map(message => ({
                role: message.role === 'bot' ? 'assistant' : 'user',
                content: message.text
              }))
          })
        });
        const payload = await readApiJson(response, 'Chat request failed.');
        state.chatMessages[state.chatMessages.length - 1] = { role: 'bot', text: payload.answer };
      } catch (error) {
        state.chatMessages[state.chatMessages.length - 1] = {
          role: 'bot',
          text: `I could not reach the GPT assistant. ${error.message}`
        };
      }
      state.chatMessages = state.chatMessages.slice(-12);
      render();
    });
  }

  if (messages) messages.scrollTop = messages.scrollHeight;
}

function filteredDashboardData() {
  return {
    departments: filterRows(data.Departments, { department: true }),
    employees: filterRows(data.Employees, { department: true, status: true }),
    projects: filterRows(data.Projects, { department: true, status: true }),
    tasks: filterRows(data.Tasks, { department: true, status: true }),
    meetings: filterRows(data.Meetings),
    updates: filterRows(data['Weekly Updates'], { department: true, status: true }),
    logs: filterRows(data['Activity Log'], { department: true })
  };
}

function topCounts(rows, key, limit = 5) {
  return Object.entries(byCount(rows, key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => `${label}: ${number.format(value)}`)
    .join(', ');
}

function describeFilters() {
  const filters = [];
  if (state.department !== 'All') filters.push(`department is ${state.department}`);
  if (state.status !== 'All') filters.push(`status is ${state.status}`);
  if (state.search.trim()) filters.push(`search contains "${state.search.trim()}"`);
  return filters.length ? `Current filters: ${filters.join(', ')}.` : 'No dashboard filters are active.';
}

function matchText(value) {
  return normalize(value).replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

function findMention(question, values) {
  const q = matchText(question);
  return values
    .filter(Boolean)
    .sort((a, b) => String(b).length - String(a).length)
    .find(value => {
      const candidate = matchText(value);
      return candidate && (` ${q} `).includes(` ${candidate} `);
    }) || '';
}

function questionContext(question) {
  const departments = [
    ...data.Departments.map(row => row['Department Name']),
    ...data.Employees.map(row => row.Department),
    ...data.Projects.map(row => row.Department)
  ];
  const statuses = [
    ...data.Projects.map(row => row.Status),
    ...data.Tasks.map(row => row.Status),
    ...data.Employees.map(row => row['Employment Status'])
  ];
  const projects = data.Projects.map(row => row['Project Name']);
  const employees = data.Employees.map(row => row['Employee Name']);

  return {
    department: findMention(question, [...new Set(departments)]),
    status: findMention(question, [...new Set(statuses)]),
    project: findMention(question, projects),
    employee: findMention(question, employees)
  };
}

function projectIdsForContext(context) {
  return new Set(data.Projects
    .filter(project => {
      const departmentMatch = !context.department || project.Department === context.department;
      const projectMatch = !context.project || project['Project Name'] === context.project;
      return departmentMatch && projectMatch;
    })
    .map(project => project['Project ID']));
}

function rowsForQuestion(question) {
  const context = questionContext(question);
  const hasExplicitContext = Boolean(context.department || context.status || context.project || context.employee);
  if (!hasExplicitContext) {
    return { ...filteredDashboardData(), context, label: 'Current filters' };
  }

  const projectIds = projectIdsForContext(context);
  const employeeId = context.employee
    ? data.Employees.find(employee => employee['Employee Name'] === context.employee)?.['Employee ID']
    : '';

  const matchesDepartment = row => !context.department || rowDepartment(row) === context.department;
  const matchesStatus = row => !context.status || row.Status === context.status || row['Employment Status'] === context.status;
  const matchesProject = row => {
    if (context.project) return row.Project === context.project || row['Project Name'] === context.project || projectIds.has(row['Project ID']);
    if (context.department && row['Project ID']) return projectIds.has(row['Project ID']);
    return true;
  };
  const matchesEmployee = row => !context.employee || row.Employee === context.employee || row['Employee Name'] === context.employee || row['Assigned To'] === context.employee || row.Owner === context.employee || row.Organizer === context.employee || row['Employee ID'] === employeeId || row['Assigned To ID'] === employeeId || row['Owner ID'] === employeeId || row['Organizer ID'] === employeeId;

  const contextParts = [];
  if (context.department) contextParts.push(context.department);
  if (context.status) contextParts.push(context.status);
  if (context.project) contextParts.push(context.project);
  if (context.employee) contextParts.push(context.employee);

  return {
    context,
    label: contextParts.join(', '),
    departments: data.Departments.filter(row => matchesDepartment(row)),
    employees: data.Employees.filter(row => matchesDepartment(row) && matchesStatus(row) && matchesEmployee(row)),
    projects: data.Projects.filter(row => matchesDepartment(row) && matchesStatus(row) && matchesProject(row) && matchesEmployee(row)),
    tasks: data.Tasks.filter(row => matchesDepartment(row) && matchesStatus(row) && matchesProject(row) && matchesEmployee(row)),
    meetings: data.Meetings.filter(row => matchesProject(row) && matchesEmployee(row)),
    updates: data['Weekly Updates'].filter(row => matchesDepartment(row) && matchesStatus(row) && matchesProject(row)),
    logs: data['Activity Log'].filter(row => matchesDepartment(row) && matchesProject(row) && matchesEmployee(row))
  };
}

function contextLead(scoped) {
  return scoped.label === 'Current filters' ? 'With the current filters' : `For ${scoped.label}`;
}

function shortList(rows, key, limit = 8) {
  const values = [...new Set(rows.map(row => row[key]).filter(Boolean))].slice(0, limit);
  const suffix = rows.length > limit ? `, and ${number.format(rows.length - limit)} more` : '';
  return values.length ? `${values.join(', ')}${suffix}` : 'none';
}

function pickFields(row, fields) {
  return fields.reduce((picked, field) => {
    if (row[field] !== undefined && row[field] !== '') picked[field] = row[field];
    return picked;
  }, {});
}

function sampleRows(rows, fields, limit = 20) {
  return rows.slice(0, limit).map(row => pickFields(row, fields));
}

function buildDashboardContext(question) {
  const scoped = rowsForQuestion(question);
  const projectBudget = sum(scoped.projects, 'Budget SAR');
  const projectSpend = sum(scoped.projects, 'Actual Spend SAR');

  return {
    current_page: pageMeta().title,
    filters: {
      department: state.department,
      status: state.status,
      search: state.search.trim() || 'All'
    },
    matched_context: scoped.label,
    totals: {
      departments: scoped.departments.length,
      employees: scoped.employees.length,
      active_employees: scoped.employees.filter(row => row['Employment Status'] === 'Active').length,
      projects: scoped.projects.length,
      tasks: scoped.tasks.length,
      open_tasks: scoped.tasks.filter(row => row.Status !== 'Completed').length,
      blocked_tasks: scoped.tasks.filter(row => row.Status === 'Blocked').length,
      meetings: scoped.meetings.length,
      weekly_updates: scoped.updates.length,
      activity_events: scoped.logs.length,
      project_budget_sar: projectBudget,
      actual_spend_sar: projectSpend,
      remaining_budget_sar: projectBudget - projectSpend
    },
    distributions: {
      employees_by_department: topCounts(scoped.employees, 'Department'),
      project_status: topCounts(scoped.projects, 'Status'),
      project_risk_level: topCounts(scoped.projects, 'Risk Level'),
      task_status: topCounts(scoped.tasks, 'Status'),
      update_health: topCounts(scoped.updates, 'Health'),
      activity_impact: topCounts(scoped.logs, 'Impact'),
      activity_type: topCounts(scoped.logs, 'Activity Type')
    },
    lists: {
      departments: shortList(scoped.departments, 'Department Name', 12),
      employees: shortList(scoped.employees, 'Employee Name', 12),
      projects: shortList(scoped.projects, 'Project Name', 12),
      tasks: shortList(scoped.tasks, 'Task Name', 12)
    },
    records: {
      departments: sampleRows(scoped.departments, ['Department ID', 'Department Name', 'Division', 'Location', 'Director', 'Headcount', 'Annual Budget SAR']),
      employees: sampleRows(scoped.employees, ['Employee ID', 'Employee Name', 'Email', 'Department', 'Job Title', 'Level', 'Manager', 'Location', 'Hire Date', 'Employment Status']),
      projects: sampleRows(scoped.projects, ['Project ID', 'Project Name', 'Department', 'Owner', 'Status', 'Priority', 'Risk Level', 'Progress %', 'Budget SAR', 'Actual Spend SAR', 'Strategic Theme']),
      tasks: sampleRows(scoped.tasks, ['Task ID', 'Task Name', 'Project', 'Department', 'Assigned To', 'Status', 'Priority', 'Due Date']),
      meetings: sampleRows(scoped.meetings, ['Meeting ID', 'Meeting Title', 'Project', 'Organizer', 'Meeting Type', 'Date', 'Duration Minutes']),
      weekly_updates: sampleRows(scoped.updates, ['Update ID', 'Project', 'Department', 'Health', 'Progress %', 'Blocker/Risk', 'Next Steps']),
      activity_log: sampleRows(scoped.logs, ['Activity ID', 'Timestamp', 'Employee', 'Department', 'Project', 'Task ID', 'Activity Type', 'Impact', 'Source'])
    }
  };
}

function answerDashboardQuestion(question) {
  const q = normalize(question);
  const scoped = rowsForQuestion(question);
  const outOfScope = ['weather', 'news', 'sports', 'stock', 'price of', 'recipe', 'movie', 'song', 'capital of'];
  if (outOfScope.some(term => q.includes(term))) {
    return 'I can only answer questions about this dashboard and its workbook data.';
  }

  if (q.includes('filter') || q.includes('current page') || q.includes('where am i')) {
    return `You are on the ${pageMeta().title} page. ${describeFilters()}`;
  }

  if (q.includes('employee') || q.includes('people') || q.includes('staff')) {
    const active = scoped.employees.filter(row => row['Employment Status'] === 'Active').length;
    const list = q.includes('who') || q.includes('list') || q.includes('name') ? ` Employees: ${shortList(scoped.employees, 'Employee Name')}.` : '';
    return `${contextLead(scoped)}, there are ${number.format(scoped.employees.length)} employees, including ${number.format(active)} active employees. Top departments: ${topCounts(scoped.employees, 'Department') || 'none'}.${list}`;
  }

  if (q.includes('department') || q.includes('division')) {
    return `${contextLead(scoped)}, ${number.format(scoped.departments.length)} departments match. Divisions: ${topCounts(scoped.departments, 'Division') || 'none'}. Employees: ${number.format(scoped.employees.length)}. Projects: ${number.format(scoped.projects.length)}.`;
  }

  if (q.includes('budget') || q.includes('spend') || q.includes('cost')) {
    const budget = sum(scoped.projects, 'Budget SAR');
    const spend = sum(scoped.projects, 'Actual Spend SAR');
    const variance = budget - spend;
    return `${contextLead(scoped)}, projects have SAR ${money.format(budget)} budget and SAR ${money.format(spend)} actual spend. Remaining variance is SAR ${money.format(Math.abs(variance))} ${variance >= 0 ? 'under budget' : 'over budget'}.`;
  }

  if (q.includes('risk') || q.includes('at risk') || q.includes('critical')) {
    const risky = scoped.projects.filter(project => ['High', 'Critical'].includes(project['Risk Level']) || project.Status === 'At Risk');
    const blockers = scoped.updates.filter(update => update['Blocker/Risk'] && update['Blocker/Risk'] !== 'No major blockers');
    return `${contextLead(scoped)}, ${number.format(risky.length)} projects have high-risk signals, and ${number.format(blockers.length)} weekly updates mention blockers or risks. Risk levels: ${topCounts(scoped.projects, 'Risk Level') || 'none'}.`;
  }

  if (q.includes('project') || q.includes('portfolio')) {
    const list = q.includes('what') || q.includes('which') || q.includes('list') ? ` Projects: ${shortList(scoped.projects, 'Project Name')}.` : '';
    return `${contextLead(scoped)}, ${number.format(scoped.projects.length)} projects match. Status mix: ${topCounts(scoped.projects, 'Status') || 'none'}. Average progress is ${Math.round(average(scoped.projects, 'Progress %'))}%.${list}`;
  }

  if (q.includes('task') || q.includes('blocked') || q.includes('due')) {
    const open = scoped.tasks.filter(task => task.Status !== 'Completed').length;
    const blocked = scoped.tasks.filter(task => task.Status === 'Blocked').length;
    return `${contextLead(scoped)}, ${number.format(scoped.tasks.length)} tasks match, ${number.format(open)} are open, and ${number.format(blocked)} are blocked. Status mix: ${topCounts(scoped.tasks, 'Status') || 'none'}.`;
  }

  if (q.includes('meeting') || q.includes('organizer') || q.includes('attendee')) {
    return `${contextLead(scoped)}, ${number.format(scoped.meetings.length)} meetings match. Meeting types: ${topCounts(scoped.meetings, 'Meeting Type') || 'none'}. Average duration is ${Math.round(average(scoped.meetings, 'Duration Minutes'))} minutes.`;
  }

  if (q.includes('update') || q.includes('health') || q.includes('weekly')) {
    return `${contextLead(scoped)}, ${number.format(scoped.updates.length)} weekly updates match. Health mix: ${topCounts(scoped.updates, 'Health') || 'none'}.`;
  }

  if (q.includes('log') || q.includes('activity') || q.includes('event') || q.includes('impact')) {
    return `${contextLead(scoped)}, ${number.format(scoped.logs.length)} activity events match. Impact mix: ${topCounts(scoped.logs, 'Impact') || 'none'}. Top activity types: ${topCounts(scoped.logs, 'Activity Type') || 'none'}.`;
  }

  if (q.includes('summary') || q.includes('overview') || q.includes('total') || q.includes('how many')) {
    if (scoped.label !== 'Current filters') {
      return `${contextLead(scoped)}: ${number.format(scoped.employees.length)} employees, ${number.format(scoped.projects.length)} projects, ${number.format(scoped.tasks.length)} tasks, ${number.format(scoped.meetings.length)} meetings, ${number.format(scoped.updates.length)} weekly updates, and ${number.format(scoped.logs.length)} activity events.`;
    }
    return `Dashboard totals: ${number.format(data.Departments.length)} departments, ${number.format(data.Employees.length)} employees, ${number.format(data.Projects.length)} projects, ${number.format(data.Tasks.length)} tasks, ${number.format(data.Meetings.length)} meetings, ${number.format(data['Weekly Updates'].length)} weekly updates, and ${number.format(data['Activity Log'].length)} activity events. ${describeFilters()}`;
  }

  return 'I can answer dashboard questions about employees, departments, projects, tasks, meetings, weekly updates, activity logs, risks, budgets, totals, and current filters.';
}

function kpiCards(cards) {
  return `<section class="kpis">${cards.map(card => `
    <article class="kpi">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.note)}</small>
    </article>
  `).join('')}</section>`;
}

function panel(title, subtitle, body, className = '') {
  return `
    <article class="panel ${className}">
      <div class="panel-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
        </div>
      </div>
      ${body}
    </article>
  `;
}

function barChart(rows, options = {}) {
  const width = 760;
  const left = options.left || 170;
  const barHeight = options.barHeight || 30;
  const gap = options.gap || 12;
  const height = Math.max(120, 28 + rows.length * (barHeight + gap));
  const max = Math.max(1, ...rows.map(row => row.value));
  const body = rows.map((row, index) => {
    const y = 16 + index * (barHeight + gap);
    const barWidth = (width - left - 64) * row.value / max;
    return `
      <text x="0" y="${y + 20}" font-size="12" fill="#44535a">${escapeHtml(row.label)}</text>
      <rect x="${left}" y="${y}" width="${width - left - 64}" height="${barHeight}" rx="5" fill="#edf3f2"></rect>
      <rect x="${left}" y="${y}" width="${Math.max(2, barWidth)}" height="${barHeight}" rx="5" fill="${row.color || colors.teal}"></rect>
      <text x="${left + barWidth + 8}" y="${y + 20}" font-size="12" font-weight="700" fill="#172026">${escapeHtml(row.display || row.value)}</text>
    `;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img">${body}</svg></div>`;
}

function donutChart(counts, palette, label = 'records') {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  let offset = 25;
  const slices = entries.map(([entryLabel, value], index) => {
    const dash = value / total * 100;
    const slice = `<circle cx="145" cy="145" r="98" fill="none" stroke="${palette[index % palette.length]}" stroke-width="38" stroke-dasharray="${dash} ${100 - dash}" stroke-dashoffset="${offset}" pathLength="100"></circle>`;
    offset -= dash;
    return slice;
  }).join('');
  const legend = entries.map(([entryLabel, value], index) => `<span style="--swatch:${palette[index % palette.length]}">${escapeHtml(entryLabel)} (${value})</span>`).join('');
  return `
    <div class="donut">
      <svg viewBox="0 0 300 300" role="img">
        <g transform="rotate(-90 145 145)">${slices}</g>
        <text x="145" y="137" text-anchor="middle" font-size="34" font-weight="800" fill="#172026">${total}</text>
        <text x="145" y="162" text-anchor="middle" font-size="13" fill="#62717a">${escapeHtml(label)}</text>
      </svg>
      <div class="legend">${legend}</div>
    </div>
  `;
}

function formatCell(key, value) {
  if (value === '') return '<span class="muted">-</span>';
  if (key.includes('SAR')) return `SAR ${money.format(value)}`;
  if (key.includes('%')) return progressBar(value);
  if (['Status', 'Risk Level', 'Health', 'Priority', 'Impact', 'Employment Status'].includes(key)) return badge(value, toneFor(value));
  return escapeHtml(value);
}

function currentSheet() {
  return sheetByPage[state.page] || '';
}

function rowIdentity(sheet, row) {
  const key = idKeys[sheet];
  return key ? String(row[key] || '') : '';
}

function findWorkbookRow(sheet, rowId) {
  const idKey = idKeys[sheet];
  if (!idKey) return null;
  return (data[sheet] || []).find(row => String(row[idKey] || '') === String(rowId)) || null;
}

function editableCell(sheet, row, column) {
  if (!state.canAdmin || !state.editMode || !sheet || column.render || column.readonly) return false;
  const idKey = idKeys[sheet];
  return Boolean(idKey && row[idKey] && column.key !== idKey);
}

function renderEditableCell(sheet, row, column) {
  const rowId = rowIdentity(sheet, row);
  const value = row[column.key] ?? '';
  return `
    <input
      class="table-edit-input"
      type="text"
      data-sheet="${escapeHtml(sheet)}"
      data-row-id="${escapeHtml(rowId)}"
      data-key="${escapeHtml(column.key)}"
      value="${escapeHtml(value)}"
      aria-label="${escapeHtml(column.key)}"
    >
  `;
}

function table(rows, columns, emptyText = 'No records match the current filters.', options = {}) {
  if (!rows.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  const sheet = options.sheet || currentSheet();
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map(column => `<th>${escapeHtml(column.label || column.key)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              ${columns.map(column => {
                const value = editableCell(sheet, row, column)
                  ? renderEditableCell(sheet, row, column)
                  : column.render
                    ? column.render(row)
                    : formatCell(column.key, row[column.key]);
                return `<td>${value}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function deleteButton(employee) {
  return `<button class="danger-button delete-user-button" type="button" data-email="${escapeHtml(employee.Email)}">Delete</button>`;
}

function adminButton(employee) {
  const email = employee.Email || '';
  const isRoot = normalize(email) === 'alharbi.moh2003@example-company.com';
  const isAdminUser = isRoot || state.adminEmails.includes(normalize(email));
  const label = isAdminUser ? 'Revoke Admin' : 'Make Admin';
  return `<button class="secondary admin-user-button" type="button" data-email="${escapeHtml(email)}" data-enabled="${isAdminUser ? 'false' : 'true'}" ${isRoot ? 'disabled' : ''}>${label}</button>`;
}

function pendingSignupActions(user) {
  return `
    <div class="admin-button-row compact">
      <button class="approve-signup-button" type="button" data-email="${escapeHtml(user.email)}">Approve</button>
      <button class="danger-button reject-signup-button" type="button" data-email="${escapeHtml(user.email)}">Reject</button>
    </div>
  `;
}

function createdAtLabel(value) {
  const timestamp = Number(value) || 0;
  if (!timestamp) return '';
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function companyEmailDomain() {
  const email = data.Employees.find(employee => employee.Email)?.Email || 'name@example-company.com';
  return email.includes('@') ? email.split('@').pop() : 'example-company.com';
}

function renderUpdateControls() {
  if (!state.canAdmin) return '';
  if (!state.editMode) {
    return '<button class="secondary" id="startEditButton" type="button">Start Editing</button>';
  }
  return `
    <button id="saveWorkbookButton" type="button">Save Changes</button>
    <button class="secondary" id="cancelEditButton" type="button">Cancel</button>
  `;
}

function renderEditModeBanner() {
  if (!state.canAdmin || !state.editMode) return '';
  return `
    <div class="admin-notice edit-mode-notice">
      Update mode is active. Editable cells on workbook pages will be saved to data.js and sample_data_cleaned.xlsx.
      <span>
        <button id="saveWorkbookBannerButton" type="button">Save Changes</button>
        <button class="secondary" id="cancelEditBannerButton" type="button">Cancel</button>
      </span>
    </div>
  `;
}

function renderAddUserForm() {
  const domain = companyEmailDomain();
  return panel('Add New User', 'Adds the user to this dashboard and the Excel Employees sheet', `
    <form class="add-user-form" id="addUserForm">
      <label>
        <span>First Name</span>
        <input name="first_name" type="text" autocomplete="given-name" required>
      </label>
      <label>
        <span>Last Name</span>
        <input name="last_name" type="text" autocomplete="family-name" required>
      </label>
      <label class="wide-field">
        <span>Company Email</span>
        <input name="email" type="email" autocomplete="email" placeholder="name@${escapeHtml(domain)}" required>
      </label>
      <div class="admin-button-row">
        <button type="submit">Add User</button>
      </div>
      <p class="form-message" id="addUserMessage" role="status"></p>
    </form>
  `);
}

function workbookPayload() {
  return JSON.parse(JSON.stringify(data));
}

function enterEditMode() {
  state.editSnapshot = workbookPayload();
  state.editMode = true;
  render();
}

function ensureEditSnapshot() {
  if (!state.editSnapshot) state.editSnapshot = workbookPayload();
  state.editMode = true;
}

function cancelEditMode() {
  if (state.editSnapshot) {
    Object.keys(data).forEach(key => delete data[key]);
    Object.assign(data, state.editSnapshot);
  }
  state.editMode = false;
  state.editSnapshot = null;
  render();
}

async function saveWorkbookChanges(button) {
  if (button) {
    button.disabled = true;
    button.textContent = 'Saving...';
  }
  const response = await fetch('/api/update-workbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workbook: workbookPayload() })
  });
  await readApiJson(response, 'Update failed.');
  state.editMode = false;
  state.editSnapshot = null;
  showToast('Dashboard changes have been saved to Excel');
  render();
}

function coerceEditedValue(original, value) {
  if (value === '') return '';
  if (typeof original === 'number') {
    const numeric = Number(value);
    return Number.isNaN(numeric) ? value : numeric;
  }
  return value;
}

function wireWorkbookEditing() {
  document.querySelectorAll('#startEditButton').forEach(button => {
    button.addEventListener('click', enterEditMode);
  });

  document.querySelectorAll('#cancelEditButton, #cancelEditBannerButton').forEach(button => {
    button.addEventListener('click', cancelEditMode);
  });

  document.querySelectorAll('#saveWorkbookButton, #saveWorkbookBannerButton').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await saveWorkbookChanges(button);
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
        button.textContent = 'Save Changes';
      }
    });
  });

  document.querySelectorAll('.table-edit-input').forEach(input => {
    input.addEventListener('input', event => {
      const { sheet, rowId, key } = event.target.dataset;
      const row = findWorkbookRow(sheet, rowId);
      if (!row) return;
      row[key] = coerceEditedValue(row[key], event.target.value);
    });
  });
}

function workbookHeaders(sheet) {
  const rows = data[sheet] || [];
  return [...new Set(rows.flatMap(row => Object.keys(row)))];
}

function nextSheetId(sheet) {
  const idKey = idKeys[sheet];
  if (!idKey) return '';
  const values = (data[sheet] || []).map(row => String(row[idKey] || '')).filter(Boolean);
  const parsed = values
    .map(value => value.match(/^([A-Z]+)(\d+)$/))
    .filter(Boolean)
    .map(match => ({ prefix: match[1], number: Number(match[2]), width: match[2].length }));
  if (!parsed.length) return '';
  const latest = parsed.sort((a, b) => b.number - a.number)[0];
  return `${latest.prefix}${String(latest.number + 1).padStart(latest.width, '0')}`;
}

function blankWorkbookRow(sheet) {
  return workbookHeaders(sheet).reduce((row, header) => {
    row[header] = header === idKeys[sheet] ? nextSheetId(sheet) : '';
    return row;
  }, {});
}

function filteredAdminRows(sheet) {
  const query = normalize(state.adminSearch).trim();
  return (data[sheet] || [])
    .map((row, index) => ({ row, index }))
    .filter(item => !query || Object.values(item.row).some(value => normalize(value).includes(query)));
}

function adminWorkbookTable(sheet) {
  const headers = workbookHeaders(sheet);
  const rows = filteredAdminRows(sheet);
  if (!headers.length) return '<div class="empty">This sheet does not have editable columns.</div>';
  if (!rows.length) return '<div class="empty">No rows match the admin search.</div>';
  return `
    <div class="table-wrap admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Actions</th>
            ${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ row, index }) => `
            <tr>
              <td>
                <button class="danger-button delete-workbook-row-button" type="button" data-sheet="${escapeHtml(sheet)}" data-index="${index}" ${state.editMode ? '' : 'disabled'}>Delete</button>
              </td>
              ${headers.map(header => `
                <td>
                  <input
                    class="table-edit-input"
                    type="text"
                    data-admin-cell="true"
                    data-sheet="${escapeHtml(sheet)}"
                    data-index="${index}"
                    data-key="${escapeHtml(header)}"
                    value="${escapeHtml(row[header] ?? '')}"
                    ${state.editMode ? '' : 'disabled'}
                  >
                </td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminPage() {
  if (!state.canAdmin) {
    return '<div class="empty">Administration access is required.</div>';
  }
  const sheet = editableWorkbookSheets.includes(state.adminSheet) ? state.adminSheet : 'Employees';
  state.adminSheet = sheet;
  const rows = data[sheet] || [];
  const userColumns = [
    { key: 'Admin', render: adminButton },
    { key: 'Actions', render: deleteButton },
    { key: 'Employee ID' },
    { key: 'Employee Name' },
    { key: 'Email' },
    { key: 'Department' },
    { key: 'Job Title' },
    { key: 'Employment Status' }
  ];
  const pendingColumns = [
    { key: 'Actions', render: pendingSignupActions },
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'created_at', label: 'Requested', render: user => escapeHtml(createdAtLabel(user.created_at)) }
  ];

  return `
    ${kpiCards([
      { label: 'Workbook Sheet', value: sheet, note: `${number.format(rows.length)} rows loaded` },
      { label: 'Administrators', value: number.format(state.adminEmails.length), note: 'Users with admin privileges' },
      { label: 'Pending Signups', value: number.format(state.pendingUsers.length), note: 'Require admin approval' },
      { label: 'Edit State', value: state.editMode ? 'Editing' : 'Locked', note: state.editMode ? 'Unsaved changes stay local until saved' : 'Start editing to change workbook rows' }
    ])}
    <section class="grid admin-users-grid">
      ${renderAddUserForm()}
      ${panel('Pending Signups', 'Approve new users before they can access the dashboard', table(state.pendingUsers, pendingColumns, 'No signup requests are waiting for approval.', { sheet: '' }))}
      ${panel('Administration Privileges', 'Grant, revoke, or delete dashboard users', table(data.Employees, userColumns, 'No employees found.', { sheet: 'Employees' }))}
    </section>
    ${panel('Workbook Editor', 'Add, delete, and edit rows before saving to data.js and sample_data_cleaned.xlsx', `
      <div class="admin-editor-toolbar">
        <label>
          <span>Sheet</span>
          <select id="adminSheetSelect">
            ${editableWorkbookSheets.map(option => `<option value="${escapeHtml(option)}" ${option === sheet ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
          </select>
        </label>
        <label class="searchbox">
          <span>Search Sheet</span>
          <input id="adminSearchInput" type="search" value="${escapeHtml(state.adminSearch)}" placeholder="Search selected sheet...">
        </label>
        <div class="admin-button-row">
          ${renderUpdateControls()}
          <button class="secondary" id="addWorkbookRowButton" type="button" ${state.editMode ? '' : 'disabled'}>Add Row</button>
        </div>
      </div>
      ${adminWorkbookTable(sheet)}
    `)}
  `;
}

function wireAdminPage() {
  if (state.page !== 'admin') return;
  wireEmployeeActions();
  wireWorkbookEditing();

  const sheetSelect = document.querySelector('#adminSheetSelect');
  if (sheetSelect) {
    sheetSelect.addEventListener('change', event => {
      state.adminSheet = event.target.value;
      state.adminSearch = '';
      renderPage();
    });
  }

  const searchInput = document.querySelector('#adminSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', event => {
      state.adminSearch = event.target.value;
      renderPage();
    });
  }

  const addRowButton = document.querySelector('#addWorkbookRowButton');
  if (addRowButton) {
    addRowButton.addEventListener('click', () => {
      ensureEditSnapshot();
      data[state.adminSheet].push(blankWorkbookRow(state.adminSheet));
      state.adminSearch = '';
      renderPage();
    });
  }

  document.querySelectorAll('.delete-workbook-row-button').forEach(button => {
    button.addEventListener('click', () => {
      const sheet = button.dataset.sheet;
      const index = Number(button.dataset.index);
      if (!state.editMode || !data[sheet] || Number.isNaN(index)) return;
      const idKey = idKeys[sheet];
      const label = idKey ? data[sheet][index]?.[idKey] : `row ${index + 1}`;
      if (!confirm(`Delete ${label || `row ${index + 1}`} from ${sheet}?`)) return;
      ensureEditSnapshot();
      data[sheet].splice(index, 1);
      renderPage();
    });
  });

  document.querySelectorAll('[data-admin-cell="true"]').forEach(input => {
    input.addEventListener('input', event => {
      const sheet = event.target.dataset.sheet;
      const index = Number(event.target.dataset.index);
      const key = event.target.dataset.key;
      if (!state.editMode || !data[sheet] || !data[sheet][index] || !key) return;
      ensureEditSnapshot();
      data[sheet][index][key] = coerceEditedValue(data[sheet][index][key], event.target.value);
    });
  });

  document.querySelectorAll('.approve-signup-button, .reject-signup-button').forEach(button => {
    button.addEventListener('click', async () => {
      const email = button.dataset.email;
      const action = button.classList.contains('approve-signup-button') ? 'approve' : 'reject';
      if (!email) return;
      const confirmed = confirm(`${action === 'approve' ? 'Approve' : 'Reject'} signup request for ${email}?`);
      if (!confirmed) return;

      button.disabled = true;
      try {
        const response = await fetch('/api/review-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, action })
        });
        const payload = await readApiJson(response, 'Signup review failed.');
        state.pendingUsers = payload.pending_users || [];
        sessionStorage.setItem('pendingUsers', JSON.stringify(state.pendingUsers));
        if (payload.employee) {
          data.Employees = data.Employees.filter(employee => normalize(employee.Email) !== normalize(payload.employee.Email));
          data.Employees.push(payload.employee);
        }
        showToast(`Signup request ${action === 'approve' ? 'approved' : 'rejected'}`);
        render();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    });
  });
}

function wireEmployeeActions() {
  const addUserForm = document.querySelector('#addUserForm');
  if (addUserForm) {
    addUserForm.addEventListener('submit', async event => {
      event.preventDefault();
      const message = document.querySelector('#addUserMessage');
      const button = addUserForm.querySelector('button');
      message.textContent = '';
      message.classList.remove('success');
      button.disabled = true;
      button.textContent = 'Adding...';

      try {
        const response = await fetch('/api/add-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            first_name: addUserForm.first_name.value.trim(),
            last_name: addUserForm.last_name.value.trim(),
            email: addUserForm.email.value.trim()
          })
        });
        const payload = await readApiJson(response, 'Add user failed.');

        data.Employees = data.Employees.filter(employee => normalize(employee.Email) !== normalize(payload.employee.Email));
        data.Employees.push(payload.employee);
        state.status = 'All';
        showToast(`${payload.employee['Employee Name']} has been added`);
        render();
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
        button.textContent = 'Add User';
      }
    });
  }

  document.querySelectorAll('.delete-user-button').forEach(button => {
    button.addEventListener('click', async () => {
      const email = button.dataset.email;
      if (!email) return;
      const confirmed = confirm(`Delete ${email} from users, dashboard data, and Excel data?`);
      if (!confirmed) return;

      button.disabled = true;
      try {
        const response = await fetch('/api/delete-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        await readApiJson(response, 'Delete failed.');

        data.Employees = data.Employees.filter(employee => normalize(employee.Email) !== normalize(email));
        showToast('User has been deleted');
        render();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll('.admin-user-button').forEach(button => {
    button.addEventListener('click', async () => {
      const email = button.dataset.email;
      const enabled = button.dataset.enabled === 'true';
      if (!email) return;
      const confirmed = confirm(`${enabled ? 'Grant' : 'Revoke'} administration privileges for ${email}?`);
      if (!confirmed) return;

      button.disabled = true;
      try {
        const response = await fetch('/api/set-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, is_admin: enabled })
        });
        const payload = await readApiJson(response, 'Admin update failed.');

        const normalized = normalize(email);
        state.adminEmails = (payload.admin_emails || (enabled
          ? [...new Set([...state.adminEmails, normalized])]
          : state.adminEmails.filter(adminEmail => adminEmail !== normalized))).map(adminEmail => normalize(adminEmail));
        sessionStorage.setItem('adminEmails', JSON.stringify(state.adminEmails));
        showToast(`Administration privileges ${enabled ? 'granted' : 'revoked'}`);
        render();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    });
  });
}

function countRows(counts, palette = [colors.teal, colors.blue, colors.green, colors.amber, colors.red, colors.violet]) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], index) => ({ label, value, color: palette[index % palette.length] }));
}

function renderOverview() {
  const departments = filterRows(data.Departments, { department: true });
  const employees = filterRows(data.Employees, { department: true });
  const projects = filterRows(data.Projects, { department: true, status: true });
  const tasks = filterRows(data.Tasks, { department: true, status: true });
  const meetings = filterRows(data.Meetings);
  const updates = filterRows(data['Weekly Updates'], { department: true, status: true });
  const logs = filterRows(data['Activity Log'], { department: true });
  const dashboardRows = data.Dashboard.map(row => Object.values(row)[0]).filter(Boolean);
  const openTasks = tasks.filter(task => task.Status !== 'Completed').length;
  const blockedTasks = tasks.filter(task => task.Status === 'Blocked').length;
  const riskProjects = projects.filter(project => ['High', 'Critical'].includes(project['Risk Level']) || project.Status === 'At Risk').length;

  const projectStatusRows = countRows(byCount(projects, 'Status'), [colors.teal, colors.blue, colors.green, colors.amber, colors.red]);
  const departmentRows = countRows(byCount(projects, 'Department')).slice(0, 10);

  return `
    ${kpiCards([
      { label: 'Departments', value: number.format(departments.length), note: `${number.format(data.Departments.length)} total in sheet` },
      { label: 'Employees', value: number.format(employees.length), note: `${number.format(data.Employees.length)} total employees exported` },
      { label: 'Projects', value: number.format(projects.length), note: `${number.format(riskProjects)} risk signals` },
      { label: 'Open Tasks', value: number.format(openTasks), note: `${number.format(blockedTasks)} blocked` },
      { label: 'Activity Events', value: number.format(logs.length), note: `${number.format(meetings.length)} meetings, ${number.format(updates.length)} updates` }
    ])}
    <section class="grid two">
      ${panel('Project Status', 'Distribution from the Projects sheet', donutChart(byCount(projects, 'Status'), [colors.teal, colors.blue, colors.green, colors.amber, colors.red], 'projects'))}
      ${panel('Project Load by Department', 'Top departments by project count', barChart(departmentRows, { left: 180 }))}
    </section>
    <section class="grid two">
      ${panel('Workbook Sheets', 'Rows exported into this dashboard', table([
        { Sheet: 'Departments', Rows: data.Departments.length },
        { Sheet: 'Employees', Rows: data.Employees.length },
        { Sheet: 'Projects', Rows: data.Projects.length },
        { Sheet: 'Tasks', Rows: data.Tasks.length },
        { Sheet: 'Meetings', Rows: data.Meetings.length },
        { Sheet: 'Weekly Updates', Rows: data['Weekly Updates'].length },
        { Sheet: 'Activity Log', Rows: data['Activity Log'].length }
      ], [{ key: 'Sheet' }, { key: 'Rows' }]))}
      ${panel('Dashboard Source Rows', 'The original overview sheet entries', `
        <div class="activity-list">
          ${dashboardRows.map(value => `<div class="activity-item"><strong>${escapeHtml(value)}</strong></div>`).join('')}
        </div>
      `)}
    </section>
  `;
}

function renderDepartments() {
  const departments = filterRows(data.Departments, { department: true });
  const rows = departments.map(department => {
    const name = department['Department Name'];
    const projects = data.Projects.filter(project => project.Department === name);
    const employees = data.Employees.filter(employee => employee.Department === name);
    const tasks = data.Tasks.filter(task => task.Department === name);
    return { ...department, Employees: employees.length, Projects: projects.length, 'Open Tasks': tasks.filter(task => task.Status !== 'Completed').length };
  });

  return `
    ${kpiCards([
      { label: 'Departments', value: number.format(rows.length), note: `${number.format(data.Departments.length)} total` },
      { label: 'Headcount Plan', value: number.format(sum(rows, 'Headcount')), note: 'From Departments sheet' },
      { label: 'Actual Employees', value: number.format(rows.reduce((total, row) => total + row.Employees, 0)), note: 'From Employees sheet' },
      { label: 'Annual Budget', value: `SAR ${money.format(sum(rows, 'Annual Budget SAR'))}`, note: 'Filtered department budget' }
    ])}
    <section class="grid two">
      ${panel('Headcount by Department', 'Planned headcount from the Departments sheet', barChart(rows.map(row => ({ label: row['Department Name'], value: Number(row.Headcount) || 0 })), { left: 180 }))}
      ${panel('Division Mix', 'Departments grouped by division', donutChart(byCount(rows, 'Division'), [colors.teal, colors.blue, colors.green, colors.amber, colors.violet], 'departments'))}
    </section>
    ${panel('Department Register', 'Every department row with linked workload counts', table(rows, [
      { key: 'Department ID' },
      { key: 'Department Name' },
      { key: 'Division' },
      { key: 'Location' },
      { key: 'Director' },
    { key: 'Headcount' },
    { key: 'Employees', readonly: true },
    { key: 'Projects', readonly: true },
    { key: 'Open Tasks', readonly: true },
      { key: 'Annual Budget SAR' }
    ]))}
  `;
}

function renderEmployees() {
  const employees = filterRows(data.Employees, { department: true });
  const newUsers = data.Employees.filter(employee => employee.Department === 'Pending Assignment' || employee['Job Title'] === 'New User');
  const active = employees.filter(employee => employee['Employment Status'] === 'Active').length;
  const columns = [
    { key: 'Employee ID' },
    { key: 'Employee Name' },
    { key: 'Email' },
    { key: 'Department' },
    { key: 'Job Title' },
    { key: 'Level' },
    { key: 'Manager' },
    { key: 'Location' },
    { key: 'Hire Date' },
    { key: 'Employment Status' }
  ];
  const newUsersPanel = newUsers.length
    ? panel('New Users', 'Signed-up employees awaiting assignment', table(newUsers, columns))
    : '';

  return `
    ${kpiCards([
      { label: 'Employees', value: number.format(employees.length), note: `${number.format(data.Employees.length)} total employees in source` },
      { label: 'Active', value: number.format(active), note: 'Current employment status' },
      { label: 'Departments', value: number.format(new Set(employees.map(row => row.Department)).size), note: 'Represented in filtered rows' },
      { label: 'Locations', value: number.format(new Set(employees.map(row => row.Location)).size), note: 'Employee office locations' }
    ])}
    <section class="grid two">
      ${panel('Employees by Department', 'All employees from the Employees sheet', barChart(countRows(byCount(employees, 'Department')).slice(0, 12), { left: 180 }))}
      ${panel('Level Mix', 'Employees grouped by level', donutChart(byCount(employees, 'Level'), [colors.teal, colors.blue, colors.green, colors.amber, colors.violet], 'employees'))}
    </section>
    ${newUsersPanel}
    ${panel('Employee Directory', 'Every employee row from the cleaned workbook', table(employees, columns))}
  `;
}

function renderProjects() {
  const projects = filterRows(data.Projects, { department: true, status: true });
  const budget = sum(projects, 'Budget SAR');
  const spend = sum(projects, 'Actual Spend SAR');

  return `
    ${kpiCards([
      { label: 'Projects', value: number.format(projects.length), note: `${number.format(data.Projects.length)} total projects` },
      { label: 'Average Progress', value: `${Math.round(average(projects, 'Progress %'))}%`, note: 'Across filtered projects' },
      { label: 'Budget', value: `SAR ${money.format(budget)}`, note: `Spend SAR ${money.format(spend)}` },
      { label: 'At Risk', value: number.format(projects.filter(project => project.Status === 'At Risk').length), note: 'Project status is At Risk' }
    ])}
    <section class="grid two">
      ${panel('Status Mix', 'Project status distribution', donutChart(byCount(projects, 'Status'), [colors.teal, colors.blue, colors.green, colors.amber, colors.red], 'projects'))}
      ${panel('Risk Levels', 'Projects grouped by risk', barChart(countRows(byCount(projects, 'Risk Level'), [colors.green, colors.amber, colors.red]), { left: 110 }))}
    </section>
    ${panel('Project Register', 'Every project row from the Projects sheet', table(projects, [
      { key: 'Project ID' },
      { key: 'Project Name' },
      { key: 'Department' },
      { key: 'Owner' },
      { key: 'Status' },
      { key: 'Priority' },
      { key: 'Risk Level' },
      { key: 'Start Date' },
      { key: 'Target End Date' },
      { key: 'Progress %' },
      { key: 'Budget SAR' },
      { key: 'Actual Spend SAR' },
      { key: 'Strategic Theme' }
    ]))}
  `;
}

function renderTasks() {
  const tasks = filterRows(data.Tasks, { department: true, status: true });
  const open = tasks.filter(task => task.Status !== 'Completed').length;

  return `
    ${kpiCards([
      { label: 'Tasks', value: number.format(tasks.length), note: `${number.format(data.Tasks.length)} total tasks` },
      { label: 'Open', value: number.format(open), note: 'Not completed' },
      { label: 'Blocked', value: number.format(tasks.filter(task => task.Status === 'Blocked').length), note: 'Requires follow-up' },
      { label: 'Actual Hours', value: number.format(sum(tasks, 'Actual Hours')), note: `${number.format(sum(tasks, 'Estimated Hours'))} estimated` }
    ])}
    <section class="grid two">
      ${panel('Task Status', 'Tasks grouped by workflow status', barChart(countRows(byCount(tasks, 'Status')), { left: 130 }))}
      ${panel('Task Priority', 'Tasks grouped by priority', donutChart(byCount(tasks, 'Priority'), [colors.red, colors.amber, colors.blue, colors.green], 'tasks'))}
    </section>
    ${panel('Task Register', 'Every task row from the Tasks sheet', table(tasks, [
      { key: 'Task ID' },
      { key: 'Project' },
      { key: 'Task Name' },
      { key: 'Assigned To' },
      { key: 'Department' },
      { key: 'Status' },
      { key: 'Priority' },
      { key: 'Due Date' },
      { key: 'Estimated Hours' },
      { key: 'Actual Hours' },
      { key: 'Completion %' }
    ]))}
  `;
}

function renderMeetings() {
  const meetings = filterRows(data.Meetings);

  return `
    ${kpiCards([
      { label: 'Meetings', value: number.format(meetings.length), note: `${number.format(data.Meetings.length)} total meetings` },
      { label: 'Attendees', value: number.format(sum(meetings, 'Attendees Count')), note: 'Total attendance count' },
      { label: 'Avg Duration', value: `${Math.round(average(meetings, 'Duration Minutes'))} min`, note: 'Across filtered meetings' },
      { label: 'Channels', value: number.format(new Set(meetings.map(row => row['Location/Channel'])).size), note: 'Locations and meeting channels' }
    ])}
    <section class="grid two">
      ${panel('Meeting Types', 'Meetings grouped by type', barChart(countRows(byCount(meetings, 'Meeting Type')), { left: 180 }))}
      ${panel('Outcomes', 'Meetings grouped by outcome', donutChart(byCount(meetings, 'Outcome'), [colors.teal, colors.blue, colors.green, colors.amber, colors.violet], 'meetings'))}
    </section>
    ${panel('Meeting Register', 'Every meeting row from the Meetings sheet', table(meetings, [
      { key: 'Meeting ID' },
      { key: 'Project' },
      { key: 'Meeting Type' },
      { key: 'Date' },
      { key: 'Time' },
      { key: 'Duration Minutes' },
      { key: 'Organizer' },
      { key: 'Attendees Count' },
      { key: 'Outcome' },
      { key: 'Location/Channel' }
    ]))}
  `;
}

function renderUpdates() {
  const updates = filterRows(data['Weekly Updates'], { department: true, status: true });

  return `
    ${kpiCards([
      { label: 'Updates', value: number.format(updates.length), note: `${number.format(data['Weekly Updates'].length)} total updates` },
      { label: 'Green', value: number.format(updates.filter(update => update.Health === 'Green').length), note: 'Healthy weekly updates' },
      { label: 'Amber / Red', value: number.format(updates.filter(update => update.Health !== 'Green').length), note: 'Needs attention' },
      { label: 'Avg Progress', value: `${Math.round(average(updates, 'Progress %'))}%`, note: 'Reported progress' }
    ])}
    <section class="grid two">
      ${panel('Health Signals', 'Weekly updates grouped by health', donutChart(byCount(updates, 'Health'), [colors.green, colors.amber, colors.red], 'updates'))}
      ${panel('Update Status', 'Reported project status in updates', barChart(countRows(byCount(updates, 'Status')), { left: 130 }))}
    </section>
    ${panel('Weekly Update Register', 'Every update row from the Weekly Updates sheet', table(updates, [
      { key: 'Update ID' },
      { key: 'Week Starting' },
      { key: 'Project' },
      { key: 'Department' },
      { key: 'Health' },
      { key: 'Status' },
      { key: 'Progress %' },
      { key: 'Key Accomplishment' },
      { key: 'Blocker/Risk' },
      { key: 'Next Step' }
    ]))}
  `;
}

function renderLogs() {
  const logs = filterRows(data['Activity Log'], { department: true });

  return `
    ${kpiCards([
      { label: 'Activity Events', value: number.format(logs.length), note: `${number.format(data['Activity Log'].length)} total log rows` },
      { label: 'High Impact', value: number.format(logs.filter(log => log.Impact === 'High').length), note: 'High-impact events' },
      { label: 'Employees', value: number.format(new Set(logs.map(log => log['Employee ID'])).size), note: 'Represented in logs' },
      { label: 'Projects', value: number.format(new Set(logs.map(log => log['Project ID'])).size), note: 'Represented in logs' }
    ])}
    <section class="grid two">
      ${panel('Activity Types', 'Log rows grouped by activity type', barChart(countRows(byCount(logs, 'Activity Type')).slice(0, 12), { left: 190 }))}
      ${panel('Impact Mix', 'Log rows grouped by impact', donutChart(byCount(logs, 'Impact'), [colors.red, colors.amber, colors.green], 'events'))}
    </section>
    ${panel('Activity Register', 'Every row from the Activity Log sheet', table(logs, [
      { key: 'Activity ID' },
      { key: 'Timestamp' },
      { key: 'Employee' },
      { key: 'Department' },
      { key: 'Project' },
      { key: 'Task ID' },
      { key: 'Activity Type' },
      { key: 'Impact' },
      { key: 'Source' }
    ]))}
  `;
}

function renderPage() {
  const target = document.querySelector('#page');
  let content = '';
  if (state.page === 'departments') content = renderDepartments();
  else if (state.page === 'admin') content = renderAdminPage();
  else if (state.page === 'employees') {
    content = renderEmployees();
  }
  else if (state.page === 'projects') content = renderProjects();
  else if (state.page === 'tasks') content = renderTasks();
  else if (state.page === 'meetings') content = renderMeetings();
  else if (state.page === 'updates') content = renderUpdates();
  else if (state.page === 'logs') content = renderLogs();
  else content = renderOverview();

  target.innerHTML = `${renderEditModeBanner()}${content}`;
  if (state.page === 'admin') wireAdminPage();
  else wireWorkbookEditing();
}

function render() {
  renderShell();
  renderPage();
}

window.addEventListener('hashchange', () => {
  state.page = location.hash.replace('#/', '') || 'overview';
  if (!visiblePages().some(page => page.id === state.page)) state.page = 'overview';
  render();
});

if (!location.hash) location.hash = '#/overview';
if (!visiblePages().some(page => page.id === state.page)) state.page = 'overview';
render();
showStoredWelcome();
refreshCurrentUser();
