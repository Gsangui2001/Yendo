const STORAGE_KEY = "yendo-beta-orders-v2";
const ACTIVITY_KEY = "yendo-beta-activity-v1";
const CONFIG = window.YENDO_SUPABASE || {};

const ZONES = [
  { value: "ciudad_colon", label: "Ciudad de Colón", price: 3000 },
  { value: "barrio_ombu", label: "Barrio Ombú", price: 3500 },
  { value: "barrio_artalaz", label: "Barrio Artalaz", price: 5000 },
  { value: "barrio_los_bretes", label: "Barrio Los Bretes", price: 6000 },
  { value: "san_jose", label: "San José", price: 8500 },
  { value: "el_brillante", label: "El Brillante", price: 8500 },
  { value: "pueblo_liebig", label: "Pueblo Liebig", price: 8500 }
];

let activeZones = [...ZONES];

const STATUS_LABELS = {
  available: "Disponible",
  accepted: "Aceptado",
  picked_up: "Retirado",
  in_transit: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado"
};

const PAYMENT_LABELS = {
  paga_cliente: "Paga cliente",
  paga_comercio: "Paga comercio",
  efectivo: "Efectivo",
  transferencia: "Transferencia"
};

const PRIORITY_LABELS = {
  normal: "Normal",
  urgente: "Urgente"
};

const REQUEST_TYPE_LABELS = {
  envio: "Enviar paquete",
  compra: "Buscar compra",
  tramite: "Trámite",
  urgente: "Urgente"
};

const ROLE_COPY = {
  comercio: {
    label: "Cliente",
    title: "Panel de cliente",
    help: "Crea pedidos y revisa su avance.",
    sidebar: "Pedí cadetes, seguí entregas y controlá tus movimientos.",
    primaryAction: "Pedir cadete"
  },
  cadete: {
    label: "Cadete",
    title: "Panel de cadete",
    help: "Acepta pedidos y actualiza el estado de cada entrega.",
    sidebar: "Tomá pedidos disponibles y marcá cada etapa del recorrido.",
    primaryAction: "Tomar pedido"
  },
  privado: {
    label: "Privado",
    title: "Pedido particular",
    help: "Solicita un envío puntual de forma simple.",
    sidebar: "Pedí envíos, compras o trámites puntuales.",
    primaryAction: "Solicitar envío"
  },
  admin: {
    label: "Admin",
    title: "Control operativo",
    help: "Monitorea pedidos, estados y alertas del piloto.",
    sidebar: "Supervisá actividad, estados, alertas y salud del sistema.",
    primaryAction: "Simular urgente"
  }
};

const state = {
  role: "comercio",
  isLoggedIn: sessionStorage.getItem("yendo-beta-session") === "active",
  available: true,
  filter: "all",
  supabase: null,
  supabaseReady: false,
  currentUser: null,
  currentProfile: null,
  currentCourier: null,
  currentBusiness: null,
  realtimeChannel: null,
  orders: loadOrders(),
  activity: loadActivity()
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const zoneByValue = (value) => activeZones.find((zone) => zone.value === value) || activeZones[0];

function loadOrders() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadActivity() {
  try {
    const saved = localStorage.getItem(ACTIVITY_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrders() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
}

function saveActivity() {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(state.activity.slice(0, 20)));
}

function isSupabaseConfigured() {
  return Boolean(CONFIG.url && CONFIG.anonKey && window.supabase?.createClient);
}

async function initializeBackend() {
  if (!isSupabaseConfigured()) {
    setText("#loginHint", "Modo demo local activo.");
    return;
  }

  state.supabase = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);
  state.supabaseReady = true;
  setText("#loginHint", "Modo beta compartida activo.");

  const { data } = await state.supabase.auth.getSession();
  if (data?.session?.user) {
    state.currentUser = data.session.user;
    await loadRemoteContext();
    $("#loginScreen")?.classList.add("is-hidden");
    $("#appFrame")?.classList.remove("is-locked");
    setRole(state.role);
    subscribeToOrders();
    render();
  }
}

async function loadRemoteContext() {
  if (!state.supabase || !state.currentUser) return;

  const { data: profile, error: profileError } = await state.supabase
    .from("profiles")
    .select("*")
    .eq("id", state.currentUser.id)
    .single();

  if (profileError || !profile) {
    throw new Error("No encontramos el perfil de este usuario en Supabase.");
  }

  state.currentProfile = profile;
  state.role = profile.role || "privado";

  const [{ data: business }, { data: courier }] = await Promise.all([
    state.supabase.from("businesses").select("*").eq("owner_id", state.currentUser.id).maybeSingle(),
    state.supabase.from("couriers").select("*").eq("profile_id", state.currentUser.id).maybeSingle()
  ]);

  state.currentBusiness = business || null;
  state.currentCourier = courier || null;
  state.available = Boolean(courier?.is_available ?? state.available);

  await loadRemoteZones();
  await loadRemoteOrders();
}

async function loadRemoteZones() {
  if (!state.supabase) return;
  const { data, error } = await state.supabase
    .from("zones")
    .select("id,name,pricing_rules(base_price)")
    .eq("is_active", true)
    .order("name");

  if (error || !Array.isArray(data) || !data.length) return;

  activeZones = data.map((zone) => ({
    value: zone.id,
    label: zone.name,
    price: Number(zone.pricing_rules?.[0]?.base_price || 0)
  }));
  populateZones();
}

async function loadRemoteOrders() {
  if (!state.supabase) return;
  const { data, error } = await state.supabase
    .from("orders")
    .select("*, businesses(name), zones(name), couriers(id)")
    .order("created_at", { ascending: false });

  if (error) {
    toast("No pude cargar pedidos compartidos.");
    return;
  }

  state.orders = (data || []).map(remoteOrderToLocal);
}

function subscribeToOrders() {
  if (!state.supabase || state.realtimeChannel) return;
  state.realtimeChannel = state.supabase
    .channel("orders-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, async () => {
      await loadRemoteOrders();
      render();
    })
    .subscribe();
}

