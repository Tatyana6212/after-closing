'use strict';
const $ = id => document.getElementById(id);
let world, current, visited = new Set();
let inventory = new Map(), found = new Set(), consumed = new Set(), activeObject = null;
let engine;
let worldSignature='',endingAction=null,dialoguePreview=null;
const saveKey='after-closing-save-v1';
const locationArt={
  'Читальный зал':'reading-room.webp',
  'Служебная комната':'service-room.webp',
  'Архив':'archive.webp',
  'Холл':'hall.png',
  'Детский зал':'children-hall.webp',
  'Лестница':'staircase.webp',
  'Чердак':'attic.webp',
  'Подвал':'basement.webp',
  'Кабинет директора':'director-office.webp',
  'Читальня':'secret-reading-room.webp'
};
function button(label,handler,className='text-action') {
  const node=document.createElement('button');node.type='button';node.className=className;node.textContent=label;
  node.addEventListener('click',handler);return node;
}
function significantAction(playerEvent='',move=false) {
  const events=engine.tick(current,move,visited);
  $('movement').replaceChildren();
  for(const text of [playerEvent,...events].filter(Boolean))$('movement').append(paragraph(text));
  $('movement').hidden=!$('movement').childElementCount;
  $('event').replaceChildren();$('event').hidden=true;
  if(engine.lastEvent){
    const event=engine.lastEvent,box=$('event');box.hidden=false;
    for(const npc of engine.characters)if(event.text.includes(npc.data.name)&&npc.location!==current)engine.cameoActive.add(itemKey(npc.data.name,current));
    const title=document.createElement('strong');title.textContent=event.name;box.append(title,paragraph(event.text));
    const gifted=event.effect.match(/\{([^}]+)\} добавлен в инвентарь/u);
    if(gifted){const item=world.locations.flatMap(room=>[...room.items.values()].map(data=>({room,data}))).find(x=>x.data.name===gifted[1]);if(item&&!hasItem(item.data.name)){inventory.set(itemKey(item.room.name,item.data.name),{...item.data,location:item.room.name});renderInventory();}}
  }
  renderCharacters();
  if(current)renderNearby();
}
function renderCharacters() {
  const container=$('characters');container.replaceChildren();
  if(engine.finished){container.hidden=true;return;}
  for(const npc of engine.characters.filter(npc=>npc.location===current)) {
    addCharacterButton(container,npc);
  }
  for(const npc of engine.characters.filter(npc=>!npc.data.route.includes(current)&&npc.data.dialogues.has(current))){
    const key=itemKey(npc.data.name,current);
    if(!engine.cameoActive.has(key)){
      if(engine.cameos.has(key))continue;
      engine.cameos.add(key);engine.cameoActive.add(key);
    }
    addCharacterButton(container,npc,true);
  }
  container.hidden=!container.childElementCount;
}
function addCharacterButton(container,npc,cameo=false){
  const trigger=button(`Поговорить: ${npc.data.name}`,()=>describeCharacter(npc,cameo),'character-button');container.append(trigger);
}
function clearDialogue() {engine.dialogue=null;dialoguePreview=null;$('dialogue').replaceChildren();$('dialogue').hidden=true;}
function describeCharacter(npc,cameo=false) {
  if(engine.finished || (!cameo&&npc.location!==current))return;
  clearDialogue();const area=$('dialogue');area.hidden=false;
  dialoguePreview={name:npc.data.name,cameo};
  const title=document.createElement('h2');title.textContent=npc.data.name;
  area.append(title,paragraph(npc.data.description));
  const lines=npc.data.dialogues.get(current);
  const conditional=npc.data.conditionalDialogues.find(d=>engine.check(d.condition,current,visited));
  const chosen=conditional?.lines||lines;
  const enriched=chosen&&engine.dialogueNotes.has(current)?[...chosen,engine.dialogueNotes.get(current)]:chosen;
  if(enriched?.length)area.append(button('Начать диалог',()=>startDialogue(npc,enriched,conditional?.effect||'',cameo)));
  else area.append(paragraph('Здесь персонажу пока нечего сказать.','dialogue-note'));
  if(npc.data.action&&!cameo&&engine.flag('доверие_кота')<3)area.append(button(npc.data.action,()=>{
    if(npc.location!==current||engine.finished)return;
    engine.effect(npc.data.effect);const count=engine.flag('доверие_кота');
    area.append(paragraph(npc.data.actionTexts[count-1]||npc.data.action));significantAction();
    if(count>=3)area.querySelectorAll('button').forEach(node=>{if(node.textContent===npc.data.action)node.remove();});
  }));
  for(const link of world.relations.filter(link=>link.character&&link.object===npc.data.name&&hasItem(link.item)&&!engine.completed.has(JSON.stringify([current,link.id])))){
    area.append(button(`Отдать: ${link.item}`,()=>{
      if(npc.location!==current||engine.finished)return;
      engine.completed.set(JSON.stringify([current,link.id]),{location:current,link});engine.flags.set('мышь_отдана',1);
      consumeItem(link.item);renderInventory();
      area.replaceChildren(paragraph(link.result));significantAction();
    }));
  }
}
function startDialogue(npc,lines,effect='',cameo=false) {
  if(engine.finished || (!cameo&&npc.location!==current))return;
  dialoguePreview=null;
  engine.dialogue={npc,lines,index:0,location:current,effect};
  const area=$('dialogue');area.replaceChildren();area.hidden=false;
  const title=document.createElement('h2');title.textContent=`Разговор · ${npc.data.name}`;area.append(title);
  const transcript=document.createElement('div');transcript.id='transcript';area.append(transcript);
  nextLine();
}
function nextLine() {
  const talk=engine.dialogue;if(!talk || talk.location!==current || engine.finished || talk.index>=talk.lines.length)return;
  $('dialogue').querySelector('.dialogue-next')?.remove();
  const line=talk.lines[talk.index++], split=line.indexOf(':');
  const row=document.createElement('p');row.className='dialogue-line';
  if(split>=0){const speaker=document.createElement('strong');speaker.textContent=line.slice(0,split)+': ';row.append(speaker,document.createTextNode(line.slice(split+1).trim()));}
  else row.textContent=line;
  $('transcript').append(row);
  if(talk.index<talk.lines.length)$('dialogue').append(button('Далее',nextLine,'text-action dialogue-next'));
  else {engine.effect(talk.effect);significantAction();}
}
const itemKey = (location,name) => JSON.stringify([location,name]);
const hasItem=name=>[...inventory.values()].some(item=>item.name===name);
function consumeItem(name){
  const key=[...inventory.keys()].find(key=>inventory.get(key).name===name);
  if(key){inventory.delete(key);consumed.add(key);}
}
function resolveName(entries,name){
  if(entries.has(name))return name;
  const words=name.toLowerCase().split(/\s+/u);
  const matches=[...entries.keys()].filter(candidate=>{
    const parts=candidate.toLowerCase().split(/\s+/u);
    return parts.length===words.length&&parts.every((part,i)=>part.slice(0,Math.min(4,part.length))===words[i].slice(0,Math.min(4,words[i].length)));
  });
  return matches.length===1?matches[0]:name;
}
function interactiveText(text, room, allowItems = false) {
  const fragment = document.createDocumentFragment();
  const pattern = /\[([^\[\]\n]+)\]|\{([^{}\n]+)\}/gu;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(offset,match.index)));
    offset = match.index + match[0].length;
    const displayName = (match[1] || match[2]).trim();
    const isObject = match[1] !== undefined;
    const name=resolveName(isObject?room.objects:room.items,displayName);
    const entry = (isObject ? room.objects : room.items).get(name);
    if (!entry || (!isObject && !allowItems)) { fragment.append(document.createTextNode(match[0])); continue; }
    const key = itemKey(room.name,name);
    if (!isObject) found.add(key);
    if (!isObject && (inventory.has(key)||hasItem(name)||consumed.has(key))) {
      const taken = document.createElement('span'); taken.className='taken-item';
      taken.textContent=`${name} (${consumed.has(key)?'найдено раньше':'взято'})`; fragment.append(taken); continue;
    }
    const button = document.createElement('button'); button.type='button';
    button.className=`text-action ${isObject?'object-action':'item-action'}`;
    button.textContent=isObject?displayName:`＋ ${displayName}`;
    button.setAttribute('aria-label',`${isObject?'Осмотреть':'Взять'}: ${displayName}`);
    button.addEventListener('click',()=>{
      if (current !== room.name || engine.finished) return;
      if (isObject) { clearDialogue(); activeObject=name; showObject(room,name); significantAction(); }
      else takeItem(room,name);
    });
    fragment.append(button);
  }
  fragment.append(document.createTextNode(text.slice(offset)));
  return fragment;
}
function showObject(room,name, takenItem = null) {
  const entry=room.objects.get(name); if(!entry) return;
  const message=$('message'); message.hidden=false; message.replaceChildren();
  const title=document.createElement('strong'); title.textContent=name;
  const completed=[...engine.completed.values()].filter(record=>record.location===room.name && record.link.object===name);
  const latest=completed.at(-1);
  let objectText=latest?latest.link.result:entry.description;
  if(latest&&(!engine.check('не свет_включён и не фонарик_получен',room.name,visited)||hasItem('фонарик')))objectText=objectText.replace(/Если свет не включён и фонарик не взят,[^.]*\./u,'').trim();
  const body=document.createElement('p'); body.append(interactiveText(objectText,room,true));
  message.append(title,body);
  if(engine.objectNotes.has(name))message.append(paragraph(engine.objectNotes.get(name)));
  for(const addition of entry.after||[])if(engine.flag(addition.flag))message.append(paragraph(addition.text));
  const actionFlag=entry.эффект?.match(/^([а-яё_]+)/iu)?.[1];
  const actionAlreadyDone=!!actionFlag&&engine.flag(actionFlag)>0;
  if(entry.действие&&!actionAlreadyDone)message.append(button(entry.действие,()=>{
    if(engine.finished||current!==room.name||(actionFlag&&engine.flag(actionFlag)>0))return;
    if(entry.эффект){engine.effect(entry.эффект);significantAction();showObject(room,name);}
    else if(engine.canFinish(entry.действие))finishGame(entry.действие);
  },'story-action'));
  else if(actionAlreadyDone&&entry.эффект){const result=entry.эффект.replace(/^[^.]*\.\s*/u,'').trim();if(result)message.append(paragraph(result));}
  // Other successful links must not hide an item that was found but not yet taken.
  if(latest) {
    const visibleItems=new Set([...objectText.matchAll(/\{([^{}\n]+)\}/gu)].map(match=>match[1].trim()));
    const remaining=new Set();
    for(const text of [entry.description,...completed.map(record=>record.link.result)]) {
      for(const match of text.matchAll(/\{([^{}\n]+)\}/gu)) {
        const item=match[1].trim();
        if(room.items.has(item) && !visibleItems.has(item) && !inventory.has(itemKey(room.name,item))&&!consumed.has(itemKey(room.name,item))&&!(item==='фонарик'&&(!engine.check('не свет_включён и не фонарик_получен',room.name,visited)||hasItem('фонарик'))))remaining.add(item);
      }
    }
    if(remaining.size){const extra=document.createElement('p');extra.append(document.createTextNode('Также найдено: '),interactiveText([...remaining].map(name=>`{${name}}`).join(', '),room,true));message.append(extra);}
  }
  for(const record of completed)if(record.link.action)appendAction(message,record.link,room);
  for(const link of world.relations.filter(link=>link.object===name)) {
    const key=JSON.stringify([room.name,link.id]);
    if(engine.completed.has(key))continue;
    if(hasItem(link.item))message.append(button(`Применить: ${link.item}`,()=>applyItem(room,name,link)));
  }
  if (takenItem) {
    const receipt=paragraph(`В инвентарь добавлено: ${takenItem.name}.\n${takenItem.description}`,'item-receipt');
    message.append(receipt);
  }
}
function takeItem(room,name) {
  const key=itemKey(room.name,name), item=room.items.get(name);
  if (engine.finished || !item || !found.has(key) || inventory.has(key) || consumed.has(key) || hasItem(name)) return;
  inventory.set(key,{...item,location:room.name}); renderInventory();
  engine.flags.set(`${name}_получен`,1);
  engine.effect(item.эффект);
  showObject(room,activeObject,item);
  significantAction();
}
function applyItem(room,name,link) {
  const key=JSON.stringify([room.name,link.id]);
  if(engine.finished || current!==room.name || !room.objects.has(name) || engine.completed.has(key) || !hasItem(link.item)||!engine.check(link.condition,room.name,visited))return;
  clearDialogue();activeObject=name;engine.completed.set(key,{location:room.name,link});
  engine.effect(link.effect);
  if(/_возвращён/u.test(link.effect)){consumeItem(link.item);renderInventory();}
  showObject(room,name);renderMap();significantAction();
}
function appendAction(container,link,room) {
  container.append(button(link.action,()=>{
    if(engine.finished || current!==room.name || !engine.completed.has(JSON.stringify([room.name,link.id])))return;
    if(engine.canFinish(link.action))finishGame(link.action);
    else $('status').textContent='Для этого действия не найдено соответствующее условие завершения в TXT.';
  },'story-action'));
}
function finishGame(action) {
  const ending=engine.endingFor(action);if(!ending)return;
  endingAction=action;
  engine.finished=true;engine.dialogue=null;
  $('story').replaceChildren(paragraph(ending.text));
  if(ending.addition&&engine.check(ending.additionCondition,current,visited))$('story').append(paragraph(ending.addition));
  $('location-title').textContent=ending.name||'Конец истории';
  $('location-illustration').hidden=true;
  for(const id of ['message','dialogue','characters','movement','event','inventory']){$(id).hidden=true;}
  document.querySelector('.map-section').hidden=true;
  $('story').append(button(ending.button||'Начать сначала',restartGame,'story-action'));
  $('status').textContent='';$('location-title').tabIndex=-1;$('location-title').focus({preventScroll:true});
}
function restartGame() {
  if(!world)return;
  visited=new Set();inventory=new Map();found=new Set();consumed=new Set();activeObject=null;current=null;endingAction=null;dialoguePreview=null;engine.reset();
  document.querySelector('.map-section').hidden=false;$('status').textContent='';enter(world.start,true);
  saveGame();
}
function renderInventory() {
  $('inventory').hidden=inventory.size===0; $('inventory-items').replaceChildren();
  for(const item of inventory.values()) {
    const li=document.createElement('li');
    const detail=document.createElement('details'), summary=document.createElement('summary');
    summary.textContent=item.name; detail.append(summary,paragraph(item.description));
    li.append(detail); $('inventory-items').append(li);
  }
}
const cell = {x:166,y:110}, padding = 60;
function paragraph(text, className) {
  const p = document.createElement('p'); p.textContent = text;
  if (className) p.className = className;
  return p;
}
function enter(name, focus = false, restoring = false) {
  if(engine.finished)return;
  const previous=current;
  const direction=focus && previous ? Object.entries(world.byName.get(previous).exits).find(([,exit])=>exit.target===name)?.[0]:null;
  if(direction&&!engine.exit(previous,direction,visited)){
    const condition=world.byName.get(previous).exits[direction].condition;
    const fallback=condition.match(/иначе\s*[—-]\s*[«"]([^»"]+)/u)?.[1]||'Путь пока закрыт.';
    $('event').replaceChildren(paragraph(fallback));$('event').hidden=false;return;
  }
  if(focus && previous && !direction && name!==world.start)return;
  const room = world.byName.get(name), first = !visited.has(name);
  if(previous!==name&&!restoring)engine.cameoActive.clear();
  current = name; visited.add(name);
  window.QuestAudio?.setLocation(name);
  activeObject=null; $('message').replaceChildren(); $('message').hidden=true;
  clearDialogue();$('movement').replaceChildren();$('movement').hidden=true;$('event').replaceChildren();$('event').hidden=true;
  $('location-title').textContent = name; $('story').replaceChildren();
  const art=locationArt[name];
  $('location-illustration').hidden=!art;
  if(art){const image=$('location-art'),src=`assets/${art}`;if(image.getAttribute('src')!==src)image.setAttribute('src',src);image.alt=`Иллюстрация: ${name}`;}
  if (first && room.first) $('story').append(paragraph(room.first,'first-entry'));
  if (room.description) { const p=document.createElement('p'); p.append(interactiveText(room.description,room)); $('story').append(p); }
  if(engine.roomNotes.has(name))$('story').append(paragraph(engine.roomNotes.get(name)));
  renderInventory();
  $('progress').textContent = `Исследовано: ${visited.size} / ${world.locations.length}`;
  renderMap();
  renderCharacters();
  if(direction)significantAction(`Вы вошли в «${name}».`,true);
  if (focus) { $('location-title').tabIndex = -1; $('location-title').focus({preventScroll:true}); }
}
function centerCurrent() {
  const room = $('map-canvas').querySelector('.current'); if (!room) return;
  $('map').scrollLeft = room.offsetLeft + room.offsetWidth/2 - $('map').clientWidth/2;
  $('map').scrollTop = room.offsetTop + room.offsetHeight/2 - $('map').clientHeight/2;
}
function renderMap() {
  const available = new Map();
  for (const [direction,exit] of Object.entries(world.byName.get(current).exits)) available.set(exit.target,direction);
  const visible = new Set([...visited,...available.keys()]);
  const rooms = [...visible].map(name => world.byName.get(name));
  const allX=world.locations.map(room=>room.position.x), floorGap=Math.max(...allX)-Math.min(...allX)+3;
  const projected=room=>({x:room.position.x+room.position.z*floorGap,y:room.position.y});
  const bounds = rooms.reduce((b,room)=>({minX:Math.min(b.minX,projected(room).x),minY:Math.min(b.minY,projected(room).y),maxX:Math.max(b.maxX,projected(room).x),maxY:Math.max(b.maxY,projected(room).y)}),{minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity});
  const {minX,minY} = bounds;
  const width = (bounds.maxX-minX)*cell.x+132+padding*2;
  const height = (bounds.maxY-minY)*cell.y+70+padding*2;
  const canvas = $('map-canvas'); canvas.replaceChildren();
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
  const positions = new Map(rooms.map(room => [room.name, {x:(projected(room).x-minX)*cell.x+padding,y:(projected(room).y-minY)*cell.y+padding}]));
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('connections'); svg.setAttribute('width',width); svg.setAttribute('height',height); svg.setAttribute('aria-hidden','true');
  const drawn = new Set();
  for (const room of rooms) {
    // Only disclose connections from rooms that have been visited.
    if (!visited.has(room.name)) continue;
    for (const {target:name} of Object.values(room.exits)) {
      if (!visible.has(name)) continue;
      const key = JSON.stringify([room.name,name].sort()); if (drawn.has(key)) continue; drawn.add(key);
      const a=positions.get(room.name), b=positions.get(name);
      const line=document.createElementNS(svg.namespaceURI,'line');
      for (const [attribute,value] of Object.entries({x1:a.x+66,y1:a.y+35,x2:b.x+66,y2:b.y+35})) line.setAttribute(attribute,value);
      svg.append(line);
    }
  }
  canvas.append(svg);
  for (const room of rooms) {
    const isCurrent = room.name===current, canMove = !isCurrent && available.has(room.name);
    const node = document.createElement(canMove?'button':'div');
    node.className = `room${isCurrent?' current':canMove?' available':''}`;
    const pos = positions.get(room.name); node.style.left=`${pos.x}px`; node.style.top=`${pos.y}px`;
    node.textContent = room.name;
    const note=document.createElement('small');
    note.textContent=isCurrent?'● Вы здесь':canMove?'Нажмите, чтобы войти':'Посещено'; node.append(note);
    if (isCurrent) node.setAttribute('aria-current','location');
    if (canMove) {
      node.type='button';
      node.dataset.direction=available.get(room.name);
      node.setAttribute('aria-label',`Перейти в «${room.name}»`);
      node.addEventListener('click',()=>enter(room.name,true));
    }
    canvas.append(node);
  }
  renderNearby();
  requestAnimationFrame(centerCurrent);
}
function renderNearby(){
  const nearby=$('nearby-links');nearby.replaceChildren();
  for(const [direction,exit] of Object.entries(world.byName.get(current).exits)){
    const open=!!engine.exit(current,direction,visited);
    const next=button(`${open?'':'🔒 '}${exit.target}${open?'':' · пока закрыто'}`,()=>enter(exit.target,true),'nearby-button');
    if(!open)next.classList.add('locked');
    nearby.append(next);
  }
}
function signature(text){let hash=2166136261;for(const character of text)hash=Math.imul(hash^character.codePointAt(0),16777619)>>>0;return `${text.length}:${hash}`;}
function readSave(){
  try{const saved=JSON.parse(localStorage.getItem(saveKey));return saved?.version===1&&saved.world===worldSignature&&world.byName.has(saved.current)&&Array.isArray(saved.visited)&&saved.visited.includes(saved.current)&&saved.engine?saved:null;}
  catch{return null;}
}
function saveGame(){
  if(!world||!current||$('game-shell').hidden)return;
  const state={version:1,world:worldSignature,current,visited:[...visited],inventory:[...inventory.keys()],found:[...found],consumed:[...consumed],activeObject,
    endingAction,dialoguePreview,engine:engine.exportState(),
    ui:{movement:[...$('movement').querySelectorAll('p')].map(node=>node.textContent),eventTitle:$('event').querySelector('strong')?.textContent||'',eventText:$('event').querySelector('p')?.textContent||'',status:$('status').textContent}};
  try{localStorage.setItem(saveKey,JSON.stringify(state));}
  catch{$('status').textContent='Браузер не разрешил сохранить игру. Проверьте настройки хранилища.';}
}
function showGame(){
  $('start-screen').hidden=true;$('game-shell').hidden=false;
}
function showStart(){
  $('game-shell').hidden=true;$('start-screen').hidden=false;
  $('start-game').disabled=false;
  const saved=readSave();$('continue-game').hidden=!saved;
  $('start-note').textContent=saved?'Есть сохранённая игра. Можно продолжить с прежнего места или начать заново.':'Игра сохраняется автоматически в этом браузере.';
}
function restoreDialogue(talk){
  if(!talk||talk.location!==current)return;
  engine.dialogue=talk;
  const area=$('dialogue');area.replaceChildren();area.hidden=false;
  const title=document.createElement('h2');title.textContent=`Разговор · ${talk.npc.data.name}`;area.append(title);
  const transcript=document.createElement('div');transcript.id='transcript';area.append(transcript);
  for(const line of talk.lines.slice(0,talk.index)){
    const split=line.indexOf(':'),row=document.createElement('p');row.className='dialogue-line';
    if(split>=0){const speaker=document.createElement('strong');speaker.textContent=line.slice(0,split)+': ';row.append(speaker,document.createTextNode(line.slice(split+1).trim()));}
    else row.textContent=line;
    transcript.append(row);
  }
  if(talk.index<talk.lines.length)area.append(button('Далее',nextLine,'text-action dialogue-next'));
}
function restoreGame(saved){
  try{
    engine.restoreState(saved.engine);
    visited=new Set(saved.visited.filter(name=>world.byName.has(name)));
    inventory=new Map();
    for(const key of saved.inventory||[]){const [location,name]=JSON.parse(key),item=world.byName.get(location)?.items.get(name);if(item)inventory.set(key,{...item,location});}
    found=new Set(Array.isArray(saved.found)?saved.found:[]);
    consumed=new Set(Array.isArray(saved.consumed)?saved.consumed:[]);
    // Saves created before consumed items were tracked still contain completed uses.
    for(const record of engine.completed.values()){
      if(!record.link.character&&!/_возвращён/u.test(record.link.effect))continue;
      for(const key of found){const [location,name]=JSON.parse(key);if(name===record.link.item&&!inventory.has(key))consumed.add(key);}
    }
    const savedDialogue=engine.dialogue,savedPreview=saved.dialoguePreview;
    const wasFinished=engine.finished;engine.finished=false;current=null;showGame();enter(saved.current,false,true);
    engine.dialogue=savedDialogue;
    if(saved.activeObject&&world.byName.get(current).objects.has(saved.activeObject)){activeObject=saved.activeObject;showObject(world.byName.get(current),activeObject);}
    if(savedDialogue)restoreDialogue(savedDialogue);
    else if(savedPreview){const npc=engine.characters.find(x=>x.data.name===savedPreview.name);if(npc)describeCharacter(npc,!!savedPreview.cameo);}
    for(const line of saved.ui?.movement||[])$('movement').append(paragraph(line));
    $('movement').hidden=!$('movement').childElementCount;
    if(saved.ui?.eventTitle){const heading=document.createElement('strong');heading.textContent=saved.ui.eventTitle;$('event').append(heading,paragraph(saved.ui.eventText||''));$('event').hidden=false;}
    $('status').textContent=saved.ui?.status||'';
    if(wasFinished&&saved.endingAction)finishGame(saved.endingAction);
    return true;
  }catch(error){console.warn('Не удалось восстановить сохранение:',error);return false;}
}
function loadWorld(text) {
  const next=QuestWorld.parseWorld(text);
  world=next;worldSignature=signature(text);engine=new QuestEngine(world);current=null;
  visited=new Set();inventory=new Map();found=new Set();consumed=new Set();activeObject=null;endingAction=null;dialoguePreview=null;
  $('load-help').hidden=true;$('status').textContent='';showStart();
}
$('center').addEventListener('click',centerCurrent);
$('choose-world').addEventListener('click',()=>$('file').click());
$('start-game').addEventListener('click',()=>{if(!world)return;showGame();restartGame();});
$('continue-game').addEventListener('click',()=>{const saved=readSave();if(saved&&!restoreGame(saved)){$('start-note').textContent='Не удалось восстановить сохранение. Начните новую игру.';$('continue-game').hidden=true;$('game-shell').hidden=true;$('start-screen').hidden=false;}});
$('restart').addEventListener('click',restartGame);
$('file').addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file) return;
  try {loadWorld(await file.text());} catch(error){$('status').textContent=error.message;}
  event.target.value='';
});
new ResizeObserver(centerCurrent).observe($('map'));
document.addEventListener('click',()=>queueMicrotask(saveGame));
window.addEventListener('pagehide',saveGame);
(async()=>{
  try {
    const response=await fetch(new URL('./world.txt',document.baseURI),{cache:'no-cache'});
    if(!response.ok) throw new Error(`Не удалось загрузить world.txt (HTTP ${response.status}).`);
    loadWorld(await response.text());
  } catch(error) {
    if(world)return;
    $('load-help').hidden=false;
    $('start-game').disabled=true;
    $('start-note').textContent=location.protocol==='file:'?'При открытии с диска выберите TXT вручную. На GitHub Pages мир загружается автоматически.':`Не удалось загрузить world.txt: ${error.message}`;
  }
})();
