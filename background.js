// Service worker: keyboard command + right-click menu entry for one-tap grouping.
// The popup is the main UI; this just gives a fast path to the most-used action.
import { groupTabs } from './src/actions.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'group-tabs',
    title: 'Group tabs by topic',
    contexts: ['action', 'page'],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'group-tabs') groupTabs();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'group-tabs') groupTabs();
});
