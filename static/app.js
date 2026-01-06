// Canvas + UI elementi
const canvas = document.getElementById("road");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const tooltipEl = document.getElementById("tooltip");

// Lokalni odsev UI-ja (ne samo backend stanja)
// - limits
// - obstacles: dodane ovire - da lahko damo za init
// - running in timer: kontrola avtomatskega poteka simulacije
// - lastState: zadnje stanje iz backenda (za risanje in misko over)
const limits = [];
const obstacles = [];
let running = false;
let timer = null;
let lastState = null;
let lastCarPositions = [];

// Ideja da potem dodam scenarije ob predstavitvi, trenutno za testiranje
const scenarios = {
  scenario1: {
    dolzina_ceste: 100,
    p_zaviranje: 0,
    lookahead: 5,
    omejitve: [{od: 15, do: 35, max_hitrost: 3 }],
    ovire: [],
    cars: [
      {poz: 8, pas: 0, max_hitrost: 3, color: "#e76f51" }, 
      {poz: 6, pas: 1, max_hitrost: 10, color: "#2a5a9dff" }]
  },
  scenario2: {
    dolzina_ceste: 100,
    p_zaviranje: 0.2,
    lookahead: 15,
    omejitve: [],
    ovire: [],
    cars: [
      {poz: 8, pas: 0, max_hitrost: 3, color: "#e76f51" }, 
      {poz: 6, pas: 1, max_hitrost: 10, color: "#2a5a9dff" },
      {poz: 20, pas: 0, max_hitrost: 10, color: "#4a8ca7ff" }]
  },
  scenario3: {
    dolzina_ceste: 100,
    p_zaviranje: 0.2,
    lookahead: 15,
    omejitve: [],
    ovire: [{poz: 15, pas: 0 }, {poz: 16, pas: 0 }, {poz: 17, pas: 0 }, {poz: 18, pas: 0 }],
    cars: [
      {poz: 8, pas: 0, max_hitrost: 3, color: "#e76f51" }, 
      {poz: 6, pas: 1, max_hitrost: 10, color: "#2a5a9dff" },
      {poz: 20, pas: 0, max_hitrost: 10, color: "#4a8ca7ff" }]
  },
};

function updateLimitsList() {
  // Izpisane trenutno nastavljene omejitve
  const list = document.getElementById("limitsList");
  if (!limits.length) {
    list.textContent = "Brez omejitev";
    return;
  }
  list.innerHTML = "";
  limits.forEach((limit, idx) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.textContent = `[${limit.od}, ${limit.do}) -> ${limit.max_hitrost}`;

    // Da lahko odstranimo omejitev
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-remove";
    btn.textContent = "X";
    // odstrani, posodobimo 
    btn.addEventListener("click", () => {
      limits.splice(idx, 1);
      updateLimitsList();
      api("/set_limits", { omejitve: limits }).then(fetchState).then(draw);
    });
    row.appendChild(btn);
    list.appendChild(row);
  });
}

function setScenarioUI(config) {
  // Posodobi UI polja glede na izbrani scenarij.
  document.getElementById("dolzina").value = config.dolzina_ceste;
  document.getElementById("pZaviranja").value = config.p_zaviranje;
  document.getElementById("lookahead").value = config.lookahead;

  limits.length = 0;
  config.omejitve.forEach((l) => limits.push({ ...l }));
  updateLimitsList();

  obstacles.length = 0;
  config.ovire.forEach((o) => obstacles.push({ ...o }));
}

async function runScenario(config) {
  // Nalozi scenarij v UI in naredi init + random avte.
  setScenarioUI(config);
  await api("/set_limits", { omejitve: limits });
  await api("/set_lookahead", { lookahead: config.lookahead });
  await api("/init", {
    dolzina_ceste: config.dolzina_ceste,
    p_zaviranje: config.p_zaviranje,
    lookahead: config.lookahead,
    omejitve: limits,
    ovire: obstacles,
    random: Boolean(config.random),
    gostota: config.random?.gostota,
    max_hitrost_interval: config.random?.max_hitrost_interval,
  });
  if (config.cars && config.cars.length) {
    for (const car of config.cars) {
      await api("/add_vozilo", car);
    }
  }
  const state = await fetchState();
  draw(state);
}

function getParams() {
  // Prebere parametre ceste iz obrazca
  // st_pasov fiksno 2
  return {
    dolzina_ceste: Number(document.getElementById("dolzina").value),
    st_pasov: 2,
    p_zaviranje: Number(document.getElementById("pZaviranja").value),
    lookahead: Number(document.getElementById("lookahead").value),
  };
}

