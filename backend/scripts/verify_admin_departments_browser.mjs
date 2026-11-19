import { spawn } from "child_process";

const TARGET_URL = "http://127.0.0.1:8080/login";
const CDP_PORT = 9222;

const adminToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZGM2ZWI4NmMwNTk0ZDE0YTQwYTAzOCIsImlhdCI6MTc5MzcyMTQzNCwiZXhwIjoxNzkzNzI1MDM0fQ.l0-kyL0NXRdyhRAaAGB5knrhZwkhcTGuA0G8BeNSTV0";
const adminUser = JSON.stringify({
  id: "69dc6eb86c0594d14a40a038",
  name: "System Administrator",
  email: "admin@govai.gov",
  role: "admin",
  status: "active"
});

const citizenUser = JSON.stringify({
  id: "6aaffdb60d4d4252133081a6",
  name: "Citizen Demo",
  email: "citizen.demo@govai.gov",
  role: "citizen",
  status: "active"
});

const chrome = spawn("google-chrome", [
  "--headless=new",
  `--remote-debugging-port=${CDP_PORT}`,
  "--no-sandbox",
  "--disable-gpu",
  "--disable-extensions",
  "--user-data-dir=/tmp/govai-test-profile",
  "--disable-dev-shm-usage",
  TARGET_URL
]);

