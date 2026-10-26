import fs from 'node:fs';
import path from 'node:path';
const file=process.argv[2];
const report=JSON.parse(fs.readFileSync(file,'utf8'));
for(const entry of report.script||[]){
 if(entry.url?.startsWith('data:image/png;base64,')){
  const dest=path.join(path.dirname(file),entry.id+'.png');
  fs.writeFileSync(dest,Buffer.from(entry.url.split(',')[1],'base64'));delete entry.url;entry.image=dest;
 }
}
fs.writeFileSync(file,JSON.stringify(report,null,2));
