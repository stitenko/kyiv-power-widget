// Variables used by Scriptable.
// These must be at the top of the file. Don't edit.
// icon-color: deep-blue; icon-glyph: bolt;

// Kyiv Power Widget
// Power outage schedule and actual electricity status for Kyiv.
// Supports Small and Medium iPhone widgets.
//
// Parameter: queue|telegram_channel|address[|bezsvitla_link]
// Example: 18.1|Svitlobot_Romodanova6_29|Ромоданова 6/29
// Without SvitloBot: 18.1|-|Ромоданова 6/29

const PREVIEW_PARAMETER =
  "18.1|Svitlobot_Romodanova6_29|Ромоданова 6/29";

const PREVIEW_FAMILY = "medium"; // "small" to preview the small layout.

const TIME_ZONE = "Europe/Kyiv";

const SCHEDULE_URL =
  "https://raw.githubusercontent.com/Baskerville42/outage-data-ua/main/data/kyiv.json";

const REFRESH_MINUTES = 10;
const MAX_EVENT_AGE_HOURS = 48;
const MAX_EVENT_AGE_MS = MAX_EVENT_AGE_HOURS * 3600000;

// ---------- Configuration ----------

const rawParameter =
  typeof args.widgetParameter === "string"
    ? args.widgetParameter.trim()
    : "";

const parameter = rawParameter ||
  (!config.runsInWidget ? PREVIEW_PARAMETER : "");

const settings = parseSettings(parameter);

const QUEUE = settings.queue || "";
const HOME = settings.home || "";

const LIVE_URL = settings.channel
  ? "https://t.me/s/" + settings.channel
  : null;

const COLORS = {
  on: "#30d158",
  off: "#ff453a",
  maybe: "#ff9f0a",
  technical: "#ff9f0a",
  unknown: "#515158"
};

const BAR_OFF = "#85858b";
const BAR_EMPTY = "#333338";

const now = new Date();
const kyiv = getKyivTime(now);

const IS_SMALL =
  (config.widgetFamily || PREVIEW_FAMILY) === "small";

// One size for both status rows, so they always match.
const STATUS_FONT = 11;
const DOT_SIZE = IS_SMALL ? 7 : 9;

let plan = null;
let actual = null;

// ---------- Load data ----------

if (settings.valid) {
  const [scheduleRaw, telegramRaw] = await Promise.all([
    loadText(SCHEDULE_URL, "schedule", isScheduleBody, true),
    LIVE_URL
      ? loadText(
          LIVE_URL,
          "tg-" + settings.channel.toLowerCase(),
          isTelegramBody,
          false
        )
      : Promise.resolve(null)
  ]);

  if (scheduleRaw) {
    try {
      plan = parseSchedule(scheduleRaw, kyiv.date, QUEUE);
      if (!plan) console.log("Schedule: no data for " + kyiv.date);
    } catch (error) {
      console.log("Schedule error: " + String(error));
    }
  }

  if (telegramRaw) {
    try {
      actual = parseTelegram(telegramRaw, now, kyiv);
      if (!actual) console.log("Telegram: no matching events");
    } catch (error) {
      console.log("Telegram error: " + String(error));
    }
  }
}

// ---------- Current status ----------

const planState = plan
  ? statusAt(plan.intervals, kyiv.minutes)
  : "unknown";

const latest = actual ? actual.latest : null;

const isFresh = Boolean(
  latest && now.getTime() - latest.postedAt <= MAX_EVENT_AGE_MS
);

const liveState = isFresh ? latest.status : "unknown";

// ---------- Widget setup ----------

const widget = new ListWidget();
widget.backgroundColor = new Color("#1c1c1e");

// Zero padding keeps the bottom banner edge-to-edge.
widget.setPadding(0, 0, 0, 0);

// Open the outage schedule when the widget is tapped.
if (settings.valid) {
  widget.url = settings.link ||
    "https://bezsvitla.com.ua/kyiv/cherha-" + QUEUE.replace(".", "-");
}

// ---------- Main content ----------

