let selectedDeviceId = null;

async function fetchDevices() {
  const errorBanner = document.getElementById("error-banner");
  try {
    const res = await fetch("/devices");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const devices = await res.json();

    errorBanner.classList.add("hidden");
    document.getElementById("device-count").textContent = devices.length;
    document.getElementById("last-updated").textContent = `Updated: ${new Date().toLocaleTimeString()}`;

    renderDeviceList(devices);
  } catch (err) {
    errorBanner.textContent = `Connection error: ${err.message}`;
    errorBanner.classList.remove("hidden");
  }
}

function renderDeviceList(devices) {
  const listEl = document.getElementById("device-list");
  if (devices.length === 0) {
    listEl.innerHTML = `<p class="placeholder">No devices registered. Run <code>_05_auto_register_devices.sh</code></p>`;
    return;
  }

  listEl.innerHTML = devices.map(dev => `
    <div class="device-card ${selectedDeviceId === dev.id ? 'selected' : ''}" onclick="selectDevice('${dev.id}')">
      <div class="device-header">
        <strong>${dev.name}</strong>
        <span class="badge badge-${dev.status || 'unverified'}">${dev.status || 'unverified'}</span>
      </div>
      <div class="device-details">
        <span>Address: <code>${dev.address}</code></span>
        <span class="protocol-tag">${(dev.protocol || 'unverified').toUpperCase()}</span>
      </div>
    </div>
  `).join('');
}

async function selectDevice(id) {
  selectedDeviceId = id;
  fetchDevices(); // Re-render list selection border
  fetchDiagnostics(id);
}

async function fetchDiagnostics(id) {
  const container = document.getElementById("telemetry-inspector");
  try {
    const res = await fetch(`/devices/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const dev = data.device || {};
    const diag = data.diagnostics || {};

    container.innerHTML = `
      <div class="device-header">
        <h3>${dev.name || 'Unknown'}</h3>
        <span class="badge badge-${dev.status || 'unverified'}">${dev.status || 'unverified'}</span>
      </div>
      <div class="telemetry-grid">
        <div class="metric-box"><span class="label">Protocol</span><span class="value">${(dev.protocol || 'N/A').toUpperCase()}</span></div>
        <div class="metric-box"><span class="label">Address</span><span class="value">${dev.address || 'N/A'}</span></div>
        <div class="metric-box"><span class="label">Hardware Ver</span><span class="value">${diag.hwVersion || 'N/A'}</span></div>
        <div class="metric-box"><span class="label">Firmware Ver</span><span class="value">${diag.fwVersion || 'N/A'}</span></div>
      </div>
      <h4>Raw Diagnostics Payload</h4>
      <pre class="json-box">${JSON.stringify(diag, null, 2)}</pre>
    `;
  } catch (err) {
    container.innerHTML = `<p class="error-banner">Failed to load diagnostics: ${err.message}</p>`;
  }
}

// Toggle the manual addition form
function toggleAddForm() {
  const form = document.getElementById("add-device-form");
  form.classList.toggle("hidden");
}

// Handle Single Device POST Request
async function handleRegisterSingle(e) {
  e.preventDefault();
  const nameInput = document.getElementById("new-dev-name");
  const addressInput = document.getElementById("new-dev-address");

  try {
    const res = await fetch("/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        address: addressInput.value.trim()
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }

    // Reset form and refresh list
    nameInput.value = "";
    addressInput.value = "";
    toggleAddForm();
    fetchDevices();
  } catch (err) {
    alert(`Failed to register device: ${err.message}`);
  }
}

// Updated render function with interactive empty state
function renderDeviceList(devices) {
  const listEl = document.getElementById("device-list");

  if (devices.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>No devices currently registered.</p>
        <div class="empty-actions">
          <button class="btn btn-primary" onclick="toggleAddForm()">+ Add Single Device</button>
        </div>
        <p class="hint-text">To auto-discover running containers, run in terminal:<br><code>./_05_auto_register_devices.sh</code></p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = devices.map(dev => `
    <div class="device-card ${selectedDeviceId === dev.id ? 'selected' : ''}" onclick="selectDevice('${dev.id}')">
      <div class="device-header">
        <strong>${dev.name}</strong>
        <span class="badge badge-${dev.status || 'unverified'}">${dev.status || 'unverified'}</span>
      </div>
      <div class="device-details">
        <span>Address: <code>${dev.address}</code></span>
        <button class="btn btn-danger btn-sm" onclick="handleDeleteDevice('${dev.id}', '${dev.name}', event)">Remove</button>
      </div>
    </div>
  `).join('');
}

async function handleDeleteDevice(id, name, event) {
  // Prevent opening the telemetry panel when clicking the delete button
  if (event) event.stopPropagation();

  if (!confirm(`Are you sure you want to remove '${name}'?`)) return;

  try {
    const res = await fetch(`/devices/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);

    // Clear inspector if the deleted device was selected
    if (selectedDeviceId === id) {
      selectedDeviceId = null;
      document.getElementById("telemetry-inspector").innerHTML = `
        <p class="placeholder">Select a device on the left to inspect real-time hardware telemetry.</p>
      `;
    }

    fetchDevices();
  } catch (err) {
    alert(`Failed to remove device: ${err.message}`);
  }
}


// Initial fetch & set poll loop every 3 seconds
fetchDevices();
setInterval(() => {
  fetchDevices();
  if (selectedDeviceId) fetchDiagnostics(selectedDeviceId);
}, 3000);
