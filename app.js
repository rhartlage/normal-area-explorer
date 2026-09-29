/* All probabilities are computed in standardized units; raw inputs stay unrounded. */
const $ = (id) => document.getElementById(id);
const { cdf, sf, pdf, inv, interval } = NormalMath;
const svg = $("normalSvg");
const controls = ["muInput", "sigmaInput", "aInput", "bInput", "probabilityInput"];
const width = 900, height = 410, axisY = 300, leftPad = 55, plotWidth = 790;
let current = null, drag = null, radius = 4;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const exact = (n) => String(Object.is(n, -0) ? 0 : n);
const fmt = (n) => Math.abs(n) >= 1e7 || (n !== 0 && Math.abs(n) < 1e-5)
  ? n.toExponential(5) : Number(n.toFixed(5)).toString();
const prob = (n) => n > 0 && n < 1 && (n < 0.00001 || n > 0.99999)
  ? exact(n) : n.toFixed(5);
const distinct = (values) => {
  const labels = values.map(fmt);
  return new Set(labels).size < new Set(values).size ? values.map(exact) : labels;
};
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const par = (n) => n < 0 ? `(${exact(n)})` : exact(n);
const xAt = (z, m) => m.mu + m.sigma * z;
const toX = (z) => leftPad + (z + radius) / (2 * radius) * plotWidth;
const fromX = (x) => (x - leftPad) / plotWidth * 2 * radius - radius;
const toY = (z) => axisY - pdf(z) * 590;

function number(id, name) {
  const value = $(id).value.trim();
  if (!value || !Number.isFinite(Number(value))) throw new Error(`Enter a finite number for ${name}.`);
  return Number(value);
}
function model() {
  const mu = number("muInput", "the mean"), sigma = number("sigmaInput", "the standard deviation");
  if (sigma <= 0) throw new Error("Standard deviation σ must be greater than 0.");
  const mode = $("solveMode").value, type = $("regionType").value, scale = $("inputScale").value;
  const m = { mu, sigma, mode, type, scale };
  if (mode === "inverse") {
    m.p = number("probabilityInput", "the requested probability");
    if (m.p <= 0 || m.p >= 1) throw new Error("Enter a probability strictly between 0 and 1 (for example, 0.95). Probabilities 0 and 1 have no finite inverse cutoff.");
    if (type === "left") { m.a = inv(m.p); m.q = m.p; m.qExpr = exact(m.p); }
    if (type === "right") { m.a = -inv(m.p); m.q = 1 - m.p; m.qExpr = `1-${exact(m.p)}`; }
    if (type === "between") { m.a = inv((1 - m.p) / 2); m.b = -m.a; m.q = (1 - m.p) / 2; m.qExpr = `(1-${exact(m.p)})/2`; }
    if (type === "absGreater") { m.a = inv(m.p / 2); m.b = -m.a; m.q = m.p / 2; m.qExpr = `${exact(m.p)}/2`; }
  } else {
    m.rawA = number("aInput", "the first cutoff");
    m.rawB = type === "between" ? number("bInput", "the upper cutoff") : null;
    if (type === "absGreater") {
      if (m.rawA < 0) throw new Error("Distance from the mean must be 0 or greater.");
      m.b = scale === "x" ? m.rawA / sigma : m.rawA;
      m.a = -m.b;
    } else {
      m.a = scale === "x" ? (m.rawA - mu) / sigma : m.rawA;
      if (type === "between") {
        m.b = scale === "x" ? (m.rawB - mu) / sigma : m.rawB;
        if (m.a > m.b) throw new Error("The lower cutoff must be less than or equal to the upper cutoff.");
      }
    }
    m.p = type === "left" ? cdf(m.a) : type === "right" ? sf(m.a) : type === "between" ? interval(m.a, m.b) : cdf(m.a) + sf(m.b);
  }
  if (mode === "inverse" && type === "between" && m.a === m.b) throw new Error("That central area is too small to resolve with this numerical precision. Enter a larger probability.");
  m.zs = m.b === undefined ? [m.a] : [m.a, m.b];
  m.xs = mode === "probability" && scale === "x" && type !== "absGreater"
    ? [m.rawA, ...(type === "between" ? [m.rawB] : [])] : m.zs.map(z => xAt(z, m));
  if (new Set(m.zs).size > new Set(m.xs).size) throw new Error("The cutoffs are too close to distinguish at this mean and standard deviation. Use a less extreme scale.");
  if (![...m.zs, ...m.xs].every(Number.isFinite)) throw new Error("These values exceed the supported numerical range. Use a smaller mean, spread, or cutoff.");
  m.segments = type === "left" ? [[-Infinity, m.a]] : type === "right" ? [[m.a, Infinity]] : type === "between" ? [[m.a, m.b]] : [[-Infinity, m.a], [m.b, Infinity]];
  return m;
}

