const START_DATE = "2026-03-11";
const END_DATE = "2026-04-30";
const DAY_MS = 24 * 60 * 60 * 1000;
const SPACING = 53;
const LEFT_PADDING = 30;
const CAPSULE_HEIGHT = 30;
const LANE_GAP = 12;
const CAPSULE_GAP_FROM_AXIS = 40;
const CAPSULE_MIN_WIDTH = 50;
const AXIS_VERTICAL_OFFSET = 5;
const CAPSULE_EDGE_EXTRA = 6;
const STORAGE_KEY = "vacation_timeline_entries_v1";

const state = {
  days: [],
  entries: [],
  drag: null,
  selectedEntryId: null,
  laneCount: 1,
};

const timelineBoard = document.getElementById("timelineBoard");
const axisLine = document.getElementById("axisLine");
const dotsRow = document.getElementById("dotsRow");
const labelsRow = document.getElementById("labelsRow");
const timelineAxis = document.getElementById("timelineAxis");
const capsulesLayer = document.getElementById("capsulesLayer");
const selectionLayer = document.getElementById("selectionLayer");
const noteTitleInput = document.getElementById("noteTitleInput");
const noteInput = document.getElementById("noteInput");
const exportBtn = document.getElementById("exportBtn");
const importInput = document.getElementById("importInput");
const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
const clearBtn = document.getElementById("clearBtn");
const colorPicker = document.getElementById("colorPicker");
const durationControls = document.getElementById("durationControls");
const durationMinusBtn = document.getElementById("durationMinusBtn");
const durationPlusBtn = document.getElementById("durationPlusBtn");
const durationValue = document.getElementById("durationValue");
const colorSwatches = Array.from(document.querySelectorAll(".color-swatch"));
const CAPSULE_COLORS = colorSwatches.map((swatch) => swatch.dataset.color).filter(Boolean);
const DEFAULT_CAPSULE_COLOR = CAPSULE_COLORS[0] || "#ef4444";
colorSwatches.forEach((swatch) => {
  swatch.style.setProperty("--swatch-color", swatch.dataset.color);
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseISODate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDateRange(startISO, endISO) {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  const days = [];
  for (let current = new Date(start); current <= end; current = new Date(current.getTime() + DAY_MS)) {
    days.push(new Date(current));
  }
  return days;
}

function formatShort(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatLong(iso) {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function dayX(index) {
  return LEFT_PADDING + index * SPACING;
}

function capsuleTopForLane(lane) {
  const axisTop = timelineAxis.offsetTop;
  return axisTop - CAPSULE_GAP_FROM_AXIS - lane * (CAPSULE_HEIGHT + LANE_GAP);
}

function entryIndices(entry) {
  const start = state.days.findIndex((d) => d.iso === entry.startDate);
  const end = state.days.findIndex((d) => d.iso === entry.endDate);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function durationDays(entry) {
  const { start, end } = entryIndices(entry);
  return end - start + 1;
}

function applyEntryRangeFromStartAndDuration(entry, startIndex, dayCount) {
  const clampedDuration = clamp(dayCount, 1, state.days.length);
  const maxStart = state.days.length - clampedDuration;
  const clampedStart = clamp(startIndex, 0, Math.max(0, maxStart));
  const clampedEnd = clampedStart + clampedDuration - 1;
  entry.startDate = state.days[clampedStart].iso;
  entry.endDate = state.days[clampedEnd].iso;
}

function updateDurationControls(entry) {
  if (!entry) {
    durationValue.textContent = "0 days";
    durationMinusBtn.disabled = true;
    durationPlusBtn.disabled = true;
    durationControls.classList.add("hidden");
    return;
  }

  const days = durationDays(entry);
  durationValue.textContent = `${days} day${days === 1 ? "" : "s"}`;
  durationMinusBtn.disabled = days <= 1;
  durationPlusBtn.disabled = entryIndices(entry).end >= state.days.length - 1;
  durationControls.classList.remove("hidden");
}

function allocateLanes(entries) {
  const sorted = entries
    .map((entry) => ({ entry, ...entryIndices(entry) }))
    .filter((item) => item.start >= 0 && item.end >= 0)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnds = [];
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end < item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    item.entry.lane = lane;
  }
  state.laneCount = Math.max(1, laneEnds.length);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
}

function findEntry(entryId) {
  return state.entries.find((entry) => entry.id === entryId) || null;
}

function normalizeCapsuleColor(color) {
  return CAPSULE_COLORS.includes(color) ? color : DEFAULT_CAPSULE_COLOR;
}

function syncColorPicker(selectedColor) {
  const activeColor = normalizeCapsuleColor(selectedColor);
  colorSwatches.forEach((swatch) => {
    swatch.style.setProperty("--swatch-color", swatch.dataset.color);
    swatch.classList.toggle("active", swatch.dataset.color === activeColor);
  });
}

function autoSizeNoteInput() {
  noteInput.style.height = "auto";
  noteInput.style.height = `${noteInput.scrollHeight}px`;
}

function setNotePanel(entryId) {
  const entry = findEntry(entryId);
  if (!entry) {
    noteTitleInput.value = "";
    noteInput.value = "";
    noteTitleInput.disabled = true;
    noteInput.disabled = true;
    colorSwatches.forEach((swatch) => {
      swatch.disabled = true;
      swatch.classList.remove("active");
    });
    autoSizeNoteInput();
    updateDurationControls(null);
    return;
  }

  noteTitleInput.disabled = false;
  noteInput.disabled = false;
  colorSwatches.forEach((swatch) => {
    swatch.disabled = false;
  });
  noteTitleInput.value = entry.title || "";
  noteInput.value = entry.note || "";
  syncColorPicker(entry.color);
  autoSizeNoteInput();
  updateDurationControls(entry);
}

function syncSelectionUI() {
  deleteSelectedBtn.classList.toggle("hidden", !state.selectedEntryId);
  const capsules = capsulesLayer.querySelectorAll(".entry-capsule");
  capsules.forEach((el) => {
    el.classList.toggle("selected", el.dataset.entryId === state.selectedEntryId);
  });
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    state.entries = parsed
      .filter((item) => item && item.startDate && item.endDate)
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        startDate: item.startDate,
        endDate: item.endDate,
        title: typeof item.title === "string" ? item.title : (typeof item.text === "string" ? item.text : ""),
        note: typeof item.note === "string" ? item.note : "",
        color: normalizeCapsuleColor(item.color),
        lane: 0,
      }));
  } catch (error) {
    console.error("Failed to load saved timeline entries", error);
  }
}

