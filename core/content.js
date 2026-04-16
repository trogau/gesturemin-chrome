// Gesturefy-lite content script — self-contained bundle (Chrome MV3)
// Inlines: commons.js utilities, MouseGestureController, MouseGestureInterface

'use strict';

// ─── Utilities ────────────────────────────────────────────────────────────────

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hexToRGB(hex) {
  if (hex[0] === "#") hex = hex.slice(1);
  const bigint = parseInt(hex, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function getDirection(x1, y1, x2, y2) {
  if (Math.abs(y2 - y1) >= Math.abs(x2 - x1)) {
    return y1 >= y2 ? 'U' : 'D';
  }
  return x2 >= x1 ? 'R' : 'L';
}

function toSingleButton(pressedButton) {
  if (pressedButton === 1) return 0;
  if (pressedButton === 2) return 2;
  if (pressedButton === 4) return 1;
  return -1;
}

function isScrollableY(element) {
  const style = window.getComputedStyle(element);
  return !!(element.scrollTop || (++element.scrollTop && element.scrollTop--)) &&
    style["overflow"] !== "hidden" && style["overflow-y"] !== "hidden";
}

function scrollToY(element, y, duration) {
  y = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, y));
  let cosParameter = (element.scrollTop - y) / 2,
      scrollCount = 0,
      oldTimestamp = performance.now();
  function step(newTimestamp) {
    scrollCount += Math.PI * Math.abs(newTimestamp - oldTimestamp) / duration;
    if (scrollCount >= Math.PI || element.scrollTop === y) { element.scrollTop = y; return; }
    element.scrollTop = cosParameter + y + cosParameter * Math.cos(scrollCount);
    oldTimestamp = newTimestamp;
    window.requestAnimationFrame(step);
  }
  window.requestAnimationFrame(step);
}

function getClosestElement(startNode, testFunction) {
  let node = startNode;
  while (node !== null && !testFunction(node)) {
    node = node.parentElement;
  }
  return node;
}

function getTextSelection() {
  if (document.activeElement &&
      typeof document.activeElement.selectionStart === 'number' &&
      typeof document.activeElement.selectionEnd === 'number') {
    return document.activeElement.value.slice(
      document.activeElement.selectionStart,
      document.activeElement.selectionEnd
    );
  }
  return window.getSelection().toString();
}

function getTargetData(target) {
  const data = {};
  data.target = {
    src: target.currentSrc || target.src || null,
    title: target.title || null,
    alt: target.alt || null,
    textContent: target.textContent.trim(),
    nodeName: target.nodeName
  };
  const link = getClosestElement(target, node =>
    node.nodeName.toLowerCase() === "a" || node.nodeName.toLowerCase() === "area"
  );
  if (link) {
    data.link = {
      href: link.href || null,
      title: link.title || null,
      textContent: link.textContent.trim()
    };
  }
  data.textSelection = getTextSelection();
  return data;
}


// ─── MouseGestureController ───────────────────────────────────────────────────

