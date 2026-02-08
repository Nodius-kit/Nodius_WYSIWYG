import './styles.css';
import * as basic from './tabs/basic';
import * as collaborative from './tabs/collaborative';
import * as customPlugin from './tabs/custom-plugin';
import * as builder from './tabs/builder';

interface Tab {
  mount(container: HTMLElement): void;
  destroy(): void;
}

const TABS: Record<string, Tab> = {
  basic,
  collaborative,
  'custom-plugin': customPlugin,
  builder,
};

let activeTabId: string | null = null;

function switchTab(tabId: string): void {
  const content = document.getElementById('tab-content')!;

  // Destroy current tab
  if (activeTabId && TABS[activeTabId]) {
    TABS[activeTabId].destroy();
  }
  content.innerHTML = '';

  // Update active button
  document.querySelectorAll('.pg-tab').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tabId);
  });

  // Mount new tab
  activeTabId = tabId;
  if (TABS[tabId]) {
    TABS[tabId].mount(content);
  }
}

// Setup click handlers
document.getElementById('tab-bar')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.pg-tab') as HTMLElement | null;
  if (!btn || !btn.dataset.tab) return;
  switchTab(btn.dataset.tab);
});

// Start with Basic tab
switchTab('basic');
