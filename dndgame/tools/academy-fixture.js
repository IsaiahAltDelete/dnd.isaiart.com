export async function stageAcademy(practice=false){
 await (await import('./legends-fixture.js')).stageLegend('blackstaff-practitioner');
 (await import('/src/core/save.js')).Save.settings.textSpeed='instant';
 if(practice)SC.Game.push(new (await import('/src/ui/academy.js')).AcademyTrainingScene());
}
