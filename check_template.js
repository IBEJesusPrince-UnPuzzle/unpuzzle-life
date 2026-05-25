import ExcelJS from 'exceljs';

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('./server/export-template.xlsx');
  
  // Add userId column to all data sheets (after ID column)
  const dataSheets = ['Agenda Tasks', 'Project Tasks', 'Projects', 'Responsibilities', 'People', 'Places', 'Things', 'Providers', 'Conditions', 'Task Completions'];
  
  for (const sheetName of dataSheets) {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) continue;
    
    console.log(`Processing ${sheetName}...`);
    
    // Insert userId column after ID column (column B becomes C, insert at B)
    sheet.spliceColumns(2, 0, ['User ID']);
    
    // Update row 2 (format row) to add "number" for userId
    const formatRow = sheet.getRow(2);
    formatRow.values = [...formatRow.values.slice(0, 2), 'number', ...formatRow.values.slice(2)];
    
    // Update row 3 (required row) to add "No" for userId (export-only)
    const requiredRow = sheet.getRow(3);
    requiredRow.values = [...requiredRow.values.slice(0, 2), 'No', ...requiredRow.values.slice(2)];
  }
  
  // Add color column to Project Tasks (after Sort Order)
  const projectTasksSheet = wb.getWorksheet('Project Tasks');
  if (projectTasksSheet) {
    console.log('Adding color column to Project Tasks...');
    // Find the column index of Sort Order
    const headerRow = projectTasksSheet.getRow(1);
    const headers = headerRow.values;
    const sortOrderIndex = headers.findIndex(h => h === 'Sort Order');
    
    if (sortOrderIndex > 0) {
      // Insert color column after Sort Order
      projectTasksSheet.spliceColumns(sortOrderIndex + 1, 0, ['Color']);
      
      // Update format row
      const formatRow = projectTasksSheet.getRow(2);
      formatRow.values = [...formatRow.values.slice(0, sortOrderIndex + 1), 'hex', ...formatRow.values.slice(sortOrderIndex + 1)];
      
      // Update required row
      const requiredRow = projectTasksSheet.getRow(3);
      requiredRow.values = [...requiredRow.values.slice(0, sortOrderIndex + 1), 'No', ...requiredRow.values.slice(sortOrderIndex + 1)];
    }
  }
  
  await wb.xlsx.writeFile('./server/export-template.xlsx');
  console.log('Template updated successfully!');
})();
