'use strict';
// Command bar and terminal output. All output is built with textContent, never innerHTML.
(() => {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  const form = document.getElementById('cmd-form');
  const input = document.getElementById('cmd');
  const live = document.getElementById('term-live');
  const body = document.getElementById('term-body');
  const terminal = document.getElementById('terminal');
  if (!form || !input || !live || !body || !terminal) return;

  const PROJECTS = [
    ['homelab/', '#lab', 'ongoing', 'sonicwall / linux / snmp'],
    ['mapleai/', '#mapleai', 'in-development', 'security tooling / ai'],
    ['sapwatch/', '#sapwatch', 'in-development', 'siem / log pipeline'],
  ];
  const SECTIONS = { work: 'work', lab: 'lab', homelab: 'lab', about: 'about', skills: 'skills-heading', services: 'services', contact: 'contact', mapleai: 'mapleai', sapwatch: 'sapwatch' };
  const DIRS = { 'work/homelab': 'notes.md  sonicwall.md  server.md', 'work/mapleai': 'README.md', 'work/sapwatch': 'README.md' };
  const FILES = {
    'about.md': [
      ['# rightrice', 'strong'],
      ['A cybersecurity professional with a developer’s mindset and a hands-on approach to systems.'],
      ['## now', 'h'],
      ['Level 2 Technical Analyst. Builds my own security tooling and software.'],
      ['Open to freelance penetration testing and security work.', 'ok'],
      ['## based', 'h'],
      ['New York'],
      ['## focus', 'h'],
      ['offense    attack practice in my own lab · studying for Hack The Box CPTS'],
      ['networks   SonicWall (SNSA certified) · Cisco CCNA in progress · zones, VLANs, VPN, DPI-SSL'],
      ['defense    logging, detection, and hardening · building SapWatch, a multi-tenant SIEM'],
      ['software   iOS development · MapleAI, local language models for authorized testing'],
      ['## education', 'h'],
      ['B.S. Cybersecurity, SUNY Canton, Cum Laude'],
      ['## how i think', 'h'],
      ['- Think like an attacker: question the assumptions and follow the attack surface.'],
      ['- Know the infrastructure: good security decisions start with knowing what keeps the environment running.'],
      ['- Build with purpose: turn recurring problems into tools.'],
      ['## drawn to', 'h'],
      ['The work beneath the surface: understanding a protocol, tracing an unexpected result, or building a tool that makes a difficult task easier.', 'muted'],
      ['## more', 'h'],
      ['cat services.md · cat skills.txt · ls work/ · contact', 'muted'],
    ],
    'creds.txt': [
      ['B.S. Cybersecurity, SUNY Canton, Cum Laude   done'],
      ['SonicWall SNSA                                done'],
      ['Cisco CCNA                                    in progress', 'st'],
      ['Hack The Box CPTS                             in progress', 'st'],
    ],
    'services.md': [
      ['# Freelance penetration testing and security work', 'strong'],
      ['- penetration testing: networks and web applications'],
      ['- firewall and network reviews: SonicWall zones, VLANs, VPN, security services, rules'],
      ['- logging and detection: firewall, endpoint, and cloud logs in one place'],
      ['- hardening: baselines, patching, and configuration reviews'],
      ['scope -> test -> report. Written authorization and an agreed scope come first.', 'muted'],
      ['Type contact to start a conversation.', 'ok'],
    ],
    'skills.txt': [
      ['network security   SonicWall (SNSA) · zones and VLANs · VPN · DPI-SSL · Geo-IP blocking · bandwidth controls · SAML login · VoIP'],
      ['systems            Linux services · storage and backups · SNMP monitoring · Kali Linux'],
      ['offense            attack practice in my own lab · Hack The Box CPTS in progress'],
      ['defense            logging and detection · hardening and patching · firewall rule reviews'],
      ['software and ai    iOS development · IBM Granite and Ollama'],
    ],
    'work/mapleai/readme.md': [
      ['# MapleAI', 'strong'],
      ['Bringing local intelligence to security work.'],
      ['Local models that use technical knowledge and system tools inside an authorized testing scope.', 'muted'],
      ['stack   ibm-granite · ollama · local tooling'],
      ['status  active internal development', 'st'],
    ],
    'work/sapwatch/readme.md': [
      ['# SapWatch', 'strong'],
      ['A multi-tenant SIEM for firewall, network, endpoint, and cloud security logs.'],
      ['sources  SonicWall · FortiGate · UniFi · SNMPv3 · NetFlow/IPFIX · Wazuh + Sysmon · Huntress · Microsoft 365', 'muted'],
      ['path     site collector (disk buffer, mTLS) -> ingestion gateway (auth, tenancy, audit) -> detect -> search', 'muted'],
      ['detect   own rules + SigmaHQ community rules', 'muted'],
      ['stack    python · vector · opensearch · redpanda · postgresql'],
      ['status   in development; tested offline against sample data', 'st'],
    ],
    'work/homelab/notes.md': [
      ['# The home lab', 'strong'],
      ['A full SonicWall firewall and a Linux server.'],
      ['Used for attack practice, detection and logging, network monitoring, and hardening.', 'muted'],
      ['Also exploring local AI tooling on Kali Linux.', 'muted'],
      ['status  ongoing', 'st'],
    ],
    'work/homelab/sonicwall.md': [
      ['# SonicWall', 'strong'],
      ['- zones and VLAN segmentation'],
      ['- VPN'],
      ['- security services: IPS, Gateway Anti-Virus, Anti-Spyware, App Control, Content Filtering, Capture ATP'],
      ['- DPI-SSL inspection, logging, and reporting'],
      ['- SNMP monitoring'],
      ['- SAML for user login'],
      ['- VoIP configuration'],
      ['- Geo-IP blocking'],
      ['- bandwidth controls'],
      ['- templates for quick installs'],
      ['- Security Insight enhancements'],
    ],
    'work/homelab/server.md': [
      ['# Server', 'strong'],
      ['- self-hosted Linux services'],
      ['- storage and backups'],
    ],
  };
  const HELP = [
    ['ls work/', 'list projects'],
    ['cat about.md', 'short bio'],
    ['cat creds.txt', 'education and certifications'],
    ['cat services.md', 'freelance services'],
    ['cat skills.txt', 'skills and tools'],
    ['ls work/homelab', 'what is in the lab'],
    ['cd work|lab|about|services|contact', 'jump to a section'],
    ['open github', 'open GitHub in a new tab'],
    ['contact', 'go to the contact form'],
    ['date', 'your local date and time'],
    ['history', 'commands you have run'],
    ['clear', 'clear the screen'],
  ];

  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const clean = path => path.toLowerCase().replace(/^(\.\/|~\/)/, '').replace(/\/+$/, '');
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  let block;
  function startBlock(command) {
    block = make('div', 'block');
    const prompt = make('p', 'line');
    prompt.append(make('span', 'u', 'rightrice@dev'), make('span', 'p', ':~$'), ` ${command}`);
    block.append(prompt);
    live.append(block);
  }
  function print(text, className) {
    const line = make('p', className ? `line ${className}` : 'line', text);
    // Hang wrapped text under the value after a "label   " column or a "- " bullet.
    const lead = /^(- |[A-Za-z][\w ]*?\s{2,})(?=\S)/.exec(text);
    if (lead && lead[1].length <= 20) line.style.setProperty('--hang', `${lead[1].length}ch`);
    block.append(line);
  }

  // Move to a section and put focus there, so keyboard and screen reader users follow along.
  function go(id, focusId) {
    const target = document.getElementById(id);
    if (!target) return false;
    const focusTarget = document.getElementById(focusId || `${id}-heading`) || target;
    if (window.location.hash === `#${id}`) target.scrollIntoView();
    else window.location.hash = id;
    if (!focusTarget.hasAttribute('tabindex') && !/^(INPUT|TEXTAREA|A|BUTTON)$/.test(focusTarget.tagName)) {
      focusTarget.setAttribute('tabindex', '-1');
    }
    focusTarget.focus({ preventScroll: true });
    return true;
  }

  function listProjects() {
    const grid = make('div', 'ls');
    for (const [name, href, status, area] of PROJECTS) {
      const link = make('a', 'dir', name);
      link.href = href;
      grid.append(make('span', 'muted', 'drwxr-x---'), link, make('span', 'st', status), make('span', 'muted', area));
    }
    block.append(grid);
  }

  const commands = {
    help() {
      const grid = make('div', 'help');
      for (const [command, description] of HELP) grid.append(make('span', 'st', command), make('span', 'muted', description));
      block.append(grid);
    },
    whoami() {
      print('rightrice. L2 Technical Analyst; builds security tooling and software.');
      print('offensive security · network infrastructure · software', 'muted');
      print('available for freelance penetration testing and security work', 'ok');
    },
    ls(args) {
      const path = clean(args.find(arg => !arg.startsWith('-')) || '');
      if (path === '') print('work/  about.md  creds.txt  services.md  skills.txt');
      else if (path === 'work') listProjects();
      else if (has(DIRS, path)) print(DIRS[path]);
      else print(`ls: ${path}: No such file or directory`, 'err');
    },
    cat(args) {
      if (!args[0]) { print('usage: cat <file>   try: cat about.md', 'muted'); return; }
      const path = clean(args[0]);
      if (has(FILES, path)) FILES[path].forEach(([text, className]) => print(text, className));
      else if (path === 'work' || has(DIRS, path)) print(`cat: ${args[0]}: Is a directory`, 'err');
      else print(`cat: ${args[0]}: No such file or directory`, 'err');
    },
    cd(args) {
      const name = clean(args[0] || '').replace(/^work\//, '');
      if (name === '' || name === '~') return go('main', 'intro-heading');
      if (has(SECTIONS, name)) return go(SECTIONS[name]);
      print(`cd: no such file or directory: ${args[0]}`, 'err');
      return false;
    },
    open(args) {
      const name = clean(args[0] || '');
      if (name === 'github') {
        window.open('https://github.com/rightrice', '_blank', 'noopener,noreferrer');
        print('Opening github.com/rightrice in a new tab.', 'muted');
        return false;
      }
      return commands.cd(args);
    },
    contact() {
      print('Opening the contact form.', 'muted');
      return go('contact', 'contact-name');
    },
    date() {
      print(new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(new Date()));
    },
    history() {
      history.forEach((entry, index) => print(`${String(index + 1).padStart(4)}  ${entry}`));
    },
    sudo() {
      print('rightrice is not in the sudoers file. This incident will be reported.', 'err');
    },
  };

  function clearScreen() {
    live.replaceChildren();
    body.querySelectorAll('.block').forEach(el => { el.hidden = true; });
  }

  const history = [];
  let recall = 0;
  function run(raw) {
    const text = String(raw).trim().slice(0, 80);
    if (!text) return;
    history.push(text);
    if (history.length > 50) history.shift();
    recall = history.length;
    const [first, ...args] = text.split(/\s+/);
    const name = first.toLowerCase();
    if (name === 'clear') { clearScreen(); return; }
    startBlock(text);
    let moved = false;
    if (has(commands, name)) moved = commands[name](args) === true;
    else {
      print(`zsh: command not found: ${first}`, 'err');
      print('Type help to see what works here.', 'muted');
    }
    // Show the start of the new output, so long files are read from the top.
    body.scrollTop = Math.max(0, block.offsetTop - 20);
    if (!moved) {
      const box = terminal.getBoundingClientRect();
      if (box.top < 0 || box.bottom > window.innerHeight) terminal.scrollIntoView({ block: 'nearest' });
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    run(input.value);
    input.value = '';
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      recall = Math.max(0, recall - 1);
      input.value = history[recall];
    } else if (event.key === 'ArrowDown' && history.length) {
      event.preventDefault();
      recall = Math.min(history.length, recall + 1);
      input.value = history[recall] || '';
    } else if (event.key === 'Escape') {
      input.value = '';
      input.blur();
    }
  });

  // "/" focuses the command bar unless the visitor is typing somewhere else.
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    event.preventDefault();
    input.focus();
  });

  // Command chips stay plain links without JavaScript; with it, they run in the terminal.
  document.querySelectorAll('[data-cmd]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      run(link.dataset.cmd);
    });
  });

  // Mark the status-bar tab for the section in view, like tmux's current window.
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const targets = tabs.map(tab => document.getElementById(tab.dataset.tab));
  let queued = false;
  function markTab() {
    queued = false;
    const threshold = window.innerHeight * 0.4;
    let index = 0;
    targets.forEach((target, i) => { if (target && target.getBoundingClientRect().top <= threshold) index = i; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) index = targets.length - 1;
    tabs.forEach((tab, i) => {
      if (i === index) tab.setAttribute('aria-current', 'location');
      else tab.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; window.requestAnimationFrame(markTab); }
  }, { passive: true });
  markTab();

  form.hidden = false;
})();
