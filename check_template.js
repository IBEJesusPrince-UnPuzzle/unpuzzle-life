import ExcelJS from 'exceljs';

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('./server/export-template.xlsx');
  console.log('Sheets:', wb.worksheets.map(ws => ws.name));
  wb.eachSheet((ws) => {
    console.log(`Sheet: ${ws.name}, rowCount: ${ws.rowCount}`);
    // Show first few rows
    console.log('First 3 rows:');
    for (let i = 1; i <= Math.min(3, ws.rowCount); i++) {
      const row = ws.getRow(i);
      console.log(`  Row ${i}:`, row.values);
    }
  });
})();
