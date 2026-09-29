// This module is imported only after the jailbreak and ELF bootstrap finish.
export const AUTO_PAYLOADS = [
  "kstuff.elf",
  "shadowmountplus.elf",
  "ftpsrv-ps5.elf",
  "pldmgr_v0.3.1.elf",
];

export function loaderUrl(name, baseURI) {
  const payload = new URL("./payloads/" + name, baseURI);
  // elfldr reads pipe from the nested payload URI, not the outer HTTP query.
  payload.searchParams.set("pipe", "0");
  return "http://127.0.0.1:9021/?uri=" + encodeURIComponent(payload.href);
}

export function sendPayload(name, baseURI, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    let timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.onload = request.onerror = request.ontimeout = request.onabort = null;
      if (error) reject(error);
      else resolve();
    };
    const timedOut = () => {
      finish(new Error(name + ": no completed loader response within " +
        timeoutMs / 1000 + "s; execution status unknown. Not retrying."));
      request.abort();
    };

    try {
      request.open("GET", loaderUrl(name, baseURI), true);
      request.timeout = timeoutMs;
      // onload waits for the response body. elfldr sends HTTP 200 headers
      // before it downloads/spawns the payload, and may then report an error.
      request.onload = () => {
        const body = request.responseText || "";
        if (request.status !== 200)
          finish(new Error(name + ": loader returned HTTP " + request.status));
        else if (/\[elfldr\.elf\].*(?:error|unknown payload)/i.test(body))
          finish(new Error(name + ": " + body.replace(/\0/g, "").trim()));
        else
          finish();
      };
      request.onerror = () => finish(new Error(name +
        ": cannot reach elfldr at 127.0.0.1:9021; it may not be ready, or the browser may block the request."));
      request.ontimeout = timedOut;
      request.onabort = () => finish(new Error(name + ": loader request aborted"));
      // Also bound the wait if the browser fails to emit its XHR timeout event.
      timer = setTimeout(timedOut, timeoutMs);
      request.send();
    } catch (error) {
      finish(error);
    }
  });
}

export async function loadAllPayloads(log) {
  log("Loading ELF payloads (autoload v2)", "info");
  log("Waiting 3 seconds for elfldr to start", "info");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  let completed = 0;
  for (let i = 0; i < AUTO_PAYLOADS.length; i++) {
    const name = AUTO_PAYLOADS[i];
    log("[" + (i + 1) + "/" + AUTO_PAYLOADS.length + "] Requesting " + name + " (30s timeout)", "info");
    try {
      await sendPayload(name, document.baseURI);
      completed++;
      log(name + ": loader request completed; check the console notification for payload status", "info");
    } catch (error) {
      log(String(error && error.message || error), "error");
    }
    if (i + 1 < AUTO_PAYLOADS.length)
      await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  log("ELF autoload finished: " + completed + "/" + AUTO_PAYLOADS.length +
    " requests completed without a reported error", "info");
}
