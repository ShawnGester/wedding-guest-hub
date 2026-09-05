/**
 * Paste into Extensions → Apps Script on the Google Sheet linked to your
 * "Email Acknowledgement" form responses. Then Deploy → New deployment →
 * Web app: Execute as Me, Who has access: Anyone.
 *
 * Copy the web app URL into Wedding Guest Hub → Settings →
 * "Ack responses feed URL".
 */
function doGet() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Form Responses 1') ||
    SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]

  const values = sheet.getDataRange().getValues()
  const csv = values
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
          return s
        })
        .join(','),
    )
    .join('\n')

  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.TEXT)
}
