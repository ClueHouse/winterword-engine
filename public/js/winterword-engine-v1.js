
(function(){
'use strict';
/* SECTION: GLOBAL HELPERS */var WW = {};

WW.resolveDoc = function(scope){
  if (scope && scope.nodeType === 9) return scope;
  if (scope && scope.ownerDocument) return scope.ownerDocument;
  if (typeof document !== "undefined") return document;
  return null;
};
WW.resolveWin = function(scope){
  var doc = WW.resolveDoc(scope);
  if (doc && doc.defaultView) return doc.defaultView;
  if (typeof window !== "undefined") return window;
  return null;
};
WW.getBody = function(scope){
  var doc = WW.resolveDoc(scope);
  return doc && doc.body ? doc.body : null;
};
WW.isNodeConnected = function(node){
  if (!node) return false;
  if (typeof node.isConnected === "boolean") return node.isConnected;
  var doc = WW.resolveDoc(node);
  return !!(doc && doc.documentElement && typeof doc.documentElement.contains === "function" && doc.documentElement.contains(node));
};
WW.getLocation = function(scope){
  var view = WW.resolveWin(scope);
  return view && view.location ? view.location : null;
};
WW.requestFrame = function(scope, callback){
  if (typeof callback !== "function") return 0;
  var view = WW.resolveWin(scope);
  if (view && typeof view.requestAnimationFrame === "function"){
    return view.requestAnimationFrame(callback);
  }
  return setTimeout(function(){ callback(); }, 16);
};
WW.cancelFrame = function(scope, handle){
  if (!handle) return;
  var view = WW.resolveWin(scope);
  if (view && typeof view.cancelAnimationFrame === "function"){
    try{ view.cancelAnimationFrame(handle); }catch(e){}
    return;
  }
  clearTimeout(handle);
};
WW.makeEventTarget = function(scope, kind){
  if (kind === "window") return WW.resolveWin(scope);
  if (kind === "document") return WW.resolveDoc(scope);
  return scope || null;
};
WW.addScopedListener = function(scope, target, type, handler, options){
  if (!target || !type || typeof handler !== "function") return function(){};
  target.addEventListener(type, handler, options);
  return function(){
    try{ target.removeEventListener(type, handler, options); }catch(e){}
  };
};
WW.registerScopedListener = function(scope, target, type, handler, options){
  var remove = WW.addScopedListener(scope, target, type, handler, options);
  if (scope){
    WW.registerMountCleanup(scope, remove);
  }
  return remove;
};
WW.config = {  pathPrefix: "",  orgStateEndpoint: "/api/org-state",  leaderboardEndpoint: "/api/leaderboard"};WW.state = {  orgStateCache: Object.create(null),  leaderboardCache: Object.create(null),  mediaAudio: null,  answerAudio: Object.create(null),  railInstances: Object.create(null),  overlayControllers: Object.create(null),  appInstance: null,  root: null,  mountCleanup: typeof WeakMap === "function" ? new WeakMap() : null,  mountCleanupFallback: []};
WW.navigate = function(scope, href){
  var mount = WW.state && WW.state.appInstance ? WW.state.appInstance.mount : null;
  var pageName = WW.routeToPageName(href);
  if (!mount || !pageName) return false;
  WW.state.currentPageName = pageName;
  WW.state.currentPagePath = String(href || "").trim();
  WW.mountPage(pageName, mount);
  return true;
};
WW.createAbortSignalWithTimeout = function(timeoutMs){
  var timeout = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 12000;
  if (typeof AbortController !== "function"){
    return { signal: undefined, abort: function(){}, cleanup: function(){} };
  }
  var controller = new AbortController();
  var finished = false;
  var timer = setTimeout(function(){
    if (finished) return;
    finished = true;
    try{ controller.abort(new Error("Request timed out")); }catch(e){
      try{ controller.abort(); }catch(_e){}
    }
  }, timeout);
  return {
    signal: controller.signal,
    abort: function(){
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try{ controller.abort(); }catch(e){}
    },
    cleanup: function(){
      if (finished) return;
      finished = true;
      clearTimeout(timer);
    }
  };
};
WW.escapeCssIdent = function(value){
  var raw = String(value == null ? "" : value);
  if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function"){
    return CSS.escape(raw);
  }
  return raw.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, function(match, digitStart){
    if (digitStart){
      return "\\3" + digitStart.charAt(digitStart.length - 1) + " ";
    }
    return "\\" + match;
  });
};
WW.stopAudio = function(audio){
  if (!audio) return;
  try{ audio.pause(); }catch(e){}
  try{ audio.currentTime = 0; }catch(e){}
};
WW.destroySharedAudioBucket = function(bucketKey){
  if (!bucketKey || !WW.state || !WW.state.answerAudio) return;
  var audio = WW.state.answerAudio[bucketKey];
  if (!audio) return;
  WW.stopAudio(audio);
  delete WW.state.answerAudio[bucketKey];
};
WW.pruneAnswerAudio = function(){
  var buckets = WW.state.answerAudio || {};
  Object.keys(buckets).forEach(function(key){
    var audio = buckets[key];
    if (!audio){
      delete buckets[key];
      return;
    }
    if (audio.ended || (audio.networkState === 3 && audio.readyState === 0)){
      WW.destroySharedAudioBucket(key);
    }
  });
  if (WW.state.mediaAudio && (WW.state.mediaAudio.ended || !WW.state.mediaAudio.isConnected && WW.state.mediaAudio.error)){
    WW.stopAudio(WW.state.mediaAudio);
    WW.state.mediaAudio = null;
  }
};
WW.pruneRailInstances = function(){
  var store = WW.state.railInstances || {};
  Object.keys(store).forEach(function(key){
    var rail = store[key];
    if (!rail || typeof rail.isAlive !== "function" || !rail.isAlive()){
      if (rail && typeof rail.destroy === "function"){
        try{ rail.destroy(); }catch(e){}
      } else {
        delete store[key];
      }
    }
  });
};WW.pruneOverlayControllers = function(){  var store = WW.state.overlayControllers || {};  Object.keys(store).forEach(function(key){    var controller = store[key];    if (!controller || typeof controller.isAlive !== "function" || !controller.isAlive()){      delete store[key];    }  });};WW.registerOverlayController = function(key, controller){  if (!key || !controller) return;  WW.pruneOverlayControllers();  WW.state.overlayControllers[key] = controller;};WW.unregisterOverlayController = function(key){  if (!key || !WW.state.overlayControllers) return;  delete WW.state.overlayControllers[key];};WW.getFallbackMountCleanupRecord = function(mount, create){  var records = WW.state.mountCleanupFallback || [];  for (var i = 0; i < records.length; i += 1){    if (records[i] && records[i].mount === mount){      return records[i];    }  }  if (!create) return null;  var record = { mount: mount, cleanup: [] };  records.push(record);  WW.state.mountCleanupFallback = records;  return record;};WW.ensureMountCleanupStore = function(mount){  if (!mount) return [];  if (WW.state.mountCleanup){    var store = WW.state.mountCleanup.get(mount);    if (!store){      store = [];      WW.state.mountCleanup.set(mount, store);    }    return store;  }  return WW.getFallbackMountCleanupRecord(mount, true).cleanup;};WW.registerMountCleanup = function(mount, fn){  if (!mount || typeof fn !== "function") return;  WW.ensureMountCleanupStore(mount).push(fn);};WW.runMountCleanup = function(mount){  if (!mount) return;  if (WW && WW.state && WW.state.overlayControllers){    Object.keys(WW.state.overlayControllers).forEach(function(key){      var controller = WW.state.overlayControllers[key];      if (!controller) return;      var root = controller.scopeRoot || null;      if (root && root === mount && typeof controller.destroy === "function"){        try{ controller.destroy(); }catch(e){}      }    });  }  var cleanupFns = null;  if (WW.state.mountCleanup){    cleanupFns = WW.state.mountCleanup.get(mount);  } else {    var record = WW.getFallbackMountCleanupRecord(mount, false);    cleanupFns = record ? record.cleanup : null;  }  if (!cleanupFns) return;  while (cleanupFns.length){    var fn = cleanupFns.pop();    try{ fn(); }catch(e){}  }  if (WW.state.mountCleanup){    WW.state.mountCleanup.delete(mount);  } else {    WW.state.mountCleanupFallback = (WW.state.mountCleanupFallback || []).filter(function(record){      return !!record && record.mount !== mount;    });  }};WW.escapeHtml = function(value){  return String(value == null ? "" : value)    .replace(/&/g, "&amp;")    .replace(/</g, "&lt;")    .replace(/>/g, "&gt;")    .replace(/"/g, "&quot;");};WW.getOrgFromUrl = function(scope){  try{    if (typeof window !== "undefined" && window.__WINTERWORD_BOOT__ && window.__WINTERWORD_BOOT__.slug){      return String(window.__WINTERWORD_BOOT__.slug).trim();    }  }catch(e){}  return "";};WW.prefixInternalPath = function(path){  if (!path) return path;  var value = String(path).trim();  if (!value) return value;  if (    value.indexOf("/cgi/") === 0 ||    value.indexOf("mailto:") === 0 ||    value.indexOf("tel:") === 0 ||    value.indexOf("#") === 0 ||    value.indexOf("http://") === 0 ||    value.indexOf("https://") === 0 ||    value.indexOf(WW.config.pathPrefix + "/") === 0 ||    value === WW.config.pathPrefix  ){    return value;  }  if (value.charAt(0) !== "/"){    return value;  }  return WW.config.pathPrefix + value;};WW.withOrg = function(path, org){  var href = WW.prefixInternalPath(path);  if (!href) return href;  if (href.indexOf("mailto:") === 0 || href.indexOf("tel:") === 0 || href.indexOf("#") === 0) return href;  return href;};WW.prefixInternalPathsInNode = function(root){  if (!root) return;  var attrNames = ["href","data-path","action"];  var nodes = root.querySelectorAll("[href],[data-path],[action]");  Array.prototype.forEach.call(nodes, function(node){    attrNames.forEach(function(attr){      var val = node.getAttribute(attr);      if (!val) return;      node.setAttribute(attr, WW.prefixInternalPath(val));    });  });};WW.stopRendering = function(node){  if (node) node.style.display = "none";};WW.showUnavailableBlock = function(viewEl, pageTitle){  if (!viewEl) return;  viewEl.innerHTML = [    '<section class="ww-hero">',      '<div class="ww-slug">',        '<span>WINTERWORD</span>',        '<span> • </span>',        '<span>2026</span>',      '</div>',      '<h1 class="ww-title">' + WW.escapeHtml(pageTitle || "Unavailable") + '</h1>',      '<div class="ww-status-stack">',        '<div class="ww-status-line">',          '<span class="ww-status-dot"></span>',          '<span>Unavailable</span>',        '</div>',      '</div>',    '</section>'  ].join("");};WW.fetchOrgState = async function(org){
  var key = String(org || "").trim();
  if (!key) return null;

  if (WW.state.orgStateCache[key]){
    return WW.state.orgStateCache[key];
  }

  if (typeof fetch !== "function"){
    return { ok:false, responseOk:false, status:0, data:null, error:new Error("fetch unavailable") };
  }

  var url = WW.config.orgStateEndpoint + "?org=" + encodeURIComponent(key);
  var abortHandle = WW.createAbortSignalWithTimeout();
  var promise = fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: abortHandle.signal
  }).then(async function(response){
    var data = null;
    try{
      data = await response.json();
    }catch(e){
      data = null;
    }
    return {
      ok: !!(response.ok && data && (typeof data !== "object" || data.ok !== false)),
      responseOk: response.ok,
      status: response.status,
      data: data
    };
  }).catch(function(error){
    return {
      ok: false,
      responseOk: false,
      status: 0,
      data: null,
      error: error
    };
  }).finally(function(){
    abortHandle.cleanup();
  });

  WW.state.orgStateCache[key] = promise;
  var settled = await promise;
  if (!settled || !settled.ok){
    delete WW.state.orgStateCache[key];
  }
  return settled;
};WW.normalizeLeaderboardRows = function(data){  if (!data) return [];  var raw = null;  if (Array.isArray(data.rows)){    raw = data.rows;  } else if (Array.isArray(data.records)){    raw = data.records;  } else if (Array.isArray(data.leaderboard)){    raw = data.leaderboard;  } else if (Array.isArray(data.data)){    raw = data.data;  } else {    return [];  }  return raw.map(function(record){    var fields = record && record.fields ? record.fields : record || {};    return {      rank: fields.rank,      player_name: fields.player_name || fields.name || fields.player || fields.display_name,      timestamp: fields.timestamp || fields.solved_at || fields.createdTime || fields.created_at    };  }).filter(function(record){    return !!record && (record.rank != null || record.player_name || record.timestamp);  });};WW.fetchLeaderboard = async function(org){
  var key = String(org || "").trim();
  if (!key) return null;

  if (WW.state.leaderboardCache[key]){
    return WW.state.leaderboardCache[key];
  }

  if (typeof fetch !== "function"){
    return { ok:false, responseOk:false, status:0, data:null, rows:[], error:new Error("fetch unavailable") };
  }

  var url = WW.config.leaderboardEndpoint + "?org=" + encodeURIComponent(key);
  var abortHandle = WW.createAbortSignalWithTimeout();
  var promise = fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: abortHandle.signal
  }).then(async function(response){
    var data = null;
    try{
      data = await response.json();
    }catch(e){
      data = null;
    }

    var rows = WW.normalizeLeaderboardRows(data);
    var recognizedShape = !!(
      data && (
        Array.isArray(data.rows) ||
        Array.isArray(data.records) ||
        Array.isArray(data.leaderboard) ||
        Array.isArray(data.data)
      )
    );

    return {
      ok: !!(response.ok && data && (data.ok !== false) && recognizedShape),
      responseOk: response.ok,
      status: response.status,
      data: data,
      rows: rows,
      recognizedShape: recognizedShape
    };
  }).catch(function(error){
    return {
      ok: false,
      responseOk: false,
      status: 0,
      data: null,
      rows: [],
      recognizedShape: false,
      error: error
    };
  }).finally(function(){
    abortHandle.cleanup();
  });

  WW.state.leaderboardCache[key] = promise;
  var settled = await promise;
  if (!settled || !settled.ok){
    delete WW.state.leaderboardCache[key];
  }
  return settled;
};WW.enforceTechDiffOrContinue = async function(org, scope){  if (!org) return { ok: true, skipped: true };  var result = await WW.fetchOrgState(org);  if (!result || !result.ok || !result.data) return { ok: false, result: result };  if (String(result.data.status || "").trim().toLowerCase() === "tech_diff"){    WW.navigate(scope, "/technical");    return { ok: false, redirected: true, result: result };  }  return { ok: true, result: result };};WW.playSharedAudio = function(src, bucketKey){
  if (!src) return null;

  function safePlay(audio){
    if (!audio) return null;
    try{
      var promise = audio.play();
      if (promise && typeof promise.catch === "function"){
        promise.catch(function(){});
      }
      return audio;
    }catch(e){
      return null;
    }
  }

  try{
    WW.pruneAnswerAudio();

    if (bucketKey){
      WW.destroySharedAudioBucket(bucketKey);
      WW.state.answerAudio[bucketKey] = new Audio(src);
      WW.state.answerAudio[bucketKey].addEventListener("ended", function(){
        WW.destroySharedAudioBucket(bucketKey);
      }, { once:true });
      return safePlay(WW.state.answerAudio[bucketKey]);
    }

    WW.stopAudio(WW.state.mediaAudio);
    WW.state.mediaAudio = new Audio(src);
    WW.state.mediaAudio.addEventListener("ended", function(){
      if (WW.state.mediaAudio === this){
        WW.state.mediaAudio = null;
      }
    }, { once:true });
    return safePlay(WW.state.mediaAudio);
  }catch(e){
    return null;
  }
};WW.getScopedElement = function(id, scopeRoot){  if (!id) return null;  if (scopeRoot && typeof scopeRoot.querySelector === "function"){    var scoped = scopeRoot.querySelector("#" + WW.escapeCssIdent(id));    if (scoped) return scoped;  }  return null;};WW.createVideoOverlayController = function(config){
  var scopeRoot = config.scopeRoot || null;
  var overlay = WW.getScopedElement(config.overlayId, scopeRoot);
  var media = WW.getScopedElement(config.mediaId, scopeRoot);
  var veil = config.veilId ? WW.getScopedElement(config.veilId, scopeRoot) : null;
  var openClass = config.openClass || "open";
  var showClass = config.showClass || "show-video";
  var blackoutDelay = Number(config.blackoutDelay || 0);
  var mediaDelay = Number(config.mediaDelay || 0);
  var resetOnClose = config.resetOnClose !== false;
  var requireBackdropId = config.requireBackdropId || null;
  var controllerKey = String(config.overlayId || ("overlay-" + Math.random().toString(36).slice(2)));
  var timers = [];
  var rafs = [];
  var destroyed = false;

  function clearTimers(){
    while (timers.length){
      clearTimeout(timers.pop());
    }
    while (rafs.length){
      WW.cancelFrame(scopeRoot || overlay || media || null, rafs.pop());
    }
  }

  function syncAria(isOpen){
    if (overlay){
      overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }
  }

  function resetMedia(){
    if (!media) return;
    try{
      media.pause();
      if (resetOnClose) media.currentTime = 0;
    }catch(e){}
  }

  async function playMedia(){
    if (!media || destroyed || !media.isConnected) return;
    try{
      var promise = media.play();
      if (promise && typeof promise.catch === "function"){
        await promise.catch(function(){});
      }
    }catch(e){}
  }

  function open(event){
    if (event){
      event.preventDefault();
      event.stopPropagation();
    }
    if (destroyed || !overlay || !media || !overlay.isConnected || !media.isConnected) return;

    clearTimers();
    resetMedia();
    syncAria(true);

    overlay.classList.remove(showClass);
    overlay.classList.add(openClass);

    if (blackoutDelay > 0){
      timers.push(setTimeout(function(){
        if (destroyed || !overlay.isConnected) return;
        overlay.classList.add(showClass);

        if (mediaDelay > 0){
          timers.push(setTimeout(function(){ playMedia(); }, mediaDelay));
        } else {
          playMedia();
        }
      }, blackoutDelay));
    } else {
      overlay.classList.add(showClass);
      if (mediaDelay > 0){
        timers.push(setTimeout(function(){ playMedia(); }, mediaDelay));
      } else {
        rafs.push(WW.requestFrame(scopeRoot || overlay || media || null, function(){
          rafs.push(WW.requestFrame(scopeRoot || overlay || media || null, function(){
            playMedia();
          }));
        }));
      }
    }
  }

  function close(event){
    if (!overlay || destroyed) return;

    if (requireBackdropId){
      if (!event || !event.target || event.target.id !== requireBackdropId) return;
    } else if (event && event.target && veil && event.target !== veil && event.target !== overlay){
      return;
    }

    clearTimers();
    resetMedia();
    overlay.classList.remove(showClass);
    overlay.classList.remove(openClass);
    syncAria(false);
  }

  function closeNow(){
    if (!overlay || destroyed) return;
    clearTimers();
    resetMedia();
    overlay.classList.remove(showClass);
    overlay.classList.remove(openClass);
    syncAria(false);
  }

  function isAlive(){
    return !!(overlay && overlay.isConnected);
  }

  function destroy(){
    if (destroyed) return;
    closeNow();
    clearTimers();
    destroyed = true;
    WW.unregisterOverlayController(controllerKey);
  }

  var existing = WW.state.overlayControllers && WW.state.overlayControllers[controllerKey];
  if (existing && typeof existing.destroy === "function"){
    existing.destroy();
  }

  var api = {
    scopeRoot: scopeRoot,
    open: open,
    close: close,
    clearTimers: clearTimers,
    closeNow: closeNow,
    isOpen: function(){
      return !!(overlay && overlay.classList.contains(openClass));
    },
    isAlive: isAlive,
    destroy: destroy
  };

  syncAria(false);
  WW.registerOverlayController(controllerKey, api);

  if (scopeRoot){
    WW.registerMountCleanup(scopeRoot, destroy);
  }

  return api;
};
WW.bindOverlayEscape = function(scopeRoot){
  if (!scopeRoot) return;
  var doc = WW.resolveDoc(scopeRoot);
  if (!doc) return;
  var handleEscape = function(event){
    if (event.key !== "Escape") return;
    WW.pruneOverlayControllers();
    Object.keys(WW.state.overlayControllers || {}).forEach(function(key){
      var controller = WW.state.overlayControllers[key];
      if (!controller || typeof controller.isOpen !== "function" || typeof controller.closeNow !== "function") return;
      if (controller.isOpen()){
        controller.closeNow();
      }
    });
  };
  WW.registerScopedListener(scopeRoot, doc, "keydown", handleEscape);
};
WW.freezeVideoAtStart = function(videoEl, time, scopeRoot){  if (!videoEl) return;  var seekTo = typeof time === "number" ? time : 0.12;  function freeze(){    try{      videoEl.pause();      if (!isNaN(videoEl.duration) && videoEl.duration > 0.2){        videoEl.currentTime = seekTo;      }    }catch(e){}  }  videoEl.addEventListener("loadedmetadata", freeze, { once:true });  if (scopeRoot){    WW.registerMountCleanup(scopeRoot, function(){      try{ videoEl.removeEventListener("loadedmetadata", freeze); }catch(e){}    });  }};WW.bindScrollNudge = function(scrollEl, threshold, scopeRoot){
  if (!scrollEl) return function(){};
  var t = typeof threshold === "number" ? threshold : 28;
  function update(){
    if (!WW.isNodeConnected(scrollEl)) return;
    if (scrollEl.scrollTop > t){
      scrollEl.classList.add("scrolled");
    } else {
      scrollEl.classList.remove("scrolled");
    }
  }
  var removeScroll = WW.addScopedListener(scopeRoot || scrollEl, scrollEl, "scroll", update, { passive:true });
  if (scopeRoot){
    WW.registerMountCleanup(scopeRoot, removeScroll);
  }
  update();
  return function(){
    removeScroll();
  };
};WW.revealAnswerPanel = function(config){  var scopeRoot = config.scopeRoot || null;  var fadeEl = WW.getScopedElement(config.fadeElId, scopeRoot);  var answerPanel = WW.getScopedElement(config.answerPanelId, scopeRoot);  var hideEl = config.hideElId ? WW.getScopedElement(config.hideElId, scopeRoot) : null;  var fadeClass = config.fadeClass || "fadeout";  var showClass = config.showClass || "fadein";  var delay = Number(config.delay || 2000);  var displayValue = config.displayValue || "block";  var timers = [];  if (!fadeEl || !answerPanel) return;  function clearTimers(){    while (timers.length){      clearTimeout(timers.pop());    }  }  if (scopeRoot){    WW.registerMountCleanup(scopeRoot, clearTimers);  }  fadeEl.classList.add(fadeClass);  timers.push(setTimeout(function(){    if (!answerPanel.isConnected) return;    answerPanel.style.display = displayValue;    answerPanel.scrollTop = 0;    timers.push(setTimeout(function(){      if (!answerPanel.isConnected) return;      answerPanel.classList.add(showClass);    }, 30));  }, delay));  if (hideEl){    timers.push(setTimeout(function(){      if (!hideEl.isConnected) return;      hideEl.style.visibility = "hidden";    }, delay));  }};/* SECTION: RAIL SYSTEM */WW.railPresets = {  "main-wide": {    width: "wide",    tone: "dark",    showTooltips: true,    logoGlow: false,    logoDarkGlow: false,    logoShadow: false  },  "clue-light": {    width: "narrow",    tone: "light",    showTooltips: false,    logoGlow: false,    logoDarkGlow: false,    logoShadow: false  },  "clue-steel": {    width: "narrow",    tone: "steel",    showTooltips: false,    logoGlow: true,    logoDarkGlow: false,    logoShadow: true  },  "answer-light": {    width: "narrow",    tone: "light",    showTooltips: false,    logoGlow: false,    logoDarkGlow: false,    logoShadow: false  },  "answer-dark": {    width: "narrow",    tone: "dark",    showTooltips: false,    logoGlow: false,    logoDarkGlow: true,    logoShadow: true  }};WW.renderRail = function(mount, config){
  if (!mount) return null;

  WW.pruneRailInstances();

  var preset = WW.railPresets[config.preset] || WW.railPresets["clue-light"];
  var railId = config.railId || ("rail-" + Math.random().toString(36).slice(2));
  var existingRail = WW.state.railInstances[railId];
  if (existingRail && typeof existingRail.destroy === "function"){
    existingRail.destroy();
  }

  var org = WW.getOrgFromUrl(mount);

  var width = config.width || preset.width;
  var tone = config.tone || preset.tone;
  var showTooltips = config.showTooltips != null ? config.showTooltips : preset.showTooltips;
  var logoGlow = config.logoGlow != null ? config.logoGlow : preset.logoGlow;
  var logoDarkGlow = config.logoDarkGlow != null ? config.logoDarkGlow : preset.logoDarkGlow;
  var logoShadow = config.logoShadow != null ? config.logoShadow : preset.logoShadow;

  var logoHref = WW.withOrg(config.logoHref || "/base-station", org);
  var logoSrc = config.logoSrc || "/cgi/image/WWLogo_-IrZfgR1CvN9DRDc2uq8H.png?width=828&quality=80&format=auto";
  var logoAlt = config.logoAlt || "WinterWord";

  var html = [
    '<aside class="ww-rail-host" data-rail-width="' + WW.escapeHtml(width) + '" id="' + WW.escapeHtml(railId) + '-host">',
      '<div class="ww-rail"',
        ' id="' + WW.escapeHtml(railId) + '"',
        ' data-rail-width="' + WW.escapeHtml(width) + '"',
        ' data-rail-tone="' + WW.escapeHtml(tone) + '"',
        ' data-show-tooltips="' + (showTooltips ? "true" : "false") + '"',
        ' data-logo-glow="' + (logoGlow ? "true" : "false") + '"',
        ' data-logo-dark-glow="' + (logoDarkGlow ? "true" : "false") + '"',
        ' data-logo-shadow="' + (logoShadow ? "true" : "false") + '"',
      '>',
        '<div class="ww-rail-shell">'
  ];

  if (config.logoMode === "stacked-home"){
    html.push(
      '<a class="ww-rail-logo" href="' + WW.escapeHtml(logoHref) + '">',
        '<img src="' + WW.escapeHtml(logoSrc) + '" alt="' + WW.escapeHtml(logoAlt) + '">',
      '</a>',
      '<div class="ww-rail-divider"></div>',
      '<div class="ww-rail-logo-label">BASE STATION</div>'
    );
  } else {
    html.push(
      '<a class="ww-rail-logo" href="' + WW.escapeHtml(logoHref) + '">',
        '<img src="' + WW.escapeHtml(logoSrc) + '" alt="' + WW.escapeHtml(logoAlt) + '">',
      '</a>'
    );
  }

  html.push('<nav class="ww-rail-nav">');

  (config.items || []).forEach(function(item){
    if (item.type === "icon-link"){
      html.push(
        '<a class="ww-rail-link"',
          ' href="' + WW.escapeHtml(WW.withOrg(item.href, org)) + '"',
          item.active ? ' data-active="true"' : '',
          item.disabled ? ' data-disabled="true"' : '',
        '>',
          '<img class="ww-rail-icon" src="' + WW.escapeHtml(item.icon) + '" alt="' + WW.escapeHtml(item.alt || item.label || "") + '">',
          '<div class="ww-rail-text">' + WW.escapeHtml(item.label || "") + '</div>',
          item.tooltip ? (
            '<div class="ww-rail-tooltip">' +
              (item.tooltipTitle ? '<div class="ww-rail-tooltip-title">' + WW.escapeHtml(item.tooltipTitle) + '</div>' : '') +
              WW.escapeHtml(item.tooltip) +
            '</div>'
          ) : '',
        '</a>'
      );
      return;
    }

    if (item.type === "text-link"){
      html.push(
        '<a class="ww-rail-link"',
          ' href="' + WW.escapeHtml(WW.withOrg(item.href, org)) + '"',
          item.active ? ' data-active="true"' : '',
          item.disabled ? ' data-disabled="true"' : '',
        '>',
          '<div class="ww-rail-text">' + WW.escapeHtml(item.label || "") + '</div>',
          item.tooltip ? (
            '<div class="ww-rail-tooltip">' +
              (item.tooltipTitle ? '<div class="ww-rail-tooltip-title">' + WW.escapeHtml(item.tooltipTitle) + '</div>' : '') +
              WW.escapeHtml(item.tooltip) +
            '</div>'
          ) : '',
        '</a>'
      );
      return;
    }

    if (item.type === "answer-button"){
      html.push(
        '<button class="ww-rail-answer"',
          ' type="button"',
          ' id="' + WW.escapeHtml(railId + "-answer") + '"',
          item.disabled ? ' disabled' : '',
        '>',
          WW.escapeHtml(item.label || "Answer"),
        '</button>'
      );
      return;
    }

    if (item.type === "play-button"){
      html.push(
        '<button class="ww-rail-play ww-play-ripple"',
          ' type="button"',
          ' id="' + WW.escapeHtml(railId + "-play") + '"',
          ' data-visibility="' + WW.escapeHtml(item.visibility || "visible") + '"',
          item.audio ? ' data-audio="' + WW.escapeHtml(item.audio) + '"' : '',
          item.audioPre ? ' data-audio-pre="' + WW.escapeHtml(item.audioPre) + '"' : '',
          item.audioPost ? ' data-audio-post="' + WW.escapeHtml(item.audioPost) + '"' : '',
          '>',
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5L8 5.5z"></path></svg>',
        '</button>'
      );
      return;
    }
  });

  html.push(
      '</nav>',
    '</div>',
  '</div>',
'</aside>'
  );

  mount.innerHTML = html.join("");

  var railEl = mount.querySelector("#" + WW.escapeCssIdent(railId));
  var answerBtn = mount.querySelector("#" + WW.escapeCssIdent(railId + "-answer"));
  var playBtn = mount.querySelector("#" + WW.escapeCssIdent(railId + "-play"));
  var cleanupFns = [];

  function registerRailCleanup(fn){
    if (typeof fn === "function"){
      cleanupFns.push(fn);
    }
  }

  var api = {
    id: railId,
    element: railEl,
    answerButton: answerBtn,
    playButton: playBtn,
    isAlive: function(){
      return !!(railEl && railEl.isConnected);
    },
    destroy: function(){
      while (cleanupFns.length){
        var fn = cleanupFns.pop();
        try{ fn(); }catch(e){}
      }
      if (WW.state.railInstances[railId] === api){
        delete WW.state.railInstances[railId];
      }
    },
    setPlayVisibility: function(mode){
      if (!playBtn) return;
      playBtn.setAttribute("data-visibility", mode === "visible" ? "visible" : "hidden");
    },
    setAnswerDisabled: function(disabled){
      if (!answerBtn) return;
      answerBtn.disabled = !!disabled;
    },
    bindAnswer: function(handler){
      if (!answerBtn || typeof handler !== "function") return;
      answerBtn.addEventListener("click", handler);
      registerRailCleanup(function(){
        answerBtn.removeEventListener("click", handler);
      });
    },
    bindPlay: function(handler){
      if (!playBtn) return;

      if (typeof handler === "function"){
        playBtn.addEventListener("click", handler);
        registerRailCleanup(function(){
          playBtn.removeEventListener("click", handler);
        });
        return;
      }

      function playDefault(){
        var src = playBtn.getAttribute("data-audio");
        if (src){
          WW.playSharedAudio(src, railId);
        }
      }

      playBtn.addEventListener("click", playDefault);
      registerRailCleanup(function(){
        playBtn.removeEventListener("click", playDefault);
        WW.destroySharedAudioBucket(railId);
      });
    }
  };

  if (mount){
    WW.registerMountCleanup(mount, api.destroy);
  }

  WW.state.railInstances[railId] = api;
  return api;
};/* SECTION: SHARED PAGE BOOTSTRAP */WW.bootOrgPage = async function(options){  var orgScope = options && (options.scopeRoot || options.renderNode) ? (options.scopeRoot || options.renderNode) : null;  var org = WW.getOrgFromUrl(orgScope);  var renderNode = options && options.renderNode ? options.renderNode : null;  if (renderNode && !WW.isNodeConnected(renderNode)){    return { ok:false, reason:"unmounted", org:org || "" };  }  if (options && options.requireOrg && !org){    if (typeof options.onMissingOrg === "function"){      options.onMissingOrg();    } else if (renderNode){      WW.stopRendering(renderNode);    }    return { ok:false, reason:"missing-org", org:"" };  }  if (options && options.fetchOrgState){    var tech = await WW.enforceTechDiffOrContinue(org, renderNode);    if (renderNode && !WW.isNodeConnected(renderNode)){      return { ok:false, reason:"unmounted", org:org, tech:tech };    }    if (!tech.ok){      if (tech.redirected || tech.onTechnical){        return { ok:false, reason:"tech-diff", org:org, tech:tech };      }      if (typeof options.onFetchFail === "function"){        options.onFetchFail(tech.result);      } else if (renderNode){        WW.stopRendering(renderNode);      }      return { ok:false, reason:"fetch-fail", org:org, tech:tech };    }    var result = tech.result;    if (!result || !result.ok || !result.data){      if (typeof options.onFetchFail === "function"){        options.onFetchFail(result);      } else if (renderNode){        WW.stopRendering(renderNode);      }      return { ok:false, reason:"fetch-fail", org:org, result:result };    }    return { ok:true, org:org, data:result.data, result:result };  }  return { ok:true, org:org };};

