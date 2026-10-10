(function(root){
'use strict';
class QuestEngine{
 constructor(world,random=Math.random){this.world=world;this.random=random;this.reset();}
 reset(){this.characters=this.world.characters.map(data=>({data,location:data.route[0],ticks:0}));this.completed=new Map();this.flags=new Map();this.seenEvents=new Set();this.objectNotes=new Map();this.dialogueNotes=new Map();this.roomNotes=new Map();this.turn=0;this.nextEvent=4;this.lastEvent=null;this.finished=false;this.dialogue=null;this.cameos=new Set();this.cameoActive=new Set();}
 exportState(){return {
  characters:this.characters.map(npc=>({name:npc.data.name,location:npc.location,ticks:npc.ticks})),
  completed:[...this.completed].map(([key,record])=>({key,location:record.location,linkId:record.link.id})),
  flags:[...this.flags],seenEvents:[...this.seenEvents],objectNotes:[...this.objectNotes],dialogueNotes:[...this.dialogueNotes],roomNotes:[...this.roomNotes],
  turn:this.turn,nextEvent:this.nextEvent,lastEvent:this.lastEvent?.name||null,finished:this.finished,
  cameos:[...this.cameos],cameoActive:[...this.cameoActive],
  dialogue:this.dialogue?{npc:this.dialogue.npc.data.name,lines:this.dialogue.lines,index:this.dialogue.index,location:this.dialogue.location,effect:this.dialogue.effect}:null
 };}
 restoreState(state){
  this.reset();
  if(!state||!Array.isArray(state.characters)||!Array.isArray(state.completed))throw Error('Повреждённое сохранение.');
  for(const npc of this.characters){const saved=state.characters.find(x=>x.name===npc.data.name);if(saved&&this.world.byName.has(saved.location)){npc.location=saved.location;npc.ticks=Math.max(0,Number(saved.ticks)||0);}}
  for(const record of state.completed){const link=this.world.relations.find(x=>x.id===record.linkId);if(link&&this.world.byName.has(record.location))this.completed.set(record.key,{location:record.location,link});}
  for(const field of ['flags','objectNotes','dialogueNotes','roomNotes'])this[field]=new Map(Array.isArray(state[field])?state[field]:[]);
  for(const field of ['seenEvents','cameos','cameoActive'])this[field]=new Set(Array.isArray(state[field])?state[field]:[]);
  this.turn=Math.max(0,Number(state.turn)||0);this.nextEvent=Math.max(1,Number(state.nextEvent)||4);
  this.lastEvent=this.world.events.find(event=>event.name===state.lastEvent)||null;
  this.finished=!!state.finished;
  if(state.dialogue){const npc=this.characters.find(x=>x.data.name===state.dialogue.npc);if(npc&&this.world.byName.has(state.dialogue.location)&&Array.isArray(state.dialogue.lines))this.dialogue={npc,lines:state.dialogue.lines,index:Math.min(state.dialogue.lines.length,Math.max(0,Number(state.dialogue.index)||0)),location:state.dialogue.location,effect:state.dialogue.effect||''};}
 }
 flag(name){return this.flags.get(name)||0;}
 effect(raw){const m=raw?.match(/^([а-яё_]+)(?:\s*\+(\d+))?/iu);if(!m)return;const name=m[1];this.flags.set(name,m[2]?Math.min(3,this.flag(name)+Number(m[2])):1);}
 narrativeEffect(raw){
  if(!raw)return;
  const object=raw.match(/в описании \[([^\]]+)\] добавляется:\s*«([^»]+)»/u);
  if(object){this.objectNotes.set(object[1],object[2]);return;}
  const dialogue=raw.match(/в диалоге на (.+?) кот добавляет:\s*«([^»]+)»/u);
  if(dialogue){this.dialogueNotes.set(dialogue[1],`Кот: ${dialogue[2]}`);return;}
  const room=raw.match(/в ([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]?[а-яё]+)?) все книги оказываются/u);
  if(room){const target=this.world.locations.find(x=>x.name.slice(0,4)===room[1].slice(0,4));if(target)this.roomNotes.set(target.name,'После полуночи книги на столах закрыты и аккуратно сложены стопками.');}
 }
 check(condition,room='',visited=new Set()){
  if(!condition)return true;
  const simple=condition.split(/;\s*иначе/u)[0].trim();
  if(/\s+или\s+/u.test(simple))return simple.split(/\s+или\s+/u).some(part=>this.check(part,room,visited));
  if(/\s+и\s+/u.test(simple))return simple.split(/\s+и\s+/u).every(part=>this.check(part,room,visited));
  if(/^не\s+/u.test(simple))return !this.check(simple.replace(/^не\s+/u,''),room,visited);
  const flag=simple.match(/^([а-яё_]+)\s*=\s*(\d+)$/iu);if(flag)return this.flag(flag[1])===Number(flag[2]);
  const turn=simple.match(/^ход\s*≥\s*(\d+)$/u);if(turn)return this.turn>=Number(turn[1]);
  const unseen=simple.match(/^игрок ещё не был в (.+)$/u);if(unseen)return ![...visited].some(name=>name.slice(0,4).toLowerCase()===unseen[1].slice(0,4).toLowerCase());
  const here=simple.match(/^Игрок находится в (.+)\.$/u);if(here)return room.slice(0,4).toLowerCase()===here[1].slice(0,4).toLowerCase();
  const opened=simple.match(/^открыта \[([^\]]+)\]$/u);if(opened)return [...this.completed.values()].some(x=>x.link.object===opened[1]);
  if(/^игрок отдал \{([^}]+)\} коту$/iu.test(simple))return this.flag('мышь_отдана')>0;
  if(/^свет не включён$/u.test(simple))return !this.flag('свет_включён');
  if(/^фонарик не взят$/u.test(simple))return !this.flag('фонарик_получен');
  return /^[а-яё_]+$/iu.test(simple)?this.flag(simple)>0:false;
 }
 exit(room,direction,visited){const exit=this.world.byName.get(room).exits[direction];return exit&&this.check(exit.condition,room,visited)?exit:null;}
 endingFor(action){return this.world.endings.find(x=>x.action===action||[...x.condition.matchAll(/[«“"]([^»”"]+)[»”"]/gu)].some(m=>m[1]===action));}
 canFinish(action){return !!this.endingFor(action);}
 tick(player,move=false,visited=new Set()){
  if(this.finished)return [];
  this.lastEvent=null;const messages=[];
  for(const npc of this.characters){
   if(npc.ticks<2){npc.ticks++;continue;}
   const choices=Object.entries(this.world.byName.get(npc.location).exits).filter(([,exit])=>npc.data.route.includes(exit.target)&&this.check(exit.condition,npc.location,visited));
   if(!choices.length||this.random()>=0.35){npc.ticks++;continue;}
   const [,exit]=choices[Math.min(choices.length-1,Math.floor(this.random()*choices.length))];
   const old=npc.location;npc.location=exit.target;npc.ticks=0;
   const g=npc.data.gender,masculine=['мужской','муж','м'].includes(g),feminine=['женский','жен','ж'].includes(g);
   if(old===player)messages.push(masculine?`${npc.data.name} ушёл в «${exit.target}».`:feminine?`${npc.data.name} ушла в «${exit.target}».`:`${npc.data.name}: теперь в «${exit.target}».`);
   if(exit.target===player)messages.push(masculine?`${npc.data.name} пришёл из «${old}».`:feminine?`${npc.data.name} пришла из «${old}».`:`${npc.data.name}: теперь здесь, из «${old}».`);
  }
  if(move){this.turn++;if(this.turn>=this.nextEvent){this.nextEvent=this.turn+3+Math.floor(this.random()*3);const eligible=this.world.events.filter(event=>(event.locations.includes('любая')||event.locations.includes(player))&&(event.repeat||!this.seenEvents.has(event.name))&&this.check(event.condition,player,visited));if(eligible.length){const chosen=eligible[Math.min(eligible.length-1,Math.floor(this.random()*eligible.length))];this.lastEvent=chosen;this.seenEvents.add(chosen.name);this.effect(chosen.effect);this.narrativeEffect(chosen.effect);}}}
  return messages;
 }
}
root.QuestEngine=QuestEngine;if(typeof module!=='undefined')module.exports=QuestEngine;
})(typeof window!=='undefined'?window:globalThis);
