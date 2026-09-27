const elements = {
  form: document.querySelector("#course-form"),
  name: document.querySelector("#course-name"),
  url: document.querySelector("#course-url"),
  courses: document.querySelector("#courses"),
  history: document.querySelector("#history"),
  interval: document.querySelector("#interval"),
  privacy: document.querySelector("#privacy-mode"),
  recordEnabled: document.querySelector("#record-enabled"),
  recordMode: document.querySelector("#record-mode"),
  helperEnabled: document.querySelector("#helper-enabled"),
  testHelper: document.querySelector("#test-helper"),
  helperStatus: document.querySelector("#helper-status"),
  clearHistory: document.querySelector("#clear-history"),
  check: document.querySelector("#check-now"),
  lastRun: document.querySelector("#last-run"),
  message: document.querySelector("#message"),
};

init();

async function init() {
  bindEvents();
  await refresh();
}

function bindEvents() {
  elements.form.addEventListener("submit", addCourse);
  elements.check.addEventListener("click", checkNow);
  elements.interval.addEventListener("change", saveSettings);
  elements.privacy.addEventListener("change", saveSettings);
  elements.recordEnabled.addEventListener("change", toggleRecording);
  elements.recordMode.addEventListener("change", saveSettings);
  elements.helperEnabled.addEventListener("change", toggleHelper);
  elements.testHelper.addEventListener("click", testHelper);
  elements.clearHistory.addEventListener("click", clearHistory);
  elements.courses.addEventListener("click", handleCourseAction);
  elements.history.addEventListener("click", handleOpenLink);
}

async function addCourse(event) {
  event.preventDefault();
  clearMessage();
  let parsed;
  try {
    parsed = new URL(elements.url.value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return showMessage("请输入以 http:// 或 https:// 开头的完整地址", true);
  }

  const originPattern = `${parsed.origin}/*`;
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) return showMessage("没有网站访问权限，课程未添加", true);

  const result = await send({
    type: "add-course",
    course: { name: elements.name.value, url: parsed.href },
  });
  if (!result.ok) return showMessage(result.error, true);
  elements.form.reset();
  render(result);
  showMessage("课程已添加。首次检查会建立基线，不会把旧作业当成新作业。", false);
}

async function checkNow() {
  setBusy(true);
  clearMessage();
  const result = await send({ type: "check-all" });
  setBusy(false);
  if (!result.ok) return showMessage(result.error, true);
  render(result.state);
  const newCount = result.results.reduce((sum, item) => sum + (item.newCount || 0), 0);
  showMessage(newCount ? `发现 ${newCount} 项新作业` : "检查完成，没有发现新作业", false);
}

async function saveSettings() {
  const result = await send({
    type: "save-settings",
    settings: {
      intervalMinutes: Number(elements.interval.value),
      privacyMode: elements.privacy.checked,
      recordEnabled: elements.recordEnabled.checked,
      recordMode: elements.recordMode.value,
      helperEnabled: elements.helperEnabled.checked,
    },
  });
  if (result.ok) render(result);
}

async function toggleRecording() {
  if (!elements.recordEnabled.checked && elements.helperEnabled.checked) {
    elements.helperEnabled.checked = false;
    await chrome.permissions.remove({ permissions: ["nativeMessaging"] });
  }
  await saveSettings();
}

async function toggleHelper() {
  clearMessage();
  if (elements.helperEnabled.checked) {
    const granted = await chrome.permissions.request({ permissions: ["nativeMessaging"] });
    if (!granted) {
      elements.helperEnabled.checked = false;
      return showMessage("未获得本地辅助程序通信权限", true);
    }
    elements.recordEnabled.checked = true;
  } else {
    await chrome.permissions.remove({ permissions: ["nativeMessaging"] });
  }
  await saveSettings();
  if (elements.helperEnabled.checked) await testHelper();
}

async function testHelper() {
  elements.testHelper.disabled = true;
  const result = await send({ type: "test-helper" });
  elements.testHelper.disabled = false;
  if (!result.ok) {
    elements.helperStatus.textContent = result.helperStatus?.message || result.error;
    elements.helperStatus.className = "helper-error";
    return;
  }
  elements.helperStatus.textContent = result.helperStatus.message;
  elements.helperStatus.className = "helper-ok";
}