/* SECTION: MAIN PAGE RENDERERS */WW.pages = WW.pages || {};/* SECTION: PAGE — WELCOME */WW.pages.renderWelcome = function(mount){
  var org = WW.getOrgFromUrl(mount);
  var doc = WW.resolveDoc(mount);
  var view = WW.resolveWin(mount);
  var body = WW.getBody(mount);
  mount.innerHTML = [
    '<div id="wwWelcomePage">',
      '<div id="wwWelcomeShell">',
        '<video id="wwWelcomeVideo" autoplay muted playsinline preload="auto">',
          '<source src="/cgi/asset/welcome_WFjIMGqogODo2vmAtMvth.mp4" type="video/mp4">',
        '</video>',
        '<div id="wwWelcomeOverlay"></div>',
      '</div>',
    '</div>',
    '<div id="wwWelcomePageFade"></div>'
  ].join("");
  var video = mount.querySelector("#wwWelcomeVideo");
  var leaving = false;
  var unlocked = false;
  var navigationTimer = null;
  var targetUrl = WW.withOrg("/base-station", org);
  if (video){
    var handleVideoEnded = function(){ video.pause(); };
    video.addEventListener("ended", handleVideoEnded);
    WW.registerMountCleanup(mount, function(){
      video.removeEventListener("ended", handleVideoEnded);
    });
  }
  var unlockTimer = setTimeout(function(){
    unlocked = true;
  }, 60000);
  function block(e){
    e.preventDefault();
    e.stopPropagation();
  }
  function goNext(){
    if (leaving || !unlocked) return;
    leaving = true;
    if (body) body.classList.add("ww-welcome-leaving");
    if (navigationTimer){
      clearTimeout(navigationTimer);
    }
    navigationTimer = setTimeout(function(){
      if (!view || !view.location) return;
      WW.navigate(mount, targetUrl);
    }, 650);
  }
  function handleWheel(e){
    if (!unlocked){ block(e); return; }
    if (e.deltaY > 0){ block(e); goNext(); }
  }
  function handleKeydown(e){
    if (["ArrowDown","PageDown"," "].includes(e.key)){
      if (!unlocked){ block(e); return; }
      block(e); goNext();
    }
  }
  var startY = null;
  function handleTouchStart(e){
    startY = e.touches[0].clientY;
  }
  function handleTouchMove(e){
    if (!unlocked){ block(e); return; }
    var delta = startY - e.touches[0].clientY;
    if (delta > 60){ block(e); goNext(); }
  }
  WW.registerScopedListener(mount, view, "wheel", handleWheel, { passive:false });
  WW.registerScopedListener(mount, view, "keydown", handleKeydown, { passive:false });
  WW.registerScopedListener(mount, view, "touchstart", handleTouchStart, { passive:true });
  WW.registerScopedListener(mount, view, "touchmove", handleTouchMove, { passive:false });
  WW.registerMountCleanup(mount, function(){
    clearTimeout(unlockTimer);
    if (navigationTimer){
      clearTimeout(navigationTimer);
      navigationTimer = null;
    }
    if (body) body.classList.remove("ww-welcome-leaving");
  });
};/* SECTION: PAGE — BASE-STATION */WW.pages.renderBaseStation = async function(mount){  mount.innerHTML = [    '<div id="wwBaseStationPage" class="ww-hub-wrap">',      '<div id="wwBaseStationRail"></div>',      '<main class="ww-hub-main">',        '<div class="ww-hub-scroll">',          '<div class="ww-hub-view">',            '<div class="ww-hub-head">',              '<div class="ww-hub-head-copy">',                '<p class="ww-hub-slug" id="wwBaseSlug">',                  '<span>WINTERWORD</span>',                  '<span id="wwBaseSlugDivider1"> • </span>',                  '<span id="wwBaseSlugOrg">—</span>',                  '<span id="wwBaseSlugDivider2"> • </span>',                  '<span>2026</span>',                '</p>',                '<h2 class="ww-hub-title">BASE STATION</h2>',              '</div>',              '<div class="ww-hub-signal-wrap">',                '<div class="ww-hub-signal" aria-label="Signal">',                  '<div class="ww-hub-st-label">Signal</div>',                  '<div class="ww-hub-signal-bar" aria-hidden="true">',                    '<span></span><span></span><span></span><span></span><span></span>',                  '</div>',                '</div>',                '<a class="ww-hub-action-btn" id="wwBaseProblemLink" href="#">Report a problem</a>',                '<button class="ww-hub-action-btn" id="wwBaseSubToggle" type="button" aria-expanded="false" aria-controls="wwBaseSubPanel">Subscribe</button>',              '</div>',              '<div class="ww-hub-subpanel-wrap">',                '<div class="ww-hub-subpanel" id="wwBaseSubPanel">',                  '<div class="ww-hub-subtop">',                    '<div class="ww-hub-subtitle">Clue Alerts</div>',                    '<div class="ww-hub-subtext">',                      'Curious minds tend to wander.<br>',                      'When each clue falls,<br>',                      'subscribers will feel the ripple.',                    '</div>',                    '<a class="ww-hub-subaction ww-hub-subaction-primary" id="wwBaseSubLink" href="#">Subscribe to Clue Alerts</a>',                  '</div>',                  '<div class="ww-hub-subbottom">',                    '<a class="ww-hub-subaction ww-hub-subaction-secondary" id="wwBaseUnsubLink" href="#">Unsubscribe</a>',                    '<div class="ww-hub-subsub">Execute ESCAPE ROOM protocol.</div>',                  '</div>',                '</div>',              '</div>',            '</div>',            '<p class="ww-hub-tagline">',              'A letter per week from a wintry scroll,<br>',              'Piece them together — reveal the whole.',            '</p>',            '<div class="ww-hub-base">',              '<div>',                '<div class="ww-hub-card ww-hub-card--rules">',                  '<h3>How this works</h3>',                  '<p>Each week, a new clue will quietly unlock — each one revealing a single letter.</p>',                  '<p>Guard your answers, for as the season unfolds, they will begin to shift and settle… forming the anagram of the <em>Winterword</em>.</p>',                  '<p>If you feel the answer stirring early, step forward and claim your place on the leaderboard.</p>',                  '<p>But remember — one guess is all you get.</p>',                '</div>',                '<div class="ww-hub-card ww-hub-card--updates" style="margin-top:1.25rem;">',                  '<h3>Updates</h3>',                  '<p id="wwBaseUpdatesText">Loading…</p>',                '</div>',              '</div>',              '<div class="ww-hub-lastword">',                '<h3>The Last Word</h3>',                '<p class="ww-hub-lastword-kicker">',                  'When the wind quietens,<br>',                  'certainty stirs',                '</p>',                '<div class="ww-hub-primary-wrap">',                  '<a class="ww-hub-primary" id="wwBaseSolveLink" href="#">Solve WinterWord</a>',                  '<div class="ww-hub-primary-tooltip">Ready?</div>',                '</div>',                '<div class="ww-hub-stakes">',                  'One word.<br>',                  'One chance.<br>',                  'Guess wrong, and the silence wins.',                '</div>',              '</div>',            '</div>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  var org = WW.getOrgFromUrl(mount);  WW.renderRail(mount.querySelector("#wwBaseStationRail"), {    railId: "wwBaseMainRail",    preset: "main-wide",    items: [      {        type: "icon-link",        href: "/clue-list",        label: "CLUES",        icon: "/cgi/image/Clue_ivx53yyYY6YAR7ZkHgMQJ.png?width=256&quality=80&format=auto",        alt: "Clues",        tooltipTitle: "Clues",        tooltip: "Each of your upcoming clues is designed to reveal just enough to move you forward — and hide the rest where only patience can reach it."      },      {        type: "icon-link",        href: "/lifeline",        label: "LIFELINE",        icon: "/cgi/image/Lifeline_oT0vP3H4BL6I-Z--NFPHA.png?width=256&quality=80&format=auto",        alt: "Lifeline",        disabled: true,        tooltip: "This passage waits its moment."      },      {        type: "icon-link",        href: "/leaderboard",        label: "LEADER",        icon: "/cgi/image/Leaderboard_94LRTiQiFRVwCQT0zH-2y.png?width=256&quality=80&format=auto",        alt: "Leaderboard",        tooltipTitle: "Leaderboard",        tooltip: "The Leaderboard remembers all who enter the game. It reflects those who find the answer, and honours the one who found it first."      }    ]  });  function setOrgName(name){    var slugOrg = mount.querySelector("#wwBaseSlugOrg");    var d1 = mount.querySelector("#wwBaseSlugDivider1");    var d2 = mount.querySelector("#wwBaseSlugDivider2");    if (!slugOrg) return;    if (name && String(name).trim()){      slugOrg.textContent = String(name).trim();      if (d1) d1.style.display = "";      if (d2) d2.style.display = "";    } else {      slugOrg.textContent = "";      if (d1) d1.style.display = "none";      if (d2) d2.style.display = "none";    }  }  function setUpdates(text){    var el = mount.querySelector("#wwBaseUpdatesText");    if (!el) return;    if (text && String(text).trim()){      el.textContent = String(text).trim();      el.style.display = "";    } else {      el.textContent = "";      el.style.display = "none";    }  }  var baseProblemLink = mount.querySelector("#wwBaseProblemLink");  var baseSubLink = mount.querySelector("#wwBaseSubLink");  var baseUnsubLink = mount.querySelector("#wwBaseUnsubLink");  var baseSolveLink = mount.querySelector("#wwBaseSolveLink");  if (baseProblemLink){    baseProblemLink.href =      "mailto:fix@cluehouse.co.nz?subject=WinterWord%20Issue&body=SET%20THE%20SCENE%3A%0AWhich%20page%20were%20you%20on%3F%0A%0APLOT%20TWIST%3A%0AWhat%20went%20wrong%3F%0A%0AALTERNATE%20ENDING%3A%0AWhat%20did%20you%20expect%20to%20happen%3F%0A%0AYOUR%20TRAVELLER%E2%80%99S%20GEAR%3A%0AWhich%20device%20%2B%20browser%20you%20brought%20on%20this%20journey.%0A%0AThanks%20for%20sharing%20%E2%80%94%20we%E2%80%99ll%20follow%20the%20trail%20and%20set%20things%20right.";  }  if (baseSubLink){    baseSubLink.href =      "mailto:opt@cluehouse.co.nz?subject=WinterWord%20Subscribe&body=Sign%20me%20up.%20The%20winter%20hush%20is%20starting%20to%20feel%20personal.";  }  if (baseUnsubLink){    baseUnsubLink.href =      "mailto:opt@cluehouse.co.nz?subject=WinterWord%20Unsubscribe&body=Remove%20me%20from%20Winterword%20Clue%20Alerts.%20I%E2%80%99m%20embracing%20the%20quiet%20freeze%20of%20an%20uncluttered%20inbox.";  }  if (baseSolveLink){    baseSolveLink.href =      "mailto:key@cluehouse.co.nz?subject=FINAL%20Winterword%20Submission%20-%20Endgame%20-%202026&body=You%20feel%20the%20pieces%20have%20settled.%0A%0AClues%20gathered.%20Letters%20found.%0AA%20pattern%2C%20perhaps%2C%20now%20clear%20beneath%20the%20frost.%0A%0AIf%20you%20believe%20you%20can%20name%20the%20WinterWord%2C%0Aset%20it%20down%20below.%0A%0AYour%20answer%3A%0A%0A%5BTYPE%20YOUR%20FINAL%20WORD%20HERE%5D%0A%0A%0A(Only%20one%20submission%20is%20counted.%0AChoose%20your%20moment%20%E2%80%94%20winter%20does%20not%20answer%20twice.)";  }  (function(){    var toggle = mount.querySelector("#wwBaseSubToggle");    var panel = mount.querySelector("#wwBaseSubPanel");    var doc = WW.resolveDoc(mount);    if (!toggle || !panel) return;    function setPreview(on){      if (panel.classList.contains("is-open")) return;      panel.classList.toggle("is-previewing", on);    }    function setOpen(on){      panel.classList.toggle("is-open", on);      toggle.setAttribute("aria-expanded", on ? "true" : "false");      if (on) panel.classList.remove("is-previewing");    }    function handleDocumentClick(){      setOpen(false);      panel.classList.remove("is-previewing");    }    function handleDocumentKeydown(e){      if (e.key === "Escape") {        setOpen(false);        panel.classList.remove("is-previewing");      }    }    function handleToggleMouseEnter(){ setPreview(true); }    function handleToggleMouseLeave(){ setPreview(false); }    function handlePanelMouseEnter(){      if (!panel.classList.contains("is-open")) panel.classList.add("is-previewing");    }    function handlePanelMouseLeave(){      if (!panel.classList.contains("is-open")) panel.classList.remove("is-previewing");    }    function handleToggleClick(e){      e.preventDefault();      e.stopPropagation();      setOpen(!panel.classList.contains("is-open"));    }    function handlePanelClick(e){ e.stopPropagation(); }    toggle.addEventListener("mouseenter", handleToggleMouseEnter);    toggle.addEventListener("mouseleave", handleToggleMouseLeave);    panel.addEventListener("mouseenter", handlePanelMouseEnter);    panel.addEventListener("mouseleave", handlePanelMouseLeave);    toggle.addEventListener("click", handleToggleClick);    panel.addEventListener("click", handlePanelClick);    WW.registerScopedListener(mount, doc, "click", handleDocumentClick);    WW.registerScopedListener(mount, doc, "keydown", handleDocumentKeydown);    WW.registerMountCleanup(mount, function(){      toggle.removeEventListener("mouseenter", handleToggleMouseEnter);      toggle.removeEventListener("mouseleave", handleToggleMouseLeave);      panel.removeEventListener("mouseenter", handlePanelMouseEnter);      panel.removeEventListener("mouseleave", handlePanelMouseLeave);      toggle.removeEventListener("click", handleToggleClick);      panel.removeEventListener("click", handlePanelClick);    });  })();  var boot = await WW.bootOrgPage({    renderNode: mount,    requireOrg: false,    fetchOrgState: true,    onFetchFail: function(){      setOrgName("");      setUpdates("");    }  });  if (!boot.ok){    if (boot.reason === "missing-org" || boot.reason === "fetch-fail"){      setOrgName("");      setUpdates("");    }    return;  }  var data = boot.data;  if (!data.is_visible || data.unavailable){    setOrgName(data.org_name || "");    setUpdates("Unavailable.");    return;  }  if (data.is_complete){    WW.navigate(mount, WW.withOrg("/base-resolve", boot.org));    return;  }  setOrgName(data.org_name || "");  setUpdates(data.updates_content || "");};/* SECTION: PAGE — BASE-RESOLVE */WW.pages.renderBaseResolve = async function(mount){  mount.innerHTML = [    '<div id="wwBaseResolvePage">',      '<div id="wwBaseResolveView">',        '<section class="ww-resolve-hero">',          '<div class="ww-resolve-slug" id="wwResolveSlug">',            '<span>WINTERWORD</span>',            '<span id="wwResolveSlugDivider1"> • </span>',            '<span id="wwResolveSlugOrg">—</span>',            '<span id="wwResolveSlugDivider2"> • </span>',            '<span>2026</span>',          '</div>',          '<h1 class="ww-resolve-title">BASE STATION</h1>',          '<div class="ww-resolve-status-stack">',            '<div class="ww-resolve-status-line">',              '<span class="ww-resolve-status-dot"></span>',              '<span id="wwResolveSeasonStatus">Season Complete</span>',            '</div>',            '<div class="ww-resolve-tagline">The frost is lifting, and what was hidden is now uncovered.</div>',          '</div>',          '<div class="ww-resolve-grid">',            '<div class="ww-resolve-memory">',              '<div class="ww-resolve-memory-label">Updates</div>',              '<p class="ww-resolve-memory-line" id="wwResolveMemoryLine">',                'The trail is quiet now: nothing more will fall.<br>',                'Everything you need is already in your hands.<br>',                'You can continue solving, or discover the answers now.',              '</p>',              '<div class="ww-resolve-reveal-copy">',                '<p>The final word and full solution are ready.</p>',                '<p>Reveal the final word when ready.</p>',              '</div>',              '<div class="ww-resolve-main-actions">',                '<a class="ww-resolve-primary" id="wwResolveAnswersLink" href="#">View Answers</a>',                '<a class="ww-resolve-secondary" id="wwResolveLeaderboardLink" href="#">View Leaderboard</a>',                '<a class="ww-resolve-secondary" href="mailto:cluehousehq@gmail.com?subject=WinterWord%20Afterword">Afterword</a>',              '</div>',            '</div>',            '<div class="ww-resolve-card">',              '<h3 class="ww-resolve-note-title">Signed, sealed, delivered.</h3>',              '<div class="ww-resolve-note-body">',                '<p>If you’ve made it here, you already know: the ending was never just a word.</p>',                '<p>This winter hit differently — the warmth was real.</p>',                '<p>You watched the clues fall, one by one.</p>',                '<p>Every one of them pointed here.</p>',                '<p class="ww-resolve-final">Game over. No. Game complete.</p>',              '</div>',            '</div>',          '</div>',        '</section>',      '</div>',    '</div>'  ].join("");  function setOrgName(name){    var slugOrg = mount.querySelector("#wwResolveSlugOrg");    var d1 = mount.querySelector("#wwResolveSlugDivider1");    var d2 = mount.querySelector("#wwResolveSlugDivider2");    if (!slugOrg) return;    if (name && String(name).trim()){      slugOrg.textContent = String(name).trim();      if (d1) d1.style.display = "";      if (d2) d2.style.display = "";    } else {      slugOrg.textContent = "";      if (d1) d1.style.display = "none";      if (d2) d2.style.display = "none";    }  }  var boot = await WW.bootOrgPage({    renderNode: mount,    requireOrg: false,    fetchOrgState: true,    usePreviewFallbackOrg: true,    previewFallbackOrg: WW.getPreviewFallbackOrg(),    onMissingOrg: function(){      WW.showUnavailableBlock(mount.querySelector("#wwBaseResolveView"), "BASE STATION");    },    onFetchFail: function(){      WW.showUnavailableBlock(mount.querySelector("#wwBaseResolveView"), "BASE STATION");    }  });  if (!boot.ok){    if (boot.reason === "missing-org" || boot.reason === "fetch-fail"){      return;    }    return;  }  var data = boot.data;  if (!data.is_visible || data.unavailable){    WW.showUnavailableBlock(mount.querySelector("#wwBaseResolveView"), "BASE STATION");    return;  }  if (!data.is_complete){    var view = WW.resolveWin(mount);
    if (view && view.location){
      return;
    }    return;  }  setOrgName(data.org_name || "");  mount.querySelector("#wwResolveSeasonStatus").textContent = "Season Complete";  mount.querySelector("#wwResolveAnswersLink").href = WW.withOrg("/answer-list", boot.org);  mount.querySelector("#wwResolveLeaderboardLink").href = WW.withOrg("/leaderboard", boot.org);};/* SECTION: PAGE — CLUE-LIST */WW.pages.renderClueList = async function(mount){  function clueHref(n, org){    return WW.withOrg("/clues/" + String(n).padStart(2, "0"), org);  }  var banners = [    { n:12, word:"twelve", img:"/cgi/image/12_6zn-ucfLzutHdmo6_xSfY.gif?width=1800&quality=80&format=auto", alt:"Clue twelve", href:"/clues/12" },    { n:11, word:"eleven", img:"/cgi/image/nude11_fRuUdvBWB5JB5tORZNniy.png?width=3840&quality=80&format=auto", alt:"Clue eleven", href:"/clues/11" },    { n:10, word:"ten", img:"/cgi/image/10_v_W7iqPQ3yi3MLPwhN_nO.png?width=1800&quality=80&format=auto", alt:"Clue ten", href:"/clues/10" },    { n:9, word:"nine", img:"/cgi/image/nude9_wyaKL1fzDNPXk4yVA4_gl.png?width=3840&quality=80&format=auto", alt:"Clue nine", href:"/clues/09" },    { n:8, word:"eight", img:"/cgi/image/02PNG_3q0D97EI0_zfq4-NlW5H0.png?width=3840&quality=80&format=auto", alt:"Clue eight", href:"/clues/08" },    { n:7, word:"seven", img:"/cgi/image/7_-4aS_qnp91AMK9CSVagw5.png?width=3840&quality=80&format=auto", alt:"Clue seven", href:"/clues/07" },    { n:6, word:"six", img:"/cgi/image/6_SMquKsiqjg5xaiTfyue3l.png?width=1800&quality=80&format=auto", alt:"Clue six", href:"/clues/06" },    { n:5, word:"five", img:"/cgi/image/5_zQW06nMk8r174jnRaANSy.png?width=1800&quality=80&format=auto", alt:"Clue five", href:"/clues/05" },    { n:4, word:"four", img:"/cgi/image/nude4_G9w5oumGqCSU27uoQuXX5.png?width=3840&quality=80&format=auto", alt:"Clue four", href:"/clues/04" },    { n:3, word:"three", img:"/cgi/image/Abandoned_room_with_weathered_furnishings_5rFIb5OK8MVOKys1XaGWU.png?width=3840&quality=80&format=auto", alt:"Clue three", href:"/clues/03" },    { n:2, word:"two", img:"/cgi/image/nude2_hMLiRjbvnUlX8nwbO5zfM.png?width=3840&quality=80&format=auto", alt:"Clue two", href:"/clues/02" },    { n:1, word:"one", img:"/cgi/image/nude1_SUlmEuX59Xwyy0IfojrmR.png?width=3840&quality=80&format=auto", alt:"Clue one", href:"/clues/01" }  ];  mount.innerHTML = [    '<div id="wwClueListPage">',      '<div id="wwClueListShell">',        '<div id="wwClueListContent">',          '<div class="ww-cluelist-left">',            '<a href="' + WW.prefixInternalPath('/base-station') + '" class="ww-cluelist-logo">',              '<img src="/cgi/image/WWLogo_-IrZfgR1CvN9DRDc2uq8H.png?width=828&quality=80&format=auto" alt="WinterWord">',              '<div class="ww-cluelist-divider"></div>',              '<div class="ww-cluelist-label">BASE STATION</div>',            '</a>',          '</div>',          '<div class="ww-cluelist-main">',            '<div class="ww-cluelist-scroll">',              '<section class="ww-cluelist-wrap">',                '<div class="ww-cluelist-list">',                  '<div class="ww-cluelist-status">',                    '<span id="wwClueListStatusCurrent">Loading…</span>',                    '<span id="wwClueListStatusNext">Checking schedule…</span>',                  '</div>',                  banners.map(function(item){                    return [                      '<article class="ww-cluelist-banner" data-clue="' + item.n + '">',                        '<div class="ww-cluelist-row">',                          '<div class="ww-cluelist-img"><img src="' + item.img + '" alt="' + item.alt + '"></div>',                          '<div class="ww-cluelist-meta">',                            '<div class="ww-cluelist-meta-copy">',                              '<div class="ww-cluelist-kicker">CLUE</div>',                              '<div class="ww-cluelist-num">' + item.word + '</div>',                              '<div class="ww-cluelist-line"></div>',                            '</div>',                            '<a class="ww-cluelist-open" data-open-clue="' + item.n + '" href="' + item.href + '">OPEN →</a>',                          '</div>',                        '</div>',                      '</article>'                    ].join("");                  }).join(""),                '</div>',              '</section>',            '</div>',          '</div>',        '</div>',      '</div>',    '</div>'  ].join("");  var shell = mount.querySelector("#wwClueListShell");  var statusCurrentEl = mount.querySelector("#wwClueListStatusCurrent");  var statusNextEl = mount.querySelector("#wwClueListStatusNext");  var clueCards = Array.from(mount.querySelectorAll(".ww-cluelist-banner[data-clue]"));  var org = WW.getOrgFromUrl(mount);  Array.prototype.forEach.call(mount.querySelectorAll("[data-open-clue]"), function(link){    var n = Number(link.getAttribute("data-open-clue"));    link.href = clueHref(n, org);  });  function stopRendering(){    if (shell) shell.style.display = "none";  }  function parseDateValue(value){    if (!value) return null;    var d = new Date(value);    return isNaN(d) ? null : d;  }  function getIntervalMs(dropFrequency){    var raw = String(dropFrequency || "").trim().toLowerCase();    if (!raw) return null;    if (raw === "weekly") return 7 * 24 * 60 * 60 * 1000;    if (raw === "hourly") return 60 * 60 * 1000;    if (raw === "quarter_hourly") return 15 * 60 * 1000;    return null;  }  function nextWeekdayFrom(date){    var d = new Date(date.getTime());    do {      d.setDate(d.getDate() + 1);    } while (d.getDay() === 0 || d.getDay() === 6);    return d;  }  function computeNextUnlock(data){    if (data.is_complete) return null;    var currentClue = Number(data.current_clue || 0);    var totalClues = Number(data.total_clues || 0);    var seasonStart = parseDateValue(data.season_start);    var dropFrequency = String(data.drop_frequency || "").trim().toLowerCase();    if (!seasonStart || !dropFrequency || currentClue >= totalClues) return null;    if (dropFrequency === "daily_weekdays") {      if (currentClue <= 0) {        var startDay = seasonStart.getDay();        return (startDay === 0 || startDay === 6) ? nextWeekdayFrom(seasonStart) : seasonStart;      }      var unlock = new Date(seasonStart.getTime());      for (var i = 1; i <= currentClue; i += 1) {        unlock = nextWeekdayFrom(unlock);      }      return unlock;    }    var intervalMs = getIntervalMs(dropFrequency);    if (!intervalMs) return null;    return new Date(seasonStart.getTime() + (currentClue * intervalMs));  }  function formatNextUnlock(date, timeZone){    if (!(date instanceof Date) || isNaN(date)) return "Next Unlock · TBC";    try {      var weekday = new Intl.DateTimeFormat("en-NZ", {        weekday: "short",        timeZone: timeZone || undefined      }).format(date);      var time = new Intl.DateTimeFormat("en-NZ", {        hour: "2-digit",        minute: "2-digit",        hour12: false,        timeZone: timeZone || undefined      }).format(date);      return "Next Unlock · " + weekday + " " + time;    } catch (e) {      var fallbackWeekday = date.toLocaleDateString("en-NZ", { weekday: "short" });      var hours = String(date.getHours()).padStart(2, "0");      var mins = String(date.getMinutes()).padStart(2, "0");      return "Next Unlock · " + fallbackWeekday + " " + hours + ":" + mins;    }  }  function applyClueVisibility(currentClue){    clueCards.forEach(function(card){      var clueNumber = Number(card.getAttribute("data-clue"));      card.style.display = clueNumber <= currentClue ? "" : "none";    });  }  function updateStatus(data){    var currentClue = Number(data.current_clue || 0);    var totalClues = Number(data.total_clues || 0);    var nextUnlock = computeNextUnlock(data);    if (!statusCurrentEl || !statusNextEl) return;    if (data.is_complete) {      statusCurrentEl.textContent = "Season Complete";      statusNextEl.textContent = "All Clues Available";      return;    }    if (currentClue <= 0) {      statusCurrentEl.textContent = "No Clues Available Yet";    } else {      statusCurrentEl.textContent = "Week " + currentClue + " Available";    }    if (nextUnlock) {      statusNextEl.textContent = formatNextUnlock(nextUnlock, data.timezone);    } else if (currentClue >= totalClues && totalClues > 0) {      statusNextEl.textContent = "All Clues Available";    } else {      statusNextEl.textContent = "Next Unlock · TBC";    }  }  var boot = await WW.bootOrgPage({    renderNode: shell,    requireOrg: true,    fetchOrgState: true,    onMissingOrg: stopRendering,    onFetchFail: stopRendering  });  if (!boot.ok) return;  var data = boot.data;  if (!data.is_visible || data.unavailable){    stopRendering();    return;  }  applyClueVisibility(Number(data.current_clue || 0));  updateStatus(data);};/* SECTION: PAGE — LIFELINE */WW.pages.renderLifeline = function(mount){  var org = WW.getOrgFromUrl(mount);  mount.innerHTML = [    '<div id="wwLifelinePage">',      '<div id="wwLifelineShell">',        '<div id="wwLifelineContent">',          '<div class="ww-lifeline-left">',            '<a href="' + WW.withOrg('/base-station', org) + '" class="ww-lifeline-logo">',              '<img src="/cgi/image/WWLogo_-IrZfgR1CvN9DRDc2uq8H.png?width=828&quality=80&format=auto" alt="WinterWord">',              '<div class="ww-lifeline-divider"></div>',              '<div class="ww-lifeline-label">BASE STATION</div>',            '</a>',          '</div>',          '<div class="ww-lifeline-main">',            '<a class="ww-lifeline-tile" href="mailto:ask@cluehouse.co.nz">',              '<div class="ww-lifeline-media"></div>',              '<div class="ww-lifeline-inner">',                '<div></div>',                '<div class="ww-lifeline-right">',                  '<div class="ww-lifeline-copy">',                    '<p>The line between knowing and not-knowing is thin.<br>Sometimes it hums.<br>Sometimes it mocks.<br>And sometimes — just once —<br>you\'re allowed to speak across it.</p>',                    '<p>You may ask one question to help you solve any clue.<br>Just one.</p>',                    '<p>Your question must be clear. Direct. Unriddled.<br>In return, you\'ll hear only one of four replies —<br>Yes. No. Warm. Cold.</p>',                    '<p>The answer may help you. It may not.<br>Use it early or save it for the coldest hour.<br>But once it\'s gone... it\'s gone.</p>',                    '<p>When it is time, click here.</p>',                  '</div>',                '</div>',              '</div>',            '</a>',          '</div>',        '</div>',      '</div>',    '</div>'  ].join("");};/* SECTION: PAGE — LEADERBOARD */WW.pages.renderLeaderboard = async function(mount){  mount.innerHTML = [    '<div id="wwLeaderboardPage">',      '<div id="wwLeaderboardShell">',        '<div id="wwLeaderboardContent">',          '<div class="ww-leader-left">',            '<a href="' + WW.withOrg('/base-station', WW.getOrgFromUrl(mount)) + '" class="ww-leader-logo">',              '<img src="/cgi/image/WWLogo_-IrZfgR1CvN9DRDc2uq8H.png?width=828&quality=80&format=auto" alt="WinterWord">',              '<div class="ww-leader-divider"></div>',              '<div class="ww-leader-label">BASE STATION</div>',            '</a>',          '</div>',          '<div class="ww-leader-main">',            '<div class="ww-leader-board">',              '<div class="ww-leader-board-media"></div>',              '<div class="ww-leader-board-overlay"></div>',              '<div class="ww-leader-board-inner">',                '<div></div>',                '<div class="ww-leader-board-right">',                  '<div class="ww-leader-anchor">',                    '<div class="ww-leader-wrap">',                      '<div class="ww-leader-inner">',                        '<div class="ww-leader-record">',                          '<h3>The WinterWord is known.</h3>',                          '<div class="ww-leader-record-meta">',                            'The ice was cracked by <span class="ww-leader-winner" data-winner-name="">—</span><br>',                            '<span data-winner-time="">—</span><br>',                            'The board is open.',                          '</div>',                        '</div>',                        '<div class="ww-leader-divider-centre">❄</div>',                        '<div class="ww-leader-status" data-status="">Loading leaderboard…</div>',                        '<div class="ww-leader-ranks">',                          [2,3,4,5,6,7,8,9,10].map(function(rank){                            return [                              '<div class="ww-leader-rankrow" data-rank="' + rank + '">',                                '<div class="ww-leader-rank">' + rank + '</div>',                                '<div class="ww-leader-name">—</div>',                                '<div class="ww-leader-solved">—</div>',                              '</div>'                            ].join("");                          }).join(""),                        '</div>',                      '</div>',                    '</div>',                  '</div>',                '</div>',              '</div>',            '</div>',          '</div>',        '</div>',      '</div>',    '</div>'  ].join("");  function formatTimestamp(value){    if (!value) return "—";    var d = new Date(value);    if (Number.isNaN(d.getTime())) return String(value);    return d.toLocaleString("en-NZ", {      year: "numeric",      month: "short",      day: "numeric",      hour: "numeric",      minute: "2-digit"    });  }  var leaderboardRoot = mount;  var leaderboardShell = mount.querySelector("#wwLeaderboardShell");  var leaderboardStatusEl = mount.querySelector("[data-status]");  var leaderboardWinnerNameEl = mount.querySelector("[data-winner-name]");  var leaderboardWinnerTimeEl = mount.querySelector("[data-winner-time]");  var leaderboardLogoEl = mount.querySelector(".ww-leader-logo");  function setStatus(message){    if (leaderboardStatusEl) leaderboardStatusEl.textContent = message;  }  var boot = await WW.bootOrgPage({    renderNode: mount,    requireOrg: true,    fetchOrgState: true,    onMissingOrg: function(){      setStatus("No organisation specified.");    },    onFetchFail: function(){      setStatus("Leaderboard unavailable.");    }  });  if (!boot.ok){    return;  }  var data = boot.data;  if (leaderboardLogoEl){    leaderboardLogoEl.href = WW.withOrg("/base-station", boot.org);  }  if (!data || !data.is_visible || data.unavailable){    setStatus("Leaderboard unavailable.");    return;  }  var leaderboardResult = await WW.fetchLeaderboard(boot.org);  if (!leaderboardResult || !leaderboardResult.ok){    if (typeof console !== "undefined" && console && typeof console.error === "function"){ console.error("Leaderboard request failed:", leaderboardResult); }    setStatus(leaderboardResult && leaderboardResult.recognizedShape === false ? "Leaderboard data format not recognised." : "Leaderboard unavailable.");    return;  }  var records = Array.isArray(leaderboardResult.rows) ? leaderboardResult.rows.slice() : [];  records = records.map(function(record){    return record && record.fields ? record.fields : record || {};  }).filter(function(record){    return !!record;  }).sort(function(a, b){    return Number(a.rank || 999) - Number(b.rank || 999);  });  if (records.length === 0){    setStatus("No leaderboard records found.");    return;  }  var winner = records.find(function(record){    return Number(record.rank) === 1;  });  if (winner){    var winnerName = winner.player_name ? winner.player_name : "—";    var winnerTime = formatTimestamp(winner.timestamp);    if (leaderboardWinnerNameEl) leaderboardWinnerNameEl.textContent = winnerName;    if (leaderboardWinnerTimeEl) leaderboardWinnerTimeEl.textContent = winnerTime;  }  records.forEach(function(record){    var rank = Number(record.rank);    if (!rank || rank < 2 || rank > 10) return;    var row = leaderboardRoot.querySelector('[data-rank="' + rank + '"]');    if (!row) return;    var nameEl = row.querySelector(".ww-leader-name");    var solvedEl = row.querySelector(".ww-leader-solved");    if (nameEl) nameEl.textContent = record.player_name ? record.player_name : "—";    if (solvedEl) solvedEl.textContent = formatTimestamp(record.timestamp);  });  setStatus("Leaderboard loaded.");};