function configure() {
  const inverse = $("solveMode").value === "inverse", type = $("regionType").value;
  const units = $("inputScale").value === "x" ? "x" : "z";
  $("forwardControls").hidden = inverse;
  $("inverseControls").hidden = !inverse;
  $("bControl").hidden = type !== "between";
  $("practicePanel").hidden = inverse;
  $("regionType").options[2].textContent = inverse ? "Central interval — equal unshaded tails" : "Between two cutoffs";
  $("aLabel").textContent = type === "absGreater" ? `Distance from the mean (${units === "x" ? "original units" : "z units"})` : `${type === "between" ? "Lower cutoff" : "Cutoff"} (${units})`;
  $("bLabel").textContent = `Upper cutoff (${units})`;
  $("regionHint").textContent = inverse && type === "between" ? "The requested area is centered on μ. Each unshaded tail gets half of the remaining area." : type === "absGreater" ? "Both shaded tails are equally far from μ. The probability is the total of both tails." : inverse && type === "right" ? "Enter the area to the right. We will convert it to a left-tail area for Excel." : "";
}

function axisMarkup(m) {
  let s = `<line x1="${leftPad}" y1="${axisY}" x2="${width-leftPad}" y2="${axisY}" stroke="currentColor" opacity=".5"/>`;
  for (let i = -4; i <= 4; i++) {
    const z = i * radius / 4, x = toX(z);
    s += `<line x1="${x}" y1="45" x2="${x}" y2="${axisY}" stroke="currentColor" opacity=".07"/><line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY+6}" stroke="currentColor" opacity=".5"/><text x="${x}" y="${axisY+30}" text-anchor="middle" font-size="14" fill="var(--ink)">${esc(fmt(xAt(z,m)))}</text><text x="${x}" y="${axisY+66}" text-anchor="middle" font-size="14" fill="var(--ink-soft)">${esc(fmt(z))}</text>`;
  }
  return s + `<text x="18" y="${axisY+30}" font-size="15" font-weight="700" fill="var(--ink)">x</text><text x="18" y="${axisY+66}" font-size="15" font-weight="700" fill="var(--ink-soft)">z</text>`;
}
function curvePath(lo, hi, area = false) {
  lo = Math.max(lo, -radius); hi = Math.min(hi, radius);
  if (lo > hi) return "";
  const points = Math.max(2, Math.ceil((hi-lo)*90));
  let s = area ? `M ${toX(lo)} ${axisY} L ${toX(lo)} ${toY(lo)}` : `M ${toX(lo)} ${toY(lo)}`;
  for (let i=1;i<=points;i++) { const z=lo+(hi-lo)*i/points; s += ` L ${toX(z)} ${toY(z)}`; }
  return s + (area ? ` L ${toX(hi)} ${axisY} Z` : "");
}
function draw(m) {
  radius = drag?.radius ?? Math.min(12, Math.max(4, Math.ceil(Math.max(...m.zs.map(Math.abs)) + 0.5)));
  let s = `<title>${esc($("questionText").textContent)}. ${esc($("answerText").textContent)}</title>${axisMarkup(m)}`;
  s += m.segments.map(([lo,hi])=>`<path d="${curvePath(lo,hi,true)}" fill="var(--accent-soft)"/>`).join("");
  s += `<path d="${curvePath(-radius,radius)}" fill="none" stroke="var(--accent)" stroke-width="3.5"/>`;
  m.zs.forEach((z,i)=>{
    if (Math.abs(z)>radius) return;
    const x=toX(z);
    s+=`<line x1="${x}" x2="${x}" y1="${axisY}" y2="${toY(z)}" stroke="var(--accent-deep)" stroke-width="2" stroke-dasharray="5 4"/><circle cx="${x}" cy="${axisY}" r="8" fill="var(--accent-deep)" stroke="white" stroke-width="2"/><text x="${x}" y="${Math.max(26,toY(z)-14)}" text-anchor="${x>780?'end':x<120?'start':'middle'}" font-size="16" font-weight="700" fill="var(--ink)">${m.zs.length>1?(i===0?'Lower':'Upper'):'Cutoff'}: ${esc(fmt(m.xs[i]))}</text>`;
  });
  svg.innerHTML=s;
  const offScale=m.zs.some(z=>Math.abs(z)>radius);
  $("plotCaption").textContent = offScale ? "A cutoff is outside the displayed ±12 z range. The calculations still include the complete tails." : `${m.mode==="inverse" && m.zs.length>1 ? "Drag either cutoff to change the area while keeping the interval centered on μ." : "Drag a cutoff or the shaded region; the math and Excel formulas update together."} The x row shows original units; the z row shows standard deviations from μ. Tails continue beyond the plot.`;
  for(const [id,z] of [["aSlider",m.type==="absGreater"?m.b:m.a],["bSlider",m.b??m.a]]) {
    $(id).min=id==="aSlider"&&m.type==="absGreater"?0:-radius;
    $(id).max=radius; $(id).value=String(clamp(z,Number($(id).min),radius));
  }
}
function step(title, text) { return `<li><strong>${esc(title)}</strong><p class="math-line">${esc(text)}</p></li>`; }
function formulaGroup(label, formulas, values) {
  return `<div class="formula-group"><h4>${esc(label)}</h4>${formulas.map((f,i)=>`<div class="formula-row"><code>${esc(f)}</code><button type="button" class="copy-button" data-copy="${esc(f)}" aria-label="Copy ${esc(f)}">Copy</button></div><p class="formula-result">${esc(values[i])}</p>`).join("")}</div>`;
}
function question(m) {
  const [a,b]=distinct(m.xs), [za,zb]=distinct(m.zs);
  let xq, zq;
  if(m.type==="left") {xq=`P(X < ${a})`;zq=`P(Z < ${za})`;}
  else if(m.type==="right") {xq=`P(X > ${a})`;zq=`P(Z > ${za})`;}
  else if(m.type==="between") {xq=`P(${a} < X < ${b})`;zq=`P(${za} < Z < ${zb})`;}
  else {xq=`P(X < ${a} or X > ${b})`;zq=`P(Z < ${za} or Z > ${zb})`;}
  $("questionText").textContent=xq;
  $("standardQuestion").textContent=`= ${zq}`;
  $("answerText").textContent=m.mode==="inverse" ? `${m.xs.length>1?'Cutoffs':'Cutoff'}: ${distinct(m.xs).join(" and ")} · Shaded area = ${prob(m.p)} (${fmt(m.p*100)}%)` : `Probability ≈ ${prob(m.p)} (${fmt(m.p*100)}%)`;
}
function forwardExplanation(m) {
  $("workingTitle").textContent="Standardize, then find the area";
  let steps=step("Describe the model", `X is normal with μ = ${fmt(m.mu)} and σ = ${fmt(m.sigma)}. Z measures distance from the mean in standard deviations.`);
  steps += step("Convert each boundary to a z-score", m.zs.map((z,i)=>`z${m.zs.length>1?i+1:""} = (x − μ) / σ = (${exact(m.xs[i])} − (${exact(m.mu)})) / ${exact(m.sigma)} ≈ ${fmt(z)}`).join("\n"));
  let area;
  if(m.type==="left") area=`Φ(${fmt(m.a)}) ≈ ${prob(m.p)}`;
  if(m.type==="right") area=`1 − Φ(${fmt(m.a)}) ≈ ${prob(m.p)}`;
  if(m.type==="between") area=`Φ(${fmt(m.b)}) − Φ(${fmt(m.a)}) ≈ ${prob(m.p)}`;
  if(m.type==="absGreater") area=`Φ(${fmt(m.a)}) + [1 − Φ(${fmt(m.b)})] ≈ ${prob(m.p)}`;
  steps += step("Combine the left-tail areas", `${area}\nΦ(z) means the standard normal area to the left of z.`);
  $("workingSteps").innerHTML=steps;
  // Keep symbolic substitutions in copyable formulas so displayed rounding cannot alter the answer.
  let xs,zs;
  if(m.type==="absGreater") {
    const distance=m.scale==="x"?exact(m.rawA):`${par(m.sigma)}*${par(m.rawA)}`;
    xs=[`${par(m.mu)}-(${distance})`,`${par(m.mu)}+(${distance})`];
    zs=m.scale==="z"?[exact(-m.rawA),exact(m.rawA)]:[`-${par(m.rawA)}/${par(m.sigma)}`,`${par(m.rawA)}/${par(m.sigma)}`];
  } else if(m.scale==="x") {
    xs=[m.rawA,...(m.type==="between"?[m.rawB]:[])].map(exact);
    zs=xs.map(x=>`(${x}-${par(m.mu)})/${par(m.sigma)}`);
  } else {
    zs=[m.rawA,...(m.type==="between"?[m.rawB]:[])].map(exact);
    xs=zs.map(z=>`${par(m.mu)}+${par(m.sigma)}*(${z})`);
  }
  const d=xs.map(x=>`NORM.DIST(${x},${exact(m.mu)},${exact(m.sigma)},TRUE)`), s=zs.map(z=>`NORM.S.DIST(${z},TRUE)`);
  const reflectedD=xs.map(x=>`NORM.DIST(2*${par(m.mu)}-(${x}),${exact(m.mu)},${exact(m.sigma)},TRUE)`);
  const reflectedS=zs.map(z=>`NORM.S.DIST(-(${z}),TRUE)`);
  const stableTail = m.type === "right" && m.a > 5 || m.type === "between" && m.a > 5 || m.type === "absGreater" && m.b > 5;
  const combine=v=>`=${m.type==="left"?v[0]:m.type==="right"?`1-${v[0]}`:m.type==="between"?`${v[1]}-${v[0]}`:`${v[0]}+(1-${v[1]})`}`;
  const stableCombine=(v,r)=>`=${m.type==="right"?r[0]:m.type==="between"?`${r[0]}-${r[1]}`:`${v[0]}+${r[1]}`}`;
  $("excelFormulas").innerHTML=formulaGroup("Original values · NORM.DIST",[stableTail?stableCombine(d,reflectedD):combine(d)],[`Area ≈ ${prob(m.p)}`])+formulaGroup("Standardized values · NORM.S.DIST",[stableTail?stableCombine(s,reflectedS):combine(s)],[`Same area ≈ ${prob(m.p)}`]);
  $("excelNote").textContent="Both functions with TRUE return left-tail area. Match the shaded question by subtracting from 1, subtracting two cumulative areas, or adding two tails." + (stableTail ? " Here the right tail is very small, so the formulas reflect it across the mean: P(Z > z) = P(Z < −z). This avoids subtracting numbers that round to 1." : "");
}
function inverseExplanation(m) {
  $("workingTitle").textContent="Find the z-score, then return to original units";
  const qExprs=m.zs.length>1?[m.qExpr,`1-(${m.qExpr})`]:[m.qExpr];
  const qs=m.zs.length>1?[m.q,1-m.q]:[m.q];
  const smallTailExpr = m.type === "right" ? exact(m.p) : m.qExpr;
  const useSymmetry = qs.map((q,i) => q > 1-1e-8 && (m.type === "right" || i === 1));
  const zExpressions = qExprs.map((q,i) => useSymmetry[i] ? `-NORM.S.INV(${smallTailExpr})` : `NORM.S.INV(${q})`);
  const xExpressions = qExprs.map((q,i) => useSymmetry[i] ? `2*${par(m.mu)}-NORM.INV(${smallTailExpr},${exact(m.mu)},${exact(m.sigma)})` : `NORM.INV(${q},${exact(m.mu)},${exact(m.sigma)})`);
  const reason=m.type==="left"?"The requested area is already a left-tail probability.":m.type==="right"?"Left area = 1 − requested right area.":m.type==="between"?"Split the unshaded area equally: lower left area = (1 − p) / 2; upper left area = 1 − (1 − p) / 2.":"Split the requested shaded area equally: lower left area = p / 2; upper left area = 1 − p / 2.";
  let steps=step("Translate the shaded area into left-tail probabilities", `${reason}\n${qs.map((q,i)=>`${qs.length>1?(i===0?"Lower":"Upper"):"Left"} area = ${qExprs[i]} ≈ ${prob(q)}`).join("\n")}`);
  steps+=step("Find the standard normal cutoff", m.zs.map((z,i)=>`z${m.zs.length>1?i+1:""} = ${zExpressions[i]} ≈ ${fmt(z)}`).join("\n"));
  steps+=step("Convert z back to the original units", m.zs.map((z,i)=>`x${m.zs.length>1?i+1:""} = μ + σz = ${fmt(m.mu)} + ${fmt(m.sigma)} × (${fmt(z)}) ≈ ${fmt(m.xs[i])}`).join("\n"));
  $("workingSteps").innerHTML=steps;
  $("excelFormulas").innerHTML=formulaGroup("Original cutoffs · NORM.INV",xExpressions.map(f=>`=${f}`),m.xs.map((x,i)=>`${m.xs.length>1?(i===0?"Lower x":"Upper x"):"x"} ≈ ${fmt(x)}`))+formulaGroup("Standardized cutoffs · NORM.S.INV",zExpressions.map(f=>`=${f}`),m.zs.map((z,i)=>`${m.zs.length>1?(i===0?"Lower z":"Upper z"):"z"} ≈ ${fmt(z)}`));
  $("excelNote").textContent="INV functions take the area to the left of the cutoff. NORM.INV includes the conversion x = μ + σz; NORM.S.INV returns the z-score." + (useSymmetry.some(Boolean) ? " For this very small tail, symmetry avoids rounding a probability near 1: z = −NORM.S.INV(tail), and x = 2μ − NORM.INV(tail, μ, σ)." : "");
}
function update() {
  configure();
  try {
    const m=model(); current=m;
    $("inputError").hidden=true; $("results").hidden=false; svg.hidden=false; svg.style.display="";
    $("modelBadge").textContent=`μ = ${fmt(m.mu)} · σ = ${fmt(m.sigma)}`;
    question(m); m.mode==="inverse"?inverseExplanation(m):forwardExplanation(m); draw(m);
  } catch(error) {
    current=null; $("inputError").textContent=error.message; $("inputError").hidden=false;
    $("results").hidden=true; svg.hidden=true; svg.style.display="none"; $("modelBadge").textContent="Check the inputs";
    $("plotCaption").textContent="Enter valid inputs to display the graph and worked answer.";
  }
  $("copyStatus").textContent="";
}
function writeCutoffs(zs,m) {
  $("aInput").value=exact(m.type==="absGreater"?(m.scale==="x"?Math.abs(zs[1])*m.sigma:Math.abs(zs[1])):(m.scale==="x"?xAt(zs[0],m):zs[0]));
  if(zs.length>1&&m.type!=="absGreater") $("bInput").value=exact(m.scale==="x"?xAt(zs[1],m):zs[1]);
}
controls.forEach(id=>$(id).addEventListener("input",()=>{ $("estimateFeedback").textContent="Question changed. Make a new estimate, then check."; update(); }));
$("regionType").addEventListener("change",update);
$("solveMode").addEventListener("change",()=>{
  if(current&&$("solveMode").value==="probability") writeCutoffs(current.zs,current);
  update();
});
$("inputScale").addEventListener("change",()=>{
  if(current) writeCutoffs(current.zs,{...current,scale:$("inputScale").value});
  update();
});
for(const [id,index] of [["aSlider",0],["bSlider",1]]) $(id).addEventListener("input",()=>{
  if(!current) return;
  const m=current, z=Number($(id).value), zs=[...m.zs];
  if(m.type==="absGreater") {zs[0]=-Math.abs(z);zs[1]=Math.abs(z);}
  else {zs[index]=z;if(zs.length>1) zs.sort((a,b)=>a-b);}
  writeCutoffs(zs,m);update();
});
function setExample(kind) {
  const standard=kind==="standard";
  $("muInput").value=standard?0:100;$("sigmaInput").value=standard?1:15;
  $("solveMode").value=["percentile","central"].includes(kind)?"inverse":"probability";
  $("regionType").value=kind==="standard"?"right":["central","between"].includes(kind)?"between":"left";
  $("inputScale").value=standard?"z":"x";
  $("aInput").value=standard?1.15:kind==="between"?85:130;
  $("bInput").value=kind==="between"?115:145;
  $("probabilityInput").value=0.95;$("estimateInput").value="";
  $("estimateFeedback").textContent="Estimate the shaded fraction, then compare it with the answer.";
  update();
}
document.querySelectorAll("[data-example]").forEach(b=>b.addEventListener("click",()=>setExample(b.dataset.example)));
$("resetStart").addEventListener("click",()=>setExample("below"));
$("standardNormal").addEventListener("click",()=>{
  const zs=current?.zs??[2,3]; $("muInput").value=0;$("sigmaInput").value=1;$("inputScale").value="z";
  if(current) writeCutoffs(zs,{...current,mu:0,sigma:1,scale:"z"});
  update();
});
$("checkEstimate").addEventListener("click",()=>{
  let estimate;
  try {estimate=number("estimateInput","your estimate");if(estimate<0||estimate>1)throw new Error("Enter a probability from 0 through 1.");if(!current)throw new Error("Correct the model inputs first.");}
  catch(e){$("estimateFeedback").textContent=e.message;return;}
  const error=Math.abs(estimate-current.p);
  $("estimateFeedback").textContent=`${error<=0.01?"Strong estimate!":error<=0.05?"Close!":"Compare your estimate with the shaded fraction."} Your estimate: ${prob(estimate)}. Calculated area: ${prob(current.p)}.`;
});
$("excelFormulas").addEventListener("click",async(event)=>{
  const button=event.target.closest("[data-copy]");if(!button)return;
  try {await navigator.clipboard.writeText(button.dataset.copy);$("copyStatus").textContent="Excel formula copied.";}
  catch {$("copyStatus").textContent="Select the displayed formula and copy it with Ctrl+C (or Command+C).";}
});
function point(event) {
  const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
function target(p) {
  if(!current||p.y<35||p.y>axisY+15||p.x<leftPad||p.x>width-leftPad)return null;
  const i=current.zs.findIndex(z=>Math.abs(toX(z)-p.x)<20);
  if(i>=0)return {kind:"edge",index:i};
  const z=fromX(p.x);
  if(p.y>=toY(z)-10&&current.segments.some(([a,b])=>z>=a&&z<=b))return {kind:current.type==="between"&&current.mode==="probability"?"band":"edge",index:current.type==="absGreater"&&z>0?1:0};
  return null;
}
svg.addEventListener("pointerdown",event=>{
  const p=point(event),t=target(p);if(!t)return;
  drag={...t,id:event.pointerId,start:fromX(p.x),radius,model:current};
  svg.setPointerCapture(event.pointerId);svg.style.cursor="grabbing";event.preventDefault();
});
svg.addEventListener("pointermove",event=>{
  const p=point(event);if(!drag){svg.style.cursor=target(p)?"ew-resize":"default";return;}
  const m=drag.model,z=Number(clamp(fromX(p.x),-radius,radius).toFixed(2));
  let zs=[...m.zs];
  if(m.mode==="inverse") {
    let pValue=m.type==="left"?cdf(z):m.type==="right"?sf(z):m.type==="between"?interval(-Math.abs(z),Math.abs(z)):2*sf(Math.abs(z));
    // Endpoints have infinite quantiles; keep dragging inside the finite inverse domain.
    pValue=clamp(pValue,1e-12,1-1e-12);$("probabilityInput").value=exact(pValue);
  } else {
    if(m.type==="absGreater") zs=[-Math.abs(z),Math.abs(z)];
    else if(drag.kind==="band") {
      const delta=clamp(z-drag.start,-radius-m.a,radius-m.b);zs=[m.a+delta,m.b+delta];
    } else {zs[drag.index]=z;if(zs.length>1)zs.sort((a,b)=>a-b);}
    writeCutoffs(zs,m);
  }
  update();
});
function endDrag(){if(!drag)return;drag=null;svg.style.cursor="default";update();}
svg.addEventListener("pointerup",endDrag);svg.addEventListener("pointercancel",endDrag);svg.addEventListener("lostpointercapture",endDrag);
update();
