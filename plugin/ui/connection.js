/**
 * Shared "Fritz!Box connection" section of the property inspectors.
 *
 * The plugin owns the connection: this page sends host and credentials once
 * ({ event: "connect" }, tested with DeviceInfo GetInfo and then stored in
 * the global settings) and shows the status the plugin reports back
 * ({ event: "status" }).
 */
(function () {
  const client = SDPIComponents.streamDeckClient;
  const $ = (id) => document.getElementById(id);

  const STATE_TEXT = {
    connected: "Connected",
    connecting: "Connecting…",
    error: "Connection problem",
    unconfigured: "Not connected",
  };

  let status = { configured: false };

  function send(payload) {
    client.send("sendToPlugin", payload);
  }

  function showMessage(text, kind) {
    const box = $("fritz-message");
    box.textContent = text || "";
    box.className = `message ${kind || ""}`;
    box.hidden = !text;
  }

  function showForm(visible) {
    $("fritz-form").hidden = !visible;
    $("fritz-connected").hidden = visible || !status.configured;
    if (visible) {
      if (!$("fritz-host").value) {
        $("fritz-host").value = status.host || "fritz.box";
      }
      if (!$("fritz-username").value) {
        $("fritz-username").value = status.username || "";
      }
      $("fritz-https").value = status.https ? "https" : "http";
      $("fritz-guest").value = String(status.guestIndex || 0);
      $("fritz-password").placeholder = status.configured ? "Unchanged" : "";
    }
  }

  function renderStatus(next) {
    status = next;
    const badge = $("fritz-status");
    badge.className = `status ${status.state}`;
    $("fritz-status-text").textContent = STATE_TEXT[status.state] || status.state;
    const details = [];
    if (status.configured) {
      details.push(status.host);
    }
    if (status.model) {
      details.push(status.model);
    }
    if (status.guestSsid) {
      details.push(`Guest WLAN "${status.guestSsid}" (WLAN ${status.guestFound})`);
    }
    $("fritz-status-detail").textContent = status.error ? status.error : details.join(" · ");
    for (const el of document.querySelectorAll(".requires-connection")) {
      el.hidden = !status.configured;
    }
    showForm(!status.configured);
  }

  client.sendToPropertyInspector.subscribe((message) => {
    const payload = message.payload || {};
    if (payload.event === "status") {
      renderStatus(payload);
    } else if (payload.event === "connect") {
      $("fritz-connect").disabled = false;
      if (payload.ok) {
        showMessage(`Connected to ${payload.model}`, "success");
        $("fritz-password").value = "";
        showForm(false);
      } else {
        showMessage(payload.error, "error");
      }
    }
  });

  const TEMPLATE = `
    <sdpi-item label="Fritz!Box">
      <div id="fritz-status" class="status unconfigured">
        <div><strong id="fritz-status-text">…</strong><span id="fritz-status-detail"></span></div>
      </div>
    </sdpi-item>
    <div id="fritz-message" class="message" hidden></div>
    <div id="fritz-form" hidden>
      <sdpi-item label="Host"><sdpi-textfield id="fritz-host" placeholder="fritz.box"></sdpi-textfield></sdpi-item>
      <sdpi-item label="Protocol">
        <sdpi-select id="fritz-https">
          <option value="http">HTTP (port 49000, home network)</option>
          <option value="https">HTTPS (port 49443, self-signed certificate)</option>
        </sdpi-select>
      </sdpi-item>
      <sdpi-item label="Username"><sdpi-textfield id="fritz-username"></sdpi-textfield></sdpi-item>
      <sdpi-item label="Password"><sdpi-password id="fritz-password"></sdpi-password></sdpi-item>
      <sdpi-item label="Guest WLAN">
        <sdpi-select id="fritz-guest">
          <option value="0">Detect automatically</option>
          <option value="2">WLAN 2</option>
          <option value="3">WLAN 3</option>
          <option value="4">WLAN 4</option>
        </sdpi-select>
      </sdpi-item>
      <sdpi-item><sdpi-button id="fritz-connect">Connect</sdpi-button></sdpi-item>
      <p class="hint">
        Create a dedicated Fritz!Box user for the Stream Deck (System &gt; FRITZ!Box Users) with only the
        "FRITZ!Box settings" right and without access from the internet. The password is stored in the
        Stream Deck settings.
      </p>
      <p class="hint">
        TR-064 must be enabled: Home Network &gt; Network &gt; Network Settings &gt; "Allow access for applications".
      </p>
    </div>
    <div id="fritz-connected" hidden>
      <sdpi-item><sdpi-button id="fritz-edit">Change connection</sdpi-button></sdpi-item>
      <sdpi-item><sdpi-button id="fritz-disconnect">Disconnect</sdpi-button></sdpi-item>
      <p class="hint">Disconnecting removes the username and password from the Stream Deck settings.</p>
    </div>`;

  window.addEventListener("DOMContentLoaded", () => {
    $("fritz-connection").innerHTML = TEMPLATE;

    $("fritz-connect").addEventListener("click", () => {
      const host = ($("fritz-host").value || "").trim() || "fritz.box";
      const username = ($("fritz-username").value || "").trim();
      const password = $("fritz-password").value || "";
      if (!username || (!password && !status.configured)) {
        showMessage("Please enter username and password", "error");
        return;
      }
      showMessage("Connecting…", "");
      $("fritz-connect").disabled = true;
      send({
        event: "connect",
        host,
        https: $("fritz-https").value === "https",
        username,
        password,
        guestIndex: Number($("fritz-guest").value) || 0,
      });
    });

    $("fritz-edit").addEventListener("click", () => {
      showMessage("", "");
      showForm(true);
    });

    $("fritz-disconnect").addEventListener("click", () => {
      showMessage("", "");
      $("fritz-username").value = "";
      $("fritz-password").value = "";
      send({ event: "disconnect" });
    });

    send({ event: "getStatus" });
  });
})();