const content = widget.addStack();
content.layoutVertically();
content.setPadding(8, IS_SMALL ? 10 : 12, 0, IS_SMALL ? 10 : 12);

if (!settings.valid) {

  // ---------- Setup instructions ----------

  const title = addLabel(content, "⚡ Налаштуй віджет",
    Font.boldSystemFont(IS_SMALL ? 12 : 15), "#ffffff");
  title.lineLimit = 1;

  content.addSpacer(5);

  const hint = addLabel(content,
    "Затисни віджет → Змінити віджет → Parameter",
    Font.systemFont(IS_SMALL ? 8 : 9), "#b3b3b8");
  hint.lineLimit = IS_SMALL ? 3 : 2;

  content.addSpacer(4);

  const reason = addLabel(content, settings.error,
    Font.systemFont(IS_SMALL ? 8 : 9), "#ff9f0a");
  reason.lineLimit = 2;

  content.addSpacer(3);

  addLabel(content, "черга|канал|адреса",
    Font.systemFont(IS_SMALL ? 8 : 9), "#8e8e93");

} else {

  // ---------- Header ----------

  const header = content.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  header.spacing = 4;

  const homeText = addLabel(header, "⚡ " + HOME,
    Font.boldSystemFont(IS_SMALL ? 16 : 19), "#ffffff");
  homeText.lineLimit = 1;
  homeText.minimumScaleFactor = 0.65;

  header.addSpacer();

  const queueText = addLabel(header, "Черга " + QUEUE,
    Font.systemFont(IS_SMALL ? 8 : 9), "#b0b0b5");
  queueText.lineLimit = 1;

  content.addSpacer(IS_SMALL ? 2 : 3);

  // ---------- Planned status ----------

  addStatusRow(content,
    "ЗА ГРАФІКОМ: " + planStatusText(planState),
    planState, STATUS_FONT, DOT_SIZE);

  content.addSpacer(IS_SMALL ? 1 : 2);

  const chartWidth = IS_SMALL ? 128 : 300;

  const planChart = drawStrip(plan ? plan.intervals : null,
    kyiv.minutes, chartWidth, IS_SMALL, !LIVE_URL);
  addChartImage(content, planChart, chartWidth);

  if (LIVE_URL) {

    content.addSpacer(IS_SMALL ? 1 : 3);

    // ---------- Actual status ----------

    const actualRow = content.addStack();
    actualRow.layoutHorizontally();
    actualRow.centerAlignContent();
    actualRow.spacing = IS_SMALL ? 3 : 4;

    addDot(actualRow, liveState, DOT_SIZE);

    const stateText = addLabel(actualRow,
      "ФАКТИЧНО: " + actualStatusText(liveState),
      Font.mediumSystemFont(STATUS_FONT), "#e5e5ea");
    stateText.lineLimit = 1;
    stateText.minimumScaleFactor = IS_SMALL ? 0.63 : 0.72;

    // ---------- Latest event ----------

    const eventText = latest
      ? "(Остання подія: " +
        formatDate(latest.date, !IS_SMALL) + " " +
        formatMinutes(latest.minutes) + ")"
      : "(Подій немає)";

    if (!IS_SMALL) {
      // Medium: show the event on the same line.
      const event = addLabel(actualRow, eventText,
        Font.systemFont(12), "#b3b3b8");
      event.lineLimit = 1;
      event.minimumScaleFactor = 0.6;
    } else {
      // Small: show the event on a separate line.
      const smallEvent = addLabel(content, eventText,
        Font.systemFont(12), "#b3b3b8");
      smallEvent.lineLimit = 1;
      smallEvent.minimumScaleFactor = 0.73;
    }

    content.addSpacer(IS_SMALL ? 1 : 2);

    // ---------- Actual timeline ----------

    const actualChart = drawStrip(actual ? actual.intervals : null,
      kyiv.minutes, chartWidth, IS_SMALL, true);
    addChartImage(content, actualChart, chartWidth);

  } else {

    content.addSpacer(3);

    addLabel(content, "Фактичний стан не налаштовано",
      Font.systemFont(IS_SMALL ? 8 : 9), "#8e8e93");
  }
}

