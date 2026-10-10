(function(root){
'use strict';
const directions={север:[0,-1,0],юг:[0,1,0],запад:[-1,0,0],восток:[1,0,0],вверх:[0,0,1],вниз:[0,0,-1]};
const heads=new Set(['ЛОКАЦИЯ','ПЕРВЫЙ ВХОД','ОПИСАНИЕ','ПЕРЕХОДЫ','ОБЪЕКТЫ','ПРЕДМЕТЫ','ПЕРСОНАЖ','МАРШРУТ','ДИАЛОГ','ДЕЙСТВИЕ','СВЯЗАННЫЕ ОБЪЕКТЫ','РЕЗУЛЬТАТ','УСЛОВИЕ','СЛУЧАЙНЫЕ СОБЫТИЯ','СОБЫТИЕ','ТЕКСТ','КОНЦОВКИ','КОНЕЦ ИГРЫ','НАЗВАНИЕ','ДОПОЛНЕНИЕ','КНОПКА','РОД']);
const value=lines=>lines.join('\n').trim();
function details(text){
 const kept=[],data={};
 for(const line of text.split('\n')){
  const d=line.trim().match(/^(ДЕЙСТВИЕ|ЭФФЕКТ|УСЛОВИЕ):\s*(.*)$/u),a=line.trim().match(/^\(ПОСЛЕ:\s*([^)]*)\)\s*(.*)$/u);
  if(d)data[d[1].toLowerCase()]=d[2];
  else if(a)(data.after??=[]).push({flag:a[1],text:a[2]});
  else if(line.trim()==='(повторяется)')data.repeat=true;
  else if(!/^\((?:Если |Кот в этой комнате)/u.test(line.trim()))kept.push(line);
 }
 return {description:value(kept),...data};
}
function entries(lines,regex){const map=new Map();let key=null,body=[];const save=()=>{if(key!==null){if(map.has(key))throw Error(`Повторное название «${key}».`);map.set(key,{name:key,...details(value(body))});}};for(const line of lines){const m=line.trim().match(regex);if(m){save();key=m[1].trim();body=[];}else if(key!==null)body.push(line);}save();return map;}
function position(rooms,byName){
 const links=new Map(rooms.map(r=>[r.name,[]]));
 for(const room of rooms)for(const [direction,exit]of Object.entries(room.exits)){const d=directions[direction];links.get(room.name).push([exit.target,...d]);links.get(exit.target).push([room.name,...d.map(n=>-n)]);}
 let offset=0;for(const seed of rooms){if(seed.position)continue;seed.position={x:offset,y:0,z:0};const queue=[seed],occupied=new Map();let max=offset;
 for(let i=0;i<queue.length;i++){const room=queue[i],p=room.position,k=`${p.x},${p.y},${p.z}`;
  if(occupied.has(k)&&occupied.get(k)!==room.name)throw Error(`Локации «${room.name}» и «${occupied.get(k)}» занимают одну клетку карты.`);
  occupied.set(k,room.name);max=Math.max(max,p.x);
  for(const [name,dx,dy,dz]of links.get(room.name)){const target=byName.get(name),expected={x:p.x+dx,y:p.y+dy,z:p.z+dz};if(!target.position){target.position=expected;queue.push(target);}else if(Object.keys(expected).some(key=>target.position[key]!==expected[key]))throw Error(`Противоречивые направления между «${room.name}» и «${name}».`);}
 }offset=max+3;}
}
function parseWorld(source){
 const rooms=[],characters=[],relations=[],events=[],endings=[];
 let mode=null,section=null,buffer=[],room=null,npc=null,link=null,event=null,ending=null,lastAction='';
 function flush(){if(!section)return;const text=value(buffer);
  if(mode==='room'&&room){
   if(section==='ЛОКАЦИЯ')room.name=buffer.map(x=>x.trim()).find(x=>x&&!x.startsWith('('))||'';
   else if(section==='ПЕРВЫЙ ВХОД')room.first=text;
   else if(section==='ОПИСАНИЕ'&&room.description===undefined)room.description=text;
   else if(section==='ПЕРЕХОДЫ')for(const raw of buffer.map(x=>x.trim()).filter(Boolean)){const m=raw.match(/^(север|юг|запад|восток|вверх|вниз)\s*->\s*(.+?)(?:\s*\(УСЛОВИЕ:\s*(.*)\))?$/iu);if(!m)throw Error(`Некорректный переход в «${room.name}»: ${raw}`);if(room.exits[m[1]])throw Error(`Повтор направления «${m[1]}».`);room.exits[m[1]]={target:m[2].trim(),condition:m[3]||''};}
   else if(section==='ОБЪЕКТЫ'||section==='ПРЕДМЕТЫ'){const field=section==='ОБЪЕКТЫ'?'objects':'items',parsed=entries(buffer,field==='objects'?/^\[([^\[\]]+)\]$/u:/^\{([^{}]+)\}$/u);for(const [name,entry]of parsed){if(room[field].has(name))throw Error(`Повторное название «${name}».`);room[field].set(name,entry);}}
  }else if(mode==='npc'&&npc){
   if(section==='ПЕРСОНАЖ')npc.name=text;
   else if(section==='ОПИСАНИЕ')npc.description=text;
   else if(section==='МАРШРУТ')npc.route=text.split(',').map(x=>x.trim()).filter(Boolean);
   else if(section==='РОД')npc.gender=text.toLowerCase();
   else if(section==='ДЕЙСТВИЕ'){npc.action=text.split('\n')[0];npc.effect=text.match(/^ЭФФЕКТ:\s*(.*)$/mu)?.[1]||'';npc.actionTexts=[...text.matchAll(/^\d+\.\s*(.*)$/gmu)].map(m=>m[1]);}
   else if(section==='ДИАЛОГ'){const ls=buffer.map(x=>x.trim()).filter(Boolean),first=ls.shift()||'',conditional=first.match(/^УСЛОВИЕ:\s*(.*)$/u),dialogue={lines:ls.filter(x=>/^[^:]+:\s*\S/u.test(x)&&!x.startsWith('ЭФФЕКТ:')),effect:ls.find(x=>x.startsWith('ЭФФЕКТ:'))?.slice(7).trim()||''};if(conditional)npc.conditionalDialogues.push({...dialogue,condition:conditional[1]});else if(first)npc.dialogues.set(first,dialogue.lines);}
  }else if(mode==='relations'&&link){
   if(section==='УСЛОВИЕ')link.condition=text;
   else if(section==='РЕЗУЛЬТАТ'){const d=details(text);link.result=d.description;link.effect=d.эффект||'';link.action=(d.действие||'').replace(/\s*\(КОНЦОВКА\s*\d+\)\s*$/u,'');}
   else if(section==='ДЕЙСТВИЕ')link.action=text.replace(/\s*\(КОНЦОВКА\s*\d+\)\s*$/u,'');
  }else if(mode==='events'&&event){if(section==='СОБЫТИЕ')event.name=text;else if(section==='ТЕКСТ'){const d=details(text);event.text=d.description;event.effect=d.эффект||'';event.repeat=!!d.repeat;}}
  else if(mode==='endings'){if(section==='ДЕЙСТВИЕ')lastAction=text;else if(ending){if(section==='НАЗВАНИЕ')ending.name=text;else if(section==='УСЛОВИЕ')ending.condition=text;else if(section==='ТЕКСТ')ending.text=text;else if(section==='КНОПКА')ending.button=text;else if(section==='ДОПОЛНЕНИЕ'){const d=details(text);ending.addition=d.description;ending.additionCondition=d.условие||'';}}}
 }
 for(const raw of source.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n')){
  const line=raw.trim();if(/^[-=]{8,}$/u.test(line)||/^ДИАЛОГИ\s*\(/u.test(line)||/^Кот появляется в них/u.test(line))continue;
  const pair=mode==='relations'&&line.match(/^\{([^{}]+)\}\s*->\s*(?:\[([^\[\]]+)\]|(\S.*))$/u);
  if(pair){flush();buffer=[];section=null;link={id:relations.length,item:pair[1].trim(),object:(pair[2]||pair[3]).trim(),character:!pair[2],result:'',action:'',effect:'',condition:''};relations.push(link);continue;}
  if(['ЛОКАЦИЯ','ПЕРСОНАЖ','СОБЫТИЕ','ДИАЛОГ'].includes(section)&&line&&!heads.has(line)&&!buffer.some(x=>x.trim())){buffer.push(raw);continue;}
  if(heads.has(line)){flush();buffer=[];section=line;
   if(line==='ЛОКАЦИЯ'){mode='room';room={name:'',first:'',exits:{},objects:new Map(),items:new Map()};rooms.push(room);}
   else if(line==='ПЕРСОНАЖ'){mode='npc';npc={name:'',description:'',route:[],dialogues:new Map(),conditionalDialogues:[],action:'',effect:'',actionTexts:[],gender:''};characters.push(npc);}
   else if(line==='СВЯЗАННЫЕ ОБЪЕКТЫ')mode='relations';
   else if(line==='СЛУЧАЙНЫЕ СОБЫТИЯ')mode='events';
   else if(line==='СОБЫТИЕ'){mode='events';event={name:'',locations:['любая'],condition:'',text:'',effect:'',repeat:false};events.push(event);}
   else if(line==='КОНЦОВКИ')mode='endings';
   else if(line==='КОНЕЦ ИГРЫ'){mode='endings';ending={name:'',action:lastAction,condition:'',text:'',button:'Начать сначала',addition:'',additionCondition:''};endings.push(ending);}
  }else if(mode==='events'&&event&&line.startsWith('ЛОКАЦИИ:'))event.locations=line.slice(9).split(',').map(x=>x.trim());
  else if(mode==='events'&&event&&line.startsWith('УСЛОВИЕ:'))event.condition=line.slice(8).trim();
  else buffer.push(raw);
 }
 flush();if(!rooms.length)throw Error('В файле нет разделов ЛОКАЦИЯ.');
 const byName=new Map();for(const room of rooms){if(!room.name||byName.has(room.name))throw Error(`Пустое или повторное название локации: ${room.name}`);room.description||='';byName.set(room.name,room);}
 for(const room of rooms)for(const exit of Object.values(room.exits))if(!byName.has(exit.target))throw Error(`Из «${room.name}» переход ведёт в неизвестную локацию «${exit.target}».`);
 position(rooms,byName);
 const active=characters.filter(x=>x.name),names=new Set();for(const npc of active){if(names.has(npc.name))throw Error(`Повторный персонаж «${npc.name}».`);names.add(npc.name);if(!npc.route.length)throw Error(`Нет маршрута: ${npc.name}.`);for(const place of [...npc.route,...npc.dialogues.keys()])if(!byName.has(place))throw Error(`У персонажа «${npc.name}» неизвестная локация «${place}».`);}
 for(const link of relations){if(!link.result)throw Error(`Нет результата для {${link.item}} -> ${link.object}.`);if(!link.character&&!rooms.some(x=>x.objects.has(link.object)))throw Error(`Связанный объект «${link.object}» не описан.`);if(!rooms.some(x=>x.items.has(link.item)))throw Error(`Связанный предмет «${link.item}» не описан.`);}
 return {locations:rooms,byName,start:rooms[0].name,characters:active,relations,events,endings,ending:endings[0]||null};
}
root.QuestWorld={parseWorld,directions};if(typeof module!=='undefined')module.exports=root.QuestWorld;
})(typeof window!=='undefined'?window:globalThis);
