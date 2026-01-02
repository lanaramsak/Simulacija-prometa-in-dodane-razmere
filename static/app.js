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

function updateLimitsList() {
  // Izpisane trenutno nastavljene omejitve
  const list = document.getElementById("limitsList");
  if (!limits.length) {
    list.textContent = "Brez omejitev";
    return;
  }
  list.textContent = limits
    .map((l) => `[${l.od}, ${l.do}) -> ${l.max_hitrost}`)
    .join(" | ");
}

function getParams() {
  // Prebere parametre ceste iz obrazca
  // st_pasov fiksno 2
  return {
    dolzina_ceste: Number(document.getElementById("dolzina").value),
    st_pasov: 2,
    p_zaviranje: Number(document.getElementById("pZaviranja").value),
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

  // Geometrija risanja: padding in velikost ene celice v gridu
  const pad = 20;
  const len = state.dolzina_ceste;
  const lanes = state.st_pasov;
  const cellW = (canvas.width - pad * 2) / len;
  const cellH = (canvas.height - pad * 2) / lanes;

  // grid ceste (celice po pasovih in poziciji)
  ctx.strokeStyle = "#d6c7b2";
  ctx.lineWidth = 1;
  for (let i = 0; i <= len; i++) {
    const x = pad + i * cellW;
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, pad + lanes * cellH);
    ctx.stroke();
  }
  for (let j = 0; j <= lanes; j++) {
    const y = pad + j * cellH;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(pad + len * cellW, y);
    ctx.stroke();
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
        const x = pad + start * cellW;
        const w = (i - start) * cellW;
        ctx.fillStyle = "rgba(244, 162, 97, 0.35)";
        ctx.fillRect(x, pad, w, lanes * cellH);
        ctx.fillStyle = "#7a3b00";
        ctx.font = "12px Trebuchet MS";
        ctx.fillText(String(current), x + w / 2 - 4, pad + 12);
      }
      start = value !== null ? i : null;
      current = value;
    }
  }

  // Ovire (crni kvadratki) - vedno v celici svoje pozicije
  for (const ovira of state.ovire || []) {
    const x = pad + ovira.poz * cellW;
    const y = pad + ovira.pas * cellH;
    ctx.fillStyle = "#111111";
    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
  }

  // Avti
  for (const avto of state.avti || []) {
    const x = pad + avto.poz * cellW;
    const y = pad + avto.pas * cellH;
    ctx.fillStyle = avto.color || "#2a9d8f";
    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
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

async function initModel(random) {
  // Inicializacija modela na backendu
  // random=true pomeni, da backend takoj doda nakljucne avte
  const params = getParams();
  const payload = {
    ...params,
    omejitve: limits,
    ovire: obstacles,
    random: Boolean(random),
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

document.getElementById("addCar").addEventListener("click", async () => {
  // Dodamo avto
  await api("/add_car", {
    poz: Number(document.getElementById("carPoz").value),
    pas: Number(document.getElementById("carPas").value),
    max_hitrost: Number(document.getElementById("carMax").value),
  });
  const state = await fetchState();
  draw(state);
});

document.getElementById("addObstacle").addEventListener("click", async () => {
  // Dodamo oviro
  const ovira = {
    poz: Number(document.getElementById("obsPoz").value),
    pas: Number(document.getElementById("obsPas").value),
  };
  obstacles.push(ovira);
  await api("/add_obstacle", ovira);
  const state = await fetchState();
  draw(state);
});

document.getElementById("step").addEventListener("click", step);

document.getElementById("toggle").addEventListener("click", toggle);

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

  const pad = 20;
  const len = lastState.dolzina_ceste;
  const lanes = lastState.st_pasov;
  const cellW = (canvas.width - pad * 2) / len;
  const cellH = (canvas.height - pad * 2) / lanes;

  if (xCanvas < pad || yCanvas < pad || xCanvas > pad + len * cellW || yCanvas > pad + lanes * cellH) {
    hideTooltip();
    return;
  }

  const poz = Math.floor((xCanvas - pad) / cellW);
  const pas = Math.floor((yCanvas - pad) / cellH);

  const avto = (lastState.avti || []).find((a) => a.poz === poz && a.pas === pas);
  if (avto) {
    showTooltip(`hitrost: ${avto.hitrost}, max: ${avto.max_hitrost}`, xWrap, yWrap);
  } else {
    hideTooltip();
  }
});

canvas.addEventListener("mouseleave", hideTooltip);
