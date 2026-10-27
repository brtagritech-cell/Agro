/**
 * AgroSync Google Sheets Sync Proxy
 * 
 * 1. Open your Google Sheet.
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete any default code and paste this script.
 * 4. Click "Deploy" > "New deployment".
 * 5. Select type: "Web app".
 * 6. Set Description: "AgroSync Proxy API".
 * 7. Set Execute as: "Me" (your email).
 * 8. Set Who has access: "Anyone".
 * 9. Click "Deploy", authorize permissions, and COPY the "Web app URL".
 * 10. Paste this URL into the AgroSync settings page.
 */

const SHEET_NAME = "Ledger";
const PROFILES_SHEET_NAME = "Profiles";

const expectedHeaders = [
  "Timestamp", 
  "Transaction ID", 
  "Date", 
  "Lot", 
  "Bags", 
  "Rate", 
  "Total Value", 
  "Agent", 
  "Mark", 
  "Weight",
  "Rate Reason",
  "Locked By",
  "SubUrl",
  "Sub-User Rate",
  "Sub-User Name",
  "Sub-User Timestamp",
  "Gross Weight",
  "Bags Weight (Tare)",
  "Net Weight",
  "Calculated Amount"
];

const COLUMNS = [
  "timestamp",
  "transactionId",
  "date",
  "lot",
  "bags",
  "rate",
  "totalValue",
  "agent",
  "mark",
  "weight",
  "rateReason",
  "lockedBy",
  "subUrl",
  "subUserRate",
  "subUserName",
  "subUserTimestamp",
  "grossWeight",
  "bagsWeight",
  "netWeight",
  "calculatedAmount"
];

const expectedProfileHeaders = [
  "Sub-URL Path",
  "Full Link",
  "Owner ID",
  "Owner Password",
  "Sub-Users List",
  "Brand Marks",
  "Agent Names",
  "Google Sheet URL"
];

function getOrCreateProfilesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROFILES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PROFILES_SHEET_NAME);
    sheet.appendRow(expectedProfileHeaders);
    sheet.getRange("A1:H1").setFontWeight("bold").setBackground("#dbeafe").setFontColor("#1e40af");
    sheet.setFrozenRows(1);
  } else {
    const range = sheet.getRange("A1:H1");
    const values = range.getValues()[0];
    let needsUpdate = false;
    for (let j = 0; j < expectedProfileHeaders.length; j++) {
      if (values[j] !== expectedProfileHeaders[j]) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate) {
      range.setValues([expectedProfileHeaders]);
      range.setFontWeight("bold").setBackground("#dbeafe").setFontColor("#1e40af");
    }
  }
  return sheet;
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(expectedHeaders);
    sheet.getRange("A1:T1").setFontWeight("bold").setBackground("#d1fae5").setFontColor("#065f46");
    sheet.setFrozenRows(1);
  } else {
    const range = sheet.getRange("A1:T1");
    const values = range.getValues()[0];
    let needsUpdate = false;
    for (let j = 0; j < expectedHeaders.length; j++) {
      if (values[j] !== expectedHeaders[j]) {
        needsUpdate = true;
        break;
      }
    }
    if (needsUpdate) {
      range.setValues([expectedHeaders]);
      range.setFontWeight("bold").setBackground("#d1fae5").setFontColor("#065f46");
    }
  }
  return sheet;
}

