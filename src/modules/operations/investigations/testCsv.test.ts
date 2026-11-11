import { describe,expect,it } from 'vitest';
import { parseTestCsv,TEST_CSV_TEMPLATE } from './testCsv';

describe('uploaded test lists',()=>{
  it('reads the template, quoted commas and semicolon-separated other names in any column order',()=>{
    expect(parseTestCsv(TEST_CSV_TEMPLATE).tests).toEqual([{name:'Antenatal booking panel',specimen:'Blood and urine',classification:'Antenatal',aliases:['ANC panel','Booking bloods']}]);
    const csv='﻿Other names,Classification,Test name,Specimen\r\n"E/U/Cr; ""U&E""",Chemistry,"Electrolytes, urea and creatinine",Serum\r\n';
    expect(parseTestCsv(csv).tests).toEqual([{name:'Electrolytes, urea and creatinine',specimen:'Serum',classification:'Chemistry',aliases:['E/U/Cr','"U&E"']}]);
  });
  it('reports missing columns and incomplete rows by line, keeping the valid rows',()=>{
    expect(parseTestCsv('Test name,Specimen\nFBC,Blood').issues).toEqual([{line:1,message:'Missing column: Classification'}]);
    const result=parseTestCsv('Test name,Specimen,Classification\nFBC,,Haematology\n\nESR,Blood,Haematology\n,,');
    expect(result.tests.map(t=>t.name)).toEqual(['ESR']);
    expect(result.issues).toEqual([{line:2,message:'Specimen is empty'}]);
    expect(parseTestCsv('').issues).toEqual([{line:1,message:'The file is empty'}]);
  });
});

