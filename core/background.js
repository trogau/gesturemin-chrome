import * as Commands from "/core/commands.js";

const GESTURES = [
  { gesture: "DU",  command: "NewTab",        settings: { position: "default", focus: true } },
  { gesture: "RL",  command: "CloseTab",       settings: { nextFocus: "default", closePinned: true } },
  { gesture: "LR",  command: "RestoreTab",     settings: { currentWindowOnly: true } },
  { gesture: "LDR", command: "ReloadTab",      settings: { cache: false } },
  { gesture: "RDL", command: "ReloadTab",      settings: { cache: true } },
  { gesture: "L",   command: "PageBack",       settings: {} },
  { gesture: "R",   command: "PageForth",      settings: {} },
  { gesture: "U",   command: "ScrollTop",      settings: { duration: 100 } },
  { gesture: "D",   command: "ScrollBottom",   settings: { duration: 100 } },
  { gesture: "DR",  command: "FocusRightTab",  settings: {} },
  { gesture: "DL",  command: "FocusLeftTab",   settings: {} },
];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.subject === "gestureChange") {
    const gestureItem = GESTURES.find(item => item.gesture === message.data.gesture);
    if (gestureItem) {
      sendResponse({
        command: chrome.i18n.getMessage("commandLabel" + gestureItem.command) || gestureItem.command
      });
    }
    return false;
  }

  if (message.subject === "gestureEnd") {
    const gestureItem = GESTURES.find(item => item.gesture === message.data.gesture);
    if (gestureItem && gestureItem.command in Commands) {
      message.data.frameId = sender.frameId;
      Commands[gestureItem.command].call(sender.tab, message.data, gestureItem.settings || {});
    }
    return false;
  }
});