// Enable CORS for client-side fetches
function handleResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const rows = sheet.getDataRange().getValues();
    const data = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const record = {};
      // Robust index-based mapping to be 100% immune to header row changes or empty cells
      for (let j = 0; j < COLUMNS.length; j++) {
        const key = COLUMNS[j];
        let val = row[j] !== undefined ? row[j] : "";
        if (val instanceof Date) {
          try {
            val = Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
          } catch(err) {
            const y = val.getUTCFullYear();
            const m = String(val.getUTCMonth() + 1).padStart(2, '0');
            const d = String(val.getUTCDate()).padStart(2, '0');
            val = y + "-" + m + "-" + d;
          }
        }
        record[key] = val;
      }
      data.push(record);
    }
    
    // Read Profiles sheet
    const branches = [];
    try {
      const pSheet = getOrCreateProfilesSheet();
      const pRows = pSheet.getDataRange().getValues();
      for (let i = 1; i < pRows.length; i++) {
        const prow = pRows[i];
        const subUsersRaw = prow[4] || "";
        const subUsers = [];
        const subUserPasswords = {};
        
        subUsersRaw.split(',').forEach(item => {
          const parts = item.trim().split(':');
          const name = parts[0]?.trim();
          const pwd = parts[1]?.trim();
          if (name) {
            subUsers.push(name);
            if (pwd) {
              subUserPasswords[name] = pwd;
            }
          }
        });
        
        branches.push({
          subUrl: prow[0],
          fullLink: prow[1] || "",
          ownerId: prow[2],
          ownerPassword: prow[3],
          subUsers: subUsers,
          subUserPasswords: subUserPasswords,
          marks: prow[5] ? prow[5].split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [],
          agents: prow[6] ? prow[6].split(',').map(s => s.trim()).filter(Boolean) : [],
          sheetUrl: prow[7] || ""
        });
      }
    } catch (err) {
      // Fallback if profiles read fails
    }
    
    return handleResponse({ status: "success", data: data, branches: branches });
  } catch (error) {
    return handleResponse({ status: "error", message: error.toString() });
  }
}