WW.pages = WW.pages || {};/* SECTION: CLUE-01 */WW.pages.renderClue01 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue01Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<video id="wwClue01Still" class="ww-clue-media" muted playsinline preload="metadata">',            '<source src="https://github.com/ClueHouse/winterword-assets/raw/refs/heads/main/videos/01.mp4" type="video/mp4">',          '</video>',        '</div>',        '<div id="wwClue01Overlay" class="ww-overlay">',          '<div id="wwClue01Veil" class="ww-screen-veil"></div>',          '<div class="ww-overlay-inner">',            '<video id="wwClue01Answer" class="ww-overlay-media" playsinline preload="metadata">',              '<source src="https://github.com/ClueHouse/winterword-assets/raw/refs/heads/main/videos/01.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  WW.freezeVideoAtStart(mount.querySelector("#wwClue01Still"), 0.12, mount);  WW.renderRail(mount.querySelector("#wwClue01Rail"), {    railId: "wwClue01RailInstance",    preset: "clue-steel",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwClue01Overlay",    mediaId: "wwClue01Answer",    veilId: "wwClue01Veil",    openClass: "is-open"  });  WW.registerScopedListener(mount, mount.querySelector("#wwClue01Still"), "click", ctl.open);  WW.registerScopedListener(mount, mount.querySelector("#wwClue01Veil"), "click", ctl.close);};/* SECTION: CLUE-02 */WW.pages.renderClue02 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue02Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<img class="ww-clue-media" src="/cgi/image/02_PNG_ic_SpIY-VcZyI65Xz97CE.png?width=1920&quality=80&format=auto" alt="WinterWord Clue 2" loading="lazy" decoding="async">',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue02Rail"), {    railId: "wwClue02RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });};/* SECTION: CLUE-03 */WW.pages.renderClue03 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue03Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<div class="ww-clue-image-shell">',            '<img src="/cgi/image/Abandoned_room_with_weathered_furnishings_5rFIb5OK8MVOKys1XaGWU.png?width=1920&quality=80&format=auto" alt="WinterWord clue image" loading="lazy" decoding="async">',            '<div class="ww-clue-image-overlay"></div>',            '<div class="ww-clue-overlay-text">',              '<div class="ww-clue-stanza">',                '<div class="ww-clue-line soft">A quiet glass left beside the sink,</div>',                '<div class="ww-clue-line soft">A bell once sung, now still.</div>',                '<div class="ww-clue-line soft">A static TV, no one in sight —</div>',                '<div class="ww-clue-line soft">The silence seems to spill.</div>',              '</div>',              '<div class="ww-clue-stanza">',                '<div class="ww-clue-line soft">A jigsaw lies beneath the steps,</div>',                '<div class="ww-clue-line soft">A box once twice the size.</div>',                '<div class="ww-clue-line soft">The wooden edge meets flecks of ash,</div>',                '<div class="ww-clue-line soft">Each piece sits with nested lies.</div>',              '</div>',              '<div class="ww-clue-stanza">',                '<div class="ww-clue-line">The toast is sliced. The tea is cold.</div>',                '<div class="ww-clue-line">The echo fades like stone.</div>',                '<div class="ww-clue-line">All feels as it did again,</div>',                '<div class="ww-clue-line final">Yet something’s not at home.</div>',              '</div>',            '</div>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue03Rail"), {    railId: "wwClue03RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });};/* SECTION: CLUE-04 */WW.pages.renderClue04 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue04Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<img class="ww-clue-media" src="/cgi/image/04_nWjkOv_74ltI06wAihuB2.png?width=3840&quality=80&format=auto" alt="WinterWord Clue 4" loading="lazy" decoding="async">',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue04Rail"), {    railId: "wwClue04RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });};/* SECTION: CLUE-05 */WW.pages.renderClue05 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue05Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<img class="ww-clue-media" src="/cgi/image/05_PNG_UoeyUYEg9hnN87ZYfZWrj.png?width=1920&quality=80&format=auto" alt="WinterWord Clue 5" loading="lazy" decoding="async">',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwClue05Rail"), {    railId: "wwClue05RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" },      { type: "play-button", visibility: "visible" }    ]  });  rail.bindPlay(function(){    WW.playSharedAudio(      "https://github.com/ClueHouse/winterword-assets/raw/refs/heads/main/audio/Grandpa.mp3",      "wwClue05RailInstance"    );  });};/* SECTION: CLUE-06 */WW.pages.renderClue06 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue06Rail"></div>',      '<main class="ww-clue-main" style="display:flex;align-items:center;justify-content:center;padding:2.4vh 2.2vw;">',        '<section id="wwClue06Shell">',          '<div class="ww-stage">',            '<div class="ww-bg">',              '<img src="/cgi/image/SIX_kFJB1Gje6EwxPi8SLW6rx.png?width=1200&quality=80&format=auto" alt="WinterWord Clue 6" loading="lazy" decoding="async">',            '</div>',            '<div class="ww-inner">',              '<div class="ww-poem">',                '<p>You stand at the southern edge of something measured and unforgiving:</p>',                '<p>a 10-kilometre path broken only by glyphs and the echoes of whatever came before you.</p>',                '<p>Faintly beneath your feet, the letter A was once painted — faded now, but the shape is unmistakable. The stroke. The spacing. The intent.</p>',                '<p>You raise your head slowly, like a compass needle remembering north. You’ve been told that four hundred metres ahead, a little too far for your eyes to confirm, the letter B waits. Same painter? A delinquent’s graffito, maybe? Hard to say — you’ve been lied to before.</p>',                '<p>Four hundred beyond that lies C. Then D. Then the rest — Alpha to Zulu, running south to north.</p>',                '<p>The sigh you release is well-worn — like the satchel on your hip. You reach in and pull free the list he said would help.</p>',                '<p>You squint at the sun, judging daylight like something owed, then gaze down the line. The paper creaks between your fingers as you unfold it.</p>',                '<p>The list is a mess — a patchwork of pens, pencils, and whatever else was nearby. A dozen hands must’ve had their say. It looks woeful.</p>',                '<p><em>But it’s all you’ve got.</em></p>',              '</div>',              '<div class="ww-scroll-nudge" aria-hidden="true"><div class="ww-scroll-nudge-caret">˅</div></div>',              '<div class="ww-spacer"></div>',              '<div class="ww-notes">',                '<ol>',                  '<li>Move north the length of Old Scratch’s number — in metres, not mischief.</li>',                  '<li>Turn 180° and stride 2 barleycorns south.</li>',                  '<li>Retreat the width of 16 Olympic-sized swimming pools.</li>',                  '<li>Face north and walk a Hungarian mile — you know the drill. Then throw in a furlong just to keep things moving. Add five clean chains (none of that tangled stuff), two poles, a pair of perches, and two good rods for balance. Round it off with a single cable — you’ve earned it.</li>',                  '<li>Turn your back on what lies ahead.</li>',                  '<li>Walk the path once trod by kings and dreams — sans détour, la longueur des Champs-Élysées.</li>',                  '<li>Envisage un isthme où les ombres se taisent et où les horloges n’ont plus de mains.</li>',                  '<li>Marchez la différence entre la hauteur de la Tour Eiffel, and the length of the vessel that bore the Millionaire’s Special.</li>',                  '<li>Strip the glamour from your steps — strut the place Sin calls home.</li>',                  '<li>Recede by one nautical mile.</li>',                  '<li>พาเข้าไปทางทิศใต้เป็นระยะทางหนึ่งไมล์โอซิซ จากนั้นหาทิศขึ้นตอนที่ 1.</li>',                  '<li>Take one Fokker’s measure south — a hundred pilots dream of the sky.</li>',                '</ol>',                '<div class="ww-question">Look down. Which letter do you see?</div>',              '</div>',            '</div>',          '</div>',        '</section>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue06Rail"), {    railId: "wwClue06RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });  WW.bindScrollNudge(mount.querySelector("#wwClue06Shell"), 28, mount);};/* SECTION: CLUE-07 */WW.pages.renderClue07 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue07Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<img class="ww-clue-media" src="/cgi/image/7_-4aS_qnp91AMK9CSVagw5.png?width=1200&quality=80&format=auto" alt="WinterWord Clue 7" loading="lazy" decoding="async">',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwClue07Rail"), {    railId: "wwClue07RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" },      { type: "play-button", visibility: "visible" }    ]  });  rail.bindPlay(function(){    WW.playSharedAudio(      "https://raw.githubusercontent.com/ClueHouse/winterword-assets/main/audio/Anote.mp3",      "wwClue07RailInstance"    );  });};/* SECTION: CLUE-08 */WW.pages.renderClue08 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue08Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<img id="wwClue08Still" class="ww-clue-media" src="/cgi/image/02PNG_3q0D97EI0_zfq4-NlW5H0.png?width=1920&quality=80&format=auto" alt="WinterWord Clue 8">',        '</div>',        '<div id="wwClue08Overlay" class="ww-overlay">',          '<div id="wwClue08Veil" class="ww-screen-veil"></div>',          '<div class="ww-overlay-inner">',            '<video id="wwClue08Answer" class="ww-overlay-media" playsinline preload="metadata">',              '<source src="https://github.com/ClueHouse/winterword-assets/raw/refs/heads/main/videos/01.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue08Rail"), {    railId: "wwClue08RailInstance",    preset: "clue-steel",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwClue08Overlay",    mediaId: "wwClue08Answer",    veilId: "wwClue08Veil",    openClass: "is-open"  });  WW.registerScopedListener(mount, mount.querySelector("#wwClue08Still"), "click", ctl.open);  WW.registerScopedListener(mount, mount.querySelector("#wwClue08Veil"), "click", ctl.close);};/* SECTION: CLUE-09 */WW.pages.renderClue09 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue09Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage">',          '<img class="ww-clue-media" src="/cgi/image/09_PNG_r0bcJQ3AnLnme28vuE28d.png?width=1920&quality=80&format=auto" alt="WinterWord Clue 9" loading="lazy" decoding="async">',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue09Rail"), {    railId: "wwClue09RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });};/* SECTION: CLUE-10 */WW.pages.renderClue10 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue10Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage" style="padding:2vh 1.5vw;">',          '<img class="ww-clue-media" style="width:min(96vw,1800px);max-height:92vh;" src="/cgi/image/3_amwJUz8Tg6qJ5_EV0uHT0.png?width=3840&quality=80&format=auto" alt="WinterWord Clue 10" loading="lazy" decoding="async">',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue10Rail"), {    railId: "wwClue10RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });};/* SECTION: CLUE-11 */WW.pages.renderClue11 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue11Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage" aria-label="Clue stage">',          '<img id="wwClue11Still" class="ww-clue-media ww-no-select" src="/cgi/image/11.3_2sJhksB9XuTGunq6yZzgu.png?width=3840&quality=80&format=auto" alt="WinterWord clue image">',        '</div>',        '<div id="wwClue11Overlay" class="ww-overlay" aria-hidden="true">',          '<div id="wwClue11Veil" class="ww-screen-veil"></div>',          '<div class="ww-overlay-inner" role="dialog" aria-modal="true" aria-label="Answer image">',            '<img id="wwClue11Answer" class="ww-overlay-media ww-no-select" src="/cgi/image/11.3_2sJhksB9XuTGunq6yZzgu.png?width=3840&quality=80&format=auto" alt="WinterWord clue image enlarged">',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue11Rail"), {    railId: "wwClue11RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });  var overlay = mount.querySelector("#wwClue11Overlay");  var still = mount.querySelector("#wwClue11Still");  var veil = mount.querySelector("#wwClue11Veil");  if (!overlay || !still || !veil) return;  function openOverlay(){    overlay.classList.add("is-open");    overlay.setAttribute("aria-hidden", "false");  }  function closeOverlay(event){    if (event && event.target && event.target !== veil && event.target !== overlay) return;    overlay.classList.remove("is-open");    overlay.setAttribute("aria-hidden", "true");  }  var ctl = {    open: openOverlay,    close: closeOverlay,    closeNow: function(){      overlay.classList.remove("is-open");      overlay.setAttribute("aria-hidden", "true");    },    isOpen: function(){      return overlay.classList.contains("is-open");    },    isAlive: function(){      return !!(overlay && overlay.isConnected);    },    destroy: function(){      this.closeNow();      WW.unregisterOverlayController("wwClue11Overlay");    }  };  WW.registerOverlayController("wwClue11Overlay", ctl);  still.addEventListener("click", ctl.open);  veil.addEventListener("click", ctl.close);  WW.registerMountCleanup(mount, function(){    still.removeEventListener("click", ctl.open);    veil.removeEventListener("click", ctl.close);    ctl.destroy();  });};/* SECTION: CLUE-12 */WW.pages.renderClue12 = function(mount){  mount.innerHTML = [    '<div class="ww-clue-wrap">',      '<div id="wwClue12Rail"></div>',      '<main class="ww-clue-main">',        '<div class="ww-clue-stage" aria-label="Clue stage">',          '<img id="wwClue12Still" class="ww-clue-media" src="/cgi/image/12_6zn-ucfLzutHdmo6_xSfY.gif?width=1920&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwClue12Overlay" class="ww-overlay" aria-hidden="true">',          '<div id="wwClue12Veil" class="ww-screen-veil"></div>',          '<div class="ww-overlay-inner" role="dialog" aria-modal="true" aria-label="Answer video">',            '<video id="wwClue12Answer" class="ww-overlay-media" playsinline preload="metadata">',              '<source src="/cgi/asset/10.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  WW.renderRail(mount.querySelector("#wwClue12Rail"), {    railId: "wwClue12RailInstance",    preset: "clue-light",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "text-link", href: "/lifeline", label: "Life" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwClue12Overlay",    mediaId: "wwClue12Answer",    veilId: "wwClue12Veil",    openClass: "is-open"  });  WW.registerScopedListener(mount, mount.querySelector("#wwClue12Still"), "click", ctl.open);  WW.registerScopedListener(mount, mount.querySelector("#wwClue12Veil"), "click", ctl.close);};