async function clearHistory() {
  if (!window.confirm("确定清空全部本地作业记录吗？课程配置不会被删除。")) return;
  const result = await send({ type: "clear-history" });
  if (!result.ok) return showMessage(result.error, true);
  render(result);
  showMessage("本地作业记录已清空", false);
}

async function handleCourseAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const course = button.closest("[data-course]");
  if (button.dataset.action === "remove") {
    const result = await send({ type: "remove-course", id: course.dataset.course });
    if (result.ok) render(result);
  }
  if (button.dataset.action === "open") {
    await send({ type: "open-url", url: button.dataset.url });
  }
}

async function handleOpenLink(event) {
  const button = event.target.closest("button[data-url]");
  if (button) await send({ type: "open-url", url: button.dataset.url });
}

async function refresh() {
  const result = await send({ type: "get-state" });
  if (result.ok) render(result);
  else showMessage(result.error, true);
}

function render(state) {
  elements.interval.value = String(state.settings.intervalMinutes);
  elements.privacy.checked = state.settings.privacyMode;
  elements.recordEnabled.checked = state.settings.recordEnabled;
  elements.recordMode.value = state.settings.recordMode;
  elements.recordMode.disabled = !state.settings.recordEnabled;
  elements.helperEnabled.checked = state.settings.helperEnabled;
  elements.helperEnabled.disabled = !state.settings.recordEnabled;
  elements.testHelper.disabled = !state.settings.helperEnabled;
  elements.helperStatus.textContent = state.helperStatus?.message || "尚未连接辅助程序";
  elements.helperStatus.className = state.helperStatus?.ok === true
    ? "helper-ok"
    : state.helperStatus?.ok === false ? "helper-error" : "";
  elements.lastRun.textContent = state.lastRun ? `上次：${formatTime(state.lastRun)}` : "尚未检查";
  renderCourses(state.courses);
  renderHistory(state.history);
}

function renderCourses(courses) {
  if (!courses.length) {
    elements.courses.className = "empty";
    elements.courses.textContent = "还没有课程";
    return;
  }
  elements.courses.className = "course-list";
  elements.courses.replaceChildren(...courses.map((course) => {
    const row = document.createElement("article");
    row.className = "course";
    row.dataset.course = course.id;

    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = course.name;
    const status = document.createElement("small");
    status.textContent = course.lastCheckedAt ? `${course.status} · ${formatTime(course.lastCheckedAt)}` : course.status;
    info.append(title, status);

    const buttons = document.createElement("div");
    buttons.className = "course-buttons";
    buttons.append(
      actionButton("打开", "open", course.url),
      actionButton("删除", "remove"),
    );
    row.append(info, buttons);
    return row;
  }));
}

function renderHistory(history) {
  if (!history.length) {
    elements.history.className = "empty";
    elements.history.textContent = "还没有新作业记录";
    return;
  }
  elements.history.className = "history-list";
  elements.history.replaceChildren(...history.slice(0, 20).map((item) => {
    const row = document.createElement("button");
    row.className = "history-item";
    row.dataset.url = item.url;
    const title = document.createElement("strong");
    title.textContent = item.recordMode === "link" ? "新作业网址" : (item.title || "新作业");
    const meta = document.createElement("small");
    meta.textContent = item.recordMode === "link"
      ? `${item.url} · ${formatTime(item.detectedAt)}`
      : `${item.courseName || "课程"}${item.dueText ? ` · ${item.dueText}` : ""} · ${formatTime(item.detectedAt)}`;
    row.append(title);
    if (item.recordMode !== "link" && item.details) {
      const details = document.createElement("span");
      details.className = "history-details";
      details.textContent = item.details;
      row.append(details);
    }
    row.append(meta);
    return row;
  }));
}

function actionButton(label, action, url) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.action = action;
  if (url) button.dataset.url = url;
  return button;
}

function setBusy(busy) {
  elements.check.disabled = busy;
  elements.check.textContent = busy ? "检查中…" : "立即检查";
}

function showMessage(text, isError) {
  elements.message.textContent = text;
  elements.message.className = isError ? "error" : "success";
}

function clearMessage() {
  elements.message.textContent = "";
  elements.message.className = "";
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function send(message) {
  return chrome.runtime.sendMessage(message);
}
