// Campaign-balanced handbook variants, BG3 adaptations, and Coast originals.
// Descriptions state the effects implemented here; reference differences live
// in docs/overhaul/armory.md. No opaque, unimplemented passive tags.
import {GEAR} from './items_gear.js';
const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);Object.values(o).forEach(freeze);}return o;};
const weapon=(id,name,base,cost,rarity,desc,o={})=>({
 ...GEAR[base],id,name,baseItem:base,slot:'mainHand',cost,rarity,desc,
 magical:rarity!=='common',attunement:false,stack:false,sellable:true,...o,
});
const magic=(atk=1,dmg=atk,bonusDice,bonusType)=>({atk,dmg,...(bonusDice?{bonusDice,bonusType}:{})});
const worn=(id,name,kind,cost,rarity,desc,mech,icon=kind)=>({id,name,kind,slot:kind,
 cost,rarity,desc,mech,icon,weight:1,magical:true,attunement:false,stack:false,sellable:true,source:'original'});
const items=[
 weapon('silvered-rapier','Silvered Rapier','rapier',125,'common','A bright silver seam follows the cutting edge. Counts as silvered against creatures vulnerable to silver.',{silvered:true,source:'handbook'}),
 weapon('silvered-spear','Silvered Spear','spear',101,'common','The silvered head is wrapped for travel, not for show. Bypasses defenses that require silvered weapons.',{silvered:true,source:'handbook'}),
 weapon('vicious-longsword','Vicious Longsword','longsword',2200,'rare','Dark notches catch on the wound. A critical hit deals 7 additional slashing damage.',{magic:{critBonus:7},artProfile:'hookblade',artAccent:'#c2838c',source:'handbook'}),
 weapon('vicious-war-pick','Vicious War Pick','war-pick',1800,'rare','A cruel hooked point and a black iron grip. A critical hit deals 7 additional piercing damage.',{magic:{critBonus:7},artAccent:'#c2838c',source:'handbook'}),
 weapon('flame-tongue-rapier','Flame Tongue Rapier','rapier',5200,'rare','A narrow line of orange fire follows the thrust. Each hit adds 2d6 fire damage.',{magic:magic(0,0,'2d6','fire'),source:'handbook'}),
 weapon('flame-tongue-scimitar','Flame Tongue Scimitar','scimitar',5200,'rare','Embers run along the curved edge without burning the grip. Each hit adds 2d6 fire damage.',{magic:magic(0,0,'2d6','fire'),source:'handbook'}),
 weapon('frost-brand-greatsword','Frost Brand Greatsword','greatsword',14500,'very-rare','White frost feathers the fuller. Hits add 1d6 cold damage; wielding it grants resistance to fire.',{magic:magic(0,0,'1d6','cold'),mech:{resist:['fire']},source:'handbook'}),
 weapon('longbow-of-warning','Longbow of Warning','longbow',1000,'uncommon','Its string sounds before danger arrives. While wielded, you cannot be surprised and gain +2 initiative.',{mech:{condImmune:['surprised'],initiativeBonus:2},artProfile:'stormbow',artAccent:'#d5bd79',source:'handbook',adapted:true}),

 weapon('everburn-blade','Everburn Blade','greatsword',950,'uncommon','Infernal embers cling to this heavy blade. Every hit adds 1d4 fire damage.',{magic:magic(0,0,'1d4','fire'),artProfile:'flameblade',source:'bg3'}),
 weapon('gold-wyrmling-staff','Gold Wyrmling Staff','quarterstaff',3100,'rare','A golden dragon curls around the staff head. +1 attacks and damage, +1d4 fire on weapon hits, and Fire Bolt while wielded (Intelligence unless already learned).',{magic:magic(1,1,'1d4','fire'),mech:{cantrip:{spellId:'fire-bolt',ability:'int'}},artProfile:'dragonstaff',source:'bg3',adapted:true}),
 weapon('knife-undermountain-king','Knife of the Undermountain King','shortsword',8500,'very-rare','A jagged duergar shortsword that rewards a precise strike. +2 attacks and damage; while wielded, attacks critically hit on 19–20.',{magic:magic(2),mech:{critRange:19},artProfile:'kingknife',artAccent:'#ad8fc9',source:'bg3',adapted:true}),
 weapon('sorrow','Sorrow','glaive',2100,'rare','A vine-wrapped glaive with a mournful edge. +1 attacks and damage; cast Thorn Whip as an action while wielded (Wisdom unless already learned).',{magic:magic(),mech:{cantrip:{spellId:'thorn-whip',ability:'wis'}},artAccent:'#8cac85',source:'bg3',adapted:true}),
 weapon('phalar-aluve','Phalar Aluve','longsword',2900,'rare','A slender drow blade with a silver crescent guard. +1 attacks and damage, finesse, and +1 Performance while wielded.',{magic:magic(),props:[...GEAR.longsword.props,'finesse'],mech:{skillBonus:{performance:1}},artProfile:'moonblade',artAccent:'#b0cae7',source:'bg3',adapted:true}),
 weapon('defender-flail','Defender Flail','flail',2500,'rare','A weighted head behind a shield-shaped grip. +1 attacks and damage; wielding it grants +1 AC.',{magic:magic(),mech:{acBonus:1},artAccent:'#b4ccda',source:'bg3',adapted:true}),

 weapon('coast-cutlass','Coast Cutlass','scimitar',30,'common','A broad boarding blade with a salt-stained grip. Light and finesse: equally at home in a dockside duel or a crowded passage.',{source:'original'}),
 weapon('boar-spear','Boar Spear','spear',8,'common','A leaf-shaped spear with a stout brass collar. Can be thrown or held in both hands for 1d8 damage.',{source:'original'}),
 weapon('harbor-hookglaive','Harbor Hookglaive','glaive',35,'common','A hooked pole blade made by a shipwright who got tired of repairing boarding ladders. Heavy, two-handed, and reach.',{artProfile:'hookglaive',source:'original'}),
 weapon('lamplighters-mace',"Lamplighter's Mace",'mace',1700,'uncommon','A shuttered brass cage protects a pearl of dawn. +1 attacks and damage; hits add 1d4 radiant damage.',{magic:magic(1,1,'1d4','radiant'),artProfile:'lanternmace',source:'original'}),
 weapon('dockside-lash','Dockside Lash','whip',600,'uncommon','Blue leather braided around a silver wire. +1 attacks and damage; finesse and reach remain its best arguments.',{magic:magic(),artAccent:'#89bdcf',source:'original'}),
 weapon('stormglass-longbow','Stormglass Longbow','longbow',3200,'rare','Stormglass tips hold a thread of static between them. +1 attacks and damage; each arrow adds 1d4 lightning damage.',{magic:magic(1,1,'1d4','lightning'),artProfile:'stormbow',source:'original'}),
 weapon('dockworkers-cudgel',"Dockworker's Cudgel",'club',3,'common','A compact oak belaying pin. The shipping manifest calls it a maintenance tool; the night watch has other opinions.',{source:'original'}),
 weapon('moonreef-trident','Moonreef Trident','trident',2400,'rare','Three coral prongs hold a rim of pale ice. +1 attacks and damage, +1d4 cold on hits; can be thrown or wielded in both hands.',{magic:magic(1,1,'1d4','cold'),artProfile:'coraltrident',source:'original'}),

 worn('surveyors-compass',"Surveyor's Compass",'amulet',450,'uncommon','The needle twitches before a fight begins. Worn: +1 initiative. It still insists that the nearest tavern is north.',{initiativeBonus:1},'compass'),
 worn('duelists-wraps',"Duelist's Wraps",'gloves',2400,'rare','Silk wrapped over supple leather. Worn: +1 to melee attack rolls; no bonus to damage.',{meleeAtkBonus:1},'gloves'),
 worn('streetrunner-boots','Streetrunner Boots','boots',650,'uncommon','Quiet soles and reinforced heels, worn thin by honest errands and less honest shortcuts. Worn: +5 feet of speed.',{speedBonus:5}),
 worn('cinderward-ring','Cinderward Ring','ring',1800,'rare','A coal-dark garnet stays cool beside a forge. Worn: resistance to fire damage.',{resist:['fire']}),
 {id:'second-wind-draught',name:'Second Wind Draught',kind:'potion',cost:65,weight:0.5,rarity:'common',stack:true,sellable:true,icon:'potion',tint:'#74b7ba',source:'original',desc:'Mint, ginger, and a medicinal amount of optimism. Drink to gain 1d6+4 temporary hit points; these do not stack with other temporary hit points.',use:{kind:'temphp',dice:'1d6+4',cost:'action'}},
 {id:'clearhead-tonic',name:'Clearhead Tonic',kind:'potion',cost:90,weight:0.5,rarity:'common',stack:true,sellable:true,icon:'potion',tint:'#d3c879',source:'original',desc:'Bitter enough to put your worries in perspective. Drinking it removes poisoned and frightened.',use:{kind:'cure',conditions:['poisoned','frightened'],cost:'action'}},
];
export const ARMORY_ITEMS=freeze(Object.fromEntries(items.map(it=>[it.id,it])));
