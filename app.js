
const state = {
  data: null,
  catalogTab: "infantry",
  search: "",
  roster: null,
  gameState: {}
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function slugId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultRoster() {
  return {
    schemaVersion: 1,
    game: "arsenal",
    id: slugId("roster"),
    name: "Untitled Operation",
    threatLimit: state.data?.game?.defaultThreatLimit || 50,
    corporateClient: null,
    mcv: {
      profile: null,
      pilotExperience: null,
      integratedComponent: null,
      shield: null,
      sidearm: null,
      primaryWeapons: [],
      equipment: []
    },
    infantry: [],
    backupMCV: null,
    orbitalOrdnance: [],
    displayOrder: []
  };
}

function byId(collection, id) {
  return collection.find(x => x.id === id);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function effectiveLimits() {
  const base = clone(state.data.construction);
  const limits = {
    infantryMax: base.infantry.max,
    specialistMax: base.infantry.specialist.max,
    specialistTypeMax: base.infantry.specialist.maxPerType,
    pilotMin: base.infantry.pilot.min,
    pilotMax: base.infantry.pilot.max,
    ordnanceMax: base.orbitalOrdnance.max,
    primaryMax: state.data.mcvLoadout.primaryWeapons.max,
    equipmentMax: state.data.mcvLoadout.equipment.max
  };

  if (state.roster.corporateClient === "encom") limits.ordnanceMax = 2;
  if (state.roster.backupMCV === "machete") {
    limits.infantryMax = 8;
    limits.specialistMax = 3;
  }
  if (state.roster.mcv.pilotExperience === "veteran") {
    limits.primaryMax = 1;
    limits.equipmentMax = 4;
  }
  return limits;
}

function getInfantryCount() {
  return state.roster.infantry.reduce((sum, x) => sum + x.quantity, 0);
}

function getSpecialistCount() {
  return state.roster.infantry.reduce((sum, x) => {
    const unit = byId(state.data.infantryUnits, x.unitId);
    return sum + (unit?.type === "specialist" ? x.quantity : 0);
  }, 0);
}

function getPilotCount() {
  return state.roster.infantry.reduce((sum, x) => {
    const unit = byId(state.data.infantryUnits, x.unitId);
    return sum + (unit?.type === "pilot" ? x.quantity : 0);
  }, 0);
}

function threatTotal() {
  let total = 0;

  for (const entry of state.roster.infantry) {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    if (unit) total += (unit.threat || 0) * entry.quantity;
  }

  if (state.roster.backupMCV) {
    const backup = byId(state.data.backupMCVs, state.roster.backupMCV);
    total += backup?.threat || 0;
  }

  for (const id of state.roster.orbitalOrdnance) {
    const o = byId(state.data.orbitalOrdnance, id);
    total += o?.threat || 0;
  }

  for (const id of state.roster.mcv.primaryWeapons) {
    total += byId(state.data.mcvWeapons, id)?.threat || 0;
  }

  if (state.roster.mcv.sidearm) {
    total += byId(state.data.mcvWeapons, state.roster.mcv.sidearm)?.threat || 0;
  }

  for (const id of state.roster.mcv.equipment) {
    total += byId(state.data.mcvWeapons, id)?.threat || 0;
  }

  return total;
}

function mcvStats() {
  const p = byId(state.data.mcvProfiles, state.roster.mcv.profile);
  if (!p) return null;

  let speed = p.speed;
  let armor = p.armor;
  let defense = "—";
  let tactics = "—";
  let actions = p.baseActions || 2;

  const exp = byId(state.data.pilotExperience, state.roster.mcv.pilotExperience);
  if (exp) {
    armor += exp.armorModifier || 0;
    actions += exp.actionBonus || 0;
  }

  const pilotUnit = state.data.infantryUnits.find(x => x.experience === state.roster.mcv.pilotExperience);
  if (pilotUnit) tactics = pilotUnit.tactics;

  const comp = byId(state.data.mcvIntegratedComponents, state.roster.mcv.integratedComponent);
  if (comp) {
    speed += comp.speedModifier || 0;
    armor += comp.armorModifier || 0;
  }

  const shield = byId(state.data.mcvShields, state.roster.mcv.shield);
  if (shield) {
    speed += shield.speedModifier || 0;
    armor += shield.armorModifier || 0;
    defense = shield.defense;
  }

  for (const id of state.roster.mcv.equipment) {
    const eq = byId(state.data.mcvEquipment, id);
    if (eq) {
      speed += eq.speedModifier || 0;
      armor += eq.armorModifier || 0;
    }
  }

  return { speed, armor, defense, tactics, actions };
}

function validateRoster() {
  const errors = [];
  const warnings = [];
  const limits = effectiveLimits();
  const total = threatTotal();

  if (!state.roster.corporateClient) errors.push("Select one Corporate Client.");
  if (!state.roster.mcv.profile) errors.push("Choose an MCV profile.");
  if (!state.roster.mcv.pilotExperience) errors.push("Choose Pilot Experience.");
  if (!state.roster.mcv.integratedComponent) errors.push("Choose one Integrated Component.");
  if (!state.roster.mcv.shield) errors.push("Choose one Shield.");
  if (!state.roster.mcv.sidearm) errors.push("Choose one Sidearm.");

  const pilots = getPilotCount();
  if (pilots < limits.pilotMin) errors.push(`Add at least ${limits.pilotMin} Pilot infantry.`);
  if (pilots > limits.pilotMax) errors.push(`Pilot limit exceeded: ${pilots}/${limits.pilotMax}.`);

  const infantry = getInfantryCount();
  if (infantry > limits.infantryMax) errors.push(`Infantry limit exceeded: ${infantry}/${limits.infantryMax}.`);

  const specialists = getSpecialistCount();
  if (specialists > limits.specialistMax) errors.push(`Specialist limit exceeded: ${specialists}/${limits.specialistMax}.`);

  const typeCounts = {};
  for (const entry of state.roster.infantry) {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    if (unit?.type === "specialist") typeCounts[entry.unitId] = (typeCounts[entry.unitId] || 0) + entry.quantity;
  }
  for (const [unitId, qty] of Object.entries(typeCounts)) {
    let max = limits.specialistTypeMax;
    if (state.roster.corporateClient === "nile") max = 3;
    const unit = byId(state.data.infantryUnits, unitId);
    if (unit?.max) max = Math.min(max, unit.max);
    if (qty > max) errors.push(`${unit?.name || unitId} exceeds its limit: ${qty}/${max}.`);
  }

  if (state.roster.mcv.primaryWeapons.length > limits.primaryMax) {
    errors.push(`Primary weapon limit exceeded: ${state.roster.mcv.primaryWeapons.length}/${limits.primaryMax}.`);
  }

  const allEquipmentCount = state.roster.mcv.equipment.length;
  if (allEquipmentCount > limits.equipmentMax) {
    errors.push(`MCV Equipment limit exceeded: ${allEquipmentCount}/${limits.equipmentMax}.`);
  }

  if (state.roster.orbitalOrdnance.length > limits.ordnanceMax) {
    errors.push(`Orbital Ordnance limit exceeded: ${state.roster.orbitalOrdnance.length}/${limits.ordnanceMax}.`);
  }

  const heavy = state.roster.infantry.find(x => x.unitId === "heavy-weapons-specialist");
  if (heavy && !heavy.config?.weaponChoice) {
    errors.push("Heavy Weapons Specialist requires Warthog or Rubicon HM Launcher.");
  }

  const vanguard = state.roster.infantry.find(x => x.unitId === "vanguard-specialist");
  if (vanguard && !vanguard.config?.copiedSpecialist) {
    warnings.push("Vanguard specialist profile copy/secondary ability is not configured in this first pass.");
  }

  if (total > state.roster.threatLimit) errors.push(`${total - state.roster.threatLimit} Threat over the selected limit.`);

  return { errors, warnings, total, legal: errors.length === 0 };
}

function render() {
  renderMeta();
  renderCatalog();
  renderSponsor();
  renderMCV();
  renderInfantry();
  renderOrdnance();
  renderBackup();
  renderValidation();
  renderGame();
}

function renderMeta() {
  $("#operationName").value = state.roster.name;
  $("#threatLimit").value = state.roster.threatLimit;
  $("#rosterTitle").textContent = state.roster.name || "Untitled Operation";
  $("#gameTitle").textContent = state.roster.name || "Untitled Operation";

  const v = validateRoster();
  $("#threatStatus").textContent = `${v.total} / ${state.roster.threatLimit}`;
  $("#remainingThreat").textContent =
    v.total <= state.roster.threatLimit
      ? `${state.roster.threatLimit - v.total} TH remaining`
      : `${v.total - state.roster.threatLimit} TH over`;

  const badge = $("#legalStatus");
  badge.className = "status-pill";
  if (v.legal) {
    badge.textContent = "Legal";
    badge.classList.add("good");
  } else if (v.errors.some(e => e.includes("over"))) {
    badge.textContent = "Invalid";
    badge.classList.add("bad");
  } else {
    badge.textContent = "Incomplete";
    badge.classList.add("warn");
  }

  const limits = effectiveLimits();
  $("#infantryCounter").textContent = `${getInfantryCount()} / ${limits.infantryMax}`;
  $("#ordnanceCounter").textContent = `${state.roster.orbitalOrdnance.length} / ${limits.ordnanceMax}`;
}

function renderValidation() {
  const box = $("#validationBox");
  const v = validateRoster();

  if (v.legal && v.warnings.length === 0) {
    box.innerHTML = `<div class="validation-summary good"><strong>✓ Legal Fireteam</strong><div class="subtle">No construction errors found.</div></div>`;
    return;
  }

  const items = [...v.errors.map(x => `⚠ ${x}`), ...v.warnings.map(x => `• ${x}`)];
  const cls = v.errors.length ? "bad" : "";
  box.innerHTML = `
    <div class="validation-summary ${cls}">
      <strong>${v.errors.length ? "Fireteam needs attention" : "Review notes"}</strong>
      <ul>${items.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
    </div>
  `;
}

function renderCatalog() {
  const root = $("#catalogContent");
  const q = state.search.trim().toLowerCase();

  if (state.catalogTab === "infantry") {
    const groups = [
      ["Pilots", state.data.infantryUnits.filter(x => x.type === "pilot")],
      ["Specialists", state.data.infantryUnits.filter(x => x.type === "specialist")],
      ["Grunts", state.data.infantryUnits.filter(x => x.type === "grunt")]
    ];

    root.innerHTML = groups.map(([title, list]) => {
      const filtered = list.filter(u => !q || `${u.name} ${u.type} ${(u.abilities || []).join(" ")}`.toLowerCase().includes(q));
      if (!filtered.length) return "";
      return `
        <section class="catalog-group">
          <div class="catalog-group-title"><strong>${title}</strong><span>${filtered.length}</span></div>
          <div class="catalog-list">
            ${filtered.map(unitCard).join("")}
          </div>
        </section>
      `;
    }).join("");
  }

  if (state.catalogTab === "mcv") {
    const profiles = state.data.mcvProfiles.filter(x => !q || x.name.toLowerCase().includes(q));
    root.innerHTML = `
      <section class="catalog-group">
        <div class="catalog-group-title"><strong>MCV Profiles</strong><span>${profiles.length}</span></div>
        <div class="catalog-list">
          ${profiles.map(p => `
            <div class="catalog-card">
              <div class="catalog-main">
                <div class="catalog-title-line"><span class="catalog-title">${escapeHtml(p.name)}</span></div>
                <div class="catalog-meta">SPD ${p.speed} · ARM ${p.armor}</div>
              </div>
              <button class="add-btn" data-action="choose-profile" data-id="${p.id}" type="button" title="Use ${escapeHtml(p.name)}">+</button>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  if (state.catalogTab === "ordnance") {
    const list = state.data.orbitalOrdnance.filter(x => !q || `${x.name} ${x.effect}`.toLowerCase().includes(q));
    root.innerHTML = `
      <section class="catalog-group">
        <div class="catalog-group-title"><strong>Orbital Ordnance</strong><span>${list.length}</span></div>
        <div class="catalog-list">
          ${list.map(o => `
            <div class="catalog-card">
              <div class="catalog-main">
                <div class="catalog-title-line">
                  <span class="catalog-title">${escapeHtml(o.name)}</span>
                  <span class="threat-cost">${o.threat} TH</span>
                </div>
                <div class="catalog-meta">${escapeHtml(o.effect)}</div>
              </div>
              <button class="add-btn" data-action="add-ordnance" data-id="${o.id}" type="button">+</button>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }
}

function unitCard(unit) {
  const weapons = [];
  if (unit.weapons) weapons.push(...unit.weapons.map(id => byId(state.data.infantryWeapons, id)?.name || id));
  if (unit.weaponChoice) weapons.push("Weapon choice required");

  return `
    <div class="catalog-card">
      <div class="catalog-main">
        <div class="catalog-title-line">
          <span class="catalog-title">${escapeHtml(unit.name)}</span>
          <span class="threat-cost">${unit.threat} TH</span>
        </div>
        <div class="catalog-meta">SPD ${unit.speed} · DEF ${unit.defense} · ARM ${unit.armor} · TAC ${unit.tactics}</div>
        <div class="catalog-meta">${escapeHtml(weapons.join(" · "))}</div>
      </div>
      <button class="add-btn" data-action="add-infantry" data-id="${unit.id}" type="button">+</button>
    </div>
  `;
}

function renderSponsor() {
  const root = $("#sponsorSelection");
  root.innerHTML = `
    <div class="choice-grid">
      ${state.data.corporateClients.map(c => `
        <button class="choice-button ${state.roster.corporateClient === c.id ? "selected" : ""}"
          data-action="select-sponsor" data-id="${c.id}" type="button"
          title="${escapeAttr(c.perk)}">
          ${state.roster.corporateClient === c.id ? '<span class="check">✓</span>' : ""}
          ${escapeHtml(c.name)}
        </button>
      `).join("")}
    </div>
    ${state.roster.corporateClient ? `<div class="subtle" style="margin-top:8px">${escapeHtml(byId(state.data.corporateClients, state.roster.corporateClient)?.perk || "")}</div>` : ""}
  `;
}

function renderMCV() {
  const root = $("#mcvBuilder");
  const m = state.roster.mcv;
  const limits = effectiveLimits();
  const stats = mcvStats();

  const primary = state.data.mcvWeapons.filter(x => x.slot === "primary");
  const sidearms = state.data.mcvWeapons.filter(x => x.slot === "sidearm");
  const weaponEquipment = state.data.mcvWeapons.filter(x => x.slot === "equipment");
  const equipmentOptions = [
    ...state.data.mcvEquipment.map(x => ({...x, sourceCollection: "mcvEquipment"})),
    ...weaponEquipment.map(x => ({...x, sourceCollection: "mcvWeapons"}))
  ];

  root.innerHTML = `
    <div class="mcv-block">
      ${stats ? `
        <div class="mcv-summary">
          <div class="stat-chip"><span>Speed</span><strong>${stats.speed}</strong></div>
          <div class="stat-chip"><span>Defense</span><strong>${stats.defense}</strong></div>
          <div class="stat-chip"><span>Armor</span><strong>${stats.armor}</strong></div>
          <div class="stat-chip"><span>Actions</span><strong>${stats.actions}</strong></div>
        </div>
      ` : ""}

      ${selectionRow("Profile", state.data.mcvProfiles, m.profile, "select-mcv-single", "profile",
        x => `${x.name} · SPD ${x.speed} / ARM ${x.armor}`)}

      ${selectionRow("Pilot Experience", state.data.pilotExperience, m.pilotExperience, "select-mcv-single", "pilotExperience",
        x => `${x.name} · +${x.actionBonus} action${x.actionBonus === 1 ? "" : "s"}`)}

      ${selectionRow("Integrated Component", state.data.mcvIntegratedComponents, m.integratedComponent, "select-mcv-single", "integratedComponent",
        x => x.name)}

      ${selectionRow("Shield", state.data.mcvShields, m.shield, "select-mcv-single", "shield",
        x => `${x.name} · DEF ${x.defense}`)}

      ${selectionRow("Sidearm", sidearms, m.sidearm, "select-mcv-single", "sidearm",
        x => `${x.name} · ${x.threat} TH`)}

      ${multiSelectionRow("Primary Weapons", primary, m.primaryWeapons, limits.primaryMax, "toggle-primary",
        x => `${x.name} · ${x.threat} TH`)}

      ${multiSelectionRow("Equipment", equipmentOptions, m.equipment, limits.equipmentMax, "toggle-equipment",
        x => `${x.name}${x.threat != null ? ` · ${x.threat} TH` : ""}`)}
    </div>
  `;
}

function selectionRow(label, options, selected, action, field, formatter) {
  return `
    <div class="mcv-row">
      <div class="mcv-row-head">
        <strong>${label}</strong>
        <span class="slot-count">${selected ? "1 / 1" : "0 / 1"}</span>
      </div>
      <div class="choice-grid">
        ${options.map(x => `
          <button class="choice-button ${selected === x.id ? "selected" : ""}"
            data-action="${action}" data-field="${field}" data-id="${x.id}" type="button">
            ${selected === x.id ? '<span class="check">✓</span>' : ""}
            ${escapeHtml(formatter(x))}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function multiSelectionRow(label, options, selected, max, action, formatter) {
  return `
    <div class="mcv-row">
      <div class="mcv-row-head">
        <strong>${label}</strong>
        <span class="slot-count">${selected.length} / ${max}</span>
      </div>
      <div class="choice-grid">
        ${options.map(x => {
          const on = selected.includes(x.id);
          return `
            <button class="choice-button ${on ? "selected" : ""}"
              data-action="${action}" data-id="${x.id}" type="button">
              ${on ? '<span class="check">✓</span>' : ""}
              ${escapeHtml(formatter(x))}
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderInfantry() {
  const root = $("#rosterInfantry");
  if (!state.roster.infantry.length) {
    root.innerHTML = `<div class="empty-state">No infantry hired yet. Add Pilots, Specialists, or Grunts from the catalog.</div>`;
    return;
  }

  root.innerHTML = `<div class="roster-list">${
    state.roster.infantry.map((entry, index) => {
      const unit = byId(state.data.infantryUnits, entry.unitId);
      let config = "";
      if (unit?.weaponChoice) {
        config = `
          <div class="subtle">
            Weapon:
            <select data-action="heavy-weapon-choice" data-entry="${entry.entryId}">
              <option value="">Choose…</option>
              ${unit.weaponChoice.options.map(id => {
                const w = byId(state.data.infantryWeapons, id);
                return `<option value="${id}" ${entry.config?.weaponChoice === id ? "selected" : ""}>${escapeHtml(w?.name || id)}</option>`;
              }).join("")}
            </select>
          </div>
        `;
      }

      return `
        <div class="roster-item" draggable="true" data-entry="${entry.entryId}">
          <span class="drag-handle" title="Drag to reorder">☰</span>
          <div>
            <div class="roster-item-title">${escapeHtml(unit?.name || entry.unitId)} <span class="threat-cost">${unit?.threat || 0} TH ea.</span></div>
            <div class="subtle">${escapeHtml(unit?.type || "")} · SPD ${unit?.speed ?? "—"} · DEF ${unit?.defense ?? "—"} · ARM ${unit?.armor ?? "—"} · TAC ${unit?.tactics ?? "—"}</div>
            ${config}
          </div>
          <div class="roster-item-controls">
            <button class="small-button" data-action="decrement-infantry" data-entry="${entry.entryId}" type="button">−</button>
            <span class="quantity">${entry.quantity}</span>
            <button class="small-button" data-action="increment-infantry" data-entry="${entry.entryId}" type="button">+</button>
            <button class="small-button danger" data-action="remove-infantry" data-entry="${entry.entryId}" type="button">×</button>
          </div>
        </div>
      `;
    }).join("")
  }</div>`;
}

function renderOrdnance() {
  const root = $("#rosterOrdnance");
  if (!state.roster.orbitalOrdnance.length) {
    root.innerHTML = `<div class="empty-state">No Orbital Ordnance selected.</div>`;
    return;
  }
  root.innerHTML = `<div class="roster-list">${
    state.roster.orbitalOrdnance.map(id => {
      const o = byId(state.data.orbitalOrdnance, id);
      return `
        <div class="roster-item">
          <span class="drag-handle">↳</span>
          <div>
            <div class="roster-item-title">${escapeHtml(o?.name || id)} <span class="threat-cost">${o?.threat || 0} TH</span></div>
            <div class="subtle">${escapeHtml(o?.effect || "")}</div>
          </div>
          <div class="roster-item-controls">
            <button class="small-button danger" data-action="remove-ordnance" data-id="${id}" type="button">×</button>
          </div>
        </div>
      `;
    }).join("")
  }</div>`;
}

function renderBackup() {
  const root = $("#backupMcv");
  const b = state.data.backupMCVs[0];
  const active = state.roster.backupMCV === b.id;
  root.innerHTML = `
    <div class="backup-card">
      <div>
        <div class="roster-item-title">${escapeHtml(b.name)} <span class="threat-cost">${b.threat} TH</span></div>
        <div class="subtle">Backup MCV · reduces Infantry max to 8 and Specialist max to 3.</div>
      </div>
      <button class="button ${active ? "primary" : "secondary"}" data-action="toggle-backup" data-id="${b.id}" type="button">
        ${active ? "Selected ✓" : "Add Backup"}
      </button>
    </div>
  `;
}

function renderGame() {
  const root = $("#gameCards");
  const cards = [];

  const mcv = mcvStats();
  if (mcv && state.roster.mcv.profile) {
    const p = byId(state.data.mcvProfiles, state.roster.mcv.profile);
    cards.push(gameCard({
      key: "main-mcv",
      name: `${p.name} MCV`,
      type: "MCV",
      stats: { SPD: mcv.speed, DEF: mcv.defense, ARM: mcv.armor, TAC: mcv.tactics },
      details: [
        byId(state.data.pilotExperience, state.roster.mcv.pilotExperience)?.name,
        ...state.roster.mcv.primaryWeapons.map(id => byId(state.data.mcvWeapons, id)?.name),
        ...state.roster.mcv.equipment.map(id => byId(state.data.mcvEquipment, id)?.name || byId(state.data.mcvWeapons, id)?.name)
      ].filter(Boolean)
    }));
  }

  for (const entry of state.roster.infantry) {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    for (let i = 0; i < entry.quantity; i++) {
      cards.push(gameCard({
        key: `${entry.entryId}-${i}`,
        name: entry.quantity > 1 ? `${unit.name} ${i + 1}` : unit.name,
        type: unit.type,
        stats: { SPD: unit.speed, DEF: unit.defense, ARM: unit.armor, TAC: unit.tactics },
        details: [
          ...(unit.weapons || []).map(id => byId(state.data.infantryWeapons, id)?.name),
          ...(unit.abilities || []).slice(0, 2)
        ].filter(Boolean)
      }));
    }
  }

  root.innerHTML = cards.length ? cards.join("") : `<div class="empty-state">Configure your Fireteam in Build mode to populate Game mode.</div>`;
}

function gameCard({key, name, type, stats, details}) {
  const gs = state.gameState[key] || { status: "ready" };
  return `
    <article class="game-card ${gs.status === "downed" ? "down" : ""} ${gs.status === "kia" ? "kia" : ""} ${gs.status === "activated" ? "activated" : ""}">
      <div class="game-card-head">
        <div>
          <strong>${escapeHtml(name)}</strong>
          <div class="subtle">${escapeHtml(type)}</div>
        </div>
        <span class="status-pill">${escapeHtml(gs.status)}</span>
      </div>
      <div class="game-stats">
        ${Object.entries(stats).map(([k,v]) => `<div class="stat-chip"><span>${k}</span><strong>${v}</strong></div>`).join("")}
      </div>
      <div class="subtle">${details.map(escapeHtml).join(" · ")}</div>
      <div class="game-controls" style="margin-top:10px">
        ${["ready","activated","downed","kia"].map(status => `
          <button class="${gs.status === status ? "active" : ""}" data-action="game-status" data-key="${key}" data-status="${status}" type="button">${status}</button>
        `).join("")}
      </div>
    </article>
  `;
}

function addInfantry(unitId) {
  const unit = byId(state.data.infantryUnits, unitId);
  if (!unit) return;

  const existing = state.roster.infantry.find(x => x.unitId === unitId);
  if (existing && unitId !== "heavy-weapons-specialist") {
    existing.quantity += 1;
  } else {
    const entry = {
      entryId: slugId("unit"),
      unitId,
      quantity: 1,
      config: {}
    };
    state.roster.infantry.push(entry);
    state.roster.displayOrder.push(entry.entryId);
  }
  render();
}

function toggleArray(array, id, max = Infinity) {
  const idx = array.indexOf(id);
  if (idx >= 0) {
    array.splice(idx, 1);
    return;
  }
  if (array.length >= max) {
    showToast(`Selection limit is ${max}. Remove one first.`);
    return;
  }
  array.push(id);
}

function saveRoster() {
  const all = JSON.parse(localStorage.getItem("arsenal.savedRosters") || "[]");
  const idx = all.findIndex(x => x.id === state.roster.id);
  const record = {...clone(state.roster), savedAt: new Date().toISOString()};
  if (idx >= 0) all[idx] = record;
  else all.unshift(record);
  localStorage.setItem("arsenal.savedRosters", JSON.stringify(all.slice(0, 25)));
  localStorage.setItem("arsenal.currentRoster", JSON.stringify(state.roster));
  showToast("Fireteam saved in this browser.");
}

function persistCurrent() {
  localStorage.setItem("arsenal.currentRoster", JSON.stringify(state.roster));
}

function exportRosterJson() {
  const payload = {
    schemaVersion: 1,
    format: "arsenal-builder-roster",
    exportedAt: new Date().toISOString(),
    roster: clone(state.roster)
  };
  downloadFile(`${safeFileName(state.roster.name)}.arsenal.json`, JSON.stringify(payload, null, 2), "application/json");
}

function exportRosterText() {
  const v = validateRoster();
  const lines = [
    `${state.roster.name} — ${v.total}/${state.roster.threatLimit} Threat`,
    byId(state.data.corporateClients, state.roster.corporateClient)?.name || "No Corporate Client",
    ""
  ];

  if (state.roster.mcv.profile) {
    lines.push(`${byId(state.data.mcvProfiles, state.roster.mcv.profile)?.name} MCV`);
    lines.push(`  Pilot: ${byId(state.data.pilotExperience, state.roster.mcv.pilotExperience)?.name || "—"}`);
    lines.push(`  Shield: ${byId(state.data.mcvShields, state.roster.mcv.shield)?.name || "—"}`);
    lines.push(`  Component: ${byId(state.data.mcvIntegratedComponents, state.roster.mcv.integratedComponent)?.name || "—"}`);
    lines.push(`  Sidearm: ${byId(state.data.mcvWeapons, state.roster.mcv.sidearm)?.name || "—"}`);
    if (state.roster.mcv.primaryWeapons.length) lines.push(`  Primary: ${state.roster.mcv.primaryWeapons.map(id => byId(state.data.mcvWeapons, id)?.name).join(", ")}`);
    if (state.roster.mcv.equipment.length) lines.push(`  Equipment: ${state.roster.mcv.equipment.map(id => byId(state.data.mcvEquipment, id)?.name || byId(state.data.mcvWeapons, id)?.name).join(", ")}`);
    lines.push("");
  }

  if (state.roster.infantry.length) {
    lines.push("Infantry");
    for (const e of state.roster.infantry) {
      const u = byId(state.data.infantryUnits, e.unitId);
      let suffix = "";
      if (e.config?.weaponChoice) suffix = ` — ${byId(state.data.infantryWeapons, e.config.weaponChoice)?.name}`;
      lines.push(`  ${e.quantity}× ${u?.name || e.unitId}${suffix}`);
    }
    lines.push("");
  }

  if (state.roster.orbitalOrdnance.length) {
    lines.push("Orbital Ordnance");
    for (const id of state.roster.orbitalOrdnance) lines.push(`  ${byId(state.data.orbitalOrdnance, id)?.name || id}`);
  }

  if (state.roster.backupMCV) lines.push(``, `Backup MCV: ${byId(state.data.backupMCVs, state.roster.backupMCV)?.name}`);

  downloadFile(`${safeFileName(state.roster.name)}.txt`, lines.join("\n"), "text/plain");
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  return (name || "arsenal-fireteam").replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "arsenal-fireteam";
}

function showToast(msg) {
  const toast = $("#toast");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "add-infantry") addInfantry(id);

  if (action === "select-sponsor") {
    state.roster.corporateClient = id;
    render();
  }

  if (action === "choose-profile") {
    state.roster.mcv.profile = id;
    render();
  }

  if (action === "select-mcv-single") {
    state.roster.mcv[btn.dataset.field] = id;
    render();
  }

  if (action === "toggle-primary") {
    toggleArray(state.roster.mcv.primaryWeapons, id, effectiveLimits().primaryMax);
    render();
  }

  if (action === "toggle-equipment") {
    toggleArray(state.roster.mcv.equipment, id, effectiveLimits().equipmentMax);
    render();
  }

  if (action === "increment-infantry") {
    const x = state.roster.infantry.find(x => x.entryId === btn.dataset.entry);
    if (x) x.quantity += 1;
    render();
  }

  if (action === "decrement-infantry") {
    const x = state.roster.infantry.find(x => x.entryId === btn.dataset.entry);
    if (x) {
      x.quantity -= 1;
      if (x.quantity <= 0) state.roster.infantry = state.roster.infantry.filter(y => y.entryId !== x.entryId);
    }
    render();
  }

  if (action === "remove-infantry") {
    state.roster.infantry = state.roster.infantry.filter(x => x.entryId !== btn.dataset.entry);
    render();
    showToast("Unit removed.");
  }

  if (action === "add-ordnance") {
    toggleArray(state.roster.orbitalOrdnance, id, effectiveLimits().ordnanceMax);
    render();
  }

  if (action === "remove-ordnance") {
    state.roster.orbitalOrdnance = state.roster.orbitalOrdnance.filter(x => x !== id);
    render();
  }

  if (action === "toggle-backup") {
    state.roster.backupMCV = state.roster.backupMCV === id ? null : id;
    render();
  }

  if (action === "game-status") {
    state.gameState[btn.dataset.key] = { status: btn.dataset.status };
    renderGame();
  }

  persistCurrent();
});

document.addEventListener("change", (e) => {
  if (e.target.matches('[data-action="heavy-weapon-choice"]')) {
    const entry = state.roster.infantry.find(x => x.entryId === e.target.dataset.entry);
    if (entry) {
      entry.config ||= {};
      entry.config.weaponChoice = e.target.value || null;
      render();
      persistCurrent();
    }
  }
});

$("#operationName").addEventListener("input", e => {
  state.roster.name = e.target.value;
  $("#rosterTitle").textContent = e.target.value || "Untitled Operation";
  $("#gameTitle").textContent = e.target.value || "Untitled Operation";
  persistCurrent();
});

$("#threatLimit").addEventListener("input", e => {
  const value = Math.max(1, parseInt(e.target.value || "1", 10));
  state.roster.threatLimit = value;
  render();
  persistCurrent();
});

$("#catalogSearch").addEventListener("input", e => {
  state.search = e.target.value;
  renderCatalog();
});

$("#catalogTabs").addEventListener("click", e => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;
  state.catalogTab = btn.dataset.tab;
  $$(".catalog-tab").forEach(x => x.classList.toggle("active", x === btn));
  renderCatalog();
});

$$(".mode-tab").forEach(btn => btn.addEventListener("click", () => {
  const mode = btn.dataset.mode;
  if (mode === "build") {
    $("#buildMode").classList.remove("hidden");
    $("#gameMode").classList.add("hidden");
    document.querySelector(".catalog-panel").classList.remove("mobile-hidden");
    $("#rosterPanel").classList.remove("mobile-hidden");
  }
  if (mode === "game") {
    $("#buildMode").classList.add("hidden");
    $("#gameMode").classList.remove("hidden");
  }
  if (mode === "roster") {
    $("#buildMode").classList.remove("hidden");
    $("#gameMode").classList.add("hidden");
    document.querySelector(".catalog-panel").classList.add("mobile-hidden");
    $("#rosterPanel").classList.remove("mobile-hidden");
  }
  $$(".mode-tab").forEach(x => x.classList.toggle("active", x === btn));
}));

$("#saveListBtn").addEventListener("click", saveRoster);
$("#newListBtn").addEventListener("click", () => {
  if (!confirm("Start a new Fireteam? Your current list will remain saved only if you previously pressed Save.")) return;
  state.roster = defaultRoster();
  state.gameState = {};
  render();
  persistCurrent();
});
$("#manageBtn").addEventListener("click", () => $("#manageDialog").showModal());
$("#closeManageBtn").addEventListener("click", () => $("#manageDialog").close());
$("#exportJsonBtn").addEventListener("click", exportRosterJson);
$("#exportTextBtn").addEventListener("click", exportRosterText);
$("#resetGameStateBtn").addEventListener("click", () => {
  state.gameState = {};
  renderGame();
  showToast("Game state reset.");
});

$("#importFile").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  const preview = $("#importPreview");
  try {
    const parsed = JSON.parse(await file.text());
    const roster = parsed.roster || parsed;
    if (roster.game !== "arsenal") throw new Error("This is not an Arsenal roster.");
    if (!roster.mcv || !Array.isArray(roster.infantry)) throw new Error("Roster structure is incomplete.");

    preview.innerHTML = `
      <strong>${escapeHtml(roster.name || "Imported Fireteam")}</strong><br>
      ${roster.infantry.reduce((n,x) => n + (x.quantity || 0), 0)} infantry · limit ${roster.threatLimit || 50} Threat
      <div style="margin-top:8px"><button id="confirmImportBtn" class="button primary" type="button">Import as New Fireteam</button></div>
    `;
    $("#confirmImportBtn").addEventListener("click", () => {
      state.roster = clone(roster);
      state.roster.id = slugId("roster");
      state.roster.name = roster.name ? `${roster.name} (Imported)` : "Imported Fireteam";
      state.gameState = {};
      render();
      persistCurrent();
      $("#manageDialog").close();
      showToast("Roster imported.");
    }, {once:true});
  } catch (err) {
    preview.textContent = `Could not import: ${err.message}`;
  }
});