const MouseGestureController = (() => {
  const LEFT_MOUSE_BUTTON   = 1;
  const MIDDLE_MOUSE_BUTTON = 4;
  const RIGHT_MOUSE_BUTTON  = 2;

  const PASSIVE = 0, PENDING = 1, ACTIVE = 2, EXPIRED = 3;

  const directions      = [];
  const mouseEventBuffer = [];
  const referencePoint  = { x: 0, y: 0 };
  const events = {
    start: new Set(), update: new Set(), change: new Set(),
    timeout: new Set(), end: new Set()
  };

  let state             = PASSIVE;
  let timeoutId         = null;
  let targetElement     = window;
  let mouseButton       = RIGHT_MOUSE_BUTTON;
  let suppressionKey    = "";
  let distanceThreshold = 10;
  let distanceSensitivity = 10;
  let timeoutActive     = false;
  let timeoutDuration   = 1000;

  function addEventListener(event, cb)    { if (event in events) events[event].add(cb); }
  function removeEventListener(event, cb) { if (event in events) events[event].delete(cb); }
  function hasEventListener(event, cb)    { if (event in events) return events[event].has(cb); }

  function enable()  { targetElement.addEventListener('pointerdown', handleMousedown, true); }
  function disable() { targetElement.removeEventListener('pointerdown', handleMousedown, true); reset(); }
  function cancel()  { reset(); }

  function init(x, y) {
    referencePoint.x = x; referencePoint.y = y;
    state = PENDING;
    targetElement.addEventListener('pointermove',   handleMousemove,   true);
    targetElement.addEventListener('dragstart',     handleDragstart,   true);
    targetElement.addEventListener('contextmenu',   handleContextmenu, true);
    targetElement.addEventListener('pointerup',     handleMouseup,     true);
    targetElement.addEventListener('pointerout',    handleMouseout,    true);
  }

  function start() {
    events.start.forEach(cb => cb(mouseEventBuffer.slice(0)));
    state = ACTIVE;
    mouseEventBuffer.length = 0;
  }

  function update(x, y) {
    events.update.forEach(cb => cb(mouseEventBuffer.slice(0)));
    if (timeoutActive) {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        events.timeout.forEach(cb => cb(mouseEventBuffer.slice(0)));
        state = EXPIRED;
      }, timeoutDuration);
    }
    const direction = getDirection(referencePoint.x, referencePoint.y, x, y);
    if (directions[directions.length - 1] !== direction) {
      directions.push(direction);
      events.change.forEach(cb => cb(mouseEventBuffer.slice(0), directions.slice(0)));
    }
    referencePoint.x = x; referencePoint.y = y;
    mouseEventBuffer.length = 0;
  }

  function end() {
    events.end.forEach(cb => cb(mouseEventBuffer.slice(0), directions.slice(0)));
    reset();
  }

  function reset() {
    targetElement.removeEventListener('pointermove',   handleMousemove,   true);
    targetElement.removeEventListener('pointerup',     handleMouseup,     true);
    targetElement.removeEventListener('contextmenu',   handleContextmenu, true);
    targetElement.removeEventListener('pointerout',    handleMouseout,    true);
    targetElement.removeEventListener('dragstart',     handleDragstart,   true);
    directions.length = 0;
    mouseEventBuffer.length = 0;
    state = PASSIVE;
    if (timeoutId) { window.clearTimeout(timeoutId); timeoutId = null; }
  }

  function handleMousedown(event) {
    if (event.isTrusted && event.buttons === mouseButton && (!suppressionKey || !event[suppressionKey])) {
      mouseEventBuffer.push(event);
      init(event.screenX, event.screenY);
      if (mouseButton === MIDDLE_MOUSE_BUTTON) event.preventDefault();
    }
  }

  function handleMousemove(event) {
    const coalesced = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    if (!coalesced.length) coalesced.push(event);
    if (event.isTrusted && event.buttons === mouseButton) {
      mouseEventBuffer.push(...coalesced);
      const dist = getDistance(referencePoint.x, referencePoint.y, event.screenX, event.screenY);
      if      (state === PENDING && dist > distanceThreshold)   start();
      else if (state === ACTIVE  && dist > distanceSensitivity) update(event.screenX, event.screenY);
      if (mouseButton === LEFT_MOUSE_BUTTON) window.getSelection().removeAllRanges();
    }
  }

  function handleContextmenu(event) {
    if (event.isTrusted && mouseButton === RIGHT_MOUSE_BUTTON) {
      mouseEventBuffer.push(event);
      if      (state === ACTIVE || state === EXPIRED) { event.preventDefault(); end(); }
      else if (state === PENDING) reset();
    }
  }

  function handleMouseup(event) {
    if (event.isTrusted && event.button === toSingleButton(mouseButton) &&
        (mouseButton === LEFT_MOUSE_BUTTON || mouseButton === MIDDLE_MOUSE_BUTTON)) {
      mouseEventBuffer.push(event);
      if      (state === ACTIVE || state === EXPIRED) end();
      else if (state === PENDING) reset();
    }
  }

  function handleMouseout(event) {
    if (event.isTrusted && event.relatedTarget === null) {
      mouseEventBuffer.push(event);
      if      (state === ACTIVE || state === EXPIRED) end();
      else if (state === PENDING) reset();
    }
  }

  function handleDragstart(event) {
    if (event.isTrusted && event.buttons === mouseButton && (!suppressionKey || !event[suppressionKey]))
      event.preventDefault();
  }

  return {
    enable, disable, cancel, addEventListener, hasEventListener, removeEventListener,
    get state()              { return state; },
    get STATE_PASSIVE()      { return PASSIVE; },
    get STATE_PENDING()      { return PENDING; },
    get STATE_ACTIVE()       { return ACTIVE; },
    get STATE_EXPIRED()      { return EXPIRED; },
    get targetElement()      { return targetElement; },
    set targetElement(v)     { targetElement = v; },
    get mouseButton()        { return mouseButton; },
    set mouseButton(v)       { mouseButton = Number(v); },
    get suppressionKey()     { return suppressionKey; },
    set suppressionKey(v)    { suppressionKey = v; },
    get distanceThreshold()  { return distanceThreshold; },
    set distanceThreshold(v) { distanceThreshold = Number(v); },
    get distanceSensitivity()  { return distanceSensitivity; },
    set distanceSensitivity(v) { distanceSensitivity = Number(v); },
    get timeoutActive()      { return timeoutActive; },
    set timeoutActive(v)     { timeoutActive = Boolean(v); },
    get timeoutDuration()    { return timeoutDuration / 1000; },
    set timeoutDuration(v)   { timeoutDuration = Number(v) * 1000; },
  };
})();