function renderAxis() {
  dotsRow.innerHTML = "";
  labelsRow.innerHTML = "";
  const hoverLabel = document.createElement("div");
  hoverLabel.className = "day-label hover-label";
  hoverLabel.hidden = true;
  labelsRow.appendChild(hoverLabel);

  state.days.forEach((day, index) => {
    const x = dayX(index);
    const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `day-dot ${isWeekend ? "weekend" : "weekday"}`;
    dot.style.left = `${x}px`;
    dot.dataset.index = String(index);
    dot.title = `${day.weekdayLabel} ${day.iso}`;
    dot.textContent = String(day.date.getDate());

    dot.addEventListener("pointerdown", onDotPointerDown);
    dot.addEventListener("pointerup", onDotPointerUp);
    dot.addEventListener("pointerenter", () => {
      hoverLabel.textContent = day.date.toLocaleDateString(undefined, { weekday: "short", month: "short" });
      hoverLabel.style.left = `${x}px`;
      hoverLabel.hidden = false;
    });
    dot.addEventListener("pointerleave", () => {
      hoverLabel.hidden = true;
    });

    dotsRow.appendChild(dot);
  });

  const width = dayX(state.days.length - 1) + LEFT_PADDING;
  axisLine.style.width = `${width}px`;
  dotsRow.style.width = `${width}px`;
  labelsRow.style.width = `${width}px`;
  timelineBoard.style.width = `${Math.max(width + 20, 980)}px`;
}