WW.pages = WW.pages || {};/* SECTION: ANSWER-01 */WW.pages.renderAnswer01 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer01Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/1_us-8u9aypYAVM2Vz55idN.png?width=1920&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer01Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer01Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/01_(1)_jHwf6L3tPRvFvkhfpCwyj.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer01Rail"), {    railId: "wwAnswer01RailInstance",    preset: "answer-dark",    items: [      { type: "text-link", href: "/base-station", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer01Overlay",    mediaId: "wwAnswer01Video",    requireBackdropId: "wwAnswer01Overlay",    openClass: "open"  });  rail.bindAnswer(ctl.open);};/* SECTION: ANSWER-02 */WW.pages.renderAnswer02 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer02Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/02_PNG_ic_SpIY-VcZyI65Xz97CE.png?width=1920&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer02Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer02Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/02_sJsM1CUQQY2k_12HzUMy2.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer02Rail"), {    railId: "wwAnswer02RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer02Overlay",    mediaId: "wwAnswer02Video",    requireBackdropId: "wwAnswer02Overlay",    openClass: "open"  });  rail.bindAnswer(ctl.open);};/* SECTION: ANSWER-03 */WW.pages.renderAnswer03 = function(mount){  var rail = null;  mount.innerHTML = [    '<input type="checkbox" id="wwAnswer03Reveal">',    '<div class="ww-answer-wrap">',      '<div id="wwAnswer03Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<div class="ww-answer03-image-shell">',            '<img src="/cgi/image/Abandoned_room_with_weathered_furnishings_5rFIb5OK8MVOKys1XaGWU.png?width=1920&quality=80&format=auto" alt="Abandoned room with weathered furnishings">',            '<div class="ww-answer03-image-overlay"></div>',            '<div class="ww-answer03-text">',              '<div class="ww-answer03-stanza">',                '<div class="ww-answer03-line soft">A quiet glass left beside the sink,</div>',                '<div class="ww-answer03-line soft">A bell once sung, now still.</div>',                '<div class="ww-answer03-line soft">A static TV, no one in sight —</div>',                '<div class="ww-answer03-line soft">The silence seems to spill.</div>',              '</div>',              '<div class="ww-answer03-stanza">',                '<div class="ww-answer03-line soft">A jigsaw lies beneath the steps,</div>',                '<div class="ww-answer03-line soft">A box once twice the size.</div>',                '<div class="ww-answer03-line soft">The wooden edge meets flecks of ash,</div>',                '<div class="ww-answer03-line soft">Each piece sits with nested lies.</div>',              '</div>',              '<div class="ww-answer03-stanza">',                '<div class="ww-answer03-line">The toast is sliced. The tea is cold.</div>',                '<div class="ww-answer03-line">The echo fades like stone.</div>',                '<div class="ww-answer03-line">All feels as it did again,</div>',                '<div class="ww-answer03-line final">Yet something’s not at home.</div>',              '</div>',            '</div>',            '<div class="ww-answer03-panel">',              '<div class="ww-answer03-box">',                '<div class="ww-answer03-answerline main">Yet something’s not at home.</div>',                '<div class="ww-answer03-answerline note">Noticeable in its absence.</div>',                '<div class="ww-answer03-ghost">R</div>',              '</div>',            '</div>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer03Rail"), {    railId: "wwAnswer03RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  rail.bindAnswer(function(){    mount.querySelector("#wwAnswer03Reveal").checked = true;    rail.setAnswerDisabled(true);  });};/* SECTION: ANSWER-04 */WW.pages.renderAnswer04 = function(mount){  var rail = null;  var answerOpened = false;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer04Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/04_nWjkOv_74ltI06wAihuB2.png?width=3840&quality=80&format=auto" alt="">',        '</div>',        '<div id="wwAnswer04Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer04Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/04_3kmMXBoQOMhuEhENxgY3G.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer04Rail"), {    railId: "wwAnswer04RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" },      { type: "play-button", visibility: "hidden" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer04Overlay",    mediaId: "wwAnswer04Video",    requireBackdropId: "wwAnswer04Overlay",    openClass: "open"  });  rail.bindAnswer(function(e){    answerOpened = true;    rail.setPlayVisibility("visible");    ctl.open(e);  });  rail.bindPlay(function(e){    e.preventDefault();    e.stopPropagation();    if (!answerOpened) return;    WW.playSharedAudio(      "https://raw.githubusercontent.com/ClueHouse/winterword-assets/main/audio/Romy.mp3",      "wwAnswer04RailInstance"    );  });};/* SECTION: ANSWER-05 */WW.pages.renderAnswer05 = function(mount){  var rail = null;  var answerRevealed = false;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer05Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/05_PNG_UoeyUYEg9hnN87ZYfZWrj.png?width=1920&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer05Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer05Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/05_2d6PAuitCKlhOIW3Bh4H2.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer05Rail"), {    railId: "wwAnswer05RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" },      { type: "play-button", visibility: "visible" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer05Overlay",    mediaId: "wwAnswer05Video",    requireBackdropId: "wwAnswer05Overlay",    openClass: "open"  });  rail.bindAnswer(function(e){    answerRevealed = true;    ctl.open(e);  });  rail.bindPlay(function(e){    e.preventDefault();    e.stopPropagation();    var src = answerRevealed      ? "https://raw.githubusercontent.com/ClueHouse/winterword-assets/main/audio/Mississippi.mp3"      : "https://raw.githubusercontent.com/ClueHouse/winterword-assets/main/audio/Grandpa.mp3";    WW.playSharedAudio(src, "wwAnswer05RailInstance");  });};/* SECTION: ANSWER-06 */WW.pages.renderAnswer06 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer06Rail"></div>',      '<main class="ww-answer-main" style="display:flex;align-items:center;justify-content:center;padding:2.4vh 2.2vw;">',        '<section id="wwAnswer06ClueShell">',          '<div id="wwAnswer06ClueStage">',            '<div class="ww-stage">',              '<div class="ww-bg">',                '<img src="/cgi/image/SIX_kFJB1Gje6EwxPi8SLW6rx.png?width=1200&quality=80&format=auto" alt="">',              '</div>',              '<div class="ww-inner">',                '<div class="ww-poem">',                  '<p>You stand at the southern edge of something measured and unforgiving:</p>',                  '<p>a 10-kilometre path broken only by glyphs and the echoes of whatever came before you.</p>',                  '<p>Faintly beneath your feet, the letter A was once painted — faded now, but the shape is unmistakable. The stroke. The spacing. The intent.</p>',                  '<p>You raise your head slowly, like a compass needle remembering north. You’ve been told that four hundred metres ahead, a little too far for your eyes to confirm, the letter B waits. Same painter? A delinquent’s graffito, maybe? Hard to say — you’ve been lied to before.</p>',                  '<p>Four hundred beyond that lies C. Then D. Then the rest — Alpha to Zulu, running south to north.</p>',                  '<p>The sigh you release is well-worn — like the satchel on your hip. You reach in and pull free the list he said would help.</p>',                  '<p>You squint at the sun, judging daylight like something owed, then gaze down the line. The paper creaks between your fingers as you unfold it.</p>',                  '<p>The list is a mess — a patchwork of pens, pencils, and whatever else was nearby. A dozen hands must’ve had their say. It looks woeful.</p>',                  '<p><em>But it’s all you’ve got.</em></p>',                '</div>',                '<div class="ww-scroll-nudge" aria-hidden="true"><div class="ww-scroll-nudge-caret">˅</div></div>',                '<div class="ww-spacer"></div>',                '<div class="ww-notes">',                  '<ol>',                    '<li>Move north the length of Old Scratch’s number — in metres, not mischief.</li>',                    '<li>Turn 180° and stride 2 barleycorns south.</li>',                    '<li>Retreat the width of 16 Olympic-sized swimming pools.</li>',                    '<li>Face north and walk a Hungarian mile — you know the drill. Then throw in a furlong just to keep things moving. Add five clean chains (none of that tangled stuff), two poles, a pair of perches, and two good rods for balance. Round it off with a single cable — you’ve earned it.</li>',                    '<li>Turn your back on what lies ahead.</li>',                    '<li>Walk the path once trod by kings and dreams — sans détour, la longueur des Champs-Élysées.</li>',                    '<li>Envisage un isthme où les ombres se taisent et où les horloges n’ont plus de mains.</li>',                    '<li>Marchez la différence entre la hauteur de la Tour Eiffel, and the length of the vessel that bore the Millionaire’s Special.</li>',                    '<li>Strip the glamour from your steps — strut the place Sin calls home.</li>',                    '<li>Recede by one nautical mile.</li>',                    '<li>พาเข้าไปทางทิศใต้เป็นระยะทางหนึ่งไมล์โอซิซ จากนั้นหาทิศขึ้นตอนที่ 1.</li>',                    '<li>Take one Fokker’s measure south — a hundred pilots dream of the sky.</li>',                  '</ol>',                  '<div class="ww-question">Look down. Which letter do you see?</div>',                '</div>',              '</div>',            '</div>',          '</div>',        '</section>',        '<div id="wwAnswer06Panel">',          '<div class="ww-answer06-inner">',            '<div class="ww-answer06-copy">',              '<p>You trace the first line with a fingertip: “Old Scratch’s number,” it says. You pause, wondering what kind of game you’ve stepped into. You’ve heard that number whispered in firelit stories, and at the end of two bad dreams. Still, you walk the first six hundred and sixty-six metres, counting each one as if sin had weight.</p>',              '<p class="break">_</p>',              '<p>The next line catches you off guard: “Two barleycorns.” You shake off Beelzebub and swivel the 180. Your boots shift forward a hair — barleycorns, barely enough to matter. A symbolic motion, a nod to forgotten systems. The path doesn’t notice, but you do.</p>',              '<p class="break">_</p>',              '<p>Then: “The width of sixteen Olympic pools.” One pool you remember clearly — cold tiles, echoing ceilings, the bite of chlorine. Multiply it. Four hundred metres. You breathe deliberately, counting your steps with care as the satchel bounces at your side.</p>',              '<p class="break">_</p>',              '<p>You pull out paper and begin to write: direction, distance, doubt. If you ever need to retrace this path, you’ll have <a href="#" class="ww-answer06-map-link" id="wwAnswer06MapLink">your own map</a> — one written by your own boots, not memory.</p>',              '<p class="break">_</p>',              '<p>You face the place maps begin. The lines that follow are a mess of measures: margins crammed with chains, rods, perches, scribbled and struck through. It starts with a Hungarian mile. You pause, trying to place it, until a line from an old atlas surfaces: „Egy magyar mérföld 8 353 méternek felel meg.” You nod and begin walking. The math tightens with each step, landing cleanly at 8,870 metres. You walk it as something unseen shifts in the grass.</p>',              '<p class="break">_</p>',              '<p>The next line says only: “Turn your back.” So you do. No walking — just facing the opposite direction. Sometimes that’s all it takes to unsettle a soul.</p>',              '<p class="break">_</p>',              '<p>Then, scrawled in black ink: “La longueur des Champs-Élysées.” You mutter it aloud, clueless for a moment, until a memory hits — a quiz night years back. Paris. A famous street from the Arc to the obelisk. Someone on your team shouted it right before last call. 1.91 kilometres. That stuck. You start walking with memories of pint glasses and cigarette smoke, but soon the avenue forms in your mind — kings, protests, parades. The pavement beneath you seems to remember silk and ceremony. You walk it, ghosts of grandeur falling in beside you.</p>',              '<p class="break">_</p>',              '<p>The isthmus line offers nothing measurable. No numbers, no arrows, just stillness. This part isn’t about motion; it’s about not filling space. So you don’t. And in that quiet, something surfaces — not from the list, but from before: a soft Sunday, roasted barley tea warm in their hand, the back door closing gently behind them, no footsteps after. Some distances aren’t measured in metres. Some are felt in what’s no longer there. Some distances are where you were left.</p>',              '<p class="break">_</p>',              '<p>Next comes a calculation: the Eiffel Tower minus the Titanic. Steel and iron, tower and ship. You weigh the distance in thought and settle at sixty-one. You walk that difference like a challenge answered in your chest.</p>',              '<p class="break">_</p>',              '<p>Then: “Strip the glamour from your steps — and strut where Sin made its bed.” Vegas. The Strip. You know it instantly. Quinn once told you it was the same distance from their front door to the only coffee worth drinking. “Not good coffee — decent,” they’d said, stretching in the sheets, voice rough in that way that didn’t care whether it was morning or night. You didn’t believe them, but one foggy Wednesday, with the city yawning grey and Quinn’s shape ghosting your pillow, you walked it. And yes — 6.8 km. Infuriatingly accurate. Quinn always wore truth like a luxury scent — not for attention, just because it clung. Expensive, intoxicating, a little dangerous. Their bed was all texture: creased linen, warm skin, everything unsaid. “We’ve never been good at half-measures, have we,” they’d murmured. You didn’t answer. Your mouth was busy. Now you walk The Strip again, and Quinn is going to haunt every step.</p>',              '<p class="break">_</p>',              '<p>A new line: “A nautical mile.” Not the kind sung by drunks in harbour towns — the kind measured twice before dawn because there are souls aboard. One minute of latitude. 1,852 metres. Due north. You’ve crossed water before. It has no bottom you can trust.</p>',              '<p>You rub your eyes. The horizon’s slipped behind a purple haze, and the light’s taken on that tired gold that means the day’s nearly done. Your feet ache. Your brain has switched to autopilot. And then, as if summoned by the gods of exhaustion themselves, the clue stares up at you in Thai.</p>',              '<p>You blink. Then blink again. It’s not even the beautiful, sweeping kind you saw printed on brochures or glossy signs in Bangkok. No, this is scribbled. Crooked. The kind of handwriting that feels like it knows it’s cleverer than you. You mutter something unrepeatable.</p>',              '<p>Your mind scrapes back to that seventeen-hour train ride, the one with the small boy who refused to stop talking even as night swallowed half the country. He taught you the Thai alphabet — kind of. At least enough to say your name and order beverages in the food cart. You smiled politely then, not knowing you’d need it now. That memory clatters into place like the last screw on a rusted hinge.</p>',              '<p>You squint at the clue again. No spaces between words — you try to remember what the boy said about that, something about “Thai doesn’t pause for you.” He laughed like it was funny. It isn’t. It’s a noodle bowl of curves and coils and dancing tone marks. And the song. That damn song: “Gor Gài… chicken! Khor Khài… egg!” You repeat the chant like a prayer, mouth dry and slow.</p>',              '<p>And then… clarity. Sort of.</p>',              '<p>You murmur the translation under your breath, piecing it together like a half-remembered dream: An Irish mile, minus Old Scratch again. You pause. That name — twice now. Not flair. A pattern. You do the math anyway: 2,048 minus 666. That gives you 1,382 metres. But it doesn’t feel like a calculation; it feels like a warning.</p>',              '<p>Your eyes drift back to where you passed the letter H — where the grass shifted. Not wind. Something watching, or waiting. Just for a moment. Then gone.</p>',              '<p>You try to shake it. You follow the logic, not because it makes sense, but because arguing with paper gets you nowhere. The wind tugs at your collar, as if it remembers what stirred even if you pretend not to.</p>',              '<p class="break">_</p>',              '<p>The final line reads: “Take one Fokker’s measure south — a hundred pilots dream of this sky.” You smile for the first time in hours. You know the plane: Fokker 100. You owned one once — won it on a bet you had no business making, offering up a deed, a promise, and one favour you still haven’t repaid. You look up. Thirty-five metres and change. You round up and walk thirty-six. Then you stop. Exactly 1,600 metres from where you began. Four glyphs behind. The fifth one stares up at you. And still, your mind drifts back to the letter H — where the grass shifted, where something unseen pressed close. You don’t know why it lingers, but somehow you feel that whatever this whole thing is… it started there.</p>',            '</div>',          '</div>',        '</div>',      '</main>',    '</div>',    '<div id="wwAnswer06MapModal" aria-hidden="true">',      '<div class="ww-answer06-map-card" role="dialog" aria-modal="true" aria-labelledby="wwAnswer06MapTitle">',        '<button class="ww-answer06-map-close" type="button" aria-label="Close map" id="wwAnswer06MapClose">×</button>',        '<div class="ww-answer06-map-head">',          '<h2 class="ww-answer06-map-title" id="wwAnswer06MapTitle">Field Notes</h2>',        '</div>',        '<div class="ww-answer06-map-steps">',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">i.</p><p class="ww-answer06-map-step-line">Move north the length of Old Scratch’s number — in metres, not mischief.</p><p class="ww-answer06-map-step-jot">North — 666 m. So far: 666 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">ii.</p><p class="ww-answer06-map-step-line">Turn 180° and stride 2 barleycorns south.</p><p class="ww-answer06-map-step-jot">South, barely anything. Still sitting at 666 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">iii.</p><p class="ww-answer06-map-step-line">Retreat the width of 16 Olympic-sized swimming pools.</p><p class="ww-answer06-map-step-jot">South again — 400 m. Subtotal: 1,066 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">iv.</p><p class="ww-answer06-map-step-line">Face north and walk a Hungarian mile — you know the drill. Then throw in a furlong just to keep things moving. Add five clean chains (none of that tangled stuff), two poles, a pair of perches, and two good rods for balance. Round it off with a single cable — you’ve earned it.</p><p class="ww-answer06-map-step-jot">Back north for 8,871 m. Running total = 9,937 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">v.</p><p class="ww-answer06-map-step-line">Turn your back on what lies ahead.</p><p class="ww-answer06-map-step-jot">Facing south now. No movement. Still 9,937 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">vi.</p><p class="ww-answer06-map-step-line">Walk the path once trod by kings and dreams — sans détour, la longueur des Champs-Élysées.</p><p class="ww-answer06-map-step-jot">South for 1,910 m. Leaves 8,027 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">vii.</p><p class="ww-answer06-map-step-line">Envisage un isthme où les ombres se taisent et où les horloges n’ont plus de mains.</p><p class="ww-answer06-map-step-jot">Held there. No distance. Total unchanged: 8,027 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">viii.</p><p class="ww-answer06-map-step-line">Marchez la différence entre la hauteur de la Tour Eiffel, and the length of the vessel that bore the Millionaire’s Special.</p><p class="ww-answer06-map-step-jot">Another 61 m south. So far: 7,966 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">ix.</p><p class="ww-answer06-map-step-line">Strip the glamour from your steps — strut the place Sin calls home.</p><p class="ww-answer06-map-step-jot">Long push south — 6,800 m. Leaves me at 1,166 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">x.</p><p class="ww-answer06-map-step-line">Recede by one nautical mile.</p><p class="ww-answer06-map-step-jot">North this time, 1,852 m. New subtotal: 3,018 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">xi.</p><p class="ww-answer06-map-step-line">พาเข้าไปทางทิศใต้เป็นระยะทางหนึ่งไมล์โอซิซ จากนั้นหาทิศขึ้นตอนที่ 1.</p><p class="ww-answer06-map-step-jot">South once more — 1,382 m. Running total = 1,636 m.</p></div>',          '<div class="ww-answer06-map-step"><p class="ww-answer06-map-step-title">xii.</p><p class="ww-answer06-map-step-line">Take one Fokker’s measure south — a hundred pilots dream of the sky.</p><p class="ww-answer06-map-step-jot">Last little move south: 36 m. Ends at 1,600 m.</p></div>',        '</div>',      '</div>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer06Rail"), {    railId: "wwAnswer06RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues", active: true },      { type: "answer-button", label: "Answer" }    ]  });  rail.bindAnswer(function(){    WW.revealAnswerPanel({    scopeRoot: mount,      fadeElId: "wwAnswer06ClueStage",      answerPanelId: "wwAnswer06Panel",      hideElId: "wwAnswer06ClueShell",      fadeClass: "fadeout",      showClass: "fadein",      delay: 2000,      displayValue: "block"    });  });  WW.bindScrollNudge(mount.querySelector("#wwAnswer06ClueStage"), 28, mount);  var mapModal = mount.querySelector("#wwAnswer06MapModal");  var mapLink = mount.querySelector("#wwAnswer06MapLink");  var mapClose = mount.querySelector("#wwAnswer06MapClose");  var doc = WW.resolveDoc(mount);  var body = WW.getBody(mount);  function openMapModal(e){    if (e) e.preventDefault();    mapModal.classList.add("is-open");    mapModal.setAttribute("aria-hidden", "false");    if (body) body.classList.add("ww-lock");  }  function closeMapModal(){    mapModal.classList.remove("is-open");    mapModal.setAttribute("aria-hidden", "true");    if (body) body.classList.remove("ww-lock");  }  function handleMapModalClick(e){    if (e.target === mapModal) closeMapModal();  }  function handleMapModalKeydown(e){    if (e.key === "Escape") closeMapModal();  }  mapLink.addEventListener("click", openMapModal);  mapClose.addEventListener("click", closeMapModal);  mapModal.addEventListener("click", handleMapModalClick);  WW.registerScopedListener(mount, doc, "keydown", handleMapModalKeydown);  WW.registerMountCleanup(mount, function(){    mapLink.removeEventListener("click", openMapModal);    mapClose.removeEventListener("click", closeMapModal);    mapModal.removeEventListener("click", handleMapModalClick);    closeMapModal();  });};/* SECTION: ANSWER-07 */WW.pages.renderAnswer07 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer07Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/7_-4aS_qnp91AMK9CSVagw5.png?width=1200&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer07Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer07Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/7__5h6IJ0NKxUAoB5kB8RY3.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer07Rail"), {    railId: "wwAnswer07RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" },      { type: "play-button", visibility: "visible" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer07Overlay",    mediaId: "wwAnswer07Video",    requireBackdropId: "wwAnswer07Overlay",    openClass: "open"  });  rail.bindAnswer(ctl.open);  rail.bindPlay(function(e){    e.preventDefault();    e.stopPropagation();    WW.playSharedAudio(      "https://raw.githubusercontent.com/ClueHouse/winterword-assets/main/audio/Anote.mp3",      "wwAnswer07RailInstance"    );  });};/* SECTION: ANSWER-08 */WW.pages.renderAnswer08 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer08Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/02PNG_3q0D97EI0_zfq4-NlW5H0.png?width=1920&quality=80&format=auto" alt="">',        '</div>',        '<div id="wwAnswer08Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer08Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/08_2gY_zmeJlYRB3WwnKQA-5.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer08Rail"), {    railId: "wwAnswer08RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer08Overlay",    mediaId: "wwAnswer08Video",    requireBackdropId: "wwAnswer08Overlay",    openClass: "open"  });  rail.bindAnswer(ctl.open);};/* SECTION: ANSWER-09 */WW.pages.renderAnswer09 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer09Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/09_PNG_r0bcJQ3AnLnme28vuE28d.png?width=1920&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer09Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer09Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/09_S9xINo3eHfhYpubS3otgk.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer09Rail"), {    railId: "wwAnswer09RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer09Overlay",    mediaId: "wwAnswer09Video",    requireBackdropId: "wwAnswer09Overlay",    openClass: "open"  });  rail.bindAnswer(ctl.open);};/* SECTION: ANSWER-10 */WW.pages.renderAnswer10 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer10Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/10_PNG_Cay6PrXYKCuxZ-yY276TH.png?width=1920&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer10Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer10Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/10_FKUVPIcN4KAxoEb59Dd7T.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer10Rail"), {    railId: "wwAnswer10RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer10Overlay",    mediaId: "wwAnswer10Video",    requireBackdropId: "wwAnswer10Overlay",    openClass: "open"  });  rail.bindAnswer(ctl.open);};/* SECTION: ANSWER-11 */WW.pages.renderAnswer11 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer11Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/11.3_2sJhksB9XuTGunq6yZzgu.png?width=3840&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer11Overlay">',          '<div id="wwAnswer11OverlayVeil"></div>',          '<div id="wwAnswer11OverlayInner">',            '<video id="wwAnswer11Video" playsinline preload="auto">',              '<source src="/cgi/asset/Invite_P4xkzaBmOKaRa9riO0LZk.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer11Rail"), {    railId: "wwAnswer11RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer11Overlay",    mediaId: "wwAnswer11Video",    requireBackdropId: "wwAnswer11Overlay",    openClass: "open",    showClass: "show-video",    blackoutDelay: 1400,    mediaDelay: 1800  });  rail.bindAnswer(ctl.open);};/* SECTION: ANSWER-12 */WW.pages.renderAnswer12 = function(mount){  var rail = null;  mount.innerHTML = [    '<div class="ww-answer-wrap">',      '<div id="wwAnswer12Rail"></div>',      '<main class="ww-answer-main">',        '<div class="ww-answer-stage">',          '<img class="ww-answer-clue-media" src="/cgi/image/12GIF_eE5_yExm3Me-T18lkXNUX.gif?width=1920&quality=80&format=auto" alt="Clue image">',        '</div>',        '<div id="wwAnswer12Overlay" class="ww-answer-overlay">',          '<div class="ww-answer-overlay-inner">',            '<video id="wwAnswer12Video" class="ww-answer-overlay-media ww-answer-video" playsinline muted preload="auto">',              '<source src="/cgi/asset/12_KUUh2fhofX_-SIT1ELqzY.mp4" type="video/mp4">',            '</video>',          '</div>',        '</div>',      '</main>',    '</div>'  ].join("");  rail = WW.renderRail(mount.querySelector("#wwAnswer12Rail"), {    railId: "wwAnswer12RailInstance",    preset: "answer-light",    items: [      { type: "text-link", href: "/base-resolve", label: "Base" },      { type: "text-link", href: "/clue-list", label: "Clues" },      { type: "answer-button", label: "Answer" }    ]  });  var ctl = WW.createVideoOverlayController({    scopeRoot: mount,    overlayId: "wwAnswer12Overlay",    mediaId: "wwAnswer12Video",    requireBackdropId: "wwAnswer12Overlay",    openClass: "open"  });  rail.bindAnswer(ctl.open);};/* SECTION: ROUTER / PAGE ENTRY */WW.mountPage = async function(pageName, mountSelector){
  var mount = null;
  if (typeof mountSelector === "string"){
    mount = WW.state.root ? WW.state.root.querySelector(mountSelector) : null;
  } else {
    mount = mountSelector;
  }
  if (!mount) return;
  WW.runMountCleanup(mount);
  mount.innerHTML = "";
  if (!WW.pages[pageName]){
    return;
  }
  try{
    await WW.pages[pageName](mount);
  }catch(error){
    if (typeof console !== "undefined" && console && typeof console.error === "function"){ console.error("WW mountPage failed for", pageName, error); }
    mount.innerHTML = "";
  }
};