// ─── MouseGestureInterface ────────────────────────────────────────────────────

const MouseGestureInterface = (() => {
  const Overlay = document.createElement("div");
  Overlay.setAttribute('style', [
    "all:initial",
    "position:fixed",
    "top:0",
    "bottom:0",
    "left:0",
    "right:0",
    "z-index:2147483647"
  ].map(s => s + " !important").join(";"));

  const Canvas = document.createElement("canvas");
  Canvas.setAttribute('style', "all:initial !important");
  const Context = Canvas.getContext('2d');

  const Directions = document.createElement("div");
  Directions.setAttribute('style', [
    "all:initial",
    "position:absolute",
    "bottom:0",
    "left:0",
    "font-family:firefox-gesture-arrows",
    "direction:rtl",
    "letter-spacing:0.3em",
    "width:100%",
    "text-shadow:0.01em 0.01em 0.07em rgba(0,0,0,0.8)",
    "padding:0.2em 0.2em",
    "white-space:nowrap",
    "background-color:rgba(0,0,0,0)"
  ].map(s => s + " !important").join(";"));

  const Command = document.createElement("div");
  Command.setAttribute('style', [
    "all:initial",
    "position:absolute",
    "top:50%",
    "left:50%",
    "transform:translate(-50%,-100%)",
    'font-family:"NunitoSans Regular","Arial",sans-serif',
    "line-height:normal",
    "text-shadow:0.01em 0.01em 0.1em rgba(0,0,0,0.8)",
    "text-align:center",
    "padding:0.4em 0.4em 0.3em",
    "border-radius:0.07em",
    "font-weight:bold",
    "background-color:rgba(0,0,0,0)"
  ].map(s => s + " !important").join(";"));

  let gestureTraceLineWidth  = 10;
  let gestureTraceLineGrowth = true;
  let lastTraceWidth = 0;
  const lastPoint = { x: 0, y: 0 };

  window.addEventListener('resize', maximizeCanvas, true);
  maximizeCanvas();

  function maximizeCanvas() {
    const tmp = { fillStyle: Context.fillStyle, strokeStyle: Context.strokeStyle, lineWidth: Context.lineWidth };
    Canvas.width  = window.innerWidth;
    Canvas.height = window.innerHeight;
    Object.assign(Context, tmp);
  }

  function initialize(x, y) {
    if (document.documentElement.tagName.toUpperCase() === "SVG") return;
    const container = (document.body && document.body.tagName.toUpperCase() === "FRAMESET")
      ? document.documentElement : document.body;
    if (container) container.appendChild(Overlay);
    // x/y are clientX/Y — already in viewport (canvas) coordinates
    lastPoint.x = Math.round(x);
    lastPoint.y = Math.round(y);
  }

  function updateGestureTrace(points) {
    if (!Overlay.contains(Canvas)) Overlay.appendChild(Canvas);
    const path = new Path2D();
    for (const point of points) {
      // points are clientX/Y — already in viewport (canvas) coordinates
      point.x = Math.round(point.x);
      point.y = Math.round(point.y);
      if (gestureTraceLineGrowth && lastTraceWidth < gestureTraceLineWidth) {
        const growthDist    = gestureTraceLineWidth * 50;
        const dist          = getDistance(lastPoint.x, lastPoint.y, point.x, point.y);
        const currentWidth  = Math.min(lastTraceWidth + dist / growthDist * gestureTraceLineWidth, gestureTraceLineWidth);
        path.addPath(growingLine(lastPoint.x, lastPoint.y, point.x, point.y, lastTraceWidth, currentWidth));
        lastTraceWidth = currentWidth;
      } else {
        path.addPath(growingLine(lastPoint.x, lastPoint.y, point.x, point.y, gestureTraceLineWidth, gestureTraceLineWidth));
      }
      lastPoint.x = point.x;
      lastPoint.y = point.y;
    }
    Context.fill(path);
  }

  function updateGestureCommand(command) {
    if (command) { if (!Overlay.contains(Command)) Overlay.appendChild(Command); Command.textContent = command; }
    else Command.remove();
  }

  function updateGestureDirections(directions) {
    if (!Overlay.contains(Directions)) Overlay.appendChild(Directions);
    Directions.textContent = directions.join("");
  }

  function reset() {
    Canvas.remove(); Command.remove(); Directions.remove();
    Context.clearRect(0, 0, Canvas.width, Canvas.height);
    lastTraceWidth = 0;
    Directions.textContent = "";
    Command.textContent = "";
  }

  function terminate() { Overlay.remove(); reset(); }

  function growingLine(x1, y1, x2, y2, w1, w2) {
    const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
    const p = new Path2D();
    p.arc(x1, y1, w1 / 2, angle,           angle + Math.PI);
    p.arc(x2, y2, w2 / 2, angle + Math.PI, angle);
    p.closePath();
    return p;
  }

  function bgColor(el) { return el.style.getPropertyValue('background-color'); }

  return {
    initialize, updateGestureTrace, updateGestureCommand, updateGestureDirections, reset, terminate,

    get gestureTraceLineColor()    { return Context.fillStyle; },
    set gestureTraceLineColor(v)   { Context.fillStyle = v; },
    get gestureTraceLineWidth()    { return gestureTraceLineWidth; },
    set gestureTraceLineWidth(v)   { gestureTraceLineWidth = v; },
    get gestureTraceLineGrowth()   { return gestureTraceLineGrowth; },
    set gestureTraceLineGrowth(v)  { gestureTraceLineGrowth = Boolean(v); },
    get gestureTraceOpacity()      { return Canvas.style.getPropertyValue('opacity'); },
    set gestureTraceOpacity(v)     { Canvas.style.setProperty('opacity', v, 'important'); },

    get gestureCommandFontSize()         { return Command.style.getPropertyValue('font-size'); },
    set gestureCommandFontSize(v)        { Command.style.setProperty('font-size', v, 'important'); },
    get gestureCommandTextColor()        { return Command.style.getPropertyValue('color'); },
    set gestureCommandTextColor(v)       { Command.style.setProperty('color', v, 'important'); },
    get gestureCommandBackgroundOpacity() {
      const bg = bgColor(Command);
      return Number(bg.substring(bg.lastIndexOf(",") + 1, bg.lastIndexOf(")")));
    },
    set gestureCommandBackgroundOpacity(v) {
      const bg = bgColor(Command);
      Command.style.setProperty('background-color',
        'rgba(' + bg.substring(bg.indexOf("(") + 1, bg.lastIndexOf(",")) + ',' + v + ')', 'important');
    },
    get gestureCommandBackgroundColor() {
      const bg = bgColor(Command);
      return rgbToHex(...bg.substring(bg.indexOf("(") + 1, bg.lastIndexOf(",")).split(',').map(Number));
    },
    set gestureCommandBackgroundColor(v) {
      const bg = bgColor(Command);
      const opacity = bg.substring(bg.lastIndexOf(",") + 1, bg.lastIndexOf(")"));
      Command.style.setProperty('background-color', 'rgba(' + hexToRGB(v).join(",") + ',' + opacity + ')', 'important');
    },

    get gestureDirectionsFontSize()         { return Directions.style.getPropertyValue('font-size'); },
    set gestureDirectionsFontSize(v)        { Directions.style.setProperty('font-size', v, 'important'); },
    get gestureDirectionsTextAlign()        { return Directions.style.getPropertyValue('text-align'); },
    set gestureDirectionsTextAlign(v)       { Directions.style.setProperty('text-align', v, 'important'); },
    get gestureDirectionsTextColor()        { return Directions.style.getPropertyValue('color'); },
    set gestureDirectionsTextColor(v)       { Directions.style.setProperty('color', v, 'important'); },
    get gestureDirectionsBackgroundOpacity() {
      const bg = bgColor(Directions);
      return Number(bg.substring(bg.lastIndexOf(",") + 1, bg.lastIndexOf(")")));
    },
    set gestureDirectionsBackgroundOpacity(v) {
      const bg = bgColor(Directions);
      Directions.style.setProperty('background-color',
        'rgba(' + bg.substring(bg.indexOf("(") + 1, bg.lastIndexOf(",")) + ',' + v + ')', 'important');
    },
    get gestureDirectionsBackgroundColor() {
      const bg = bgColor(Directions);
      return rgbToHex(...bg.substring(bg.indexOf("(") + 1, bg.lastIndexOf(",")).split(',').map(Number));
    },
    set gestureDirectionsBackgroundColor(v) {
      const bg = bgColor(Directions);
      const opacity = bg.substring(bg.lastIndexOf(",") + 1, bg.lastIndexOf(")"));
      Directions.style.setProperty('background-color', 'rgba(' + hexToRGB(v).join(",") + ',' + opacity + ')', 'important');
    },
  };
})();