// ---------- Bottom status banner ----------

// Fixed height, edge-to-edge, anchored to the bottom.
widget.addSpacer();

const footer = widget.addStack();
footer.layoutHorizontally();
footer.centerAlignContent();
footer.size = new Size(0, 30);
footer.backgroundColor = new Color(colorFor(liveState));
footer.setPadding(0, 0, 0, 0);
footer.addSpacer();

const FOOTER_TEXT = {
  on: "СВІТЛО Є",
  off: "СВІТЛА НЕМАЄ",
  technical: "ТЕХПЕРЕРВА"
};

const footerLabel = !settings.valid
  ? "НАЛАШТУЙ ВІДЖЕТ"
  : (LIVE_URL && FOOTER_TEXT[liveState]) || "СТАН НЕВІДОМИЙ";

const footerText = addLabel(footer, footerLabel,
  Font.boldSystemFont(IS_SMALL ? 12 : 14), "#ffffff");
footerText.centerAlignText();
footerText.lineLimit = 1;

footer.addSpacer();

// ---------- Automatic refresh ----------

widget.refreshAfterDate = new Date(
  now.getTime() + REFRESH_MINUTES * 60000
);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (IS_SMALL) {
  await widget.presentSmall();
} else {
  await widget.presentMedium();
}

Script.complete();

// ---------- UI helpers ----------

function addDot(stack, state, diameter) {
  const dot = stack.addStack();
  dot.size = new Size(diameter, diameter);
  dot.cornerRadius = diameter / 2;
  dot.backgroundColor = new Color(colorFor(state));
  return dot;
}

function addStatusRow(target, text, state, fontSize, dotSize) {
  const row = target.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.spacing = 4;

  addDot(row, state, dotSize);

  const label = addLabel(row, text,
    Font.mediumSystemFont(fontSize), "#e5e5ea");
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.75;

  return row;
}

function planStatusText(state) {
  return ({
    on: "Світло є",
    off: "Світла немає",
    maybe: "Можливе відключення",
    unknown: "Немає даних"
  })[state] || "Немає даних";
}

function actualStatusText(state) {
  return ({
    on: "Світло є",
    off: "Світла немає",
    technical: "Техперерва",
    unknown: "Стан невідомий"
  })[state] || "Стан невідомий";
}

function addChartImage(target, image, width) {
  const graphic = target.addImage(image);
  graphic.imageSize = new Size(width, image.size.height);
  graphic.resizable = true;
  return graphic;
}

function addLabel(target, value, font, color) {
  const label = target.addText(value);
  label.font = font;
  label.textColor = new Color(color);
  return label;
}

function colorFor(status) {
  return COLORS[status] || COLORS.unknown;
}

// ---------- Parameter settings ----------

function parseSettings(raw) {
  if (!raw) {
    return { valid: false, error: "Parameter ще не заданий." };
  }

  const fields = raw.split("|").map(value => value.trim());

  if (fields.length !== 3 && fields.length !== 4) {
    return {
      valid: false,
      error: "Вкажіть 3 поля через | (4-те, посилання, необов'язкове)."
    };
  }

  const queue = fields[0];
  const channelInput = fields[1];
  const home = fields[2];
  const link = fields[3] || null;

  if (!/^(?:[1-9]|[1-5]\d|60)\.[12]$/.test(queue)) {
    return { valid: false, error: "Некоректна черга. Приклад: 18.1" };
  }

  if (!home || home.length > 48) {
    return { valid: false, error: "Вкажіть адресу (до 48 символів)." };
  }

  let channel = null;

  if (channelInput && channelInput !== "-") {
    const match = channelInput.match(
      /^(?:@|https:\/\/t\.me\/(?:s\/)?)?([a-z0-9_]{5,32})\/?$/i
    );

    if (!match) {
      return {
        valid: false,
        error: "Некоректний Telegram-канал. Вкажіть username або -."
      };
    }

    channel = match[1];
  }

  if (
    link &&
    !/^https:\/\/bezsvitla\.com\.ua\/kyiv\/[a-z0-9\-\/_%?=&.]+$/i.test(link)
  ) {
    return {
      valid: false,
      error: "Посилання повинно бути на bezsvitla.com.ua/kyiv/."
    };
  }

  return { valid: true, queue, channel, home, link };
}

