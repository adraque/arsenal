
const state = {
  data: null,
  activeTab: "mcv",
  search: "",
  roster: null,
  gameState: {}
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function byId(collection, id) {
  return collection?.find(x => x.id === id);
}

function defaultRoster() {
  return {
    schemaVersion: 3,
    game: "arsenal",
    id: uid("roster"),
    name: "Untitled Operation",
    threatLimit: state.data?.game?.defaultThreatLimit || 50,
    corporateClient: null,
    mcv: {
      profile: null,
      integratedComponent: null,
      shield: null,
      sidearm: null,
      primaryWeapons: [],
      equipment: []
    },
    infantry: [],
    backupMCV: null,
    orbitalOrdnance: []
  };
}

function normalizeRoster(raw) {
  const base = defaultRoster();
  const r = {...base, ...raw};
  r.schemaVersion = 3;
  r.mcv = {...base.mcv, ...(raw?.mcv || {})};
  // Pass 3 removes the provisional build-time Pilot Experience field.
  // Older native rosters still import cleanly; the legacy field is ignored.
  delete r.mcv.pilotExperience;
  r.infantry = Array.isArray(raw?.infantry) ? raw.infantry.map(x => ({
    entryId: x.entryId || uid("unit"),
    unitId: x.unitId,
    quantity: Math.max(1, Number(x.quantity || 1)),
    config: x.config || {}
  })) : [];
  r.orbitalOrdnance = Array.isArray(raw?.orbitalOrdnance) ? raw.orbitalOrdnance : [];
  r.mcv.primaryWeapons = Array.isArray(r.mcv.primaryWeapons) ? r.mcv.primaryWeapons : [];
  r.mcv.equipment = Array.isArray(r.mcv.equipment) ? r.mcv.equipment : [];
  return r;
}

function effectiveLimits() {
  const c = state.data.construction;
  const limits = {
    infantryMax: c.infantry.max,
    specialistMax: c.infantry.specialist.max,
    specialistTypeMax: c.infantry.specialist.maxPerType,
    pilotMin: c.infantry.pilot.min,
    pilotMax: c.infantry.pilot.max,
    ordnanceMax: c.orbitalOrdnance.max,
    primaryMax: state.data.mcvLoadout.primaryWeapons.max,
    equipmentMax: state.data.mcvLoadout.equipment.max
  };

  if (state.roster.corporateClient === "encom") limits.ordnanceMax = 2;
  if (state.roster.backupMCV === "machete") {
    limits.infantryMax = 8;
    limits.specialistMax = 3;
  }
  return limits;
}

function infantryCount(type = null) {
  return state.roster.infantry.reduce((sum, entry) => {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    if (!unit) return sum;
    if (type && unit.type !== type) return sum;
    return sum + entry.quantity;
  }, 0);
}

function quantityFor(unitId) {
  return state.roster.infantry
    .filter(x => x.unitId === unitId)
    .reduce((sum, x) => sum + x.quantity, 0);
}

function threatTotal() {
  let total = 0;

  for (const entry of state.roster.infantry) {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    if (unit) total += (unit.threat || 0) * entry.quantity;
  }

  if (state.roster.backupMCV) {
    total += byId(state.data.backupMCVs, state.roster.backupMCV)?.threat || 0;
  }

  for (const id of state.roster.orbitalOrdnance) {
    total += byId(state.data.orbitalOrdnance, id)?.threat || 0;
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
  const profile = byId(state.data.mcvProfiles, state.roster.mcv.profile);
  if (!profile) return null;

  let speed = profile.speed;
  let armor = profile.armor;
  let defense = "—";

  const component = byId(
    state.data.mcvIntegratedComponents,
    state.roster.mcv.integratedComponent
  );
  if (component) {
    speed += component.speedModifier || 0;
    armor += component.armorModifier || 0;
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

  return {speed, defense, armor};
}

function validateRoster() {
  const errors = [];
  const warnings = [];
  const limits = effectiveLimits();
  const total = threatTotal();

  if (!state.roster.corporateClient) errors.push("Select one Corporate Client.");
  if (!state.roster.mcv.profile) errors.push("Choose an MCV profile.");
  if (!state.roster.mcv.integratedComponent) errors.push("Choose one Integrated Component.");
  if (!state.roster.mcv.shield) errors.push("Choose one Shield.");
  if (!state.roster.mcv.sidearm) errors.push("Choose one Sidearm.");

  const pilots = infantryCount("pilot");
  if (pilots < limits.pilotMin) errors.push(`Hire at least ${limits.pilotMin} Pilot infantry.`);
  if (pilots > limits.pilotMax) errors.push(`Pilot infantry limit exceeded: ${pilots}/${limits.pilotMax}.`);

  const allInfantry = infantryCount();
  if (allInfantry > limits.infantryMax) errors.push(`Infantry limit exceeded: ${allInfantry}/${limits.infantryMax}.`);

  const specialists = infantryCount("specialist");
  if (specialists > limits.specialistMax) {
    errors.push(`Specialist limit exceeded: ${specialists}/${limits.specialistMax}.`);
  }

  const specialistTypeCounts = {};
  for (const entry of state.roster.infantry) {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    if (unit?.type !== "specialist") continue;
    specialistTypeCounts[entry.unitId] = (specialistTypeCounts[entry.unitId] || 0) + entry.quantity;
  }

  for (const [unitId, qty] of Object.entries(specialistTypeCounts)) {
    const unit = byId(state.data.infantryUnits, unitId);
    let max = limits.specialistTypeMax;
    if (state.roster.corporateClient === "nile") max = 3;
    if (unit?.max) max = Math.min(max, unit.max);
    if (qty > max) errors.push(`${unit?.name || unitId} exceeds its limit: ${qty}/${max}.`);
  }

  if (state.roster.mcv.primaryWeapons.length > limits.primaryMax) {
    errors.push(`Primary Weapon limit exceeded: ${state.roster.mcv.primaryWeapons.length}/${limits.primaryMax}.`);
  }

  if (state.roster.mcv.equipment.length > limits.equipmentMax) {
    errors.push(`MCV Equipment limit exceeded: ${state.roster.mcv.equipment.length}/${limits.equipmentMax}.`);
  }

  if (state.roster.orbitalOrdnance.length > limits.ordnanceMax) {
    errors.push(`Orbital Ordnance limit exceeded: ${state.roster.orbitalOrdnance.length}/${limits.ordnanceMax}.`);
  }

  const heavyEntries = state.roster.infantry.filter(x => x.unitId === "heavy-weapons-specialist");
  if (heavyEntries.some(x => !x.config?.weaponChoice)) {
    errors.push("Each Heavy Weapons Specialist requires Warthog or Rubicon HM Launcher.");
  }

  if (state.roster.infantry.some(x => x.unitId === "vanguard-specialist")) {
    warnings.push("Vanguard copied Specialist profile / secondary ability configuration is not implemented yet.");
  }

  if (total > state.roster.threatLimit) {
    errors.push(`${total - state.roster.threatLimit} Threat over the selected limit.`);
  }

  return {errors, warnings, legal: errors.length === 0, total};
}

function render() {
  renderHeader();
  renderBuildContent();
  renderSummary();
  renderGame();
}

function renderHeader() {
  $("#operationName").value = state.roster.name;
  $("#threatLimit").value = state.roster.threatLimit;
  $("#gameTitle").textContent = state.roster.name || "Untitled Operation";

  const result = validateRoster();
  $("#threatStatus").textContent = `${result.total} / ${state.roster.threatLimit}`;

  const badge = $("#legalStatus");
  badge.className = "status-pill";
  if (result.legal) {
    badge.textContent = "Legal";
    badge.classList.add("good");
  } else if (result.total > state.roster.threatLimit) {
    badge.textContent = "Invalid";
    badge.classList.add("bad");
  } else {
    badge.textContent = "Incomplete";
    badge.classList.add("warn");
  }
}

function renderBuildContent() {
  const q = state.search.trim().toLowerCase();
  if (state.activeTab === "mcv") renderMcvTab(q);
  if (state.activeTab === "pilot") renderPilotTab(q);
  if (state.activeTab === "infantry") renderInfantryTab(q);
  if (state.activeTab === "clients") renderClientsTab(q);
  if (state.activeTab === "ordnance") renderOrdnanceTab(q);
}

function renderMcvTab(q) {
  const root = $("#buildContent");
  const m = state.roster.mcv;
  const limits = effectiveLimits();
  const stats = mcvStats();

  const profiles = state.data.mcvProfiles.filter(x => matches(q, x.name));
  const components = state.data.mcvIntegratedComponents.filter(x => matches(q, x.name, x.ability));
  const shields = state.data.mcvShields.filter(x => matches(q, x.name));
  const sidearms = state.data.mcvWeapons.filter(x => x.slot === "sidearm" && matches(q, x.name, ...(x.keywords || [])));
  const primaries = state.data.mcvWeapons.filter(x => x.slot === "primary" && matches(q, x.name, ...(x.keywords || [])));

  const chassisEquipment = state.data.mcvEquipment
    .map(x => ({...x, selectionKind: "chassis"}))
    .filter(x => matches(q, x.name, x.ability));

  const weaponEquipment = state.data.mcvWeapons
    .filter(x => x.slot === "equipment")
    .map(x => ({...x, selectionKind: "weapon"}))
    .filter(x => matches(q, x.name, ...(x.keywords || [])));

  const equipment = [...chassisEquipment, ...weaponEquipment];
  const backup = state.data.backupMCVs[0];

  const currentMcvLoadout = [
    byId(state.data.mcvProfiles, m.profile)?.name,
    byId(state.data.mcvIntegratedComponents, m.integratedComponent)?.name,
    byId(state.data.mcvShields, m.shield)?.name,
    byId(state.data.mcvWeapons, m.sidearm)?.name,
    ...(m.primaryWeapons || []).map(id => byId(state.data.mcvWeapons, id)?.name),
    ...(m.equipment || []).map(id =>
      byId(state.data.mcvEquipment, id)?.name ||
      byId(state.data.mcvWeapons, id)?.name
    )
  ].filter(Boolean);

  root.innerHTML = `
    ${stats ? `
      <section class="build-section current-mcv-sticky">
        <div class="build-section-title"><strong>Current MCV</strong><span>chassis + installed hardware</span></div>
        <div class="stat-row stat-row-three">
          ${statChip("Speed", stats.speed)}
          ${statChip("Defense", stats.defense)}
          ${statChip("Armor", stats.armor)}
        </div>
        <div class="mcv-current-loadout">
          ${currentMcvLoadout.map(name => `<span>${escapeHtml(name)}</span>`).join("")}
        </div>
      </section>
    ` : ""}

    ${mcvChoiceSection({
      title: "MCV Profile",
      subtitle: m.profile ? "1 / 1" : "0 / 1",
      items: profiles,
      selected: m.profile,
      mode: "single",
      action: "set-mcv-field",
      field: "profile",
      detail: x => [`Speed ${x.speed} · Armor ${x.armor}`]
    })}

    ${mcvChoiceSection({
      title: "Integrated Component",
      subtitle: m.integratedComponent ? "1 / 1" : "0 / 1",
      items: components,
      selected: m.integratedComponent,
      mode: "single",
      action: "set-mcv-field",
      field: "integratedComponent",
      detail: componentDetails
    })}

    ${mcvChoiceSection({
      title: "Shield",
      subtitle: m.shield ? "1 / 1" : "0 / 1",
      items: shields,
      selected: m.shield,
      mode: "single",
      action: "set-mcv-field",
      field: "shield",
      detail: shieldDetails
    })}

    ${mcvChoiceSection({
      title: "Sidearm",
      subtitle: m.sidearm ? "1 / 1" : "0 / 1",
      items: sidearms,
      selected: m.sidearm,
      mode: "single",
      action: "set-mcv-field",
      field: "sidearm",
      detail: weaponDetails,
      cost: x => x.threat
    })}

    ${mcvChoiceSection({
      title: "Primary Weapons",
      subtitle: `${m.primaryWeapons.length} / ${limits.primaryMax}`,
      items: primaries,
      selected: m.primaryWeapons,
      mode: "multi",
      action: "toggle-primary",
      detail: weaponDetails,
      cost: x => x.threat
    })}

    ${mcvChoiceSection({
      title: "Equipment",
      subtitle: `${m.equipment.length} / ${limits.equipmentMax}`,
      helper: "MCV weapon-equipment and chassis equipment share the same allowance.",
      items: equipment,
      selected: m.equipment,
      mode: "multi",
      action: "toggle-equipment",
      detail: equipmentDetails,
      cost: x => x.threat
    })}

    <section class="build-section">
      <div class="build-section-title"><strong>Backup MCV</strong><span>optional</span></div>
      ${mcvChoiceCard({
        item: backup,
        selected: state.roster.backupMCV === backup.id,
        mode: "multi",
        action: "toggle-backup",
        detail: backupDetails(backup),
        cost: backup.threat
      })}
    </section>
  `;
}

function renderPilotTab(q) {
  const root = $("#buildContent");
  const pilots = state.data.infantryUnits
    .filter(x => x.type === "pilot")
    .filter(x => matches(q, x.name, ...(x.abilities || [])));

  root.innerHTML = `
    <section class="build-section">
      <div class="build-section-title">
        <strong>Pilot Infantry</strong>
        <span>${infantryCount("pilot")} / ${effectiveLimits().pilotMax} selected · minimum ${effectiveLimits().pilotMin}</span>
      </div>
      <div class="subtle" style="margin-bottom:9px">
        Hire 1–2 Pilot infantry. Their effects on an MCV are applied in Game Mode only while that Pilot is mounted.
      </div>
      <div class="build-list">
        ${pilots.length ? pilots.map(unitBuildCard).join("") : searchEmpty()}
      </div>
    </section>
  `;
}

function renderInfantryTab(q) {
  const root = $("#buildContent");
  const specialists = state.data.infantryUnits
    .filter(x => x.type === "specialist")
    .filter(x => matches(q, x.name, ...(x.abilities || [])));
  const grunts = state.data.infantryUnits
    .filter(x => x.type === "grunt")
    .filter(x => matches(q, x.name, ...(x.abilities || [])));

  root.innerHTML = `
    <section class="build-section">
      <div class="build-section-title">
        <strong>Specialists</strong>
        <span>${infantryCount("specialist")} / ${effectiveLimits().specialistMax}</span>
      </div>
      <div class="build-list">
        ${specialists.length ? specialists.map(unitBuildCard).join("") : searchEmpty()}
      </div>
    </section>

    <section class="build-section">
      <div class="build-section-title">
        <strong>Grunts</strong>
        <span>${infantryCount("grunt")} selected</span>
      </div>
      <div class="build-list">
        ${grunts.length ? grunts.map(unitBuildCard).join("") : searchEmpty()}
      </div>
    </section>

    <section class="build-section">
      <div class="build-section-title">
        <strong>Total Infantry</strong>
        <span>${infantryCount()} / ${effectiveLimits().infantryMax}</span>
      </div>
    </section>
  `;
}

function renderClientsTab(q) {
  const root = $("#buildContent");
  const clients = state.data.corporateClients.filter(x => matches(q, x.name, x.perk));

  root.innerHTML = `
    <section class="build-section">
      <div class="build-section-title">
        <strong>Corporate Clients</strong>
        <span>select exactly 1</span>
      </div>
      <div class="build-list">
        ${clients.length ? clients.map(client => `
          <article class="asset-card client-card ${state.roster.corporateClient === client.id ? "selected" : ""}">
            <div class="asset-card-head">
              <div class="asset-card-main">
                <div class="asset-name-line">
                  <span class="asset-name">${escapeHtml(client.name)}</span>
                </div>
                <p class="perk">${escapeHtml(client.perk)}</p>
              </div>
              <button class="select-button ${state.roster.corporateClient === client.id ? "active" : ""}"
                data-action="select-client" data-id="${client.id}" type="button">
                ${state.roster.corporateClient === client.id ? "Selected" : "Select"}
              </button>
            </div>
          </article>
        `).join("") : searchEmpty()}
      </div>
    </section>
  `;
}

function renderOrdnanceTab(q) {
  const root = $("#buildContent");
  const ordnance = state.data.orbitalOrdnance.filter(x => matches(q, x.name, x.effect));
  const max = effectiveLimits().ordnanceMax;

  root.innerHTML = `
    <section class="build-section">
      <div class="build-section-title">
        <strong>Orbital Ordnance</strong>
        <span>${state.roster.orbitalOrdnance.length} / ${max}</span>
      </div>
      <div class="build-list">
        ${ordnance.length ? ordnance.map(o => {
          const selected = state.roster.orbitalOrdnance.includes(o.id);
          return `
            <article class="asset-card ${selected ? "selected" : ""}">
              <div class="asset-card-head">
                <div class="asset-card-main">
                  <div class="asset-name-line">
                    <span class="asset-name">${escapeHtml(o.name)}</span>
                    <span class="threat-cost">${o.threat}</span>
                  </div>
                  <div class="asset-meta">${escapeHtml(o.effect)}</div>
                </div>
                <button class="select-button ${selected ? "active" : ""}"
                  data-action="toggle-ordnance" data-id="${o.id}" type="button">
                  ${selected ? "Selected" : "Add"}
                </button>
              </div>
            </article>
          `;
        }).join("") : searchEmpty()}
      </div>
    </section>
  `;
}

function unitBuildCard(unit) {
  const matchingEntries = state.roster.infantry.filter(x => x.unitId === unit.id);
  const qty = quantityFor(unit.id);
  const selected = qty > 0;
  const weapons = [];
  if (unit.weapons) {
    weapons.push(...unit.weapons.map(id => byId(state.data.infantryWeapons, id)?.name || id));
  }
  if (unit.weaponChoice) weapons.push("weapon choice");

  let options = "";
  if (unit.id === "heavy-weapons-specialist" && matchingEntries.length) {
    options = matchingEntries.map((entry, index) => `
      <div class="config-block" style="margin-top:8px">
        <div class="config-head">
          <strong>Heavy Weapons Specialist ${matchingEntries.length > 1 ? index + 1 : ""}</strong>
          <span class="slot-count">choose 1</span>
        </div>
        <select data-action="heavy-weapon-choice" data-entry="${entry.entryId}" style="margin-top:7px">
          <option value="">Choose weapon…</option>
          ${unit.weaponChoice.options.map(id => {
            const w = byId(state.data.infantryWeapons, id);
            return `<option value="${id}" ${entry.config?.weaponChoice === id ? "selected" : ""}>${escapeHtml(w?.name || id)}</option>`;
          }).join("")}
        </select>
      </div>
    `).join("");
  }

  return `
    <article class="asset-card ${selected ? "selected" : ""} ${selected && unit.weaponChoice && matchingEntries.some(x => !x.config?.weaponChoice) ? "attention" : ""}">
      <div class="asset-card-head">
        <div class="asset-card-main">
          <div class="asset-name-line">
            <span class="asset-name">${escapeHtml(unit.name)}</span>
            <span class="threat-cost">${unit.threat}</span>
          </div>
          <div class="asset-meta">SPD ${unit.speed} · DEF ${unit.defense} · ARM ${unit.armor} · TAC ${unit.tactics}</div>
          <div class="asset-meta">${escapeHtml(weapons.join(" · "))}</div>
          ${unit.abilities?.length ? `<div class="asset-meta">${escapeHtml(unit.abilities[0])}</div>` : ""}
        </div>
        ${!selected ? `
          <button class="select-button" data-action="add-unit" data-id="${unit.id}" type="button">Add</button>
        ` : ""}
      </div>

      ${selected ? `
        <div class="quantity-controls">
          <span class="subtle" style="margin:0">In Fireteam</span>
          <button class="quantity-button" data-action="remove-one-unit" data-id="${unit.id}" type="button">−</button>
          <span class="quantity-value">${qty}</span>
          <button class="quantity-button" data-action="add-unit" data-id="${unit.id}" type="button">+</button>
          <button class="remove-button" data-action="remove-all-unit" data-id="${unit.id}" type="button" title="Remove all">×</button>
        </div>
        ${options}
      ` : ""}
    </article>
  `;
}

function modifierText(item) {
  const parts = [];
  if (item.speedModifier) parts.push(`Speed ${item.speedModifier > 0 ? "+" : ""}${item.speedModifier}`);
  if (item.armorModifier) parts.push(`Armor ${item.armorModifier > 0 ? "+" : ""}${item.armorModifier}`);
  return parts.join(" · ");
}

function componentDetails(item) {
  return [modifierText(item), item.ability].filter(Boolean);
}

function shieldDetails(item) {
  return [`Defense ${item.defense}`, modifierText(item)].filter(Boolean);
}

function weaponDetails(item) {
  const stats = [];
  if (item.range != null) stats.push(`Range ${item.range}\"`);
  if (item.aoe != null) stats.push(`AoE ${item.aoe}\"`);
  if (item.targetNumber != null) stats.push(`TN ${item.targetNumber}+`);
  if (item.damage != null) stats.push(`Damage ${item.damage}`);
  if (item.ammo != null) stats.push(`Ammo ${item.ammo}`);
  return [stats.join(" · "), (item.keywords || []).join(" · ")].filter(Boolean);
}

function equipmentDetails(item) {
  if (item.selectionKind === "weapon" || item.slot === "equipment") return weaponDetails(item);
  return [modifierText(item), item.ability].filter(Boolean);
}

function backupDetails(item) {
  const weapons = (item.weapons || []).map(id => byId(state.data.mcvWeapons, id)?.name || id);
  const equipment = (item.equipment || []).map(id => byId(state.data.mcvEquipment, id)?.name || byId(state.data.mcvWeapons, id)?.name || id);
  return [
    `Speed ${item.speed} · Defense ${item.defense} · Armor ${item.armor}`,
    weapons.length ? `Weapons: ${weapons.join(" · ")}` : "",
    equipment.length ? `Equipment: ${equipment.join(" · ")}` : "",
    "Reduces total Infantry max to 8 and Specialist max to 3."
  ].filter(Boolean);
}

function mcvChoiceSection({title, subtitle, helper = "", items, selected, mode, action, field = "", detail, cost}) {
  return `
    <section class="build-section">
      <div class="build-section-title"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div>
      ${helper ? `<div class="subtle section-helper">${escapeHtml(helper)}</div>` : ""}
      <div class="mcv-choice-list">
        ${items.length ? items.map(item => {
          const on = mode === "single" ? selected === item.id : selected.includes(item.id);
          return mcvChoiceCard({
            item,
            selected: on,
            mode,
            action,
            field,
            detail: detail(item),
            cost: cost ? cost(item) : null
          });
        }).join("") : searchEmpty()}
      </div>
    </section>
  `;
}

function mcvChoiceCard({item, selected, mode, action, field = "", detail = [], cost = null}) {
  const additive = mode === "multi";
  const buttonLabel = additive
    ? `${selected ? "Remove" : "Add"} ${item.name}`
    : `${selected ? "Active" : "Select"} ${item.name}`;

  return `
    <article class="mcv-choice-card ${selected ? "selected" : ""}">
      <div class="mcv-choice-copy">
        <div class="mcv-choice-title">
          ${escapeHtml(item.name)}${cost != null ? ` <span class="mcv-inline-cost">(${escapeHtml(cost)})</span>` : ""}
        </div>
        ${detail.map((line, index) => `<div class="mcv-choice-detail ${index === 0 ? "primary-detail" : ""}">${escapeHtml(line)}</div>`).join("")}
      </div>
      <div class="mcv-choice-side">
        <button class="choice-action equipment-switch full-cell-switch ${selected ? "active" : ""}"
          data-action="${action}" ${field ? `data-field="${field}"` : ""} data-id="${item.id}"
          type="button" aria-label="${escapeHtml(buttonLabel)}" aria-pressed="${selected ? "true" : "false"}">
          <span class="full-cell-switch-track" aria-hidden="true">
            <span class="full-cell-switch-thumb"></span>
          </span>
          <span class="switch-led" aria-hidden="true"></span>
        </button>
      </div>
    </article>
  `;
}

function clearMainMcv() {
  state.roster.mcv = {
    profile: null,
    integratedComponent: null,
    shield: null,
    sidearm: null,
    primaryWeapons: [],
    equipment: []
  };

  if (state.gameState && Object.prototype.hasOwnProperty.call(state.gameState, "main-mcv")) {
    delete state.gameState["main-mcv"];
  }
}

function clearFireteamSelections() {
  state.roster.corporateClient = null;
  clearMainMcv();
  state.roster.infantry = [];
  state.roster.backupMCV = null;
  state.roster.orbitalOrdnance = [];
  state.gameState = {};
}

function renderSummary() {
  const result = validateRoster();
  const limits = effectiveLimits();
  const client = byId(state.data.corporateClients, state.roster.corporateClient);

  $("#summaryContractName").textContent = state.roster.name || "Untitled Operation";
  const clientEl = $("#summaryClientName");
  clientEl.textContent = client?.name || "Not Selected";
  clientEl.classList.toggle("placeholder", !client);

  $("#summaryThreat").textContent = `${result.total} / ${state.roster.threatLimit} Threat`;
  $("#summaryRemaining").textContent =
    result.total <= state.roster.threatLimit
      ? `${state.roster.threatLimit - result.total} remaining`
      : `${result.total - state.roster.threatLimit} over limit`;

  renderValidation(result);

  const sections = [];
  sections.push(summaryMcvSection());

  const pilots = state.roster.infantry.filter(
    x => byId(state.data.infantryUnits, x.unitId)?.type === "pilot"
  );
  sections.push(summaryUnitsSection("Pilots", pilots, `${infantryCount("pilot")} / ${limits.pilotMax}`));

  const otherInfantry = state.roster.infantry.filter(
    x => byId(state.data.infantryUnits, x.unitId)?.type !== "pilot"
  );
  sections.push(summaryUnitsSection("Infantry", otherInfantry, `${infantryCount()} / ${limits.infantryMax} total`));

  sections.push(summaryOrdnanceSection());

  if (state.roster.backupMCV) {
    const b = byId(state.data.backupMCVs, state.roster.backupMCV);
    sections.push(`
      <section class="summary-section">
        <div class="summary-section-head"><h3>Backup MCV</h3><span>${b?.threat || 0}</span></div>
        <div class="summary-unit">
          <div class="summary-unit-head">
            <strong>${escapeHtml(b?.name || state.roster.backupMCV)}</strong>
            <div class="summary-unit-actions">
              <button class="summary-remove" data-action="summary-remove-backup"
                type="button" title="Remove from Fireteam"
                aria-label="Remove ${escapeHtml(b?.name || "Backup MCV")} from Fireteam">
                ${trashIcon()}
              </button>
            </div>
          </div>
          <div class="summary-unit-detail">SPD ${b?.speed ?? "—"} · DEF ${b?.defense ?? "—"} · ARM ${b?.armor ?? "—"}</div>
        </div>
      </section>
    `);
  }

  sections.push(`
    <section class="summary-clear-area">
      <div class="summary-clear-copy">
        <strong>CLEAR FIRETEAM</strong>
        <span>Remove all current selections and start the roster over.</span>
      </div>
      <button class="clear-fireteam-button" data-action="clear-fireteam" type="button">
        CLEAR LIST
      </button>
    </section>
  `);

  $("#summaryContent").innerHTML = sections.join("");
}

function summaryMcvSection() {
  const m = state.roster.mcv;
  const profile = byId(state.data.mcvProfiles, m.profile);
  const component = byId(state.data.mcvIntegratedComponents, m.integratedComponent);
  const shield = byId(state.data.mcvShields, m.shield);
  const sidearm = byId(state.data.mcvWeapons, m.sidearm);
  const stats = mcvStats();

  return `
    <section class="summary-section">
      <div class="summary-section-head">
        <h3>MCV</h3>
        ${profile ? `
          <div class="summary-section-head-actions">
            <span>configured live</span>
            <button class="summary-remove" data-action="summary-remove-mcv"
              type="button" title="Remove MCV from Fireteam"
              aria-label="Remove ${escapeHtml(profile.name)} MCV and clear its configuration">
              ${trashIcon()}
            </button>
          </div>
        ` : `<span>not selected</span>`}
      </div>
      ${profile ? `
        <div class="summary-primary">${escapeHtml(profile.name)} MCV</div>
        ${stats ? `<div class="summary-unit-detail">SPD ${stats.speed} · DEF ${stats.defense} · ARM ${stats.armor}</div>` : ""}
        ${summaryLine("Integrated Component", component?.name || "Not Selected")}
        ${summaryLine("Shield", shield?.name || "Not Selected")}
        ${summaryLine("Sidearm", sidearm ? `${sidearm.name} · ${sidearm.threat}` : "Not Selected")}
        ${summaryLine("Primary Weapons", m.primaryWeapons.length
          ? m.primaryWeapons.map(id => {
              const w = byId(state.data.mcvWeapons, id);
              return `${w?.name || id} (${w?.threat || 0})`;
            }).join(", ")
          : "None")}
        ${summaryLine("Equipment", m.equipment.length
          ? m.equipment.map(id => {
              const eq = byId(state.data.mcvEquipment, id) || byId(state.data.mcvWeapons, id);
              return `${eq?.name || id}${eq?.threat != null ? ` (${eq.threat})` : ""}`;
            }).join(", ")
          : "None")}
      ` : `<div class="empty-state">No MCV profile selected yet.</div>`}
    </section>
  `;
}

function summaryUnitsSection(title, entries, counter) {
  return `
    <section class="summary-section">
      <div class="summary-section-head"><h3>${escapeHtml(title)}</h3><span>${escapeHtml(counter)}</span></div>
      ${entries.length ? entries.map(entry => {
        const unit = byId(state.data.infantryUnits, entry.unitId);
        const per = unit?.threat || 0;
        const weaponChoice = entry.config?.weaponChoice
          ? byId(state.data.infantryWeapons, entry.config.weaponChoice)?.name
          : null;
        return `
          <div class="summary-unit">
            <div class="summary-unit-head">
              <strong>${entry.quantity > 1 ? `${entry.quantity}× ` : ""}${escapeHtml(unit?.name || entry.unitId)}</strong>
              <div class="summary-unit-actions">
                <span class="threat-cost">${per * entry.quantity}</span>
                <button class="summary-remove" data-action="summary-remove-unit"
                  data-entry="${entry.entryId}" type="button"
                  title="Remove from Fireteam"
                  aria-label="Remove ${escapeHtml(unit?.name || entry.unitId)} from Fireteam">
                  ${trashIcon()}
                </button>
              </div>
            </div>
            <div class="summary-unit-detail">
              ${weaponChoice ? `Weapon: ${escapeHtml(weaponChoice)}` : `SPD ${unit?.speed ?? "—"} · DEF ${unit?.defense ?? "—"} · ARM ${unit?.armor ?? "—"} · TAC ${unit?.tactics ?? "—"}`}
            </div>
          </div>
        `;
      }).join("") : `<div class="empty-state">None selected.</div>`}
    </section>
  `;
}

function summaryOrdnanceSection() {
  return `
    <section class="summary-section">
      <div class="summary-section-head">
        <h3>Orbital Ordnance</h3>
        <span>${state.roster.orbitalOrdnance.length} / ${effectiveLimits().ordnanceMax}</span>
      </div>
      ${state.roster.orbitalOrdnance.length ? state.roster.orbitalOrdnance.map(id => {
        const o = byId(state.data.orbitalOrdnance, id);
        return `
          <div class="summary-unit">
            <div class="summary-unit-head">
              <strong>${escapeHtml(o?.name || id)}</strong>
              <div class="summary-unit-actions">
                <span class="threat-cost">${o?.threat || 0}</span>
                <button class="summary-remove" data-action="summary-remove-ordnance"
                  data-id="${id}" type="button"
                  title="Remove from Fireteam"
                  aria-label="Remove ${escapeHtml(o?.name || id)} from Fireteam">
                  ${trashIcon()}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join("") : `<div class="empty-state">None selected.</div>`}
    </section>
  `;
}

function renderValidation(result) {
  const root = $("#validationBox");

  if (result.legal && result.warnings.length === 0) {
    root.innerHTML = `<div class="validation-summary good"><strong>✓ Legal Fireteam</strong><div class="subtle">No construction errors found.</div></div>`;
    return;
  }

  const items = [
    ...result.errors.map(x => `⚠ ${x}`),
    ...result.warnings.map(x => `• ${x}`)
  ];
  root.innerHTML = `
    <div class="validation-summary ${result.errors.length ? "bad" : ""}">
      <strong>${result.errors.length ? "Fireteam needs attention" : "Review notes"}</strong>
      <ul>${items.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
    </div>
  `;
}

function pilotGameInstances() {
  const pilots = [];
  for (const entry of state.roster.infantry) {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    if (unit?.type !== "pilot") continue;
    for (let i = 0; i < entry.quantity; i++) {
      pilots.push({
        key: `${entry.entryId}-${i}`,
        unit,
        name: entry.quantity > 1 ? `${unit.name} ${i + 1}` : unit.name
      });
    }
  }
  return pilots;
}

function mountedPilot() {
  const key = state.gameState["main-mcv"]?.mountedPilotKey;
  return pilotGameInstances().find(x => x.key === key) || null;
}

function mcvGameStats() {
  const base = mcvStats();
  if (!base) return null;

  const mounted = mountedPilot();
  if (!mounted) {
    return {...base, tactics: "—", actions: "—"};
  }

  const effect = byId(state.data.pilotExperience, mounted.unit.experience);
  return {
    ...base,
    armor: base.armor + (effect?.armorModifier || 0),
    tactics: mounted.unit.tactics,
    actions: (byId(state.data.mcvProfiles, state.roster.mcv.profile)?.baseActions || 2) + (effect?.actionBonus || 0)
  };
}

function renderGame() {
  const root = $("#gameCards");
  const cards = [];
  const profile = byId(state.data.mcvProfiles, state.roster.mcv.profile);
  const stats = mcvGameStats();
  const pilots = pilotGameInstances();
  const mounted = mountedPilot();

  if (profile && stats) {
    cards.push(mcvGameCard({profile, stats, pilots, mounted}));
  }

  for (const entry of state.roster.infantry) {
    const unit = byId(state.data.infantryUnits, entry.unitId);
    if (!unit) continue;
    for (let i = 0; i < entry.quantity; i++) {
      const key = `${entry.entryId}-${i}`;
      const isMounted = mounted?.key === key;
      cards.push(gameCard({
        key,
        name: entry.quantity > 1 ? `${unit.name} ${i + 1}` : unit.name,
        type: isMounted ? `${unit.type} · Mounted in MCV` : unit.type,
        stats: {SPD: unit.speed, DEF: unit.defense, ARM: unit.armor, TAC: unit.tactics},
        details: [
          ...(unit.weapons || []).map(id => byId(state.data.infantryWeapons, id)?.name),
          entry.config?.weaponChoice
            ? byId(state.data.infantryWeapons, entry.config.weaponChoice)?.name
            : null,
          ...(unit.abilities || []).slice(0, 1)
        ].filter(Boolean)
      }));
    }
  }

  root.innerHTML = cards.length
    ? cards.join("")
    : `<div class="empty-state">Build your Fireteam first to populate Game mode.</div>`;
}

function mcvGameCard({profile, stats, pilots, mounted}) {
  const key = "main-mcv";
  const gs = state.gameState[key] || {status: "ready", mountedPilotKey: null};
  return `
    <article class="game-card ${gs.status === "downed" ? "down" : ""} ${gs.status === "kia" ? "kia" : ""} ${gs.status === "activated" ? "activated" : ""}">
      <div class="game-card-head">
        <div>
          <strong>${escapeHtml(profile.name)} MCV</strong>
          <div class="subtle">${mounted ? `Mounted: ${escapeHtml(mounted.name)}` : "Null / no Pilot mounted"}</div>
        </div>
        <span class="status-pill">${escapeHtml(gs.status)}</span>
      </div>
      <div class="game-stats">
        ${statChip("SPD", stats.speed)}
        ${statChip("DEF", stats.defense)}
        ${statChip("ARM", stats.armor)}
        ${statChip("TAC", stats.tactics)}
        ${statChip("ACT", stats.actions)}
      </div>
      <label class="game-mount-control">
        <span>Mounted Pilot</span>
        <select data-action="mount-pilot">
          <option value="">Null / none</option>
          ${pilots.map(p => `<option value="${p.key}" ${mounted?.key === p.key ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </label>
      <div class="subtle game-mcv-note">Pilot-derived MCV effects update here when a Pilot mounts or dismounts.</div>
      <div class="game-controls" style="margin-top:10px">
        ${["ready","activated","downed","kia"].map(status => `
          <button class="${gs.status === status ? "active" : ""}"
            data-action="game-status" data-key="${key}" data-status="${status}" type="button">${status}</button>
        `).join("")}
      </div>
    </article>
  `;
}

function gameCard({key, name, type, stats, details}) {
  const gs = state.gameState[key] || {status: "ready"};
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
        ${Object.entries(stats).map(([k,v]) => statChip(k, v)).join("")}
      </div>
      <div class="subtle">${details.map(escapeHtml).join(" · ")}</div>
      <div class="game-controls" style="margin-top:10px">
        ${["ready","activated","downed","kia"].map(status => `
          <button class="${gs.status === status ? "active" : ""}"
            data-action="game-status" data-key="${key}" data-status="${status}" type="button">${status}</button>
        `).join("")}
      </div>
    </article>
  `;
}

function addUnit(unitId) {
  const unit = byId(state.data.infantryUnits, unitId);
  if (!unit) return;

  // Configurable Heavy Weapon Specialists remain separate entries.
  if (unit.weaponChoice) {
    state.roster.infantry.push({
      entryId: uid("unit"),
      unitId,
      quantity: 1,
      config: {}
    });
  } else {
    const existing = state.roster.infantry.find(x => x.unitId === unitId);
    if (existing) existing.quantity += 1;
    else {
      state.roster.infantry.push({
        entryId: uid("unit"),
        unitId,
        quantity: 1,
        config: {}
      });
    }
  }

  render();
}

function removeOneUnit(unitId) {
  const entries = state.roster.infantry.filter(x => x.unitId === unitId);
  if (!entries.length) return;

  const last = entries[entries.length - 1];
  if (last.quantity > 1) last.quantity -= 1;
  else state.roster.infantry = state.roster.infantry.filter(x => x.entryId !== last.entryId);
  render();
}

function toggleSelection(array, id, max) {
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

function renderAndPersist() {
  render();
  persistCurrent();
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
    schemaVersion: 3,
    format: "arsenal-builder-roster",
    exportedAt: new Date().toISOString(),
    roster: clone(state.roster)
  };
  downloadFile(
    `${safeFileName(state.roster.name)}.arsenal.json`,
    JSON.stringify(payload, null, 2),
    "application/json"
  );
}

function exportRosterText() {
  const result = validateRoster();
  const client = byId(state.data.corporateClients, state.roster.corporateClient);
  const lines = [
    `${state.roster.name} — ${result.total}/${state.roster.threatLimit} Threat`,
    `Corporate Client: ${client?.name || "Not Selected"}`,
    ""
  ];

  const profile = byId(state.data.mcvProfiles, state.roster.mcv.profile);
  if (profile) {
    lines.push(`${profile.name} MCV`);
    lines.push(`  Component: ${byId(state.data.mcvIntegratedComponents, state.roster.mcv.integratedComponent)?.name || "—"}`);
    lines.push(`  Shield: ${byId(state.data.mcvShields, state.roster.mcv.shield)?.name || "—"}`);
    lines.push(`  Sidearm: ${byId(state.data.mcvWeapons, state.roster.mcv.sidearm)?.name || "—"}`);
    if (state.roster.mcv.primaryWeapons.length) {
      lines.push(`  Primary: ${state.roster.mcv.primaryWeapons.map(id => byId(state.data.mcvWeapons, id)?.name).join(", ")}`);
    }
    if (state.roster.mcv.equipment.length) {
      lines.push(`  Equipment: ${state.roster.mcv.equipment.map(id =>
        byId(state.data.mcvEquipment, id)?.name || byId(state.data.mcvWeapons, id)?.name
      ).join(", ")}`);
    }
    lines.push("");
  }

  const pilots = state.roster.infantry.filter(x => byId(state.data.infantryUnits, x.unitId)?.type === "pilot");
  if (pilots.length) {
    lines.push("Pilots");
    for (const e of pilots) {
      const u = byId(state.data.infantryUnits, e.unitId);
      lines.push(`  ${e.quantity}× ${u?.name || e.unitId}`);
    }
    lines.push("");
  }

  const others = state.roster.infantry.filter(x => byId(state.data.infantryUnits, x.unitId)?.type !== "pilot");
  if (others.length) {
    lines.push("Infantry");
    for (const e of others) {
      const u = byId(state.data.infantryUnits, e.unitId);
      const weapon = e.config?.weaponChoice
        ? ` — ${byId(state.data.infantryWeapons, e.config.weaponChoice)?.name || e.config.weaponChoice}`
        : "";
      lines.push(`  ${e.quantity}× ${u?.name || e.unitId}${weapon}`);
    }
    lines.push("");
  }

  if (state.roster.orbitalOrdnance.length) {
    lines.push("Orbital Ordnance");
    for (const id of state.roster.orbitalOrdnance) {
      lines.push(`  ${byId(state.data.orbitalOrdnance, id)?.name || id}`);
    }
  }

  if (state.roster.backupMCV) {
    lines.push("", `Backup MCV: ${byId(state.data.backupMCVs, state.roster.backupMCV)?.name || state.roster.backupMCV}`);
  }

  downloadFile(`${safeFileName(state.roster.name)}.txt`, lines.join("\n"), "text/plain");
}

function buildDiscordRoster() {
  const result = validateRoster();
  const client = byId(state.data.corporateClients, state.roster.corporateClient);
  const lines = [
    `**${state.roster.name || "Untitled Operation"}**`,
    `**Corporate Client:** ${client?.name || "Not Selected"}`,
    `**Threat:** ${result.total} / ${state.roster.threatLimit}`,
    ""
  ];

  const profile = byId(state.data.mcvProfiles, state.roster.mcv.profile);
  if (profile) {
    lines.push(`__MCV — ${profile.name}__`);
    const component = byId(state.data.mcvIntegratedComponents, state.roster.mcv.integratedComponent);
    const shield = byId(state.data.mcvShields, state.roster.mcv.shield);
    const sidearm = byId(state.data.mcvWeapons, state.roster.mcv.sidearm);
    if (component) lines.push(`• Integrated Component: ${component.name}`);
    if (shield) lines.push(`• Shield: ${shield.name}`);
    if (sidearm) lines.push(`• Sidearm: ${sidearm.name}${sidearm.threat ? ` (${sidearm.threat})` : ""}`);
    if (state.roster.mcv.primaryWeapons.length) {
      lines.push(`• Primary: ${state.roster.mcv.primaryWeapons.map(id => {
        const w = byId(state.data.mcvWeapons, id);
        return `${w?.name || id}${w?.threat ? ` (${w.threat})` : ""}`;
      }).join(", ")}`);
    }
    if (state.roster.mcv.equipment.length) {
      lines.push(`• Equipment: ${state.roster.mcv.equipment.map(id => {
        const eq = byId(state.data.mcvEquipment, id) || byId(state.data.mcvWeapons, id);
        return `${eq?.name || id}${eq?.threat ? ` (${eq.threat})` : ""}`;
      }).join(", ")}`);
    }
    lines.push("");
  }

  const pilots = state.roster.infantry.filter(x => byId(state.data.infantryUnits, x.unitId)?.type === "pilot");
  if (pilots.length) {
    lines.push("__Pilots__");
    for (const e of pilots) {
      const u = byId(state.data.infantryUnits, e.unitId);
      const total = (u?.threat || 0) * e.quantity;
      lines.push(`• ${e.quantity > 1 ? `${e.quantity}× ` : ""}${u?.name || e.unitId}${total ? ` — ${total}` : ""}`);
    }
    lines.push("");
  }

  const infantry = state.roster.infantry.filter(x => byId(state.data.infantryUnits, x.unitId)?.type !== "pilot");
  if (infantry.length) {
    lines.push("__Infantry__");
    for (const e of infantry) {
      const u = byId(state.data.infantryUnits, e.unitId);
      const total = (u?.threat || 0) * e.quantity;
      const weapon = e.config?.weaponChoice
        ? byId(state.data.infantryWeapons, e.config.weaponChoice)?.name || e.config.weaponChoice
        : null;
      lines.push(`• ${e.quantity > 1 ? `${e.quantity}× ` : ""}${u?.name || e.unitId}${weapon ? ` — ${weapon}` : ""}${total ? ` — ${total}` : ""}`);
    }
    lines.push("");
  }

  if (state.roster.orbitalOrdnance.length) {
    lines.push("__Orbital Ordnance__");
    for (const id of state.roster.orbitalOrdnance) {
      const o = byId(state.data.orbitalOrdnance, id);
      lines.push(`• ${o?.name || id}${o?.threat ? ` — ${o.threat}` : ""}`);
    }
    lines.push("");
  }

  if (state.roster.backupMCV) {
    const b = byId(state.data.backupMCVs, state.roster.backupMCV);
    lines.push(`__Backup MCV__`);
    lines.push(`• ${b?.name || state.roster.backupMCV}${b?.threat ? ` — ${b.threat}` : ""}`);
  }

  return lines.join("\n").trim();
}

async function copyDiscordRoster() {
  const text = buildDiscordRoster();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Copy command failed");
    }
    showToast("Discord roster copied.");
  } catch (err) {
    showToast("Could not copy automatically. Use Download Text instead.");
  }
}

function printRoster() {
  if ($("#manageDialog").open) $("#manageDialog").close();
  setTimeout(() => window.print(), 50);
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
  return (name || "arsenal-fireteam")
    .replace(/[^\w\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "arsenal-fireteam";
}

function matches(q, ...values) {
  if (!q) return true;
  return values.filter(Boolean).join(" ").toLowerCase().includes(q);
}

function statChip(label, value) {
  return `<div class="stat-chip"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function summaryLine(label, value) {
  return `<div class="summary-line"><span>${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

function trashIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" fill="currentColor"/>
  </svg>`;
}

function searchEmpty() {
  return `<div class="search-empty">No matching options in this section.</div>`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[ch]));
}

document.addEventListener("click", e => {
  // Native selects are handled by the delegated "change" listener below.
  // Do not rerender them on click or the browser popup is destroyed before
  // the user can choose an option.
  if (e.target.closest("select, option")) return;

  const actionEl = e.target.closest("[data-action]");
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id;

  if (action === "set-mcv-field") {
    const field = actionEl.dataset.field;

    if (field === "profile" && state.roster.mcv.profile === id) {
      clearMainMcv();
      showToast("MCV removed.");
    } else {
      state.roster.mcv[field] = id;
    }
  } else if (action === "toggle-primary") {
    toggleSelection(state.roster.mcv.primaryWeapons, id, effectiveLimits().primaryMax);
  } else if (action === "toggle-equipment") {
    toggleSelection(state.roster.mcv.equipment, id, effectiveLimits().equipmentMax);
  } else if (action === "toggle-backup") {
    state.roster.backupMCV = state.roster.backupMCV === id ? null : id;
  } else if (action === "add-unit") {
    addUnit(id);
    persistCurrent();
    return;
  } else if (action === "remove-one-unit") {
    removeOneUnit(id);
    persistCurrent();
    return;
  } else if (action === "remove-all-unit") {
    state.roster.infantry = state.roster.infantry.filter(x => x.unitId !== id);
  } else if (action === "select-client") {
    state.roster.corporateClient = id;
  } else if (action === "toggle-ordnance") {
    toggleSelection(state.roster.orbitalOrdnance, id, effectiveLimits().ordnanceMax);
  } else if (action === "summary-remove-unit") {
    const entryId = actionEl.dataset.entry;
    state.roster.infantry = state.roster.infantry.filter(x => x.entryId !== entryId);
  } else if (action === "summary-remove-ordnance") {
    state.roster.orbitalOrdnance = state.roster.orbitalOrdnance.filter(x => x !== id);
  } else if (action === "summary-remove-backup") {
    state.roster.backupMCV = null;
  } else if (action === "summary-remove-mcv") {
    clearMainMcv();
    showToast("MCV removed.");
  } else if (action === "clear-fireteam") {
    const confirmed = confirm(
      "Clear this Fireteam?\n\nThis removes the MCV configuration, Pilots, Infantry, Corporate Client, Ordnance, and Backup MCV. The operation name and Threat limit will be kept."
    );
    if (!confirmed) return;
    clearFireteamSelections();
    showToast("Fireteam cleared.");
  } else if (action === "game-status") {
    const key = actionEl.dataset.key;
    state.gameState[key] = {...(state.gameState[key] || {}), status: actionEl.dataset.status};
    renderGame();
    return;
  }

  renderAndPersist();
});

document.addEventListener("change", e => {
  if (e.target.matches('[data-action="mount-pilot"]')) {
    state.gameState["main-mcv"] = {
      ...(state.gameState["main-mcv"] || {status: "ready"}),
      mountedPilotKey: e.target.value || null
    };
    renderGame();
    return;
  }

  if (e.target.matches('[data-action="heavy-weapon-choice"]')) {
    const entry = state.roster.infantry.find(x => x.entryId === e.target.dataset.entry);
    if (entry) {
      entry.config ||= {};
      entry.config.weaponChoice = e.target.value || null;
      renderAndPersist();
    }
  }
});

$("#operationName").addEventListener("input", e => {
  state.roster.name = e.target.value;
  $("#summaryContractName").textContent = e.target.value || "Untitled Operation";
  $("#gameTitle").textContent = e.target.value || "Untitled Operation";
  persistCurrent();
});

$("#threatLimit").addEventListener("input", e => {
  state.roster.threatLimit = Math.max(1, parseInt(e.target.value || "1", 10));
  renderAndPersist();
});

$("#catalogSearch").addEventListener("input", e => {
  state.search = e.target.value;
  renderBuildContent();
});

$("#builderTabs").addEventListener("click", e => {
  const btn = e.target.closest("[data-tab]");
  if (!btn) return;

  state.activeTab = btn.dataset.tab;
  state.search = "";
  $("#catalogSearch").value = "";
  $$(".builder-tab").forEach(x => x.classList.toggle("active", x === btn));
  renderBuildContent();
});

$$(".mode-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;

    if (mode === "build") {
      $("#buildMode").classList.remove("hidden");
      $("#gameMode").classList.add("hidden");
      $(".build-panel").classList.remove("mobile-hidden");
      $("#summaryPanel").classList.remove("mobile-hidden");
    }

    if (mode === "game") {
      $("#buildMode").classList.add("hidden");
      $("#gameMode").classList.remove("hidden");
    }

    if (mode === "summary") {
      $("#buildMode").classList.remove("hidden");
      $("#gameMode").classList.add("hidden");
      $(".build-panel").classList.add("mobile-hidden");
      $("#summaryPanel").classList.remove("mobile-hidden");
    }

    $$(".mode-tab").forEach(x => x.classList.toggle("active", x === btn));
  });
});

$("#saveListBtn").addEventListener("click", saveRoster);

$("#newListBtn").addEventListener("click", () => {
  if (!confirm("Start a new Fireteam? Save the current one first if you want to keep it.")) return;
  state.roster = defaultRoster();
  state.gameState = {};
  state.activeTab = "mcv";
  state.search = "";
  $("#catalogSearch").value = "";
  $$(".builder-tab").forEach(x => x.classList.toggle("active", x.dataset.tab === "mcv"));
  renderAndPersist();
});

$("#manageBtn").addEventListener("click", () => $("#manageDialog").showModal());
$("#closeManageBtn").addEventListener("click", () => $("#manageDialog").close());
$("#copyDiscordBtn").addEventListener("click", copyDiscordRoster);
$("#printRosterBtn").addEventListener("click", printRoster);
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
    const imported = parsed.roster || parsed;

    if (imported.game !== "arsenal") throw new Error("This is not an Arsenal roster.");
    if (!imported.mcv || !Array.isArray(imported.infantry)) {
      throw new Error("Roster structure is incomplete.");
    }

    const roster = normalizeRoster(imported);
    preview.innerHTML = `
      <strong>${escapeHtml(roster.name || "Imported Fireteam")}</strong><br>
      ${roster.infantry.reduce((sum, x) => sum + x.quantity, 0)} infantry · ${roster.threatLimit} Threat limit
      <div style="margin-top:8px">
        <button id="confirmImportBtn" class="button primary" type="button">Import as New Fireteam</button>
      </div>
    `;

    $("#confirmImportBtn").addEventListener("click", () => {
      roster.id = uid("roster");
      roster.name = roster.name ? `${roster.name} (Imported)` : "Imported Fireteam";
      state.roster = roster;
      state.gameState = {};
      renderAndPersist();
      $("#manageDialog").close();
      showToast("Roster imported.");
    }, {once: true});
  } catch (err) {
    preview.textContent = `Could not import: ${err.message}`;
  }
});

async function init() {
  const response = await fetch("data/arsenal.json");
  if (!response.ok) throw new Error(`Could not load data/arsenal.json (${response.status}).`);
  state.data = await response.json();

  const saved = localStorage.getItem("arsenal.currentRoster");
  if (saved) {
    try {
      state.roster = normalizeRoster(JSON.parse(saved));
    } catch {
      state.roster = defaultRoster();
    }
  } else {
    state.roster = defaultRoster();
  }

  render();
}

init().catch(err => {
  document.body.innerHTML = `
    <main style="padding:30px;color:white;font-family:sans-serif">
      <h1>Could not load Arsenal data</h1>
      <p>${escapeHtml(err.message)}</p>
      <p>Serve this folder through a local web server or GitHub Pages rather than opening index.html directly.</p>
    </main>
  `;
});