function highlightSelection() {
  const dots = dotsRow.querySelectorAll(".day-dot");
  dots.forEach((dot) => dot.classList.remove("active"));

  if (!state.drag) return;
  const min = Math.min(state.drag.startIndex, state.drag.currentIndex);
  const max = Math.max(state.drag.startIndex, state.drag.currentIndex);

  dots.forEach((dot) => {
    const index = Number(dot.dataset.index);
    if (index >= min && index <= max) {
      dot.classList.add("active");
    }
  });
}

function renderSelectionCapsule() {
  selectionLayer.innerHTML = "";
  if (!state.drag) return;

  const min = Math.min(state.drag.startIndex, state.drag.currentIndex);
  const max = Math.max(state.drag.startIndex, state.drag.currentIndex);
  const left = dayX(min) - 12 - CAPSULE_EDGE_EXTRA;
  const right = dayX(max) + 12 + CAPSULE_EDGE_EXTRA;

  const capsule = document.createElement("div");
  capsule.className = "selection-capsule";
  capsule.style.left = `${left}px`;
  capsule.style.width = `${right - left}px`;
  capsule.style.top = `${timelineAxis.offsetTop - 1}px`;
  selectionLayer.appendChild(capsule);
}

function renderEntries() {
  allocateLanes(state.entries);
  capsulesLayer.innerHTML = "";
  const baseAxisTop = Math.max(60, 25 + state.laneCount * (CAPSULE_HEIGHT + LANE_GAP));
  const dynamicAxisTop = baseAxisTop + AXIS_VERTICAL_OFFSET;
  timelineAxis.style.top = `${dynamicAxisTop}px`;

  for (const entry of state.entries) {
    const { start, end } = entryIndices(entry);
    if (start < 0 || end < 0) continue;

    const left = dayX(start) - 12 - CAPSULE_EDGE_EXTRA;
    const right = dayX(end) + 12 + CAPSULE_EDGE_EXTRA;
    const spanWidth = right - left;
    const width = Math.max(spanWidth, CAPSULE_MIN_WIDTH);
    const center = (left + right) / 2;
    const positionedLeft = center - width / 2;
    const top = capsuleTopForLane(entry.lane);

    const capsule = document.createElement("div");
    capsule.className = "entry-capsule";
    capsule.style.left = `${positionedLeft}px`;
    capsule.style.width = `${width}px`;
    capsule.style.top = `${top}px`;
    capsule.style.background = entry.color || DEFAULT_CAPSULE_COLOR;
    capsule.dataset.entryId = entry.id;
    capsule.title = `${formatLong(entry.startDate)} to ${formatLong(entry.endDate)}`;

    const title = document.createElement("div");
    title.className = "entry-title";
    title.textContent = entry.title || "(Untitled)";
    capsule.appendChild(title);

    capsule.addEventListener("click", () => {
      state.selectedEntryId = entry.id;
      syncSelectionUI();
      setNotePanel(entry.id);
    });
    capsule.addEventListener("pointerdown", onEntryPointerDown);
    capsulesLayer.appendChild(capsule);
  }

  const minHeight = dynamicAxisTop + 35;
  timelineBoard.style.minHeight = `${Math.max(100, minHeight)}px`;
  capsulesLayer.style.height = `${timelineBoard.offsetHeight}px`;
  selectionLayer.style.height = `${timelineBoard.offsetHeight}px`;
  syncSelectionUI();
  updateDurationControls(findEntry(state.selectedEntryId));
}

function createEntryFromDrag() {
  if (!state.drag) return;
  const start = Math.min(state.drag.startIndex, state.drag.currentIndex);
  const end = Math.max(state.drag.startIndex, state.drag.currentIndex);

  const entry = {
    id: crypto.randomUUID(),
    startDate: state.days[start].iso,
    endDate: state.days[end].iso,
    title: "new",
    note: "",
    color: DEFAULT_CAPSULE_COLOR,
    lane: 0,
  };

  state.entries.push(entry);
  saveState();
  renderEntries();
}

function clearDrag() {
  state.drag = null;
  highlightSelection();
  renderSelectionCapsule();
}

function onDotPointerDown(event) {
  const target = event.currentTarget;
  const index = Number(target.dataset.index);

  state.drag = { startIndex: index, currentIndex: index, pointerId: event.pointerId, created: false };
  target.setPointerCapture(event.pointerId);
  highlightSelection();
  renderSelectionCapsule();
}

