if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "parse-html") return false;
    try {
      sendResponse(parsePage(message.html, message.finalUrl, message.requestedUrl));
    } catch {
      sendResponse({ needsLogin: false, items: [] });
    }
    return false;
  });
}

function parsePage(html, finalUrl, requestedUrl) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const final = new URL(finalUrl);
  const requested = new URL(requestedUrl);
  const loginPath = /(?:^|\/)(?:login|signin|sso|auth)(?:\/|\.|$)/i.test(final.pathname);
  const hasPassword = Boolean(document.querySelector('input[type="password"]'));
  const leftExpectedOrigin = final.origin !== requested.origin;
  const needsLogin = loginPath || hasPassword || leftExpectedOrigin;
  if (needsLogin) return { needsLogin: true, items: [] };

  const scope = findAssignmentScope(document, requested);
  const candidates = collectCandidates(scope);
  const items = [];
  const seen = new Set();

  for (const element of candidates) {
    const item = extractItem(element, final);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }

  return { needsLogin: false, items: items.slice(0, 100) };
}

function findAssignmentScope(document, requestedUrl) {
  const sectionId = decodeURIComponent(requestedUrl.hash.slice(1));
  if (sectionId) {
    const escaped = CSS.escape(sectionId);
    const byId = document.querySelector(`#${escaped}`);
    if (byId) return byId;

    const number = sectionId.match(/^section-(\d+)$/i)?.[1];
    if (number) {
      const byNumber = document.querySelector(
        `[data-sectionid="${number}"], [data-section-number="${number}"], [data-number="${number}"]`,
      );
      if (byNumber) return byNumber;
    }
  }

  const sections = [...document.querySelectorAll(
    "li.section, section, .course-section, [data-for=section], [data-sectionid]",
  )];
  const namedAssignment = sections.find((section) => {
    const heading = section.querySelector(
      "h2, h3, h4, .sectionname, .section-title, [data-for=section_title]",
    );
    return /^(?:作业|课程作业|homework|assignments?)$/i.test(compact(heading?.textContent));
  });
  return namedAssignment || document;
}

function collectCandidates(scope) {
  const selectors = [
    "li.activity.modtype_assign",
    ".activity.modtype_assign",
    "[data-activityname][class*=assign]",
    ".assignment",
    "[class*=homework]",
    "a[href*=\"/mod/assign/\"]",
    "a[href*=\"assignment\"]",
  ];
  let nodes = [...scope.querySelectorAll(selectors.join(","))];

  // Some Moodle themes remove the modtype_assign class. When the selected
  // section itself is named “作业”, each activity row in it is an assignment
  // candidate even if the theme only exposes a generic activity class.
  if (!nodes.length && scope.nodeType === Node.ELEMENT_NODE) {
    nodes = [...scope.querySelectorAll(
      "li.activity, .activity-item, [data-for=cmitem], .course-content-item",
    )];
  }

  return nodes.map((node) => {
    if (node.matches("a")) return node.closest("li, article, .activity, .course-item") || node;
    return node;
  });
}

function extractItem(element, baseUrl) {
  const link = element.matches("a[href]")
    ? element
    : element.querySelector('a[href*="/mod/assign/"], a[href*="assignment"], a[href]');
  const titleElement = element.querySelector(".activityname, .instancename, .activity-title, h2, h3, h4") || link;
  const title = compact(titleElement?.textContent || element.getAttribute("data-activityname") || "");
  if (!title || title.length < 2) return null;

  const url = link?.getAttribute("href") ? new URL(link.getAttribute("href"), baseUrl).href : baseUrl.href;
  const text = compact(element.textContent || "");
  const dueText = findDueText(text);
  const details = compact(text.replace(title, "")).slice(0, 1000);
  const stableSource = `${url}|${title}`.toLocaleLowerCase();
  return {
    id: hash(stableSource),
    title: title.slice(0, 180),
    details,
    dueText,
    url,
  };
}

function findDueText(text) {
  const patterns = [
    /(?:截止(?:日期|时间)?|到期(?:日期|时间)?|due(?: date)?)[：:\s]*([^。；;|]{3,60})/i,
    /(\d{4}[年\/-]\d{1,2}[月\/-]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2})?)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return compact(match[1] || match[0]).slice(0, 80);
  }
  return "";
}

function compact(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hash(value) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}