// ─── Initialization ───────────────────────────────────────────────────────────

window.TARGET = null;

MouseGestureController.mouseButton         = 2;
MouseGestureController.suppressionKey      = "";
MouseGestureController.distanceThreshold   = 10;
MouseGestureController.distanceSensitivity = 10;
MouseGestureController.timeoutActive       = false;
MouseGestureController.timeoutDuration     = 1;

MouseGestureInterface.gestureTraceLineColor             = "#00AAA0";
MouseGestureInterface.gestureTraceLineWidth             = 10;
MouseGestureInterface.gestureTraceLineGrowth            = true;
MouseGestureInterface.gestureTraceOpacity               = 0.8;
MouseGestureInterface.gestureCommandFontSize            = "6vh";
MouseGestureInterface.gestureCommandTextColor           = "#FFFFFF";
MouseGestureInterface.gestureCommandBackgroundColor     = "#000000";
MouseGestureInterface.gestureCommandBackgroundOpacity   = 0.3;
MouseGestureInterface.gestureDirectionsFontSize         = "8vh";
MouseGestureInterface.gestureDirectionsTextAlign        = "center";
MouseGestureInterface.gestureDirectionsTextColor        = "#FFFFFF";
MouseGestureInterface.gestureDirectionsBackgroundColor  = "#000000";
MouseGestureInterface.gestureDirectionsBackgroundOpacity = 0.3;