function updateDragIndexFromClientX(clientX) {
  if (!state.drag) return;
  const rowRect = dotsRow.getBoundingClientRect();
  const relativeX = clientX - rowRect.left;
  const rawIndex = Math.round((relativeX - LEFT_PADDING) / SPACING);
  const index = clamp(rawIndex, 0, state.days.length - 1);
  state.drag.currentIndex = index;
  highlightSelection();
  renderSelectionCapsule();
}

function onDotPointerUp(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId || state.drag.created) return;
  state.drag.created = true;
  updateDragIndexFromClientX(event.clientX);
  createEntryFromDrag();
  clearDrag();
}

function onEntryPointerDown(event) {
  const capsule = event.currentTarget;
  const entry = findEntry(capsule.dataset.entryId);
  if (!entry) return;

  state.selectedEntryId = entry.id;
  syncSelectionUI();
  setNotePanel(entry.id);

  const { start, end } = entryIndices(entry);
  const span = end - start;
  const dragState = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    baseStart: start,
    span,
    deltaDays: 0,
  };

  capsule.dataset.dragging = "true";
  capsule.setPointerCapture(event.pointerId);

  const onPointerMove = (moveEvent) => {
    if (moveEvent.pointerId !== dragState.pointerId) return;
    const deltaPx = moveEvent.clientX - dragState.startClientX;
    const rawDeltaDays = Math.round(deltaPx / SPACING);
    const minDelta = -dragState.baseStart;
    const maxDelta = state.days.length - 1 - (dragState.baseStart + dragState.span);
    const clampedDelta = clamp(rawDeltaDays, minDelta, maxDelta);
    dragState.deltaDays = clampedDelta;
    capsule.style.transform = `translateX(${clampedDelta * SPACING}px)`;
  };

  const onPointerEnd = (endEvent) => {
    if (endEvent.pointerId !== dragState.pointerId) return;

    capsule.removeEventListener("pointermove", onPointerMove);
    capsule.removeEventListener("pointerup", onPointerEnd);
    capsule.removeEventListener("pointercancel", onPointerEnd);
    capsule.style.transform = "";
    delete capsule.dataset.dragging;

    if (dragState.deltaDays !== 0) {
      const duration = dragState.span + 1;
      applyEntryRangeFromStartAndDuration(entry, dragState.baseStart + dragState.deltaDays, duration);
      saveState();
      renderEntries();
    }
  };

  capsule.addEventListener("pointermove", onPointerMove);
  capsule.addEventListener("pointerup", onPointerEnd);
  capsule.addEventListener("pointercancel", onPointerEnd);
}

function setupGlobalPointerHandling() {
  window.addEventListener("pointermove", (event) => {
    if (!state.drag || state.drag.pointerId !== event.pointerId) return;
    updateDragIndexFromClientX(event.clientX);
  });

  window.addEventListener("pointerup", (event) => {
    if (state.drag && state.drag.pointerId === event.pointerId && !state.drag.created) {
      state.drag.created = true;
      updateDragIndexFromClientX(event.clientX);
      createEntryFromDrag();
      clearDrag();
    }
  });

  window.addEventListener("pointercancel", clearDrag);
}

function exportEntries() {
  const payload = JSON.stringify(state.entries, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "vacation-timeline.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importEntries(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "[]"));
      if (!Array.isArray(parsed)) {
        throw new Error("Invalid format");
      }

      const validDates = new Set(state.days.map((day) => day.iso));
      state.entries = parsed
        .filter((item) => item && validDates.has(item.startDate) && validDates.has(item.endDate))
        .map((item) => ({
          id: String(item.id || crypto.randomUUID()),
          startDate: item.startDate,
          endDate: item.endDate,
          title: typeof item.title === "string" ? item.title : (typeof item.text === "string" ? item.text : ""),
          note: typeof item.note === "string" ? item.note : "",
          color: normalizeCapsuleColor(item.color),
          lane: 0,
        }));

      saveState();
      state.selectedEntryId = null;
      setNotePanel(null);
      renderEntries();
    } catch (error) {
      alert("Could not import JSON. Please check file format.");
      console.error(error);
    }
  };
  reader.readAsText(file);
}

