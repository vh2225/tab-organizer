// Service worker: keyboard command, right-click menu, first-run onboarding, and
// the optional "auto-group on startup / new window" automation.
import { groupTabs, maybeAutoGroup } from './src/actions.js';
import { refreshDataset } from './src/dataset.js';

const DATASET_ALARM = 'refresh-dataset';

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'group-tabs',
    title: 'Group tabs by topic',
    contexts: ['action', 'page'],
  });
  // Refresh the domain dataset on install/update, then weekly.
  refreshDataset();
  chrome.alarms.create(DATASET_ALARM, { periodInMinutes: 60 * 24 * 7 });
  // First-run onboarding: open the options/welcome page.
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DATASET_ALARM) refreshDataset();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'group-tabs') groupTabs();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'group-tabs') groupTabs();
});

// Optional automation — only fires when "auto-group on startup" is enabled in settings.
chrome.runtime.onStartup.addListener(() => { maybeAutoGroup(); });
chrome.windows.onCreated.addListener(() => { maybeAutoGroup(); });