// ---------- Network requests + cache ----------

// Network first; the last good copy on disk is the fallback.
// A response is cached only if it looks valid, so an error page
// never overwrites good data. With useEtag, an unchanged file is
// not downloaded again (the server answers 304 Not Modified).
async function loadText(url, cacheKey, isValid, useEtag) {
  const fm = FileManager.local();
  const base = fm.joinPath(
    fm.libraryDirectory(),
    "kyiv-power-" + cacheKey
  );
  const path = base + ".cache";
  const etagPath = base + ".etag";

  let hasCache = false;
  try {
    hasCache = fm.fileExists(path);
  } catch (error) {
    hasCache = false;
  }

  try {
    const request = new Request(url);
    request.timeoutInterval = 15;

    if (useEtag && hasCache && fm.fileExists(etagPath)) {
      request.headers = { "If-None-Match": fm.readString(etagPath) };
    }

    const body = await request.loadString();
    const status = request.response
      ? request.response.statusCode
      : 200;

    if (status === 304 && hasCache) {
      return fm.readString(path);
    }

    if (status !== 200) throw new Error("HTTP " + status);

    if (!body || typeof body !== "string" || !isValid(body)) {
      throw new Error("Unexpected content");
    }

    try {
      fm.writeString(path, body);

      const etag = useEtag
        ? headerValue(request.response, "etag")
        : null;

      if (etag) fm.writeString(etagPath, etag);
      else if (fm.fileExists(etagPath)) fm.remove(etagPath);
    } catch (error) {
      console.log("Cache write " + cacheKey + ": " + String(error));
    }

    return body;

  } catch (error) {
    console.log("Fetch " + cacheKey + ": " + String(error));

    try {
      if (hasCache) {
        console.log("Using cached " + cacheKey);
        return fm.readString(path);
      }
    } catch (readError) {
      console.log("Cache read " + cacheKey + ": " + String(readError));
    }

    return null;
  }
}

function headerValue(response, name) {
  const headers = response && response.headers;
  if (!headers) return null;

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) return String(headers[key]);
  }

  return null;
}

function isScheduleBody(body) {
  try {
    const json = JSON.parse(body);
    return Boolean(json && json.regionId === "kyiv" && json.fact);
  } catch (error) {
    return false;
  }
}

function isTelegramBody(body) {
  return body.indexOf("tgme_widget_message_wrap") !== -1;
}

// ---------- Planned schedule ----------

function parseSchedule(raw, expectedDate, queue) {
  const json = JSON.parse(raw);

  if (!json || json.regionId !== "kyiv" || !json.fact || !json.fact.data) {
    return null;
  }

  const days = json.fact.data;
  const primaryKey = String(json.fact.today || "");
  const keys = [primaryKey].concat(
    Object.keys(days).filter(key => key !== primaryKey)
  );

  let hours = null;

  for (const key of keys) {
    const seconds = Number(key);

    if (!Number.isFinite(seconds) || seconds <= 0 || !days[key]) continue;
    if (getKyivTime(new Date(seconds * 1000)).date !== expectedDate) continue;

    hours = days[key]["GPV" + queue];
    if (hours) break;
  }

  if (!hours) return null;

  // Hourly schedule codes become half-hour states.
  const types = {
    yes: ["on", "on"],
    no: ["off", "off"],
    maybe: ["maybe", "maybe"],
    first: ["off", "on"],
    second: ["on", "off"],
    mfirst: ["maybe", "on"],
    msecond: ["on", "maybe"]
  };

  const intervals = [];

  for (let hour = 1; hour <= 24; hour++) {
    const halves = types[hours[String(hour)]];
    if (!halves) return null;

    for (let half = 0; half < 2; half++) {
      const start = (hour - 1) * 60 + half * 30;
      appendInterval(intervals, start, start + 30, halves[half]);
    }
  }

  return isFullDay(intervals) ? { intervals } : null;
}

