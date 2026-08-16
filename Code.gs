// Badminton Dash — Google Apps Script Backend (Code.gs)
// Deploy instructions:
// 1. In Google Sheets: Extensions > Apps Script
// 2. Replace Code.gs content with this code
// 3. Click Deploy > New deployment
// 4. Select type: Web app
// 5. Execute as: Me
// 6. Who has access: Anyone
// 7. Copy the Web App URL and paste it into Badminton Dash setup overlay.

var SHEET_NAME = 'Data';

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  }
  var dataStr = sheet.getRange('A1').getValue() || '{}';
  var timestamp = sheet.getRange('B1').getValue() || '';
  
  var parsedData = {};
  try {
    parsedData = JSON.parse(dataStr);
  } catch (err) {
    parsedData = {};
  }

  var result = {
    data: parsedData,
    lastModified: timestamp
  };

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  }

  var payload = {};
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid JSON payload' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var timestamp = new Date().toISOString();
  sheet.getRange('A1').setValue(JSON.stringify(payload.data || {}));
  sheet.getRange('B1').setValue(timestamp);

  return ContentService.createTextOutput(JSON.stringify({ ok: true, lastModified: timestamp }))
    .setMimeType(ContentService.MimeType.JSON);
}