WW.init = function(root){
  var host = root && root.nodeType === 1 ? root : (typeof document !== "undefined" ? document.body : null);
  if (!host) return null;
  if (WW.state.appInstance && WW.state.appInstance.host === host){
    return WW.state.appInstance;
  }
  if (WW.state.appInstance && typeof WW.state.appInstance.destroy === "function"){
    WW.state.appInstance.destroy();
  }
  WW.state.root = host;
  var doc = WW.resolveDoc(host);
  if (!doc){
    return null;
  }
  var pageName = "renderWelcome";
  var mount = host.querySelector("[data-ww-app-root]");
  if (!mount){
    mount = doc.createElement("div");
    mount.setAttribute("data-ww-app-root", "");
    host.appendChild(mount);
  }
  WW.bindOverlayEscape(mount);

  var handleInternalLinkClick = function(event){
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;
    var anchor = target.closest("a[href]");
    if (!anchor || !mount.contains(anchor)) return;
    if (anchor.hasAttribute("download") || (anchor.getAttribute("target") || "") === "_blank") return;
    var rawHref = anchor.getAttribute("href") || "";
    if (!rawHref || rawHref.indexOf("#") === 0 || /^(mailto:|tel:|javascript:|https?:)/i.test(rawHref)) return;
    var page = WW.routeToPageName(rawHref);
    if (!page) return;
    event.preventDefault();
    WW.navigate(host, rawHref);
  };
  WW.registerScopedListener(mount, doc, "click", handleInternalLinkClick);

  var observer = null;
  if (typeof MutationObserver === "function"){
    observer = new MutationObserver(function(){
      if (!doc.documentElement || !doc.documentElement.contains(mount)){
        WW.runMountCleanup(mount);
        observer.disconnect();
        if (WW.state.appInstance && WW.state.appInstance.mount === mount){
          WW.state.appInstance = null;
        }
        if (WW.state.root === host){
          WW.state.root = null;
        }
      }
    });
    if (doc.documentElement){
      observer.observe(doc.documentElement, { childList:true, subtree:true });
    }
    WW.registerMountCleanup(mount, function(){
      observer.disconnect();
    });
  }

  var instance = {
    host: host,
    mount: mount,
    destroy: function(){
      WW.runMountCleanup(mount);
      if (WW.state.mediaAudio){
        WW.stopAudio(WW.state.mediaAudio);
        WW.state.mediaAudio = null;
      }
      if (mount.parentNode) mount.parentNode.removeChild(mount);
      if (WW.state.appInstance === instance){
        WW.state.appInstance = null;
      }
      if (WW.state.root === host){
        WW.state.root = null;
      }
    }
  };
  WW.state.appInstance = instance;
  WW.state.currentPageName = pageName;
  WW.state.currentPagePath = "/";
  WW.mountPage(pageName, mount);
  return instance;
};
(function(){
  function start(){
    if (WW.state.appInstance) return;
    WW.init(typeof document !== "undefined" ? document.body : null);
  }
  if (typeof document === "undefined"){
    return;
  }
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", start, { once:true });
  } else {
    start();
  }
})();