async function api(path, body) {
  // Pomozna funkcija - poslje JSON na backend in vrne JSON odgovor
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function fetchState() {
  // Preberemo trenutno stanje simulacije (avti, ovire, omejitve)
  const res = await fetch("/state");
  return res.json();
}

function draw(state) {
  // Centralna funkcija za risanje na canvas
  // 1) preveri če model sploh obstaja,
  // 2) narise grid ceste,
  // 3) narise omejitve hitrosti,
  // 4) narise ovire in avte,
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!state || !state.dolzina_ceste || !state.st_pasov) {
    statusEl.textContent = "Ni modela";
    lastState = null;
    return;
  }
  lastState = state;
  lastCarPositions = [];

  const mode = document.getElementById("viewMode").value; // dodana izbira ravna ali krozna cesta
  const showGrid = document.getElementById("showGrid").checked;

  // Geometrija risanja: padding in velikost ene celice v gridu
  const len = state.dolzina_ceste;
  const lanes = state.st_pasov;
  const padX = 10;
  const padY = 20;
  const cellW = (canvas.width - padX * 2) / len;
  const cellH = (canvas.height - padY * 2) / lanes;
  const laneY = (pas) => padY + (lanes - 1 - pas) * cellH;

  // Vizualizacija ceste: ozadje + robovi + crtkana sredinska crta.
  if (mode === "linear") {
    ctx.fillStyle = "#eae0cf";
    ctx.fillRect(padX, padY, len * cellW, lanes * cellH);

    ctx.strokeStyle = "#cbb99d";
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, padY, len * cellW, lanes * cellH);

    // Sredinska crtkana crta med pasovi.
    const midY = padY + cellH;
    ctx.save();
    ctx.strokeStyle = "#c2a57a";
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(padX, midY);
    ctx.lineTo(padX + len * cellW, midY);
    ctx.stroke();
    ctx.restore();

    if (showGrid) {
      ctx.strokeStyle = "rgba(160, 140, 110, 0.35)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= len; i++) {
        const x = padX + i * cellW;
        ctx.beginPath();
        ctx.moveTo(x, padY);
        ctx.lineTo(x, padY + lanes * cellH);
        ctx.stroke();
      }
      for (let j = 0; j <= lanes; j++) {
        const y = padY + j * cellH;
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(padX + len * cellW, y);
        ctx.stroke();
      }
    }
  } else { //KROZNI DEL
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const centerRadius = Math.min(canvas.width, canvas.height) * 0.44;
    const laneSpacing = 34;

    ctx.strokeStyle = "#cbb99d";
    ctx.lineWidth = 3;
    const outerRadius = centerRadius + laneSpacing / 2;
    const innerRadius = centerRadius - laneSpacing / 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = "#c2a57a";
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (showGrid) {
      ctx.strokeStyle = "rgba(160, 140, 110, 0.35)";
      ctx.lineWidth = 1;
      for (let i = 0; i < len; i += 2) {
        const angle = (i / len) * Math.PI * 2;
        const x1 = centerX + innerRadius * Math.cos(angle);
        const y1 = centerY + innerRadius * Math.sin(angle);
        const x2 = centerX + outerRadius * Math.cos(angle);
        const y2 = centerY + outerRadius * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
  }

  // Omejitve hitrosti: backend poslje seznam po pozicijah
  // Zdruzim zaporedne enake vrednosti v skupen delcek
  const omejitve = state.omejitve || [];
  let start = null;
  let current = null;
  for (let i = 0; i <= omejitve.length; i++) {
    const value = i < omejitve.length ? omejitve[i] : null;
    if (value !== current) {
      if (current !== null && start !== null) {
        const x = padX + start * cellW;
        const w = (i - start) * cellW;
        ctx.fillStyle = "rgba(244, 162, 97, 0.35)";
        ctx.fillRect(x, padY, w, lanes * cellH);
        ctx.fillStyle = "#7a3b00";
        ctx.font = "12px Trebuchet MS";
        ctx.fillText(String(current), x + w / 2 - 4, padY + 12);
      }
      start = value !== null ? i : null;
      current = value;
    }
  }

  // Ovire (crni kvadratki) - vedno v celici svoje pozicije
  for (const ovira of state.ovire || []) {
    let x;
    let y;
    if (mode === "linear") {
      x = padX + ovira.poz * cellW;
      y = laneY(ovira.pas);
    } else { // ce je krozno je ovira del loka
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const centerRadius = Math.min(canvas.width, canvas.height) * 0.44;
      const laneSpacing = 34;
      const radius = centerRadius + (ovira.pas === 0 ? -laneSpacing / 2 : laneSpacing / 2);
      const angle = (ovira.poz / len) * Math.PI * 2;
      x = centerX + radius * Math.cos(angle);
      y = centerY + radius * Math.sin(angle);
    }
    ctx.fillStyle = "#111111";
    if (mode === "linear") {
      ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
    } else {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const centerRadius = Math.min(canvas.width, canvas.height) * 0.44;
      const laneSpacing = 34;
      const radius = centerRadius + (ovira.pas === 0 ? -laneSpacing / 2 : laneSpacing / 2);
      const baseAngle = (ovira.poz / len) * Math.PI * 2;
      const arc = (2 * Math.PI) / len;
      ctx.save();
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = laneSpacing - 12;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, baseAngle - arc * 0.45, baseAngle + arc * 0.45);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Avti
  for (const avto of state.avti || []) {
    const dolzina = Math.max(1, Number(avto.dolzina || 1));
    const positions = [];
    for (let i = 0; i < dolzina; i += 1) {
      positions.push((avto.poz - i + len) % len);
    }
    let x;
    let y;
    if (mode === "linear") {
      x = padX + avto.poz * cellW;
      y = laneY(avto.pas);
    } else {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const centerRadius = Math.min(canvas.width, canvas.height) * 0.44;
      const laneSpacing = 34;
      const radius = centerRadius + (avto.pas === 0 ? -laneSpacing / 2 : laneSpacing / 2);
      const angle = (avto.poz / len) * Math.PI * 2;
      x = centerX + radius * Math.cos(angle);
      y = centerY + radius * Math.sin(angle);
    }
    ctx.fillStyle = avto.color || "#2a9d8f";
    if (mode === "linear") {
      for (const pos of positions) {
        const cellX = padX + pos * cellW;
        ctx.fillRect(cellX + 2, y + 2, cellW - 4, cellH - 4);
      }
    } else { //avto krog
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const centerRadius = Math.min(canvas.width, canvas.height) * 0.44;
      const laneSpacing = 34;
      const radius = centerRadius + (avto.pas === 0 ? -laneSpacing / 2 : laneSpacing / 2);
      const arc = (2 * Math.PI) / len;
      ctx.save();
      ctx.strokeStyle = avto.color || "#2a9d8f";
      ctx.lineWidth = laneSpacing - 12;
      ctx.lineCap = "round";
      for (const pos of positions) {
        const baseAngle = (pos / len) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, baseAngle - arc * 0.45, baseAngle + arc * 0.45);
        ctx.stroke();
      }
      ctx.restore();
    }
    lastCarPositions.push({ x, y, avto });
  }

  statusEl.textContent = `Avti: ${state.avti.length}, Ovire: ${state.ovire.length}`;
}

function showTooltip(text, x, y) {
  // Tooltip prikazujem relativno na canvas-wrap
  tooltipEl.textContent = text;
  tooltipEl.style.left = `${x + 10}px`;
  tooltipEl.style.top = `${y + 10}px`;
  tooltipEl.style.opacity = "1";
}

function hideTooltip() {
  // Skrije tooltip.
  tooltipEl.style.opacity = "0";
}

async function initModel(random, randomVehicles) {
  // Inicializacija modela na backendu
  // random=true pomeni, da backend takoj doda nakljucne avte
  const params = getParams();
  const payload = {
    ...params,
    omejitve: limits,
    ovire: obstacles,
    random: Boolean(random),
    random_vozila: Boolean(randomVehicles),
  };
  if (random) {
    payload.gostota = Number(document.getElementById("randGostota").value);
    payload.max_hitrost_interval = [
      Number(document.getElementById("randMin").value),
      Number(document.getElementById("randMax").value),
    ];
  }
  await api("/init", payload);
  const state = await fetchState();
  draw(state);
}

async function step() {
  // Simulacijski korak + spet risanje
  await api("/step", { n: 1 });
  const state = await fetchState();
  draw(state);
}

function toggle() {
  // Start/stop avtomatske animacije
  running = !running;
  const btn = document.getElementById("toggle");
  btn.textContent = running ? "Ustavi" : "Zacni";
  if (running) {
    timer = setInterval(step, 200);
  } else if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// Eventi UI (gumbi, nek potek)
updateLimitsList();

document.getElementById("addLimit").addEventListener("click", () => {
  // Doda omejitev v seznam, gre na backend
  limits.push({
    od: Number(document.getElementById("limOd").value),
    do: Number(document.getElementById("limDo").value),
    max_hitrost: Number(document.getElementById("limMax").value),
  });
  updateLimitsList();
  api("/set_limits", { omejitve: limits }).then(fetchState).then(draw);
});

document.getElementById("init").addEventListener("click", () => initModel(false));

document.getElementById("randomCars").addEventListener("click", () => initModel(true));
document.getElementById("randomVehicles").addEventListener("click", () => initModel(true, true));

document.getElementById("addCar").addEventListener("click", async () => {
  // Dodamo avto
  await api("/add_vozilo", {
    poz: Number(document.getElementById("carPoz").value),
    pas: Number(document.getElementById("carPas").value),
    max_hitrost: Number(document.getElementById("carMax").value),
    tip: document.getElementById("carType").value,
  });
  const state = await fetchState();
  draw(state);
});

document.getElementById("addObstacle").addEventListener("click", async () => {
  // Dodamo oviro (lahko tudi daljso).
  const start = Number(document.getElementById("obsPoz").value);
  const pas = Number(document.getElementById("obsPas").value);
  const len = Number(document.getElementById("obsLen").value);
  const roadLen = lastState?.dolzina_ceste || Number(document.getElementById("dolzina").value);

  for (let i = 0; i < len; i += 1) {
    const poz = (start + i) % roadLen;
    const ovira = { poz, pas };
    obstacles.push(ovira);
    await api("/add_obstacle", ovira);
  }
  const state = await fetchState();
  draw(state);
});

document.getElementById("step").addEventListener("click", step);

document.getElementById("toggle").addEventListener("click", toggle);

document.getElementById("setLookahead").addEventListener("click", async () => {
  // Posodobimo lookahead za obstojec model.
  const lookahead = Number(document.getElementById("lookahead").value);
  await api("/set_lookahead", { lookahead });
  const state = await fetchState();
  draw(state);
});

document.getElementById("scenario1").addEventListener("click", () => runScenario(scenarios.scenario1));
document.getElementById("scenario2").addEventListener("click", () => runScenario(scenarios.scenario2));
document.getElementById("scenario3").addEventListener("click", () => runScenario(scenarios.scenario3));

fetchState().then(draw);

canvas.addEventListener("mousemove", (event) => {
  // Tooltip: ali je pod misko avto, vrednost hitrost in max_hitrost
  // Rabim pretvorbo iz koordinat zaslona v koordinate canvasa.
  if (!lastState) {
    hideTooltip();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const xCanvas = (event.clientX - rect.left) * scaleX;
  const yCanvas = (event.clientY - rect.top) * scaleY;
  const wrapRect = canvas.parentElement.getBoundingClientRect();
  const xWrap = event.clientX - wrapRect.left;
  const yWrap = event.clientY - wrapRect.top;

  const mode = document.getElementById("viewMode").value;
  const padX = 10;
  const padY = 20;
  const len = lastState.dolzina_ceste;
  const lanes = lastState.st_pasov;
  const cellW = (canvas.width - padX * 2) / len;
  const cellH = (canvas.height - padY * 2) / lanes;

  if (mode === "linear") {
    if (xCanvas < padX || yCanvas < padY || xCanvas > padX + len * cellW || yCanvas > padY + lanes * cellH) {
      hideTooltip();
      return;
    }

    const poz = Math.floor((xCanvas - padX) / cellW);
    const row = Math.floor((yCanvas - padY) / cellH);
    const pas = lanes - 1 - row;

    const avto = (lastState.avti || []).find((a) => a.poz === poz && a.pas === pas);
    if (avto) {
      showTooltip(`tip: ${avto.tip || "avto"}, hitrost: ${avto.hitrost}, max: ${avto.max_hitrost}`, xWrap, yWrap);
    } else {
      hideTooltip();
    }
    return;
  }

  // Krozna vizualizacija: najdi najblizji avto po razdalji.
  let closest = null;
  let minDist = 9999;
  for (const item of lastCarPositions) {
    const dx = item.x - xCanvas;
    const dy = item.y - yCanvas;
    const dist = Math.hypot(dx, dy);
    if (dist < minDist) {
      minDist = dist;
      closest = item.avto;
    }
  }
  if (closest && minDist < 12) {
    showTooltip(`tip: ${avto.tip || "avto"}, hitrost: ${closest.hitrost}, max: ${closest.max_hitrost}`, xWrap, yWrap);
  } else {
    hideTooltip();
  }
});

canvas.addEventListener("mouseleave", hideTooltip);
