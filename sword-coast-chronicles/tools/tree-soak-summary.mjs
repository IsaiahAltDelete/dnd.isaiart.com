import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync('output/tree-soak/completed/report.json','utf8'));
const rows=p.segments.map(s=>({scene:s.label,map:s.benchmark?.map,seconds:s.metrics?.elapsedMs/1000,positions:s.uniquePositions,moves:s.moves,bodyClickAttempts:s.bodyClickAttempts,aiActiveObservations:s.aiActiveObservations,resolvedEncounters:s.resolvedEncounters,drawP50:s.metrics?.draw.p50,drawP95:s.metrics?.draw.p95,frameP95:s.metrics?.frame.p95,frameMax:s.metrics?.frame.max,trees:s.benchmark?.trees,fullDrawMedian:s.benchmark?.full.p50,noCrownsMedian:s.benchmark?.noCrowns.p50,retainedHeapMB:s.retainedHeap/1048576}));
console.log(JSON.stringify({durationSeconds:p.durationMs/1000,checks:p.checks.length,failed:p.checks.filter(c=>!c.pass),errors:p.errors,rows},null,2));