function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    const action = postData.action;
    
    if (action === "saveBranches") {
      const branches = postData.branches || [];
      const pSheet = getOrCreateProfilesSheet();
      
      // Clear all rows except header
      if (pSheet.getLastRow() > 1) {
        pSheet.deleteRows(2, pSheet.getLastRow() - 1);
      }
      
      // Write new rows
      branches.forEach(b => {
        let subUsersStr = "";
        if (Array.isArray(b.subUsers)) {
          subUsersStr = b.subUsers.map(u => {
            if (b.subUserPasswords && b.subUserPasswords[u]) {
              return `${u}:${b.subUserPasswords[u]}`;
            }
            return u;
          }).join(", ");
        }
        
        pSheet.appendRow([
          b.subUrl,
          b.fullLink || "",
          b.ownerId,
          b.ownerPassword,
          subUsersStr,
          Array.isArray(b.marks) ? b.marks.join(", ") : "",
          Array.isArray(b.agents) ? b.agents.join(", ") : "",
          b.sheetUrl || ""
        ]);
      });
      
      return handleResponse({ status: "success", message: "Branches saved successfully" });
    }
    
    const sheet = getOrCreateSheet();
    
    if (action === "create") {
      const record = postData.data;
      
      // Check if Transaction ID already exists to prevent duplicate submission
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] === record.transactionId) {
          return handleResponse({ status: "error", message: "Transaction ID already exists" });
        }
      }
      
      sheet.appendRow([
        record.timestamp,
        record.transactionId,
        record.date,
        record.lot.toString(),
        parseInt(record.bags),
        parseFloat(record.rate),
        parseFloat(record.totalValue),
        record.agent,
        record.mark,
        record.weight || "",
        record.rateReason || "",
        record.lockedBy || "",
        record.subUrl || "",
        record.subUserRate || "",
        "", // subUserName
        "", // subUserTimestamp
        "", // grossWeight
        "", // bagsWeight
        "", // netWeight
        ""  // calculatedAmount
      ]);
      
      return handleResponse({ status: "success", message: "Record added successfully" });
      
    } else if (action === "updateWeight") {
      const transactionId = postData.transactionId;
      const weight = postData.weight;
      const subUserRate = postData.subUserRate;
      const rateReason = postData.rateReason || "";
      const bags = postData.bags;
      const mark = postData.mark;
      const totalValue = postData.totalValue;
      const lockedBy = postData.lockedBy;
      const subUserName = postData.subUserName;
      const subUserTimestamp = postData.subUserTimestamp;
      const grossWeight = postData.grossWeight;
      const bagsWeight = postData.bagsWeight;
      const netWeight = postData.netWeight;
      const calculatedAmount = postData.calculatedAmount;
      
      const rows = sheet.getDataRange().getValues();
      let rowIndex = -1;
      
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] === transactionId) {
          rowIndex = i + 1; // Apps Script row numbers are 1-indexed
          break;
        }
      }
      
      if (rowIndex === -1) {
        return handleResponse({ status: "error", message: "Transaction ID not found: " + transactionId });
      }
      
      // Update Column 10 (Weight)
      if (weight !== undefined && weight !== null) {
        sheet.getRange(rowIndex, 10).setValue(weight);
      }
      
      // Update Column 5 (Bags)
      if (bags !== undefined && bags !== null && bags !== "") {
        sheet.getRange(rowIndex, 5).setValue(parseInt(bags, 10));
      }
      
      // Update Column 9 (Mark)
      if (mark !== undefined && mark !== null && mark !== "") {
        sheet.getRange(rowIndex, 9).setValue(mark);
      }
      
      // Update Column 14 (Sub-User Rate)
      if (subUserRate !== undefined && subUserRate !== null && subUserRate !== "") {
        sheet.getRange(rowIndex, 14).setValue(parseFloat(subUserRate));
      }

      // Update Column 7 (Total Value)
      if (totalValue !== undefined && totalValue !== null && totalValue !== "") {
        sheet.getRange(rowIndex, 7).setValue(parseFloat(totalValue));
      } else {
        const finalBags = (bags !== undefined && bags !== null && bags !== "") ? parseInt(bags, 10) : parseInt(rows[rowIndex - 1][4]);
        const finalRate = (subUserRate !== undefined && subUserRate !== null && subUserRate !== "") ? parseFloat(subUserRate) : parseFloat(rows[rowIndex - 1][5]);
        sheet.getRange(rowIndex, 7).setValue(finalBags * finalRate);
      }
      
      // Update Column 11 (Rate Reason)
      sheet.getRange(rowIndex, 11).setValue(rateReason);

      // Update Column 12 (Locked By)
      if (lockedBy !== undefined && lockedBy !== null) {
        sheet.getRange(rowIndex, 12).setValue(lockedBy);
      }
      
      // Update Column 15 (Sub-User Name)
      if (subUserName !== undefined && subUserName !== null) {
        sheet.getRange(rowIndex, 15).setValue(subUserName);
      }
      
      // Update Column 16 (Sub-User Timestamp)
      if (subUserTimestamp !== undefined && subUserTimestamp !== null) {
        sheet.getRange(rowIndex, 16).setValue(subUserTimestamp);
      }
      
      // Update Column 17 (Gross Weight)
      if (grossWeight !== undefined && grossWeight !== null) {
        sheet.getRange(rowIndex, 17).setValue(parseFloat(grossWeight));
      }
      
      // Update Column 18 (Bags Weight Tare)
      if (bagsWeight !== undefined && bagsWeight !== null) {
        sheet.getRange(rowIndex, 18).setValue(parseFloat(bagsWeight));
      }
      
      // Update Column 19 (Net Weight)
      if (netWeight !== undefined && netWeight !== null) {
        sheet.getRange(rowIndex, 19).setValue(parseFloat(netWeight));
      }
      
      // Update Column 20 (Calculated Amount)
      if (calculatedAmount !== undefined && calculatedAmount !== null) {
        sheet.getRange(rowIndex, 20).setValue(parseFloat(calculatedAmount));
      }
      
      return handleResponse({ status: "success", message: "Weight and Ledger details updated successfully" });
    }
    
    return handleResponse({ status: "error", message: "Invalid action" });
  } catch (error) {
    return handleResponse({ status: "error", message: error.toString() });
  }
}