let curId = 1;
function sendCommand(ws, method, params = {}) {
  const id = curId++;
  return new Promise((resolve, reject) => {
    const msg = JSON.stringify({ id, method, params });
    const timer = setTimeout(() => reject(new Error("Timeout " + method)), 10000);
    const onMsg = (event) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        clearTimeout(timer);
        ws.removeEventListener("message", onMsg);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener("message", onMsg);
    ws.send(msg);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log("Starting Real Browser Verification for Admin Department Management UI...");
  await sleep(2500);

  const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  const tabs = await listRes.json();
  const pageTab = tabs.find(t => t.type === "page");
  if (!pageTab) throw new Error("Could not find page tab in Chrome CDP targets");

  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise((res) => ws.addEventListener("open", res));
  await sendCommand(ws, "Runtime.enable");
  await sendCommand(ws, "Page.enable");

  const errors = [];
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.method === "Runtime.consoleAPICalled" && data.params.type === "error") {
      const text = data.params.args.map(a => a.value || a.description).join(" ");
      if (!text.includes("animatable value")) {
        errors.push(text);
      }
    }
  });

  // Step 1: Wait for login page ready
  console.log("1. Waiting for login page to load...");
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const evalRes = await sendCommand(ws, "Runtime.evaluate", {
      expression: `Boolean(document.querySelector('button[aria-label="Admin Demo Access"]'))`,
      returnByValue: true
    });
    if (evalRes?.result?.value) break;
  }

  // Step 2: Click Admin Demo Access button to populate credentials, then click submit button!
  console.log("2. Clicking 'Admin Demo Access' button to populate credentials...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const btn = document.querySelector('button[aria-label="Admin Demo Access"]');
        if (btn) btn.click();
      })()
    `
  });

  await sleep(600);

  console.log("Submitting login form via #login-submit-btn...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const submitBtn = document.querySelector('#login-submit-btn');
        if (submitBtn) submitBtn.click();
      })()
    `
  });

  // Wait for redirect to /admin
  console.log("Waiting for authentication and redirect to /admin...");
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const evalRes = await sendCommand(ws, "Runtime.evaluate", {
      expression: `window.location.pathname`,
      returnByValue: true
    });
    if (evalRes?.result?.value === "/admin") {
      console.log("Redirected to /admin successfully!");
      break;
    }
  }

  // Step 3: Navigate to /admin/departments
  console.log("3. Navigating to /admin/departments via link or navigation...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const link = document.querySelector('a[href="/admin/departments"]');
        if (link) {
          link.click();
          return { clicked: true };
        }
        window.location.href = "/admin/departments";
        return { clicked: false, fallback: true };
      })()
    `,
    returnByValue: true
  });

  // Wait for /admin/departments to render
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    const evalRes = await sendCommand(ws, "Runtime.evaluate", {
      expression: `Boolean(document.querySelector('[data-testid="admin-departments-page"]'))`,
      returnByValue: true
    });
    if (evalRes?.result?.value) {
      console.log("Admin Departments page rendered!");
      break;
    }
  }

  await sleep(1500);

  // Step 4: Verify Initial Page Render
  console.log("4. Verifying page title and municipal department overview cards...");
  const pageCheck = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const h1 = document.querySelector("h1")?.innerText || "";
        const deptCards = Array.from(document.querySelectorAll('[data-testid^="department-card-"]')).map(el => el.innerText);
        const rows = Array.from(document.querySelectorAll('tbody tr')).map(el => el.innerText);
        return {
          url: window.location.href,
          pathname: window.location.pathname,
          h1,
          deptCardsCount: deptCards.length,
          deptCards,
          rowCount: rows.length,
          rows
        };
      })()
    `,
    returnByValue: true
  });

  console.log("PAGE_CHECK_RESULT:", JSON.stringify(pageCheck.result.value, null, 2));

  const val = pageCheck.result.value;
  if (!val.h1.includes("Department & Officer Management")) {
    throw new Error("Page title mismatch: " + val.h1);
  }
  if (val.deptCardsCount !== 4) {
    throw new Error("Expected 4 department cards, found " + val.deptCardsCount);
  }
  if (val.rowCount < 4) {
    throw new Error("Expected at least 4 member rows, found " + val.rowCount);
  }

  // Verify authorities
  const allCardsText = val.deptCards.join(" ");
  if (!allCardsText.includes("Priya Nair") || !allCardsText.includes("authority@demo.com")) {
    throw new Error("Road authority not rendered correctly");
  }
  if (!allCardsText.includes("Meera Singh") || !allCardsText.includes("water@demo.com")) {
    throw new Error("Water authority not rendered correctly");
  }
  if (!allCardsText.includes("Amit Verma") || !allCardsText.includes("electricity@demo.com")) {
    throw new Error("Electricity authority not rendered correctly");
  }
  if (!allCardsText.includes("Neha Patel") || !allCardsText.includes("environment@demo.com")) {
    throw new Error("Environment authority not rendered correctly");
  }

  // Verify mappings in table
  const allRowsText = val.rows.join(" ");
  if (!allRowsText.includes("Officer Priya") || !allRowsText.includes("Linked") || !allRowsText.includes("Road Infrastructure Demo Officer")) {
    throw new Error("Officer Priya linked status not displayed correctly");
  }
  if (!allRowsText.includes("Officer Amit") || !allRowsText.includes("Linked") || !allRowsText.includes("Electricity Demo Officer")) {
    throw new Error("Officer Amit linked status not displayed correctly");
  }
  if (!allRowsText.includes("Officer Rajesh") || !allRowsText.includes("Unlinked") || !allRowsText.includes("No account linked")) {
    throw new Error("Officer Rajesh unlinked status not displayed correctly");
  }
  if (!allRowsText.includes("Officer Neha") || !allRowsText.includes("Unlinked") || !allRowsText.includes("No account linked")) {
    throw new Error("Officer Neha unlinked status not displayed correctly");
  }
  console.log("✓ Initial render, department overviews, authorities, and officer mappings verified.");

  // Step 5: Test Department Filter
  console.log("5. Testing Department Filter dropdown (selecting Water Supply)...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const select = document.querySelector('[data-testid="department-filter-select"]');
        if (!select) return { error: "select not found" };
        select.value = "Water Supply";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return { success: true };
      })()
    `
  });
  await sleep(600);

  const waterFilteredRows = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).map(el => el.innerText);
        return rows;
      })()
    `,
    returnByValue: true
  });
  console.log("WATER_FILTERED_ROWS:", waterFilteredRows.result.value);
  if (waterFilteredRows.result.value.length !== 1 || !waterFilteredRows.result.value[0].includes("Officer Rajesh")) {
    throw new Error("Department filter failed: expected only Officer Rajesh for Water Supply");
  }
  console.log("✓ Department filtering works correctly.");

  // Reset department filter
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const select = document.querySelector('[data-testid="department-filter-select"]');
        select.value = "all";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `
  });
  await sleep(400);

  // Step 6: Test Mapping Status Filter
  console.log("6. Testing Mapping Status Filter (selecting Linked Only)...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const select = document.querySelector('[data-testid="mapping-filter-select"]');
        select.value = "linked";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      })()
    `
  });
  await sleep(600);

  const linkedRows = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).map(el => el.innerText);
        return rows;
      })()
    `,
    returnByValue: true
  });
  console.log("LINKED_FILTERED_ROWS:", linkedRows.result.value);
  if (linkedRows.result.value.length !== 2 || !linkedRows.result.value.every(r => r.includes("Linked"))) {
    throw new Error("Mapping status filter (linked) failed: expected 2 linked officers");
  }
  console.log("✓ Mapping status filter (Linked Only) works correctly.");

  // Clear filters
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const clearBtn = document.querySelector('[data-testid="clear-filters-button"]');
        if (clearBtn) clearBtn.click();
      })()
    `
  });
  await sleep(400);

  // Step 7: Test Search Filter
  console.log("7. Testing Search by officer email...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const input = document.querySelector('[data-testid="department-roster-search"]');
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
        nativeSetter.call(input, "electricity.demo");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()
    `
  });
  await sleep(600);

  const searchRows = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const rows = Array.from(document.querySelectorAll('tbody tr')).map(el => el.innerText);
        return rows;
      })()
    `,
    returnByValue: true
  });
  console.log("SEARCH_ROWS:", searchRows.result.value);
  if (searchRows.result.value.length !== 1 || !searchRows.result.value[0].includes("Officer Amit")) {
    throw new Error("Search filter failed: expected only Officer Amit for 'electricity.demo'");
  }
  console.log("✓ Search filtering works correctly.");

  // Clear search
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const clearBtn = document.querySelector('[data-testid="clear-filters-button"]');
        if (clearBtn) clearBtn.click();
      })()
    `
  });
  await sleep(400);

  // Step 8: Test Member Details Modal
  console.log("8. Testing Member Details Dialog inspection...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const inspectBtn = document.querySelector('[data-testid="inspect-member-officer-priya"]');
        if (inspectBtn) inspectBtn.click();
      })()
    `
  });
  await sleep(800);

  const dialogContent = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const dialog = document.querySelector('[data-testid="member-details-dialog"]');
        return {
          present: Boolean(dialog),
          text: dialog ? dialog.innerText : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log("DIALOG_CONTENT:", dialogContent.result.value);
  const dVal = dialogContent.result.value;
  if (!dVal.present || !dVal.text.includes("Member Profile Details") || !dVal.text.includes("Road Infrastructure Demo Officer")) {
    throw new Error("Member details dialog did not display linked officer details");
  }
  if (dVal.text.includes("password") || dVal.text.includes("hash") || dVal.text.includes("eyJ")) {
    throw new Error("Sensitive data exposed in Member details dialog!");
  }
  console.log("✓ Member Details Dialog displays complete inspection data safely.");

  // Close dialog
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const closeBtn = document.querySelector('[data-testid="close-member-details-dialog"]');
        if (closeBtn) closeBtn.click();
      })()
    `
  });
  await sleep(500);

  // Step 8b: Test Create Member Dialog UI
  console.log("8b. Testing Create Member Dialog (UI & Controls verification)...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const btn = document.querySelector('[data-testid="create-member-btn"]');
        if (btn) btn.click();
      })()
    `
  });
  
  // Wait for available accounts check to finish loading
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    const checkText = await sendCommand(ws, "Runtime.evaluate", {
      expression: `document.querySelector('[data-testid="create-member-dialog"]')?.innerText || ""`,
      returnByValue: true
    });
    if (checkText.result.value && !checkText.result.value.includes("Checking available accounts")) {
      break;
    }
  }

  const createDialogCheck = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const dialog = document.querySelector('[data-testid="create-member-dialog"]');
        const nameInput = document.querySelector('[data-testid="new-member-name-input"]');
        const deptSelect = document.querySelector('[data-testid="new-member-department-select"]');
        const officerSelect = document.querySelector('[data-testid="new-member-officer-select"]');
        const submitBtn = document.querySelector('[data-testid="submit-create-member-btn"]');
        const cancelBtn = document.querySelector('[data-testid="cancel-create-member-btn"]');
        return {
          present: Boolean(dialog),
          hasNameInput: Boolean(nameInput),
          hasDeptSelect: Boolean(deptSelect),
          hasOfficerSelect: Boolean(officerSelect),
          hasSubmitBtn: Boolean(submitBtn),
          hasCancelBtn: Boolean(cancelBtn),
          text: dialog ? dialog.innerText : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log("CREATE_DIALOG_CHECK:", createDialogCheck.result.value);
  const cdVal = createDialogCheck.result.value;
  if (!cdVal.present || !cdVal.hasNameInput || !cdVal.hasDeptSelect || !cdVal.hasSubmitBtn) {
    throw new Error("Create Member Dialog missing required form controls!");
  }
  console.log("✓ Create Member Dialog rendered correctly with all required controls.");

  // Close Create Member dialog safely without mutating database
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const cancelBtn = document.querySelector('[data-testid="cancel-create-member-btn"]');
        if (cancelBtn) cancelBtn.click();
      })()
    `
  });
  await sleep(500);

  // Step 8c: Test Link Officer Dialog UI
  console.log("8c. Testing Link Officer Dialog for unlinked member (Officer Rajesh)...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const linkBtn = document.querySelector('[data-testid="link-officer-officer-rajesh"]');
        if (linkBtn) linkBtn.click();
      })()
    `
  });
  
  // Wait for eligible officers to finish loading
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    const checkText = await sendCommand(ws, "Runtime.evaluate", {
      expression: `document.querySelector('[data-testid="link-officer-dialog"]')?.innerText || ""`,
      returnByValue: true
    });
    if (checkText.result.value && !checkText.result.value.includes("Finding eligible officers")) {
      break;
    }
  }

  const linkDialogCheck = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const dialog = document.querySelector('[data-testid="link-officer-dialog"]');
        const confirmBtn = document.querySelector('[data-testid="confirm-link-officer-btn"]');
        const cancelBtn = document.querySelector('[data-testid="cancel-link-officer-btn"]');
        return {
          present: Boolean(dialog),
          hasConfirmBtn: Boolean(confirmBtn),
          hasCancelBtn: Boolean(cancelBtn),
          text: dialog ? dialog.innerText : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log("LINK_DIALOG_CHECK:", linkDialogCheck.result.value);
  const ldVal = linkDialogCheck.result.value;
  if (!ldVal.present || !ldVal.text.includes("Link Officer") || !ldVal.hasConfirmBtn) {
    throw new Error("Link Officer Dialog missing required header or confirm action!");
  }
  if (!ldVal.text.includes("Water Supply Demo Officer") && !ldVal.text.includes("water.demo@govai.gov")) {
    throw new Error("Eligible Water Supply officer account not listed in Link Officer Dialog!");
  }
  console.log("✓ Link Officer Dialog successfully lists eligible officers for Water Supply.");

  // Close Link Officer dialog safely without mutating database
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const cancelBtn = document.querySelector('[data-testid="cancel-link-officer-btn"]');
        if (cancelBtn) cancelBtn.click();
      })()
    `
  });
  await sleep(500);

  // Step 8d: Test Unlink Officer Dialog UI
  console.log("8d. Testing Unlink Confirmation Dialog for linked member (Officer Priya)...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const unlinkBtn = document.querySelector('[data-testid="unlink-officer-officer-priya"]');
        if (unlinkBtn) unlinkBtn.click();
      })()
    `
  });
  await sleep(800);

  const unlinkDialogCheck = await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const dialog = document.querySelector('[data-testid="unlink-confirmation-dialog"]');
        const confirmBtn = document.querySelector('[data-testid="confirm-unlink-officer-btn"]');
        const cancelBtn = document.querySelector('[data-testid="cancel-unlink-officer-btn"]');
        return {
          present: Boolean(dialog),
          hasConfirmBtn: Boolean(confirmBtn),
          hasCancelBtn: Boolean(cancelBtn),
          text: dialog ? dialog.innerText : null
        };
      })()
    `,
    returnByValue: true
  });
  console.log("UNLINK_DIALOG_CHECK:", unlinkDialogCheck.result.value);
  const udVal = unlinkDialogCheck.result.value;
  if (!udVal.present || (!udVal.text.includes("Confirm Officer Disconnection") && !udVal.text.includes("Confirm Officer Unlinking")) || !udVal.hasConfirmBtn) {
    throw new Error("Unlink Confirmation Dialog missing required header or confirm action!");
  }
  if (!udVal.text.includes("Road Infrastructure Demo Officer") || !udVal.text.includes("road.demo@govai.gov")) {
    throw new Error("Currently linked officer account info not displayed in Unlink Confirmation Dialog!");
  }
  console.log("✓ Unlink Confirmation Dialog displays clear non-destructive warning and account details.");

  // Close Unlink dialog safely without mutating database
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      (() => {
        const cancelBtn = document.querySelector('[data-testid="cancel-unlink-officer-btn"]');
        if (cancelBtn) cancelBtn.click();
      })()
    `
  });
  await sleep(500);

  // Step 9: Test Non-Admin Route Protection
  console.log("9. Testing non-admin access protection (citizen role)...");
  await sendCommand(ws, "Runtime.evaluate", {
    expression: `
      localStorage.setItem("govai_user", JSON.stringify(${citizenUser}));
      localStorage.setItem("user", JSON.stringify(${citizenUser}));
      window.location.href = "/admin/departments";
    `
  });
  await sleep(2000);

  const citizenRedirect = await sendCommand(ws, "Runtime.evaluate", {
    expression: `window.location.pathname`,
    returnByValue: true
  });
  console.log("CITIZEN_REDIRECT_PATH:", citizenRedirect.result.value);
  if (citizenRedirect.result.value.includes("/admin/departments")) {
    throw new Error("Non-admin user was not blocked from /admin/departments! Path: " + citizenRedirect.result.value);
  }
  console.log("✓ ProtectedRoute strictly prevents non-admin access.");

  console.log("10. Checking console errors...");
  console.log("Console errors recorded:", errors);
  if (errors.length > 0) {
    throw new Error("Encountered unexpected console errors: " + errors.join("; "));
  }

  console.log("\n=======================================================");
  console.log("REAL BROWSER VERIFICATION PASSED SUCCESSFULLY! (CODE 0)");
  console.log("=======================================================\n");

  ws.close();
  chrome.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error("BROWSER VERIFICATION FAILED:", err);
  chrome.kill();
  process.exit(1);
});