MouseGestureController.enable();


MouseGestureController.addEventListener("start", (events) => {
  const first = events.shift();
  MouseGestureInterface.initialize(first.clientX, first.clientY);
  window.TARGET = first.target;
  if (events.length > 0)
    MouseGestureInterface.updateGestureTrace(events.map(e => ({ x: e.clientX, y: e.clientY })));
});

MouseGestureController.addEventListener("update", (events) => {
  MouseGestureInterface.updateGestureTrace(events.map(e => ({ x: e.clientX, y: e.clientY })));
});

MouseGestureController.addEventListener("change", (events, directions) => {
  MouseGestureInterface.updateGestureDirections(directions);
  chrome.runtime.sendMessage({ subject: "gestureChange", data: { gesture: directions.join("") } })
    .then(response => MouseGestureInterface.updateGestureCommand(response ? response.command : null))
    .catch(() => {});
});

MouseGestureController.addEventListener("timeout", () => {
  MouseGestureInterface.reset();
});

MouseGestureController.addEventListener("end", (events, directions) => {
  if (MouseGestureController.state !== MouseGestureController.STATE_EXPIRED) {
    const last = events.pop();
    const data = getTargetData(window.TARGET);
    data.gesture = directions.join("");
    data.mousePosition = { x: last.screenX, y: last.screenY };
    chrome.runtime.sendMessage({ subject: "gestureEnd", data });
  }
  MouseGestureInterface.terminate();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.subject === "scrollTo") {
    const el = getClosestElement(window.TARGET, n => isScrollableY(n))
               || document.scrollingElement
               || document.body;
    scrollToY(el, message.data.y === "max" ? el.scrollHeight - el.clientHeight : message.data.y, message.data.duration);
  } else if (message.subject === "navigate") {
    if (message.data.direction === "back")    history.back();
    if (message.data.direction === "forward") history.forward();
  }
});
