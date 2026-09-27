const DEFAULT_SETTINGS = {
  intervalMinutes: 30,
  privacyMode: true,
  recordEnabled: false,
  recordMode: "details",
  helperEnabled: false,
};

const ALARM_NAME = "check-assignment";
const LEGACY_ALARM_NAME = "check-homework";
const OFFSCREEN_URL = "offscreen.html";
const NATIVE_HOST = "com.local.assignment_reminder";

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["settings", "courses", "history"]);
  const courses = (current.courses || []).map((course) => {
    const sanitized = { ...course };
    delete sanitized.lastItems;
    return sanitized;
  });
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...(current.settings || {}) },
    courses,
    history: current.history || [],
  });
  await resetAlarm();
});

chrome.runtime.onStartup.addListener(resetAlarm);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) checkAllCourses({ manual: false });
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  const { notificationTargets = {} } = await chrome.storage.session.get("notificationTargets");
  const target = notificationTargets[notificationId];
  if (target) await chrome.tabs.create({ url: target });
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // This message is handled exclusively by offscreen.js. Ignoring it here
  // avoids two extension contexts racing to answer the same request.
  if (message.type === "parse-html") return false;

  const run = async () => {
    switch (message.type) {
      case "get-state":
        return getState();
      case "save-settings":
        await saveSettings(message.settings);
        return getState();
      case "add-course":
        await addCourse(message.course);
        return getState();
      case "remove-course":
        await removeCourse(message.id);
        return getState();
      case "clear-history":
        await chrome.storage.local.set({ history: [] });
        return getState();
      case "test-helper":
        return testHelper();
      case "check-all":
        return checkAllCourses({ manual: true });
      case "open-url":
        await chrome.tabs.create({ url: message.url });
        return { ok: true };
      default:
        throw new Error("未知操作");
    }
  };

  run().then(sendResponse).catch((error) => sendResponse({
    ok: false,
    error: safeError(error),
  }));
  return true;
});

async function getState() {
  const data = await chrome.storage.local.get(["settings", "courses", "history", "lastRun", "helperStatus"]);
  return {
    ok: true,
    settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
    courses: data.courses || [],
    history: data.history || [],
    lastRun: data.lastRun || null,
    helperStatus: data.helperStatus || null,
  };
}

async function saveSettings(next) {
  const settings = {
    intervalMinutes: clamp(Number(next.intervalMinutes) || 30, 5, 1440),
    privacyMode: next.privacyMode !== false,
    recordEnabled: next.recordEnabled === true,
    recordMode: next.recordMode === "link" ? "link" : "details",
    helperEnabled: next.recordEnabled === true && next.helperEnabled === true,
  };
  const { courses = [] } = await chrome.storage.local.get("courses");
  const sanitizedCourses = courses.map((course) => {
    const sanitized = { ...course };
    delete sanitized.lastItems;
    return sanitized;
  });
  await chrome.storage.local.set({ settings, courses: sanitizedCourses });
  await resetAlarm(settings.intervalMinutes);
}

async function resetAlarm(intervalMinutes) {
  if (!intervalMinutes) {
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
    intervalMinutes = Number(settings.intervalMinutes) || DEFAULT_SETTINGS.intervalMinutes;
  }
  await chrome.alarms.clear(LEGACY_ALARM_NAME);
  await chrome.alarms.clear(ALARM_NAME);
  chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 1,
    periodInMinutes: clamp(intervalMinutes, 5, 1440),
  });
}

async function addCourse(input) {
  const url = normalizeUrl(input.url);
  const { courses = [] } = await chrome.storage.local.get("courses");
  if (courses.some((course) => course.url === url)) throw new Error("该课程页面已经添加");

  courses.push({
    id: crypto.randomUUID(),
    name: cleanText(input.name) || `课程 ${courses.length + 1}`,
    url,
    enabled: true,
    knownIds: [],
    initialized: false,
    status: "等待首次检查",
    lastCheckedAt: null,
  });
  await chrome.storage.local.set({ courses });
}

async function removeCourse(id) {
  const { courses = [], history = [] } = await chrome.storage.local.get(["courses", "history"]);
  const removed = courses.find((course) => course.id === id);
  const remaining = courses.filter((course) => course.id !== id);
  await chrome.storage.local.set({
    courses: remaining,
    history: history.filter((item) => item.courseId !== id),
  });

  if (removed) {
    const origin = new URL(removed.url).origin;
    const stillUsed = remaining.some((course) => new URL(course.url).origin === origin);
    if (!stillUsed) await chrome.permissions.remove({ origins: [`${origin}/*`] });
  }
}

async function checkAllCourses({ manual }) {
  const state = await getState();
  const courses = state.courses;
  const results = [];

  for (const course of courses) {
    if (!course.enabled) continue;
    results.push(await checkCourse(course, state.settings, { manual }));
  }

  await chrome.storage.local.set({ courses, lastRun: new Date().toISOString() });
  return { ok: true, results, state: await getState() };
}

