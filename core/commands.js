/*
 * Commands — Chrome MV3 port (simplified to default gesture set only)
 */

export function NewTab (data, settings) {
  let index;
  switch (settings.position) {
    case "before": index = this.index; break;
    case "after":  index = this.index + 1; break;
    case "start":  index = 0; break;
    case "end":    index = Number.MAX_SAFE_INTEGER; break;
    default:       index = null; break;
  }
  chrome.tabs.create({ active: settings.focus, index: index });
}


export function CloseTab (data, settings) {
  if (settings.closePinned || !this.pinned) {
    chrome.tabs.query({ windowId: this.windowId, active: false }).then((tabs) => {
      if (tabs.length > 0) {
        let nextTab = null;
        if (settings.nextFocus === "next") {
          nextTab = tabs.reduce((acc, cur) =>
            (acc.index <= this.index && cur.index > acc.index) || (cur.index > this.index && cur.index < acc.index) ? cur : acc
          );
        } else if (settings.nextFocus === "previous") {
          nextTab = tabs.reduce((acc, cur) =>
            (acc.index >= this.index && cur.index < acc.index) || (cur.index < this.index && cur.index > acc.index) ? cur : acc
          );
        } else if (settings.nextFocus === "recent") {
          nextTab = tabs.reduce((acc, cur) => acc.lastAccessed > cur.lastAccessed ? acc : cur);
        }
        if (nextTab) chrome.tabs.update(nextTab.id, { active: true });
      }
      chrome.tabs.remove(this.id);
    });
  }
}


export function RestoreTab (data, settings) {
  chrome.sessions.getRecentlyClosed().then((sessions) => {
    if (settings.currentWindowOnly) {
      sessions = sessions.filter(session => session.tab && session.tab.windowId === this.windowId);
    }
    if (sessions.length > 0) {
      const mostRecently = sessions.reduce((prev, cur) => prev.lastModified > cur.lastModified ? prev : cur);
      const sessionId = mostRecently.tab ? mostRecently.tab.sessionId : mostRecently.window.sessionId;
      chrome.sessions.restore(sessionId);
    }
  });
}


export function ReloadTab (data, settings) {
  chrome.tabs.reload(this.id, { bypassCache: settings.cache });
}


export function PageBack () {
  // Always navigate the main frame, not a sub-frame
  chrome.tabs.sendMessage(this.id, { subject: "navigate", data: { direction: "back" } }, { frameId: 0 });
}


export function PageForth () {
  chrome.tabs.sendMessage(this.id, { subject: "navigate", data: { direction: "forward" } }, { frameId: 0 });
}


export function ScrollTop (data, settings) {
  // Scroll within whichever frame triggered the gesture
  chrome.tabs.sendMessage(this.id, {
    subject: "scrollTo",
    data: { y: 0, duration: settings.duration }
  }, { frameId: data.frameId || 0 });
}


export function ScrollBottom (data, settings) {
  chrome.tabs.sendMessage(this.id, {
    subject: "scrollTo",
    data: { y: "max", duration: settings.duration }
  }, { frameId: data.frameId || 0 });
}


export function FocusRightTab () {
  chrome.tabs.query({ currentWindow: true, active: false }).then((tabs) => {
    if (tabs.length === 0) return;
    let nextTab;
    if (tabs.some(cur => cur.index > this.index)) {
      nextTab = tabs.reduce((acc, cur) =>
        (acc.index <= this.index && cur.index > acc.index) || (cur.index > this.index && cur.index < acc.index) ? cur : acc
      );
    } else {
      nextTab = tabs.reduce((acc, cur) => acc.index < cur.index ? acc : cur);
    }
    chrome.tabs.update(nextTab.id, { active: true });
  });
}


export function FocusLeftTab () {
  chrome.tabs.query({ currentWindow: true, active: false }).then((tabs) => {
    if (tabs.length === 0) return;
    let nextTab;
    if (tabs.some(cur => cur.index < this.index)) {
      nextTab = tabs.reduce((acc, cur) =>
        (acc.index >= this.index && cur.index < acc.index) || (cur.index < this.index && cur.index > acc.index) ? cur : acc
      );
    } else {
      nextTab = tabs.reduce((acc, cur) => acc.index > cur.index ? acc : cur);
    }
    chrome.tabs.update(nextTab.id, { active: true });
  });
}
