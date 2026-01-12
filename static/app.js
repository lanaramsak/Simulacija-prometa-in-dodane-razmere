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
const defaultLimits = [{ od: 150, do: 250, max_hitrost: 3 }];
const defaultObstacles = [{ poz: 200, pas: 0, len: 100 }];
limits.push(...defaultLimits);
obstacles.push(...defaultObstacles);
let running = false;
let timer = null;
let lastState = null;
let lastCarPositions = [];

// Ideja da potem dodam scenarije ob predstavitvi, trenutno za testiranje
const scenarios = {
  scenario1: {
    dolzina_ceste: 300,
    p_zaviranje: 0,
    lookahead: 15,
    omejitve: [],
    ovire: [],
    cars: [
      {poz: 110, pas: 0, max_hitrost: 4, tip: "avto", color: "#e76f51" },
      {poz: 90, pas: 0, max_hitrost: 3, tip: "avto", color: "#7c1d05" },
      {poz: 60, pas: 0, max_hitrost: 9, tip: "avto", color: "#003350" },
      {poz: 40, pas: 0, max_hitrost: 8, tip: "avto", color: "#457b9d" }
    ]
  },
  scenario2: {
    dolzina_ceste: 350,
    p_zaviranje: 0,
    lookahead: 15,
    omejitve: [],
    ovire: [],
    cars: [
      {poz: 180, pas: 0, max_hitrost: 3, tip: "tovornjak", color: "#e76f51" },
      {poz: 155, pas: 0, max_hitrost: 4, tip: "tovornjak", color: "#7c1d05" },
      {poz: 250, pas: 0, max_hitrost: 7, tip: "avto", color: "#003350" },
      {poz: 260, pas: 0, max_hitrost: 8, tip: "avto", color: "#457b9d" },
      {poz: 270, pas: 0, max_hitrost: 7, tip: "avto", color: "#003350" },
      {poz: 280, pas: 0, max_hitrost: 8, tip: "avto", color: "#457b9d" },
      {poz: 290, pas: 0, max_hitrost: 7, tip: "avto", color: "#003350" },
      {poz: 80, pas: 0, max_hitrost: 8, tip: "avto", color: "#457b9d" },
      {poz: 100, pas: 0, max_hitrost: 7, tip: "avto", color: "#003350" },
      {poz: 120, pas: 0, max_hitrost: 8, tip: "avto", color: "#457b9d" },
      {poz: 5, pas: 0, max_hitrost: 7, tip: "avto", color: "#003350" },
      {poz: 90, pas: 0, max_hitrost: 8, tip: "avto", color: "#457b9d" },
      {poz: 20, pas: 0, max_hitrost: 7, tip: "avto", color: "#003350" },
      {poz: 200, pas: 0, max_hitrost: 8, tip: "avto", color: "#457b9d" }
    ]
  },
  scenario3: {
    dolzina_ceste: 600,
    p_zaviranje: 0.2,
    lookahead: 15,
    omejitve: [{ od: 115, do: 140, max_hitrost: 3 }],
    ovire: [{ poz: 140, pas: 0, len: 200 }],
    random: {
      gostota: 0.15,
      max_hitrost_interval: [5, 7],
    },
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

function updateObstaclesList() {
  // Izpisane trenutno nastavljene ovire
  const list = document.getElementById("obstaclesList");
  if (!obstacles.length) {
    list.textContent = "Brez ovir";
    return;
  }
  list.innerHTML = "";
  obstacles.forEach((ovira, idx) => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.textContent = `poz: ${ovira.poz}, pas: ${ovira.pas}, dolzina: ${ovira.len}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "list-remove";
    btn.textContent = "X";
    btn.addEventListener("click", () => {
      const removed = obstacles.splice(idx, 1)[0];
      updateObstaclesList();
      api("/remove_obstacle", { poz: removed.poz, pas: removed.pas, len: removed.len })
        .then(fetchState)
        .then(draw);
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
  config.ovire.forEach((o) => obstacles.push({ ...o, len: o.len || 1 }));
  updateObstaclesList();
}

async function runScenario(config) {
  // Nalozi scenarij v UI in naredi init + random avte.
  setScenarioUI(config);
  await api("/set_limits", { omejitve: limits });
  await api("/set_lookahead", { lookahead: config.lookahead });
  const ovireExpanded = [];
  for (const ovira of obstacles) {
    const len = Math.max(1, Number(ovira.len || 1));
    for (let i = 0; i < len; i += 1) {
      ovireExpanded.push({ poz: (ovira.poz + i) % config.dolzina_ceste, pas: ovira.pas });
    }
  }
  await api("/init", {
    dolzina_ceste: config.dolzina_ceste,
    p_zaviranje: config.p_zaviranje,
    lookahead: config.lookahead,
    omejitve: limits,
    ovire: ovireExpanded,
    random: Boolean(config.random),
    gostota: config.random?.gostota,
    max_hitrost_interval: config.random?.max_hitrost_interval,
    truck_cap_enabled: document.getElementById("truckCap").checked,
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
  const truckCapEl = document.getElementById("truckCap");
  if (truckCapEl && typeof state.truck_cap_enabled === "boolean") {
    truckCapEl.checked = state.truck_cap_enabled;
  }
  lastState = state;
  lastCarPositions = [];

  const mode = document.getElementById("viewMode").value; // dodana izbira ravna ali krozna cesta
  const showGrid = document.getElementById("showGrid").checked;

  // Geometrija risanja: tanjsa cesta, 3 vrstice, vecje kvadratne celice
  const len = state.dolzina_ceste;
  const lanes = state.st_pasov;
  const padX = 18;
  const padY = 30;
  const baseCellW = (canvas.width - padX * 2) / len;
  const baseCellH = (canvas.height - padY * 2) / lanes;
  const targetRowLen = 120;
  const rows = Math.max(1, Math.ceil(len / targetRowLen));
  const perRow = Math.ceil(len / rows);
  const rowGap = 18;
  const fixedRoadW = canvas.width - padX * 2;
  const maxCellH = (canvas.height - padY * 2 - rowGap * (rows - 1)) / (lanes * rows);
  const cellW = fixedRoadW / perRow;
  const cellH = maxCellH;
  const roadW = fixedRoadW;
  const roadH = lanes * rows * cellH + (rows - 1) * rowGap;
  const roadX = (canvas.width - roadW) / 2;
  const roadY = (canvas.height - roadH) / 2;

  const laneY = (pas, row) => {
    const segmentTop = roadY + row * (lanes * cellH + rowGap);
    return segmentTop + (lanes - 1 - pas) * cellH;
  };

  const posToCell = (poz, pas) => {
    const row = Math.floor(poz / perRow);
    const col = poz % perRow;
    const rowCol = col;
    const x = roadX + rowCol * cellW;
    const y = laneY(pas, row);
    return { x, y, row, col: rowCol };
  };

  // Vizualizacija ceste: ozadje + robovi + crtkana sredinska crta.
  if (mode === "linear") {
    for (let row = 0; row < rows; row += 1) {
      const segmentX = roadX;
      const segmentY = roadY + row * (lanes * cellH + rowGap);
      const segmentW = roadW;
      const segmentH = lanes * cellH;

      // Asfalt + mehki robovi (papir + ilustriran stil).
      const roadGrad = ctx.createLinearGradient(segmentX, segmentY, segmentX, segmentY + segmentH);
      roadGrad.addColorStop(0, "#b8b8b8");
      roadGrad.addColorStop(1, "#a9a9a9");
      ctx.fillStyle = roadGrad;
      ctx.fillRect(segmentX, segmentY, segmentW, segmentH);

      ctx.strokeStyle = "#2f2f2f";
      ctx.lineWidth = 3;
      ctx.strokeRect(segmentX, segmentY, segmentW, segmentH);

      // Robne bele crte.
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(segmentX, segmentY + 4);
      ctx.lineTo(segmentX + segmentW, segmentY + 4);
      ctx.moveTo(segmentX, segmentY + segmentH - 4);
      ctx.lineTo(segmentX + segmentW, segmentY + segmentH - 4);
      ctx.stroke();
      ctx.restore();

      // Sredinska crtkana crta med pasovi.
      const midY = segmentY + cellH;
      ctx.save();
      ctx.strokeStyle = "#f6f6f6";
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.moveTo(segmentX + 10, midY);
      ctx.lineTo(segmentX + segmentW - 10, midY);
      ctx.stroke();
      ctx.restore();
    }

    if (showGrid) {
      ctx.strokeStyle = "rgba(160, 140, 110, 0.35)";
      ctx.lineWidth = 1;
      for (let row = 0; row < rows; row += 1) {
        const segmentY = roadY + row * (lanes * cellH + rowGap);
        for (let i = 0; i <= perRow; i++) {
          const x = roadX + i * cellW;
          ctx.beginPath();
          ctx.moveTo(x, segmentY);
          ctx.lineTo(x, segmentY + lanes * cellH);
          ctx.stroke();
        }
        for (let j = 0; j <= lanes; j++) {
          const y = segmentY + j * cellH;
          ctx.beginPath();
          ctx.moveTo(roadX, y);
          ctx.lineTo(roadX + roadW, y);
          ctx.stroke();
        }
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
  const omejitve = state.omejitve || [];
  if (mode === "linear") {
    for (let i = 0; i < omejitve.length; i += 1) {
      const value = omejitve[i];
      if (value == null) continue;
      const cell = posToCell(i, 0);
      ctx.fillStyle = "rgba(244, 162, 97, 0.3)";
      ctx.fillRect(
        cell.x,
        roadY + cell.row * (lanes * cellH + rowGap),
        cellW,
        lanes * cellH
      );
      ctx.fillStyle = "#7a3b00";
      ctx.font = "12px Trebuchet MS";
      ctx.fillText(
        String(value),
        cell.x + cellW / 2 - 4,
        roadY + cell.row * (lanes * cellH + rowGap) + 12
      );
    }
  } else {
    // Zdruzim zaporedne enake vrednosti v skupen delcek
    let start = null;
    let current = null;
    for (let i = 0; i <= omejitve.length; i++) {
      const value = i < omejitve.length ? omejitve[i] : null;
      if (value !== current) {
        if (current !== null && start !== null) {
          const x = padX + start * baseCellW;
          const w = (i - start) * baseCellW;
          ctx.fillStyle = "rgba(244, 162, 97, 0.35)";
          ctx.fillRect(x, padY, w, lanes * baseCellH);
          ctx.fillStyle = "#7a3b00";
          ctx.font = "12px Trebuchet MS";
          ctx.fillText(String(current), x + w / 2 - 4, padY + 12);
        }
        start = value !== null ? i : null;
        current = value;
      }
    }
  }

  // Ovire (crni kvadratki) - vedno v celici svoje pozicije
  for (const ovira of state.ovire || []) {
    let x;
    let y;
    if (mode === "linear") {
      const cell = posToCell(ovira.poz, ovira.pas);
      x = cell.x;
      y = cell.y;
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
      ctx.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);
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

  function roundRectPath(x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }

  function drawCarLinear(avto, positions) {
    // Stiliziran avto: en "krog" (kapsula) cez vec celic
    const byRow = new Map();
    for (const pos of positions) {
      const cell = posToCell(pos, avto.pas);
      if (!byRow.has(cell.row)) {
        byRow.set(cell.row, []);
      }
      byRow.get(cell.row).push(cell.col);
    }

    for (const [row, cols] of byRow.entries()) {
      const minCol = Math.min(...cols);
      const maxCol = Math.max(...cols);
      const x = roadX + minCol * cellW + 4;
      const y = laneY(avto.pas, row) + 6;
      const w = Math.max(16, (maxCol - minCol + 1) * cellW - 8);
      const h = Math.max(14, cellH - 12);
      const radius = Math.min(20, h / 2);

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      roundRectPath(x + 3, y + 3, w, h, radius);
      ctx.fill();

      ctx.fillStyle = avto.color || "#2a9d8f";
      ctx.strokeStyle = "#1f1f1f";
      ctx.lineWidth = 2;
      roundRectPath(x, y, w, h, radius);
      ctx.fill();
      ctx.stroke();

      // Gume na straneh
      ctx.fillStyle = "#0f0f0f";
      const wheelR = Math.max(3, Math.min(6, h * 0.25));
      const wheelY = y + h - wheelR * 0.3;
      ctx.beginPath();
      ctx.arc(x + wheelR * 1.1, wheelY, wheelR, 0, Math.PI * 2);
      ctx.arc(x + w - wheelR * 1.1, wheelY, wheelR, 0, Math.PI * 2);
      ctx.fill();
      const wheelTopY = y + wheelR * 0.6;
      ctx.beginPath();
      ctx.arc(x + wheelR * 1.1, wheelTopY, wheelR, 0, Math.PI * 2);
      ctx.arc(x + w - wheelR * 1.1, wheelTopY, wheelR, 0, Math.PI * 2);
      ctx.fill();

      // Dve lucki spredaj
      ctx.fillStyle = "#f8f6c8";
      const lightR = Math.max(2, Math.min(4, h * 0.18));
      const lightX = x + w - lightR * 0.6;
      const lightTop = y + h * 0.3;
      const lightGap = lightR * 2.1;
      ctx.beginPath();
      ctx.arc(lightX, lightTop, lightR, 0, Math.PI * 2);
      ctx.arc(lightX, lightTop + lightGap, lightR, 0, Math.PI * 2);
      ctx.fill();

      const roofW = w * 0.55;
      const roofH = h * 0.55;
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      roundRectPath(x + (w - roofW) / 2, y + h * 0.15, roofW, roofH, radius * 0.7);
      ctx.fill();
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
      const cell = posToCell(avto.poz, avto.pas);
      x = cell.x;
      y = cell.y;
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
      drawCarLinear(avto, positions);
    } else { //avto krog
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const centerRadius = Math.min(canvas.width, canvas.height) * 0.44;
      const laneSpacing = 34;
      const radius = centerRadius + (avto.pas === 0 ? -laneSpacing / 2 : laneSpacing / 2);
      ctx.save();
      ctx.strokeStyle = avto.color || "#2a9d8f";
      ctx.lineWidth = laneSpacing - 12;
      ctx.lineCap = "round";
      const arcSpan = (dolzina / len) * Math.PI * 2;
      const baseAngle = (avto.poz / len) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, baseAngle - arcSpan, baseAngle);
      ctx.stroke();
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
  const roadLen = Number(document.getElementById("dolzina").value);
  const ovireExpanded = [];
  for (const ovira of obstacles) {
    const len = Math.max(1, Number(ovira.len || 1));
    for (let i = 0; i < len; i += 1) {
      ovireExpanded.push({ poz: (ovira.poz + i) % roadLen, pas: ovira.pas });
    }
  }
  const payload = {
    ...params,
    omejitve: limits,
    ovire: ovireExpanded,
    random: Boolean(random),
    random_vozila: Boolean(randomVehicles),
    truck_cap_enabled: document.getElementById("truckCap").checked,
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
updateObstaclesList();

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

  obstacles.push({ poz: start, pas, len });
  for (let i = 0; i < len; i += 1) {
    const poz = (start + i) % roadLen;
    const ovira = { poz, pas };
    await api("/add_obstacle", ovira);
  }
  updateObstaclesList();
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

document.getElementById("truckCap").addEventListener("change", async (event) => {
  if (!lastState) {
    return;
  }
  await api("/set_truck_cap", { enabled: event.target.checked, max_speed: 4 });
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
  const padX = 18;
  const padY = 30;
  const len = lastState.dolzina_ceste;
  const lanes = lastState.st_pasov;
  const targetRowLen = 120;
  const rows = Math.max(1, Math.ceil(len / targetRowLen));
  const perRow = Math.ceil(len / rows);
  const rowGap = 18;
  const fixedRoadW = canvas.width - padX * 2;
  const maxCellH = (canvas.height - padY * 2 - rowGap * (rows - 1)) / (lanes * rows);
  const cellW = fixedRoadW / perRow;
  const cellH = maxCellH;
  const roadW = fixedRoadW;
  const roadH = lanes * rows * cellH + (rows - 1) * rowGap;
  const roadX = (canvas.width - roadW) / 2;
  const roadY = (canvas.height - roadH) / 2;

  if (mode === "linear") {
    if (xCanvas < roadX || yCanvas < roadY || xCanvas > roadX + roadW || yCanvas > roadY + roadH) {
      hideTooltip();
      return;
    }

    const segmentStride = lanes * cellH + rowGap;
    const row = Math.floor((yCanvas - roadY) / segmentStride);
    const col = Math.floor((xCanvas - roadX) / cellW);
    const localY = yCanvas - (roadY + row * segmentStride);
    if (localY > lanes * cellH) {
      hideTooltip();
      return;
    }
    const pas = lanes - 1 - Math.floor(localY / cellH);
    const poz = row * perRow + col;

    if (poz >= len || row < 0 || row >= rows || col < 0 || col >= perRow) {
      hideTooltip();
      return;
    }

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
