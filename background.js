// Service worker: keyboard command, right-click menu, first-run onboarding, and
// the Pro "auto-group on startup / new window" automation.
import { groupTabs, maybeAutoGroup } from './src/actions.js';

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'group-tabs',
    title: 'Group tabs by topic',
    contexts: ['action', 'page'],
  });
  // First-run onboarding: open the options/welcome page.
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'group-tabs') groupTabs();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'group-tabs') groupTabs();
});

// Pro automation — only fires if enabled in settings AND the user is Pro (gated inside).
chrome.runtime.onStartup.addListener(() => { maybeAutoGroup(); });
chrome.windows.onCreated.addListener(() => { maybeAutoGroup(); });
