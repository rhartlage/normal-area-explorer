const regionType = document.getElementById("regionType");
const aSlider = document.getElementById("aSlider");
const aInput = document.getElementById("aInput");
const bSlider = document.getElementById("bSlider");
const bInput = document.getElementById("bInput");
const aValue = document.getElementById("aValue");
const bValue = document.getElementById("bValue");
const bControl = document.getElementById("bControl");
const questionText = document.getElementById("questionText");
const answerText = document.getElementById("answerText");
const normalSvg = document.getElementById("normalSvg");

const xMin = -3.7;
const xMax = 3.7;
const yScale = 620;
const sliderMin = -3.5;
const sliderMax = 3.5;
const svgWidth = 900;
const svgHeight = 360;
const axisY = 320;
const handleThresholdPx = 18;

let dragState = null;
let currentModel = null;

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const poly = (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t);
  const approx = 1 - poly * Math.exp(-absX * absX);
  return sign * approx;
}

function cdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function pdf(z) {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-(z * z) / 2);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toX(z) {
  return ((z - xMin) / (xMax - xMin)) * svgWidth;
}

function fromX(x) {
  return xMin + (x / svgWidth) * (xMax - xMin);
}

function toY(density) {
  return axisY - density * yScale;
}

function pathForCurve(step = 0.02) {
  let d = "";
  for (let z = xMin; z <= xMax; z += step) {
    const x = toX(z);
    const y = toY(pdf(z));
    d += d === "" ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

function shadePath(fromZ, toZ, step = 0.02) {
  const left = Math.max(xMin, Math.min(fromZ, toZ));
  const right = Math.min(xMax, Math.max(fromZ, toZ));
  let d = `M ${toX(left).toFixed(2)} ${axisY}`;
  for (let z = left; z <= right; z += step) {
    d += ` L ${toX(z).toFixed(2)} ${toY(pdf(z)).toFixed(2)}`;
  }
  d += ` L ${toX(right).toFixed(2)} ${axisY} Z`;
  return d;
}

function fmt(z) {
  return Number(z).toFixed(2);
}

function syncManualInput(input, value, force = false) {
  if (force || document.activeElement !== input) {
    input.value = fmt(value);
  }
}

function getModel() {
  const type = regionType.value;
  let a = Number(aSlider.value);
  let b = Number(bSlider.value);

  if (type === "between" && a > b) {
    [a, b] = [b, a];
    aSlider.value = String(a);
    bSlider.value = String(b);
  }

  if (type === "absGreater") {
    a = Math.abs(a);
    aSlider.value = String(a);
  }

  return { type, a, b };
}

function buildSegments(type, a, b) {
  if (type === "right") {
    return [{ from: a, to: xMax }];
  }

  if (type === "left") {
    return [{ from: xMin, to: a }];
  }

  if (type === "between") {
    return [{ from: a, to: b }];
  }

  return [
    { from: xMin, to: -a },
    { from: a, to: xMax },
  ];
}

function buildHandles(type, a, b) {
  if (type === "right" || type === "left") {
    return [{ z: a, label: "a" }];
  }

  if (type === "between") {
    return [
      { z: a, label: "a" },
      { z: b, label: "b" },
    ];
  }

  return [
    { z: -a, label: "-a" },
    { z: a, label: "a" },
  ];
}

function buildAxis() {
  let markup = `
    <line x1="30" y1="${axisY}" x2="870" y2="${axisY}" stroke="rgba(22, 33, 51, 0.56)" stroke-width="2" />
  `;

  for (let z = -3; z <= 3; z += 1) {
    const x = toX(z);
    markup += `
      <line x1="${x}" y1="52" x2="${x}" y2="${axisY}" stroke="rgba(22, 33, 51, 0.08)" stroke-width="1" />
      <line x1="${x}" y1="${axisY - 7}" x2="${x}" y2="${axisY + 7}" stroke="rgba(22, 33, 51, 0.56)" stroke-width="1.5" />
      <text x="${x}" y="345" font-size="15" text-anchor="middle" fill="rgba(68, 83, 106, 0.92)">${z}</text>
    `;
  }

  markup += `
    <text x="876" y="${axisY + 4}" font-size="15" font-weight="700" fill="rgba(22, 33, 51, 0.82)">z</text>
  `;

  return markup;
}

function buildMarkers(handles) {
  return handles
    .map(({ z, label }) => {
      const x = toX(z);
      const y = toY(pdf(z));
      return `
        <line
          x1="${x}"
          y1="${axisY}"
          x2="${x}"
          y2="${y}"
          stroke="rgba(31, 122, 140, 0.56)"
          stroke-width="2"
          stroke-dasharray="6 6"
        />
        <circle cx="${x}" cy="${axisY}" r="8" fill="#f05d3d" stroke="#fff7df" stroke-width="3" />
        <text
          x="${x}"
          y="${axisY + 25}"
          font-size="14"
          font-weight="700"
          text-anchor="middle"
          fill="#c74b30"
        >${label}</text>
      `;
    })
    .join("");
}

function update() {
  const { type, a, b } = getModel();

  aValue.textContent = fmt(a);
  syncManualInput(aInput, a);
  bValue.textContent = fmt(b);
  syncManualInput(bInput, b);
  bControl.style.display = type === "between" ? "grid" : "none";

  let percent = 0;
  let question = "";
  let shaded = "";

  if (type === "right") {
    percent = 1 - cdf(a);
    question = `Find P(z > ${fmt(a)})`;
    shaded = shadePath(a, xMax);
  } else if (type === "left") {
    percent = cdf(a);
    question = `Find P(z < ${fmt(a)})`;
    shaded = shadePath(xMin, a);
  } else if (type === "between") {
    percent = cdf(b) - cdf(a);
    question = `Find P(${fmt(a)} < z < ${fmt(b)})`;
    shaded = shadePath(a, b);
  } else {
    const absA = Math.abs(a);
    percent = (1 - cdf(absA)) + cdf(-absA);
    question = `Find P(|z| > ${fmt(absA)})`;
    shaded = `${shadePath(xMin, -absA)} ${shadePath(absA, xMax)}`;
  }

  currentModel = {
    type,
    a,
    b,
    segments: buildSegments(type, a, b),
    handles: buildHandles(type, a, b),
  };

  questionText.textContent = question;
  answerText.textContent = `Probability = ${percent.toFixed(4)} (${(percent * 100).toFixed(2)}%)`;

  const axis = buildAxis();
  const shade = `<path d="${shaded}" fill="var(--accent-soft)" stroke="none" />`;
  const curve = `<path d="${pathForCurve()}" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" />`;
  const markers = buildMarkers(currentModel.handles);

  normalSvg.innerHTML = `${axis}${shade}${curve}${markers}`;
}

function commitAInput() {
  const rawValue = Number(aInput.value);
  if (!Number.isFinite(rawValue)) {
    syncManualInput(aInput, getModel().a, true);
    return;
  }

  const nextValue =
    regionType.value === "absGreater"
      ? Math.abs(clamp(rawValue, sliderMin, sliderMax))
      : clamp(rawValue, sliderMin, sliderMax);

  aSlider.value = String(nextValue);
  update();
  syncManualInput(aInput, getModel().a, true);
}

function commitBInput() {
  const rawValue = Number(bInput.value);
  if (!Number.isFinite(rawValue)) {
    syncManualInput(bInput, getModel().b, true);
    return;
  }

  const nextValue = clamp(rawValue, sliderMin, sliderMax);

  bSlider.value = String(nextValue);
  update();
  syncManualInput(bInput, getModel().b, true);
}

function clientToSvg(event) {
  const rect = normalSvg.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * svgWidth,
    y: ((event.clientY - rect.top) / rect.height) * svgHeight,
  };
}

function isInteractiveHeight(point, z) {
  const curveY = toY(pdf(z));
  return point.y >= curveY - 12 && point.y <= axisY + 26;
}

function isWithinSegment(z, segments) {
  return segments.some(({ from, to }) => z >= from && z <= to);
}

function getDragTarget(point) {
  if (!currentModel) {
    return null;
  }

  const z = clamp(fromX(point.x), xMin, xMax);
  if (!isInteractiveHeight(point, z)) {
    return null;
  }

  const threshold = (xMax - xMin) * (handleThresholdPx / svgWidth);

  if (currentModel.type === "right" || currentModel.type === "left") {
    if (Math.abs(z - currentModel.a) <= threshold || isWithinSegment(z, currentModel.segments)) {
      return { kind: "single" };
    }
    return null;
  }

  if (currentModel.type === "between") {
    if (Math.abs(z - currentModel.a) <= threshold) {
      return { kind: "leftEdge" };
    }
    if (Math.abs(z - currentModel.b) <= threshold) {
      return { kind: "rightEdge" };
    }
    if (z >= currentModel.a && z <= currentModel.b) {
      return { kind: "betweenTranslate" };
    }
    return null;
  }

  if (
    Math.abs(z + currentModel.a) <= threshold ||
    Math.abs(z - currentModel.a) <= threshold ||
    isWithinSegment(z, currentModel.segments)
  ) {
    return { kind: "absolute" };
  }

  return null;
}

function setHoverCursor(point) {
  if (dragState) {
    return;
  }

  const target = getDragTarget(point);
  if (!target) {
    normalSvg.style.cursor = "default";
    return;
  }

  normalSvg.style.cursor = target.kind === "betweenTranslate" ? "grab" : "ew-resize";
}

function endDrag(event) {
  if (!dragState) {
    return;
  }

  if (typeof normalSvg.releasePointerCapture === "function") {
    try {
      normalSvg.releasePointerCapture(dragState.pointerId);
    } catch {}
  }

  dragState = null;
  document.body.classList.remove("is-dragging");

  if (event) {
    setHoverCursor(clientToSvg(event));
  } else {
    normalSvg.style.cursor = "default";
  }
}

normalSvg.addEventListener("pointerdown", (event) => {
  const point = clientToSvg(event);
  const target = getDragTarget(point);
  if (!target) {
    return;
  }

  dragState = {
    pointerId: event.pointerId,
    kind: target.kind,
    startZ: clamp(fromX(point.x), sliderMin, sliderMax),
    initialA: currentModel.a,
    initialB: currentModel.b,
  };

  if (typeof normalSvg.setPointerCapture === "function") {
    try {
      normalSvg.setPointerCapture(event.pointerId);
    } catch {}
  }

  document.body.classList.add("is-dragging");
  normalSvg.style.cursor = target.kind === "betweenTranslate" ? "grabbing" : "ew-resize";
  event.preventDefault();
});

normalSvg.addEventListener("pointermove", (event) => {
  const point = clientToSvg(event);

  if (!dragState) {
    setHoverCursor(point);
    return;
  }

  const z = clamp(fromX(point.x), sliderMin, sliderMax);

  if (dragState.kind === "single") {
    aSlider.value = String(z);
  } else if (dragState.kind === "leftEdge") {
    aSlider.value = String(z);
  } else if (dragState.kind === "rightEdge") {
    bSlider.value = String(z);
  } else if (dragState.kind === "betweenTranslate") {
    const width = dragState.initialB - dragState.initialA;
    const delta = z - dragState.startZ;
    const nextA = clamp(dragState.initialA + delta, sliderMin, sliderMax - width);
    aSlider.value = String(nextA);
    bSlider.value = String(nextA + width);
  } else if (dragState.kind === "absolute") {
    aSlider.value = String(Math.abs(z));
  }

  update();
});

normalSvg.addEventListener("pointerup", endDrag);
normalSvg.addEventListener("pointercancel", endDrag);
normalSvg.addEventListener("pointerleave", () => {
  if (!dragState) {
    normalSvg.style.cursor = "default";
  }
});

aSlider.addEventListener("input", update);
aInput.addEventListener("input", () => {
  const rawValue = Number(aInput.value);
  if (!Number.isFinite(rawValue)) {
    return;
  }

  const nextValue =
    regionType.value === "absGreater"
      ? Math.abs(clamp(rawValue, sliderMin, sliderMax))
      : clamp(rawValue, sliderMin, sliderMax);

  aSlider.value = String(nextValue);
  update();
});
aInput.addEventListener("change", commitAInput);
aInput.addEventListener("blur", commitAInput);
bSlider.addEventListener("input", update);
bInput.addEventListener("input", () => {
  const rawValue = Number(bInput.value);
  if (!Number.isFinite(rawValue)) {
    return;
  }

  bSlider.value = String(clamp(rawValue, sliderMin, sliderMax));
  update();
});
bInput.addEventListener("change", commitBInput);
bInput.addEventListener("blur", commitBInput);
regionType.addEventListener("change", update);

for (const btn of document.querySelectorAll(".examples button")) {
  btn.addEventListener("click", () => {
    regionType.value = btn.dataset.type;
    if (btn.dataset.a) {
      aSlider.value = btn.dataset.a;
    }
    if (btn.dataset.b) {
      bSlider.value = btn.dataset.b;
    }
    update();
  });
}

update();