async function checkCourse(course, settings, { manual }) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(course.url, {
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      headers: { "Accept": "text/html,application/xhtml+xml" },
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) throw new Error(`页面返回 ${response.status}`);
    if (!contentType.includes("text/html")) throw new Error("课程地址没有返回网页");

    const html = await response.text();
    const parsed = await parseCoursePage(html, response.url, course.url);

    if (parsed.needsLogin) {
      course.status = "需要登录";
      course.lastCheckedAt = checkedAt;
      delete course.lastItems;
      if (!manual) await notifyLogin(course, settings);
      return { courseId: course.id, ok: false, needsLogin: true };
    }

    const known = new Set(course.knownIds || []);
    const newItems = course.initialized ? parsed.items.filter((item) => !known.has(item.id)) : [];
    course.knownIds = [...new Set([...known, ...parsed.items.map((item) => item.id)])].slice(-500);
    course.initialized = true;
    course.status = parsed.items.length ? `找到 ${parsed.items.length} 项` : "未找到作业项";
    course.lastCheckedAt = checkedAt;
    // Keep only hashes needed for change detection on the course object. Titles,
    // due text and assignment URLs are persisted only after explicit opt-in.
    delete course.lastItems;

    if (newItems.length) {
      if (settings.recordEnabled) await addHistory(course, newItems, settings.recordMode);
      if (settings.recordEnabled && settings.helperEnabled) {
        await exportWithHelper(course, newItems, settings.recordMode);
      }
      await notifyNewItems(course, newItems, settings);
    }
    return { courseId: course.id, ok: true, count: parsed.items.length, newCount: newItems.length };
  } catch (error) {
    course.status = `检查失败：${safeError(error)}`;
    course.lastCheckedAt = checkedAt;
    return { courseId: course.id, ok: false, error: safeError(error) };
  }
}

async function ensureOffscreen() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_URL);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl],
  });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["DOM_PARSER"],
    justification: "在本机解析已登录课程页面中的作业条目",
  });
}

async function parseCoursePage(html, finalUrl, requestedUrl) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({
    type: "parse-html",
    html,
    finalUrl,
    requestedUrl,
  });
}

async function addHistory(course, items, recordMode) {
  const { history = [] } = await chrome.storage.local.get("history");
  const createdAt = new Date().toISOString();
  const additions = items.map((item) => recordMode === "link"
    ? {
        id: item.id,
        url: item.url,
        courseId: course.id,
        recordMode: "link",
        detectedAt: createdAt,
      }
    : {
        ...item,
        courseId: course.id,
        courseName: course.name,
        recordMode: "details",
        detectedAt: createdAt,
      });
  await chrome.storage.local.set({ history: [...additions, ...history].slice(0, 100) });
}

async function exportWithHelper(course, items, recordMode) {
  const detectedAt = new Date().toISOString();
  const payloadItems = items.map((item) => recordMode === "link"
    ? { url: item.url }
    : {
        courseName: course.name,
        title: item.title,
        details: item.details,
        dueText: item.dueText,
        url: item.url,
      });

  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, {
      type: "save-assignment",
      recordMode,
      detectedAt,
      items: payloadItems,
    });
    if (!response?.ok) throw new Error(response?.error || "辅助程序未返回成功状态");
    await chrome.storage.local.set({
      helperStatus: {
        ok: true,
        message: `已导出 ${response.savedCount || payloadItems.length} 项到 assignment 文件夹`,
        checkedAt: detectedAt,
      },
    });
  } catch (error) {
    await chrome.storage.local.set({
      helperStatus: {
        ok: false,
        message: `导出失败：${safeError(error)}。请运行 helper/install.ps1`,
        checkedAt: detectedAt,
      },
    });
  }
}

async function testHelper() {
  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, { type: "ping" });
    if (!response?.ok) throw new Error(response?.error || "辅助程序未返回成功状态");
    const helperStatus = {
      ok: true,
      message: "辅助程序已连接，文件将保存到项目 assignment 文件夹",
      checkedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ helperStatus });
    return { ok: true, helperStatus, outputDirectory: response.outputDirectory };
  } catch (error) {
    const helperStatus = {
      ok: false,
      message: `无法连接辅助程序：${safeError(error)}。请运行 helper/install.ps1`,
      checkedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ helperStatus });
    return { ok: false, error: helperStatus.message, helperStatus };
  }
}

async function notifyNewItems(course, items, settings) {
  const privateMode = settings.privacyMode !== false;
  const id = `assignment-${Date.now()}-${course.id}`;
  const message = privateMode
    ? "课程页面有更新。打开扩展查看详情。"
    : items.length === 1
      ? `${course.name}：${items[0].title}`
      : `${course.name}：发现 ${items.length} 项新作业`;

  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "发现新作业",
    message,
    priority: 2,
  });
  await rememberNotificationTarget(id, items[0]?.url || course.url);
}

async function notifyLogin(course, settings) {
  const id = `login-${Date.now()}-${course.id}`;
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "作业检查需要登录",
    message: settings.privacyMode === false ? `${course.name} 的登录状态已失效` : "请打开课程网站重新登录。",
  });
  await rememberNotificationTarget(id, course.url);
}

async function rememberNotificationTarget(id, url) {
  const { notificationTargets = {} } = await chrome.storage.session.get("notificationTargets");
  notificationTargets[id] = url;
  const entries = Object.entries(notificationTargets).slice(-30);
  await chrome.storage.session.set({ notificationTargets: Object.fromEntries(entries) });
}

function normalizeUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || "").trim());
  } catch {
    throw new Error("请输入完整的课程页面地址");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("只支持 http 或 https 地址");
  return parsed.href;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function safeError(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/https?:\/\/\S+/gi, "[课程地址]").slice(0, 160);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