// ---------- Actual events from Telegram ----------

function parseTelegram(html, referenceTime, today) {
  if (typeof html !== "string") return null;

  const blocks = html.split("tgme_widget_message_wrap");
  const events = [];
  const refMs = referenceTime.getTime();

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    const stamp = block.match(/<time\b[^>]*datetime="([^"]+)"/i);

    // Prefer the post's own text; a reply's quote uses js-message_reply_text.
    const content =
      block.match(
        /class="tgme_widget_message_text[^"]*\bjs-message_text\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      ) ||
      block.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);

    if (!stamp || !content) continue;

    const posted = new Date(stamp[1]);
    const postedAt = posted.getTime();

    if (!Number.isFinite(postedAt) || postedAt > refMs) continue;

    const intro = htmlToText(content[1]).slice(0, 350);

    let status = null;

    if (/світло\s+з['’ʼ]явилося/i.test(intro)) {
      status = "on";
    } else if (/світло\s+зникло/i.test(intro)) {
      status = "off";
    } else if (
      /канал зупинено на технічну перерву|систему світлобот деактивовано/i.test(intro)
    ) {
      status = "technical";
    }

    if (!status) continue;

    const local = getKyivTime(posted);

    const timeMatch = intro.match(
      /\b(\d{1,2}:[0-5]\d)\s*Світло\s+(?:зникло|з['’ʼ]явилося)/i
    );

    const explicitMinutes = timeMatch ? parseMinutes(timeMatch[1]) : null;
    const minutes = explicitMinutes === null ? local.minutes : explicitMinutes;

    let date = local.date;

    // An explicit time far later than the post time belongs to yesterday
    // (event just before midnight, posted just after).
    if (explicitMinutes !== null && explicitMinutes > local.minutes + 600) {
      date = getKyivTime(new Date(postedAt - 86400000)).date;
    }

    events.push({ date, minutes, status, postedAt });
  }

  if (!events.length) return null;

  events.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.minutes - b.minutes ||
    a.postedAt - b.postedAt
  );

  const recent = events.filter(e =>
    e.date < today.date ||
    (e.date === today.date && e.minutes <= today.minutes)
  );

  if (!recent.length) return null;

  const isFreshEvent = e => refMs - e.postedAt <= MAX_EVENT_AGE_MS;

  const latest = recent[recent.length - 1];
  const previous = recent.filter(e => e.date < today.date);
  const before = previous.length ? previous[previous.length - 1] : null;

  let status = before && isFreshEvent(before) ? before.status : "unknown";
  let cursor = 0;
  const intervals = [];

  for (const event of recent.filter(e => e.date === today.date)) {
    appendInterval(intervals, cursor, event.minutes, status);
    cursor = event.minutes;
    status = event.status;
  }

  appendInterval(intervals, cursor, today.minutes,
    isFreshEvent(latest) ? status : "unknown");

  return { latest, intervals };
}

// ---------- Interval helpers ----------

function appendInterval(list, start, end, status) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start >= end) {
    return;
  }

  const last = list.length ? list[list.length - 1] : null;

  if (last && last.end === start && last.status === status) {
    last.end = end;
  } else {
    list.push({ start, end, status });
  }
}

function isFullDay(intervals) {
  if (!intervals.length) return false;

  let end = 0;

  for (const part of intervals) {
    if (part.start !== end || part.end <= end || part.end > 1440) {
      return false;
    }
    end = part.end;
  }

  return end === 1440;
}

function statusAt(intervals, minute) {
  for (const part of intervals) {
    if (part.start <= minute && minute < part.end) return part.status;
  }
  return "unknown";
}

// ---------- HTML processing ----------

function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>|<\/p\s*>|<\/div\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi,
      (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g,
      (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .trim();
}

// ---------- Date and time ----------

function getKyivTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return {
    date: values.year + "-" + values.month + "-" + values.day,
    minutes: Number(values.hour) * 60 + Number(values.minute)
  };
}