function remoteOrderToLocal(order) {
  const zone = order.zone_id
    ? activeZones.find((item) => item.value === order.zone_id)
    : null;

  return {
    id: order.id,
    businessName: order.businesses?.name || (order.created_by === state.currentUser?.id ? state.currentProfile?.full_name : "Pedido Yendo"),
    pickupAddress: order.pickup_address,
    dropoffAddress: order.dropoff_address,
    reference: order.pickup_reference || order.dropoff_reference || "",
    notes: order.notes || "",
    contact: order.contact_phone || "",
    paymentMethod: order.payment_method || "paga_cliente",
    priority: order.priority || "normal",
    requestType: "",
    createdBy: order.created_by === state.currentUser?.id ? state.role : "remoto",
    status: order.status,
    courierName: order.courier_id ? "Cadete asignado" : "",
    courierId: order.courier_id || "",
    zone: order.zone_id || zone?.value || "",
    zoneLabel: order.zones?.name || zone?.label || "Zona",
    price: Number(order.price || zone?.price || 0),
    createdAtMs: order.created_at ? new Date(order.created_at).getTime() : Date.now(),
    createdAt: order.created_at ? dateLabel(order.created_at) : nowLabel()
  };
}

function dateLabel(value) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function money(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function nowLabel() {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `order-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function createOrder(payload) {
  const zone = zoneByValue(payload.zone);
  const order = {
    id: createId(),
    businessName: clean(payload.businessName) || "Pedido",
    pickupAddress: clean(payload.pickupAddress),
    dropoffAddress: clean(payload.dropoffAddress),
    reference: clean(payload.reference),
    notes: clean(payload.notes),
    contact: clean(payload.contact),
    paymentMethod: payload.paymentMethod || "paga_cliente",
    priority: payload.priority || "normal",
    requestType: payload.requestType || "",
    createdBy: payload.createdBy || "comercio",
    status: "available",
    courierName: "",
    zone: zone.value,
    zoneLabel: zone.label,
    price: zone.price,
    createdAtMs: Date.now(),
    createdAt: nowLabel()
  };

  if (state.supabaseReady && state.currentUser) {
    const remotePayload = {
      created_by: state.currentUser.id,
      business_id: state.currentBusiness?.id || null,
      pickup_address: order.pickupAddress || "Retiro a coordinar",
      dropoff_address: order.dropoffAddress || "Entrega a coordinar",
      pickup_reference: order.reference || null,
      notes: order.notes || null,
      contact_phone: order.contact || null,
      payment_method: order.paymentMethod,
      priority: order.priority,
      status: "available",
      price: order.price,
      zone_id: order.zone || null
    };

    const { error } = await state.supabase.from("orders").insert(remotePayload);
    if (error) {
      toast("No pude publicar el pedido compartido.");
      return;
    }

    addActivity("Nuevo pedido", `${order.businessName} publicó un pedido para ${order.zoneLabel}.`);
    await loadRemoteOrders();
    render();
    toast("Pedido publicado para todos.");
    return;
  }

  state.orders.unshift(order);
  saveOrders();
  addActivity("Nuevo pedido", `${order.businessName} publicó un pedido para ${order.zoneLabel}.`);
  render();
  toast("Pedido publicado.");
}

async function updateOrder(orderId, patch, message) {
  const previous = state.orders.find((order) => order.id === orderId);

  if (state.supabaseReady && state.currentUser) {
    const remotePatch = remotePatchFromLocalPatch(patch);
    const { error } = await state.supabase
      .from("orders")
      .update(remotePatch)
      .eq("id", orderId);

    if (error) {
      toast("No pude actualizar el pedido compartido.");
      return;
    }

    await state.supabase.from("order_events").insert({
      order_id: orderId,
      actor_id: state.currentUser.id,
      from_status: previous?.status || null,
      to_status: remotePatch.status || patch.status || previous?.status,
      note: message
    });

    await loadRemoteOrders();
    const next = state.orders.find((order) => order.id === orderId);
    if (next) addActivity(statusActivityTitle(remotePatch.status), statusActivityText(previous, next));
    render();
    toast(message);
    return;
  }

  state.orders = state.orders.map((order) => (
    order.id === orderId ? { ...order, ...patch } : order
  ));
  saveOrders();
  const next = state.orders.find((order) => order.id === orderId);
  if (next) addActivity(statusActivityTitle(patch.status), statusActivityText(previous, next));
  render();
  toast(message);
}

function remotePatchFromLocalPatch(patch) {
  const remotePatch = {};
  if (patch.status) remotePatch.status = patch.status;
  if (patch.status === "accepted") {
    remotePatch.courier_id = state.currentCourier?.id || null;
    remotePatch.accepted_at = new Date().toISOString();
  }
  if (patch.status === "picked_up") remotePatch.picked_up_at = new Date().toISOString();
  if (patch.status === "delivered") remotePatch.delivered_at = new Date().toISOString();
  if (patch.status === "cancelled") remotePatch.cancelled_at = new Date().toISOString();
  if (patch.status === "available") {
    remotePatch.courier_id = null;
    remotePatch.accepted_at = null;
    remotePatch.picked_up_at = null;
    remotePatch.delivered_at = null;
    remotePatch.cancelled_at = null;
  }
  return remotePatch;
}

function setRole(role) {
  state.role = role;
  const copy = ROLE_COPY[role] || ROLE_COPY.comercio;

  $$(".view").forEach((view) => {
    view.classList.toggle("is-visible", view.dataset.view === role);
  });

  $("#appFrame")?.setAttribute("data-role", role);
  setText("#currentRoleTitle", copy.label);
  setText("#dashboardTitle", copy.title);
  setText("#currentRoleHelp", copy.help);
  setText("#sidebarRoleName", copy.label);
  setText("#sidebarRoleHelp", copy.sidebar);
  setText("[data-quick='primaryRoleAction']", copy.primaryAction);
  renderMetrics();
  renderRoleStats();
  renderCourierAvailability();
}

async function login(role, email, password) {
  if (state.supabaseReady) {
    const { data, error } = await state.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data?.user) {
      toast("No pude iniciar sesión. Revisá email y contraseña.");
      return;
    }

    state.currentUser = data.user;
    await loadRemoteContext();
    state.isLoggedIn = true;
    sessionStorage.setItem("yendo-beta-session", "active");
    sessionStorage.setItem("yendo-beta-role", state.role);
    $("#loginScreen")?.classList.add("is-hidden");
    $("#appFrame")?.classList.remove("is-locked");
    setRole(state.role);
    subscribeToOrders();
    render();
    addActivity("Ingreso", `${ROLE_COPY[state.role]?.label || "Usuario"} entró a su dashboard.`);
    toast(`Ingresaste como ${ROLE_COPY[state.role]?.label || "usuario"}.`);
    return;
  }

  state.isLoggedIn = true;
  sessionStorage.setItem("yendo-beta-session", "active");
  sessionStorage.setItem("yendo-beta-role", role);
  $("#loginScreen")?.classList.add("is-hidden");
  $("#appFrame")?.classList.remove("is-locked");
  setRole(role);
  render();
  addActivity("Ingreso", `${ROLE_COPY[role]?.label || "Usuario"} entró a su dashboard.`);
  toast(`Ingresaste como ${ROLE_COPY[role]?.label || "usuario"}.`);
}

async function logout() {
  if (state.supabaseReady && state.supabase) {
    await state.supabase.auth.signOut();
    state.currentUser = null;
    state.currentProfile = null;
    state.currentCourier = null;
    state.currentBusiness = null;
    if (state.realtimeChannel) {
      state.supabase.removeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
    }
  }

  state.isLoggedIn = false;
  sessionStorage.removeItem("yendo-beta-session");
  sessionStorage.removeItem("yendo-beta-role");
  $("#appFrame")?.classList.add("is-locked");
  $("#loginScreen")?.classList.remove("is-hidden");
  addActivity("Salida", "Se cerró la sesión beta.");
  toast("Sesión cerrada.");
}

function restoreSession() {
  const savedRole = sessionStorage.getItem("yendo-beta-role") || "comercio";
  if (state.isLoggedIn) {
    $("#loginScreen")?.classList.add("is-hidden");
    $("#appFrame")?.classList.remove("is-locked");
    setRole(savedRole);
    return;
  }

  $("#loginScreen")?.classList.remove("is-hidden");
  $("#appFrame")?.classList.add("is-locked");
}

function render() {
  renderMetrics();
  renderFlow();
  renderActivity();
  renderRoleStats();
  renderBusinessOrders();
  renderCourierOrders();
  renderAdminOrders();
  renderAdminInsights();
  renderAdminQueues();
  renderCourierAvailability();
}

function renderMetrics() {
  const orders = ordersForCurrentRole();
  const active = orders.filter(isActiveOrder).length;
  const available = state.role === "cadete"
    ? state.orders.filter((order) => order.status === "available").length
    : orders.filter((order) => order.status === "available").length;

  setText("#metricOpenLabel", state.role === "cadete" ? "Para tomar" : "Disponibles");
  setText("#metricActiveLabel", state.role === "admin" ? "En movimiento" : "Activos");
  setText("#metricDoneLabel", state.role === "admin" ? "Cerrados" : "Entregados");
  setText("#metricOpen", available);
  setText("#metricActive", active);
  setText("#metricDone", orders.filter((order) => order.status === "delivered").length);
}

function renderFlow() {
  const line = $("#flowLine");
  if (!line) return;
  const steps = [
    { key: "available", label: "Publicado", value: countByStatus("available") },
    { key: "accepted", label: "Aceptado", value: countByStatus("accepted") },
    { key: "picked_up", label: "Retirado", value: countByStatus("picked_up") },
    { key: "in_transit", label: "En camino", value: countByStatus("in_transit") },
    { key: "delivered", label: "Entregado", value: countByStatus("delivered") }
  ];

  line.innerHTML = steps.map((step, index) => `
    <article class="flow-step ${step.value ? "has-items" : ""}">
      <span class="flow-dot">${index + 1}</span>
      <div>
        <strong>${escapeHtml(step.label)}</strong>
        <small>${step.value} pedido${step.value === 1 ? "" : "s"}</small>
      </div>
    </article>
  `).join("");
}

function renderActivity() {
  const list = $("#activityList");
  if (!list) return;
  const items = state.activity.length ? state.activity : [{
    title: "Beta lista",
    text: "Iniciá sesión, cargá un pedido y probá el flujo completo.",
    time: nowLabel()
  }];

  list.innerHTML = items.slice(0, 6).map((item) => `
    <article class="activity-item">
      <span></span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.text)}</p>
        <small>${escapeHtml(item.time || "")}</small>
      </div>
    </article>
  `).join("");
}

function renderRoleStats() {
  const businessOrders = state.orders.filter((order) => order.createdBy === "comercio");
  const privateOrders = state.orders.filter((order) => order.createdBy === "privado");
  const courierActive = state.orders.filter((order) => isCourierOrder(order) && isActiveOrder(order));
  const courierDone = state.orders.filter((order) => isCourierOrder(order) && order.status === "delivered");
  const delivered = state.orders.filter((order) => order.status === "delivered");
  const active = state.orders.filter(isActiveOrder);

  setText("#clientCreated", businessOrders.length);
  setText("#clientActive", businessOrders.filter(isActiveOrder).length);
  setText("#clientDelivered", businessOrders.filter((order) => order.status === "delivered").length);
  setText("#clientSpent", money(sumPrices(businessOrders)));

  setText("#courierAvailableCount", state.orders.filter((order) => order.status === "available").length);
  setText("#courierActiveCount", courierActive.length);
  setText("#courierDoneCount", courierDone.length);
  setText("#courierEarnings", money(Math.round(sumPrices(courierDone) * 0.75)));

  setText("#privateCreated", privateOrders.length);
  setText("#privateActive", privateOrders.filter(isActiveOrder).length);
  setText("#privateDelivered", privateOrders.filter((order) => order.status === "delivered").length);
  setText("#privateEstimate", money(sumPrices(privateOrders)));

  setText("#adminTotalCount", state.orders.length);
  setText("#adminActiveCount", active.length);
  setText("#adminRevenue", money(sumPrices(delivered)));
}

function renderBusinessOrders() {
  const orders = state.orders.filter((order) => order.createdBy === "comercio");
  renderOrderList("#businessOrders", orders, "comercio", "Todavía no hay pedidos creados.");
}

function renderCourierOrders() {
  const active = state.orders.filter((order) => order.courierName && isActiveOrder(order));
  const orders = state.orders.filter((order) => order.status === "available");
  const completed = state.orders.filter((order) => isCourierOrder(order) && order.status === "delivered");
  renderOrderList("#courierActiveOrders", active, "cadete", "Todavía no tomaste una entrega.");
  renderOrderList("#courierOrders", orders, "cadete", "No hay pedidos disponibles.");
  renderOrderList("#courierCompletedOrders", completed, "cadete_done", "Todavía no hay entregas realizadas.");
}

function renderAdminOrders() {
  const orders = state.filter === "all"
    ? state.orders
    : state.orders.filter((order) => order.status === state.filter);
  renderOrderList("#adminOrders", orders, "admin", "No hay pedidos con ese filtro.");
}

function renderOrderList(selector, orders, context, emptyText) {
  const list = $(selector);
  if (!list) return;
  list.innerHTML = orders.length
    ? orders.map((order) => orderCard(order, context)).join("")
    : `<div class="empty-state">${escapeHtml(emptyText)}</div>`;
}

function orderCard(order, context) {
  const status = STATUS_LABELS[order.status] || order.status;
  const payment = PAYMENT_LABELS[order.paymentMethod] || "Sin pago";
  const priority = PRIORITY_LABELS[order.priority] || "Normal";
  const requestType = REQUEST_TYPE_LABELS[order.requestType] || "";
  const actions = orderActions(order, context);

  return `
    <article class="order-card ${context === "cadete" && order.status === "available" ? "is-takeable" : ""}" data-order-id="${escapeHtml(order.id)}">
      <div class="order-top">
        <div>
          <p class="order-title">${escapeHtml(order.businessName)}</p>
          <p class="order-meta">${escapeHtml(order.createdAt || "")} · ${money(order.price)}</p>
        </div>
        <div class="badge-stack">
          <span class="status-badge ${escapeHtml(order.status)}">${escapeHtml(status)}</span>
          <span class="priority-badge ${order.priority === "urgente" ? "urgent" : ""}">${escapeHtml(priority)}</span>
        </div>
      </div>
      <div class="order-facts">
        <span><strong>Zona</strong>${escapeHtml(order.zoneLabel || "-")}</span>
        <span><strong>Pago</strong>${escapeHtml(payment)}</span>
        <span><strong>${requestType ? "Tipo" : "Contacto"}</strong>${escapeHtml(requestType || order.contact || "-")}</span>
      </div>
      ${requestType && order.contact ? `<p class="order-note"><strong>Contacto:</strong> ${escapeHtml(order.contact)}</p>` : ""}
      <p class="order-route"><strong>Retiro:</strong> ${escapeHtml(order.pickupAddress || "-")}</p>
      <p class="order-route"><strong>Entrega:</strong> ${escapeHtml(order.dropoffAddress || "-")}</p>
      ${order.reference ? `<p class="order-note"><strong>Referencia:</strong> ${escapeHtml(order.reference)}</p>` : ""}
      ${order.notes ? `<p class="order-note"><strong>Nota:</strong> ${escapeHtml(order.notes)}</p>` : ""}
      ${order.courierName ? `<p class="order-note"><strong>Cadete:</strong> ${escapeHtml(order.courierName)}</p>` : ""}
      ${actions ? `<div class="order-actions">${actions}</div>` : ""}
    </article>
  `;
}

function orderActions(order, context) {
  if (context === "comercio") {
    return order.status === "available"
      ? actionButton("cancel", order.id, "Cancelar", "danger-button")
      : "";
  }

  if (context === "cadete") {
    if (order.status === "available") return actionButton("accept", order.id, "Aceptar pedido", "primary-button");
    if (order.status === "accepted") return actionButton("picked_up", order.id, "Marcar retirado", "action-button");
    if (order.status === "picked_up") return actionButton("in_transit", order.id, "Marcar en camino", "action-button");
    if (order.status === "in_transit") return actionButton("delivered", order.id, "Marcar entregado", "primary-button");
    return "";
  }

  if (context === "admin") {
    if (order.status === "cancelled") return actionButton("reopen", order.id, "Reabrir", "action-button");
    if (order.status !== "delivered") return actionButton("cancel", order.id, "Cancelar", "danger-button");
  }

  return "";
}

function actionButton(action, id, label, className) {
  return `<button class="${className}" data-action="${action}" data-id="${escapeHtml(id)}" type="button">${label}</button>`;
}

async function handleOrderAction(action, id) {
  if (action === "accept") {
    if (!state.available) {
      toast("Primero marcate como disponible.");
      return;
    }
    return updateOrder(id, { status: "accepted", courierName: "Cadete beta" }, "Pedido aceptado.");
  }
  if (action === "picked_up") return updateOrder(id, { status: "picked_up" }, "Retiro confirmado.");
  if (action === "in_transit") return updateOrder(id, { status: "in_transit" }, "Pedido en camino.");
  if (action === "delivered") return updateOrder(id, { status: "delivered" }, "Pedido entregado.");
  if (action === "cancel") return updateOrder(id, { status: "cancelled" }, "Pedido cancelado.");
  if (action === "reopen") return updateOrder(id, { status: "available", courierName: "" }, "Pedido reabierto.");
}

function renderAdminInsights() {
  const stats = $("#adminStats");
  const alerts = $("#adminAlerts");
  const system = $("#adminSystem");
  if (!stats || !alerts) return;

  const active = state.orders.filter((order) => ["accepted", "picked_up", "in_transit"].includes(order.status)).length;
  const urgent = state.orders.filter((order) => order.priority === "urgente" && !["delivered", "cancelled"].includes(order.status)).length;
  const deliveredAmount = state.orders
    .filter((order) => order.status === "delivered")
    .reduce((sum, order) => sum + Number(order.price || 0), 0);

  stats.innerHTML = `
    <article><span>Total pedidos</span><strong>${state.orders.length}</strong></article>
    <article><span>Activos</span><strong>${active}</strong></article>
    <article><span>Urgentes</span><strong>${urgent}</strong></article>
    <article><span>Entregado</span><strong>${money(deliveredAmount)}</strong></article>
  `;

  if (system) {
    system.innerHTML = `
      <article><span>Landing web</span><strong>Online</strong></article>
      <article><span>App beta</span><strong>Demo local</strong></article>
      <article><span>Auth real</span><strong>Pendiente</strong></article>
      <article><span>Pagos en vivo</span><strong>Pendiente</strong></article>
    `;
  }

  const items = [];
  state.orders.forEach((order) => {
    if (order.status === "available" && orderAgeMinutes(order) >= 10) {
      items.push(`${order.businessName}: sin aceptar hace ${orderAgeMinutes(order)} min.`);
    }
    if (!order.contact && !["delivered", "cancelled"].includes(order.status)) {
      items.push(`${order.businessName}: falta contacto.`);
    }
  });

  alerts.innerHTML = items.length
    ? items.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Sin alertas por ahora.</li>";
}

function renderAdminQueues() {
  const container = $("#adminQueues");
  if (!container) return;

  const queues = [
    {
      label: "Sin cadete",
      value: countByStatus("available"),
      help: "Pedidos esperando aceptación",
      tone: "green"
    },
    {
      label: "En reparto",
      value: state.orders.filter(isActiveOrder).length,
      help: "Aceptados, retirados o en camino",
      tone: "violet"
    },
    {
      label: "Urgentes",
      value: state.orders.filter((order) => order.priority === "urgente" && !["delivered", "cancelled"].includes(order.status)).length,
      help: "Requieren seguimiento",
      tone: "red"
    },
    {
      label: "Cerrados",
      value: countByStatus("delivered"),
      help: "Entregas finalizadas",
      tone: "dark"
    }
  ];

  container.innerHTML = queues.map((queue) => `
    <article class="queue-card ${escapeHtml(queue.tone)}">
      <span>${escapeHtml(queue.label)}</span>
      <strong>${queue.value}</strong>
      <small>${escapeHtml(queue.help)}</small>
    </article>
  `).join("");
}

async function seedOrders() {
  if (state.orders.length) {
    toast("Ya hay pedidos cargados.");
    return;
  }

  await createOrder({
    businessName: "La Cocina de Ana",
    pickupAddress: "Av. Principal 1240",
    dropoffAddress: "Barrio Centro",
    reference: "Portería azul",
    notes: "Bolsa mediana.",
    zone: "ciudad_colon",
    contact: "3447 555001",
    paymentMethod: "paga_cliente",
    priority: "normal",
    createdBy: "comercio"
  });

  await createOrder({
    businessName: "Farmacia Norte",
    pickupAddress: "Calle Norte 88",
    dropoffAddress: "San Roque 421",
    reference: "Casa con reja blanca",
    notes: "Prioridad alta.",
    zone: "barrio_artalaz",
    contact: "3447 555002",
    paymentMethod: "paga_comercio",
    priority: "urgente",
    createdBy: "comercio"
  });
}

function addActivity(title, text) {
  state.activity.unshift({
    title,
    text,
    time: nowLabel()
  });
  state.activity = state.activity.slice(0, 20);
  saveActivity();
  renderActivity();
}

function statusActivityTitle(status) {
  if (status === "accepted") return "Pedido aceptado";
  if (status === "picked_up") return "Retiro confirmado";
  if (status === "in_transit") return "Cadete en camino";
  if (status === "delivered") return "Entrega realizada";
  if (status === "cancelled") return "Pedido cancelado";
  if (status === "available") return "Pedido disponible";
  return "Pedido actualizado";
}

function statusActivityText(previous, next) {
  if (!next) return "Se actualizó un pedido.";
  const from = previous ? STATUS_LABELS[previous.status] || previous.status : "Nuevo";
  const to = STATUS_LABELS[next.status] || next.status;
  return `${next.businessName} pasó de ${from} a ${to}.`;
}

function renderCourierAvailability() {
  const title = $("#courierStatusTitle");
  const help = $("#courierStatusHelp");
  const button = $("#availabilityButton");
  if (!title || !help || !button) return;

  title.textContent = state.available ? "Disponible para tomar pedidos" : "Fuera de servicio";
  help.textContent = state.available
    ? "Estás visible para comercios y privados."
    : "No vas a tomar pedidos nuevos hasta volver a estar disponible.";
  button.textContent = state.available ? "Disponible" : "Fuera de servicio";
  button.setAttribute("aria-pressed", String(state.available));
  button.classList.toggle("is-paused", !state.available);
}

function populateZones() {
  const options = activeZones.map((zone) => `<option value="${zone.value}">${zone.label} — ${money(zone.price)}</option>`).join("");
  ["#zone", "#privateZone"].forEach((selector) => {
    const element = $(selector);
    if (element) element.innerHTML = options;
  });
  updatePriceHint();
}

function updatePriceHint() {
  const hint = $("#priceHint");
  const select = $("#zone");
  if (!hint || !select) return;
  const zone = zoneByValue(select.value);
  hint.innerHTML = `Precio del envío: <strong>${money(zone.price)}</strong>`;
}

function bindEvents() {
  $("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await login(
      form.get("loginRole") || "comercio",
      form.get("loginEmail"),
      form.get("loginPassword")
    );
  });

  $("#logoutButton")?.addEventListener("click", logout);

  $("#zone")?.addEventListener("change", updatePriceHint);

  $("#orderForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createOrder({
      businessName: form.get("businessName"),
      pickupAddress: form.get("pickupAddress"),
      dropoffAddress: form.get("dropoffAddress"),
      reference: form.get("reference"),
      notes: form.get("notes"),
      zone: form.get("zone"),
      contact: form.get("businessContact"),
      paymentMethod: form.get("paymentMethod"),
      priority: form.get("priority"),
      createdBy: "comercio"
    });
    event.currentTarget.reset();
    setInputValue("#businessName", "La Cocina de Ana");
    updatePriceHint();
  });

  $("#privateOrderForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await createOrder({
      businessName: form.get("privateName"),
      pickupAddress: form.get("privatePickup"),
      dropoffAddress: form.get("privateDropoff"),
      reference: form.get("privatePhone"),
      notes: "Solicitud privada",
      contact: form.get("privatePhone"),
      zone: form.get("privateZone"),
      paymentMethod: "paga_cliente",
      priority: form.get("privateRequestType") === "urgente" ? "urgente" : "normal",
      requestType: form.get("privateRequestType"),
      createdBy: "privado"
    });
    event.currentTarget.reset();
  });

  $("#seedOrdersButton")?.addEventListener("click", seedOrders);

  $("#availabilityButton")?.addEventListener("click", async (event) => {
    state.available = !state.available;
    if (state.supabaseReady && state.currentCourier) {
      await state.supabase
        .from("couriers")
        .update({ is_available: state.available })
        .eq("id", state.currentCourier.id);
    }
    renderCourierAvailability();
    addActivity("Estado cadete", state.available ? "El cadete volvió a estar disponible." : "El cadete quedó fuera de servicio.");
    toast(state.available ? "Cadete disponible." : "Cadete pausado.");
  });

  $("#statusFilter")?.addEventListener("change", (event) => {
    state.filter = event.currentTarget.value;
    renderAdminOrders();
  });

  document.addEventListener("click", async (event) => {
    const quick = event.target.closest("[data-quick]");
    if (quick) {
      await handleQuickAction(quick.dataset.quick);
      return;
    }

    const button = event.target.closest("[data-action][data-id]");
    if (!button) return;
    await handleOrderAction(button.dataset.action, button.dataset.id);
  });
}

async function handleQuickAction(action) {
  if (action === "primaryRoleAction") {
    if (state.role === "comercio") return handleQuickAction("focusBusinessForm");
    if (state.role === "cadete") return handleQuickAction("acceptFirstAvailable");
    if (state.role === "privado") return handleQuickAction("fillPrivateExample");
    if (state.role === "admin") return handleQuickAction("createUrgentDemo");
  }

  if (action === "scrollToOrders") {
    const target = state.role === "admin"
      ? $("#adminOrders")
      : state.role === "cadete"
        ? $("#courierOrders")
        : state.role === "privado"
          ? $("#privateOrderForm")
          : $("#businessOrders");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "focusBusinessForm") {
    $("#businessContact")?.focus();
    toast("Completá los datos y publicá el pedido.");
    return;
  }

  if (action === "fillBusinessUsual") {
    setInputValue("#businessName", "La Cocina de Ana");
    setInputValue("#businessContact", "3447 555001");
    setInputValue("#pickupAddress", "Av. Principal 1240");
    setInputValue("#dropoffAddress", "Barrio Centro");
    setInputValue("#reference", "Casa familiar");
    setInputValue("#notes", "Pedido habitual.");
    $("#priority").value = "normal";
    $("#paymentMethod").value = "paga_cliente";
    toast("Pedido habitual cargado.");
    return;
  }

  if (action === "setBusinessUrgent") {
    $("#priority").value = "urgente";
    toast("Pedido marcado como urgente.");
    return;
  }

  if (action === "createFastBusinessOrder") {
    const businessName = clean($("#businessName")?.value) || "Comercio Yendo";
    const contact = clean($("#businessContact")?.value) || "3447 555000";
    const pickupAddress = clean($("#pickupAddress")?.value) || "Retiro a coordinar";
    const dropoffAddress = clean($("#dropoffAddress")?.value) || "Entrega a coordinar";
    await createOrder({
      businessName,
      pickupAddress,
      dropoffAddress,
      reference: $("#reference")?.value,
      notes: $("#notes")?.value || "Pedido rápido desde comercio.",
      zone: $("#zone")?.value || "ciudad_colon",
      contact,
      paymentMethod: $("#paymentMethod")?.value || "paga_cliente",
      priority: $("#priority")?.value || "normal",
      createdBy: "comercio"
    });
    return;
  }

  if (action === "acceptFirstAvailable") {
    const order = state.orders.find((item) => item.status === "available");
    if (!order) return toast("No hay pedidos disponibles para tomar.");
    await handleOrderAction("accept", order.id);
    return;
  }

  if (action === "advanceCourierOrder") {
    const order = state.orders.find((item) => item.courierName && isActiveOrder(item));
    if (!order) return toast("No tenés una entrega activa.");
    const nextAction = order.status === "accepted"
      ? "picked_up"
      : order.status === "picked_up"
        ? "in_transit"
        : "delivered";
    await handleOrderAction(nextAction, order.id);
    return;
  }

  if (action === "fillPrivateExample") {
    setInputValue("#privateName", "Martina López");
    setInputValue("#privatePhone", "3447 555109");
    setInputValue("#privatePickup", "Belgrano 850");
    setInputValue("#privateDropoff", "Mitre 1260");
    $("#privateRequestType").value = "compra";
    toast("Ejemplo cargado.");
    return;
  }

  if (action === "createUrgentDemo") {
    await createOrder({
      businessName: "Pedido urgente admin",
      pickupAddress: "Centro comercial",
      dropoffAddress: "Barrio Los Bretes",
      reference: "Coordinar por WhatsApp",
      notes: "Simulación creada desde admin.",
      zone: "barrio_los_bretes",
      contact: "3447 555777",
      paymentMethod: "transferencia",
      priority: "urgente",
      createdBy: "comercio"
    });
  }
}

function orderAgeMinutes(order) {
  return Math.max(0, Math.floor((Date.now() - Number(order.createdAtMs || Date.now())) / 60000));
}

function countByStatus(status) {
  return state.orders.filter((order) => order.status === status).length;
}

function ordersForCurrentRole() {
  if (state.role === "comercio") return state.orders.filter((order) => order.createdBy === "comercio");
  if (state.role === "privado") return state.orders.filter((order) => order.createdBy === "privado");
  if (state.role === "cadete") return state.orders.filter(isCourierOrder);
  return state.orders;
}

function isActiveOrder(order) {
  return ["accepted", "picked_up", "in_transit"].includes(order.status);
}

function isCourierOrder(order) {
  return order.courierName || order.status === "available";
}

function sumPrices(orders) {
  return orders.reduce((sum, order) => sum + Number(order.price || 0), 0);
}

function clean(value) {
  return String(value || "").trim();
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function setInputValue(selector, value) {
  const element = $(selector);
  if (element) element.value = value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const element = $("#toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    element.classList.remove("is-visible");
  }, 2400);
}

bindEvents();
populateZones();
initializeBackend()
  .catch((error) => {
    console.error(error);
    setText("#loginHint", "Supabase no respondió. Modo demo local disponible.");
  })
  .finally(() => {
    if (state.supabaseReady && !state.currentUser) {
      sessionStorage.removeItem("yendo-beta-session");
      sessionStorage.removeItem("yendo-beta-role");
      $("#loginScreen")?.classList.remove("is-hidden");
      $("#appFrame")?.classList.add("is-locked");
    } else if (!state.supabaseReady) {
      restoreSession();
    }
    render();
  });