let draggedEntry = null;
document.addEventListener("dragstart", e => {
  const row = e.target.closest(".roster-item[draggable='true']");
  if (!row) return;
  draggedEntry = row.dataset.entry;
  row.classList.add("dragging");
});
document.addEventListener("dragend", e => {
  const row = e.target.closest(".roster-item[draggable='true']");
  if (row) row.classList.remove("dragging");
  $$(".drop-target").forEach(x => x.classList.remove("drop-target"));
  draggedEntry = null;
});
document.addEventListener("dragover", e => {
  const row = e.target.closest(".roster-item[draggable='true']");
  if (!row || !draggedEntry || row.dataset.entry === draggedEntry) return;
  e.preventDefault();
  $$(".drop-target").forEach(x => x.classList.remove("drop-target"));
  row.classList.add("drop-target");
});
document.addEventListener("drop", e => {
  const row = e.target.closest(".roster-item[draggable='true']");
  if (!row || !draggedEntry) return;
  e.preventDefault();
  const from = state.roster.infantry.findIndex(x => x.entryId === draggedEntry);
  const to = state.roster.infantry.findIndex(x => x.entryId === row.dataset.entry);
  if (from >= 0 && to >= 0 && from !== to) {
    const [moved] = state.roster.infantry.splice(from, 1);
    state.roster.infantry.splice(to, 0, moved);
    render();
    persistCurrent();
  }
});

async function init() {
  const response = await fetch("data/arsenal.json");
  state.data = await response.json();

  const savedCurrent = localStorage.getItem("arsenal.currentRoster");
  if (savedCurrent) {
    try { state.roster = JSON.parse(savedCurrent); }
    catch { state.roster = defaultRoster(); }
  } else {
    state.roster = defaultRoster();
  }

  render();
}

init().catch(err => {
  document.body.innerHTML = `<main style="padding:30px;color:white;font-family:sans-serif"><h1>Could not load Arsenal data</h1><p>${escapeHtml(err.message)}</p><p>Serve this folder from a local web server or GitHub Pages rather than opening index.html directly from the filesystem.</p></main>`;
});