function parseMinutes(value) {
  if (!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value)) return null;

  const parts = value.split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function formatMinutes(minutes) {
  return ("0" + Math.floor(minutes / 60)).slice(-2) + ":" +
    ("0" + minutes % 60).slice(-2);
}

// withYear: "11.11.2026"; without: "11.11".
function formatDate(date, withYear) {
  const parts = date.split("-");
  return parts[2] + "." + parts[1] + (withYear ? "." + parts[0] : "");
}

// ---------- Timeline rendering ----------

// Green: power on.
// Gray: power off.
// Orange: possible outage.
// Dark gray: unknown state.
// White vertical line: current time.

function drawStrip(intervals, minute, width, small, showAxis) {
  const c = new DrawContext();

  const barHeight = small ? 10 : 12;
  const barY = small ? 1 : 2;
  const axisY = small ? 14 : 17;

  const scale = Device.screenScale();
  const snap = value => Math.round(value * scale) / scale;

  c.size = new Size(
    width,
    showAxis ? (small ? 29 : 34) : (small ? 13 : 16)
  );
  c.opaque = false;
  c.respectScreenScale = true;

  // ---------- Timeline background ----------

  c.setFillColor(new Color(BAR_EMPTY));
  c.fillRect(new Rect(0, barY, width, barHeight));

  // ---------- Timeline intervals ----------

  if (intervals) {
    for (const part of intervals) {
      if (part.end <= part.start) continue;

      const color =
        part.status === "on" ? COLORS.on :
        part.status === "off" ? BAR_OFF :
        part.status === "maybe" ? COLORS.maybe :
        null;

      if (!color) continue;

      const x0 = snap(part.start / 1440 * width);
      const x1 = snap(part.end / 1440 * width);
      if (x1 <= x0) continue;

      c.setFillColor(new Color(color));
      c.fillRect(new Rect(x0, barY, x1 - x0, barHeight));
    }
  }

  // ---------- Current time marker ----------

  // Sticks out by barY above and below the bar.
  if (Number.isInteger(minute) && minute >= 0 && minute < 1440) {
    const marker = Math.max(0,
      Math.min(width - 2, minute / 1440 * width - 1));

    c.setFillColor(Color.white());
    c.fillRect(new Rect(marker, 0, 2, barY * 2 + barHeight));
  }

  // ---------- Time axis ----------

  if (showAxis) {
    c.setFillColor(new Color("#515158"));
    c.fillRect(new Rect(0, axisY, width, 1));

    const labelWidth = 16;

    // Small: ticks every two hours. Medium: every hour.
    for (let hour = 0; hour <= 24; hour += small ? 2 : 1) {
      const x = Math.min(width - 1, Math.round(hour / 24 * width));
      const major = hour % (small ? 12 : 4) === 0;

      c.setFillColor(new Color(major ? "#a1a1a6" : "#68686e"));
      c.fillRect(new Rect(x, axisY, 1, major ? 5 : 3));
    }

    // ---------- Time labels ----------

    c.setFont(Font.systemFont(small ? 7 : 8));
    c.setTextColor(new Color("#b3b3b8"));

    const hours = small ? [0, 12, 24] : [0, 4, 8, 12, 16, 20, 24];

    // Keep "00" and "24" close to the chart edges.
    const edgeInset = 1;

    for (const hour of hours) {
      const x = hour / 24 * width;

      const labelX =
        hour === 0 ? edgeInset :
        hour === 24 ? width - labelWidth - edgeInset :
        x - labelWidth / 2;

      // Align the glyphs, not only their rectangles.
      if (hour === 0) c.setTextAlignedLeft();
      else if (hour === 24) c.setTextAlignedRight();
      else c.setTextAlignedCenter();

      c.drawTextInRect(
        String(hour).padStart(2, "0"),
        new Rect(labelX, axisY + (small ? 5 : 6), labelWidth, small ? 9 : 10)
      );
    }

    c.setTextAlignedLeft();
  }

  return c.getImage();
}