function clearAll() {
  state.entries = [];
  state.selectedEntryId = null;
  saveState();
  setNotePanel(null);
  renderEntries();
}

function deleteSelectedEntry() {
  if (!state.selectedEntryId) return;
  state.entries = state.entries.filter((item) => item.id !== state.selectedEntryId);
  state.selectedEntryId = null;
  saveState();
  setNotePanel(null);
  renderEntries();
}

function initDays() {
  const dates = createDateRange(START_DATE, END_DATE);
  state.days = dates.map((date, index) => ({
    date,
    index,
    iso: toISODate(date),
    weekday: date.getDay(),
    weekdayLabel: date.toLocaleDateString(undefined, { weekday: "short" }),
  }));
}

function attachActions() {
  exportBtn.addEventListener("click", exportEntries);
  importInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    if (file) importEntries(file);
    event.target.value = "";
  });
  deleteSelectedBtn.addEventListener("click", deleteSelectedEntry);
  clearBtn.addEventListener("click", clearAll);

  noteTitleInput.addEventListener("input", () => {
    const entry = findEntry(state.selectedEntryId);
    if (!entry) return;
    entry.title = noteTitleInput.value || "";
    saveState();
    const selectedCapsule = capsulesLayer.querySelector(`.entry-capsule[data-entry-id="${entry.id}"] .entry-title`);
    if (selectedCapsule) {
      selectedCapsule.textContent = entry.title || "(Untitled)";
    }
  });

  noteInput.addEventListener("input", () => {
    const entry = findEntry(state.selectedEntryId);
    if (!entry) return;
    entry.note = noteInput.value;
    saveState();
    autoSizeNoteInput();
  });

  durationMinusBtn.addEventListener("click", () => {
    const entry = findEntry(state.selectedEntryId);
    if (!entry) return;
    const { start } = entryIndices(entry);
    const nextDuration = durationDays(entry) - 1;
    applyEntryRangeFromStartAndDuration(entry, start, nextDuration);
    saveState();
    renderEntries();
    setNotePanel(entry.id);
  });

  durationPlusBtn.addEventListener("click", () => {
    const entry = findEntry(state.selectedEntryId);
    if (!entry) return;
    const { start } = entryIndices(entry);
    const nextDuration = durationDays(entry) + 1;
    applyEntryRangeFromStartAndDuration(entry, start, nextDuration);
    saveState();
    renderEntries();
    setNotePanel(entry.id);
  });

  colorPicker.addEventListener("click", (event) => {
    const swatch = event.target.closest(".color-swatch");
    if (!swatch) return;
    const entry = findEntry(state.selectedEntryId);
    if (!entry) return;
    entry.color = normalizeCapsuleColor(swatch.dataset.color);
    saveState();
    syncColorPicker(entry.color);
    const selectedCapsule = capsulesLayer.querySelector(`.entry-capsule[data-entry-id="${entry.id}"]`);
    if (selectedCapsule) {
      selectedCapsule.style.background = entry.color;
    }
  });

  timelineBoard.addEventListener("click", (event) => {
    const capsule = event.target.closest(".entry-capsule");
    if (capsule && capsule.dataset.dragging === "true") return;
    if (!capsule) {
      state.selectedEntryId = null;
      syncSelectionUI();
      setNotePanel(null);
    }
  });
}

function verifyRange() {
  const startLabel = parseISODate(START_DATE).toLocaleDateString(undefined, { weekday: "long" });
  const endLabel = parseISODate(END_DATE).toLocaleDateString(undefined, { weekday: "long" });
  console.log(`Range starts ${startLabel} (${START_DATE}) and ends ${endLabel} (${END_DATE})`);
}

function init() {
  initDays();
  loadState();
  renderAxis();
  renderEntries();
  attachActions();
  setupGlobalPointerHandling();
  verifyRange();
  setNotePanel(null);
  autoSizeNoteInput();
}

init();
